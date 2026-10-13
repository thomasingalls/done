/** Private durable framing. Ordinary Account readers deliberately do not accept counter v3. */
import { fields, hex, utf8, type Bytes } from './custodyCrypto';
import {
  counterPayload,
  parseCounter,
  corrupt,
  type ContentCounter,
  type ContentIdentity,
} from './contentRecord';
import { LOCAL_BASELINE_LIMIT, type BaselineAnchor } from './localBaselineRecord';
import { StorageCompatibilityError } from './storageCompatibility';

export const BASELINE_CARRIER = 'done/local-baseline-carrier/draft-1';
export const BASELINE_CHUNK_BYTES = 256 * 1024;
export const BASELINE_MAX_BYTES = LOCAL_BASELINE_LIMIT + 32;
export const baselineChunkKey = (index: number): IDBValidKey => ['local-baseline', index];
export interface BaselinePointer extends Pick<BaselineAnchor, 'revision'> {
  /** Keyed plaintext commitment; never persist an unkeyed hash of writing. */
  commitment: string;
  format: typeof BASELINE_CARRIER;
  /** This phase retains the complete physical history. Never infer deletion permission. */
  history: 'complete';
  generation: number;
  firstSequence: number;
  chunks: number;
  bytes: number;
}
export type BaselineCounter = Omit<Extract<ContentCounter, { v: 2 }>, 'v'> & {
  v: 3;
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
  if (value['v'] !== 3) return corrupt('Expected baseline counter.');
  const p = exact(value['baseline'], [
    'format',
    'history',
    'revision',
    'commitment',
    'generation',
    'firstSequence',
    'chunks',
    'bytes',
  ]);
  if (p['format'] !== BASELINE_CARRIER || p['history'] !== 'complete')
    throw new StorageCompatibilityError('Unsupported local baseline carrier.');
  const { baseline: _pointer, ...allocation } = value;
  const base = parseCounter({ ...allocation, v: 2 }, scope, intent);
  if (base.v !== 2) return corrupt();
  const bytes = integer(p['bytes'], BASELINE_MAX_BYTES),
    chunks = integer(p['chunks'], Math.ceil(BASELINE_MAX_BYTES / BASELINE_CHUNK_BYTES)),
    firstSequence = integer(p['firstSequence']),
    generation = integer(p['generation'], base.active_gen),
    revision = integer(p['revision']);
  // Only a first, non-deleting anchor is supported. Replacement needs its own owner transition.
  if (revision !== 1) throw new StorageCompatibilityError('Baseline replacement reader required.');
  if (
    bytes <= 32 ||
    chunks !== Math.ceil(bytes / BASELINE_CHUNK_BYTES) ||
    !Number.isSafeInteger(firstSequence + chunks) ||
    firstSequence + chunks > base.next_seq ||
    (base.reserved[String(generation)] ?? 0) < chunks ||
    typeof p['commitment'] !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(p['commitment'])
  )
    return corrupt();
  return {
    ...base,
    v: 3,
    baseline: {
      format: BASELINE_CARRIER,
      history: 'complete',
      revision,
      commitment: p['commitment'],
      generation,
      firstSequence,
      chunks,
      bytes,
    },
  };
}
/** No implicit downgrade: this encoding is solely the allocation component of the v3 MAC. */
export function baselineCounterPayload(scope: ContentIdentity, c: BaselineCounter): Bytes {
  const { baseline: p, ...allocation } = c;
  return utf8(
    JSON.stringify([
      'done/content-counter/local-baseline-draft-1',
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
    BASELINE_CARRIER,
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
  );
