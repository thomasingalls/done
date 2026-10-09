import {
  RECOVERY_HISTORY_PAGE_LIMIT,
  parseRecoveryRead,
} from '../../account-protocol/recoveryRead';
/** Product recovery coordinator: fresh factors before lock setup, exact sealed intent afterward. */
import { bootstrapFetch, legacyAccess } from './bootstrapHttp';
import type { SetupConfig } from './setupProgress';
import { randomCapability } from './setupProgress';
import { createRecoveryOpening, type RecoveryOpening } from './recoveryOpening';
import {
  verifyLostRecoveryChallenge,
  verifyLostRecoveryPrepared,
  lostRecoveryNonce,
  lostRecoveryPossessionMessage,
} from '../../account-protocol/lostDeviceRecovery';
import { parseSessionIssuance } from '../../account-protocol/session';
import { createRecoveryBootstrap } from './recoveryBootstrap';
import { prepareRecoveryCommit } from './recoveryTransition';
import {
  parseLostRecoveryProgress,
  verifyLostRecoveryProgress,
  type LostRecoveryProgress,
} from './lostRecoveryProgress';
import { beginLocalGenesis, resumeLocalGenesis, inspectLocalStartup } from '../crdt/localGenesis';
import { captureCreationSeed, eraseCreationSeed, type CreationSeed } from '../crdt/creationSeed';
import { hex, random, type Bytes } from '../crdt/custodyCrypto';
import { withCeremonyVault, type CeremonyVault } from './ceremonyVault';
import { NetworkLogin, postSession } from './networkLogin';
import { NetworkSignInRequired } from './scopedTransport';
import { rememberRecoveryRoute, isRecoverySlot } from './lostRecoveryRoutes';
import { generationInfo } from '../../account-protocol/genesis';
import { hasJoinedAccount } from '../crdt/joinedAccount';
import { openOwnedSyncingAccountWorkspace } from '../crdt/accountReceive';
import { assertSlotPasskey } from './assertSlotPasskey';
import type { SlotAssertion } from './slotUnlock';
export type RecoveryTransport = (
  operation: 'begin' | 'finish' | 'read' | 'commit',
  body: unknown,
  signal: AbortSignal,
) => Promise<unknown>;
export const recoveryTransport =
  (config: SetupConfig): RecoveryTransport =>
  async (operation, body, signal) => {
    const limit =
      operation === 'read' && parseRecoveryRead(body).history
        ? RECOVERY_HISTORY_PAGE_LIMIT
        : 16 * 1024 * 1024;
    const response = await bootstrapFetch(config, 'lost-recovery/' + operation, {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    });
    if (
      !response.body ||
      response.headers.get('content-type')?.split(';')[0] !== 'application/json'
    )
      throw Error('Recovery service unavailable');
    const reader = response.body.getReader(),
      decoder = new TextDecoder('utf-8', { fatal: true });
    let size = 0,
      text = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) throw Error('Recovery response too large');
        text += decoder.decode(value, { stream: true });
      }
      return JSON.parse(text + decoder.decode());
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  };
const result = (input: unknown, stage: string) => {
  const r = input as { ok?: boolean; stage?: string; refusal?: string };
  if (!r || r.ok !== true || r.stage !== stage) {
    const reason = r?.refusal;
    if (reason === 'expired')
      throw Error(
        'This recovery attempt expired. Start recovery again; your saved browser data is retained.',
      );
    if (reason === 'state-changed')
      throw Error(
        'Account membership or accepted writing changed. Start recovery again to include its current state.',
      );
    throw Error(
      'Recovery could not finish. Retry the saved step' + (reason ? ` (${reason})` : '') + '.',
    );
  }
  return input as Record<string, unknown>;
};
const bytes = (value: string) =>
  Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
