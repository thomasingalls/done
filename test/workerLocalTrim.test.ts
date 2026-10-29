// @vitest-environment node
import { expect, it } from 'vitest';
import { createWorkerLocalMaintenance } from '../src/crdt/workerLocalTrim';
import { MaintenanceInterrupted } from '../src/crdt/contentMaintenance';
import { WorkerChannelError } from '../src/crdt/workerChannel';
import { createWorkerFrameReceiver, type WorkerFramePart } from '../src/crdt/workerFrameStream';
import type { ContentCompactionReceipt, DiskState } from '../src/crdt/contentCompaction';
import type { StoredRecord } from '../src/crdt/contentRecord';
const receipt = (): ContentCompactionReceipt => ({
  status: 'retained',
  storeId: 'store',
  generation: 1,
  stateSequence: 2,
  removed: [],
});
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
function audit() {
  const record: StoredRecord = {
    v: 1,
    gen: 1,
    seq: 1,
    kind: 'update',
    nonce: new Uint8Array(12).fill(3),
    ct: new Uint8Array(160000).fill(7),
  };
  const snapshot: DiskState = {
    counter: {
      v: 1,
      store_id: 'store',
      intent: 'intent',
      active_gen: 1,
      next_seq: 2,
      reserved: { '1': 1 },
      mac: new Uint8Array(32).fill(9),
    },
    rows: [{ store: 'content', key: 1, value: record }],
  };
  return { record, snapshot };
}
it('streams exact audited ciphertext in bounded frames, transfers its ownership and leaves counter MAC intact', async () => {
  const a = audit(),
    before = a.record.ct.slice(),
    calls: string[] = [],
    received = createWorkerFrameReceiver({ frames: 1, total: before.length }, before.length);
  const maintenance = createWorkerLocalMaintenance(
    async (_signal, commit) => {
      expect(await commit(a.snapshot, [a.record], 17)).toBe(false);
      return receipt();
    },
    {
      async request<T>(method: string, value?: unknown): Promise<T> {
        calls.push(method);
        if (method === 'trimPart') {
          const part = value as WorkerFramePart;
          expect(part.bytes.length).toBeLessThanOrEqual(65536);
          received.accept(structuredClone(part));
        }
        if (method === 'trimCommit') {
          expect(value).toEqual({ observation: 17 });
          return false as T;
        }
        return undefined as T;
      },
    },
    () => {},
  );
  expect(await maintenance.run({ id: 1 })).toEqual({ kind: 'complete', receipt: receipt() });
  expect(calls).toEqual(['trimBegin', 'trimRow', 'trimPart', 'trimPart', 'trimPart', 'trimCommit']);
  expect(received.take()).toEqual([before]);
  expect(a.record.ct.every((v) => v === 0)).toBe(true);
  expect(a.snapshot.counter!.mac.every((v) => v === 9)).toBe(true);
});
it('a late cancellation cannot interrupt the following native flight', async () => {
  const gate = deferred();
  let entered = 0,
    signal!: AbortSignal;
  const m = createWorkerLocalMaintenance(
    async (s) => {
      signal = s;
      if (++entered === 2) await gate.promise;
      if (s.aborted) throw new MaintenanceInterrupted();
      return receipt();
    },
    { request: async <T>() => undefined as T },
    () => {},
  );
  await m.run({ id: 1 });
  const next = m.run({ id: 2 });
  m.cancel({ id: 1 });
  expect(signal.aborted).toBe(false);
  m.cancel({ id: 2 });
  expect(signal.aborted).toBe(true);
  gate.resolve();
  expect(await next).toEqual({ kind: 'interrupted' });
});
it('duplicate, parallel and future operation identities refuse without invoking another native compaction', async () => {
  const gate = deferred();
  let calls = 0;
  const m = createWorkerLocalMaintenance(
    async () => {
      calls++;
      await gate.promise;
      return receipt();
    },
    { request: async <T>() => undefined as T },
    () => {},
  );
  const first = m.run({ id: 1 });
  await expect(m.run({ id: 2 })).rejects.toThrow('order');
  expect(() => m.cancel({ id: 2 })).toThrow('order');
  gate.resolve();
  await first;
  await expect(m.run({ id: 1 })).rejects.toThrow('order');
  expect(calls).toBe(1);
});
it('known integrity failure retains priority over a concurrent discretionary cancellation', async () => {
  const a = audit();
  let m!: ReturnType<typeof createWorkerLocalMaintenance>;
  m = createWorkerLocalMaintenance(
    async (_signal, commit) => {
      await commit(a.snapshot, [a.record], 2);
      return receipt();
    },
    {
      request: async <T>(): Promise<T> => {
        m.cancel({ id: 1 });
        throw new WorkerChannelError('repair-required');
      },
    },
    () => {},
  );
  await expect(m.run({ id: 1 })).rejects.toMatchObject({ code: 'repair-required' });
});
it('foreground cancellation of a Window refusal becomes the original interruption kind', async () => {
  const a = audit();
  let m!: ReturnType<typeof createWorkerLocalMaintenance>;
  m = createWorkerLocalMaintenance(
    async (_signal, commit) => {
      await commit(a.snapshot, [a.record], 2);
      return receipt();
    },
    {
      request: async <T>(): Promise<T> => {
        m.cancel({ id: 1 });
        throw new WorkerChannelError('operation-refused');
      },
    },
    () => {},
  );
  expect(await m.run({ id: 1 })).toEqual({ kind: 'interrupted' });
});
it('closing withdraws the native flight and never allows a new one', async () => {
  const gate = deferred();
  let signal!: AbortSignal;
  const m = createWorkerLocalMaintenance(
    async (s) => {
      signal = s;
      await gate.promise;
      return receipt();
    },
    { request: async <T>() => undefined as T },
    () => {},
  );
  const flight = m.run({ id: 1 });
  m.close();
  expect(signal.aborted).toBe(true);
  gate.resolve();
  await expect(flight).rejects.toThrow('closed');
  await expect(m.run({ id: 2 })).rejects.toThrow('closed');
});
