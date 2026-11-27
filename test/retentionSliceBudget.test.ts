// @vitest-environment node
/** Phase 556: a preparation slice's fresh-work budget grows with what its attempt already paid
 * (change A), and every attempt opens every saved row itself (change D). Real content owner, real
 * WebCrypto and fake IndexedDB, over histories large enough for repeated full reads to show. The
 * clock is `performance.now` advancing a fixed step per call, so time measures work done. */
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { createContentOwner } from '../src/crdt/contentStore';
import { extendSpoolWitness } from '../src/crdt/spoolRecord';
import { MaintenanceInterrupted } from '../src/crdt/contentMaintenance';
import {
  createAutomaticLocalRetention,
  LOCAL_RETENTION_MIN_RECORDS as MIN,
  LOCAL_RETENTION_HOLD_MS as HOLD,
  LOCAL_RETENTION_POLL_HOLD_MS as POLLS,
  LOCAL_RETENTION_QUIET_MS as QUIET,
} from '../src/crdt/automaticLocalRetention';
import { PREPARATION_SETUP_RATIO as RATIO } from '../src/crdt/retentionPreparation';
import { cryptFor, keys } from './local-baseline/anchor-fixture';
import type { SessionTask } from '../src/crdt/writeSession';
import type { Bytes } from '../src/crdt/custodyCrypto';
// @ts-expect-error Shared independent real-protocol JavaScript fixture.
import { memberFixture } from './local-baseline/fixtures.mjs';

const probe = vi.hoisted(() => ({
  clock: 0,
  /** Clock units per WebCrypto call (plus the same per KiB); 0 while seeding. */
  cost: 1,
  /** Extra units per fresh check, so verification outweighs setup as it does at scale. */
  missCost: 10,
  /** Overrides the 2 s slice floor, in the same units as the clock. */
  slice: 200,
  /** Added to the clock by each fenced save, as if the save took that long. */
  saveCost: 0,
  identity: 'a5'.repeat(32),
  saves: 0,
  inventoryReads: 0,
  decrypts: 0,
  openedChecks: 0,
  interrupt: false,
  /** Per-attempt observations, filled by the journal wrapper. */
  firstMissAt: undefined as number | undefined,
  pauseAt: undefined as number | undefined,
  hits: 0,
  misses: 0,
  missesAfterInterrupt: 0,
  onMiss: undefined as undefined | ((freshMs: number) => void),
}));
vi.mock('../src/crdt/localBaselineMode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/crdt/localBaselineMode')>();
  return { ...actual, preparationVerifierIdentity: () => probe.identity };
});
vi.mock('../src/crdt/retentionPreparation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/crdt/retentionPreparation')>();
  return {
    ...actual,
    createPreparationJournal(options: Parameters<typeof actual.createPreparationJournal>[0]) {
      const journal = actual.createPreparationJournal({ ...options, sliceMs: probe.slice });
      const memo = journal.memo as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
      for (const name of ['check', 'checkReceipt'] as const) {
        const original = memo[name]!;
        memo[name] = async (...args: unknown[]) => {
          if (name === 'check' && String(args[0]).startsWith('opened:')) probe.openedChecks++;
          let missed = false;
          const verify = args[3] as () => Promise<unknown>;
          args[3] = () => {
            missed = true;
            probe.firstMissAt ??= performance.now();
            probe.clock += probe.missCost;
            if (probe.interrupt) probe.missesAfterInterrupt++;
            probe.onMiss?.(performance.now() - probe.firstMissAt);
            return verify();
          };
          try {
            const value = await original(...args);
            if (missed) probe.misses++;
            else probe.hits++;
            return value;
          } catch (cause) {
            if (cause instanceof actual.PreparationPause) probe.pauseAt ??= performance.now();
            throw cause;
          }
        };
      }
      return journal;
    },
  };
});
vi.mock('../src/crdt/retentionPreparationStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/crdt/retentionPreparationStorage')>();
  return {
    ...actual,
    async savePreparationDelta(...args: Parameters<typeof actual.savePreparationDelta>) {
      probe.saves++;
      const saved = await actual.savePreparationDelta(...args);
      probe.clock += probe.saveCost;
      return saved;
    },
  };
});

