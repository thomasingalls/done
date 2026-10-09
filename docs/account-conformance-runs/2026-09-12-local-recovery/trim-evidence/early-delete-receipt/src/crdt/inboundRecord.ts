/** Plaintext schema for a FUTURE encrypted v9 heads row. No store writes or activation. */
import { hex } from '../../account-protocol/recovery';
import { decodeNetworkEnvelope } from '../../account-protocol/envelope';
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
} from '../../account-protocol/inboundTransport';
import { MAX_BATCH_BYTES } from './contentRecord';
export const INBOUND_RECORD_LIMIT = MAX_BATCH_BYTES;
export const INBOUND_ENVELOPE_LIMIT = 512 * 1024;
export const INBOUND_UPDATE_LIMIT = 255;
export const INBOUND_UPDATE_BYTES = 512 * 1024;
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
}
const invalid = (): never => {
  throw Error('Invalid inbound record');
};
function values(e: InboundRecord) {
  if (e.kind !== 'received' && e.kind !== 'conflict') invalid();
  const r = decodeInboundRequest(e.request),
    p = decodeInboundPage(e.page);
  checkInboundExtent(p, r);
  if (
    r.limit !== 1 ||
    p.entries.length !== 1 ||
    p.entries[0]!.envelope.length > INBOUND_ENVELOPE_LIMIT ||
    r.lineage !== e.lineage ||
    r.head !== e.head ||
    r.reader !== e.reader ||
    r.publisher !== e.publisher ||
    p.next !== e.position
  )
    invalid();
  const envelope = decodeNetworkEnvelope(p.entries[0]!.envelope),
    proof = decodePositionResponse(p.entries[0]!.proof);
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
    'done/account-inbound/v1',
    1,
    inboundHex(e.baseline, 32),
    inboundHex(e.lineage, 32),
    inboundHex(e.head, 32),
    inboundHex(e.reader, 16),
    inboundHex(e.publisher, 16),
    e.kind,
    inboundInteger(e.position, 1),
    inboundHex(e.previous, 32),
    inboundHex(e.link, 32),
    hex(e.request),
    hex(e.page),
  ];
}
export function encodeInboundRecord(e: InboundRecord): Bytes {
  const bytes = new TextEncoder().encode(JSON.stringify(values(e)));
  if (bytes.length > INBOUND_RECORD_LIMIT) invalid();
  return bytes;
}
export function decodeInboundRecord(bytes: Bytes): InboundRecord {
  const v = parseInboundArray(bytes, INBOUND_RECORD_LIMIT);
  if (v.length !== 13 || v[0] !== 'done/account-inbound/v1' || v[1] !== 1) invalid();
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
  } as InboundRecord;
  encodeInboundRecord(e);
  return e;
}
