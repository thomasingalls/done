import { defaultDeviceName } from '../lib/browser';
import { RemovalPending } from './accountTransitionNotice';
import { bootstrapFetch, legacyAccess } from './bootstrapHttp';
import { NetworkLogin, prewarmSlotLogin } from './networkLogin';
import { isPrivateAccess, PrivateServiceUnavailable } from './privateAccess';
/** Private first-device UI coordinator. Retained UI progress is a hint; existing owners grant authority. */
import { parseAuthorityPin, pinBytes } from '../../account-protocol/authority';
import { type RecoveryContext } from '../../account-protocol/recovery';
import {
  beginLocalGenesis,
  inspectLocalStartup,
  resumeLocalGenesis,
  openLocalWorkspace,
  listLocalWorkspaces,
  type LocalGenesisEnrollment,
} from '../crdt/localGenesis';
import { inspectLocalPromotion, promotionLineage } from '../crdt/promotionPreparation';
import { prepareLocalPromotion } from '../crdt/promotionOwner';
import { preparePromotionGenesis } from '../crdt/promotionGenesis';
import { admitLocalPromotion } from '../crdt/promotionAdmission';
import { finishPromotionHandoff } from '../crdt/promotionHandoff';
import { openOwnedSyncingAccountWorkspace } from '../crdt/accountReceive';
import { withPromotionSlot } from '../crdt/writeSession';
import { readPromotion } from '../crdt/promotionRecord';
import { hex } from '../crdt/custodyCrypto';
import type { LocalPasskey } from '../crdt/accountAccess';
import type { AdmittedWorkspace } from '../crdt/admittedWorkspace';
import { withRecoveryOwner } from './recoveryOwner';
import { verifyPendingProof } from '../../account-protocol/preparation';
import type { PromotionOpening } from './promotionOpening';

import {
  SETUP_DB,
  progressKey,
  setupProgress,
  displayName,
  randomCapability,
  type SetupConfig,
  type SetupState,
  type Result,
  type Retained,
  type FinishRequest,
} from './setupProgress';
export {
  SETUP_DB,
  isSetupSlot,
  hasFirstDeviceSetup,
  rememberedAccounts,
  beginNewAccount,
  type SetupConfig,
  type SetupState,
} from './setupProgress';
class SetupNotice extends Error {}