function localAssertion(input: unknown): SlotAssertion {
  const r = input as {
    id: string;
    response: {
      authenticatorData: string;
      clientDataJSON: string;
      signature: string;
      userHandle?: string;
    };
  };
  return {
    credentialId: r.id,
    authenticatorData: bytes(r.response.authenticatorData),
    clientDataJSON: bytes(r.response.clientDataJSON),
    signature: bytes(r.response.signature),
    ...(r.response.userHandle ? { userHandle: bytes(r.response.userHandle) } : {}),
  };
}
export const recoveryPasskey = async (
  options: PublicKeyCredentialRequestOptionsJSON,
  signal: AbortSignal,
) => {
  const credential = (await navigator.credentials.get({
    publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options),
    signal,
  })) as PublicKeyCredential | null;
  signal.throwIfAborted();
  if (!credential) throw Error('Passkey request cancelled');
  return credential.toJSON();
};
/** No recovery code is retained. Actual death before confirm may restart these early steps. */
export async function beginLostDeviceRecovery(
  config: SetupConfig,
  options: {
    signal: AbortSignal;
    slotId?: string;
    transport?: RecoveryTransport;
    assert?: (
      options: PublicKeyCredentialRequestOptionsJSON,
      signal: AbortSignal,
    ) => Promise<unknown>;
  },
) {
  if (!config.networkSessions) throw Error('Recovery requires the account session service');
  const pin = structuredClone(config.pin),
    signal = options.signal,
    post = options.transport ?? recoveryTransport(config),
    assert = options.assert ?? recoveryPasskey;
  if (location.origin !== pin.origin) throw Error('Recovery service differs from this page');
  const slotId = options.slotId ?? 'enrollment-' + hex(random(16)),
    opening = createRecoveryOpening(slotId, pin, signal),
    credentials: CreationSeed['credentials'][number][] = [];
  let enrollment: ReturnType<typeof beginLocalGenesis> | undefined,
    grant: RecoveryOpening | undefined,
    done = false,
    busy = false;
  const guard = () => {
    signal.throwIfAborted();
    if (done) throw Error('Recovery preparation is closed');
  };
  const close = () => {
    done = true;
    signal.removeEventListener('abort', close);
    enrollment?.cancel();
    for (const c of credentials) c.privateBytes.fill(0);
  };
  signal.addEventListener('abort', close, { once: true });
  try {
    if (!isRecoverySlot(slotId) || (await inspectLocalStartup(slotId, { signal })).kind !== 'fresh')
      throw Error('Start recovery in a new slot, or resume the saved recovery');
    for (const role of ['wrapping', 'signing'] as const) {
      guard();
      const pair = (await crypto.subtle.generateKey(
        role === 'wrapping' ? 'X25519' : 'Ed25519',
        true,
        role === 'wrapping' ? ['deriveBits'] : ['sign', 'verify'],
      )) as CryptoKeyPair;
      credentials.push({
        role,
        id: hex(random(16)),
        publicKey: new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)),
        privateBytes: new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
      });
    }
    guard();
    const signer = await crypto.subtle.importKey(
      'pkcs8',
      credentials[1]!.privateBytes,
      'Ed25519',
      false,
      ['sign'],
    );
    const sign = async (data: Bytes) => {
      guard();
      const signature = hex(new Uint8Array(await crypto.subtle.sign('Ed25519', signer, data)));
      guard();
      return signature;
    };
    const begin = {
      retryKey: randomCapability(),
      candidate: {
        credentialId: credentials[1]!.id,
        wPub: hex(credentials[0]!.publicKey),
        sPub: hex(credentials[1]!.publicKey),
      },
      clientNonce: opening.nonce,
      login: true as const,
    };
    const challenge = await verifyLostRecoveryChallenge(
      result(await post('begin', begin, signal), 'challenge')['challenge'],
      begin,
      pin,
    );
    guard();
    const response = await assert(
      {
        challenge: await lostRecoveryNonce(challenge.context),
        rpId: pin.rpId,
        userVerification: 'required',
        timeout: 60000,
      },
      signal,
    );
    guard();
    const proof = {
      retryKey: begin.retryKey,
      attemptId: challenge.context.attemptId,
      response,
      possession: await sign(lostRecoveryPossessionMessage(challenge.context)),
    };
    const reply = result(await post('finish', proof, signal), 'prepared'),
      checked = await verifyLostRecoveryPrepared(reply['prepared'], begin, pin);
    const login = parseSessionIssuance(reply['login']);
    if (
      !login.ok ||
      login.accountId !== checked.prepared.accountId ||
      login.credentialId !== checked.prepared.passkeyId
    )
      throw Error('Recovery login identity changed');
    grant = await opening.verify(checked.prepared, begin, localAssertion(response));
    guard();
    return {
      slotId,
      accountId: checked.prepared.accountId,
      close,
      async prepare(code: string) {
        guard();
        if (busy || enrollment) throw Error('Recovery preparation already in progress');
        busy = true;
        try {
          const bootstrap = await createRecoveryBootstrap(checked.context, code, signer);
          const prepared = await prepareRecoveryCommit({
            prepared: checked.prepared,
            begin,
            pin,
            bootstrap,
            code,
            sign,
            read: (r) => post('read', r, signal),
            assertCurrent: guard,
          });
          try {
            const progress = parseLostRecoveryProgress({
              v: 1,
              kind: 'lost-device-recovery',
              begin,
              prepared: checked.prepared,
              request: prepared.request,
              login,
              successor: null,
              key: null,
            });
            const seed = captureCreationSeed({
              credentials: credentials as CreationSeed['credentials'],
              progress,
            });
            try {
              enrollment = beginLocalGenesis(slotId, { seed, signal });
            } finally {
              eraseCreationSeed(seed);
            }
          } finally {
            prepared.key.fill(0);
          }
          guard();
          return enrollment!.displayCode!;
        } finally {
          busy = false;
        }
      },
      async confirm(code: string) {
        guard();
        if (busy || !enrollment) throw Error('Save the new device-lock code first');
        busy = true;
        try {
          rememberRecoveryRoute({
            slotId,
            accountId: checked.prepared.accountId,
            workspaceId: checked.prepared.base.request.candidate.workspaceId,
            pin,
          });
          await enrollment.confirm(code);
          guard();
          for (const c of credentials) c.privateBytes.fill(0);
          return { slotId, opening: grant! };
        } finally {
          busy = false;
        }
      },
    };
  } catch (error) {
    close();
    signal.removeEventListener('abort', close);
    throw error;
  }
}
async function retained(vault: CeremonyVault, config: SetupConfig) {
  const saved = await vault.load(),
    checked = await verifyLostRecoveryProgress(
      saved ?? (await vault.creationProgress()),
      config.pin,
    ),
    candidate = checked.progress.begin.candidate;
  if (
    vault.participant.id !== candidate.credentialId ||
    vault.participant.wPub !== candidate.wPub ||
    vault.participant.sPub !== candidate.sPub
  )
    throw Error('Recovery candidate differs from this device custody');
  if (vault.marker) throw Error('Recovery cannot overwrite another account');
  return checked;
}
export async function resumeLostDeviceRecovery(
  config: SetupConfig,
  slotId: string,
  code: string,
  signal: AbortSignal,
) {
  if (!isRecoverySlot(slotId)) throw Error('Unknown recovery slot');
  const state = await inspectLocalStartup(slotId);
  if (state.kind === 'creation-pending') await resumeLocalGenesis(slotId, code, { signal });
  const joined = await hasJoinedAccount(slotId, code, signal);
  if (joined) return { stage: 'installed' as const };
  return withCeremonyVault(slotId, code, signal, async (v) => {
    const { progress: p } = await retained(v, config);
    return {
      stage: p.successor ? ('committed' as const) : ('prepared' as const),
      accountId: p.prepared.accountId,
    };
  });
}
export async function finishLostDeviceRecovery(
  config: SetupConfig,
  slotId: string,
  code: string,
  signal: AbortSignal,
  post: RecoveryTransport = recoveryTransport(config),
) {
  if (await hasJoinedAccount(slotId, code, signal)) return;
  await withCeremonyVault(slotId, code, signal, async (v) => {
    let { progress: p, authority } = await retained(v, config);
    const save = async (next: LostRecoveryProgress) => {
      await verifyLostRecoveryProgress(next, config.pin);
      signal.throwIfAborted();
      await v.save(next);
      p = next;
    };
    // The exact request lives durably before any membership-changing network effect.
    await save(p);
    if (p.login) {
      try {
        const saved = await v.rememberLogin(
          config.pin,
          { accountId: p.prepared.accountId, credentialId: p.prepared.passkeyId },
          p.login,
        );
        try {
          await postSession(
            'acknowledge',
            { sessionId: saved.sessionId, renewalToken: saved.renewalToken },
            signal,
          );
        } catch {
          /* Saved login is already durable. */
        }
      } catch (error) {
        if (!(error instanceof NetworkSignInRequired)) throw error;
      }
    }
    if (!p.successor) {
      const reply = result(await post('commit', p.request, signal), 'committed'),
        next = parseLostRecoveryProgress({ ...p, successor: reply['successor'] });
      await save(next);
    }
    ({ authority } = await verifyLostRecoveryProgress(p, config.pin));
    if (!p.key) {
      const key = await v.sealIncoming(
        p.successor!.epoch.intent.deviceWrap,
        generationInfo({
          ...p.prepared.base.request.candidate,
          generation: p.successor!.epoch.generation,
        }),
        p.successor!.head,
      );
      await save({ ...p, key });
    }
    const reading = {
      v: 1 as const,
      kind: 'recovery-reading' as const,
      epoch: p.successor!.epoch.epoch,
      head: p.successor!.head,
      checkpoint: p.request.checkpoint,
      successor: p.successor!,
      binding: p.prepared.binding!,
    };
    await v.installRecoveryWriting(authority!, reading, p.key!);
  });
}
export async function openRecoveredWorkspace(
  config: SetupConfig,
  slotId: string,
  code: string,
  signal: AbortSignal,
  opening?: RecoveryOpening,
) {
  const installed = await hasJoinedAccount(slotId, code, signal);
  if (!installed) throw Error('Recovery installation is incomplete');
  const login = new NetworkLogin(config.pin, slotId);
  try {
    const editor = await openOwnedSyncingAccountWorkspace(
      {
        slotId,
        code,
        pin: config.pin,
        networkLogin: login,
        signal,
        membershipContinuation: true,
        assertPasskey: assertSlotPasskey(signal),
        ...(opening ? { recoveryOpening: opening } : {}),
        identity: {
          id: installed.principalId,
          actor: { kind: 'human', name: 'You', color: '#e0662f' },
          device: { id: 'recovered:' + slotId, name: 'This device' },
        },
      },
      legacyAccess(config),
      true,
    );
    return { editor, login, actorId: installed.principalId, accountId: editor.accountId };
  } catch (error) {
    login.close();
    throw error;
  }
}
