import type { SessionTask } from './writeSession';

declare const selection: unique symbol;
/** An opaque, synchronous lease. It exposes no carrier records or buffers. */
export type ContentSelection = { readonly [selection]: true };
const leases = new WeakMap<ContentSelection, () => object>();

export function selectionIdentity(lease: ContentSelection): object {
  const current = leases.get(lease);
  if (!current) throw Error('Content selection expired');
  return current();
}

/** Private carrier only. Verifier projections detach their answers; this lease exposes no bytes. */
export function withContentSelection<T>(
  task: SessionTask,
  identity: object,
  current: () => boolean,
  select: (lease: ContentSelection) => T,
): T {
  const lease = Object.freeze({}) as ContentSelection;
  leases.set(lease, () =>
    task.step(() => {
      if (!current()) throw Error('Content selection invalidated');
      return identity;
    }),
  );
  try {
    selectionIdentity(lease);
    const result = select(lease);
    if (
      result &&
      (typeof result === 'object' || typeof result === 'function') &&
      'then' in result &&
      typeof result.then === 'function'
    ) {
      // A mistaken async selector can continue after expiry; observe its rejection without
      // keeping the lease alive or admitting its eventual value.
      void Promise.resolve(result).catch(() => {});
      throw Error('Content selection must be synchronous');
    }
    selectionIdentity(lease);
    return result;
  } finally {
    leases.delete(lease);
  }
}
