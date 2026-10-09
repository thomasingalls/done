/** Browser/session composition for the retained additional-device coordinator. */
import { parseAuthorityPin } from '../../account-protocol/authority';
import type { SuccessorBase } from '../../account-protocol/successor';
import type { GrantScope } from '../../account-protocol/scopedGrant';
import { enrollmentOptions } from '../../account-protocol/enrollment';
import { MEMBERSHIP_BOOTSTRAP_LIMIT } from '../../account-protocol/membershipLocator';
import { HISTORY_PAGE_LIMIT } from '../../account-protocol/historyExchange';
import { READ_PAGE_LIMIT } from '../../account-protocol/deliveryTransport';
import { withMembershipVault, type MembershipVault } from './membershipVault';
import { advanceMembershipConnection, type MembershipConnection } from './membershipConnection';
import { membershipInvitationUrl } from './membershipInvitation';
import { bootstrapFetch, legacyAccess } from './bootstrapHttp';
import { privateDeliveryPost } from './privateDeliveryHttp';
import { NetworkLogin, prewarmSlotLogin, postSession } from './networkLogin';
import {
  ScopedTransport,
  NetworkSignInRequired,
  NetworkAuthorityChanged,
  NetworkThrottled,
} from './scopedTransport';
import { hasJoinedAccount } from '../crdt/joinedAccount';
import { openOwnedSyncingAccountWorkspace } from '../crdt/accountReceive';
import { assertSlotPasskey } from './assertSlotPasskey';
import { enrollmentMessages, type EnrollmentView } from './deviceEnrollment';
import type { SetupConfig } from './setupProgress';

