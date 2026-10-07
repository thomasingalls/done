import { parseAuthorityPin, pinBytes, type AuthorityPin } from '../../account-protocol/authority';
import {
  SESSION_ACCESS_MS,
  SESSION_LIFETIME_MS,
  type SessionIssued,
  type SessionOperation,
  type SessionResult,
} from '../../account-protocol/session';
import {
  sessionUnlockChallenge,
  type SessionUnlockContext,
} from '../../account-protocol/sessionUnlock';
import { hex, unhex } from '../../account-protocol/recovery';
import {
  mintUnlockNonce,
  verifySessionSlotUnlock,
  type SlotBinding,
  type SlotAssertion,
} from './slotUnlock';
import { requireAccountAccess, type LocalPasskey } from '../crdt/accountAccess';
import type { BindingProof } from '../../account-protocol/slot';
import type { Bytes } from '../crdt/custodyCrypto';
import type { SessionTask, WriteSession } from '../crdt/writeSession';
import {
  openSessionVault,
  drainSessionOutbox,
  type SessionVault,
  type SessionOutbox,
} from './sessionVault';

const b64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
const secret = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
type Challenge = Extract<SessionResult, { stage: 'challenge' }>;
interface Pending {
  kind: 'pending';
  retryKey: string;
  attemptId: string;
  response: unknown;
}
type Held = null | 'signed-out' | Pending | SessionIssued;
type Post = (
  operation: SessionOperation,
  body: unknown,
  signal: AbortSignal,
) => Promise<SessionResult>;
export type LoginStatus =
  | 'closed'
  | 'disconnected'
  | 'connect'
  | 'reconnect'
  | 'connecting'
  | 'remembered'
  | 'storage-error'
  | 'sign-out-pending'
  | 'signed-out';

/** Explicit session surface only. Never obtains or falls back to a private development bearer. */
export const postSession: Post = async (operation, body, signal) => {
  const response = await fetch('/account/session/v1/' + operation, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
  });
  if (!response.body || response.headers.get('content-type')?.split(';')[0] !== 'application/json')
    throw Error('Login service unavailable');
  const reader = response.body.getReader();
  let length = 0,
    text = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 65536) throw Error('Login response too large');
      text += decoder.decode(value, { stream: true });
    }
    const result = JSON.parse(text + decoder.decode());
    if (
      !result ||
      typeof result.ok !== 'boolean' ||
      (result.ok ? typeof result.stage !== 'string' : typeof result.refusal !== 'string')
    )
      throw Error('Invalid login response');
    return result as SessionResult;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
};
function issued(value: unknown, binding: Pick<SlotBinding, 'accountId' | 'credId'>): SessionIssued {
  const x = value as SessionIssued;
  if (
    !x ||
    Object.keys(x).sort().join() !==
      'accountId,credentialId,expiresAt,issuedAt,ok,renewalToken,revokeToken,sessionId,stage' ||
    x.ok !== true ||
    x.stage !== 'issued' ||
    x.accountId !== binding.accountId ||
    x.credentialId !== binding.credId ||
    !secret(x.sessionId) ||
    !secret(x.renewalToken) ||
    !secret(x.revokeToken) ||
    !Number.isSafeInteger(x.issuedAt) ||
    !Number.isSafeInteger(x.expiresAt) ||
    x.issuedAt < 0 ||
    x.expiresAt - x.issuedAt !== SESSION_LIFETIME_MS
  )
    throw Error('Invalid remembered login');
  return structuredClone(x);
}
function onlineAssertion(x: SlotAssertion) {
  return {
    id: x.credentialId,
    rawId: x.credentialId,
    type: 'public-key',
    clientExtensionResults: {},
    response: {
      authenticatorData: b64(x.authenticatorData),
      clientDataJSON: b64(x.clientDataJSON),
      signature: b64(x.signature),
      ...(x.userHandle ? { userHandle: b64(x.userHandle) } : {}),
    },
  };
}

