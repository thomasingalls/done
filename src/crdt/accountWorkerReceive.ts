/** Internal dedicated-owner receiver. Data transport never lends native verification authority. */
import { READ_PAGE_LIMIT, READ_REQUEST_LIMIT } from '../../account-protocol/deliveryTransport';
import type { Bytes } from './custodyCrypto';
import type { WorkerChannel } from './workerChannel';
import {
  createWorkerFrameReceiver,
  createWorkerFrameStream,
  type WorkerFrameCounts,
  type WorkerFramePart,
} from './workerFrameStream';
import type { PreparedReceiveFinish } from './admissionQueue';
import { MAX_PENDING_BYTES } from './admissionQueue';
type Owner = Awaited<ReturnType<(typeof import('./accountReceive'))['openAccountWorkerStore']>>;
type Flight = {
  id: number;
  phase: 'input' | 'verifying' | 'prepared' | 'finishing';
  request: Bytes;
  input?: ReturnType<typeof createWorkerFrameReceiver>;
  complete?: () => void;
  stream?: ReturnType<typeof createWorkerFrameStream>;
  finish?: PreparedReceiveFinish;
  sent: boolean;
};
const refused = () => Error('Worker receive handoff changed or is unavailable');
function fields(input: unknown, names: string[]) {
  if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype)
    throw refused();
  const d = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(input).length !== names.length ||
    names.some((n) => !Object.hasOwn(d, n) || !('value' in d[n]!))
  )
    throw refused();
}
export function createAccountWorkerReceive(
  owner: () => Owner | undefined,
  channel: WorkerChannel,
  live: () => void,
) {
  let sequence = 0,
    flight: Flight | undefined,
    closed = false;
  const jobs = new Set<Promise<unknown>>();
  const current = () => {
    live();
    if (closed) throw refused();
    const o = owner();
    if (!o) throw refused();
    return o;
  };
  const erase = (f: Flight) => {
    f.request.fill(0);
    f.input?.close();
    f.stream?.close();
    if (flight === f) flight = undefined;
  };
  const requireFlight = (input: unknown, keys: string[], phase?: Flight['phase']) => {
    current();
    fields(input, keys);
    const id = (input as { id: number }).id;
    if (!flight || id !== flight.id || (phase && flight.phase !== phase)) throw refused();
    return flight;
  };
  const track = <T>(fn: () => Promise<T>) => {
    const work = Promise.resolve().then(fn);
    jobs.add(work);
    void work.then(
      () => jobs.delete(work),
      () => jobs.delete(work),
    );
    return work;
  };
  const stage = (f: Flight, o: Owner, updates: readonly Bytes[]) => {
    current();
    if (f.stream) throw refused();
    const frames = updates.map((b) => b.slice());
    try {
      f.stream = createWorkerFrameStream(frames, MAX_PENDING_BYTES);
      f.finish = o.preparedPromotion();
      if (!f.finish.acknowledged) throw refused();
    } catch (cause) {
      for (const b of frames) b.fill(0);
      throw cause;
    }
  };
  const verify = async (f: Flight, page: Bytes) => {
    const o = current();
    const result = await o.api.receivePage(page, (updates) => stage(f, o, updates), f.request);
    current();
    if (!f.stream || !f.finish) throw refused();
    f.phase = 'prepared';
    return { id: f.id, result, counts: f.stream.counts };
  };
  return Object.freeze({
    methods: {
      receiveFetch: (input: unknown) => {
        current();
        fields(input, ['id']);
        const id = (input as { id: number }).id;
        if (flight || !Number.isSafeInteger(id) || id !== sequence + 1) throw refused();
        const f: Flight = { id, phase: 'verifying', request: new Uint8Array(), sent: false };
        sequence = id;
        flight = f;
        return track(async () => {
          let fetched: Awaited<ReturnType<Owner['fetchPage']>> | undefined;
          try {
            const o = current();
            if (!o.access) throw Error('Worker receive needs an authenticated connection');
            fetched = await o.fetchPage(o.access);
            current();
            f.request = fetched.request.slice();
            if (!fetched.page) {
              const status = await o.api.status();
              current();
              stage(f, o, []);
              f.phase = 'prepared';
              return {
                id,
                result: { kind: 'unknown' as const, recorded: false, status },
                counts: f.stream!.counts,
              };
            }
            const reply = await verify(f, fetched.page);
            const quiet = fetched.quiet;
            f.complete = () => o.completedRead(f.request, reply.result.kind, quiet);
            return reply;
          } catch (cause) {
            erase(f);
            void owner()
              ?.carrier.close()
              .catch(() => {});
            throw cause;
          } finally {
            for (const b of [...(fetched?.requests ?? []), ...(fetched?.pages ?? [])]) b.fill(0);
          }
        });
      },
      receiveRequest: () =>
        track(async () => {
          if (flight) throw refused();
          const request = await current().api.prepareRead();
          try {
            current();
            return request;
          } catch (cause) {
            request.fill(0);
            throw cause;
          }
        }),
      receiveBegin: (input: unknown) => {
        current();
        fields(input, ['id', 'counts', 'request']);
        const v = input as { id: number; counts: WorkerFrameCounts; request: Bytes };
        fields(v.counts, ['frames', 'total']);
        if (
          flight ||
          !Number.isSafeInteger(v.id) ||
          v.id !== sequence + 1 ||
          !(v.request instanceof Uint8Array) ||
          !v.request.length ||
          v.request.length > READ_REQUEST_LIMIT ||
          v.counts.frames !== 1
        )
          throw refused();
        const assembly = createWorkerFrameReceiver(v.counts, READ_PAGE_LIMIT);
        flight = {
          id: v.id,
          phase: 'input',
          request: v.request.slice(),
          input: assembly,
          sent: false,
        };
        sequence = v.id;
      },
      receiveInput: (input: unknown) => {
        const f = requireFlight(input, ['id', 'part'], 'input');
        try {
          f.input!.accept((input as { part: WorkerFramePart }).part);
        } catch (cause) {
          erase(f);
          throw cause;
        }
      },
      receiveVerify: (input: unknown) => {
        const f = requireFlight(input, ['id'], 'input');
        f.phase = 'verifying';
        return track(async () => {
          let page: Bytes | undefined;
          try {
            const frames = f.input!.take();
            if (frames.length !== 1) {
              for (const b of frames) b.fill(0);
              throw refused();
            }
            page = frames[0]!;
            return await verify(f, page);
          } catch (cause) {
            erase(f);
            void owner()
              ?.carrier.close()
              .catch(() => {});
            throw cause;
          } finally {
            page?.fill(0);
          }
        });
      },
      receiveOutput: (input: unknown) => {
        const f = requireFlight(input, ['id'], 'prepared');
        if (!f.stream || f.sent) throw refused();
        const part = f.stream.next();
        f.sent = part.done;
        return part;
      },
      receiveFinish: (input: unknown) => {
        const f = requireFlight(input, ['id'], 'prepared');
        if (!f.sent || !f.finish?.acknowledged) throw refused();
        f.phase = 'finishing';
        return track(async () => {
          try {
            await f.finish!.acknowledged!(() => channel.request('receiveApply', { id: f.id }));
            current();
            f.complete?.();
          } finally {
            erase(f);
          }
        });
      },
    },
    async close() {
      closed = true;
      await Promise.allSettled([...jobs]);
      if (flight) erase(flight);
    },
  });
}
