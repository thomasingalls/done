/** Immutable handoff snapshots can carry writing absent from every accepted update stream. */
import { json, same } from './admission.ts';
import { digest } from './recovery.ts';
import { parseContentCheckpoint } from './contentCheckpoint.ts';
import { parseReplacementCheckpoint } from './replacementCheckpoint.ts';
import { parseRecoveryCheckpoint } from './recoveryCommit.ts';
import { parseHistorySources, type HistorySourceRef } from './historySourceRefs.ts';
export {
  parseHistorySources,
  HISTORY_SOURCE_LIMIT,
  type HistorySourceRef,
} from './historySourceRefs.ts';
export function parseHistorySourceValue(kind: HistorySourceRef['kind'], value: unknown) {
  return kind === 'original'
    ? parseContentCheckpoint(value)
    : kind === 'replacement'
      ? parseReplacementCheckpoint(value)
      : parseRecoveryCheckpoint(value);
}
export const historySourceHash = (kind: HistorySourceRef['kind'], value: unknown) =>
  digest(json(parseHistorySourceValue(kind, value)));
export const historySourcesDigest = (input: unknown) => digest(json(parseHistorySources(input)));
/** A later proposal may add sources but must not silently drop previously covered handoffs. */
export function requireHistorySourcesExtend(
  next: HistorySourceRef[],
  previous: HistorySourceRef[],
) {
  if (previous.some((before) => !next.some((after) => same(before, after))))
    throw Error('History checkpoint omitted a covered handoff');
}
