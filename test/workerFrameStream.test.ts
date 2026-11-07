// @vitest-environment node
import { expect, it } from 'vitest';
import {
  createWorkerFrameStream,
  createWorkerFrameReceiver,
  readWorkerFrameStream,
  WORKER_FRAME_PART_BYTES,
} from '../src/crdt/workerFrameStream';
import { READ_PAGE_LIMIT } from '../account-protocol/deliveryTransport';
import { MAX_PENDING_BYTES } from '../src/crdt/admissionQueue';
const frame = (length: number) => Uint8Array.from({ length }, (_, n) => n % 251);
it.each([0, 1, 65536, 65537, MAX_PENDING_BYTES, READ_PAGE_LIMIT])(
  'retains exact ordered bytes at original %i byte boundary with bounded messages',
  async (length) => {
    const source = length ? [frame(length)] : [],
      expected = source.map((v) => v.slice()),
      stream = createWorkerFrameStream(source, READ_PAGE_LIMIT);
    let parts = 0;
    const actual = await readWorkerFrameStream(
      stream.counts,
      READ_PAGE_LIMIT,
      async () => {
        const p = stream.next();
        parts++;
        expect(p.bytes.length).toBeLessThanOrEqual(WORKER_FRAME_PART_BYTES);
        return p;
      },
      () => {},
    );
    expect(actual.length).toBe(expected.length);
    for (let i = 0; i < actual.length; i++)
      expect(Buffer.from(actual[i]!).equals(Buffer.from(expected[i]!))).toBe(true);
    expect(source.every((v) => v.every((b) => b === 0))).toBe(true);
    expect(parts).toBe(Math.max(1, Math.ceil(length / WORKER_FRAME_PART_BYTES)));
    expect(() => stream.next()).toThrow();
  },
);
it('retains many exact frames and their order without combining updates', async () => {
  const source = [frame(1), frame(100000), frame(3)],
    expected = source.map((v) => v.slice()),
    stream = createWorkerFrameStream(source, MAX_PENDING_BYTES);
  expect(
    await readWorkerFrameStream(
      stream.counts,
      MAX_PENDING_BYTES,
      async () => stream.next(),
      () => {},
    ),
  ).toEqual(expected);
});
it.each(['index', 'offset', 'total', 'done', 'bytes', 'extra'] as const)(
  'refuses changed %s and erases the owned part/assembly',
  (key) => {
    const stream = createWorkerFrameStream([frame(100000)], MAX_PENDING_BYTES),
      receiver = createWorkerFrameReceiver(stream.counts, MAX_PENDING_BYTES);
    receiver.accept(stream.next());
    const part = stream.next(),
      bytes = part.bytes;
    const bad = {
      ...part,
      [key]:
        key === 'bytes' ? new Uint8Array(WORKER_FRAME_PART_BYTES + 1) : key === 'done' ? false : 9,
    };
    expect(() => receiver.accept(bad)).toThrow();
    expect(() => receiver.take()).toThrow();
    expect(bad.bytes.every((b) => b === 0)).toBe(true);
    if (key !== 'bytes') expect(bytes.every((b) => b === 0)).toBe(true);
    stream.close();
    receiver.close();
  },
);
it('rejects over-limit and incoherent counts before allocating', () => {
  for (const c of [
    { frames: 1, total: READ_PAGE_LIMIT + 1 },
    { frames: 0, total: 1 },
    { frames: 2, total: 1 },
    { frames: 1, total: NaN },
    { frames: -1, total: 1 },
  ])
    expect(() => createWorkerFrameReceiver(c, READ_PAGE_LIMIT)).toThrow();
});
it('never reads an accessor or an inherited schema value', () => {
  let touched = false;
  const bad = {
    frames: 1,
    get total() {
      touched = true;
      return 1;
    },
  };
  expect(() => createWorkerFrameReceiver(bad, 10)).toThrow();
  expect(touched).toBe(false);
  expect(() =>
    createWorkerFrameReceiver(Object.assign(Object.create({}), { frames: 1, total: 1 }), 10),
  ).toThrow();
});
it('cancellation after receiving a part erases it and discards partially assembled originals', async () => {
  const stream = createWorkerFrameStream([frame(100000)], MAX_PENDING_BYTES);
  let live = true,
    bytes: Uint8Array | undefined;
  await expect(
    readWorkerFrameStream(
      stream.counts,
      MAX_PENDING_BYTES,
      async () => {
        const p = stream.next();
        bytes = p.bytes;
        live = false;
        return p;
      },
      () => {
        if (!live) throw Error('closed');
      },
    ),
  ).rejects.toThrow('closed');
  expect(bytes!.every((b) => b === 0)).toBe(true);
  stream.close();
});
it('take is one-shot and incomplete streams cannot escape', () => {
  const stream = createWorkerFrameStream([frame(3)], 10),
    receiver = createWorkerFrameReceiver(stream.counts, 10);
  expect(() => receiver.take()).toThrow();
  receiver.accept(stream.next());
  expect(receiver.take()).toEqual([frame(3)]);
  expect(() => receiver.take()).toThrow();
  expect(() =>
    receiver.accept({ index: 0, total: 3, offset: 0, bytes: frame(3), done: true }),
  ).toThrow();
});
it('close erases an interrupted source suffix', () => {
  const frames = [frame(100000), frame(100)],
    stream = createWorkerFrameStream(frames, MAX_PENDING_BYTES);
  stream.next().bytes.fill(0);
  stream.close();
  expect(frames.every((v) => v.every((b) => b === 0))).toBe(true);
  expect(() => stream.next()).toThrow();
});

it('a malformed accessor part is refused without invoking it during cleanup', async () => {
  let touched = false;
  const part = {
    index: 0,
    total: 1,
    offset: 0,
    get bytes() {
      touched = true;
      return new Uint8Array([1]);
    },
    done: true,
  };
  await expect(
    readWorkerFrameStream(
      { frames: 1, total: 1 },
      10,
      async () => part,
      () => {},
    ),
  ).rejects.toThrow('changed');
  expect(touched).toBe(false);
});