/** Stream bounds apply before parsing a potentially large signed membership/checkpoint response. */
async function responseJson(
  response: Response,
  signal: AbortSignal,
  cancellation = false,
  limit = MEMBERSHIP_BOOTSTRAP_LIMIT,
) {
  if (
    (!response.ok && !cancellation) ||
    !response.body ||
    response.headers.get('content-type') !== 'application/json'
  ) {
    await response.body?.cancel();
    throw Error('The service could not complete this step. Retry the saved connection.');
  }
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    await response.body.cancel();
    throw Error('Account response is too large');
  }
  const reader = response.body.getReader(),
    decoder = new TextDecoder('utf-8', { fatal: true });
  let length = 0,
    text = '';
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      length += value.length;
      if (length > limit) throw Error('Account response is too large');
      text += decoder.decode(value, { stream: true });
    }
    if (declared !== null && Number(declared) !== length)
      throw Error('Incomplete account response');
    const result = JSON.parse(text + decoder.decode());
    if (result?.ok === false && !cancellation)
      throw Error('The service refused this step. Your progress is saved.');
    return result as unknown;
  } finally {
    signal.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createMembershipEnrollment(
  config: SetupConfig,
  slotId: string,
  code: string,
  role: 'existing' | 'new',
  workspaceId?: string,
  invitation?: unknown,
  networkLogin?: NetworkLogin,
  begin?: string,
) {
  if (!config.networkSessions) throw Error('Additional devices require account sessions');
  const pin = parseAuthorityPin(config.pin),
    lifetime = new AbortController();
  if (pin.origin !== location.origin) throw Error('Account service differs from this page');
  const ownerKind =
    role === 'existing' && /^enrollment-[a-f0-9]{32}$/.test(slotId) ? 'joined' : 'promotion';
  const ceremonyLogin = new NetworkLogin(pin, slotId),
    grants = new ScopedTransport(pin, lifetime.signal);
  if (role === 'new' && (!networkLogin || networkLogin.retired)) {
    networkLogin = new NetworkLogin(pin, slotId);
    void prewarmSlotLogin(networkLogin, slotId, lifetime.signal);
  }
  type Binding = { scope: GrantScope; identity: { accountId: string; credentialId: string } };
  let notificationBinding: Binding | undefined,
    opened: Awaited<ReturnType<typeof openOwnedSyncingAccountWorkspace>> | undefined,
    operation: Promise<EnrollmentView> | undefined,
    last: EnrollmentView = { kind: 'locked', message: enrollmentMessages.locked, canCancel: false };
  const editors = new Set<() => void>(),
    guard = () => lifetime.signal.throwIfAborted();
  const view = (kind: EnrollmentView['kind'], extra: Partial<EnrollmentView> = {}) =>
    (last = { kind, message: enrollmentMessages[kind], canCancel: false, ...extra });
  const identity = (base: SuccessorBase) => ({
    accountId: base.receipt.offer.epoch.accountId,
    credentialId: base.receipt.activation.context.credentialId,
  });
  const scope = (owner: MembershipVault, base: SuccessorBase, attemptId?: string): GrantScope =>
    attemptId
      ? {
          kind: 'enrollment',
          workspaceId: base.request.candidate.workspaceId,
          credentialId: owner.participant.id,
          attemptId,
        }
      : {
          kind: 'workspace',
          workspaceId: base.request.candidate.workspaceId,
          credentialId: owner.participant.id,
        };
  const access = (owner: MembershipVault, base: SuccessorBase, attemptId?: string) => {
    notificationBinding = { scope: scope(owner, base, attemptId), identity: identity(base) };
    return grants.bind({
      login: ceremonyLogin,
      scope: notificationBinding.scope,
      sign: owner.sign,
    });
  };
  const runOperation = (input: Parameters<typeof advanceMembershipConnection>[3] = {}) =>
    withMembershipVault(ownerKind, slotId, code, lifetime.signal, async (owner) => {
      const result = await advanceMembershipConnection(
        owner,
        role,
        {
          pin,
          signal: lifetime.signal,
          request: async (path, body, base) => {
            guard();
            const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(10000)]);
            const init: RequestInit = {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
              signal,
            };
            if (path.startsWith('/__account-setup/')) {
              const route = path.slice('/__account-setup/'.length);
              if (
                !['membership/bootstrap', 'enrollment/begin', 'enrollment/finish'].includes(route)
              )
                throw Error('Unsupported connection bootstrap');
              return responseJson(await bootstrapFetch(config, route, init), signal);
            }
            if (!base) throw Error('Account identity is missing');
            const b = body as { attemptId?: string; preparationId?: string };
            let attemptId;
            if (path === '/account/membership/v2/admit') attemptId = b.attemptId;
            else if (
              [
                '/account/membership/v2/ceremony',
                '/account/membership/v2/transfer',
                '/account/membership/v3/checkpoint',
                '/account/membership/v2/cancel',
              ].includes(path)
            )
              attemptId = b.preparationId;
            else if (
              path !== '/account/membership/v2/checkpoint' &&
              path !== '/account/history/v1/checkpoint'
            )
              throw Error('Unsupported connection route');
            if (
              path !== '/account/membership/v2/checkpoint' &&
              path !== '/account/history/v1/checkpoint' &&
              !attemptId
            )
              throw Error('Connection attempt is missing');
            const scoped = access(owner, base, attemptId);
            return owner.withLogin(ceremonyLogin, identity(base), async () =>
              responseJson(
                await scoped.fetch(path, init),
                signal,
                path === '/account/membership/v2/cancel' ||
                  path === '/account/membership/v3/checkpoint',
                path === '/account/history/v1/checkpoint'
                  ? HISTORY_PAGE_LIMIT + 64
                  : MEMBERSHIP_BOOTSTRAP_LIMIT,
              ),
            );
          },
          read: async (bytes, base) => {
            const scoped = access(owner, base);
            const page = await owner.withLogin(ceremonyLogin, identity(base), () =>
              privateDeliveryPost(
                pin,
                scoped,
                'read-v2',
                bytes,
                READ_PAGE_LIMIT,
                lifetime.signal,
                undefined,
                true,
              ),
            );
            guard();
            if (!page) throw Error('Writing could not be fetched. Retry the saved load.');
            return page;
          },
          assert: async (context) => {
            const credential = (await navigator.credentials.get({
              publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(
                await enrollmentOptions(context),
              ),
              signal: lifetime.signal,
            })) as PublicKeyCredential | null;
            guard();
            if (!credential) throw Error('Passkey request cancelled');
            return credential.toJSON();
          },
          acknowledge: (login) =>
            postSession(
              'acknowledge',
              {
                sessionId: login.sessionId,
                renewalToken: login.renewalToken,
              },
              lifetime.signal,
            ),
          reconnect: (base) =>
            owner.withLogin(ceremonyLogin, identity(base), async () => {
              await ceremonyLogin.connect();
            }),
        },
        {
          ...input,
          ...(begin ? { begin } : {}),
          ...(workspaceId ? { workspaceId } : {}),
          ...(invitation ? { invitation } : {}),
        },
      );
      guard();
      if (result.kind === 'invite') {
        const saved = (await owner.load()) as MembershipConnection;
        if (!saved.base) throw Error('Invitation account is missing');
        access(owner, saved.base);
        return view('invite', {
          link: membershipInvitationUrl(location.origin, result.invitation),
        });
      }
      if (result.kind === 'loading')
        return view('certified', {
          message:
            'Waiting for the remaining writing. Open writing again to resume the saved load.',
        });
      if (result.kind === 'installed')
        return view('certified', { message: 'Opening your writing…' });
      if (result.kind === 'comparison-cancelled')
        return view('restart-required', {
          message: 'This comparison was stopped. The pending device has not been removed.',
          canCancel: result.canCancel === true,
        });
      if (result.kind === 'cancelled')
        return view('cancelled', {
          message: 'The connection was cancelled. Existing devices and writing are retained.',
        });
      if (result.kind === 'certified' && role === 'existing')
        return view('certified', {
          canOpenWriting: false,
          message:
            'The device is connected. It can open your writing there. You can return to your account.',
        });
      return view(result.kind, {
        ...(result.code ? { code: result.code } : {}),
        canCancel: result.canCancel === true,
      });
    });
  const openEditor = async () => {
    if (role !== 'new') return null;
    if (opened) return last;
    const joined = await hasJoinedAccount(slotId, code, lifetime.signal);
    if (!joined) return null;
    if (workspaceId !== joined.workspaceId)
      throw Error('Saved workspace differs from this connection');
    opened = await openOwnedSyncingAccountWorkspace(
      {
        slotId,
        code,
        pin,
        signal: lifetime.signal,
        membershipContinuation: true,
        assertPasskey: assertSlotPasskey(lifetime.signal),
        ...(networkLogin ? { networkLogin } : {}),
        identity: {
          id: joined.principalId,
          actor: { kind: 'human', name: 'You', color: '#e0662f' },
          device: { id: 'joined:' + slotId, name: 'This device' },
        },
      },
      legacyAccess(config),
      true,
    );
    guard();
    notificationBinding = undefined;
    code = '';
    return view('editing', {
      editor: {
        workspace: opened.workspace,
        devices: opened.devices,
        actorId: joined.principalId,
        accountId: opened.accountId,
        ...(networkLogin ? { networkLogin } : {}),
      },
    });
  };
  const operate = (input?: Parameters<typeof runOperation>[0], open = false) => {
    guard();
    if (operation) return operation;
    operation = (async () => {
      if (open) {
        const editor = await openEditor();
        if (editor) return editor;
      }
      try {
        return await runOperation(input);
      } catch (cause) {
        if (cause instanceof NetworkSignInRequired) return view('reconnect');
        if (cause instanceof NetworkThrottled) return view('waiting', { message: cause.message });
        if (!(cause instanceof NetworkAuthorityChanged)) throw cause;
        try {
          return await runOperation(input);
        } catch (next) {
          if (next instanceof NetworkSignInRequired) return view('reconnect');
          if (next instanceof NetworkThrottled) return view('waiting', { message: next.message });
          if (next instanceof NetworkAuthorityChanged)
            return view('waiting', {
              message: 'Account membership changed. Checking the saved connection…',
            });
          throw next;
        }
      }
    })().finally(() => {
      operation = undefined;
    });
    return operation;
  };
  return {
    refresh: () => operate(undefined, true),
    enroll: () => operate({ enroll: true }),
    reconnect: () => operate({ reconnect: true }),
    compare: (typed: string) => operate({ typed }),
    cancel: () => operate({ cancel: true }),
    openWriting: async () => {
      const result = await operate({ read: true });
      return (await openEditor()) ?? result;
    },
    openNotifications: (signal: AbortSignal) => {
      const binding = notificationBinding;
      if (!binding || !code || opened) throw Error('Notification scope is not ready');
      return withMembershipVault(
        ownerKind,
        slotId,
        code,
        AbortSignal.any([signal, lifetime.signal]),
        (owner) => {
          if (owner.participant.id !== binding.scope.credentialId)
            throw Error('Notification participant changed');
          return owner.withLogin(ceremonyLogin, binding.identity, () =>
            grants
              .bind({ login: ceremonyLogin, scope: binding.scope, sign: owner.sign })
              .openNotifications(signal),
          );
        },
      );
    },
    registerEditor(destroy: () => void) {
      guard();
      editors.add(destroy);
      return () => {
        editors.delete(destroy);
      };
    },
    close: async () => {
      lifetime.abort();
      networkLogin?.close();
      ceremonyLogin.close();
      grants.close();
      notificationBinding = undefined;
      await operation?.catch(() => {});
      for (const destroy of editors) {
        try {
          destroy();
        } catch {
          /* Finish closing custody. */
        }
      }
      editors.clear();
      await opened?.workspace.close();
      opened = undefined;
      code = '';
      last = { kind: 'locked', message: enrollmentMessages.locked, canCancel: false };
    },
    get busy() {
      return !!operation;
    },
  };
}
