/** Ordered bounded byte transport only. These frames carry no verification or task authority. */
import type { Bytes } from './custodyCrypto';
export const WORKER_FRAME_PART_BYTES = 64 * 1024;
export interface WorkerFrameCounts {
  readonly frames: number;
  readonly total: number;
}
export interface WorkerFramePart {
  readonly index: number;
  readonly total: number;
  readonly offset: number;
  readonly bytes: Bytes;
  readonly done: boolean;
}
const refused = () => Error('Worker frame stream changed or exceeded its bound');
const erasePart = (part: unknown) => {
  if (!part || typeof part !== 'object') return;
  const bytes = Object.getOwnPropertyDescriptor(part, 'bytes')?.value;
  if (bytes instanceof Uint8Array) bytes.fill(0);
};
function fields(value: unknown, names: readonly string[]) {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    throw refused();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== names.length ||
    names.some((n) => !Object.hasOwn(descriptors, n) || !('value' in descriptors[n]!))
  )
    throw refused();
}
const integer = (n: number, minimum: number) => Number.isSafeInteger(n) && n >= minimum;
function counts(input: WorkerFrameCounts, limit: number): WorkerFrameCounts {
  fields(input, ['frames', 'total']);
  const { frames, total } = input;
  if (
    !integer(limit, 1) ||
    !integer(frames, 0) ||
    !integer(total, 0) ||
    total > limit ||
    frames > total ||
    (frames === 0) !== (total === 0)
  )
    throw refused();
  return { frames, total };
}
/** Takes ownership of the originals; each is erased after its last copied part or on close. */
export function createWorkerFrameStream(frames: readonly Bytes[], limit: number) {
  if (
    !Array.isArray(frames) ||
    frames.length > limit ||
    frames.some((b) => !(b instanceof Uint8Array) || !b.length)
  )
    throw refused();
  const size = counts(
    { frames: frames.length, total: frames.reduce((n, b) => n + b.length, 0) },
    limit,
  );
  const entries = [...frames];
  let index = 0,
    offset = 0,
    closed = false;
  return Object.freeze({
    counts: size,
    next(): WorkerFramePart {
      if (closed) throw refused();
      const current = entries[index];
      if (!current) {
        closed = true;
        return { index: 0, total: 0, offset: 0, bytes: new Uint8Array(), done: true };
      }
      const part = {
        index,
        total: current.length,
        offset,
        bytes: current.slice(offset, offset + WORKER_FRAME_PART_BYTES),
        done: false,
      };
      offset += part.bytes.length;
      if (offset === current.length) {
        current.fill(0);
        index++;
        offset = 0;
      }
      part.done = index === entries.length;
      if (part.done) closed = true;
      return part;
    },
    close() {
      closed = true;
      for (const b of entries) b.fill(0);
    },
  });
}
export function createWorkerFrameReceiver(input: WorkerFrameCounts, limit: number) {
  const size = counts(input, limit),
    frames: Bytes[] = [];
  let pending: Bytes | undefined,
    offset = 0,
    received = 0,
    complete = false,
    closed = false;
  const close = () => {
    closed = true;
    pending?.fill(0);
    pending = undefined;
    for (const b of frames) b.fill(0);
  };
  return Object.freeze({
    accept(part: WorkerFramePart) {
      try {
        if (closed || complete) throw refused();
        fields(part, ['index', 'total', 'offset', 'bytes', 'done']);
        if (
          !(part.bytes instanceof Uint8Array) ||
          typeof part.done !== 'boolean' ||
          part.bytes.length > WORKER_FRAME_PART_BYTES
        )
          throw refused();
        if (!size.frames) {
          if (
            part.index !== 0 ||
            part.total !== 0 ||
            part.offset !== 0 ||
            part.bytes.length ||
            !part.done
          )
            throw refused();
          complete = true;
          return;
        }
        if (
          !integer(part.index, 0) ||
          part.index !== frames.length ||
          !integer(part.total, 1) ||
          !integer(part.offset, 0) ||
          !part.bytes.length ||
          part.total > size.total - received ||
          part.offset + part.bytes.length > part.total
        )
          throw refused();
        if (!pending) {
          if (part.offset || frames.length >= size.frames) throw refused();
          pending = new Uint8Array(part.total);
        }
        if (part.total !== pending.length || part.offset !== offset) throw refused();
        pending.set(part.bytes, offset);
        offset += part.bytes.length;
        if (offset === pending.length) {
          received += pending.length;
          frames.push(pending);
          pending = undefined;
          offset = 0;
        }
        const done = !pending && frames.length === size.frames && received === size.total;
        if (part.done !== done) throw refused();
        complete = done;
      } catch (cause) {
        close();
        throw cause;
      } finally {
        erasePart(part);
      }
    },
    take(): Bytes[] {
      if (closed || !complete) throw refused();
      closed = true;
      return frames.splice(0);
    },
    close,
  });
}
export async function readWorkerFrameStream(
  input: WorkerFrameCounts,
  limit: number,
  next: () => Promise<WorkerFramePart>,
  live: () => void,
): Promise<Bytes[]> {
  const receiver = createWorkerFrameReceiver(input, limit);
  try {
    for (;;) {
      live();
      const part = await next();
      try {
        live();
        receiver.accept(part);
      } finally {
        erasePart(part);
      }
      if (part.done) return receiver.take();
    }
  } finally {
    receiver.close();
  }
}
