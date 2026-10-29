/** One-shot Worker transport only. Native Account join/factor/authority checks still grant access. */
import { requireClosedWindowCeremonyCohort, type WindowAccountCohort } from './accountWorkerCohort';
export interface WindowAccountHandoff {
  readonly kind: 'same-worker-account-handoff';
}
const transfers = new WeakMap<
  WindowAccountHandoff,
  {
    worker: Worker;
    nonce: string;
    slot: string;
    signal?: AbortSignal;
    cancel: () => void;
    complete: () => void;
    expiry: AbortSignal;
  }
>();
const refused = () => Error('Worker account handoff unavailable');
export function createWindowAccountHandoff(
  worker: Worker,
  owner: WindowAccountCohort,
  nonce: string,
  signal?: AbortSignal,
): WindowAccountHandoff {
  requireClosedWindowCeremonyCohort(owner);
  signal?.throwIfAborted();
  if (!(worker instanceof Worker) || !/^[a-f0-9]{32}$/.test(nonce)) throw refused();
  const token = Object.freeze({ kind: 'same-worker-account-handoff' as const });
  const deadline = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const complete = () => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  };
  const cancel = () => {
    transfers.delete(token);
    complete();
    deadline.abort();
    worker.terminate();
  };
  timer = setTimeout(cancel, 5000);
  transfers.set(token, {
    worker,
    nonce,
    slot: owner.ticket.slotId,
    ...(signal ? { signal } : {}),
    cancel,
    complete,
    expiry: deadline.signal,
  });
  signal?.addEventListener('abort', cancel, { once: true });
  return token;
}
export function takeWindowAccountHandoff(
  token: WindowAccountHandoff,
  slot: string,
  signal?: AbortSignal,
) {
  const value = transfers.get(token);
  if (!value || value.slot !== slot || (value.signal && value.signal !== signal)) throw refused();
  value.signal?.throwIfAborted();
  value.expiry.throwIfAborted();
  signal?.throwIfAborted();
  transfers.delete(token);
  value.signal?.removeEventListener('abort', value.cancel);
  return Object.freeze({
    worker: value.worker,
    nonce: value.nonce,
    signal: value.expiry,
    complete: value.complete,
    cancel: value.cancel,
  });
}
export function discardWindowAccountHandoff(token: WindowAccountHandoff) {
  transfers.get(token)?.cancel();
}
