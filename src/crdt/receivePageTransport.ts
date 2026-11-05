import type { Bytes } from './custodyCrypto';
import { collectReceivePages, RECEIVE_SINGLE_PAGE_BYTES } from './receivePrefetch';
import { MAX_PENDING_BYTES } from './admissionQueue';
import { RECEIVE_GROUP_LIMIT } from './receiveGroup';
import { PRIVATE_DELIVERY_TIMEOUT_MS } from '../account/privateDeliveryHttp';
import { READ_REQUEST_LIMIT, READ_COUNT_LIMIT } from '../../account-protocol/deliveryTransport';
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
  const oversized = new Set<string>(),
    singleEntry = new Set<string>();
  const remember = (hints: Set<string>, publisher: string) => {
    if (!/^[0-9a-f]{32}$/.test(publisher)) throw Error('Invalid receive publisher hint');
    if (!hints.has(publisher) && hints.size >= MAX_SIZE_HINTS)
      hints.delete(hints.values().next().value!);
    hints.add(publisher);
  };
  let available = true,
    active = false;
  const readPages = async (
    requests: readonly Bytes[],
    signal: AbortSignal,
    io: ReceivePageIO,
    more: (page: Bytes) => boolean,
    publisher?: string,
    collection?: { primaryCount: number; maxBytes: number },
  ): Promise<{ pages: Bytes[]; attempted: number; quietPages?: Bytes[] }> => {
    if (active) throw Error('Overlapping receive transport');
    const primaryCount = collection?.primaryCount ?? requests.length,
      maxBytes = collection?.maxBytes ?? MAX_PENDING_BYTES;
    if (
      (publisher !== undefined &&
        (typeof publisher !== 'string' || !/^[0-9a-f]{32}$/.test(publisher))) ||
      !requests.length ||
      requests.length > RECEIVE_GROUP_LIMIT ||
      !Number.isInteger(primaryCount) ||
      primaryCount < 1 ||
      primaryCount > requests.length ||
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < RECEIVE_SINGLE_PAGE_BYTES + 4 ||
      maxBytes > MAX_PENDING_BYTES ||
      requests.some((r) => !(r instanceof Uint8Array) || !r.length || r.length > READ_REQUEST_LIMIT)
    )
      throw Error('Invalid receive requests');
    const captured = requests.map((r) => new Uint8Array(r)),
      stopped = AbortSignal.any([signal, AbortSignal.timeout(PRIVATE_DELIVERY_TIMEOUT_MS)]);
    let body: Bytes | undefined,
      reply: Bytes | null = null,
      decoded: Bytes[] = [],
      pages: Bytes[] = [],
      quietPages: Bytes[] = [],
      complete = false;
    active = true;
    try {
      stopped.throwIfAborted();
      const individual = () =>
        collectReceivePages(
          primaryCount,
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
          undefined,
          maxBytes,
        );
      if (
        !available ||
        (publisher !== undefined && oversized.has(publisher)) ||
        captured.length === 1 ||
        BATCH_COUNT < 2
      )
        return await individual();
      const count = Math.min(captured.length, BATCH_COUNT),
        limit = Math.min(BATCH_LIMIT, maxBytes);
      body = encodeInboundBatch(captured.slice(0, count));
      let unsupported = false;
      // Only an absent route or an aggregate HTTP byte limit selects individual reads.
      // The callback schedules no I/O: fallback waits for cancellation/drain to settle
      // and shares the original logical deadline. Invalid individual evidence still refuses.
      reply = await io.batch(body, stopped, limit, async (reason) => {
        if (reason === 'aggregate-limit' && publisher !== undefined) {
          remember(oversized, publisher);
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
        decoded.reduce((n, p) => n + p.length + 4, 0) > maxBytes
      )
        throw Error('Invalid receive batch pages');
      for (const page of decoded.slice(0, primaryCount)) {
        pages.push(page);
        // Unverified hints can shorten collection, never authorize it or advance a cursor.
        if (!more(page)) break;
      }
      // Extra publishers remain unverified originals, and never extend the primary
      // prefix or its logical progress. They will re-enter at their own selector turn.
      quietPages = decoded.slice(primaryCount);
      stopped.throwIfAborted();
      complete = true;
      return { pages, attempted: pages.length, ...(collection ? { quietPages } : {}) };
    } finally {
      body?.fill(0);
      reply?.fill(0);
      for (const r of captured) r.fill(0);
      for (const p of decoded)
        if (!complete || (!pages.includes(p) && !quietPages.includes(p))) p.fill(0);
      active = false;
    }
  };
  return Object.assign(readPages, {
    /** Scheduling only: a smaller fresh signed request still needs the whole verifier. */
    entryLimit(publisher: string) {
      if (!/^[0-9a-f]{32}$/.test(publisher)) throw Error('Invalid receive publisher hint');
      return singleEntry.has(publisher) ? 1 : READ_COUNT_LIMIT;
    },
    narrow(publisher: string) {
      remember(singleEntry, publisher);
    },
  });
}
