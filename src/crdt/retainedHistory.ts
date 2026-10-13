/** A missing retired proof is not permission to trust a cursor or manufacture a response. */
export class RetiredHistoryRequired extends Error {
  constructor() {
    super('Operation requires retired history');
  }
}
/** After a baseline install, discard/refetch an old flight before persisting it if this returns false.
 * A same-frontier duplicate remains verifiable when its exact terminal receipt survives. */
export function canVerifyRetainedRead(
  state: { prefix: { position: number }; retained: ReadonlyMap<number, unknown> },
  after: number,
): boolean {
  return after >= state.prefix.position || state.retained.has(after + 1);
}

/** Full-history consumers must fail explicitly if a reduced experimental spool reaches them.
 * Their live callers still read intact stores. This fence is removed only with a tested adapter. */
export function requireFullSpool(state: { origin?: unknown }): void {
  if (state.origin !== undefined) throw new RetiredHistoryRequired();
}
