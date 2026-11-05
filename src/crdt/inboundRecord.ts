/** Closed plaintext schemas inside encrypted heads rows. Decoding grants no authority. */
import { hex, unhex } from '../../account-protocol/recovery';
import {
  decodeNetworkEnvelope,
  ADMITTED_ENVELOPE_WIRE_LIMIT,
  ADMITTED_ENVELOPE_UPDATE_LIMIT,
  ADMITTED_ENVELOPE_UPDATE_BYTES,
} from '../../account-protocol/envelope';
import { decodePositionResponse, type Bytes } from '../../account-protocol/positionDecision';
import { READ_PAGE_LIMIT, READ_REQUEST_LIMIT } from '../../account-protocol/deliveryTransport';
import {
  checkInboundExtent,
  decodeInboundPage,
  decodeInboundRequest,
  inboundBytes,
  inboundHex,
  inboundInteger,
  parseInboundArray,
  type InboundReadRequest,
  type InboundReadPage,
} from '../../account-protocol/inboundTransport';
import { MAX_BATCH_BYTES } from './contentRecord';
import { StorageCompatibilityError } from './storageCompatibility';
import { captureInboundReceiptVersion, type InboundReceiptVersion } from './inboundReceiptVersion';
export const INBOUND_RECORD_LIMIT = MAX_BATCH_BYTES;
export const INBOUND_ENVELOPE_LIMIT = ADMITTED_ENVELOPE_WIRE_LIMIT;
export const INBOUND_UPDATE_LIMIT = ADMITTED_ENVELOPE_UPDATE_LIMIT;
export const INBOUND_UPDATE_BYTES = ADMITTED_ENVELOPE_UPDATE_BYTES;
/** Closed plaintext receipt versions; this predicate grants no verification or authority. */
export const isInboundRecordTag = (tag: unknown): boolean =>
  tag === 'done/account-inbound/v1' || tag === 'done/account-inbound/v2';
export interface InboundRecord {
  baseline: string;
  lineage: string;
  head: string;
  reader: string;
  publisher: string;
  kind: 'received' | 'conflict';
  position: number;
  previous: string;
  link: string;
  request: Bytes;
  page: Bytes;
  /** v2 only: selected position inside the complete original signed wider page. */
  entry?: number;
}
const invalid = (): never => {
  throw Error('Invalid inbound record');
};
/** Captured syntax only. No wire authentication, authority or lifetime trust travels with it. */
export interface InboundOriginalSyntax {
  readonly requestBytes: Bytes;
  readonly pageBytes: Bytes;
  readonly request: InboundReadRequest;
  readonly page: InboundReadPage;
}
function originalSyntax(requestBytes: Bytes, pageBytes: Bytes): InboundOriginalSyntax {
  return {
    requestBytes,
    pageBytes,
    request: decodeInboundRequest(requestBytes),
    page: decodeInboundPage(pageBytes),
  };
}
function matchingOriginals(
  e: Pick<InboundRecord, 'request' | 'page'>,
  captured?: InboundOriginalSyntax,
): InboundOriginalSyntax {
  const originals = captured ?? originalSyntax(e.request, e.page);
  if (originals.requestBytes !== e.request || originals.pageBytes !== e.page) invalid();
  return originals;
}
function validatedFields(e: InboundRecord, captured?: InboundOriginalSyntax) {
  if (e.kind !== 'received' && e.kind !== 'conflict') invalid();
  const originals = matchingOriginals(e, captured),
    r = originals.request,
    p = originals.page,
    index = e.entry === undefined ? 0 : inboundInteger(e.entry);
  checkInboundExtent(p, r);
  if (index >= p.entries.length) invalid();
  if (
    (e.entry === undefined
      ? r.limit !== 1 || p.entries.length !== 1 || p.next !== e.position
      : r.limit < 2 || e.kind !== 'received' || r.after + index + 1 !== e.position) ||
    p.entries[index]!.envelope.length > INBOUND_ENVELOPE_LIMIT ||
    r.lineage !== e.lineage ||
    r.head !== e.head ||
    r.reader !== e.reader ||
    r.publisher !== e.publisher
  )
    invalid();
  const envelope = decodeNetworkEnvelope(p.entries[index]!.envelope),
    proof = decodePositionResponse(p.entries[index]!.proof);
  if (
    envelope.v !== 2 ||
    envelope.workspace_id !== r.workspace ||
    envelope.credential_id !== e.publisher ||
    envelope.seq !== e.position ||
    proof.kind !== 'accepted' ||
    proof.head.workspace !== r.workspace ||
    proof.head.credential !== e.publisher ||
    proof.head.position !== e.position ||
    proof.head.link !== e.link ||
    proof.leaf.digest !== hex(envelope.digest) ||
    proof.leaf.epoch !== envelope.epoch
  )
    invalid();
  return [
    e.entry === undefined ? 'done/account-inbound/v1' : 'done/account-inbound/v2',
    e.entry === undefined ? 1 : 2,
    inboundHex(e.baseline, 32),
    inboundHex(e.lineage, 32),
    inboundHex(e.head, 32),
    inboundHex(e.reader, 16),
    inboundHex(e.publisher, 16),
    e.kind,
    inboundInteger(e.position, 1),
    inboundHex(e.previous, 32),
    inboundHex(e.link, 32),
  ];
}
export function encodeInboundRecord(e: InboundRecord): Bytes {
  const bytes = new TextEncoder().encode(
    JSON.stringify([
      ...validatedFields(e),
      hex(e.request),
      hex(e.page),
      ...(e.entry === undefined ? [] : [e.entry]),
    ]),
  );
  if (bytes.length > INBOUND_RECORD_LIMIT) invalid();
  return bytes;
}
export function decodeInboundRecord(bytes: Bytes): InboundRecord {
  return decodeLegacySyntax(bytes).record;
}
function decodeLegacySyntax(input: Bytes): {
  record: InboundRecord;
  originals: InboundOriginalSyntax;
  bytes: Bytes;
} {
  if (!(input instanceof Uint8Array) || input.length > INBOUND_RECORD_LIMIT) invalid();
  const bytes = input.slice();
  const v = parseInboundArray(bytes, INBOUND_RECORD_LIMIT);
  const indexed = v[0] === 'done/account-inbound/v2' && v[1] === 2;
  if (
    indexed ? v.length !== 14 : v.length !== 13 || v[0] !== 'done/account-inbound/v1' || v[1] !== 1
  )
    invalid();
  const e = {
    baseline: v[2],
    lineage: v[3],
    head: v[4],
    reader: v[5],
    publisher: v[6],
    kind: v[7],
    position: v[8],
    previous: v[9],
    link: v[10],
    request: inboundBytes(v[11], READ_REQUEST_LIMIT),
    page: inboundBytes(v[12], READ_PAGE_LIMIT),
    ...(indexed ? { entry: v[13] } : {}),
  } as InboundRecord;
  // parseInboundArray already checked byte length and exact canonical JSON. The binary
  // fields were decoded from canonical hex above; re-encoding them adds no validation.
  if (e.kind !== 'received' && e.kind !== 'conflict') invalid();
  const originals = originalSyntax(e.request, e.page);
  validatedFields(e, originals);
  return { record: e, originals, bytes };
}

