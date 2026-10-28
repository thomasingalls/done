// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import {
  createAutomaticServiceHistory,
  hasAutomaticServiceHistory,
  SERVICE_HISTORY_QUIET_MS as QUIET,
  SERVICE_HISTORY_MIN_RECORDS as MIN,
  SERVICE_HISTORY_INTERVAL_MS as INTERVAL,
  SERVICE_HISTORY_RETRY_MS as RETRY,
} from '../src/account/automaticHistoryMaintenance';
import type {
  HistoryMaintenanceStatus,
  HistoryMaintenanceCommand,
} from '../src/account/historyMaintenance';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
const none = (sequence = 0): HistoryMaintenanceStatus => ({
  sequence,
  pending: 'none',
  canDiscard: false,
});
const pending = (value: HistoryMaintenanceStatus['pending']): HistoryMaintenanceStatus => ({
  sequence: 0,
  pending: value,
  canDiscard: true,
});
function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  let ready = true;
  let hint: { revision: number; records: number } | undefined = { revision: 0, records: MIN };
  let answer: (
    command: HistoryMaintenanceCommand,
  ) => Promise<HistoryMaintenanceStatus> = async () => none();
  const commands: string[] = [],
    controller = new AbortController();
  const run = createAutomaticServiceHistory({
    signal: controller.signal,
    observe: () => ({ ready, hint }),
    run: async (c) => {
      commands.push(c);
      return answer(c);
    },
    retryable: (e) => e === 'network',
  });
  return {
    run,
    commands,
    controller,
    ready: (v: boolean) => {
      ready = v;
    },
    hint: (v: typeof hint) => {
      hint = v;
    },
    answer: (v: typeof answer) => {
      answer = v;
    },
    tick: (n: number) => vi.advanceTimersByTimeAsync(n),
  };
}
it('requires a separate explicit experimental opt-in', () => {
  for (const value of ['', '0', 'true', '1']) {
    vi.stubEnv('VITE_ACCOUNT_HISTORY_AUTO', value);
    expect(hasAutomaticServiceHistory()).toBe(value === '1');
  }
});
it('inspects once after quiet even without growth and never polls an unchanged catalog', async () => {
  const f = fixture();
  f.hint({ revision: 0, records: MIN - 1 });
  f.run.refresh();
  await f.tick(QUIET - 1);
  expect(f.commands).toEqual([]);
  await f.tick(1);
  expect(f.commands).toEqual(['inspect']);
  await f.tick(INTERVAL * 2);
  expect(f.commands).toEqual(['inspect']);
  expect(vi.getTimerCount()).toBe(0);
  f.run.dispose();
});
it('rechecks readiness and quiet without prompting or retaining authority', async () => {
  const f = fixture();
  f.hint({ revision: 0, records: 0 });
  f.run.refresh();
  f.ready(false);
  await f.tick(QUIET);
  expect(f.commands).toEqual([]);
  f.ready(true);
  f.run.activity();
  await f.tick(QUIET - 1);
  expect(f.commands).toEqual([]);
  f.hint({ revision: 0, records: 0 });
  await f.tick(1);
  expect(f.commands).toEqual(['inspect']);
  f.run.dispose();
});
it('creates only for growth, keeps a one-hour cadence and waits for a new event', async () => {
  const f = fixture();
  let sequence = 0;
  f.answer(async (c) =>
    c === 'create'
      ? none(++sequence)
      : c === 'prune'
        ? { ...none(sequence), pruned: true }
        : none(sequence),
  );
  f.run.refresh();
  await f.tick(QUIET);
  expect(f.commands).toEqual(['inspect', 'create']);
  f.hint({ revision: 0, records: MIN * 2 });
  f.run.refresh();
  await f.tick(INTERVAL);
  expect(f.commands).toHaveLength(2);
  f.run.refresh();
  await f.tick(0);
  expect(f.commands).toEqual(['inspect', 'create', 'inspect', 'create', 'prune']);
  f.run.dispose();
});
it('parks a producer waiting for another device, even with large growth and routine refreshes', async () => {
  const f = fixture();
  f.answer(async () => pending('waiting'));
  f.run.refresh();
  await f.tick(QUIET);
  f.run.refresh();
  f.run.activity();
  await f.tick(INTERVAL * 3);
  expect(f.commands).toEqual(['inspect']);
  expect(f.run.status.reason).toBe('peer');
  expect(vi.getTimerCount()).toBe(0);
  f.answer(async () => none());
  f.run.hint();
  await f.tick(0);
  expect(f.commands).toEqual(['inspect', 'inspect', 'create']);
  f.run.dispose();
});
it('keeps observed service growth due when local reduction resets the physical suffix', async () => {
  const f = fixture();
  f.run.refresh();
  f.hint({ revision: 1, records: 0 });
  f.run.refresh();
  await f.tick(QUIET);
  expect(f.commands).toEqual(['inspect', 'create']);
  f.run.refresh();
  await f.tick(INTERVAL);
  expect(f.commands).toHaveLength(2);
  f.run.dispose();
});
it('keeps scheduling growth across custody refresh without treating it as authorization', async () => {
  const f = fixture();
  f.answer(async (c) => {
    if (c === 'inspect') f.hint(undefined);
    return none();
  });
  f.run.refresh();
  await f.tick(QUIET);
  expect(f.commands).toEqual(['inspect', 'create']);
  f.run.dispose();
});
it('never discards stale progress, never verifies its own waiting proposal', async () => {
  const f = fixture();
  f.answer(async () => pending('stale'));
  f.run.refresh();
  await f.tick(QUIET);
  await f.tick(INTERVAL);
  expect(f.commands).toEqual(['inspect']);
  expect(f.run.status.reason).toBe('stale');
  expect(f.run.status.history?.canDiscard).toBe(true);
  f.run.dispose();
});
it('resumes exact saved owner work and admits peer work through existing commands', async () => {
  for (const next of ['resume', 'verify'] as const) {
    const f = fixture();
    f.hint({ revision: 0, records: 0 });
    f.answer(async (c) => (c === 'inspect' ? pending(next) : none(1)));
    f.run.refresh();
    await f.tick(QUIET);
    expect(f.commands).toEqual(['inspect', next]);
    f.run.dispose();
  }
});
it('delegates pruning only after two snapshots and deduplicates an unchanged sequence', async () => {
  const f = fixture();
  f.hint({ revision: 0, records: 0 });
  f.answer(async (c) => (c === 'prune' ? { ...none(2), pruned: true } : none(2)));
  f.run.refresh();
  await f.tick(QUIET);
  f.run.hint();
  await f.tick(0);
  expect(f.commands).toEqual(['inspect', 'prune', 'inspect']);
  f.run.dispose();
});
it('input and newer control evidence stop the action chain and force a fresh inspect', async () => {
  const f = fixture();
  let done!: (v: HistoryMaintenanceStatus) => void;
  f.answer(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  f.run.refresh();
  await f.tick(QUIET);
  f.run.activity();
  f.run.hint();
  done(none(2));
  await f.tick(QUIET - 1);
  expect(f.commands).toEqual(['inspect']);
  f.answer(async () => none(1));
  await f.tick(1);
  expect(f.commands).toEqual(['inspect', 'inspect', 'create']);
  f.run.dispose();
});
it('backs off transport failures without polling or letting repeated hints erase the clock', async () => {
  const f = fixture();
  f.answer(async () => {
    throw 'network';
  });
  f.run.refresh();
  await f.tick(QUIET);
  await f.tick(RETRY * 10);
  expect(f.commands).toEqual(['inspect']);
  f.run.hint();
  await f.tick(0);
  expect(f.commands).toHaveLength(2);
  f.run.hint();
  await f.tick(RETRY * 2 - 1);
  expect(f.commands).toHaveLength(2);
  await f.tick(1);
  expect(f.commands).toHaveLength(3);
  f.run.dispose();
});
it('halts on integrity/unknown owner failures and ignores late closed results', async () => {
  const f = fixture();
  f.answer(async () => {
    throw Error('do not expose private diagnostics');
  });
  f.run.refresh();
  await f.tick(QUIET);
  f.run.hint();
  await f.tick(INTERVAL);
  expect(f.commands).toEqual(['inspect']);
  expect(f.run.status).toEqual({ phase: 'halted', reason: 'owner-error' });
  f.run.dispose();
  const g = fixture();
  let done!: (v: HistoryMaintenanceStatus) => void;
  g.answer(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  g.run.refresh();
  await g.tick(QUIET);
  g.controller.abort();
  done(none(9));
  await g.tick(0);
  expect(g.run.status).toEqual({ phase: 'closed', reason: undefined });
  expect(vi.getTimerCount()).toBe(0);
});
it('keeps retry escalation when inspection succeeds but the mutation stays unavailable', async () => {
  const f = fixture();
  f.answer(async (c) => {
    if (c === 'create') throw 'network';
    return none();
  });
  f.run.refresh();
  await f.tick(QUIET);
  f.run.hint();
  await f.tick(RETRY);
  expect(f.commands).toEqual(['inspect', 'create', 'inspect', 'create']);
  f.run.hint();
  await f.tick(RETRY * 2 - 1);
  expect(f.commands).toHaveLength(4);
  await f.tick(1);
  expect(f.commands).toHaveLength(6);
  f.run.dispose();
});
it('refuses an unconfirmed prune instead of repeatedly treating it as permission', async () => {
  const f = fixture();
  f.hint({ revision: 0, records: 0 });
  f.answer(async () => none(2));
  f.run.refresh();
  await f.tick(QUIET);
  expect(f.commands).toEqual(['inspect', 'prune']);
  expect(f.run.status.phase).toBe('halted');
  f.run.dispose();
});
it('keeps status snapshots isolated and observer failures outside the owner', async () => {
  const f = fixture();
  f.hint({ revision: 0, records: 0 });
  const answer = none(1);
  f.answer(async () => answer);
  f.run.onStatus(() => {
    throw Error('observer');
  });
  f.run.refresh();
  await f.tick(QUIET);
  answer.sequence = 42;
  expect(f.run.status.history?.sequence).toBe(1);
  expect(Object.isFrozen(f.run.status.history)).toBe(true);
  f.run.dispose();
});
