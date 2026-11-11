/** Trusted composition queues. Original native operations/finish capabilities stay in the Worker. */
import {
  MAX_PENDING_BYTES,
  type OwnedPreparedReceiveQueue,
  type OwnedReceiveQueue,
  type PreparedReceiveFinish,
} from './admissionQueue';
import type { Bytes } from './custodyCrypto';
import type { WorkerChannel } from './workerChannel';
import { eraseWorkerMessage } from './workerChannel';
import { createWorkerFrameStream } from './workerFrameStream';
import type { AccountMirrorOpening } from './accountMirrorMaterial';

export const workspaceQueueRefused = () =>
  Error('Worker workspace handoff changed or is unavailable');
/** The single handoff slot is held by another operation. Thrown only before a flight begins, so
 * nothing has run; every refusal after that stays a plain fail-closed error. Same message. */
export class WorkspaceQueueBusy extends Error {
  constructor() {
    super('Worker workspace handoff changed or is unavailable');
  }
}
export function workspaceQueueFields(input: unknown, names: readonly string[]): void {
  if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype)
    throw workspaceQueueRefused();
  const d = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(input).length !== names.length ||
    names.some((n) => !Object.hasOwn(d, n) || !('value' in d[n]!))
  )
    throw workspaceQueueRefused();
}
type Flight = {
  id: number;
  kind: 'prepared' | 'fenced';
  phase: 'preparing' | 'streaming' | 'finishing' | 'committing' | 'settled';
  stream?: ReturnType<typeof createWorkerFrameStream>;
  finish?: PreparedReceiveFinish;
  sent: boolean;
  commit?: () => Promise<void>;
};
export function createWorkerWorkspaceQueues(config: {
  channel: Pick<WorkerChannel, 'request'>;
  signal: AbortSignal;
  live(): void;
  failed(): void;
  incarnation: string;
  preparedPromotion(): PreparedReceiveFinish;
  withFence<T>(id: number, operation: () => Promise<T>): Promise<T>;
}) {
  let sequence = 0,
    flight: Flight | undefined,
    closed = false;
  const jobs = new Set<Promise<unknown>>();
  const live = () => {
    config.live();
    if (closed || config.signal.aborted) throw workspaceQueueRefused();
  };
  const current = (input: unknown, phase?: Flight['phase']) => {
    live();
    workspaceQueueFields(input, ['id']);
    if (!flight || (input as { id: number }).id !== flight.id || (phase && flight.phase !== phase))
      throw workspaceQueueRefused();
    return flight;
  };
  const begin = (bytes: Bytes, kind: Flight['kind']) => {
    live();
    if (
      !(bytes instanceof Uint8Array) ||
      !bytes.length ||
      bytes.length > MAX_PENDING_BYTES ||
      sequence === Number.MAX_SAFE_INTEGER
    )
      throw workspaceQueueRefused();
    if (flight) throw new WorkspaceQueueBusy();
    const state: Flight = { id: ++sequence, kind, phase: 'preparing', sent: false };
    flight = state;
    return { state, input: bytes.slice() };
  };
  const frames = (f: Flight, input: readonly Bytes[]) => {
    live();
    if (flight !== f || f.stream) throw workspaceQueueRefused();
    if (
      !Array.isArray(input) ||
      input.length > MAX_PENDING_BYTES ||
      input.some((b) => !(b instanceof Uint8Array) || !b.length) ||
      input.reduce((n, b) => n + b.length, 0) > MAX_PENDING_BYTES
    )
      throw workspaceQueueRefused();
    const owned = input.map((b) => b.slice());
    try {
      f.stream = createWorkerFrameStream(owned, MAX_PENDING_BYTES);
    } catch (cause) {
      for (const b of owned) b.fill(0);
      throw cause;
    }
  };
  const track = <T>(state: Flight, input: Bytes, work: () => Promise<T>) => {
    const job = Promise.resolve()
      .then(work)
      .catch((cause) => {
        // Verification may already have committed. A lost reply must cold-replay, never retry in place.
        config.failed();
        throw cause;
      })
      .finally(() => {
        input.fill(0);
        state.stream?.close();
        delete state.commit;
        delete state.finish;
        if (flight === state) flight = undefined;
      });
    jobs.add(job);
    void job.then(
      () => jobs.delete(job),
      () => jobs.delete(job),
    );
    return job;
  };
  const prepare: OwnedPreparedReceiveQueue = (bytes, operation) => {
    const { state: f, input } = begin(bytes, 'prepared');
    return track(f, input, async () => {
      // Settle the real preparation task BEFORE requesting the Window final FIFO.
      const result = await operation(input, (updates, finish) => {
        if (!finish.acknowledged) throw workspaceQueueRefused();
        frames(f, updates);
        f.finish = finish;
      });
      live();
      if (!f.stream || !f.finish) throw workspaceQueueRefused();
      f.phase = 'streaming';
      await config.channel.request('workspacePrepare', { id: f.id, counts: f.stream.counts });
      live();
      if (phaseOf(f) !== 'settled') throw workspaceQueueRefused();
      return result;
    });
  };
  const enqueue: OwnedReceiveQueue = <T>(
    bytes: Bytes,
    operation: (bytes: Bytes, promote: (updates: readonly Bytes[]) => void) => Promise<T>,
  ) => {
    const { state: f, input } = begin(bytes, 'fenced');
    let result: T;
    f.commit = async () => {
      await config.withFence(f.id, async () => {
        live();
        result = await operation(input, (updates) => frames(f, updates));
        live();
        if (!f.stream) throw workspaceQueueRefused();
        const finish = config.preparedPromotion();
        if (!finish.acknowledgedWithContext) throw workspaceQueueRefused();
        await finish.acknowledgedWithContext(async (context) => {
          const opening: AccountMirrorOpening = { ...context, incarnation: config.incarnation };
          try {
            live();
            f.phase = 'streaming';
            await config.channel.request('workspaceContext', {
              id: f.id,
              counts: f.stream!.counts,
              opening,
            });
            live();
            if (!f.sent) throw workspaceQueueRefused();
          } finally {
            eraseWorkerMessage(opening);
          }
        });
        live();
      });
    };
    return track(f, input, async () => {
      await config.channel.request('workspaceFence', { id: f.id });
      live();
      if (phaseOf(f) !== 'settled') throw workspaceQueueRefused();
      return result;
    });
  };
  const phaseOf = (f: Flight) => f.phase;
  const stop = () => {
    closed = true;
    flight?.stream?.close();
  };
  config.signal.addEventListener('abort', stop, { once: true });
  if (config.signal.aborted) stop();
  return Object.freeze({
    prepare,
    enqueue,
    methods: {
      workspaceFrames(input: unknown) {
        const f = current(input, 'streaming');
        if (!f.stream || f.sent) throw workspaceQueueRefused();
        const part = f.stream.next();
        f.sent = part.done;
        return part;
      },
      async workspaceFinish(input: unknown) {
        const f = current(input, 'streaming');
        if (f.kind !== 'prepared' || !f.sent || !f.finish?.acknowledged)
          throw workspaceQueueRefused();
        f.phase = 'finishing';
        try {
          await f.finish.acknowledged(async () => {
            live();
            await config.channel.request('workspaceApply', { id: f.id });
            live();
          });
          live();
          f.phase = 'settled';
        } catch (cause) {
          config.failed();
          throw cause;
        }
      },
      async workspaceCommit(input: unknown) {
        const f = current(input, 'preparing');
        if (f.kind !== 'fenced' || !f.commit) throw workspaceQueueRefused();
        const commit = f.commit;
        delete f.commit;
        f.phase = 'committing';
        try {
          await commit();
          live();
          if (phaseOf(f) !== 'streaming' || !f.sent) throw workspaceQueueRefused();
          f.phase = 'settled';
        } catch (cause) {
          config.failed();
          throw cause;
        }
      },
    },
    async close() {
      stop();
      config.signal.removeEventListener('abort', stop);
      await Promise.allSettled([...jobs]);
    },
  });
}
