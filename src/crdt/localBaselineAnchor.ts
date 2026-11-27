/** Private durable framing. Ordinary Account readers deliberately do not accept counters v3/v4/v5. */
import { fields, hex, utf8, type Bytes } from './custodyCrypto';
import {
  counterPayload,
  parseCounter,
  corrupt,
  type ContentCounter,
  type ContentIdentity,
} from './contentRecord';
import {
  LARGE_LOCAL_BASELINE_LIMIT,
  LOCAL_BASELINE_LIMIT,
  type BaselineAnchor,
} from './localBaselineRecord';
import { parseJournalEra, type JournalEra } from './journalEra';
import { StorageCompatibilityError } from './storageCompatibility';

export const BASELINE_CARRIER = 'done/local-baseline-carrier/draft-1';
export const ERA_BASELINE_CARRIER = 'done/local-baseline-carrier/draft-2';
export const REDUCED_BASELINE_CARRIER = 'done/local-baseline-carrier/draft-3';
/** Reduced history only, and only above BASELINE_MAX_BYTES: anything that fits stays draft-3. */
export const LARGE_BASELINE_CARRIER = 'done/local-baseline-carrier/draft-4';
export const BASELINE_CHUNK_BYTES = 256 * 1024;
export const BASELINE_MAX_BYTES = LOCAL_BASELINE_LIMIT + 32;
export const BASELINE_MAX_CHUNKS = Math.ceil(BASELINE_MAX_BYTES / BASELINE_CHUNK_BYTES);
// Larger chunks keep the key count released censuses accept, so an older reader meets the
// unknown carrier (app update required) before it counts keys (repair required).
export const LARGE_BASELINE_CHUNK_BYTES = 2 * 1024 * 1024;
export const LARGE_BASELINE_MAX_BYTES = LARGE_LOCAL_BASELINE_LIMIT + 32;
export const baselineChunkBytes = (p: Pick<BaselinePointer, 'format'>): number =>
  p.format === LARGE_BASELINE_CARRIER ? LARGE_BASELINE_CHUNK_BYTES : BASELINE_CHUNK_BYTES;
/** The reduced writer's carrier for an exact packed length (MAC plus payload). */
export const reducedBaselineCarrier = (packed: number) =>
  packed <= BASELINE_MAX_BYTES ? REDUCED_BASELINE_CARRIER : LARGE_BASELINE_CARRIER;