const cleanup: (() => void)[] = [];
afterEach(() => {
  // A scheduler case that fails before its own cleanup must not leave fake timers to the next
  // case, whose fake IndexedDB would then never settle.
  vi.useRealTimers();
  cleanup.splice(0).forEach((f) => f());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  Object.assign(probe, {
    cost: 1,
    slice: 200,
    missCost: 10,
    saveCost: 0,
    identity: 'a5'.repeat(32),
    interrupt: false,
    onMiss: undefined,
  });
});
const histories = new Map<number, Promise<{ f: ReturnType<typeof memberFixture> }>>();
/** Plaintext rows for `pairs` own positions and `pairs` received peer receipts, built once. */
function history(pairs: number) {
  let built = histories.get(pairs);
  if (!built) {
    built = (async () => {
      const f = await memberFixture();
      for (let i = 0; i < pairs; i++) {
        await f.appendOwn();
        await f.appendPeer();
      }
      return { f };
    })();
    histories.set(pairs, built);
  }
  return built;
}
const task: SessionTask = {
  signal: new AbortController().signal,
  // Queued input reaches a read-only slice through its guarded steps, as the owner's guard does.
  step: (f) => {
    if (probe.interrupt) throw new MaintenanceInterrupted([{ queuePriority: true }]);
    return f();
  },
  wait: async (f) => {
    if (probe.interrupt) throw new MaintenanceInterrupted([{ queuePriority: true }]);
    return f();
  },
};
const plain: SessionTask = { signal: task.signal, step: (f) => f(), wait: async (f) => f() };
/** A fresh store holding that history, and a reopened owner over it. */
async function device(pairs: number) {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const name of [
    'VITE_ACCOUNT_RETENTION',
    'VITE_ACCOUNT_BASELINE_READ',
    'VITE_ACCOUNT_BASELINE_INSTALL',
  ])
    vi.stubEnv(name, '1');
  const { f } = await history(pairs);
  const context = f.ctx;
  const crypt = {
    ...cryptFor(context.identity, await keys()),
    reuseOpened: true as const,
    exactBaselineReuse: true as const,
    readBaseline: true as const,
    baseline: async () => ({
      ...context,
      identity: { ...context.identity },
      route: { ...context.route },
    }),
  };
  const owners: ReturnType<typeof createContentOwner>[] = [];
  const make = () => {
    const o = createContentOwner(context.identity, 1, crypt);
    owners.push(o);
    return o;
  };
  cleanup.push(() => owners.forEach((o) => o.dispose()));
  const seed = make();
  await seed.initialize(plain, { intent: '04'.repeat(16), checkCreation() {} });
  await seed.enableSpool(plain);
  let batch: never[] = [];
  const flush = async () => {
    if (batch.length) await seed.append(plain, batch);
    batch = [];
  };
  for (const row of f.rows as { kind: string; bytes: Uint8Array }[]) {
    const event =
      row.kind === 'heads' ||
      (row.kind === 'outbound' &&
        !new TextDecoder().decode(row.bytes).startsWith('["done/source-capture/v1"'));
    if (event) {
      await flush();
      const before = await seed.spoolWitness(plain),
        after = await extendSpoolWitness(before, row.bytes as Bytes, crypto.subtle);
      await seed.appendSpool(plain, row as never, { before, after });
    } else {
      batch.push(row as never);
      if (batch.length >= 64) await flush();
    }
  }
  await flush();
  seed.dispose();
  // Count only the reduction's own work from here. The clock is the work itself: every
  // WebCrypto call costs one unit plus one per KiB it processes, as hashing, decryption and
  // signature checks dominate a reduction. `performance.now` reads that clock without moving it.
  const subtle = crypto.subtle as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  const size = (b: unknown) =>
    b instanceof ArrayBuffer ? b.byteLength : ArrayBuffer.isView(b) ? b.byteLength : 0;
  for (const [name, at] of [
    ['digest', 1],
    ['decrypt', 2],
    ['encrypt', 2],
    ['sign', 2],
    ['verify', 3],
  ] as const) {
    const original = subtle[name]!.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, name).mockImplementation(((...args: unknown[]) => {
      if (name === 'decrypt') probe.decrypts++;
      probe.clock += probe.cost * (1 + size(args[at]) / 1024);
      return original(...args);
    }) as never);
  }
  const getAll = IDBObjectStore.prototype.getAll;
  vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (
    this: IDBObjectStore,
    ...args: unknown[]
  ) {
    if (this.name === 'meta') probe.inventoryReads++;
    return getAll.apply(this, args as never);
  });
  probe.clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => probe.clock);
  const owner = make();
  await owner.initialize(plain);
  return { owner, rows: f.rows.length as number, make };
}
interface Attempt {
  kind: string;
  /** Time from the attempt's start to its first fresh check. */
  setup: number;
  /** Fresh work done before the slice paused or was interrupted. */
  fresh: number;
  hits: number;
  misses: number;
  decrypts: number;
  /** The last fenced save's duration, as the attempt saw it. */
  carried: number;
  interrupted: boolean;
}
/** Drive reductions as the composed owner does: one read-only slice, then its fenced save or the
 * commit, until removed. `interruptAfter` raises queued input once a slice has done that much
 * fresh work; `protectedUntil` is passed as the scheduler would. */
