/** Scoped credential prompts only. Original Worker owners mint and verify every challenge. */
import type { LocalPasskey, LocalPasskeyRequest } from './accountAccess';
import type { SlotAssertion } from '../account/slotUnlock';
import type { WorkerChannel } from './workerChannel';
import { eraseWorkerMessage } from './workerChannel';
const refused = () => Error('Worker passkey prompt changed');
function fields(v: unknown, keys: readonly string[]) {
  if (!v || typeof v !== 'object' || Object.getPrototypeOf(v) !== Object.prototype) throw refused();
  const d = Object.getOwnPropertyDescriptors(v);
  if (
    Reflect.ownKeys(v).some(
      (k) => typeof k !== 'string' || !keys.includes(k) || !('value' in d[k]!),
    ) ||
    keys.some((k) => !Object.hasOwn(d, k))
  )
    throw refused();
}
const id = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
type Prompt = { id: number; rpId: string; credentialId: string; challenge: Uint8Array };
function capture(input: unknown): Prompt {
  fields(input, ['id', 'rpId', 'credentialId', 'challenge']);
  const p = input as Prompt;
  if (
    !id(p.id) ||
    typeof p.rpId !== 'string' ||
    !p.rpId.length ||
    p.rpId.length > 512 ||
    typeof p.credentialId !== 'string' ||
    !p.credentialId.length ||
    p.credentialId.length > 4096 ||
    !(p.challenge instanceof Uint8Array) ||
    Object.getPrototypeOf(p.challenge) !== Uint8Array.prototype ||
    !(p.challenge.buffer instanceof ArrayBuffer) ||
    p.challenge.buffer.byteLength > 4096 ||
    !p.challenge.length
  )
    throw refused();
  return { id: p.id, rpId: p.rpId, credentialId: p.credentialId, challenge: p.challenge.slice() };
}
/** One prompt until the provider settles. A late result after either abort can never be used. */
export function createWorkerPasskey(
  channel: Pick<WorkerChannel, 'request' | 'closed'>,
  signal: AbortSignal,
  live: () => void,
  failed: () => void,
): LocalPasskey {
  let sequence = 0,
    active = false;
  return async (request: LocalPasskeyRequest) => {
    live();
    signal.throwIfAborted();
    request.signal?.throwIfAborted();
    if (active) throw refused();
    const scope = request.signal,
      p = capture({
        id: sequence + 1,
        rpId: request.rpId,
        credentialId: request.credentialId,
        challenge: request.challenge,
      });
    sequence = p.id;
    active = true;
    let canceled = false,
      sent = false,
      assertion: SlotAssertion | undefined;
    const abort = () => {
      canceled = true;
      if (!sent && !channel.closed && !signal.aborted) {
        sent = true;
        void channel.request('passkeyCancel', { id: p.id }).catch(() => {
          if (!signal.aborted) failed();
        });
      }
    };
    scope?.addEventListener('abort', abort, { once: true });
    signal.addEventListener('abort', abort, { once: true });
    try {
      assertion = await channel.request<SlotAssertion>('passkey', p);
      live();
      signal.throwIfAborted();
      scope?.throwIfAborted();
      if (canceled) throw refused();
      const result = assertion;
      assertion = undefined;
      return result;
    } finally {
      scope?.removeEventListener('abort', abort);
      signal.removeEventListener('abort', abort);
      eraseWorkerMessage(assertion);
      p.challenge.fill(0);
      active = false;
    }
  };
}
/** Window retains browser UI only, with a separate AbortController for each original proof. */
export function createWindowPasskey(assert: LocalPasskey, signal: AbortSignal, live: () => void) {
  let sequence = 0,
    active: { id: number; stop: AbortController } | undefined,
    closed = signal.aborted;
  const close = () => {
    closed = true;
    active?.stop.abort();
    signal.removeEventListener('abort', close);
  };
  if (!closed) signal.addEventListener('abort', close, { once: true });
  const current = () => {
    live();
    signal.throwIfAborted();
    if (closed) throw refused();
  };
  return Object.freeze({
    close,
    cancel(input: unknown) {
      current();
      fields(input, ['id']);
      const n = (input as { id: number }).id;
      if (!id(n) || n > sequence) throw refused();
      // An old cancel cannot abort a later prompt; a just-finished prompt is an idempotent no-op.
      if (active?.id === n) active.stop.abort();
    },
    async prompt(input: unknown) {
      current();
      const p = capture(input);
      if (active || p.id !== sequence + 1) {
        p.challenge.fill(0);
        throw refused();
      }
      sequence = p.id;
      const state = { id: p.id, stop: new AbortController() };
      active = state;
      let assertion: SlotAssertion | undefined;
      try {
        assertion = await assert({
          rpId: p.rpId,
          credentialId: p.credentialId,
          challenge: p.challenge,
          signal: state.stop.signal,
        });
        current();
        state.stop.signal.throwIfAborted();
        if (active !== state) throw refused();
        return structuredClone(assertion);
      } finally {
        eraseWorkerMessage(assertion);
        p.challenge.fill(0);
        if (active === state) active = undefined;
      }
    },
  });
}
