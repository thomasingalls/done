import type { Bytes } from './custodyCrypto';
import { collectReceivePages, RECEIVE_SINGLE_PAGE_BYTES } from './receivePrefetch';
import { MAX_PENDING_BYTES } from './admissionQueue';
import { RECEIVE_GROUP_LIMIT } from './receiveGroup';
import { PRIVATE_DELIVERY_TIMEOUT_MS } from '../account/privateDeliveryHttp';
import { READ_REQUEST_LIMIT } from '../../account-protocol/deliveryTransport';
import {
  INBOUND_BATCH_COUNT,
  INBOUND_BATCH_PAGE_LIMIT,
  encodeInboundBatch,
  decodeInboundBatchPages,
} from '../../account-protocol/inboundBatch';

// Reserve the complete bounded aggregate before launch. If the HTTP adapter cannot fit
// it, drain that response and use the existing full-single-page reservations instead.
const BATCH_LIMIT = Math.min(INBOUND_BATCH_PAGE_LIMIT, MAX_PENDING_BYTES);
const BATCH_COUNT = Math.min(INBOUND_BATCH_COUNT, RECEIVE_GROUP_LIMIT);
// Scheduling hints only. Eviction permits safe re-probing; it never disables another publisher.
const MAX_SIZE_HINTS = 128;

export interface ReceivePageIO {
  read(request: Bytes, index: number, signal: AbortSignal, limit: number): Promise<Bytes | null>;
  batch(
    body: Bytes,
    signal: AbortSignal,
    limit: number,
    individual: (reason?: 'aggregate-limit') => Promise<Bytes | null>,
  ): Promise<Bytes | null>;
}

/** Transport only. Every returned original page still needs the receive owner's verifier. */
export function createReceivePageTransport() {
  const oversized = new Set<string>();
  let available = true,
    active = false;
  return async (
    requests: readonly Bytes[],
    signal: AbortSignal,
    io: ReceivePageIO,
    more: (page: Bytes) => boolean,
    publisher?: string,
  ): Promise<{ pages: Bytes[]; attempted: number }> => {
    if (active) throw Error('Overlapping receive transport');
    if (
      (publisher !== undefined &&
        (typeof publisher !== 'string' || !/^[0-9a-f]{32}$/.test(publisher))) ||
      !requests.length ||
      requests.length > RECEIVE_GROUP_LIMIT ||
      requests.some((r) => !(r instanceof Uint8Array) || !r.length || r.length > READ_REQUEST_LIMIT)
    )
      throw Error('Invalid receive requests');
    const captured = requests.map((r) => new Uint8Array(r)),
      stopped = AbortSignal.any([signal, AbortSignal.timeout(PRIVATE_DELIVERY_TIMEOUT_MS)]);
    let body: Bytes | undefined,
      reply: Bytes | null = null,
      decoded: Bytes[] = [],
      pages: Bytes[] = [],
      complete = false;
    active = true;
    try {
      stopped.throwIfAborted();
      const individual = () =>
        collectReceivePages(
          captured.length,
          stopped,
          async (i, stop, limit) => {
            const outgoing = new Uint8Array(captured[i]!);
            try {
              return await io.read(outgoing, i, stop, limit);
            } finally {
              outgoing.fill(0);
            }
          },
          more,
        );
      if (
        !available ||
        (publisher !== undefined && oversized.has(publisher)) ||
        captured.length === 1 ||
        BATCH_COUNT < 2
      )
        return await individual();
      const count = Math.min(captured.length, BATCH_COUNT),
        limit = BATCH_LIMIT;
      body = encodeInboundBatch(captured.slice(0, count));
      let unsupported = false;
      // Only an absent route or an aggregate HTTP byte limit selects individual reads.
      // The callback schedules no I/O: fallback waits for cancellation/drain to settle
      // and shares the original logical deadline. Invalid individual evidence still refuses.
      reply = await io.batch(body, stopped, limit, async (reason) => {
        if (reason === 'aggregate-limit' && publisher !== undefined) {
          if (!oversized.has(publisher) && oversized.size >= MAX_SIZE_HINTS)
            oversized.delete(oversized.values().next().value!);
          oversized.add(publisher);
        } else available = false;
        unsupported = true;
        return null;
      });
      stopped.throwIfAborted();
      if (unsupported) return await individual();
      if (!reply) return { pages: [], attempted: 1 };
      if (reply.length > limit) throw Error('Receive batch exceeded its reservation');
      decoded = decodeInboundBatchPages(reply);
      if (
        decoded.length > count ||
        decoded.some((p) => p.length > RECEIVE_SINGLE_PAGE_BYTES) ||
        decoded.reduce((n, p) => n + p.length + 4, 0) > MAX_PENDING_BYTES
      )
        throw Error('Invalid receive batch pages');
      for (const page of decoded) {
        pages.push(page);
        // Unverified hints can shorten collection, never authorize it or advance a cursor.
        if (!more(page)) break;
      }
      stopped.throwIfAborted();
      complete = true;
      return { pages, attempted: pages.length };
    } finally {
      body?.fill(0);
      reply?.fill(0);
      for (const r of captured) r.fill(0);
      for (const p of decoded) if (!complete || !pages.includes(p)) p.fill(0);
      active = false;
    }
  };
}
