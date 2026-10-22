import type { Bytes } from './custodyCrypto';
import { MAX_BATCH_BYTES, MAX_BATCH_RECORDS } from './contentRecord';
import { AdmissionError, MAX_PENDING_BYTES } from './admissionQueue';

export const RECEIVE_GROUP_LIMIT = 4;
export const RECEIVE_COLLECT_MS = 250;
const invalid = (): never => {
  throw new AdmissionError('receive-refused', 'Invalid receive group');
};
/** Private admission-queue framing only. Never persisted or sent to the service. */
export function packReceivePages(pages: readonly Bytes[]): Bytes {
  if (!pages.length || pages.length > RECEIVE_GROUP_LIMIT) invalid();
  const size = pages.reduce((n, b) => n + 4 + b.length, 0);
  if (size > MAX_PENDING_BYTES || pages.some((b) => !b.length)) invalid();
  const out = new Uint8Array(size),
    view = new DataView(out.buffer);
  let at = 0;
  for (const page of pages) {
    view.setUint32(at, page.length);
    out.set(page, at + 4);
    at += 4 + page.length;
  }
  return out;
}
export function unpackReceivePages(bytes: Bytes): Bytes[] {
  if (!bytes.length || bytes.length > MAX_PENDING_BYTES) invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    pages: Bytes[] = [];
  for (let at = 0; at < bytes.length;) {
    if (bytes.length - at < 4 || pages.length === RECEIVE_GROUP_LIMIT) invalid();
    const size = view.getUint32(at);
    at += 4;
    if (!size || size > bytes.length - at) invalid();
    pages.push(bytes.subarray(at, at + size));
    at += size;
  }
  return pages;
}
export function receiveGroupFits(bytes: number, records: number): boolean {
  return bytes <= MAX_BATCH_BYTES && records <= MAX_BATCH_RECORDS;
}
