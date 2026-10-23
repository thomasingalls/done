/** Transport only: every inner request/page retains its original v2 signature and verifier. */
import { READ_REQUEST_LIMIT, READ_PAGE_LIMIT } from './deliveryTransport.ts';
import type { Bytes } from './positionDecision.ts';

export const INBOUND_BATCH_COUNT = 4;
const requestTag = new TextEncoder().encode('done/private-read-batch/v1\0');
const pageTag = new TextEncoder().encode('done/private-read-pages/v1\0');
const overhead = (tag: Bytes) => tag.length + 4 + 4 * INBOUND_BATCH_COUNT;
export const INBOUND_BATCH_REQUEST_LIMIT =
  overhead(requestTag) + INBOUND_BATCH_COUNT * READ_REQUEST_LIMIT;
export const INBOUND_BATCH_PAGE_LIMIT = overhead(pageTag) + READ_PAGE_LIMIT;

function encode(
  tag: Bytes,
  items: readonly Bytes[],
  itemLimit: number,
  payloadLimit: number,
): Bytes {
  const size = items.reduce((n, item) => n + item.length, 0);
  if (
    !items.length ||
    items.length > INBOUND_BATCH_COUNT ||
    size > payloadLimit ||
    items.some((item) => !(item instanceof Uint8Array) || !item.length || item.length > itemLimit)
  )
    throw Error('Invalid inbound batch');
  const result = new Uint8Array(tag.length + 4 + items.length * 4 + size);
  result.set(tag);
  const view = new DataView(result.buffer);
  view.setUint32(tag.length, items.length);
  let at = tag.length + 4;
  for (const item of items) {
    view.setUint32(at, item.length);
    at += 4;
    result.set(item, at);
    at += item.length;
  }
  return result;
}
function decode(tag: Bytes, input: Bytes, itemLimit: number, payloadLimit: number): Bytes[] {
  if (
    !(input instanceof Uint8Array) ||
    input.length < tag.length + 4 ||
    input.length > overhead(tag) + payloadLimit ||
    tag.some((b, i) => input[i] !== b)
  )
    throw Error('Invalid inbound batch');
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const count = view.getUint32(tag.length),
    items: Bytes[] = [];
  let at = tag.length + 4,
    size = 0;
  try {
    if (!count || count > INBOUND_BATCH_COUNT) throw Error('Invalid inbound batch');
    for (let i = 0; i < count; i++) {
      if (at + 4 > input.length) throw Error('Invalid inbound batch');
      const length = view.getUint32(at);
      at += 4;
      size += length;
      if (!length || length > itemLimit || size > payloadLimit || at + length > input.length)
        throw Error('Invalid inbound batch');
      items.push(input.slice(at, at + length));
      at += length;
    }
    if (at !== input.length) throw Error('Invalid inbound batch');
    return items;
  } catch (cause) {
    for (const item of items) item.fill(0);
    throw cause;
  }
}
export const encodeInboundBatch = (requests: readonly Bytes[]) =>
  encode(requestTag, requests, READ_REQUEST_LIMIT, INBOUND_BATCH_COUNT * READ_REQUEST_LIMIT);
export const decodeInboundBatch = (bytes: Bytes) =>
  decode(requestTag, bytes, READ_REQUEST_LIMIT, INBOUND_BATCH_COUNT * READ_REQUEST_LIMIT);
export const encodeInboundBatchPages = (pages: readonly Bytes[]) =>
  encode(pageTag, pages, READ_PAGE_LIMIT, READ_PAGE_LIMIT);
export const decodeInboundBatchPages = (bytes: Bytes) =>
  decode(pageTag, bytes, READ_PAGE_LIMIT, READ_PAGE_LIMIT);
