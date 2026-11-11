/** Private baseline plaintext codec; ordinary Account readers remain fenced. */
import {
  parseInboundArray,
  inboundInteger,
  inboundHex,
  inboundBytes,
} from '../../account-protocol/inboundTransport';
import { hex, utf8, type Bytes } from './custodyCrypto';
import {
  MAX_BATCH_BYTES,
  CONTENT_LIMIT,
  type ContentIdentity,
  type OpenedRecord,
  type SpoolWitness,
} from './contentRecord';
import { sameBytes, eraseVerified } from './verifiedRecords';
import { parseJournalEra, type JournalEra } from './journalEra';
import { identity } from './custodyRecord';

export const LOCAL_BASELINE_TAG = 'done/account-local-baseline/draft-2';
export const ERA_LOCAL_BASELINE_TAG = 'done/account-local-baseline/draft-3';
/** Every record before phase 542, and still every record without a journal era. */
export const LOCAL_BASELINE_LIMIT = MAX_BATCH_BYTES;
/** Read and format bound on a journal-era record; above LOCAL_BASELINE_LIMIT only the large carrier holds it. */
export const LARGE_LOCAL_BASELINE_LIMIT = 32 * 1024 * 1024;
/** Largest journal-era candidate this build writes. Building one costs many times its size in
 * memory, so writes stop well below the read bound; reading to 32 MiB lets a later raise of this
 * limit need no format change. Operator decision, 2026-11-11 (phase 542). */
export const LARGE_LOCAL_BASELINE_WRITE_LIMIT = 8 * 1024 * 1024;
const MAX_SOURCES = 4096,
  MAX_PUBLISHERS = 128;
/** A new candidate cannot fit; decoding persisted oversized bytes remains an integrity refusal. */
export class LocalBaselineCapacityError extends Error {
  constructor() {
    super('Local baseline exceeds supported capacity');
  }
}
export interface BaselineAnchor {
  revision: number;
  hash: string;
}
export interface BaselineReceipt {
  previous: string;
  envelope: Bytes;
  proof: Bytes;
}
export interface BaselineStream {
  publisher: string;
  position: number;
  link: string;
  observedThrough: number;
  startingPoint: { position: number; link: string } | null;
  receipt: BaselineReceipt | null;
}
export interface LocalBaseline {
  journalEra?: JournalEra;
  identity: ContentIdentity;
  generation: number;
  revision: number;
  predecessor: string;
  /** Hash of owner-authenticated public context, never of secret key bytes. */
  authority: string;
  authorityState: { epoch: number; head: string; generation: number; cutsHash: string };
  cut: {
    intent: string;
    sequence: number;
    nextSequence: number;
    reserved: [number, number][];
    witness: SpoolWitness;
  };
  snapshot: Bytes;
  own: { position: number; link: string; attempts: number; receipt: BaselineReceipt | null };
  sources: { record: OpenedRecord; consumed: number[] }[];
  streams: BaselineStream[];
  history: OpenedRecord | null;
}
const fail = (): never => {
  throw Error('Invalid local baseline');
};
const tuple = (v: unknown, n: number): unknown[] =>
  Array.isArray(v) && v.length === n ? v : fail();
const list = (v: unknown, max: number): unknown[] =>
  Array.isArray(v) && v.length <= max ? v : fail();
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
  const n = inboundInteger(v, min);
  if (n > max) fail();
  return n;
};
const data = (v: unknown): Bytes => inboundBytes(v, LARGE_LOCAL_BASELINE_LIMIT);
const bytes = (v: Bytes) => {
  if (!(v instanceof Uint8Array) || !v.length || v.length > LARGE_LOCAL_BASELINE_LIMIT)
    return fail();
  return hex(v);
};
const identityTuple = (s: ContentIdentity) => [
  s.slotId,
  s.principalId,
  s.workspaceId,
  s.storeId,
  s.rootId,
];
const recordTuple = (r: OpenedRecord | null) => r && [r.seq, r.gen, r.kind, bytes(r.bytes)];
const receiptTuple = (r: BaselineReceipt | null) =>
  r && [r.previous, bytes(r.envelope), bytes(r.proof)];