/** Approved page receipt. Unwired until the authenticated compatibility floor is installed. */
export const INBOUND_PAGE_RECORD_TAG = 'done/account-inbound/page/v1';
export const INBOUND_PAGE_HEADER_BYTES = 239;
const pageMagic = new TextEncoder().encode(INBOUND_PAGE_RECORD_TAG + '\0');
const inboundNamespace = INBOUND_PAGE_RECORD_TAG.slice(0, INBOUND_PAGE_RECORD_TAG.indexOf('page/'));
const inboundNamespaceBytes = new TextEncoder().encode(inboundNamespace);
export interface InboundPageRecord {
  baseline: string;
  lineage: string;
  head: string;
  reader: string;
  publisher: string;
  firstPosition: number;
  previous: string;
  lastLink: string;
  firstEntry: number;
  entryCount: number;
  request: Bytes;
  page: Bytes;
}
const pageIds = [
  ['baseline', 29, 32],
  ['lineage', 61, 32],
  ['head', 93, 32],
  ['reader', 125, 16],
  ['publisher', 141, 16],
  ['previous', 165, 32],
  ['lastLink', 197, 32],
] as const;
function pageLengths(requestLength: number, pageLength: number): number {
  const length = INBOUND_PAGE_HEADER_BYTES + requestLength + pageLength;
  if (
    inboundInteger(requestLength, 1) > READ_REQUEST_LIMIT ||
    inboundInteger(pageLength, 1) > READ_PAGE_LIMIT ||
    length > INBOUND_RECORD_LIMIT
  )
    invalid();
  return length;
}
function validatePageRecord(e: InboundPageRecord): InboundOriginalSyntax {
  if (!(e.request instanceof Uint8Array) || !(e.page instanceof Uint8Array)) invalid();
  pageLengths(e.request.length, e.page.length);
  for (const [name, , size] of pageIds) inboundHex(e[name], size);
  const first = inboundInteger(e.firstEntry),
    count = inboundInteger(e.entryCount, 1),
    position = inboundInteger(e.firstPosition, 1),
    originals = originalSyntax(e.request, e.page),
    request = originals.request,
    page = originals.page;
  checkInboundExtent(page, request);
  if (
    count > 8 ||
    first >= page.entries.length ||
    first + count > page.entries.length ||
    !Number.isSafeInteger(position + count - 1) ||
    !Number.isSafeInteger(request.after + first + 1) ||
    position !== request.after + first + 1
  )
    invalid();
  let previous = e.previous;
  for (let index = first; index < first + count; index++) {
    const proof = decodePositionResponse(page.entries[index]!.proof);
    if (proof.kind !== 'accepted') return invalid();
    // Reuse the existing selected-entry structural checks, not its JSON encoding.
    // Crypto and acceptance-chain authentication remain the verifier's responsibility.
    validatedFields(
      {
        baseline: e.baseline,
        lineage: e.lineage,
        head: e.head,
        reader: e.reader,
        publisher: e.publisher,
        kind: 'received',
        position: position + index - first,
        previous,
        link: proof.head.link,
        request: e.request,
        page: e.page,
        ...(request.limit === 1 ? {} : { entry: index }),
      },
      originals,
    );
    previous = proof.head.link;
  }
  if (previous !== e.lastLink) invalid();
  return originals;
}
export function encodeInboundPageRecord(e: InboundPageRecord): Bytes {
  validatePageRecord(e);
  const bytes = new Uint8Array(pageLengths(e.request.length, e.page.length)),
    view = new DataView(bytes.buffer);
  bytes.set(pageMagic);
  for (const [name, offset, size] of pageIds) bytes.set(unhex(e[name], size), offset);
  view.setBigUint64(157, BigInt(e.firstPosition));
  bytes[229] = e.firstEntry;
  bytes[230] = e.entryCount;
  view.setUint32(231, e.request.length);
  view.setUint32(235, e.page.length);
  bytes.set(e.request, INBOUND_PAGE_HEADER_BYTES);
  bytes.set(e.page, INBOUND_PAGE_HEADER_BYTES + e.request.length);
  return bytes;
}
export function decodeInboundPageRecord(input: Bytes): InboundPageRecord {
  return decodePageSyntax(input).record;
}
function decodePageSyntax(input: Bytes): {
  record: InboundPageRecord;
  originals: InboundOriginalSyntax;
  bytes: Bytes;
} {
  if (
    !(input instanceof Uint8Array) ||
    input.length < INBOUND_PAGE_HEADER_BYTES ||
    input.length > INBOUND_RECORD_LIMIT ||
    !pageMagic.every((byte, index) => input[index] === byte)
  )
    invalid();
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength),
    requestLength = view.getUint32(231),
    pageLength = view.getUint32(235),
    position = view.getBigUint64(157);
  if (
    pageLengths(requestLength, pageLength) !== input.length ||
    position < 1n ||
    position > BigInt(Number.MAX_SAFE_INTEGER)
  )
    invalid();
  // Copy once after checking lengths; the caller cannot mutate the decoded originals.
  const bytes = input.slice(),
    ids = Object.fromEntries(
      pageIds.map(([name, offset, size]) => [name, hex(bytes.subarray(offset, offset + size))]),
    ) as Pick<InboundPageRecord, (typeof pageIds)[number][0]>,
    e: InboundPageRecord = {
      ...ids,
      firstPosition: Number(position),
      firstEntry: bytes[229]!,
      entryCount: bytes[230]!,
      request: bytes.subarray(INBOUND_PAGE_HEADER_BYTES, INBOUND_PAGE_HEADER_BYTES + requestLength),
      page: bytes.subarray(INBOUND_PAGE_HEADER_BYTES + requestLength),
    };
  return { record: e, originals: validatePageRecord(e), bytes };
}
export type InboundReceipt =
  | { kind: 'legacy'; record: InboundRecord }
  | { kind: 'page'; record: InboundPageRecord };