async function reduce(
  owner: Awaited<ReturnType<typeof device>>['owner'],
  options: {
    limit?: number;
    interruptAfter?: (attempt: number) => number | undefined;
    protectedUntil?: (attempt: number) => number | undefined;
  } = {},
) {
  const attempts: Attempt[] = [];
  let lastSave = 0;
  for (let n = 0; n < (options.limit ?? 400); n++) {
    Object.assign(probe, {
      firstMissAt: undefined,
      pauseAt: undefined,
      hits: 0,
      misses: 0,
      decrypts: 0,
      interrupt: false,
    });
    const at = options.interruptAfter?.(n);
    probe.onMiss =
      at === undefined
        ? undefined
        : (fresh) => {
            if (fresh >= at) probe.interrupt = true;
          };
    const start = performance.now(),
      carried = lastSave;
    let kind: string,
      interrupted = false;
    try {
      const prepared = await owner.prepareHistoryRemoval(
        task,
        async () => {},
        () => {},
        0,
        () => {},
        undefined,
        options.protectedUntil?.(n),
      );
      kind = prepared.kind;
      probe.interrupt = false;
      if (prepared.kind === 'preparation-checkpoint') {
        const t = performance.now();
        try {
          await prepared.persist(
            plain,
            async () => {},
            () => {},
          );
        } finally {
          prepared.dispose();
        }
        lastSave = performance.now() - t;
      } else if (prepared.kind === 'prepared-removal') {
        try {
          kind = (
            await prepared.commit(
              plain,
              async () => {},
              () => {},
              () => {},
            )
          ).kind;
        } finally {
          prepared.dispose();
        }
      }
    } catch (cause) {
      if (!(cause instanceof MaintenanceInterrupted)) throw cause;
      kind = 'interrupted';
      interrupted = true;
    }
    const end = probe.pauseAt ?? performance.now();
    attempts.push({
      kind,
      setup: probe.firstMissAt === undefined ? NaN : probe.firstMissAt - start,
      fresh: probe.firstMissAt === undefined ? 0 : end - probe.firstMissAt,
      hits: probe.hits,
      misses: probe.misses,
      decrypts: probe.decrypts,
      carried,
      interrupted,
    });
    if (kind === 'removed') break;
    if (!['preparation-checkpoint', 'interrupted'].includes(kind))
      throw Error('Unexpected outcome ' + kind);
  }
  return attempts;
}
const SMALL = 24,
  LARGE = 96;
beforeAll(async () => {
  await Promise.all([history(SMALL), history(LARGE)]);
}, 120_000);

