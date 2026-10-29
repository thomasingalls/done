// @vitest-environment node
import { expect, it } from 'vitest';
import { createAccountWorkerReceive } from '../src/crdt/accountWorkerReceive';
import { createWorkerFrameStream, readWorkerFrameStream } from '../src/crdt/workerFrameStream';
import type { WorkerChannel } from '../src/crdt/workerChannel';
import type { PreparedReceiveFinish } from '../src/crdt/admissionQueue';
type Owner = Awaited<
  ReturnType<(typeof import('../src/crdt/accountReceive'))['openAccountWorkerStore']>
>;
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
function fixture() {
  let alive = true,
    closes = 0,
    checks = 0,
    applies = 0,
    pending = 0,
    completed = 0,
    network = false,
    missing = false;
  const ack = deferred(),
    verified = deferred();
  let holdVerification = false;
  const wire = new Uint8Array([1, 4, 9]),
    request = new Uint8Array([7, 9]),
    updates = [new Uint8Array([4, 5]), new Uint8Array(140000).fill(3)];
  const owner = {
    api: {
      prepareRead: async () => request.slice(),
      status: async () => ({ state: 'ready' }),
      receivePage: async (
        page: Uint8Array,
        promote: (frames: Uint8Array[]) => void,
        expected: Uint8Array,
      ) => {
        expect(page).toEqual(wire);
        expect(expected).toEqual(request);
        if (holdVerification) await verified.promise;
        promote(updates);
        return { kind: 'received', recorded: true };
      },
    },
    preparedPromotion: () => {
      pending++;
      const finish: PreparedReceiveFinish = async (apply) => apply();
      finish.acknowledged = async (apply) => {
        checks++;
        await apply();
        pending--;
      };
      return finish;
    },
    get access() {
      return network ? { kind: 'scoped-account' } : undefined;
    },
    fetchPage: async () => ({
      request: request.slice(),
      requests: [request.slice()],
      page: missing ? null : wire.slice(),
      pages: missing ? [] : [wire.slice()],
      quiet: undefined,
      oversized: false,
    }),
    completedRead: () => {
      completed++;
    },
    carrier: {
      close: async () => {
        closes++;
      },
    },
  } as unknown as Owner;
  const channel = {
    request: async (method: string, value: { id: number }) => {
      expect(method).toBe('receiveApply');
      expect(value).toEqual({ id: 1 });
      applies++;
      await ack.promise;
    },
  } as unknown as WorkerChannel;
  const receive = createAccountWorkerReceive(
    () => owner,
    channel,
    () => {
      if (!alive) throw Error('root closed');
    },
  );
  const upload = (id = 1) => {
    const stream = createWorkerFrameStream([wire.slice()], 100);
    receive.methods.receiveBegin({ id, counts: stream.counts, request });
    receive.methods.receiveInput({ id, part: stream.next() });
  };
  return {
    receive,
    upload,
    wire,
    request,
    updates,
    ack,
    verified,
    hold: () => (holdVerification = true),
    network: (noPage = false) => {
      network = true;
      missing = noPage;
    },
    completed: () => completed,
    abort: () => (alive = false),
    state: () => ({ closes, checks, applies, pending }),
  };
}
it('transports only original ordered updates, then retains the pending promotion through acknowledgment', async () => {
  const f = fixture();
  expect(await f.receive.methods.receiveRequest()).toEqual(f.request);
  f.upload();
  const reply = await f.receive.methods.receiveVerify({ id: 1 });
  expect(reply.result).toMatchObject({ kind: 'received', recorded: true });
  const frames = await readWorkerFrameStream(
    reply.counts,
    200000,
    async () => f.receive.methods.receiveOutput({ id: 1 }),
    () => {},
  );
  expect(frames).toEqual(f.updates);
  const finishing = f.receive.methods.receiveFinish({ id: 1 });
  await Promise.resolve();
  await Promise.resolve();
  expect(f.state()).toEqual({ closes: 0, checks: 1, applies: 1, pending: 1 });
  f.ack.resolve();
  await finishing;
  expect(f.state().pending).toBe(0);
  expect(() => f.receive.methods.receiveFinish({ id: 1 })).toThrow();
  await f.receive.close();
});
it('a second input or reused operation identifier cannot replace an outstanding receive', async () => {
  const f = fixture();
  f.upload();
  expect(() => f.upload(2)).toThrow();
  expect(() => f.receive.methods.receiveVerify({ id: 2 })).toThrow();
  expect(f.state().checks).toBe(0);
  await f.receive.close();
});
it('premature finish and output cannot bypass verification or complete byte delivery', async () => {
  const f = fixture();
  f.upload();
  expect(() => f.receive.methods.receiveOutput({ id: 1 })).toThrow();
  expect(() => f.receive.methods.receiveFinish({ id: 1 })).toThrow();
  await f.receive.methods.receiveVerify({ id: 1 });
  expect(() => f.receive.methods.receiveFinish({ id: 1 })).toThrow();
  expect(f.state()).toEqual({ closes: 0, checks: 0, applies: 0, pending: 1 });
  await f.receive.close();
});
it('a replayed output page never supplies a second successful delivery', async () => {
  const f = fixture();
  f.upload();
  const reply = await f.receive.methods.receiveVerify({ id: 1 });
  await readWorkerFrameStream(
    reply.counts,
    200000,
    async () => f.receive.methods.receiveOutput({ id: 1 }),
    () => {},
  );
  expect(() => f.receive.methods.receiveOutput({ id: 1 })).toThrow();
  await f.receive.close();
});
it('invalid input assembly never reaches native verification and permits no same-id replay', async () => {
  const f = fixture();
  f.upload();
  expect(() =>
    f.receive.methods.receiveInput({
      id: 1,
      part: { index: 0, total: 3, offset: 0, bytes: f.wire.slice(), done: true },
    }),
  ).toThrow();
  expect(() => f.receive.methods.receiveVerify({ id: 1 })).toThrow();
  expect(() => f.upload(1)).toThrow();
  expect(f.state().checks).toBe(0);
  await f.receive.close();
});
it('closing drains outstanding verification before discarding its context', async () => {
  const f = fixture();
  f.hold();
  f.upload();
  const verifying = f.receive.methods.receiveVerify({ id: 1 });
  void verifying.catch(() => {});
  await Promise.resolve();
  let drained = false;
  const closing = f.receive.close().then(() => {
    drained = true;
  });
  await Promise.resolve();
  expect(drained).toBe(false);
  f.verified.resolve();
  await expect(verifying).rejects.toThrow('unavailable');
  await closing;
  expect(f.state()).toEqual({ closes: 1, checks: 0, applies: 0, pending: 0 });
});
it('accessors and extra command keys are refused before native effects', async () => {
  const f = fixture();
  let touched = false;
  expect(() =>
    f.receive.methods.receiveBegin({
      get id() {
        touched = true;
        return 1;
      },
      counts: { frames: 1, total: 3 },
      request: f.request,
    }),
  ).toThrow();
  expect(touched).toBe(false);
  expect(() =>
    f.receive.methods.receiveBegin({
      id: 1,
      counts: { frames: 1, total: 3 },
      request: f.request,
      extra: true,
    }),
  ).toThrow();
  expect(f.state().checks).toBe(0);
  await f.receive.close();
});
it('a closed root cannot prepare or revive a receive', async () => {
  const f = fixture();
  f.abort();
  await expect(f.receive.methods.receiveRequest()).rejects.toThrow('root closed');
  expect(() => f.upload()).toThrow('root closed');
  await f.receive.close();
});