export function createFirstDeviceSetup(
  input: SetupConfig,
  slotId = 'local',
  takeInitialCode?: () => string | undefined,
) {
  progressKey(slotId);
  const progress = (value?: Retained | null) => setupProgress(value, slotId);
  const pin = parseAuthorityPin(input.pin);
  if (pin.origin !== location.origin || (!input.networkSessions && !isPrivateAccess(input.token)))
    throw Error('Account service configuration does not match this page');
  const token = legacyAccess(input);
  const lifetime = new AbortController();
  let networkLogin = input.networkSessions ? new NetworkLogin(pin, slotId) : undefined;
  const listeners = new Set<() => void>();
  const editors = new Set<() => void>();
  let state: SetupState = { kind: 'intro' };
  let saved: Retained | null = null;
  let code = '';
  let draftName: string | undefined;
  let deviceEnrollment: LocalGenesisEnrollment | undefined;
  // Only the live, unfinished ceremony may redisplay this. Never serialize it.
  let recoveryDisplay: string | undefined;
  let openedPrincipal: string | undefined;
  let context: RecoveryContext | undefined;
  let workspace: AdmittedWorkspace | undefined;
  let sync: import('../crdt/accountSyncDriver').SyncRuntime | undefined;
  let devices: import('./deviceRoster').DeviceRoster | undefined;
  let operation: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  let unsubscribe: (() => void) | undefined;
  let ownsSetup = false;
  let takeHandoffCode = takeInitialCode;
  let promotionOpening: PromotionOpening | undefined;
  let approval: { invoke: () => void; reject: (error: Error) => void } | undefined;
  const approve = <T>(message: string, description: string, work: () => Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      guard();
      approval = {
        reject,
        invoke: () => {
          approval = undefined;
          publish({ kind: 'working', message: 'Follow your browser’s passkey prompt…' });
          void work().then(resolve, reject);
        },
      };
      publish({ kind: 'approve-passkey', message, description });
    });
  let releaseSetup: (() => void) | undefined;
  let lease: Promise<void> | undefined;
  const acquireSetup = () =>
    ownsSetup
      ? Promise.resolve(true)
      : new Promise<boolean>((resolve, reject) => {
          lease = navigator.locks.request(
            SETUP_DB,
            { mode: 'exclusive', ifAvailable: true },
            async (lock) => {
              if (!lock) {
                resolve(false);
                return;
              }
              ownsSetup = true;
              await new Promise<void>((release) => {
                releaseSetup = release;
                resolve(true);
              });
              ownsSetup = false;
            },
          );
          void lease.catch(reject);
        });
  const retireEditors = () => {
    for (const destroy of [...editors]) {
      try {
        destroy();
      } catch {
        /* Drain the owner even if a view fails to retire. */
      }
    }
    editors.clear();
  };
  const guard = () => {
    if (lifetime.signal.aborted) throw Error('Setup closed');
  };
  const publish = (next: SetupState) => {
    if (lifetime.signal.aborted) return;
    state = {
      ...next,
      returning: saved?.connected === true,
      accountName: saved?.name,
      accountId: saved?.view?.stage === 'credential-confirmed' ? saved.view.accountId : undefined,
      fresh: saved?.fresh === true,
      requestedName: saved?.requestedName,
    };
    for (const listener of listeners) listener();
  };
  const request = async (route: string, body: unknown): Promise<unknown> => {
    guard();
    const response = await bootstrapFetch(input, route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: lifetime.signal,
    });
    const result: unknown = await response.json();
    guard();
    if (!result || typeof result !== 'object') throw Error('Invalid service response');
    if (!response.ok || ('ok' in result && result.ok === false)) {
      const reason = 'refusal' in result ? result.refusal : 'unavailable';
      if (reason === 'expired')
        throw new SetupNotice('This setup attempt expired. Start setup again.');
      throw new SetupNotice(
        'The service could not complete this step. Your writing has been kept.',
      );
    }
    return result;
  };
  const transport = {
    inspect: (body: unknown) => request('preparation/inspect', body),
    abandon: (body: unknown) => request('preparation/abandon', body),
  };
  const proveAuthority = (body: unknown) => request('authority/prove', body);
  const assert = async (options: unknown) => {
    guard();
    const credential = (await navigator.credentials.get({
      publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(
        options as PublicKeyCredentialRequestOptionsJSON,
      ),
      signal: lifetime.signal,
    })) as PublicKeyCredential | null;
    guard();
    if (!credential) throw Error('Passkey request cancelled');
    return credential.toJSON();
  };
  const assertPasskey: LocalPasskey = async ({
    rpId,
    credentialId,
    challenge,
    signal: ceremonySignal,
  }) => {
    const credential = (await navigator.credentials.get({
      publicKey: {
        rpId,
        challenge: new Uint8Array(challenge),
        userVerification: 'required',
        allowCredentials: [
          {
            id: Uint8Array.from(atob(credentialId.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
              c.charCodeAt(0),
            ),
            type: 'public-key',
          },
        ],
      },
      signal: ceremonySignal ? AbortSignal.any([lifetime.signal, ceremonySignal]) : lifetime.signal,
    })) as PublicKeyCredential | null;
    guard();
    if (!credential) throw Error('Passkey request cancelled');
    const response = credential.response as AuthenticatorAssertionResponse;
    return {
      credentialId: credential.id,
      authenticatorData: new Uint8Array(response.authenticatorData),
      clientDataJSON: new Uint8Array(response.clientDataJSON),
      signature: new Uint8Array(response.signature),
      userHandle: response.userHandle ? new Uint8Array(response.userHandle) : null,
    };
  };
  const checkedSaved = (value: Retained | null) => {
    if (
      value &&
      (value.v !== 1 ||
        value.slotId !== slotId ||
        hex(pinBytes(parseAuthorityPin(value.pin))) !== hex(pinBytes(pin)) ||
        !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value.retryKey))
    )
      throw Error('Saved setup belongs to another service or is unreadable');
    if (value) {
      const keys = Object.keys(value)
        .filter((key) => !['connected', 'name', 'requestedName', 'fresh'].includes(key))
        .sort()
        .join();
      if (
        keys !== 'pin,proof,retryKey,slotId,v,view' ||
        ('connected' in value && value.connected !== true) ||
        ('fresh' in value && value.fresh !== true)
      )
        throw Error('Malformed setup progress');
      // A damaged display label must not prevent access to the authenticated account.
      const name = displayName(value.name);
      value = { ...value };
      delete value.name;
      if (name) value.name = name;
      const requestedName = displayName(value.requestedName);
      delete value.requestedName;
      if (requestedName) value.requestedName = requestedName;
      if (value.view) value = { ...value, view: registrationView(value.view) };
      if (
        value.proof &&
        (value.proof.retryKey !== value.retryKey ||
          value.view?.stage !== 'ceremony' ||
          value.proof.ceremonyId !== value.view.ceremonyId ||
          value.proof.operation !== value.view.operation ||
          Object.keys(value.proof).sort().join() !== 'ceremonyId,operation,response,retryKey')
      )
        throw Error('Retained passkey proof does not match the attempt');
    }
    return value;
  };
  const accountId = () => {
    const view = saved?.view;
    if (!view?.ok || view.stage !== 'credential-confirmed')
      throw Error('Confirm the account passkey first');
    return view.accountId;
  };
  const marker = () =>
    withPromotionSlot(
      slotId,
      code,
      async (task) => {
        const result = await readPromotion(task, slotId, code);
        const retained = result.marker;
        if (
          retained &&
          (hex(pinBytes(retained.pin)) !== hex(pinBytes(pin)) ||
            retained.account.accountId !== accountId())
        )
          throw Error('Saved promotion belongs to another account');
        return retained;
      },
      lifetime.signal,
    );
  const baseOptions = () => ({
    slotId: slotId,
    code,
    pin,
    accountId: accountId(),
    retryKey: saved!.retryKey,
    proveAuthority,
    transport,
    signal: lifetime.signal,
  });
  const recovery = <T>(work: Parameters<typeof withRecoveryOwner<T>>[1]) => {
    if (!context) throw Error('Workspace target has not been checked');
    return withRecoveryOwner(
      {
        context,
        pin,
        local: { slotId, code },
        ...(slotId !== 'local' ? { perSlotProgress: true as const } : {}),
        accountId: accountId(),
        retryKey: saved!.retryKey,
        signal: lifetime.signal,
        transport: {
          begin: (body) => request('recovery/begin', body),
          finish: (body) => request('recovery/finish', body),
          abandon: transport.abandon,
        },
      },
      work,
    );
  };
  const run = (
    message: string,
    fallback: Exclude<
      SetupState,
      { kind: 'ready' | 'working' | 'save-recovery' | 'save-device-code' | 'approve-passkey' }
    >['kind'],
    work: () => Promise<void>,
  ) => {
    if (operation || lifetime.signal.aborted) return Promise.resolve();
    publish({ kind: 'working', message });
    operation = Promise.resolve()
      .then(async () => {
        if (!(await acquireSetup()))
          throw new SetupNotice(
            'Account setup is open in another tab. Continue there or close it.',
          );
        guard();
        await work();
      })
      .catch((cause: unknown) => {
        if (lifetime.signal.aborted) return;
        if (fallback === 'unlock') code = '';
        const cancelled =
          cause instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(cause.name);
        publish({
          kind: fallback,
          error: cancelled
            ? 'Passkey request cancelled. You can try again.'
            : cause instanceof SetupNotice ||
                cause instanceof PrivateServiceUnavailable ||
                cause instanceof RemovalPending
              ? cause.message
              : fallback === 'unlock'
                ? 'Could not unlock this workspace. Check your device-lock code and try again.'
                : fallback === 'confirm-recovery'
                  ? 'Could not finish connecting. Check your saved recovery code and try again. Your progress has been kept.'
                  : fallback === 'name'
                    ? 'Your name could not be saved. Try again.'
                    : 'The passkey step could not finish. Try again. Your setup progress has been kept.',
        });
      })
      .finally(() => {
        operation = undefined;
      });
    return operation;
  };
  const finishOpening = async () => {
    if (!workspace || !openedPrincipal || !saved || !devices)
      throw Error('Unlock the account first');
    const name = displayName(
      workspace.read().actors.find((actor) => actor.id === openedPrincipal)?.name,
    );
    saved = { ...saved, connected: true, ...(name ? { name } : {}) };
    delete saved.requestedName;
    await progress(saved);
    guard();
    publish({ kind: 'ready', workspace, actorId: openedPrincipal, devices, sync });
  };
  const openAccount = async (principalId: string) => {
    if (networkLogin?.retired) {
      networkLogin = new NetworkLogin(pin, slotId);
      void prewarmSlotLogin(networkLogin, slotId, lifetime.signal);
    }
    publish({ kind: 'working', message: 'Opening your workspace…' });
    const opening = promotionOpening;
    promotionOpening = undefined;
    const opened = await openOwnedSyncingAccountWorkspace(
      {
        membershipContinuation: () => input.membershipContinuation === true,
        slotId: slotId,
        code,
        pin,
        assertPasskey: (request) => {
          if (state.kind !== 'ready')
            publish({ kind: 'working', message: 'Use your passkey to unlock' });
          return assertPasskey(request);
        },
        signal: lifetime.signal,
        ...(networkLogin ? { networkLogin } : {}),
        ...(opening ? { promotionOpening: opening } : {}),
        identity: {
          id: principalId,
          actor: { kind: 'human', name: 'You', color: '#e0662f' },
          device: { id: `local:${principalId}`, name: defaultDeviceName() },
        },
      },
      token,
    );
    workspace = opened.workspace;
    promotionOpening = undefined;
    sync = opened.sync;
    devices = opened.devices;
    openedPrincipal = principalId;
    try {
      guard();
      unsubscribe = workspace.onStatus((status) => {
        if (
          ['active', 'blocked'].includes(status.state) &&
          status.pressure?.code !== 'repair-required'
        )
          return;
        retireEditors();
        code = '';
        publish({
          kind: 'unlock',
          error: devices?.transition || 'Your workspace was locked. Unlock it to continue.',
        });
        void workspace?.close().catch(() => {});
      });
      code = '';
      const existingName = workspace.read().actors.find((actor) => actor.id === principalId)?.name;
      if (!saved?.requestedName && !saved?.name && (!existingName || existingName === 'You')) {
        publish({ kind: 'name' });
        return;
      }
      if (saved?.requestedName && existingName !== saved.requestedName) {
        await workspace.command({ kind: 'actor', patch: { name: saved.requestedName } }).accepted;
        await workspace.whenDurable();
        guard();
      }
      await finishOpening();
    } catch (cause) {
      unsubscribe?.();
      unsubscribe = undefined;
      await workspace.close();
      workspace = undefined;
      openedPrincipal = undefined;
      throw cause;
    }
  };
  const afterRegistration = async () => {
    const retained = await marker();
    if (retained && (retained.stage === 'handoff-selected' || retained.v >= 5))
      return openAccount(retained.source.principalId);
    context = retained
      ? {
          principalId: retained.source.principalId,
          workspaceId: retained.source.workspaceId,
          lineageId: await promotionLineage(pin, accountId(), retained.source),
          authRoot: pin.authRoot,
        }
      : (await inspectLocalPromotion(baseOptions())).context;
    const status = await recovery((owner) => owner.status());
    if (status === 'empty') {
      const generated = await recovery((owner) => owner.generate());
      guard();
      recoveryDisplay = generated.code;
      publish({ kind: 'save-recovery', code: generated.code });
    } else publish({ kind: 'confirm-recovery' });
  };
  const registrationView = (input: unknown): Result => {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw Error('Invalid setup result');
    const value = input as Record<string, unknown>;
    const id = (candidate: unknown) =>
      typeof candidate === 'string' && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(candidate);
    if (value['ok'] !== true) throw Error('Invalid setup result');
    if (
      value['stage'] === 'credential-confirmed' &&
      id(value['accountId']) &&
      typeof value['credentialId'] === 'string' &&
      /^[A-Za-z0-9_-]{1,2048}$/.test(value['credentialId'])
    )
      return {
        ok: true,
        stage: 'credential-confirmed',
        accountId: value['accountId'] as string,
        credentialId: value['credentialId'],
      };
    if (
      value['stage'] !== 'ceremony' ||
      !id(value['ceremonyId']) ||
      !['register', 'confirm-registration'].includes(value['operation'] as string) ||
      !value['options'] ||
      typeof value['options'] !== 'object'
    )
      throw Error('Invalid setup ceremony');
    const options = value['options'] as Record<string, unknown>;
    const rp = options['rp'] as { id?: unknown } | undefined;
    if (
      typeof options['challenge'] !== 'string' ||
      (value['operation'] === 'register' ? rp?.id : options['rpId']) !== pin.rpId
    )
      throw Error('Passkey relying party differs from configured service');
    return {
      ok: true,
      stage: 'ceremony',
      operation: value['operation'] as 'register' | 'confirm-registration',
      ceremonyId: value['ceremonyId'] as string,
      options: structuredClone(options),
    };
  };
  const advanceRegistration = async (input: unknown) => {
    const view = registrationView(input);
    if (!saved) throw Error('Unexpected account setup response');
    if (view.stage === 'ceremony' && !['register', 'confirm-registration'].includes(view.operation))
      throw Error('Unexpected passkey purpose');
    saved = { ...saved, view, proof: null };
    await progress(saved);
    guard();
    if (view.stage === 'credential-confirmed') await afterRegistration();
    else publish({ kind: view.operation === 'register' ? 'passkey' : 'confirm-passkey' });
  };
  const continueRegistration = async () => {
    if (!saved) throw Error('Account setup is missing');
    if (saved.view?.stage === 'credential-confirmed') return afterRegistration();
    if (saved.fresh && !saved.view) {
      const disposition = await inspectLocalStartup(slotId, { signal: lifetime.signal });
      if (disposition.kind === 'creation-pending')
        await resumeLocalGenesis(slotId, code, { signal: lifetime.signal });
      else if (disposition.kind !== 'unlock-required')
        throw new SetupNotice(
          'This account’s workspace could not be resumed. Your saved accounts have been kept.',
        );
    }
    const routes = await listLocalWorkspaces(slotId, code, { signal: lifetime.signal });
    if (routes.length !== 1 || !routes[0]) throw Error('Expected one workspace for this account');
    if (saved.fresh && !saved.view) {
      const principal = routes[0].principal;
      const opened = await openLocalWorkspace(slotId, code, {
        signal: lifetime.signal,
        identity: {
          id: principal,
          actor: { kind: 'human', name: 'You', color: '#e0662f' },
          device: { id: `local:${principal}`, name: defaultDeviceName() },
        },
        validateReceive: () => {
          throw Error('Account setup does not accept network writing');
        },
      });
      if (opened.kind !== 'ready') throw Error('New account workspace could not open');
      try {
        await opened.workspace.whenDurable();
      } finally {
        await opened.workspace.close();
      }
      guard();
    }
    if (saved.proof) return advanceRegistration(await request('finish', saved.proof));
    await advanceRegistration(
      await request('begin', { operation: 'register', retryKey: saved.retryKey }),
    );
  };
  const close = () => {
    if (closing) return closing;
    let lastName: string | undefined;
    try {
      lastName = displayName(
        workspace?.read().actors.find((actor) => actor.id === openedPrincipal)?.name,
      );
    } catch {
      /* A retired workspace has no readable name. */
    }
    lifetime.abort();
    approval?.reject(new DOMException('Setup closed', 'AbortError'));
    approval = undefined;
    takeHandoffCode = undefined;
    promotionOpening = undefined;
    networkLogin?.close();
    recoveryDisplay = undefined;
    deviceEnrollment?.cancel();
    deviceEnrollment = undefined;
    retireEditors();
    state = {
      kind: 'unlock',
      returning: saved?.connected === true,
      accountName: lastName ?? saved?.name,
      accountId: saved?.view?.stage === 'credential-confirmed' ? saved.view.accountId : undefined,
    };
    for (const listener of listeners) listener();
    unsubscribe?.();
    closing = Promise.resolve().then(async () => {
      try {
        await operation;
        await workspace?.close();
        if (saved?.connected && lastName && saved.name !== lastName) {
          saved = { ...saved, name: lastName };
          await progress(saved);
        }
      } finally {
        workspace = undefined;
        code = '';
        context = undefined;
        draftName = undefined;
        openedPrincipal = undefined;
        releaseSetup?.();
        await lease;
      }
    });
    return closing;
  };
  return {
    get networkLogin() {
      return networkLogin;
    },
    getSnapshot: () => state,
    approvePasskey: () => approval?.invoke(),
    hasRecoveryDisplay: () => recoveryDisplay !== undefined,
    visit(step: string): boolean {
      if (lifetime.signal.aborted || operation) return false;
      if (
        deviceEnrollment?.displayCode &&
        ['intro', 'save-device-code', 'confirm-device-code'].includes(state.kind)
      ) {
        if (step === 'intro' || step === 'confirm-device-code') {
          publish({ kind: step });
          return true;
        }
        if (step === 'save-device-code') {
          publish({ kind: step, code: deviceEnrollment.displayCode });
          return true;
        }
      }
      if (recoveryDisplay && ['save-recovery', 'confirm-recovery'].includes(state.kind)) {
        if (step === 'save-recovery') {
          publish({ kind: step, code: recoveryDisplay });
          return true;
        }
        if (step === 'confirm-recovery') {
          publish({ kind: step });
          return true;
        }
      }
      return false;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    registerEditor(destroy: () => void) {
      if (lifetime.signal.aborted || state.kind !== 'ready') {
        destroy();
        return () => {};
      }
      editors.add(destroy);
      return () => {
        editors.delete(destroy);
      };
    },
    inspect: () =>
      run('Checking saved setup…', 'unlock', async () => {
        saved = checkedSaved(await progress());
        if (!saved && slotId !== 'local')
          throw new SetupNotice(
            'Saved account setup is unavailable. Choose an account to continue.',
          );
        if (saved?.fresh && !saved.view) {
          const disposition = await inspectLocalStartup(slotId, { signal: lifetime.signal });
          if (disposition.kind === 'fresh') return publish({ kind: 'intro' });
        }
        if (networkLogin && saved) void prewarmSlotLogin(networkLogin, slotId, lifetime.signal);
        publish({ kind: saved ? 'unlock' : 'intro' });
      }),
    start: (name: string) => {
      draftName = displayName(name) ?? 'You';
      if (saved?.fresh) {
        void run('Preparing your new account…', 'intro', async () => {
          saved = { ...saved!, requestedName: draftName! };
          await progress(saved);
          const disposition = await inspectLocalStartup(slotId, { signal: lifetime.signal });
          guard();
          if (disposition.kind !== 'fresh') return publish({ kind: 'unlock' });
          deviceEnrollment ??= beginLocalGenesis(slotId, { signal: lifetime.signal });
          const generated = deviceEnrollment.displayCode;
          if (!generated) throw Error('Device-lock code could not be generated');
          publish({ kind: 'save-device-code', code: generated });
        });
        return;
      }
      const transferred = takeHandoffCode?.();
      takeHandoffCode = undefined;
      if (transferred) {
        void run('Preparing encrypted sync…', 'unlock', async () => {
          code = transferred;
          saved = checkedSaved(await progress());
          if (!saved) {
            saved = {
              v: 1,
              pin,
              slotId,
              retryKey: randomCapability(),
              view: null,
              proof: null,
              requestedName: draftName!,
            };
            await progress(saved);
          }
          await continueRegistration();
        });
        return;
      }
      publish({ kind: 'unlock' });
    },
    savedDeviceCode: () => {
      if (state.kind === 'save-device-code') publish({ kind: 'confirm-device-code' });
    },
    confirmDeviceCode: (inputCode: string) =>
      run('Creating your empty workspace…', 'unlock', async () => {
        try {
          if (!deviceEnrollment)
            throw new SetupNotice('Resume setup with your saved device-lock code.');
          try {
            await deviceEnrollment.confirm(inputCode);
          } catch (cause) {
            if (
              deviceEnrollment.displayCode &&
              (cause as { code?: string })?.code === 'confirmation-required'
            ) {
              publish({
                kind: 'confirm-device-code',
                error: 'That code does not match. Enter the code you saved.',
              });
              return;
            }
            throw cause;
          }
          deviceEnrollment = undefined;
          guard();
          code = inputCode;
          await continueRegistration();
        } finally {
          inputCode = '';
        }
      }),
    saveName: (inputName: string) =>
      run('Saving your name…', 'name', async () => {
        const name = displayName(inputName);
        if (!name) throw new SetupNotice('Enter a name of up to 80 characters.');
        if (!workspace || !openedPrincipal) throw Error('Unlock your account first');
        await workspace.command({ kind: 'actor', patch: { name } }).accepted;
        await workspace.whenDurable();
        guard();
        await finishOpening();
      }),
    unlock: (inputCode: string) =>
      run('Checking your workspace…', 'unlock', async () => {
        code = inputCode;
        saved = checkedSaved(await progress());
        if (!saved) {
          if (slotId !== 'local') throw Error('New account setup is missing');
          const routes = await listLocalWorkspaces(slotId, code, { signal: lifetime.signal });
          if (routes.length !== 1) throw Error('Choose one existing Local workspace first');
          saved = {
            v: 1,
            pin,
            slotId: slotId,
            retryKey: randomCapability(),
            view: null,
            proof: null,
            ...(draftName ? { requestedName: draftName } : {}),
          };
          await progress(saved);
        }
        await continueRegistration();
      }),
    passkey: () =>
      run(
        'Follow your browser’s passkey prompt…',
        state.kind === 'confirm-passkey' ? 'confirm-passkey' : 'passkey',
        async () => {
          guard();
          if (!saved?.view?.ok || saved.view.stage !== 'ceremony')
            throw Error('Resume setup first');
          if (saved.proof) return advanceRegistration(await request('finish', saved.proof));
          const view = saved.view;
          let response: unknown;
          if (view.operation === 'register') {
            const options = PublicKeyCredential.parseCreationOptionsFromJSON(
              view.options as PublicKeyCredentialCreationOptionsJSON,
            );
            if (saved.requestedName)
              options.user = {
                ...options.user,
                // The generated account ID disambiguates matching personal names in
                // credential details. Never change the service-issued user handle.
                name: (view.options as PublicKeyCredentialCreationOptionsJSON).user.id,
                displayName: `${saved.requestedName} · ${(view.options as PublicKeyCredentialCreationOptionsJSON).user.id}`,
              };
            const credential = (await navigator.credentials.create({
              publicKey: options,
              signal: lifetime.signal,
            })) as PublicKeyCredential | null;
            guard();
            if (!credential) throw Error('Passkey request cancelled');
            response = credential.toJSON();
          } else response = await assert(view.options);
          saved = {
            ...saved,
            proof: {
              retryKey: saved.retryKey,
              operation: view.operation,
              ceremonyId: view.ceremonyId,
              response,
            } as FinishRequest,
          };
          await progress(saved);
          guard();
          await advanceRegistration(await request('finish', saved.proof));
        },
      ),
    savedRecovery: () => {
      if (state.kind === 'save-recovery') publish({ kind: 'confirm-recovery' });
    },
    confirmRecovery: (recoveryCode: string) =>
      run('Confirming your recovery code…', 'confirm-recovery', async () => {
        try {
          await recovery((owner) =>
            owner.confirm(recoveryCode, async (options) => {
              const proof = await assert(options);
              // A signed confirmation may be committed even if its reply is lost.
              recoveryDisplay = undefined;
              return proof;
            }),
          );
          recoveryDisplay = undefined;
          const draft = await recovery((owner) => owner.draft());
          const options = { ...baseOptions(), draft, recoveryCode };
          let retained = await marker();
          publish({
            kind: 'working',
            message: saved?.fresh
              ? 'Finishing account setup…'
              : 'Connecting your existing writing…',
          });
          if (!retained || retained.v === 1) {
            await prepareLocalPromotion(options);
            await preparePromotionGenesis(options);
            retained = await marker();
          }
          if (
            !retained ||
            retained.v < 3 ||
            (retained.stage !== 'admission-receipted' && retained.v === 3)
          ) {
            await admitLocalPromotion({
              ...options,
              assertActivation: (options) =>
                approve(
                  'Enable encrypted sync',
                  'Your passkey approves connecting this exact list and its recovery setup to your account.',
                  () => assert(options),
                ),
              admissionTransport: {
                begin: (body) => request('promotion/begin', body),
                challenge: (body) => request('promotion/challenge', body),
                finish: (body) => request('promotion/finish', body),
              },
            });
          }
          const selected = await finishPromotionHandoff({
            ...options,
            assertPasskey: (request) =>
              approve(
                'Open your list and connect sync',
                'Your passkey approves opening this protected list and, when the service is reachable, signing in to sync. This approval also finishes setup on this device.',
                () => assertPasskey(request),
              ),
            opening: {
              signal: lifetime.signal,
              ...(networkLogin ? { login: networkLogin } : {}),
              receive: (opening) => {
                promotionOpening = opening;
              },
            },
            bindingTransport: (body) => request('promotion/binding', body),
          });
          // The slot binding did not exist when setup began. Prepare its combined challenge
          // now so the first editor-opening assertion also establishes the network login.
          await openAccount(selected.principalId);
        } finally {
          recoveryCode = '';
        }
      }),
    restart: () =>
      run('Closing this setup attempt…', 'unlock', async () => {
        recoveryDisplay = undefined;
        if (!saved || !code) throw new SetupNotice('Enter your device-lock code before restarting');
        if (saved.view?.ok && saved.view.stage === 'credential-confirmed') {
          if (await marker())
            throw new SetupNotice('Connection has started. Resume it with your saved codes.');
          context = (await inspectLocalPromotion(baseOptions())).context;
          if ((await recovery((owner) => owner.status())) !== 'empty')
            await recovery((owner) => owner.abandon());
          else {
            const nonce = hex(crypto.getRandomValues(new Uint8Array(32)));
            const abandoned = await verifyPendingProof(
              pin,
              nonce,
              await transport.abandon({
                retryKey: saved.retryKey,
                accountId: accountId(),
                nonce,
              }),
            );
            if (abandoned.status !== 'abandoned' || abandoned.accountId !== accountId())
              throw Error('Setup cancellation could not be verified');
          }
        } else await request('cancel', { retryKey: saved.retryKey });
        if (saved.fresh) {
          saved = {
            v: 1,
            pin,
            slotId,
            fresh: true,
            retryKey: randomCapability(),
            view: null,
            proof: null,
            ...(saved.requestedName ? { requestedName: saved.requestedName } : {}),
          };
          await progress(saved);
        } else {
          await progress(null);
          saved = null;
        }
        context = undefined;
        code = '';
        publish({ kind: 'intro' });
      }),
    close,
  };
}
export type FirstDeviceSetup = ReturnType<typeof createFirstDeviceSetup>;