it('fenced saves and full reads stay nearly flat while history grows fourfold', async () => {
  const counts = [];
  for (const pairs of [SMALL, LARGE]) {
    const d = await device(pairs);
    probe.saves = 0;
    probe.inventoryReads = 0;
    const attempts = await reduce(d.owner);
    expect(attempts.at(-1)!.kind).toBe('removed');
    counts.push({ pairs, saves: probe.saves, reads: probe.inventoryReads });
    cleanup.splice(0).forEach((f) => f());
    vi.restoreAllMocks();
  }
  const [small, large] = counts as { saves: number; reads: number }[];
  // A fixed slice makes both grow with history (at least fourfold here); a budget that grows
  // with each attempt's setup keeps them near constant.
  expect(small!.saves).toBeGreaterThan(0);
  expect(large!.saves).toBeLessThanOrEqual(small!.saves + 2);
  expect(large!.reads).toBeLessThanOrEqual(small!.reads + 6);
}, 120_000);

it('a slice pays for the last fenced save as well as its own setup', async () => {
  const d = await device(LARGE);
  // Heavy fresh checks so the reduction needs several slices, and saves far costlier than any
  // attempt's setup.
  probe.missCost = 200;
  probe.saveCost = 20_000;
  const attempts = await reduce(d.owner);
  expect(attempts.at(-1)!.kind).toBe('removed');
  const resumed = attempts.filter((a, i) => i > 0 && a.kind === 'preparation-checkpoint');
  expect(resumed.length).toBeGreaterThan(0);
  for (const a of resumed) {
    expect(a.setup).toBeLessThan(probe.saveCost);
    // At least the ratio times the save it carried, not just times its own setup.
    expect(a.fresh).toBeGreaterThanOrEqual(RATIO * a.carried);
  }
}, 120_000);

it('every attempt opens every saved row itself; no decrypted row comes from the journal', async () => {
  const d = await device(LARGE);
  probe.openedChecks = 0;
  const attempts = await reduce(d.owner);
  expect(attempts.length).toBeGreaterThan(1);
  for (const a of attempts) expect(a.decrypts).toBeGreaterThanOrEqual(d.rows);
  expect(probe.openedChecks).toBe(0);
}, 120_000);

it('a journal in progress across an update restarts cleanly and finishes', async () => {
  const d = await device(LARGE);
  // Before the update: one saved slice under the old verifier identity.
  const before = await reduce(d.owner, { limit: 1 });
  expect(before[0]!.kind).toBe('preparation-checkpoint');
  // Every release changes the identity (it hashes the whole source tree), so the saved journal's
  // context no longer matches: the next attempt starts over, and nothing halts or parks.
  probe.identity = 'b6'.repeat(32);
  const reopened = d.make();
  await reopened.initialize(plain);
  probe.openedChecks = 0;
  const after = await reduce(reopened);
  expect(after[0]!.hits).toBe(0);
  expect(after.every((a) => ['preparation-checkpoint', 'removed'].includes(a.kind))).toBe(true);
  expect(after.at(-1)!.kind).toBe('removed');
  expect(probe.openedChecks).toBe(0);
}, 120_000);

it('an interrupted long slice loses at most the ratio times its setup, and the next attempt progresses', async () => {
  const d = await device(LARGE);
  // Interrupt the second attempt deep into its slice, past what a fixed slice would allow.
  const attempts = await reduce(d.owner, {
    interruptAfter: (n) => (n === 1 ? probe.slice * 3 : undefined),
  });
  const cut = attempts[1]!;
  expect(cut.interrupted).toBe(true);
  expect(cut.fresh).toBeGreaterThan(probe.slice * 3);
  expect(cut.fresh).toBeLessThanOrEqual(RATIO * (cut.setup + cut.carried) + probe.missCost * 4);
  expect(attempts[2]!.kind).toBe('preparation-checkpoint');
  expect(attempts.at(-1)!.kind).toBe('removed');
}, 120_000);

