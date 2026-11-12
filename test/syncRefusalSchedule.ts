/** Phase 552: one scripted two-lane schedule under a fake clock, recorded step by step. Used by
 * the schedule control and, against the phase 551 source, to record its expected trace. */
import { fixture, flush } from './account-sync/scheduler-fixture';
import type { createSyncScheduler, SyncLane } from '../src/crdt/accountSyncDriver';
import type { SyncRefusal } from '../src/account/syncRefusal';

type Kind = 'idle' | 'progress' | 'unknown' | 'expired' | 'error';
const script: Record<SyncLane, Kind[]> = {
  send: ['unknown', 'unknown', 'unknown', 'progress', 'unknown', 'error', 'unknown', 'idle'],
  receive: ['unknown', 'expired', 'unknown', 'progress', 'unknown', 'unknown', 'idle'],
};
/** Wakes injected before these iterations, as a person or the network would cause them. */
const wakes: Record<number, ['local' | 'online' | 'remote' | 'retry', SyncLane?]> = {
  3: ['local'],
  8: ['retry', 'receive'],
  12: ['online'],
  15: ['remote'],
  21: ['retry', 'send'],
};
export interface ScheduleTrace {
  trace: unknown[];
  refusals: { send: (SyncRefusal | null)[]; receive: (SyncRefusal | null)[] };
}
/** `refusal` is attached to every step the script finishes, as the composition would attach it to
 * an `unknown` step; the scheduler must ignore it for scheduling, whatever it is. */
export async function runSchedule(
  refusal: SyncRefusal | undefined,
  factory?: typeof createSyncScheduler,
): Promise<ScheduleTrace> {
  const f = factory ? fixture(factory) : fixture();
  const used: Record<SyncLane, number> = { send: 0, receive: 0 },
    at: Record<SyncLane, number> = { send: 0, receive: 0 };
  const trace: unknown[] = [];
  const refusals: ScheduleTrace['refusals'] = { send: [], receive: [] };
  const record = (event: string) => {
    const s = f.scheduler.runtime.status;
    const lane = (name: SyncLane) => {
      const { refusal: why, ...rest } = s[name] as typeof s.send & { refusal?: SyncRefusal };
      refusals[name].push(why ?? null);
      return rest;
    };
    trace.push({
      event,
      now: f.now,
      send: lane('send'),
      receive: lane('receive'),
      timers: [...f.timers.values()].map((t) => t.at).sort((a, b) => a - b),
      calls: f.calls.map((c) => `${c.lane}@${c.at}`),
    });
  };
  f.scheduler.wake('start');
  await f.tick(0);
  record('start');
  let finished = 0;
  for (let i = 0; i < 40; i++) {
    const wake = wakes[i];
    if (wake) {
      if (wake[0] === 'retry') f.scheduler.runtime.retry(wake[1]!);
      else f.scheduler.wake(wake[0]);
      await flush();
      record(`wake ${wake.join(' ')}`);
    }
    const call = f.calls[finished];
    if (call) {
      finished++;
      const kinds = script[call.lane];
      const kind = kinds[Math.min(used[call.lane]++, kinds.length - 1)]!;
      if (kind === 'progress') at[call.lane]++;
      call.finish(kind, at[call.lane], refusal);
      await flush();
      record(`${call.lane} ${kind}`);
    } else {
      const next = [...f.timers.values()].map((t) => t.at).sort((a, b) => a - b)[0];
      if (next === undefined) break;
      await f.tick(next - f.now);
      record('tick');
    }
  }
  // Settle a step still outstanding so the scheduler can close.
  const closing = f.scheduler.dispose();
  for (const call of f.calls.slice(finished)) call.finish('idle', at[call.lane]);
  await closing;
  return { trace, refusals };
}
type LaneTrace = {
  phase: string;
  failures: number;
  nextAttemptAt: number | null;
  reason: string | null;
  issueSince: number | null;
  lastSuccessAt: number | null;
  acceptedThrough?: number;
  receivedThrough?: number;
};
/** One line per recorded moment: the clock, then for each lane its phase, failure count, next
 * attempt, reason, issue start, last success and position, then the armed timers and calls. */
export function compactTrace(trace: unknown[]): string[] {
  const lane = (l: LaneTrace) =>
    [
      l.phase,
      l.failures,
      l.nextAttemptAt,
      l.reason,
      l.issueSince,
      l.lastSuccessAt,
      l.acceptedThrough ?? l.receivedThrough,
    ].join(',');
  return (
    trace as {
      event: string;
      now: number;
      send: LaneTrace;
      receive: LaneTrace;
      timers: number[];
      calls: string[];
    }[]
  ).map(
    (e) =>
      `${e.event} @${e.now} | send ${lane(e.send)} | receive ${lane(e.receive)} | timers ${e.timers.join(' ')} | calls ${e.calls.length}`,
  );
}