export interface InboundReceiptSyntax {
  /** Exact owned physical receipt. Binary request/page fields are subviews of this buffer. */
  readonly bytes: Bytes;
  readonly receipt: InboundReceipt;
  readonly originals: InboundOriginalSyntax;
}
/** Classify before JSON, refuse unknown inbound versions, and never infer verification trust. */
export function decodeInboundReceipt(bytes: Bytes): InboundReceipt | undefined {
  return captureInboundReceiptSyntax(bytes)?.receipt;
}
/** Internal captured physical extent. Keep this parsed syntax inside its owning turn; it is not
 * a verification capability, transport message or persistent cache. */
export function captureInboundReceiptSyntax(bytes: Bytes): InboundReceiptSyntax | undefined {
  if (!(bytes instanceof Uint8Array) || bytes.length > INBOUND_RECORD_LIMIT) invalid();
  if (bytes[0] !== 91) {
    if (
      inboundNamespaceBytes.every((byte, index) => bytes[index] === byte) &&
      !pageMagic.every((byte, index) => bytes[index] === byte)
    )
      throw new StorageCompatibilityError();
    const parsed = decodePageSyntax(bytes);
    return {
      receipt: { kind: 'page', record: parsed.record },
      originals: parsed.originals,
      bytes: parsed.bytes,
    };
  }
  const v = parseInboundArray(bytes, INBOUND_RECORD_LIMIT);
  if (isInboundRecordTag(v[0])) {
    const parsed = decodeLegacySyntax(bytes);
    return {
      receipt: { kind: 'legacy', record: parsed.record },
      originals: parsed.originals,
      bytes: parsed.bytes,
    };
  }
  if (typeof v[0] === 'string' && v[0].startsWith(inboundNamespace))
    throw new StorageCompatibilityError();
  return undefined;
}
/** Semantic consumers must supply their own authenticated marker/reading scope. The scope
 * permits an encoding only; syntax inspection still authenticates no content or authority. */
