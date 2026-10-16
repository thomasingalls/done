/** Sequential existing reads; framing never replaces a subrequest's transaction authorization. */
import { decodeInboundBatch, encodeInboundBatchPages } from '../account-protocol/inboundBatch.ts';
import { READ_PAGE_LIMIT } from '../account-protocol/deliveryTransport.ts';
import type { Bytes } from '../account-protocol/positionDecision.ts';
import type { ServiceDeliveryResult } from './delivery.ts';

export const INBOUND_BATCH_WORK_MS = 250;

export async function readInboundBatch(
  bytes: Bytes,
  read: (request: Bytes) => Promise<ServiceDeliveryResult>,
  now: () => number = () => performance.now(),
): Promise<ServiceDeliveryResult> {
  const requests = decodeInboundBatch(bytes),
    pages: Bytes[] = [];
  const started = now();
  let size = 0;
  try {
    for (const request of requests) {
      const result = await read(request);
      if (result.kind !== 'decision') return result;
      if (result.bytes.length > READ_PAGE_LIMIT || !result.bytes.length) {
        result.bytes.fill(0);
        throw Error('Invalid inbound batch page');
      }
      if (size + result.bytes.length > READ_PAGE_LIMIT) {
        result.bytes.fill(0);
        break;
      }
      pages.push(result.bytes);
      size += result.bytes.length;
      // A slow completed read is still useful. Leave later positions for fresh requests
      // instead of multiplying its latency inside the unchanged HTTP deadline.
      if (now() - started >= INBOUND_BATCH_WORK_MS) break;
    }
    return { kind: 'decision', bytes: encodeInboundBatchPages(pages) };
  } finally {
    for (const item of [...requests, ...pages]) item.fill(0);
  }
}
