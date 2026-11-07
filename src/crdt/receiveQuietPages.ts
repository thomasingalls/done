import { receiveOriginalsFit, RECEIVE_ORIGINALS_MAX_ENTRIES } from './receiveOriginalsBudget';
/** Bounded unverified originals. Consumption never grants authority or advances selection. */
import { decodeInboundRequest } from '../../account-protocol/inboundTransport';
import { READ_REQUEST_LIMIT } from '../../account-protocol/deliveryTransport';
import { MAX_PENDING_BYTES } from './admissionQueue';
import type { Bytes } from './custodyCrypto';
import type { InboundReadCursor } from './inboundLedger';
import { RECEIVE_SINGLE_PAGE_BYTES } from './receivePrefetch';
import {
  RECEIVE_QUIET_MS,
  quietReceiveBasis,
  sameQuietReceiveCursor,
  type QuietReceiveBasis,
} from './receiveSelection';

const MAX_ENTRIES = RECEIVE_ORIGINALS_MAX_ENTRIES;
const MAX_ATTEMPTS = 128;
type Held = QuietReceiveBasis & {
  request: Bytes;
  page: Bytes;
  scheduling: object;
  startedAt: number;
  expires: number;
  signal: AbortSignal;
  abort(): void;
};
type Captured = QuietReceiveBasis & Pick<QuietPageCapture, 'scheduling' | 'startedAt' | 'signal'>;
export type QuietPageCapture = {
  context: object;
  publisher: string;
  cursor: InboundReadCursor;
  scheduling: object;
  startedAt: number;
  signal: AbortSignal;
};

