import type { Bytes } from './custodyCrypto';
import { INBOUND_ENVELOPE_LIMIT } from './inboundRecord';
import { RESPONSE_LIMIT } from '../../account-protocol/positionDecision';
import { MAX_PENDING_BYTES } from './admissionQueue';
import { RECEIVE_GROUP_LIMIT, RECEIVE_COLLECT_MS } from './receiveGroup';

export const RECEIVE_PREFETCH_LIMIT = 2;
// One supported envelope and proof encoded as hex; 512 covers the fixed v2 frame,
// request digest, signature and two maximum safe integers. Wider historical codec
// bounds do not expand the current receiver's supported envelope profile.
export const RECEIVE_SINGLE_PAGE_BYTES = 2 * (INBOUND_ENVELOPE_LIMIT + RESPONSE_LIMIT) + 512;

/** Collect only an ordered prefix. Fetching grants no authority or durable progress.
 * The owner must await this entire operation (including cancellation drain). */
export async function collectReceivePages(
  count: number,
  signal: AbortSignal,
  read: (index: number, signal: AbortSignal, limit: number) => Promise<Bytes | null>,
  more: (page: Bytes) => boolean,
  now: () => number = () => performance.now(),
): Promise<{ pages: Bytes[]; attempted: number }> {
  if (!Number.isInteger(count) || count < 1 || count > RECEIVE_GROUP_LIMIT)
    throw Error('Invalid receive prefetch count');
  const stop = new AbortController(),
    stopped = AbortSignal.any([signal, stop.signal]),
    pages: Bytes[] = [],
    slots: { work: Promise<void>; page: Bytes | null; failed: boolean; error?: unknown }[] = [];
  const began = now();
  let held = 0,
    attempted = 0,
    complete = false;
  const fill = (cursor: number) => {
    while (
      slots.length < count &&
      slots.length < cursor + RECEIVE_PREFETCH_LIMIT &&
      now() - began < RECEIVE_COLLECT_MS &&
      held + RECEIVE_SINGLE_PAGE_BYTES + 4 <= MAX_PENDING_BYTES
    ) {
      stopped.throwIfAborted();
      const index = slots.length,
        slot = {
          work: Promise.resolve(),
          page: null as Bytes | null,
          failed: false,
          error: undefined as unknown,
        };
      slots.push(slot);
      held += RECEIVE_SINGLE_PAGE_BYTES + 4;
      // Reflect every rejection immediately; out-of-order failures must not escape the drain.
      slot.work = Promise.resolve()
        .then(async () => {
          stopped.throwIfAborted();
          slot.page = await read(index, stopped, RECEIVE_SINGLE_PAGE_BYTES);
          if (slot.page && slot.page.length > RECEIVE_SINGLE_PAGE_BYTES)
            throw Error('Receive transport exceeded its reservation');
        })
        .catch((error: unknown) => {
          slot.failed = true;
          slot.error = error;
        })
        .finally(() => {
          held -= RECEIVE_SINGLE_PAGE_BYTES + 4;
          if (slot.page) held += slot.page.length + 4;
        });
    }
  };
  try {
    for (let cursor = 0; cursor < count; cursor++) {
      fill(cursor);
      const slot = slots[cursor];
      if (!slot) break; // Time or space cut: the unrequested tail is refetched next turn.
      await slot.work;
      stopped.throwIfAborted();
      attempted = cursor + 1;
      if (slot.failed) throw slot.error;
      if (!slot.page) break;
      pages.push(slot.page);
      if (!more(slot.page)) break;
    }
    stopped.throwIfAborted();
    complete = true;
    return { pages, attempted };
  } finally {
    stop.abort();
    await Promise.all(slots.map((slot) => slot.work));
    for (const slot of slots)
      if (slot.page && (!complete || signal.aborted || !pages.includes(slot.page)))
        slot.page.fill(0);
    signal.throwIfAborted();
  }
}