it('a device interrupted in every long slice still finishes, with long slices again after it saves', async () => {
  const d = await device(SMALL);
  const attempts = await reduce(d.owner, { interruptAfter: () => probe.slice * 3 });
  expect(attempts.at(-1)!.kind).toBe('removed');
  expect(attempts.some((a) => a.interrupted)).toBe(true);
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i]!;
    // Every interruption cut a slice longer than three plain targets...
    if (a.interrupted) expect(a.fresh).toBeGreaterThan(probe.slice * 3);
    // ...and the attempt after it kept to the plain target and saved.
    if (a.interrupted) {
      expect(attempts[i + 1]!.kind).not.toBe('interrupted');
      expect(attempts[i + 1]!.fresh).toBeLessThanOrEqual(probe.slice + probe.missCost * 4);
    }
  }
}, 120_000);

it('queued input stops a long slice at its next guarded step, as it stops a short one', async () => {
  const d = await device(LARGE);
  probe.missesAfterInterrupt = 0;
  const attempts = await reduce(d.owner, {
    limit: 2,
    interruptAfter: (n) => (n === 1 ? probe.slice * 4 : undefined),
  });
  expect(attempts[1]!.interrupted).toBe(true);
  // Input arrived well past what a plain slice would have run...
  expect(attempts[1]!.fresh).toBeGreaterThan(probe.slice * 4);
  // ...and no further check started once it was queued.
  expect(probe.missesAfterInterrupt).toBe(0);
}, 120_000);

it('a slice never plans past the window that keeps routine sync off it', async () => {
  const d = await device(LARGE);
  // The scheduler passes when routine sync resumes, on the wall clock; the owner places it on its
  // own clock from the attempt's start. Give the second attempt a window shorter than its grown
  // budget: the slice must stop in time for its save inside the window, and use the rest of it.
  const window = 12_000;
  const attempts = await reduce(d.owner, {
    limit: 3,
    protectedUntil: (n) => (n === 1 ? Date.now() + window : undefined),
  });
  const a = attempts[1]!;
  expect(a.kind).toBe('preparation-checkpoint');
  expect(RATIO * (a.setup + a.carried)).toBeGreaterThan(window);
  expect(a.setup + a.fresh).toBeLessThanOrEqual(window - a.carried + probe.missCost * 4);
  expect(a.setup + a.fresh).toBeGreaterThan(window - a.carried - probe.missCost * 40);
}, 120_000);

it('the scheduler tells each attempt when routine sync resumes', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const controller = new AbortController();
  const seen: (number | undefined)[] = [];
  let state = {
    ready: true,
    synchronized: true,
    hold: true,
    deferPolls: true,
    hint: { revision: 0, records: MIN },
  };
  let resolve!: (o: { kind: string; reason?: string }) => void;
  const run = createAutomaticLocalRetention({
    signal: controller.signal,
    observe: () => state,
    remove: (_revision, _report, protectedUntil) =>
      new Promise((r) => {
        seen.push(protectedUntil);
        resolve = r;
      }),
  });
  run.wake();
  await vi.advanceTimersByTimeAsync(QUIET);
  // A settled hold on a device on the full check: routine sync resumes when its budget lapses,
  // and the slices that follow at once share that budget.
  expect(seen).toEqual([QUIET + HOLD]);
  resolve({ kind: 'preparation-saved' });
  await vi.advanceTimersByTimeAsync(0);
  expect(seen).toEqual([QUIET + HOLD, QUIET + HOLD]);
  // Without the hold (an ordinary device): the end of the run's idle-poll window, which before
  // anything is measured is the first window.
  state = { ...state, hold: false };
  run.refresh();
  resolve({ kind: 'preparation-saved' });
  await vi.advanceTimersByTimeAsync(0);
  expect(seen[2]).toBe(QUIET + POLLS);
  // Phase 564 (was QUIET + POLLS: the slice continuing at once shared the window): the run's save
  // ended its window, so this slice runs in the yield and keeps the plain target.
  resolve({ kind: 'preparation-saved' });
  await vi.advanceTimersByTimeAsync(0);
  expect(seen[3]).toBe(Date.now());
  // Nothing holds routine sync off (for example a hidden page or a yield): now, so the slice
  // keeps the plain target.
  state = { ...state, deferPolls: false };
  run.refresh();
  resolve({ kind: 'preparation-saved' });
  await vi.advanceTimersByTimeAsync(0);
  expect(seen[4]).toBe(Date.now());
  // Phase 564: routine sync that cannot run (an unready gate) protects against nothing, so no
  // window plans the slice, in the hold, the poll window or the yield alike.
  state = { ...state, deferPolls: true, routineSync: false } as typeof state;
  run.refresh();
  resolve({ kind: 'preparation-saved' });
  await vi.advanceTimersByTimeAsync(0);
  expect(seen[5]).toBeUndefined();
  expect(seen).toHaveLength(6);
  state = { ...state, hold: true } as typeof state;
  run.refresh();
  resolve({ kind: 'preparation-saved' });
  await vi.advanceTimersByTimeAsync(0);
  expect(seen).toHaveLength(7);
  expect(seen[6]).toBeUndefined();
  run.dispose();
  controller.abort();
  vi.useRealTimers();
});