/** One slot owner; no page registry, persistence, parsed-page alias or proof cache. */
export function createReceiveQuietPages(signal: AbortSignal, now: () => number = Date.now) {
  const held = new Map<string, Held>();
  const attempted = new Map<string, number>();
  let captures = new WeakMap<object, Captured>();
  let context: object | undefined, lastClock: number | undefined;
  let closed = false;
  const size = (h: Held) => h.request.length + h.page.length + 8;
  const bytes = () => [...held.values()].reduce((n, h) => n + size(h), 0);
  const drop = (publisher: string) => {
    const h = held.get(publisher);
    if (!h) return;
    held.delete(publisher);
    h.signal.removeEventListener('abort', h.abort);
    h.request.fill(0);
    h.page.fill(0);
  };
  const clear = () => {
    for (const id of held.keys()) drop(id);
    attempted.clear();
    captures = new WeakMap();
    context = undefined;
  };
  const clock = () => {
    const at = now();
    const valid =
      Number.isSafeInteger(at) && at >= 0 && (lastClock === undefined || at >= lastClock);
    if (!valid) clear();
    lastClock = Number.isSafeInteger(at) ? at : undefined;
    if (valid)
      for (const [id, h] of held)
        if (
          h.signal.aborted ||
          at < h.startedAt ||
          at - h.startedAt >= RECEIVE_QUIET_MS ||
          at >= h.expires
        )
          drop(id);
    return valid && !closed ? at : undefined;
  };
  const bind = (ownerContext: object) => {
    if (context !== ownerContext) {
      clear();
      context = ownerContext;
    }
  };
  const close = () => {
    closed = true;
    clear();
    signal.removeEventListener('abort', close);
  };
  signal.addEventListener('abort', close, { once: true });
  if (signal.aborted) close();
  return Object.freeze({
    /** Suppress only speculative duplicate work, never a native publisher turn. */
    wanted(ownerContext: object, publisher: string, cursor: InboundReadCursor) {
      const at = clock();
      if (at === undefined || !quietReceiveBasis(ownerContext, publisher, cursor)) return false;
      bind(ownerContext);
      const h = held.get(publisher);
      if (h && sameQuietReceiveCursor(h, cursor)) return false;
      if (h) drop(publisher);
      const previous = attempted.get(publisher);
      if (previous !== undefined && at - previous < RECEIVE_QUIET_MS) return false;
      attempted.delete(publisher);
      if (attempted.size >= MAX_ATTEMPTS) attempted.delete(attempted.keys().next().value!);
      attempted.set(publisher, at);
      return true;
    },
    capture(capture: QuietPageCapture): object | undefined {
      const at = clock();
      if (at === undefined || capture.signal.aborted) return undefined;
      bind(capture.context);
      const basis = quietReceiveBasis(capture.context, capture.publisher, capture.cursor);
      if (
        !basis ||
        !Number.isSafeInteger(capture.startedAt) ||
        capture.startedAt < 0 ||
        at < capture.startedAt ||
        at - capture.startedAt >= RECEIVE_QUIET_MS
      )
        return undefined;
      const token = {};
      captures.set(token, {
        ...basis,
        scheduling: capture.scheduling,
        startedAt: capture.startedAt,
        signal: capture.signal,
      });
      return token;
    },
    remember(request: Bytes, page: Bytes, token: object | undefined) {
      const at = clock();
      const capture = token && captures.get(token);
      if (token) captures.delete(token);
      if (
        at === undefined ||
        !capture ||
        capture.context !== context ||
        capture.signal.aborted ||
        at < capture.startedAt ||
        at - capture.startedAt >= RECEIVE_QUIET_MS ||
        !request.length ||
        request.length > READ_REQUEST_LIMIT ||
        !page.length ||
        page.length > RECEIVE_SINGLE_PAGE_BYTES ||
        request.length + page.length + 8 > MAX_PENDING_BYTES
      )
        return false;
      const r = decodeInboundRequest(request);
      if (
        r.publisher !== capture.publisher ||
        r.after !== capture.position ||
        r.limit !== 1 ||
        r.expires <= at
      )
        return false;
      drop(capture.publisher);
      const needed = request.length + page.length + 8;
      while (held.size >= MAX_ENTRIES || bytes() + needed > MAX_PENDING_BYTES)
        drop(held.keys().next().value!);
      const h: Held = {
        ...capture,
        request: request.slice(),
        page: page.slice(),
        scheduling: capture.scheduling,
        startedAt: capture.startedAt,
        expires: r.expires,
        signal: capture.signal,
        abort: () => {
          if (held.get(capture.publisher) === h) drop(capture.publisher);
        },
      };
      held.set(capture.publisher, h);
      h.signal.addEventListener('abort', h.abort, { once: true });
      if (h.signal.aborted || signal.aborted) {
        drop(capture.publisher);
        return false;
      }
      return true;
    },
    take(ownerContext: object, publisher: string, cursor: InboundReadCursor) {
      if (clock() === undefined) return;
      bind(ownerContext);
      const h = held.get(publisher);
      if (!h) return;
      if (!sameQuietReceiveCursor(h, cursor)) {
        drop(publisher);
        return;
      }
      held.delete(publisher);
      h.signal.removeEventListener('abort', h.abort);
      // Transfer exact original bytes. The fresh native verifier must still consume them.
      return { request: h.request, page: h.page, scheduling: h.scheduling };
    },
    /** Reserve before I/O. Cache + next response share the existing admission byte cap. */
    reserve(
      minimum: number,
      other: { entries: number; positions: number } = { entries: 0, positions: 0 },
    ) {
      if (!Number.isSafeInteger(minimum) || minimum < 0 || minimum > MAX_PENDING_BYTES)
        throw Error('Invalid quiet receive reservation');
      const reservation = { ...other, bytes: minimum };
      if (!receiveOriginalsFit(reservation)) throw Error('Invalid quiet receive reservation');
      clock();
      while (
        !receiveOriginalsFit(reservation, {
          bytes: bytes(),
          entries: held.size,
          positions: held.size,
        })
      )
        drop(held.keys().next().value!);
      return MAX_PENDING_BYTES - bytes();
    },
    drop() {
      clear();
      lastClock = undefined;
    },
    get bytes() {
      clock();
      return bytes();
    },
    get entries() {
      clock();
      return held.size;
    },
    close,
  });
}