const values = (b: LocalBaseline) => [
  b.journalEra ? ERA_LOCAL_BASELINE_TAG : LOCAL_BASELINE_TAG,
  1,
  identityTuple(b.identity),
  b.generation,
  b.revision,
  b.predecessor,
  b.authority,
  [
    b.cut.sequence,
    b.cut.nextSequence,
    b.cut.reserved,
    [b.cut.witness.events, b.cut.witness.hash],
    b.cut.intent,
  ],
  bytes(b.snapshot),
  [b.own.position, b.own.link, b.own.attempts, receiptTuple(b.own.receipt)],
  b.sources.map((s) => [recordTuple(s.record), s.consumed]),
  b.streams.map((s) => [
    s.publisher,
    s.position,
    s.link,
    s.observedThrough,
    s.startingPoint && [s.startingPoint.position, s.startingPoint.link],
    receiptTuple(s.receipt),
  ]),
  recordTuple(b.history),
  [
    b.authorityState.epoch,
    b.authorityState.head,
    b.authorityState.generation,
    b.authorityState.cutsHash,
  ],
  ...(b.journalEra ? [[b.journalEra.current, b.journalEra.previous, b.journalEra.revision]] : []),
];
const parseReceipt = (v: unknown): BaselineReceipt | null => {
  if (v === null) return null;
  const r = tuple(v, 3);
  return { previous: inboundHex(r[0], 32), envelope: data(r[1]), proof: data(r[2]) };
};
const parseRecord = (v: unknown, kind: 'outbound' | 'heads', max: number): OpenedRecord => {
  const r = tuple(v, 4);
  if (r[2] !== kind) return fail();
  return { seq: integer(r[0], 1, max), gen: integer(r[1], 1, 0xffffffff), kind, bytes: data(r[3]) };
};
function parse(v: unknown[]): LocalBaseline {
  const era = v[0] === ERA_LOCAL_BASELINE_TAG;
  tuple(v, era ? 15 : 14);
  const authorityState = tuple(v[13], 4);
  if ((!era && v[0] !== LOCAL_BASELINE_TAG) || v[1] !== 1) fail();
  const ids = tuple(v[2], 5).map((s, i) => (i < 3 ? identity(s) : inboundHex(s, 16)));
  const generation = integer(v[3], 1, 0xffffffff),
    revision = integer(v[4], 1);
  const predecessor = inboundHex(v[5], 32);
  if ((revision === 1) !== (predecessor === '0'.repeat(64))) fail();
  const cut = tuple(v[7], 5),
    witness = tuple(cut[3], 2);
  const sequence = integer(cut[0]),
    nextSequence = integer(cut[1], sequence + 1);
  let last = 0,
    total = 0;
  const reserved: [number, number][] = list(cut[2], 1024).map((entry) => {
    const r = tuple(entry, 2),
      g = integer(r[0], last + 1, generation),
      n = integer(r[1], 0, CONTENT_LIMIT - 1);
    last = g;
    total += n;
    return [g, n];
  });
  if (last !== generation || !Number.isSafeInteger(total) || total !== nextSequence - 1) fail();
  const events = integer(witness[0]),
    hash = inboundHex(witness[1], 32);
  if ((!events && hash !== '0'.repeat(64)) || events > sequence) fail();
  const own = tuple(v[9], 4),
    position = integer(own[0]),
    link = inboundHex(own[1], 32),
    receipt = parseReceipt(own[3]);
  if ((!position && link !== '0'.repeat(64)) || Boolean(position) !== Boolean(receipt)) fail();
  last = 0;
  const sources = list(v[10], MAX_SOURCES).map((item) => {
    const s = tuple(item, 2),
      record = parseRecord(s[0], 'outbound', sequence);
    if (record.seq <= last || record.gen > generation) fail();
    last = record.seq;
    let index = -1;
    const consumed = list(s[1], 64).map((i) => (index = integer(i, index + 1, 63)));
    return { record, consumed };
  });
  let publisher = '';
  const streams = list(v[11], MAX_PUBLISHERS).map((item): BaselineStream => {
    const s = tuple(item, 6),
      id = inboundHex(s[0], 16),
      n = integer(s[1]),
      h = inboundHex(s[2], 32);
    if (id <= publisher || (!n && h !== '0'.repeat(64))) fail();
    publisher = id;
    const start = s[4] === null ? null : tuple(s[4], 2);
    const startingPoint = start && {
      position: integer(start[0], 0, n),
      link: inboundHex(start[1], 32),
    };
    const receipt = parseReceipt(s[5]);
    if (!n && receipt) fail();
    return {
      publisher: id,
      position: n,
      link: h,
      observedThrough: integer(s[3], n),
      startingPoint,
      receipt,
    };
  });
  const history = v[12] === null ? null : parseRecord(v[12], 'heads', sequence);
  if (history && history.gen > generation) fail();
  return {
    ...(era
      ? {
          journalEra: parseJournalEra({
            current: tuple(v[14], 3)[0],
            previous: tuple(v[14], 3)[1],
            revision: integer(tuple(v[14], 3)[2], 1, revision),
          }),
        }
      : {}),
    identity: {
      slotId: ids[0]!,
      principalId: ids[1]!,
      workspaceId: ids[2]!,
      storeId: ids[3]!,
      rootId: ids[4]!,
    },
    generation,
    revision,
    predecessor,
    authority: inboundHex(v[6], 32),
    authorityState: {
      epoch: integer(authorityState[0], 1),
      head: inboundHex(authorityState[1], 32),
      generation: integer(authorityState[2], 1, 0xffffffff),
      cutsHash: inboundHex(authorityState[3], 32),
    },
    cut: {
      intent: inboundHex(cut[4], 16),
      sequence,
      nextSequence,
      reserved,
      witness: { events, hash },
    },
    snapshot: data(v[8]),
    own: { position, link, attempts: integer(own[2], position, CONTENT_LIMIT - 1), receipt },
    sources,
    streams,
    history,
  };
}
/** Bounds and closed framing are checked before any bytes can be authenticated. */
export function encodeLocalBaseline(b: LocalBaseline): Bytes {
  // Only new candidates pass through here; decoding never re-encodes through this ceiling.
  const limit = b.journalEra ? LARGE_LOCAL_BASELINE_WRITE_LIMIT : LOCAL_BASELINE_LIMIT;
  if (
    b.snapshot.length > limit ||
    b.sources.length > MAX_SOURCES ||
    b.streams.length > MAX_PUBLISHERS
  )
    throw new LocalBaselineCapacityError();
  const encoded = utf8(JSON.stringify(values(b)));
  if (encoded.length > limit) throw new LocalBaselineCapacityError();
  decodeLocalBaseline(encoded);
  return encoded;
}
export function decodeLocalBaseline(bytes: Bytes): LocalBaseline {
  const b = parse(parseInboundArray(bytes, LARGE_LOCAL_BASELINE_LIMIT));
  if (
    (!b.journalEra && bytes.length > LOCAL_BASELINE_LIMIT) ||
    !sameBytes(bytes, utf8(JSON.stringify(values(b))))
  )
    fail();
  return b;
}
/** Reuses the owner's metadata authenticator under a distinct domain; plaintext must stay private. */
const authenticationDomain = utf8('done/account-local-baseline-auth/draft-2\0');
const eraAuthenticationDomain = utf8('done/account-local-baseline-auth/draft-3\0');
export const baselineAuthenticationPayload = (payload: Bytes): Bytes => {
  if (payload.length > LARGE_LOCAL_BASELINE_LIMIT) fail();
  const decoded = decodeLocalBaseline(payload);
  const domain = decoded.journalEra ? eraAuthenticationDomain : authenticationDomain;
  eraseVerified(decoded);
  const bytes = new Uint8Array(domain.length + payload.length);
  bytes.set(domain);
  bytes.set(payload, domain.length);
  return bytes;
};
/** The carrier exposes only this domain, never an arbitrary metadata-MAC signing oracle. */
export function assertBaselineAuthenticationMessage(message: Bytes): void {
  const domain = [authenticationDomain, eraAuthenticationDomain].find((d) =>
    sameBytes(message.subarray(0, d.length), d),
  );
  if (!domain) return fail();
  const payload = message.subarray(domain.length);
  if (!sameBytes(baselineAuthenticationPayload(payload), message)) fail();
}