it('the first protected slice saves what it verified, inside its window', async () => {
  // This history's first setup, with no window and no journal yet.
  const probeDevice = await device(LARGE);
  const [first] = await reduce(probeDevice.owner, { limit: 1 });
  const setup = first!.setup;
  cleanup.splice(0).forEach((f) => f());
  vi.restoreAllMocks();
  // A window shorter than the grown budget (twice the setup) plus its save, as a phone's first
  // protected attempt has. No save has been measured yet on this owner.
  const window = 2.5 * setup;
  const d = await device(LARGE);
  const attempts = await reduce(d.owner, {
    limit: 2,
    protectedUntil: (n) => (n === 0 ? Date.now() + window : undefined),
  });
  const a = attempts[0]!;
  const save = attempts[1]!.carried;
  expect(a.kind).toBe('preparation-checkpoint');
  expect(a.carried).toBe(0);
  expect(save).toBeGreaterThan(probe.missCost * 4);
  // At 76aade840 the slice planned to end at the window, leaving no time for its save, which ran
  // past it, where the next routine poll cut it and nothing was saved. Now the unmeasured save is
  // reserved at this attempt's setup: the slice ends a setup's length before the window. (In the
  // browser a save measured 0.2 to 0.6 times the setup; this clock prices hashing higher.)
  expect(a.setup + a.fresh).toBeLessThanOrEqual(window - a.setup + probe.missCost * 4);
  expect(a.fresh).toBeGreaterThan(0);
}, 120_000);

it('with no window, slices grow with the setup; held to now, they stay at the floor', async () => {
  // Heavy fresh checks, so verification is several times one setup, as at the affected size.
  const runs: { window: string; attempts: number; setup: number; work: number }[] = [];
  for (const window of ['now', 'none'] as const) {
    const d = await device(LARGE);
    probe.missCost = 20;
    const attempts = await reduce(d.owner, {
      protectedUntil: () => (window === 'now' ? Date.now() : undefined),
    });
    expect(attempts.at(-1)!.kind).toBe('removed');
    runs.push({
      window,
      attempts: attempts.length,
      setup: attempts[0]!.setup,
      work: attempts.reduce((n, a) => n + a.misses, 0) * probe.missCost,
    });
    cleanup.splice(0).forEach((f) => f());
    vi.restoreAllMocks();
    probe.missCost = 10;
  }
  const [held, free] = runs as [(typeof runs)[0], (typeof runs)[0]];
  // At 76aade840 an offline device's slices were planned against "now" (the yield) or a window
  // its setup had used up: the floor every time. Phase 564 passes no window when routine sync
  // cannot run, so the budget grows to the ratio times the setup.
  expect(held.work).toBeGreaterThan(3 * held.setup);
  expect(held.attempts).toBeGreaterThanOrEqual(4 * free.attempts);
  expect(free.attempts).toBeLessThanOrEqual(4);
}, 240_000);
