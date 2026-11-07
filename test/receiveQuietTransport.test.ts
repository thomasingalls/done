// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createReceivePageTransport, type ReceivePageIO } from '../src/crdt/receivePageTransport';
import { collectReceivePages, RECEIVE_SINGLE_PAGE_BYTES } from '../src/crdt/receivePrefetch';
import { MAX_PENDING_BYTES } from '../src/crdt/admissionQueue';
import { decodeInboundBatch, encodeInboundBatchPages } from '../account-protocol/inboundBatch';

const b = (n: number) => new Uint8Array([n]);
const request = [b(1), b(2), b(3), b(4)];
const io = (overrides: Partial<ReceivePageIO> = {}): ReceivePageIO => ({
  read: vi.fn(async (r) => b(r[0]! + 10)),
  batch: vi.fn(async (body) =>
    encodeInboundBatchPages(decodeInboundBatch(body).map((r) => b(r[0]! + 10))),
  ),
  ...overrides,
});

it('collects independent quiet originals even when the selected primary page is empty', async () => {
  const api = io();
  const out = await createReceivePageTransport()(
    request,
    new AbortController().signal,
    api,
    () => false,
    undefined,
    { primaryCount: 1, maxBytes: MAX_PENDING_BYTES },
  );
  expect(out).toEqual({ pages: [b(11)], attempted: 1, quietPages: [b(12), b(13), b(14)] });
  expect(api.batch).toHaveBeenCalledTimes(1);
});

it('quiet responses cannot extend a primary prefix cut or its progress count', async () => {
  const api = io();
  const out = await createReceivePageTransport()(
    request,
    new AbortController().signal,
    api,
    () => false,
    undefined,
    { primaryCount: 2, maxBytes: MAX_PENDING_BYTES },
  );
  expect(out).toEqual({ pages: [b(11)], attempted: 1, quietPages: [b(13), b(14)] });
});

it('a short server prefix never shifts a primary response into a quiet slot', async () => {
  const api = io({ batch: vi.fn(async () => encodeInboundBatchPages([b(11)])) });
  const out = await createReceivePageTransport()(
    request,
    new AbortController().signal,
    api,
    () => true,
    undefined,
    { primaryCount: 2, maxBytes: MAX_PENDING_BYTES },
  );
  expect(out).toEqual({ pages: [b(11)], attempted: 1, quietPages: [] });
});

it('absent-route and aggregate-limit fallback send only the original primary requests', async () => {
  for (const reason of [undefined, 'aggregate-limit'] as const) {
    const sent: number[][] = [];
    const api = io({
      read: vi.fn(async (r) => {
        sent.push([...r]);
        return b(r[0]! + 10);
      }),
      batch: vi.fn(async (_body, _signal, _limit, unsupported) => unsupported(reason)),
    });
    const out = await createReceivePageTransport()(
      request,
      new AbortController().signal,
      api,
      () => true,
      undefined,
      { primaryCount: 2, maxBytes: MAX_PENDING_BYTES },
    );
    expect(out).toEqual({ pages: [b(11), b(12)], attempted: 2 });
    expect(sent).toEqual([[1], [2]]);
  }
});

it('retains the owner-wide old-endpoint fallback without probing for each quiet publisher', async () => {
  const api = io({ batch: vi.fn(async (_body, _signal, _limit, unsupported) => unsupported()) });
  const transport = createReceivePageTransport();
  for (let n = 0; n < 3; n++)
    await transport(request, new AbortController().signal, api, () => true, undefined, {
      primaryCount: 1,
      maxBytes: MAX_PENDING_BYTES,
    });
  expect(api.batch).toHaveBeenCalledTimes(1);
  expect(api.read).toHaveBeenCalledTimes(3);
});

it('batch collection and individual fallback honor the remaining shared byte reservation', async () => {
  const available = 2 * (RECEIVE_SINGLE_PAGE_BYTES + 4);
  const api = io();
  await createReceivePageTransport()(
    request,
    new AbortController().signal,
    api,
    () => true,
    undefined,
    { primaryCount: 1, maxBytes: available },
  );
  expect(vi.mocked(api.batch).mock.calls[0]![2]).toBe(available);
  let active = 0,
    maximum = 0;
  const out = await collectReceivePages(
    4,
    new AbortController().signal,
    async () => {
      maximum = Math.max(maximum, ++active);
      await Promise.resolve();
      active--;
      return new Uint8Array(RECEIVE_SINGLE_PAGE_BYTES);
    },
    () => true,
    () => 0,
    RECEIVE_SINGLE_PAGE_BYTES + 4,
  );
  expect(out.pages).toHaveLength(1);
  expect(maximum).toBe(1);
  expect(out.pages[0]!.length + 4).toBeLessThanOrEqual(RECEIVE_SINGLE_PAGE_BYTES + 4);
});

it('refuses invalid primary extents and any larger-than-original byte budget before I/O', async () => {
  const api = io();
  for (const options of [
    { primaryCount: 0, maxBytes: MAX_PENDING_BYTES },
    { primaryCount: 5, maxBytes: MAX_PENDING_BYTES },
    { primaryCount: 1, maxBytes: MAX_PENDING_BYTES + 1 },
    { primaryCount: 1, maxBytes: RECEIVE_SINGLE_PAGE_BYTES },
  ])
    await expect(
      createReceivePageTransport()(
        request,
        new AbortController().signal,
        api,
        () => true,
        undefined,
        options,
      ),
    ).rejects.toThrow();
  expect(api.batch).not.toHaveBeenCalled();
  expect(api.read).not.toHaveBeenCalled();
});

it('rejects malformed and oversized quiet batches without compatibility downgrade', async () => {
  for (const fault of ['extra', 'trailing', 'oversized']) {
    const good = encodeInboundBatchPages([b(11), b(12)]);
    const response =
      fault === 'extra'
        ? encodeInboundBatchPages([b(11), b(12), b(13)])
        : fault === 'trailing'
          ? new Uint8Array([...good, 1])
          : new Uint8Array(MAX_PENDING_BYTES + 1);
    const api = io({ batch: vi.fn(async () => response) });
    await expect(
      createReceivePageTransport()(
        request.slice(0, 2),
        new AbortController().signal,
        api,
        () => true,
        undefined,
        { primaryCount: 1, maxBytes: MAX_PENDING_BYTES },
      ),
    ).rejects.toThrow();
    expect(api.read).not.toHaveBeenCalled();
    expect(response.every((n) => n === 0)).toBe(true);
  }
});

it('cancellation drains and erases all independent replies, with no late cache handoff', async () => {
  const stop = new AbortController();
  let release!: () => void;
  const wait = new Promise<void>((yes) => {
    release = yes;
  });
  const response = encodeInboundBatchPages([b(11), b(12)]);
  const api = io({
    batch: vi.fn(async () => {
      await wait;
      return response;
    }),
  });
  const pending = createReceivePageTransport()(
    request.slice(0, 2),
    stop.signal,
    api,
    () => true,
    undefined,
    { primaryCount: 1, maxBytes: MAX_PENDING_BYTES },
  );
  const refused = expect(pending).rejects.toThrow();
  stop.abort();
  release();
  await refused;
  expect(response.every((n) => n === 0)).toBe(true);
});