/** One instance per actual workspace lifetime. Its view never exposes tokens. */
export class NetworkLogin {
  readonly #pin: AuthorityPin;
  readonly #slotId: string;
  readonly #post: Post;
  readonly #stop = new AbortController();
  #status: LoginStatus = 'closed';
  #listeners = new Set<() => void>();
  #vault: SessionVault | undefined;
  #proof: BindingProof | undefined;
  #held: Held = null;
  #live: Pick<WriteSession, 'run' | 'signal'> | undefined;
  #identity: Pick<SlotBinding, 'accountId' | 'credId'> | undefined;
  #enrollmentAssert:
    | ((options: PublicKeyCredentialRequestOptionsJSON, signal: AbortSignal) => Promise<unknown>)
    | undefined;
  readonly #networkStop = new AbortController();
  #needsSignIn = false;
  #ceremonyOwned = false;
  #tail: Promise<unknown> = Promise.resolve();
  #epoch = 0;
  #signingOut = false;
  #connecting = false;
  #proofStop: AbortController | undefined;
  #expiryTimer: ReturnType<typeof setTimeout> | undefined;
  #online = () => {
    void this.access();
  };
  #prepared: { nonce: string; retryKey: string; view: Challenge } | undefined;
  #warming: Promise<void> | undefined;
  #access: { token: string; expires: number } | undefined;
  #renewing: Promise<string | undefined> | undefined;
  #assert: LocalPasskey | undefined;
  constructor(pin: AuthorityPin, slotId: string, post: Post = postSession) {
    this.#pin = parseAuthorityPin(pin);
    if (this.#pin.origin !== location.origin)
      throw Error('Account origin differs from configured pin');
    this.#slotId = slotId;
    this.#post = post;
  }
  get networkSignal() {
    return this.#networkStop.signal;
  }
  async authorization() {
    const epoch = this.#epoch,
      token = await this.access();
    if (
      !token ||
      this.#signingOut ||
      this.retired ||
      epoch !== this.#epoch ||
      !this.#held ||
      this.#held === 'signed-out' ||
      'kind' in this.#held ||
      this.#access?.token !== token
    )
      return;
    return { token, accountId: this.#held.accountId, sessionId: this.#held.sessionId };
  }
  rejectAccess(token: string, signIn = false) {
    if (this.#access?.token !== token) return;
    this.#access = undefined;
    if (signIn) {
      this.#needsSignIn = true;
      this.#publish('reconnect');
    }
  }
  get retired() {
    return this.#stop.signal.aborted;
  }
  getSnapshot = () => this.#status;
  subscribe = (fn: () => void) => {
    this.#listeners.add(fn);
    return () => {
      this.#listeners.delete(fn);
    };
  };
  #publish(status: LoginStatus) {
    this.#status = status;
    for (const fn of this.#listeners) fn();
  }
  #current(epoch: number) {
    this.#stop.signal.throwIfAborted();
    if (epoch !== this.#epoch) throw Error('Login retired');
  }
  #run<T>(work: (task: SessionTask) => Promise<T>): Promise<T> {
    const prior = this.#tail,
      epoch = this.#epoch;
    if (!this.#live) return Promise.reject(Error('Login owner inactive'));
    const next = this.#live.run(async (task) => {
      await task.wait(() => prior);
      this.#current(epoch);
      return work(task);
    });
    this.#tail = next.catch(() => {});
    return next;
  }
  /** Hint only: callers may prefetch from the public slot index; unlock checks the authenticated binding. */
  prewarm(binding: SlotBinding): Promise<void> {
    if (this.#warming) return this.#warming;
    const nonce = mintUnlockNonce(),
      retryKey = b64(crypto.getRandomValues(new Uint8Array(32))),
      epoch = this.#epoch;
    this.#warming = (async () => {
      try {
        const view = await this.#post(
          'begin',
          {
            accountId: binding.accountId,
            retryKey,
            unlock: { nonce, principalId: binding.principalId, credentialId: binding.credId },
          },
          this.#stop.signal,
        );
        this.#current(epoch);
        if (view.ok && view.stage === 'challenge' && view.unlock)
          this.#prepared = { nonce, retryKey, view };
      } catch {
        /* Offline/slow service never delays local unlock. */
      }
    })().finally(() => {
      this.#warming = undefined;
    });
    return this.#warming;
  }
  async initialize(task: SessionTask, root: Bytes, rootId: string, proof: BindingProof) {
    if (this.retired) return;
    this.#vault?.close();
    this.#proof = structuredClone(proof);
    await this.#initializeCarrier(task, root, rootId, proof.stored.binding);
  }
  async #initializeCarrier(
    task: SessionTask,
    root: Bytes,
    rootId: string,
    identity: Pick<SlotBinding, 'accountId' | 'credId'>,
  ) {
    const prior = this.#held;
    this.#identity = { accountId: identity.accountId, credId: identity.credId };
    try {
      this.#vault = await openSessionVault(task, root, {
        pin: this.#pin,
        slotId: this.#slotId,
        rootId,
        accountId: identity.accountId,
      });
      const value = await this.#vault.load(task);
      if (value === null || value === 'signed-out') this.#held = value;
      else if ((value as Pending)?.kind === 'pending') {
        const p = value as Pending;
        if (
          Object.keys(p).sort().join() !== 'attemptId,kind,response,retryKey' ||
          !secret(p.retryKey) ||
          !secret(p.attemptId) ||
          !p.response
        )
          throw Error('Invalid pending login');
        this.#held = p;
      } else this.#held = issued(value, identity);
      if (
        !prior ||
        prior === 'signed-out' ||
        'kind' in prior ||
        !this.#held ||
        this.#held === 'signed-out' ||
        'kind' in this.#held ||
        prior.sessionId !== this.#held.sessionId
      ) {
        this.#access = undefined;
        this.#needsSignIn = false;
      }
      this.#publish(
        this.#held === 'signed-out' || this.#needsSignIn
          ? 'reconnect'
          : this.#access
            ? 'remembered'
            : this.#held
              ? 'disconnected'
              : 'connect',
      );
    } catch {
      this.#vault?.close();
      this.#vault = undefined;
      if (!this.retired) this.#publish('storage-error');
    }
  }
  /** A ceremony holds the actual slot permit only for this callback. Keep access in the
   * unlocked coordinator, but never retain its task or factor-derived vault between callbacks. */
  async withEnrollmentOwner<T>(
    task: SessionTask,
    root: Bytes,
    rootId: string,
    identity: { accountId: string; credentialId: string },
    work: () => Promise<T>,
    assert: (
      options: PublicKeyCredentialRequestOptionsJSON,
      signal: AbortSignal,
    ) => Promise<unknown> = async (options, signal) => {
      const credential = (await navigator.credentials.get({
        publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options),
        signal,
      })) as PublicKeyCredential | null;
      if (!credential) throw Error('Passkey cancelled');
      return credential.toJSON();
    },
  ) {
    this.#stop.signal.throwIfAborted();
    if (this.#live || this.#proof || this.#ceremonyOwned) throw Error('Login already has an owner');
    this.#ceremonyOwned = true;
    try {
      await this.#initializeCarrier(task, root, rootId, {
        accountId: identity.accountId,
        credId: identity.credentialId,
      });
      this.#stop.signal.throwIfAborted();
      this.#live = { signal: task.signal, run: (fn) => task.wait(() => fn(task)) };
      this.#enrollmentAssert = assert;
      return await work();
    } finally {
      await this.#renewing?.catch(() => {});
      await this.#tail.catch(() => {});
      this.#ceremonyOwned = false;
      this.#live = undefined;
      this.#enrollmentAssert = undefined;
      this.#vault?.close();
      this.#vault = undefined;
    }
  }
  async unlock(task: SessionTask, proof: BindingProof, assert: LocalPasskey) {
    if (this.retired) return requireAccountAccess(task, proof, this.#pin, assert);
    this.#assert = assert;
    const held = this.#held;
    if (
      !this.#vault ||
      held === 'signed-out' ||
      (held && ('kind' in held || held.expiresAt > Date.now()))
    )
      return requireAccountAccess(task, proof, this.#pin, assert);
    const prepared = this.#prepared;
    this.#prepared = undefined;
    if (!prepared || !(await this.#validPrepared(prepared, proof.stored.binding)))
      return requireAccountAccess(task, proof, this.#pin, assert);
    await this.#prove(task, proof, assert, prepared);
  }
  async #validPrepared(p: { nonce: string; retryKey: string; view: Challenge }, b: SlotBinding) {
    const c = p.view.unlock;
    try {
      if (
        !c ||
        c.nonce !== p.nonce ||
        c.accountId !== b.accountId ||
        c.principalId !== b.principalId ||
        c.credentialId !== b.credId ||
        hex(pinBytes(c.pin)) !== hex(pinBytes(this.#pin)) ||
        c.attemptId !== p.view.attemptId ||
        c.expiresAt !== p.view.expiresAt ||
        c.expiresAt <= Date.now() ||
        p.view.options.rpId !== b.rpId ||
        p.view.options.userVerification !== 'required'
      )
        return false;
      const hash = hex(
        new Uint8Array(
          await crypto.subtle.digest(
            'SHA-256',
            Uint8Array.from(atob(p.retryKey.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
              c.charCodeAt(0),
            ),
          ),
        ),
      );
      return (
        hash === c.retryHash && b64(await sessionUnlockChallenge(c)) === p.view.options.challenge
      );
    } catch {
      return false;
    }
  }
  async #prove(
    task: SessionTask,
    proof: BindingProof,
    assert: LocalPasskey,
    p: { nonce: string; retryKey: string; view: Challenge },
  ) {
    const epoch = this.#epoch;
    const context = p.view.unlock as SessionUnlockContext;
    const proofStop = new AbortController();
    this.#proofStop = proofStop;
    const assertion = await task
      .wait(async () =>
        structuredClone(
          await assert({
            rpId: this.#pin.rpId,
            credentialId: proof.stored.binding.credId,
            challenge: await sessionUnlockChallenge(context),
            signal: proofStop.signal,
          }),
        ),
      )
      .finally(() => {
        if (this.#proofStop === proofStop) this.#proofStop = undefined;
      });
    const result = await task.wait(() =>
      verifySessionSlotUnlock({
        binding: proof.stored.binding,
        bindingSignature: unhex(proof.stored.bindingSignature, 64),
        authorizationKey: unhex(this.#pin.authRoot, 32),
        origin: this.#pin.origin,
        pin: this.#pin,
        nonce: p.nonce,
        context,
        assertion,
      }),
    );
    if (!result.opened) throw Error('Account passkey refused: ' + result.refusal);
    this.#current(epoch);
    try {
      const pending: Pending = {
        kind: 'pending',
        retryKey: p.retryKey,
        attemptId: p.view.attemptId,
        response: onlineAssertion(assertion),
      };
      await this.#vault!.save(task, pending);
      this.#held = pending;
      this.#needsSignIn = false;
    } catch {
      if (!this.retired) this.#publish('storage-error');
      this.#vault?.close();
      this.#vault = undefined;
    }
  }
  activate(live: WriteSession) {
    this.#live = live;
    live.signal.addEventListener('abort', () => this.close(), { once: true });
    globalThis.addEventListener?.('online', this.#online);
    void this.access();
  }
  /** Deduplicated background renewal; access bytes live only in this owner. */
  access(): Promise<string | undefined> {
    if (this.#renewing) return this.#renewing;
    this.#renewing = this.#resume().finally(() => {
      this.#renewing = undefined;
    });
    return this.#renewing;
  }
  async #resume(): Promise<string | undefined> {
    const epoch = this.#epoch;
    if (
      this.#signingOut ||
      this.#stop.signal.aborted ||
      !this.#vault ||
      !this.#live ||
      this.#needsSignIn ||
      !this.#held ||
      this.#held === 'signed-out'
    )
      return;
    if (this.#access && this.#access.expires > Date.now() + 10000) return this.#access.token;
    try {
      this.#current(epoch);
      let held = this.#held;
      if ('kind' in held) {
        const r = await this.#post(
          'finish',
          { retryKey: held.retryKey, attemptId: held.attemptId, response: held.response },
          this.#stop.signal,
        );
        this.#current(epoch);
        if (!r.ok) {
          this.#publish(
            ['storage-unavailable', 'capacity'].includes(r.refusal) ? 'disconnected' : 'reconnect',
          );
          return;
        }
        const next = issued(r, this.#identity!);
        await this.#run(async (task) => {
          await this.#vault!.save(task, next);
          this.#held = next;
        });
        held = next;
      }
      const body = { sessionId: held.sessionId, renewalToken: held.renewalToken };
      // Sealing precedes acknowledgement. Repeating it after crash is harmless.
      await this.#post('acknowledge', body, this.#stop.signal);
      this.#current(epoch);
      const r = await this.#post('renew', body, this.#stop.signal);
      this.#current(epoch);
      if (!r.ok) {
        this.#access = undefined;
        this.#needsSignIn = r.refusal === 'sign-in-required';
        this.#publish(this.#needsSignIn ? 'reconnect' : 'disconnected');
        return;
      }
      if (
        r.stage !== 'access' ||
        r.accountId !== held.accountId ||
        r.sessionId !== held.sessionId ||
        !secret(r.accessToken) ||
        !Number.isSafeInteger(r.expiresAt) ||
        r.expiresAt > held.expiresAt ||
        r.expiresAt > Date.now() + SESSION_ACCESS_MS + 60000 ||
        r.expiresAt <= Date.now()
      )
        throw Error('Invalid access response');
      this.#access = { token: r.accessToken, expires: r.expiresAt };
      const expire = () => {
        if (this.#stop.signal.aborted || epoch !== this.#epoch) return;
        const remaining = held.expiresAt - Date.now();
        if (remaining > 0) this.#expiryTimer = setTimeout(expire, Math.min(remaining, 2147483647));
        else {
          this.#access = undefined;
          this.#publish('reconnect');
        }
      };
      clearTimeout(this.#expiryTimer);
      expire();
      this.#publish('remembered');
      return r.accessToken;
    } catch {
      if (!this.#stop.signal.aborted && epoch === this.#epoch) this.#publish('disconnected');
      return;
    }
  }
  async connect(): Promise<void> {
    if (
      this.#signingOut ||
      this.#stop.signal.aborted ||
      !this.#identity ||
      !this.#vault ||
      (this.#proof ? !this.#assert : !this.#enrollmentAssert) ||
      this.#connecting
    )
      return;
    this.#connecting = true;
    const mustSignIn = this.#needsSignIn;
    this.#publish('connecting');
    const epoch = this.#epoch;
    try {
      // Resolve a retained exact attempt first; do not mint a replacement on an unknown finish.
      if (this.#held && this.#held !== 'signed-out') {
        if (await this.access()) return;
        if (!mustSignIn && this.#status !== 'reconnect') return;
      }
      if (!this.#proof) {
        await this.#connectEnrollment();
        await this.access();
        return;
      }
      await this.prewarm(this.#proof.stored.binding);
      this.#current(epoch);
      const p = this.#prepared;
      this.#prepared = undefined;
      if (!p || !(await this.#validPrepared(p, this.#proof.stored.binding)))
        throw Error('Challenge unavailable');
      await this.#run((task) => this.#prove(task, this.#proof!, this.#assert!, p));
      await this.access();
    } catch {
      if (!this.#stop.signal.aborted && epoch === this.#epoch) this.#publish('disconnected');
    } finally {
      this.#connecting = false;
    }
  }
  async #connectEnrollment() {
    const epoch = this.#epoch,
      retryKey = b64(crypto.getRandomValues(new Uint8Array(32)));
    const v = await this.#post(
      'begin',
      { accountId: this.#identity!.accountId, retryKey },
      this.#stop.signal,
    );
    this.#current(epoch);
    if (
      !v.ok ||
      v.stage !== 'challenge' ||
      v.unlock ||
      !secret(v.attemptId) ||
      !Number.isSafeInteger(v.expiresAt) ||
      v.expiresAt <= Date.now() ||
      v.options.rpId !== this.#pin.rpId ||
      v.options.userVerification !== 'required' ||
      !secret(v.options.challenge)
    )
      throw Error('Login challenge unavailable');
    const proofStop = new AbortController();
    this.#proofStop = proofStop;
    try {
      const response = await this.#enrollmentAssert!(
        { ...v.options, allowCredentials: [{ type: 'public-key', id: this.#identity!.credId }] },
        AbortSignal.any([proofStop.signal, this.#stop.signal, this.#live!.signal]),
      );
      this.#current(epoch);
      await this.#run(async (task) => {
        const pending: Pending = { kind: 'pending', retryKey, attemptId: v.attemptId, response };
        await this.#vault!.save(task, pending);
        this.#held = pending;
        this.#needsSignIn = false;
        this.#access = undefined;
      });
    } finally {
      if (this.#proofStop === proofStop) this.#proofStop = undefined;
    }
  }
  async signOut(): Promise<void> {
    if (!this.#vault) throw Error('Cannot save sign-out. Lock the workspace and retry.');
    this.#signingOut = true;
    this.#networkStop.abort();
    this.#proofStop?.abort();
    clearTimeout(this.#expiryTimer);
    ++this.#epoch;
    this.#access = undefined;
    this.#prepared = undefined;
    const items: SessionOutbox[] = [];
    try {
      await this.#run(async (task) => {
        const h = this.#held;
        if (h && h !== 'signed-out')
          items.push(
            'kind' in h
              ? {
                  pin: this.#pin,
                  operation: 'cancel',
                  body: { attemptId: h.attemptId, retryKey: h.retryKey },
                }
              : {
                  pin: this.#pin,
                  operation: 'revoke',
                  body: { sessionId: h.sessionId, revokeToken: h.revokeToken },
                },
          );
        await this.#vault!.save(task, 'signed-out', items);
        this.#held = 'signed-out';
      });
      this.#publish(items.length ? 'sign-out-pending' : 'signed-out');
    } catch {
      this.#publish('storage-error');
      throw Error('Sign-out was not saved. Please retry.');
    }
  }
  close() {
    if (this.#stop.signal.aborted) return;
    clearTimeout(this.#expiryTimer);
    globalThis.removeEventListener?.('online', this.#online);
    ++this.#epoch;
    this.#stop.abort();
    this.#networkStop.abort();
    this.#proofStop?.abort();
    this.#proofStop = undefined;
    this.#vault?.close();
    this.#vault = undefined;
    this.#held = null;
    this.#access = undefined;
    this.#prepared = undefined;
    this.#proof = undefined;
    this.#identity = undefined;
    this.#enrollmentAssert = undefined;
    this.#assert = undefined;
    this.#live = undefined;
    this.#publish('closed');
  }
}
export const retrySessionSignOut = (
  pin: AuthorityPin,
  signal: AbortSignal,
  post: Post = postSession,
  observe?: (pending: number) => void,
) =>
  drainSessionOutbox(
    pin,
    async (item) => {
      const r = await post(item.operation, item.body, signal);
      return (
        (r.ok && (r.stage === 'revoked' || r.stage === 'cancelled')) ||
        (!r.ok && r.refusal === 'unknown-attempt' && item.operation === 'cancel')
      );
    },
    observe,
  );

/** Untrusted public routing hint only. No locks, keys, writes or startup authority. */
export async function prewarmSlotLogin(login: NetworkLogin, slotId: string, signal: AbortSignal) {
  try {
    const binding = await new Promise<SlotBinding | undefined>((resolve, reject) => {
      const q = indexedDB.open('done.slots');
      q.onupgradeneeded = () => q.transaction!.abort();
      q.onerror = () => resolve(undefined);
      q.onblocked = () => resolve(undefined);
      q.onsuccess = () => {
        const db = q.result;
        if (signal.aborted || !db.objectStoreNames.contains('slots')) {
          db.close();
          resolve(undefined);
          return;
        }
        const tx = db.transaction('slots'),
          r = tx.objectStore('slots').get(slotId);
        tx.oncomplete = () => {
          db.close();
          resolve(r.result?.unlockBinding?.binding);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
    if (binding && !signal.aborted) await login.prewarm(binding);
  } catch {
    /* A hint is optional; authenticated startup still performs the real checks. */
  }
}
