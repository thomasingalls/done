/** Shared provider lifetime/transport only. Original consumers still verify every credential. */
import type { WorkerChannel } from './workerChannel';
import { eraseWorkerMessage } from './workerChannel';
export const credentialRefused = () => Error('Worker passkey prompt changed');
export function credentialFields(v: unknown, keys: readonly string[]) {
  if (!v || typeof v !== 'object' || Object.getPrototypeOf(v) !== Object.prototype)
    throw credentialRefused();
  const d = Object.getOwnPropertyDescriptors(v);
  if (
    Reflect.ownKeys(v).some(
      (k) => typeof k !== 'string' || !keys.includes(k) || !('value' in d[k]!),
    ) ||
    keys.some((k) => !Object.hasOwn(d, k))
  )
    throw credentialRefused();
}
export const credentialId = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
export function createWorkerCredentialPrompt(
  channel: Pick<WorkerChannel, 'request' | 'closed'>,
  signal: AbortSignal,
  live: () => void,
  failed: () => void,
  cancelMethod: string,
) {
  let sequence = 0,
    active = false;
  return async <P extends { id: number }, R>(
    method: string,
    scope: AbortSignal | undefined,
    capture: (id: number) => P,
    dispose: (p: P) => void,
  ): Promise<R> => {
    live();
    signal.throwIfAborted();
    scope?.throwIfAborted();
    if (active) throw credentialRefused();
    const p = capture(sequence + 1);
    sequence = p.id;
    active = true;
    let canceled = false,
      sent = false,
      result: R | undefined;
    const abort = () => {
      canceled = true;
      if (!sent && !channel.closed && !signal.aborted) {
        sent = true;
        void channel.request(cancelMethod, { id: p.id }).catch(() => {
          if (!signal.aborted) failed();
        });
      }
    };
    scope?.addEventListener('abort', abort, { once: true });
    signal.addEventListener('abort', abort, { once: true });
    try {
      result = await channel.request<R>(method, p);
      live();
      signal.throwIfAborted();
      scope?.throwIfAborted();
      if (canceled) throw credentialRefused();
      const value = result;
      result = undefined;
      return value;
    } finally {
      scope?.removeEventListener('abort', abort);
      signal.removeEventListener('abort', abort);
      eraseWorkerMessage(result);
      dispose(p);
      active = false;
    }
  };
}
export function createWindowCredentialPrompt(signal: AbortSignal, live: () => void) {
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
    if (closed) throw credentialRefused();
  };
  return Object.freeze({
    close,
    current,
    cancel(input: unknown) {
      current();
      credentialFields(input, ['id']);
      const n = (input as { id: number }).id;
      if (!credentialId(n) || n > sequence) throw credentialRefused();
      if (active?.id === n) active.stop.abort();
    },
    async run<R>(
      id: number,
      work: (signal: AbortSignal) => Promise<R>,
      dispose: () => void = () => {},
    ): Promise<R> {
      let state: { id: number; stop: AbortController } | undefined, result: R | undefined;
      try {
        current();
        if (!credentialId(id) || active || id !== sequence + 1) throw credentialRefused();
        sequence = id;
        state = { id, stop: new AbortController() };
        active = state;
        result = await work(state.stop.signal);
        current();
        state.stop.signal.throwIfAborted();
        if (active !== state) throw credentialRefused();
        return structuredClone(result);
      } finally {
        eraseWorkerMessage(result);
        dispose();
        if (state && active === state) active = undefined;
      }
    },
  });
}
