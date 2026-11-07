/** Selected v1 record bytes; v1 local allocator/witness framing. Internal module. */
import { fields, hex, utf8, type Bytes } from './custodyCrypto';
import type { CustodyScope } from './custodyRecord';
import { StorageCompatibilityError } from './storageCompatibility';

export type ContentRefusal =
  | 'invalid-input'
  | 'batch-too-large'
  | 'missing-content'
  | 'creation-pending'
  | 'already-initialized'
  | 'repair-required'
  | 'generation-changed'
  | 'rotation-required'
  | 'storage-failed';
export class ContentError extends Error {
  override readonly name = 'ContentError';
  constructor(
    readonly code: ContentRefusal,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
export type RecordKind = 'update' | 'state' | 'heads' | 'outbound';
export interface StoredRecord {
  v: 1;
  gen: number;
  seq: number;
  kind: RecordKind;
  nonce: Bytes;
  ct: Bytes;
}
export interface ContentInput {
  kind: RecordKind;
  bytes: Bytes;
}
export interface OpenedRecord extends ContentInput {
  gen: number;
  seq: number;
}
export interface ContentIdentity extends CustodyScope {
  storeId: string;
  rootId: string;
}
export interface ContentWitness {
  v: 1;
  state: 'creating' | 'ready';
  intent: string;
  mac: Bytes;
}
export interface SpoolWitness {
  events: number;
  hash: string;
}
export const emptySpoolWitness = (): SpoolWitness => ({ events: 0, hash: '0'.repeat(64) });
export const sameSpoolWitness = (a: SpoolWitness, b: SpoolWitness): boolean =>
  a.events === b.events && a.hash === b.hash;
export type ContentCounter = ({ v: 1 } | { v: 2; spool: SpoolWitness }) & {
  store_id: string;
  intent: string;
  active_gen: number;
  next_seq: number;
  reserved: Record<string, number>;
  mac: Bytes;
};
export const CONTENT_STORES = ['meta', 'content', 'heads', 'outbound'] as const;
export const recordStore = (kind: RecordKind): string =>
  kind === 'update' || kind === 'state' ? 'content' : kind;
export const CONTENT_LIMIT = 2 ** 32;
export const MAX_BATCH_RECORDS = 256;
export const MAX_BATCH_BYTES = 4 * 1024 * 1024;
export const corrupt = (
  message = 'Content storage is incomplete, unsupported, or inconsistent.',
): never => {
  throw new ContentError('repair-required', message);
};
const object = (input: unknown, keys: string[]): Record<string, unknown> => {
  if (
    !input ||
    typeof input !== 'object' ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Object.keys(input).sort().join(',') !== [...keys].sort().join(',')
  )
    return corrupt();
  return input as Record<string, unknown>;
};
const bytes = (value: unknown, size?: number): Bytes => {
  if (!(value instanceof Uint8Array) || (size !== undefined && value.length !== size))
    return corrupt();
  return value.slice();
};
const positive = (v: unknown): number => {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 1) return corrupt();
  return v;
};
const id = (v: unknown): string => {
  if (typeof v !== 'string' || !/^[0-9a-f]{32}$/.test(v)) return corrupt();
  return v;
};
/** Read-only unverified ciphertext view for a native transaction; never an authenticated receipt.
 * Stored IndexedDB/transport bytes have ordinary backing buffers. Owning parsers still copy. */
const recordByteView = (value: unknown, size?: number): Bytes => {
  if (
    !(value instanceof Uint8Array) ||
    !(value.buffer instanceof ArrayBuffer) ||
    (size !== undefined && value.length !== size)
  )
    return corrupt();
  return value as Bytes;
};
const storedRecordData = (input: unknown, copy: boolean): StoredRecord => {
  const v = object(input, ['v', 'gen', 'seq', 'kind', 'nonce', 'ct']);
  if (v['v'] !== 1 || !['update', 'state', 'heads', 'outbound'].includes(v['kind'] as string))
    return corrupt();
  const ct = copy ? bytes(v['ct']) : recordByteView(v['ct']);
  if (ct.length < 16) return corrupt();
  return {
    v: 1,
    gen: positive(v['gen']),
    seq: positive(v['seq']),
    kind: v['kind'] as RecordKind,
    nonce: copy ? bytes(v['nonce'], 12) : recordByteView(v['nonce'], 12),
    ct,
  };
};
export const parseStoredRecord = (input: unknown): StoredRecord => storedRecordData(input, true);
/** Borrow only during the owning cursor/commit scope. This does not verify AEAD or authorize deletion. */
export const viewStoredRecord = (input: unknown): Readonly<StoredRecord> =>
  storedRecordData(input, false);
export const recordAAD = (
  scope: Pick<ContentIdentity, 'principalId' | 'workspaceId' | 'storeId'>,
  r: Pick<StoredRecord, 'v' | 'gen' | 'seq' | 'kind'>,
): Bytes =>
  fields(
    'done/store/v1',
    scope.principalId,
    scope.workspaceId,
    scope.storeId,
    String(r.v),
    String(r.gen),
    String(r.seq),
    r.kind,
  );
export const copyBatch = (input: readonly ContentInput[]): ContentInput[] => {
  if (!Array.isArray(input) || !input.length)
    throw new ContentError('invalid-input', 'A nonempty record batch is required.');
  if (input.length > MAX_BATCH_RECORDS)
    throw new ContentError('batch-too-large', 'Split this batch before retrying.');
  let size = 0;
  for (const value of input) {
    if (
      !value ||
      !['update', 'state', 'heads', 'outbound'].includes(value.kind) ||
      !(value.bytes instanceof Uint8Array)
    )
      throw new ContentError('invalid-input', 'A record requires a known kind and byte array.');
    size += value.bytes.byteLength;
  }
  if (size > MAX_BATCH_BYTES)
    throw new ContentError('batch-too-large', 'Split this batch before retrying.');
  return input.map((v) => ({ kind: v.kind, bytes: v.bytes.slice() }));
};
export const parseWitness = (input: unknown): ContentWitness => {
  const v = object(input, ['v', 'state', 'intent', 'mac']);
  if (v['v'] !== 1 || !['creating', 'ready'].includes(v['state'] as string)) return corrupt();
  return {
    v: 1,
    state: v['state'] as ContentWitness['state'],
    intent: id(v['intent']),
    mac: bytes(v['mac'], 32),
  };
};
export const parseCounter = (
  input: unknown,
  scope: ContentIdentity,
  intent: string,
): ContentCounter => {
  const version = (input as { v?: unknown } | null)?.v;
  // Refusal only. Baseline-aware metadata has a separate authenticated parser;
  // no ordinary full-history reader may discard its active pointer.
  if (version === 3 || version === 4 || version === 5)
    throw new StorageCompatibilityError('Local baseline reader required.');
  const v = object(input, [
    'v',
    'store_id',
    'intent',
    'active_gen',
    'next_seq',
    'reserved',
    'mac',
    ...(version === 2 ? ['spool'] : []),
  ]);
  if ((version !== 1 && version !== 2) || v['store_id'] !== scope.storeId || v['intent'] !== intent)
    return corrupt();
  const active_gen = positive(v['active_gen']),
    next_seq = positive(v['next_seq']);
  const raw = v['reserved'];
  if (!raw || typeof raw !== 'object' || Object.getPrototypeOf(raw) !== Object.prototype)
    return corrupt();
  const reserved: Record<string, number> = {};
  let total = 0;
  for (const [g, n] of Object.entries(raw)) {
    if (
      !/^[1-9][0-9]*$/.test(g) ||
      !Number.isSafeInteger(Number(g)) ||
      Number(g) > active_gen ||
      typeof n !== 'number' ||
      !Number.isSafeInteger(n) ||
      n < 0 ||
      n >= CONTENT_LIMIT
    )
      return corrupt();
    reserved[g] = n;
    total += n;
  }
  if (
    !Object.hasOwn(reserved, String(active_gen)) ||
    !Number.isSafeInteger(total) ||
    total !== next_seq - 1
  )
    return corrupt();
  let variant: { v: 1 } | { v: 2; spool: SpoolWitness } = { v: 1 };
  if (version === 2) {
    const w = object(v['spool'], ['events', 'hash']);
    if (
      !Number.isSafeInteger(w['events']) ||
      Number(w['events']) < 0 ||
      typeof w['hash'] !== 'string' ||
      !/^[0-9a-f]{64}$/.test(w['hash'])
    )
      return corrupt();
    variant = { v: 2, spool: { events: w['events'] as number, hash: w['hash'] } };
  }
  return {
    ...variant,
    store_id: scope.storeId,
    intent,
    active_gen,
    next_seq,
    reserved,
    mac: bytes(v['mac'], 32),
  };
};
const scopeTuple = (s: ContentIdentity) => [
  s.slotId,
  s.principalId,
  s.workspaceId,
  s.storeId,
  s.rootId,
];
export const witnessPayload = (s: ContentIdentity, w: ContentWitness): Bytes =>
  utf8(JSON.stringify(['done/content-witness/v1', ...scopeTuple(s), w.v, w.state, w.intent]));
export const counterPayload = (s: ContentIdentity, c: ContentCounter): Bytes =>
  utf8(
    JSON.stringify([
      c.v === 1 ? 'done/content-counter/v1' : 'done/content-counter/v2',
      ...scopeTuple(s),
      c.v,
      c.store_id,
      c.intent,
      c.active_gen,
      c.next_seq,
      Object.entries(c.reserved).sort(([a], [b]) => Number(a) - Number(b)),
      ...(c.v === 2 ? [[c.spool.events, c.spool.hash]] : []),
    ]),
  );
export const equalCounter = (s: ContentIdentity, a: ContentCounter, b: ContentCounter): boolean =>
  hex(counterPayload(s, a)) === hex(counterPayload(s, b)) && hex(a.mac) === hex(b.mac);

export const reserveCounter = (
  c: ContentCounter,
  count: number,
  generation: number,
): ContentCounter => {
  if (c.active_gen !== generation)
    throw new ContentError('generation-changed', 'Reopen after local generation activation.');
  if (c.reserved[String(generation)]! + count >= CONTENT_LIMIT)
    throw new ContentError(
      'rotation-required',
      'Rotate before reserving more content invocations.',
    );
  if (!Number.isSafeInteger(c.next_seq + count))
    throw new ContentError('rotation-required', 'The global sequence space is exhausted.');
  return {
    ...c,
    next_seq: c.next_seq + count,
    reserved: { ...c.reserved, [generation]: c.reserved[String(generation)]! + count },
  };
};