export function captureScopedInboundReceiptSyntax(
  bytes: Bytes,
  scope: InboundReceiptVersion,
): InboundReceiptSyntax | undefined {
  const floor = captureInboundReceiptVersion(scope),
    captured = captureInboundReceiptSyntax(bytes);
  if (captured?.receipt.kind === 'page' && floor.inboundReceiptVersion !== 1)
    throw new StorageCompatibilityError();
  return captured;
}

export interface InboundLogicalView {
  /** Original page index, not an extent-relative index or a physical row sequence. */
  readonly entryIndex: number;
  readonly event: InboundRecord;
}
export interface InboundReceiptViews {
  readonly receipt: InboundReceipt;
  readonly epoch: number;
  /** Admitted logical positions. Owners must check work/index bounds before expanding entries. */
  readonly count: number;
  entries(): IterableIterator<InboundLogicalView>;
}
/** Syntax-only logical views. No authority, acceptance, coverage, key or commit proof is returned.
 * Original bytes are owned by this decoded physical extent and shared by its views, never encoded
 * into synthetic v2 rows. Readers must independently enforce the authenticated encoding floor. */
export function inspectInboundReceipt(bytes: Bytes): InboundReceiptViews | undefined {
  const captured = captureInboundReceiptSyntax(bytes);
  if (!captured) return;
  return inboundReceiptViews(captured);
}
/** Project only syntax captured by the caller's own turn. Consumers must never treat a supplied
 * projection as verified bytes or as permission to omit parsing at a verification boundary. */
export function inboundReceiptViews(captured: InboundReceiptSyntax): InboundReceiptViews {
  const receipt = captured.receipt,
    request = captured.originals.request;
  if (receipt.kind === 'legacy') {
    const event = Object.freeze(receipt.record);
    return {
      receipt,
      epoch: request.epoch,
      count: 1,
      *entries() {
        yield { entryIndex: event.entry ?? 0, event };
      },
    };
  }
  const e = receipt.record,
    page = captured.originals.page,
    first = e.firstEntry,
    count = e.entryCount,
    position = e.firstPosition,
    predecessor = e.previous,
    original = {
      baseline: e.baseline,
      lineage: e.lineage,
      head: e.head,
      reader: e.reader,
      publisher: e.publisher,
      request: e.request,
      page: e.page,
    };
  return {
    receipt,
    epoch: request.epoch,
    count,
    *entries() {
      let previous = predecessor;
      for (let offset = 0; offset < count; offset++) {
        const index = first + offset,
          proof = decodePositionResponse(page.entries[index]!.proof);
        if (proof.kind !== 'accepted') return invalid();
        yield {
          entryIndex: index,
          event: Object.freeze({
            ...original,
            kind: 'received' as const,
            position: position + offset,
            previous,
            link: proof.head.link,
            ...(request.limit === 1 ? {} : { entry: index }),
          }),
        };
        previous = proof.head.link;
      }
    },
  };
}
/** Private memo address units: exact physical sequence and selected original-page entry. */
export function inboundEntryMemoSlot(sequence: number, entryIndex: number): string {
  inboundInteger(sequence, 1);
  if (inboundInteger(entryIndex) >= 8) invalid();
  return 'inbound:' + sequence + ':' + entryIndex;
}