export const baselineChunkKey = (index: number): IDBValidKey => ['local-baseline', index];
export interface BaselinePointer extends Pick<BaselineAnchor, 'revision'> {
  /** Keyed plaintext commitment; never persist an unkeyed hash of writing. */
  commitment: string;
  format:
    | typeof BASELINE_CARRIER
    | typeof ERA_BASELINE_CARRIER
    | typeof REDUCED_BASELINE_CARRIER
    | typeof LARGE_BASELINE_CARRIER;
  journalEra?: JournalEra;
  /** Closed carrier mode: v3/v4 keep complete history; only the private v5 writer may reduce it. */
  history: 'complete' | 'baseline-plus-suffix';
  generation: number;
  firstSequence: number;
  chunks: number;
  bytes: number;
}
export type BaselineCounter = Omit<Extract<ContentCounter, { v: 2 }>, 'v'> & {
  v: 3 | 4 | 5;
  baseline: BaselinePointer;
};
const exact = (input: unknown, keys: string[]): Record<string, unknown> => {
  if (
    !input ||
    typeof input !== 'object' ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Object.keys(input).sort().join(',') !== keys.sort().join(',')
  )
    return corrupt('Invalid baseline metadata.');
  return input as Record<string, unknown>;
};
const integer = (input: unknown, max = Number.MAX_SAFE_INTEGER): number => {
  if (!Number.isSafeInteger(input) || Number(input) < 1 || Number(input) > max)
    return corrupt('Invalid baseline bound.');
  return input as number;
};
export function parseBaselineCounter(
  input: unknown,
  scope: ContentIdentity,
  intent: string,
  allowReduced = false,
): BaselineCounter {
  const value = exact(input, [
    'v',
    'store_id',
    'intent',
    'active_gen',
    'next_seq',
    'reserved',
    'mac',
    'spool',
    'baseline',
  ]);
  if (value['v'] === 5 && !allowReduced)
    throw new StorageCompatibilityError('Reduced local baseline reader required.');
  if (![3, 4, 5].includes(value['v'] as number)) return corrupt('Expected baseline counter.');
  const p = exact(value['baseline'], [
    'format',
    'history',
    'revision',
    'commitment',
    'generation',
    'firstSequence',
    'chunks',
    'bytes',
    ...(value['v'] !== 3 ? ['journalEra'] : []),
  ]);
  const large = value['v'] === 5 && p['format'] === LARGE_BASELINE_CARRIER;
  if (
    (!large &&
      p['format'] !==
        (value['v'] === 5
          ? REDUCED_BASELINE_CARRIER
          : value['v'] === 4
            ? ERA_BASELINE_CARRIER
            : BASELINE_CARRIER)) ||
    p['history'] !== (value['v'] === 5 ? 'baseline-plus-suffix' : 'complete')
  )
    throw new StorageCompatibilityError('Unsupported local baseline carrier.');
  const { baseline: _pointer, ...allocation } = value;
  const base = parseCounter({ ...allocation, v: 2 }, scope, intent);
  if (base.v !== 2) return corrupt();
  const era = value['v'] !== 3 ? parseJournalEra(p['journalEra']) : undefined;
  const bytes = integer(p['bytes'], large ? LARGE_BASELINE_MAX_BYTES : BASELINE_MAX_BYTES),
    chunks = integer(p['chunks'], BASELINE_MAX_CHUNKS),
    firstSequence = integer(p['firstSequence']),
    generation = integer(p['generation'], base.active_gen),
    revision = integer(p['revision']);
  if (
    (era && era.revision > revision) ||
    (value['v'] === 5 && era?.revision !== revision) ||
    bytes <= (large ? BASELINE_MAX_BYTES : 32) ||
    chunks !== Math.ceil(bytes / (large ? LARGE_BASELINE_CHUNK_BYTES : BASELINE_CHUNK_BYTES)) ||
    !Number.isSafeInteger(firstSequence + chunks) ||
    firstSequence + chunks > base.next_seq ||
    (base.reserved[String(generation)] ?? 0) < chunks ||
    typeof p['commitment'] !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(p['commitment'])
  )
    return corrupt();
  return {
    ...base,
    v: value['v'] as 3 | 4 | 5,
    baseline: {
      format: large
        ? LARGE_BASELINE_CARRIER
        : value['v'] === 5
          ? REDUCED_BASELINE_CARRIER
          : value['v'] === 4
            ? ERA_BASELINE_CARRIER
            : BASELINE_CARRIER,
      ...(era ? { journalEra: era } : {}),
      history: value['v'] === 5 ? 'baseline-plus-suffix' : 'complete',
      revision,
      commitment: p['commitment'],
      generation,
      firstSequence,
      chunks,
      bytes,
    },
  };
}
/** No implicit downgrade: this encoding is solely the allocation component of the versioned baseline MAC. */
export function baselineCounterPayload(scope: ContentIdentity, c: BaselineCounter): Bytes {
  const { baseline: p, ...allocation } = c;
  return utf8(
    JSON.stringify([
      c.v === 5
        ? 'done/content-counter/local-baseline-draft-3'
        : c.v === 4
          ? 'done/content-counter/local-baseline-draft-2'
          : 'done/content-counter/local-baseline-draft-1',
      hex(counterPayload(scope, { ...allocation, v: 2 })),
      [
        p.format,
        p.history,
        p.revision,
        p.commitment,
        p.generation,
        p.firstSequence,
        p.chunks,
        p.bytes,
        ...(p.journalEra
          ? [[p.journalEra.current, p.journalEra.previous, p.journalEra.revision]]
          : []),
      ],
    ]),
  );
}
/** Encrypted framing also binds order and exact allocation independently of physical IDB keys. */
export const baselineChunkPrefix = (
  scope: ContentIdentity,
  p: BaselinePointer,
  index: number,
): Bytes =>
  fields(
    p.format,
    ...(p.format === REDUCED_BASELINE_CARRIER || p.format === LARGE_BASELINE_CARRIER
      ? [p.history]
      : []),
    scope.slotId,
    scope.principalId,
    scope.workspaceId,
    scope.storeId,
    scope.rootId,
    String(p.revision),
    p.commitment,
    String(p.generation),
    String(p.firstSequence),
    String(p.chunks),
    String(p.bytes),
    String(index),
    ...(p.journalEra
      ? [p.journalEra.current, p.journalEra.previous ?? '', String(p.journalEra.revision)]
      : []),
  );

export const baselineVersion = (p: BaselinePointer): 3 | 4 | 5 =>
  p.format === REDUCED_BASELINE_CARRIER || p.format === LARGE_BASELINE_CARRIER
    ? 5
    : p.journalEra
      ? 4
      : 3;
