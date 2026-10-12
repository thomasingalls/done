/** Scheduling only: this callback cannot supply or replace any verification result. */
export type ProofCheckpoint = () => Promise<void> | undefined;
/** Preserve the original promise when no owner budget is supplied (including service callers).
 * The operation captures/starts before this boundary; cancellation is checked before its result
 * can authorize the next operation. Never use this inside a native transaction or final apply. */
export function proofWork<T>(
  checkpoint: ProofCheckpoint | undefined,
  pending: Promise<T>,
): Promise<T> {
  if (!checkpoint) return pending;
  return pending.then(async (result) => {
    const pause = checkpoint();
    if (pause) await pause;
    return result;
  });
}
