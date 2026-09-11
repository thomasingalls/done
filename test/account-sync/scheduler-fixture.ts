import {
  createSyncScheduler,
  type SyncLane,
  type OutboundStep,
} from '../../src/crdt/accountSyncDriver';
import type { ReceiveStep } from '../../src/crdt/accountReceiveDriver';
import type { DriverGate } from '../../src/crdt/accountDriver';
export const flush = async () => {
  for (let n = 0; n < 30; n++) await Promise.resolve();
};
export function fixture(factory = createSyncScheduler) {
  let now = 0,
    serial = 0,
    gate: DriverGate = 'ready',
    active = 0,
    maximum = 0,
    detached = 0;
  const controller = new AbortController(),
    timers = new Map<number, { at: number; run: () => void }>();
  const calls: {
    lane: SyncLane;
    at: number;
    finish: (
      kind: 'idle' | 'progress' | 'unknown' | 'paused' | 'blocked' | 'error',
      position?: number,
    ) => void;
  }[] = [];
  const step = (lane: SyncLane) => {
    active++;
    maximum = Math.max(maximum, active);
    return new Promise<OutboundStep | ReceiveStep>((yes, no) => {
      calls.push({
        lane,
        at: now,
        finish(kind, position = 0) {
          active--;
          if (kind === 'error') {
            no(Error('controlled failure'));
            return;
          }
          const progress =
            lane === 'send' ? { acceptedThrough: position } : { receivedThrough: position };
          if (kind === 'blocked') yes({ kind, ...progress, reason: 'conflict' });
          else yes({ kind, ...progress });
        },
      });
    });
  };
  const scheduler = factory({
    signal: controller.signal,
    gate: () => gate,
    detach() {
      detached++;
    },
    clock: {
      now: () => now,
      set(run, delay) {
        timers.set(++serial, { at: now + delay, run });
        return serial;
      },
      clear(id) {
        timers.delete(id as number);
      },
    },
    send: () => step('send') as Promise<OutboundStep>,
    receive: () => step('receive') as Promise<ReceiveStep>,
  });
  return {
    scheduler,
    controller,
    timers,
    calls,
    setGate(value: DriverGate) {
      gate = value;
    },
    get gate() {
      return gate;
    },
    get now() {
      return now;
    },
    get active() {
      return active;
    },
    get maximum() {
      return maximum;
    },
    get detached() {
      return detached;
    },
    async tick(ms: number) {
      const end = now + ms;
      let budget = 100;
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next || next[1].at > end) break;
        if (--budget === 0) throw Error('spin');
        now = next[1].at;
        timers.delete(next[0]);
        next[1].run();
        await flush();
      }
      now = end;
      await flush();
    },
  };
}
