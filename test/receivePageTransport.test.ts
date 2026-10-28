// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { decodeInboundBatch, encodeInboundBatchPages } from '../account-protocol/inboundBatch';
import { createReceivePageTransport, type ReceivePageIO } from '../src/crdt/receivePageTransport';
import { RECEIVE_SINGLE_PAGE_BYTES } from '../src/crdt/receivePrefetch';
import { MAX_PENDING_BYTES } from '../src/crdt/admissionQueue';
import type { AuthorityPin } from '../account-protocol/authority';
import {
  privateDeliveryPost,
  PRIVATE_DELIVERY_TIMEOUT_MS,
} from '../src/account/privateDeliveryHttp';

const bytes = (n: number) => new Uint8Array([n]);
const requests = () => [bytes(1), bytes(2), bytes(3), bytes(4)];
const signal = () => new AbortController().signal;
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const io = (overrides: Partial<ReceivePageIO> = {}): ReceivePageIO => ({
  read: vi.fn(async (r) => bytes(r[0]! + 10)),
  batch: vi.fn(async (body) => {
    const captured = decodeInboundBatch(body);
    try {
      return encodeInboundBatchPages(captured.map((r) => bytes(r[0]! + 10)));
    } finally {
      captured.forEach((r) => r.fill(0));
    }
  }),
  ...overrides,
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('batches the complete four-page turn under a hard aggregate reservation', async () => {
  const transport = createReceivePageTransport(),
    api = io();
  const out = await transport(requests(), signal(), api, () => true);
  expect(api.batch).toHaveBeenCalledTimes(1);
  expect(api.read).not.toHaveBeenCalled();
  expect(out.pages).toEqual([bytes(11), bytes(12), bytes(13), bytes(14)]);
  expect(out.attempted).toBe(4);
  const [, , limit] = vi.mocked(api.batch).mock.calls[0]!;
  expect(limit).toBeGreaterThanOrEqual(3 * RECEIVE_SINGLE_PAGE_BYTES);
  expect(limit).toBeLessThanOrEqual(MAX_PENDING_BYTES);
  expect(4 * (RECEIVE_SINGLE_PAGE_BYTES + 4)).toBeGreaterThan(MAX_PENDING_BYTES);
});
it('keeps a singleton on the original transport with its existing single-page bound', async () => {
  const api = io(),
    input = requests().slice(0, 1);
  expect((await createReceivePageTransport()(input, signal(), api, () => true)).pages).toEqual([
    bytes(11),
  ]);
  expect(api.batch).not.toHaveBeenCalled();
  expect(api.read).toHaveBeenCalledTimes(1);
  expect(vi.mocked(api.read).mock.calls[0]![3]).toBe(RECEIVE_SINGLE_PAGE_BYTES);
});
it('returns the actual short prefix, then prepares a fresh batch without claiming the missing tail', async () => {
  const api = io({ batch: vi.fn(async () => encodeInboundBatchPages([bytes(11)])) });
  const transport = createReceivePageTransport();
  expect(await transport(requests(), signal(), api, () => true)).toEqual({
    pages: [bytes(11)],
    attempted: 1,
  });
  await transport(requests(), signal(), api, () => true);
  expect(api.batch).toHaveBeenCalledTimes(2);
});
it('only an absent optional route disables batching, and fallback captures originals before awaits', async () => {
  const input = requests();
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  const api = io({
    batch: vi.fn(async (_body, _stop, _limit, unsupported) => {
      await held;
      return unsupported();
    }),
  });
  const transport = createReceivePageTransport(),
    pending = transport(input, signal(), api, () => true);
  await tick();
  input.forEach((r) => r.fill(99));
  release();
  expect((await pending).pages).toEqual([bytes(11), bytes(12), bytes(13), bytes(14)]);
  await transport(requests(), signal(), api, () => true);
  expect(api.batch).toHaveBeenCalledTimes(1);
  const other = io();
  await createReceivePageTransport()(requests(), signal(), other, () => true);
  expect(other.batch).toHaveBeenCalledTimes(1);
});
it('does not select fallback for an ordinary refusal and still tries the optional route next turn', async () => {
  const api = io({ batch: vi.fn(async () => null) }),
    transport = createReceivePageTransport();
  expect(await transport(requests(), signal(), api, () => true)).toEqual({
    pages: [],
    attempted: 1,
  });
  await transport(requests(), signal(), api, () => true);
  expect(api.batch).toHaveBeenCalledTimes(2);
  expect(api.read).not.toHaveBeenCalled();
});
it('erases wire/body/request copies while transferring exact independent reply bytes', async () => {
  let wire!: Uint8Array<ArrayBuffer>, reply!: Uint8Array<ArrayBuffer>;
  const input = requests(),
    api = io({
      batch: vi.fn(async (body) => {
        wire = body;
        reply = encodeInboundBatchPages([bytes(11), bytes(12)]);
        return reply;
      }),
    });
  const out = await createReceivePageTransport()(input, signal(), api, () => true);
  expect(wire.every((b) => b === 0)).toBe(true);
  expect(reply.every((b) => b === 0)).toBe(true);
  expect(input).toEqual(requests());
  expect(out.pages).toEqual([bytes(11), bytes(12)]);
});
it.each(['truncated', 'trailing', 'extra', 'oversized'] as const)(
  'refuses %s batch framing without compatibility downgrade',
  async (kind) => {
    const api = io({
      batch: vi.fn(async () => {
        const good = encodeInboundBatchPages([bytes(11), bytes(12)]);
        return kind === 'truncated'
          ? good.slice(0, -1)
          : kind === 'trailing'
            ? new Uint8Array([...good, 0])
            : kind === 'extra'
              ? encodeInboundBatchPages([bytes(11), bytes(12), bytes(13), bytes(14)])
              : new Uint8Array(MAX_PENDING_BYTES + 1);
      }),
    });
    await expect(
      createReceivePageTransport()(
        kind === 'extra' ? requests().slice(0, 2) : requests(),
        signal(),
        api,
        () => true,
      ),
    ).rejects.toThrow();
    expect(api.read).not.toHaveBeenCalled();
  },
);
it('keeps the terminal page and drops every speculative tail without changing its bytes', async () => {
  const api = io();
  const out = await createReceivePageTransport()(
    requests(),
    signal(),
    api,
    (page) => page[0] !== 12,
  );
  expect(out).toEqual({ pages: [bytes(11), bytes(12)], attempted: 2 });
  expect(api.read).not.toHaveBeenCalled();
});
it('rejects a page larger than the supported single-entry reservation', async () => {
  const reply = encodeInboundBatchPages([new Uint8Array(RECEIVE_SINGLE_PAGE_BYTES + 1)]);
  const api = io({ batch: vi.fn(async () => reply) });
  await expect(
    createReceivePageTransport()(requests(), signal(), api, () => true),
  ).rejects.toThrow();
  expect(reply.every((b) => b === 0)).toBe(true);
});
it('drains a late batch after cancellation and erases it before rejecting', async () => {
  const stop = new AbortController();
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  const reply = encodeInboundBatchPages([bytes(11)]);
  let settled = false;
  const api = io({
    batch: vi.fn(async () => {
      await held;
      return reply;
    }),
  });
  const pending = createReceivePageTransport()(requests(), stop.signal, api, () => true).finally(
    () => {
      settled = true;
    },
  );
  const refused = expect(pending).rejects.toThrow();
  await tick();
  stop.abort();
  await tick();
  expect(settled).toBe(false);
  release();
  await refused;
  expect(reply.every((b) => b === 0)).toBe(true);
  expect(api.read).not.toHaveBeenCalled();
});
it('one logical deadline covers the optional probe and fallback instead of granting a second window', async () => {
  const deadline = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
  const api = io({
    batch: vi.fn(async (_body, _stop, _limit, unsupported) => {
      await unsupported();
      deadline.abort();
      return null;
    }),
  });
  await expect(
    createReceivePageTransport()(requests(), signal(), api, () => true),
  ).rejects.toThrow();
  expect(timeout).toHaveBeenCalledTimes(1);
  expect(timeout).toHaveBeenCalledWith(PRIVATE_DELIVERY_TIMEOUT_MS);
  expect(api.read).not.toHaveBeenCalled();
});
it('does not start work for a closed owner, invalid requests or overlapping calls', async () => {
  const stop = new AbortController();
  stop.abort();
  const api = io(),
    transport = createReceivePageTransport();
  await expect(transport(requests(), stop.signal, api, () => true)).rejects.toThrow();
  for (const input of [
    [],
    [new Uint8Array(0)],
    Array.from({ length: 5 }, () => bytes(1)),
    [new Uint8Array(4097)],
  ])
    await expect(transport(input, signal(), api, () => true)).rejects.toThrow();
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  const blocked = io({
    batch: vi.fn(async () => {
      await held;
      return null;
    }),
  });
  const pending = transport(requests(), signal(), blocked, () => true);
  await tick();
  await expect(transport(requests(), signal(), blocked, () => true)).rejects.toThrow('Overlapping');
  release();
  await pending;
  expect(api.read).not.toHaveBeenCalled();
  expect(api.batch).not.toHaveBeenCalled();
});

it('waits for aggregate cancellation before any individual fallback and remembers the downgrade', async () => {
  let release!: () => void;
  const drain = new Promise<void>((r) => {
    release = r;
  });
  const api = io({
    batch: vi.fn(async (_body, _stop, _limit, individual) => {
      await individual();
      await drain;
      return null;
    }),
  });
  const transport = createReceivePageTransport(),
    pending = transport(requests(), signal(), api, () => true);
  await tick();
  expect(api.read).not.toHaveBeenCalled();
  release();
  expect((await pending).pages).toEqual([bytes(11), bytes(12), bytes(13), bytes(14)]);
  await transport(requests(), signal(), api, () => true);
  expect(api.batch).toHaveBeenCalledTimes(1);
});

it('only successful bounded binary aggregates select overflow work; malformed declarations and refusals do not', async () => {
  const headers = { 'Content-Type': 'application/octet-stream' },
    pin = { origin: 'http://127.0.0.1:12345' } as AuthorityPin;
  for (const mode of ['declared', 'stream', 'hint', 'malformed', 'denied', 'single'] as const) {
    const overflow = vi.fn();
    vi.stubGlobal('fetch', async () =>
      mode === 'stream'
        ? new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(new Uint8Array(17));
              },
              cancel() {},
            }),
            { headers },
          )
        : new Response(new Uint8Array([1]), {
            status: mode === 'hint' ? 409 : mode === 'denied' ? 403 : 200,
            headers: {
              'Content-Type': mode === 'hint' ? 'application/json' : 'application/octet-stream',
              'Content-Length': mode === 'malformed' ? 'wrong' : mode === 'hint' ? '513' : '17',
            },
          }),
    );
    expect(
      await privateDeliveryPost(
        pin,
        'A'.repeat(43),
        mode === 'single' ? 'read-v2' : 'read-v2-batch',
        bytes(1),
        16,
        signal(),
        undefined,
        false,
        undefined,
        overflow,
      ),
    ).toBeNull();
    expect(overflow).toHaveBeenCalledTimes(mode === 'declared' || mode === 'stream' ? 1 : 0);
  }
});

