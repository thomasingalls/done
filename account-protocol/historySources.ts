/** Immutable handoff snapshots can carry writing absent from every accepted update stream. */
import { closed } from './preparation.ts';
import { json, same } from './admission.ts';
import { digest, unhex } from './recovery.ts';
import { parseContentCheckpoint } from './contentCheckpoint.ts';
import { parseReplacementCheckpoint } from './replacementCheckpoint.ts';
import { parseRecoveryCheckpoint } from './recoveryCommit.ts';
export interface HistorySourceRef {
  epoch: number;
  head: string;
  kind: 'original' | 'replacement' | 'recovery';
  hash: string;
}
export const HISTORY_SOURCE_LIMIT = 129;
export function parseHistorySources(input: unknown): HistorySourceRef[] {
  if (!Array.isArray(input) || input.length > HISTORY_SOURCE_LIMIT)
    throw Error('Invalid history source inventory');
  const result = input.map((value) => {
    const r = closed(value, ['epoch', 'head', 'kind', 'hash']);
    if (
      !Number.isSafeInteger(r['epoch']) ||
      (r['epoch'] as number) < 2 ||
      !['original', 'replacement', 'recovery'].includes(r['kind'] as string)
    )
      throw Error('Invalid history source reference');
    unhex(r['head'], 32);
    unhex(r['hash'], 32);
    return {
      epoch: r['epoch'] as number,
      head: r['head'] as string,
      kind: r['kind'] as HistorySourceRef['kind'],
      hash: r['hash'] as string,
    };
  });
  for (let i = 1; i < result.length; i++)
    if (
      result[i]!.epoch <= result[i - 1]!.epoch ||
      result.slice(0, i).some((r) => r.head === result[i]!.head)
    )
      throw Error('History sources must be ordered and unique');
  return result;
}
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
