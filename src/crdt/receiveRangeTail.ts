/** One bounded unverified original. This is transport ownership, never proof or native progress. */
import { decodeInboundPage, decodeInboundRequest } from '../../account-protocol/inboundTransport';
import { READ_REQUEST_LIMIT } from '../../account-protocol/deliveryTransport';
import type { Bytes } from './custodyCrypto';
import { MAX_PENDING_BYTES } from './admissionQueue';
import { RECEIVE_SINGLE_PAGE_BYTES } from './receivePrefetch';
type Tail = {
  request: Bytes;
  page: Bytes;
  publisher: string;
  after: number;
  expires: number;
  context: object;
  signal: AbortSignal;
  abort(): void;
};
export function createReceiveRangeTail(signal: AbortSignal, now: () => number = Date.now) {
  let held: Tail | undefined,
    closed = false,
    clock: number | undefined;
  const clear = () => {
    const value = held;
    held = undefined;
    if (!value) return;
    value.signal.removeEventListener('abort', value.abort);
    value.request.fill(0);
    value.page.fill(0);
  };
  const observe = () => {
    const at = now(),
      valid = Number.isSafeInteger(at) && at >= 0 && (clock === undefined || at >= clock);
    clock = Number.isSafeInteger(at) ? at : undefined;
    if (!valid || (held && held.expires <= at)) clear();
    return valid ? at : undefined;
  };
  const close = () => {
    closed = true;
    clear();
  };
  signal.addEventListener('abort', close, { once: true });
  if (signal.aborted) close();
  return Object.freeze({
    remember(
      request: Bytes,
      page: Bytes,
      basis: { context: object; signal: AbortSignal; after: number },
    ) {
      const at = observe();
      if (
        closed ||
        basis.signal.aborted ||
        at === undefined ||
        !request.length ||
        request.length > READ_REQUEST_LIMIT ||
        !page.length ||
        request.length + page.length + 8 > RECEIVE_SINGLE_PAGE_BYTES
      )
        return false;
      const originalRequest = request.slice(),
        originalPage = page.slice();
      let transferred = false;
      try {
        const r = decodeInboundRequest(originalRequest),
          p = decodeInboundPage(originalPage);
        if (
          r.limit < 2 ||
          !Number.isSafeInteger(basis.after) ||
          basis.after <= r.after ||
          basis.after >= r.after + p.entries.length ||
          r.expires <= at ||
          r.expires > at + 60000
        )
          return false;
        const value: Tail = {
          request: originalRequest,
          page: originalPage,
          publisher: r.publisher,
          after: basis.after,
          expires: r.expires,
          context: basis.context,
          signal: basis.signal,
          abort: () => {
            if (held === value) clear();
          },
        };
        clear();
        held = value;
        basis.signal.addEventListener('abort', value.abort, { once: true });
        if (basis.signal.aborted || signal.aborted) {
          clear();
          return false;
        }
        transferred = true;
        return true;
      } catch {
        return false;
      } finally {
        if (!transferred) {
          originalRequest.fill(0);
          originalPage.fill(0);
        }
      }
    },
    take(context: object, publisher: string, after: number) {
      if (observe() === undefined || closed || !held) return;
      if (held.context !== context || held.signal.aborted) {
        clear();
        return;
      }
      if (held.publisher !== publisher) return;
      if (held.after !== after) {
        clear();
        return;
      }
      const value = held;
      held = undefined;
      value.signal.removeEventListener('abort', value.abort);
      // Transfer the raw originals; do not copy or return a decoded/verified permission.
      return { request: value.request, page: value.page };
    },
    beforeFetch(requests: number) {
      observe();
      // One held original plus one full single-page reservation fits the existing collection cap.
      // Legacy multi-request aggregation/prefetch uses its entire old reservation, so evict first.
      if (
        requests !== 1 ||
        (held &&
          held.request.length + held.page.length + 8 + RECEIVE_SINGLE_PAGE_BYTES + 4 >
            MAX_PENDING_BYTES)
      )
        clear();
    },
    drop(publisher?: string) {
      if (publisher === undefined || held?.publisher === publisher) clear();
    },
    get bytes() {
      return held ? held.request.length + held.page.length + 8 : 0;
    },
    close,
  });
}
