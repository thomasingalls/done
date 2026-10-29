// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createAcknowledgedPresentation } from '../src/crdt/acknowledgedPresentation';
const deferred = () => {
  let resolve!: () => void, reject!: (cause: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { resolve, reject, promise };
};
async function turn() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
function fixture() {
  const stop = new AbortController(),
    failed = vi.fn(),
    flights: {
      sequence: number;
      value: { n: number; bytes?: Uint8Array };
      gate: ReturnType<typeof deferred>;
    }[] = [];
  const owner = createAcknowledgedPresentation<{ n: number; bytes?: Uint8Array }>({
    signal: stop.signal,
    send(input) {
      const gate = deferred();
      flights.push({ ...input, gate });
      return gate.promise;
    },
    failed,
  });
  return { stop, failed, flights, owner };
}
it('coalesces pending display states while each actual send keeps monotone acknowledgement', async () => {
  const f = fixture();
  f.owner.publish({ n: 0 });
  await turn();
  for (let n = 1; n <= 1000; n++) f.owner.publish({ n });
  let done = false;
  const flushed = f.owner.flush().then(() => (done = true));
  expect(f.flights).toHaveLength(1);
  f.flights[0]!.gate.resolve();
  await turn();
  expect(done).toBe(false);
  expect(f.flights.map((v) => ({ sequence: v.sequence, n: v.value.n }))).toEqual([
    { sequence: 1, n: 0 },
    { sequence: 2, n: 1000 },
  ]);
  f.flights[1]!.gate.resolve();
  await flushed;
  expect(done).toBe(true);
  f.owner.close();
});
it('abort rejects current and future flushes without creating a new waiter or delivering later pending state', async () => {
  const f = fixture();
  f.owner.publish({ n: 1 });
  await turn();
  f.owner.publish({ n: 2 });
  const waiting = f.owner.flush();
  const rejected = expect(waiting).rejects.toThrow('Worker operation');
  f.stop.abort();
  await rejected;
  await expect(f.owner.flush()).rejects.toMatchObject({ code: 'presentation-closed' });
  f.owner.publish({ n: 3 });
  f.flights[0]!.gate.resolve();
  await turn();
  expect(f.flights).toHaveLength(1);
  expect(f.failed).not.toHaveBeenCalled();
});
it('transport failure rejects all waiters and reports the first failure once', async () => {
  const f = fixture();
  f.owner.publish({ n: 1 });
  await turn();
  const waiting = f.owner.flush(),
    rejected = expect(waiting).rejects.toThrow('transport failed');
  const cause = Error('transport failed');
  f.flights[0]!.gate.reject(cause);
  await rejected;
  await turn();
  f.owner.publish({ n: 2 });
  await expect(f.owner.flush()).rejects.toThrow();
  expect(f.failed).toHaveBeenCalledExactlyOnceWith(cause);
  expect(f.flights).toHaveLength(1);
});
it('captures owned bounded bytes before caller mutation and erases them after acknowledgement', async () => {
  const f = fixture(),
    bytes = new Uint8Array([1, 2]);
  f.owner.publish({ n: 1, bytes });
  bytes.fill(9);
  await turn();
  expect(f.flights[0]!.value.bytes).toEqual(new Uint8Array([1, 2]));
  f.flights[0]!.gate.resolve();
  await f.owner.flush();
  await turn();
  expect(f.flights[0]!.value.bytes).toEqual(new Uint8Array(2));
  expect(bytes).toEqual(new Uint8Array([9, 9]));
  f.owner.close();
});
it('accessors and oversized backing buffers refuse before any send', () => {
  const f = fixture(),
    get = vi.fn();
  expect(() =>
    f.owner.publish({
      get n() {
        return get();
      },
    }),
  ).toThrow();
  expect(get).not.toHaveBeenCalled();
  expect(() =>
    f.owner.publish({ n: 1, bytes: new Uint8Array(new ArrayBuffer(1024 * 1024 + 1), 0, 1) }),
  ).toThrow();
  expect(f.flights).toHaveLength(0);
  f.owner.close();
});
it('flush waiters have the same finite eight-call bound and close never waits on a transport reply', async () => {
  const f = fixture();
  f.owner.publish({ n: 1 });
  await turn();
  const waiting = Array.from({ length: 8 }, () => f.owner.flush()),
    rejected = waiting.map((p) => expect(p).rejects.toThrow());
  await expect(f.owner.flush()).rejects.toMatchObject({ code: 'presentation-backlog' });
  f.owner.close();
  await Promise.all(rejected);
  await expect(f.owner.flush()).rejects.toThrow();
  f.flights[0]!.gate.resolve();
  await turn();
  expect(f.failed).not.toHaveBeenCalled();
});
it('abort between publish and its microtask prevents sending the captured presentation', async () => {
  const f = fixture();
  f.owner.publish({ n: 1 });
  f.stop.abort();
  await turn();
  expect(f.flights).toHaveLength(0);
  await expect(f.owner.flush()).rejects.toThrow();
  expect(f.failed).not.toHaveBeenCalled();
});
