/** Closed v2 read framing. V1 remains separate. Decoding grants no membership or baseline authority. */
import { hex, unhex } from './recovery.ts';
import { ENVELOPE_WIRE_LIMIT } from './envelope.ts';
import { RESPONSE_LIMIT, type Bytes } from './positionDecision.ts';
import {
  READ_COUNT_LIMIT,
  READ_PAGE_LIMIT,
  READ_REQUEST_LIMIT,
  type ReadPage,
} from './deliveryTransport.ts';

export interface InboundReadRequest {
  serviceId: string;
  origin: string;
  workspace: string;
  reader: string;
  publisher: string;
  lineage: string;
  head: string;
  epoch: number;
  after: number;
  limit: number;
  nonce: string;
  expires: number;
  signature: string;
}
export type InboundReadPage = ReadPage;
const invalid = (): never => {
  throw Error('Invalid inbound frame');
};
const json = (v: unknown): Bytes => new TextEncoder().encode(JSON.stringify(v));
export const inboundInteger = (v: unknown, min = 0): number =>
  typeof v === 'number' && Number.isSafeInteger(v) && !Object.is(v, -0) && v >= min ? v : invalid();
export const inboundHex = (v: unknown, size: number): string => {
  unhex(v, size);
  return v as string;
};
export const inboundBytes = (v: unknown, max: number): Bytes => {
  if (typeof v !== 'string' || v.length > max * 2 || !/^(?:[0-9a-f]{2})+$/.test(v))
    return invalid();
  return unhex(v, v.length / 2);
};
export function parseInboundArray(bytes: Bytes, max: number): unknown[] {
  if (!(bytes instanceof Uint8Array) || bytes.length > max) return invalid();
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes),
    v = JSON.parse(text);
  if (!Array.isArray(v) || JSON.stringify(v) !== text) return invalid();
  return v;
}
const requestValues = (r: InboundReadRequest) => {
  if (
    typeof r.origin !== 'string' ||
    r.origin.length > 2048 ||
    new URL(r.origin).origin !== r.origin
  )
    invalid();
  if (inboundInteger(r.limit, 1) > READ_COUNT_LIMIT) invalid();
  return [
    'done/private-read/v2',
    2,
    inboundHex(r.serviceId, 16),
    r.origin,
    inboundHex(r.workspace, 16),
    inboundHex(r.reader, 16),
    inboundHex(r.publisher, 16),
    inboundHex(r.lineage, 32),
    inboundHex(r.head, 32),
    inboundInteger(r.epoch, 1),
    inboundInteger(r.after),
    r.limit,
    inboundHex(r.nonce, 32),
    inboundInteger(r.expires, 1),
  ];
};
export const inboundRequestMessage = (r: InboundReadRequest): Bytes => json(requestValues(r));
export function encodeInboundRequest(r: InboundReadRequest): Bytes {
  const bytes = json([...requestValues(r), inboundHex(r.signature, 64)]);
  if (bytes.length > READ_REQUEST_LIMIT) invalid();
  return bytes;
}
export function decodeInboundRequest(bytes: Bytes): InboundReadRequest {
  const v = parseInboundArray(bytes, READ_REQUEST_LIMIT);
  if (v.length !== 15 || v[0] !== 'done/private-read/v2' || v[1] !== 2) invalid();
  const r = {
    serviceId: v[2],
    origin: v[3],
    workspace: v[4],
    reader: v[5],
    publisher: v[6],
    lineage: v[7],
    head: v[8],
    epoch: v[9],
    after: v[10],
    limit: v[11],
    nonce: v[12],
    expires: v[13],
    signature: v[14],
  } as InboundReadRequest;
  encodeInboundRequest(r);
  return r;
}
const pageValues = (p: InboundReadPage) => {
  if (!Array.isArray(p.entries) || p.entries.length > READ_COUNT_LIMIT) invalid();
  return [
    'done/private-read-page/v2',
    2,
    inboundHex(p.request, 32),
    inboundInteger(p.through),
    inboundInteger(p.next),
    p.entries.map((e) => {
      if (
        !(e.envelope instanceof Uint8Array) ||
        !e.envelope.length ||
        e.envelope.length > ENVELOPE_WIRE_LIMIT ||
        !(e.proof instanceof Uint8Array) ||
        !e.proof.length ||
        e.proof.length > RESPONSE_LIMIT
      )
        invalid();
      return [hex(e.envelope), hex(e.proof)];
    }),
  ];
};
export const inboundPageMessage = (p: InboundReadPage): Bytes => json(pageValues(p));
export function encodeInboundPage(p: InboundReadPage): Bytes {
  const bytes = json([...pageValues(p), inboundHex(p.signature, 64)]);
  if (bytes.length > READ_PAGE_LIMIT) invalid();
  return bytes;
}
export function decodeInboundPage(bytes: Bytes): InboundReadPage {
  const v = parseInboundArray(bytes, READ_PAGE_LIMIT);
  if (v.length !== 7 || v[0] !== 'done/private-read-page/v2' || v[1] !== 2 || !Array.isArray(v[5]))
    return invalid();
  const p = {
    request: v[2],
    through: v[3],
    next: v[4],
    entries: v[5].map((item: unknown) => {
      if (!Array.isArray(item) || item.length !== 2) return invalid();
      return {
        envelope: inboundBytes(item[0], ENVELOPE_WIRE_LIMIT),
        proof: inboundBytes(item[1], RESPONSE_LIMIT),
      };
    }),
    signature: v[6],
  } as InboundReadPage;
  encodeInboundPage(p);
  return p;
}
export function checkInboundExtent(p: InboundReadPage, r: InboundReadRequest): void {
  if (
    p.entries.length > r.limit ||
    p.next !== r.after + p.entries.length ||
    p.through < p.next ||
    (!p.entries.length && p.next < p.through)
  )
    invalid();
}