it('native read scheduling is not marked complete until the same receive acknowledges', async () => {
  const f = fixture();
  f.network();
  const r = await f.receive.methods.receiveFetch({ id: 1 });
  expect(r.result.kind).toBe('received');
  expect(f.completed()).toBe(0);
  await readWorkerFrameStream(
    r.counts,
    200000,
    async () => f.receive.methods.receiveOutput({ id: 1 }),
    () => {},
  );
  const work = f.receive.methods.receiveFinish({ id: 1 });
  await Promise.resolve();
  await Promise.resolve();
  expect(f.completed()).toBe(0);
  f.ack.resolve();
  await work;
  expect(f.completed()).toBe(1);
  await f.receive.close();
});
it('no read response grants no recorded progress and an empty apply still checks its owner', async () => {
  const f = fixture();
  f.network(true);
  const r = await f.receive.methods.receiveFetch({ id: 1 });
  expect(r.result).toMatchObject({ kind: 'unknown', recorded: false });
  expect(r.counts).toEqual({ frames: 0, total: 0 });
  const output = await readWorkerFrameStream(
    r.counts,
    200000,
    async () => f.receive.methods.receiveOutput({ id: 1 }),
    () => {},
  );
  expect(output).toEqual([]);
  f.ack.resolve();
  await f.receive.methods.receiveFinish({ id: 1 });
  expect(f.completed()).toBe(0);
  await f.receive.close();
});
it('a network receive requires the actual owner connection and closes if it is unavailable', async () => {
  const f = fixture();
  await expect(f.receive.methods.receiveFetch({ id: 1 })).rejects.toThrow(
    'authenticated connection',
  );
  expect(f.state().closes).toBe(1);
  await f.receive.close();
});
it('a second read request cannot supersede a pending original request', async () => {
  const f = fixture();
  f.upload();
  await expect(f.receive.methods.receiveRequest()).rejects.toThrow('unavailable');
  expect(f.state().checks).toBe(0);
  await f.receive.close();
});

it('nested stream counts are captured without invoking accessors', async () => {
  const f = fixture();
  let touched = false;
  expect(() =>
    f.receive.methods.receiveBegin({
      id: 1,
      counts: {
        get frames() {
          touched = true;
          return 1;
        },
        total: 3,
      },
      request: f.request,
    }),
  ).toThrow();
  expect(touched).toBe(false);
  expect(f.state().checks).toBe(0);
  await f.receive.close();
});
