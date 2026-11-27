// @vitest-environment node
/** Phase 546: a full-check device may hold routine sync only while reduction makes progress.
 * Real scheduler and clocks (faked), observed over simulated hours; the owner is mocked. */
import { afterEach, expect, it, vi } from 'vitest';
import {
  createAutomaticLocalRetention,
  LOCAL_RETENTION_MIN_RECORDS as MIN,
  LOCAL_RETENTION_HOLD_MS as HOLD,
  LOCAL_RETENTION_HOLD_YIELD_MS as YIELD,
  LOCAL_RETENTION_RETRY_MS as RETRY,
  type LocalRetentionObservation,
} from '../src/crdt/automaticLocalRetention';

afterEach(() => {
  vi.useRealTimers();
});
const HOUR = 3600000;
type Outcome = { kind: string; reason?: string };
interface Options {
  /** How long each attempt runs before its outcome. */
  attemptMs?: number;
  /** New writing or sync changes this device's history this often (a new owner hint). */
  growEvery?: number;
}
/** A device on the full ledger check whose lanes park at once under a hold, as the composed owner
 * reports them, with the owner's routine readiness refreshes every ten seconds. */
function device(outcome: (attempt: number) => Outcome, options: Options = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const controller = new AbortController();
  let records = MIN * 2,
    attempts = 0;
  const heldAt: number[] = [];
  const run = createAutomaticLocalRetention({
    signal: controller.signal,
    observe: (): LocalRetentionObservation => ({
      ready: true,
      synchronized: true,
      hold: true,
      deferPolls: true,
      hint: { revision: 0, records },
    }),
    remove: async () => {
      const n = attempts++;
      heldAt.push(run.hold?.send ? 1 : 0);
      if (options.attemptMs) await new Promise((r) => setTimeout(r, options.attemptMs));
      return outcome(n);
    },
  });
  // Exact held time: integrate the published hold between its transitions.
  let since: number | undefined,
    held = 0;
  const observe = () => {
    const holding = run.hold?.send === true;
    if (holding && since === undefined) since = Date.now();
    if (!holding && since !== undefined) {
      held += Date.now() - since;
      since = undefined;
    }
  };
  run.onStatus(observe);
  run.wake();
  return {
    run,
    controller,
    get attempts() {
      return attempts;
    },
    /** Whether each attempt started under the full hold. */
    heldAt,
    grow() {
      records++;
      run.refresh();
    },
    async simulate(ms: number) {
      const step = 10000;
      for (let t = 0; t < ms; t += step) {
        await vi.advanceTimersByTimeAsync(step);
        if (options.growEvery && (t + step) % options.growEvery === 0) records++;
        run.refresh();
        observe();
      }
      const total = held + (since !== undefined ? Date.now() - since : 0);
      return total;
    },
  };
}
const skipped = (reason: string) => () => ({ kind: 'skipped', reason });
/** Every no-progress outcome a removal can return, and an unknown later reason. */
const noProgress = [
  'durable-attempt',
  'pending-promotion',
  'activity-or-journal',
  'already-preparing',
  'ineligible',
  'capacity',
  'history-required',
  'a-later-reason',
];

for (const reason of noProgress)
  it(`with every attempt skipped as ${reason}, six hours hold sync for at most one budget`, async () => {
    const d = device(skipped(reason));
    const held = await d.simulate(6 * HOUR);
    process.stderr.write(
      `\nDUTY ${reason} unchanged-history held=${held}ms fraction=${(held / (6 * HOUR)).toFixed(4)} attempts=${d.attempts} status=${d.run.status.reason}\n`,
    );
    expect(held).toBeLessThanOrEqual(HOLD);
    d.controller.abort();
  });

it('a saved attempt that never settles holds sync at most once, even while history keeps changing', async () => {
  // A history snapshot waiting for another device: every check refuses before preparation.
  const d = device(skipped('durable-attempt'), { growEvery: 10 * 60000 });
  const held = await d.simulate(6 * HOUR);
  process.stderr.write(
    `\nDUTY durable-attempt changing-history held=${held}ms fraction=${(held / (6 * HOUR)).toFixed(4)} attempts=${d.attempts}\n`,
  );
  expect(held).toBeLessThanOrEqual(HOLD);
  // It parks until history changes: one check per change, not one per minute.
  expect(d.attempts).toBeLessThanOrEqual(1 + 6 * 6);
  expect(d.heldAt.slice(1).every((h) => h === 0)).toBe(true);
  expect(d.run.status.reason).toBe('durable-attempt');
  d.controller.abort();
});

it('capacity and missing history still spend the hold while history keeps changing', async () => {
  for (const reason of ['capacity', 'history-required']) {
    const d = device(skipped(reason), { growEvery: 10 * 60000 });
    const held = await d.simulate(6 * HOUR);
    expect(held).toBeLessThanOrEqual(HOLD);
    expect(d.heldAt.slice(1).every((h) => h === 0)).toBe(true);
    d.controller.abort();
    vi.useRealTimers();
  }
});

it('a device that can reduce keeps its held windows across budgets and completes', async () => {
  // Each slice takes 20 s; 30 slices outlast one five-minute budget, so the hold must come back
  // after its yield because the window made progress.
  const d = device((n) => (n < 30 ? { kind: 'preparation-saved' } : { kind: 'removed' }), {
    attemptMs: 20000,
  });
  // Thirty minutes: the removal finishes near eleven, and its cooldown is another thirty.
  const held = await d.simulate(HOUR / 2);
  expect(d.run.diagnostics).toMatchObject({ completions: 1 });
  expect(d.attempts).toBe(31);
  // Held through the first budget, unheld in the yield, then held again.
  expect(d.heldAt.slice(0, 5).every((h) => h === 1)).toBe(true);
  expect(d.heldAt.includes(0)).toBe(true);
  expect(d.heldAt.at(-1)).toBe(1);
  expect(held).toBeGreaterThan(HOLD);
  expect(held).toBeLessThan(31 * 20000);
  d.controller.abort();
});

it('once the saved attempt settles, an unheld check makes progress and the hold returns', async () => {
  let settled = false,
    slices = 0;
  const d = device(() => {
    if (!settled) return { kind: 'skipped', reason: 'durable-attempt' };
    return slices++ < 3 ? { kind: 'preparation-saved' } : { kind: 'removed' };
  });
  await d.simulate(HOUR);
  expect(d.run.status).toMatchObject({ phase: 'idle', reason: 'durable-attempt' });
  const before = d.attempts;
  settled = true; // the other device verified the snapshot; its writing arrives
  d.grow();
  await d.simulate(RETRY + YIELD);
  expect(d.attempts).toBe(before + 4);
  expect(d.run.diagnostics).toMatchObject({ completions: 1 });
  // The first check after the change runs unheld; the slices after its progress are held.
  expect(d.heldAt.slice(before)).toEqual([0, 1, 1, 1]);
  d.controller.abort();
});

it('Check again lets a parked saved-attempt device hold sync for one more check', async () => {
  const d = device(skipped('durable-attempt'));
  await d.simulate(HOUR);
  const before = d.attempts;
  expect(d.run.retry()).toBe(true);
  await d.simulate(RETRY);
  expect(d.attempts).toBe(before + 1);
  expect(d.heldAt.at(-1)).toBe(1);
  d.controller.abort();
});
