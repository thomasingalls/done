/** Private bounded transport framing. Keys and trust anchors are always resolved by owners. */
import { hex, lowerHexBytes, unhex } from './recovery.ts';
import { SUBMISSION_LIMIT } from './submission.ts';
import { ENVELOPE_WIRE_LIMIT } from './envelope.ts';
import { RESPONSE_LIMIT, type Bytes, type DecisionAuthority } from './positionDecision.ts';
import type { AuthorityPin } from './authority.ts';
export const SUBMIT_BODY_LIMIT = 2 * SUBMISSION_LIMIT + 256;
export const READ_REQUEST_LIMIT = 4096;
export const READ_PAGE_LIMIT = 10 * 1024 * 1024;
export const READ_COUNT_LIMIT = 8;
export interface ReadRequest {
  serviceId: string;
  origin: string;
  workspace: string;
  credential: string;
  lineage: string;
  head: string;
  epoch: number;
  after: number;
  limit: number;
  nonce: string;
  expires: number;
  signature: string;
}
export interface ReadPage {
  request: string;
  through: number;
  next: number;
  entries: { envelope: Bytes; proof: Bytes }[];
  signature: string;
}
const invalid = (): never => {
  throw Error('Invalid private delivery frame');
};
const json = (v: unknown): Bytes => new TextEncoder().encode(JSON.stringify(v));
const integer = (v: unknown, min: number): number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min ? v : invalid();
const fixed = (v: unknown, size: number): string => {
  unhex(v, size);
  return v as string;
};
const boundedHex = (v: unknown, max: number): Bytes =>
  (typeof v === 'string' && v.length <= max * 2 ? lowerHexBytes(v) : undefined) ?? invalid();
function parse(bytes: Bytes, max: number): unknown[] {
  if (!(bytes instanceof Uint8Array) || bytes.length > max) return invalid();
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const v = JSON.parse(text);
  if (!Array.isArray(v) || JSON.stringify(v) !== text) return invalid();
  return v;
}
export function encodeSubmit(workspace: string, bytes: Bytes): Bytes {
  fixed(workspace, 16);
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > SUBMISSION_LIMIT) invalid();
  return json(['done/private-submit/v1', 1, workspace, hex(bytes)]);
}
export function decodeSubmit(bytes: Bytes) {
  const v = parse(bytes, SUBMIT_BODY_LIMIT);
  if (v.length !== 4 || v[0] !== 'done/private-submit/v1' || v[1] !== 1) return invalid();
  return { workspaceId: fixed(v[2], 16), bytes: boundedHex(v[3], SUBMISSION_LIMIT) };
}
const requestValues = (r: ReadRequest) => {
  if (
    typeof r.origin !== 'string' ||
    r.origin.length > 2048 ||
    new URL(r.origin).origin !== r.origin
  )
    invalid();
  if (integer(r.limit, 1) > READ_COUNT_LIMIT) invalid();
  return [
    'done/private-read/v1',
    1,
    fixed(r.serviceId, 16),
    r.origin,
    fixed(r.workspace, 16),
    fixed(r.credential, 16),
    fixed(r.lineage, 32),
    fixed(r.head, 32),
    integer(r.epoch, 1),
    integer(r.after, 0),
    r.limit,
    fixed(r.nonce, 32),
    integer(r.expires, 1),
  ];
};
export const readRequestMessage = (r: ReadRequest): Bytes => json(requestValues(r));
export function encodeReadRequest(r: ReadRequest): Bytes {
  const b = json([...requestValues(r), fixed(r.signature, 64)]);
  if (b.length > READ_REQUEST_LIMIT) invalid();
  return b;
}
export function decodeReadRequest(bytes: Bytes): ReadRequest {
  const v = parse(bytes, READ_REQUEST_LIMIT);
  if (v.length !== 14 || v[0] !== 'done/private-read/v1' || v[1] !== 1) return invalid();
  const r = {
    serviceId: v[2],
    origin: v[3],
    workspace: v[4],
    credential: v[5],
    lineage: v[6],
    head: v[7],
    epoch: v[8],
    after: v[9],
    limit: v[10],
    nonce: v[11],
    expires: v[12],
    signature: v[13],
  } as ReadRequest;
  encodeReadRequest(r);
  return r;
}
export function readScopeMatches(
  r: ReadRequest,
  pin: AuthorityPin,
  a: DecisionAuthority,
  credential: string,
) {
  return (
    r.serviceId === pin.serviceId &&
    r.origin === pin.origin &&
    r.workspace === a.workspace &&
    r.credential === credential &&
    r.lineage === a.lineage &&
    r.head === a.head &&
    r.epoch === a.tip
  );
}
export const readTimeValid = (r: ReadRequest, now: number) =>
  r.expires > now && r.expires <= now + 60000;
const pageValues = (p: ReadPage) => {
  if (!Array.isArray(p.entries) || p.entries.length > READ_COUNT_LIMIT) invalid();
  return [
    'done/private-read-page/v1',
    1,
    fixed(p.request, 32),
    integer(p.through, 0),
    integer(p.next, 0),
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
export const readPageMessage = (p: ReadPage): Bytes => json(pageValues(p));
export function encodeReadPage(p: ReadPage): Bytes {
  const b = json([...pageValues(p), fixed(p.signature, 64)]);
  if (b.length > READ_PAGE_LIMIT) invalid();
  return b;
}
export function decodeReadPage(bytes: Bytes): ReadPage {
  const v = parse(bytes, READ_PAGE_LIMIT);
  if (v.length !== 7 || v[0] !== 'done/private-read-page/v1' || v[1] !== 1 || !Array.isArray(v[5]))
    return invalid();
  const p = {
    request: v[2],
    through: v[3],
    next: v[4],
    entries: v[5].map((entry: unknown) => {
      if (!Array.isArray(entry) || entry.length !== 2) return invalid();
      return {
        envelope: boundedHex(entry[0], ENVELOPE_WIRE_LIMIT),
        proof: boundedHex(entry[1], RESPONSE_LIMIT),
      };
    }),
    signature: v[6],
  } as ReadPage;
  encodeReadPage(p);
  return p;
}
export function checkPageExtent(p: ReadPage, r: ReadRequest) {
  if (
    p.entries.length > r.limit ||
    p.next !== r.after + p.entries.length ||
    p.through < p.next ||
    (p.next < p.through && !p.entries.length)
  )
    invalid();
}
export const requestHash = async (bytes: Bytes, subtle = crypto.subtle) =>
  hex(new Uint8Array(await subtle.digest('SHA-256', bytes)));
export async function verifyReadPage(
  bytes: Bytes,
  request: Bytes,
  acceptanceKey: string,
  subtle = crypto.subtle,
) {
  const p = decodeReadPage(bytes),
    r = decodeReadRequest(request);
  checkPageExtent(p, r);
  if (p.request !== (await requestHash(request, subtle))) invalid();
  const key = await subtle.importKey('raw', unhex(acceptanceKey, 32), 'Ed25519', false, ['verify']);
  if (!(await subtle.verify('Ed25519', key, unhex(p.signature, 64), readPageMessage(p)))) invalid();
  return p;
}
