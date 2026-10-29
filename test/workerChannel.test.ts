// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import {
  createWorkerChannel,
  workerMessageBytes,
  eraseWorkerMessage,
  WORKER_MESSAGE_BYTES,
} from '../src/crdt/workerChannel';
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const stop of cleanup.splice(0)) stop();
  vi.restoreAllMocks();
});
const owner = '12'.repeat(16);
function peers(
  a: Record<string, (v: unknown) => unknown> = {},
  b: Record<string, (v: unknown) => unknown> = {},
) {
  const { port1, port2 } = new MessageChannel(),
    left = createWorkerChannel(port1, owner, a, () => {}),
    right = createWorkerChannel(port2, owner, b, () => {});
  cleanup.push(
    () => left.close(),
    () => right.close(),
  );
  return { left, right, port1, port2 };
}
it('supports reentrant bidirectional calls without serializing independent handler turns', async () => {
  let pair: ReturnType<typeof peers>;
  pair = peers(
    { inner: (v) => Number(v) + 1 },
    { outer: async (v) => pair.right.request('inner', v) },
  );
  await expect(pair.left.request('outer', 4)).resolves.toBe(5);
  expect(pair.left.pending).toBe(0);
  expect(pair.right.pending).toBe(0);
});
it('copies a bounded result before erasing handler-owned bytes', async () => {
  let input: Uint8Array | undefined;
  const bytes = new Uint8Array([1, 2, 3]),
    p = peers(
      {},
      {
        read: (v) => {
          input = v as Uint8Array;
          return bytes;
        },
      },
    );
  const value = await p.left.request<Uint8Array>('read', new Uint8Array([9]));
  expect([...value]).toEqual([1, 2, 3]);
  await vi.waitFor(() => {
    expect([...bytes]).toEqual([0, 0, 0]);
    expect([...input!]).toEqual([0]);
  });
});
it('rejects an oversized request before consuming the sequence and retains a usable channel', async () => {
  const p = peers({}, { read: () => 7 });
  await expect(
    p.left.request('read', new Uint8Array(WORKER_MESSAGE_BYTES + 1)),
  ).rejects.toMatchObject({ code: 'message-bound' });
  await expect(p.left.request('read')).resolves.toBe(7);
});
it('charges the backing buffer, including a small view into a huge allocation', () => {
  expect(() =>
    workerMessageBytes(new Uint8Array(new ArrayBuffer(WORKER_MESSAGE_BYTES + 1), 0, 1)),
  ).toThrow();
});
it('bounds outstanding calls and preserves all admitted requests after a quota refusal', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    p = peers(
      {},
      {
        read: async () => {
          await gate;
          return 7;
        },
      },
    );
  const pending = Array.from({ length: 8 }, () => p.left.request('read'));
  await expect(p.left.request('read')).rejects.toMatchObject({ code: 'queue-full' });
  release();
  await expect(Promise.all(pending)).resolves.toEqual(Array(8).fill(7));
});
it('close rejects pending calls and a late completion cannot reopen the channel', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    p = peers(
      {},
      {
        read: async () => {
          await gate;
          return new Uint8Array([9]);
        },
      },
    );
  const pending = p.left.request('read'),
    refused = expect(pending).rejects.toMatchObject({ code: 'closed' });
  p.right.close();
  await refused;
  release();
  expect(p.left.closed).toBe(true);
  await expect(p.left.request('read')).rejects.toMatchObject({ code: 'closed' });
});
it('a malformed current-owner request closes both sides without executing a handler', async () => {
  const handler = vi.fn(),
    p = peers({}, { read: handler });
  p.port1.postMessage({ v: 1, kind: 'call', owner, id: 2, method: 'read', value: null });
  await vi.waitFor(() => expect(p.left.closed).toBe(true));
  expect(handler).not.toHaveBeenCalled();
});
it('a stale incarnation cannot execute or close the current channel', async () => {
  const handler = vi.fn(() => 3),
    p = peers({}, { read: handler });
  p.port1.postMessage({ v: 1, kind: 'closed', owner: 'ff'.repeat(16) });
  p.port1.postMessage({
    v: 1,
    kind: 'call',
    owner: 'ff'.repeat(16),
    id: 1,
    method: 'read',
    value: null,
  });
  await expect(p.left.request('read')).resolves.toBe(3);
  expect(handler).toHaveBeenCalledTimes(1);
});
it('unknown and replayed current-owner calls cannot execute a handler twice', async () => {
  const handler = vi.fn(() => 3),
    p = peers({}, { read: handler });
  await p.left.request('read');
  p.port1.postMessage({ v: 1, kind: 'call', owner, id: 1, method: 'read', value: null });
  await vi.waitFor(() => expect(p.left.closed).toBe(true));
  expect(handler).toHaveBeenCalledTimes(1);
});
it('refuses error-like getters, cycles, huge sparse arrays and shared/detached binary', () => {
  const getter = vi.fn(() => 1),
    v = {};
  Object.defineProperty(v, 'x', { get: getter });
  expect(() => workerMessageBytes(v)).toThrow();
  expect(getter).not.toHaveBeenCalled();
  const a: unknown[] = [];
  a.push(a);
  expect(() => workerMessageBytes(a)).toThrow();
  const sparse: unknown[] = [];
  sparse.length = 1000000;
  expect(() => workerMessageBytes(sparse)).toThrow();
  expect(() => workerMessageBytes(new Uint8Array(new SharedArrayBuffer(4)))).toThrow();
  const b = new Uint8Array(4);
  structuredClone(b, { transfer: [b.buffer] });
  expect(() => workerMessageBytes(b)).toThrow();
});
it('refused handler results keep their original bounded error code without leaking messages', async () => {
  const p = peers(
    {},
    {
      read: () => {
        throw Object.assign(new Error('secret code never sent'), { code: 'receive-refused' });
      },
    },
  );
  await expect(p.left.request('read')).rejects.toMatchObject({
    code: 'receive-refused',
    message: 'Worker operation could not finish.',
  });
});
it('erasure handles cycles and accessors without invoking them', () => {
  const bytes = new Uint8Array([8]),
    v: { bytes: Uint8Array; self?: unknown } = { bytes };
  v.self = v;
  const getter = vi.fn();
  Object.defineProperty(v, 'x', { get: getter });
  eraseWorkerMessage(v);
  expect([...bytes]).toEqual([0]);
  expect(getter).not.toHaveBeenCalled();
});
it('an oversized owned result refuses its caller without raising the bound or poisoning the next call', async () => {
  const p = peers({}, { large: () => new Uint8Array(WORKER_MESSAGE_BYTES + 1), small: () => 7 });
  await expect(p.left.request('large')).rejects.toMatchObject({ code: 'message-bound' });
  await expect(p.left.request('small')).resolves.toBe(7);
});
it('a malformed error reply rejects the pending promise instead of losing its completion', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    p = peers(
      {},
      {
        read: async () => {
          await gate;
          return 7;
        },
      },
    );
  const pending = p.left.request('read'),
    refused = expect(pending).rejects.toMatchObject({ code: 'message-shape' });
  p.port2.postMessage({ v: 1, kind: 'reply', owner, id: 1, method: 'read', ok: false, value: {} });
  await refused;
  release();
  expect(p.left.pending).toBe(0);
});
