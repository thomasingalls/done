import { expect, it } from 'vitest';
import { collectReceivePages, RECEIVE_SINGLE_PAGE_BYTES } from '../src/crdt/receivePrefetch';
import { RECEIVE_COLLECT_MS } from '../src/crdt/receiveGroup';
import { MAX_PENDING_BYTES } from '../src/crdt/admissionQueue';
import { INBOUND_ENVELOPE_LIMIT } from '../src/crdt/inboundRecord';
import { RESPONSE_LIMIT } from '../account-protocol/positionDecision';
import { encodeInboundPage } from '../account-protocol/inboundTransport';
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { resolve, promise };
};
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const bytes = (n: number) => new Uint8Array([n]);
const signal = () => new AbortController().signal;

it('reserves enough for the largest supported canonical single-entry page', () => {
  const page = encodeInboundPage({
    request: 'ff'.repeat(32),
    signature: 'ff'.repeat(64),
    through: Number.MAX_SAFE_INTEGER,
    next: Number.MAX_SAFE_INTEGER,
    entries: [
      { envelope: new Uint8Array(INBOUND_ENVELOPE_LIMIT), proof: new Uint8Array(RESPONSE_LIMIT) },
    ],
  });
  expect(page.length).toBeLessThanOrEqual(RECEIVE_SINGLE_PAGE_BYTES);
  expect(2 * (RECEIVE_SINGLE_PAGE_BYTES + 4)).toBeLessThan(MAX_PENDING_BYTES);
});
it('starts two, buffers inverted replies, and returns exact bytes in cursor order', async () => {
  const replies = Array.from({ length: 4 }, () => deferred<Uint8Array<ArrayBuffer> | null>());
  const started: number[] = [],
    pages = [bytes(1), bytes(2), bytes(3), bytes(4)];
  const work = collectReceivePages(
    4,
    signal(),
    async (i) => {
      started.push(i);
      return replies[i]!.promise;
    },
    () => true,
  );
  await tick();
  expect(started).toEqual([0, 1]);
  replies[1]!.resolve(pages[1]!);
  await tick();
  expect(started).toEqual([0, 1]);
  replies[0]!.resolve(pages[0]!);
  await tick();
  expect(started).toEqual([0, 1, 2, 3]);
  replies[3]!.resolve(pages[3]!);
  replies[2]!.resolve(pages[2]!);
  const out = await work;
  expect(out.attempted).toBe(4);
  expect(out.pages).toEqual(pages);
  out.pages.forEach((page, i) => expect(page).toBe(pages[i]));
});
it.each([0, 1])(
  'never bridges missing reply %i; aborts and drains the tail and erases late bytes',
  async (missing) => {
    const late = bytes(9),
      release = deferred<void>(),
      reached = deferred<void>();
    let aborted = false,
      settled = false;
    const work = collectReceivePages(
      4,
      signal(),
      async (i, stop) => {
        if (i < missing) return bytes(i + 1);
        if (i === missing) {
          await tick();
          return null;
        }
        stop.addEventListener(
          'abort',
          () => {
            aborted = true;
            reached.resolve();
          },
          { once: true },
        );
        await release.promise;
        return late;
      },
      () => true,
    ).then((out) => {
      settled = true;
      return out;
    });
    await reached.promise;
    expect(aborted).toBe(true);
    expect(settled).toBe(false);
    release.resolve();
    const out = await work;
    expect(out.pages.length).toBe(missing);
    expect(out.attempted).toBe(missing + 1);
    expect(late).toEqual(bytes(0));
  },
);
it('external close drains already-launched work and erases every reply before rejecting', async () => {
  const stop = new AbortController(),
    release = deferred<void>(),
    late = [bytes(1), bytes(2)];
  let settled = false;
  const work = collectReceivePages(
    4,
    stop.signal,
    async (i) => {
      await release.promise;
      return late[i]!;
    },
    () => true,
  ).catch((e) => {
    settled = true;
    throw e;
  });
  const outcome = expect(work).rejects.toThrow();
  await tick();
  stop.abort();
  await tick();
  expect(settled).toBe(false);
  release.resolve();
  await outcome;
  expect(late).toEqual([bytes(0), bytes(0)]);
});
it('observes a thrown late request only in prefix order and erases the uncommitted prefix', async () => {
  const release = deferred<void>(),
    page = bytes(1);
  let settled = false;
  const work = collectReceivePages(
    2,
    signal(),
    async (i) => {
      if (i) throw Error('transport');
      await release.promise;
      return page;
    },
    () => true,
  ).finally(() => {
    settled = true;
  });
  const outcome = expect(work).rejects.toThrow('transport');
  await tick();
  expect(settled).toBe(false);
  release.resolve();
  await outcome;
  expect(page).toEqual(bytes(0));
});
it('after the launch window, retains only replies already in flight', async () => {
  let time = 0;
  const started: number[] = [];
  const out = await collectReceivePages(
    4,
    signal(),
    async (i) => {
      started.push(i);
      time = RECEIVE_COLLECT_MS;
      return bytes(i + 1);
    },
    () => true,
    () => time,
  );
  expect(started).toEqual([0, 1]);
  expect(out.pages).toEqual([bytes(1), bytes(2)]);
});
it('reserves full-page space before launch, including retained and out-of-order replies', async () => {
  const started: number[] = [];
  const out = await collectReceivePages(
    4,
    signal(),
    async (i) => {
      started.push(i);
      return new Uint8Array(RECEIVE_SINGLE_PAGE_BYTES).fill(i + 1);
    },
    () => true,
  );
  expect(started).toEqual([0, 1, 2]);
  expect(out.pages.reduce((n, page) => n + page.length + 4, 0)).toBeLessThanOrEqual(
    MAX_PENDING_BYTES,
  );
});
it('a terminal or malformed hint stops collection and erases speculative replies', async () => {
  const tail = bytes(2);
  const out = await collectReceivePages(
    4,
    signal(),
    async (i) => (i ? tail : bytes(1)),
    () => false,
  );
  expect(out.attempted).toBe(1);
  expect(out.pages).toEqual([bytes(1)]);
  expect(tail).toEqual(bytes(0));
});
it('a singleton starts exactly one read, and an already closed owner starts none', async () => {
  let reads = 0;
  const read = async () => {
    reads++;
    return bytes(1);
  };
  expect((await collectReceivePages(1, signal(), read, () => true)).pages).toHaveLength(1);
  const stop = new AbortController();
  stop.abort();
  await expect(collectReceivePages(4, stop.signal, read, () => true)).rejects.toThrow();
  expect(reads).toBe(1);
});