const publisherId = (n: number) => n.toString(16).padStart(32, '0');
it.each([false, true])(
  'keeps a large publisher fallback separate from a small publisher, small first=%s',
  async (smallFirst) => {
    const transport = createReceivePageTransport();
    const large = io({
      batch: vi.fn(async (_body, _stop, _limit, fallback) => fallback('aggregate-limit')),
    });
    const small = io();
    if (smallFirst) await transport(requests(), signal(), small, () => true, publisherId(2));
    expect(
      (await transport(requests(), signal(), large, () => true, publisherId(1))).pages,
    ).toEqual([bytes(11), bytes(12), bytes(13), bytes(14)]);
    expect(
      (await transport(requests(), signal(), small, () => true, publisherId(2))).pages,
    ).toEqual([bytes(11), bytes(12), bytes(13), bytes(14)]);
    await transport(requests(), signal(), large, () => true, publisherId(1));
    expect(large.batch).toHaveBeenCalledTimes(1);
    expect(large.read).toHaveBeenCalledTimes(8);
    expect(small.batch).toHaveBeenCalledTimes(smallFirst ? 2 : 1);
    expect(small.read).not.toHaveBeenCalled();
  },
);
it('an absent endpoint disables every explicitly scoped publisher for this owner only', async () => {
  const transport = createReceivePageTransport();
  const missing = io({ batch: vi.fn(async (_body, _stop, _limit, fallback) => fallback()) });
  await transport(requests(), signal(), missing, () => true, publisherId(1));
  const other = io();
  await transport(requests(), signal(), other, () => true, publisherId(2));
  expect(other.batch).not.toHaveBeenCalled();
  expect(other.read).toHaveBeenCalledTimes(4);
  const fresh = io();
  await createReceivePageTransport()(requests(), signal(), fresh, () => true, publisherId(2));
  expect(fresh.batch).toHaveBeenCalledTimes(1);
});
it('keeps size-hint memory bounded by safe re-probing instead of downgrading an unrelated publisher', async () => {
  const transport = createReceivePageTransport();
  const large = io({
    batch: vi.fn(async (_body, _stop, _limit, fallback) => fallback('aggregate-limit')),
  });
  for (let n = 1; n <= 129; n++)
    await transport(requests(), signal(), large, () => true, publisherId(n));
  expect(large.batch).toHaveBeenCalledTimes(129);
  await transport(requests(), signal(), large, () => true, publisherId(129));
  expect(large.batch).toHaveBeenCalledTimes(129);
  await transport(requests(), signal(), large, () => true, publisherId(1));
  expect(large.batch).toHaveBeenCalledTimes(130);
  const small = io();
  await transport(requests(), signal(), small, () => true, publisherId(130));
  expect(small.batch).toHaveBeenCalledTimes(1);
  expect(small.read).not.toHaveBeenCalled();
});
it.each([false, true])(
  'a scoped size fallback drains before original individual work, aborted=%s',
  async (aborted) => {
    const transport = createReceivePageTransport();
    const stop = new AbortController();
    let release!: () => void;
    const held = new Promise<void>((r) => {
      release = r;
    });
    const api = io({
      batch: vi.fn(async (_body, _signal, _limit, fallback) => {
        await fallback('aggregate-limit');
        await held;
        return null;
      }),
    });
    const input = requests();
    const pending = transport(input, stop.signal, api, () => true, publisherId(1));
    const outcome = pending.then(
      (v) => ({ value: v }),
      (error: unknown) => ({ error }),
    );
    await tick();
    input.forEach((r) => r.fill(99));
    expect(api.read).not.toHaveBeenCalled();
    if (aborted) stop.abort();
    release();
    const result = await outcome;
    if (aborted) {
      expect('error' in result).toBe(true);
      expect(api.read).not.toHaveBeenCalled();
    } else {
      expect(result).toEqual({
        value: { pages: [bytes(11), bytes(12), bytes(13), bytes(14)], attempted: 4 },
      });
    }
    const small = io();
    await transport(requests(), signal(), small, () => true, publisherId(2));
    expect(small.batch).toHaveBeenCalledTimes(1);
    expect(small.read).not.toHaveBeenCalled();
  },
);
it('a scoped fallback shares its original logical deadline', async () => {
  const deadline = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
  const api = io({
    batch: vi.fn(async (_body, _stop, _limit, fallback) => {
      await fallback('aggregate-limit');
      deadline.abort();
      return null;
    }),
  });
  await expect(
    createReceivePageTransport()(requests(), signal(), api, () => true, publisherId(1)),
  ).rejects.toThrow();
  expect(timeout).toHaveBeenCalledTimes(1);
  expect(timeout).toHaveBeenCalledWith(PRIVATE_DELIVERY_TIMEOUT_MS);
  expect(api.read).not.toHaveBeenCalled();
});
it('preserves the conservative byte-only fallback without an explicit publisher', async () => {
  const transport = createReceivePageTransport();
  const large = io({
    batch: vi.fn(async (_body, _stop, _limit, fallback) => fallback('aggregate-limit')),
  });
  await transport(requests(), signal(), large, () => true);
  const other = io();
  await transport(requests(), signal(), other, () => true, publisherId(2));
  expect(other.batch).not.toHaveBeenCalled();
  expect(other.read).toHaveBeenCalledTimes(4);
});
it('rejects malformed explicit publisher identifiers before transport work', async () => {
  const transport = createReceivePageTransport();
  const api = io();
  for (const id of ['', 'g'.repeat(32), 'a'.repeat(31), 'a'.repeat(33)])
    await expect(transport(requests(), signal(), api, () => true, id)).rejects.toThrow();
  expect(api.batch).not.toHaveBeenCalled();
  expect(api.read).not.toHaveBeenCalled();
});
it.each(['refused', 'invalid', 'oversized'] as const)(
  'a scoped %s reply cannot poison either publisher fallback state',
  async (mode) => {
    const transport = createReceivePageTransport();
    const bad = io({
      batch: vi.fn(async () =>
        mode === 'refused'
          ? null
          : mode === 'invalid'
            ? bytes(99)
            : new Uint8Array(MAX_PENDING_BYTES + 1),
      ),
    });
    if (mode === 'refused')
      expect(await transport(requests(), signal(), bad, () => true, publisherId(1))).toEqual({
        pages: [],
        attempted: 1,
      });
    else
      await expect(
        transport(requests(), signal(), bad, () => true, publisherId(1)),
      ).rejects.toThrow();
    expect(bad.read).not.toHaveBeenCalled();
    for (const id of [publisherId(1), publisherId(2)]) {
      const good = io();
      await transport(requests(), signal(), good, () => true, id);
      expect(good.batch).toHaveBeenCalledTimes(1);
      expect(good.read).not.toHaveBeenCalled();
    }
  },
);
it('actual HTTP overflow is publisher-scoped while a drained404 remains endpoint-scoped', async () => {
  const pin = { origin: 'http://127.0.0.1:12345' } as AuthorityPin;
  for (const mode of ['overflow', 'absent'] as const) {
    const fetches = vi.fn(async () =>
      mode === 'absent'
        ? new Response('', { status: 404 })
        : new Response('', {
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Length': String(MAX_PENDING_BYTES + 1),
            },
          }),
    );
    vi.stubGlobal('fetch', fetches);
    const api = io({
      batch: async (body, stop, limit, fallback) =>
        privateDeliveryPost(
          pin,
          'A'.repeat(43),
          'read-v2-batch',
          body,
          limit,
          stop,
          undefined,
          false,
          () => fallback(),
          () => {
            void fallback('aggregate-limit');
          },
        ),
    });
    const transport = createReceivePageTransport();
    expect(
      (await transport(requests(), signal(), api, () => true, publisherId(1))).pages.length,
    ).toBe(4);
    expect(fetches).toHaveBeenCalledTimes(1);
    await transport(requests(), signal(), api, () => true, publisherId(1));
    expect(fetches).toHaveBeenCalledTimes(1);
    const small = io();
    expect(
      (await transport(requests(), signal(), small, () => true, publisherId(2))).pages.length,
    ).toBe(4);
    expect(small.batch).toHaveBeenCalledTimes(mode === 'overflow' ? 1 : 0);
    expect(small.read).toHaveBeenCalledTimes(mode === 'absent' ? 4 : 0);
  }
});
