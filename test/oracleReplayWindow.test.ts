// @vitest-environment node
// Phase 549: a reduced device's completed background replay is kept, not discarded. The warm
// audit's full semantic oracle replays the whole local baseline while the serialized storage
// queue waits. From the moment that replay completes until the new reuse view records the
// oracle, queued foreground work does not interrupt it; suspension, new local input, the owner
// closing and both authority checks still do, and so does queued work before the replay.
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { createContentOwner, type ContentCrypto } from '../src/crdt/contentStore';
import { extendSpoolWitness } from '../src/crdt/spoolRecord';
import { budgetedTask } from '../src/crdt/cpuBudget';
import {
  MaintenanceInterrupted,
  isPriorityOnlyMaintenanceInterruption,
  maintenanceTask,
  warmAuditInterruptible,
} from '../src/crdt/contentMaintenance';
import { createVerifiedRecords } from '../src/crdt/verifiedRecords';
import { WARM_AUDIT_MS } from '../src/crdt/warmContent';
import { Y } from '../src/crdt/yjs';
import type { OpenedRecord } from '../src/crdt/contentRecord';
import type { LocalBaselineContext } from '../src/crdt/localBaselineReplay';
import type { SessionTask } from '../src/crdt/writeSession';
import { cryptFor, keys } from './local-baseline/anchor-fixture';
// @ts-expect-error Shared independent real protocol fixture.
import { memberFixture } from './local-baseline/fixtures.mjs';

// Observation seams only: the replay and the continuation index pass run unchanged.
const H = vi.hoisted(() => ({
  replays: 0,
  replayStart: () => {},
  replayEnd: () => {},
  indexStart: () => {},
}));
vi.mock('../src/crdt/localBaselineShadow', async (importOriginal) => {
  const m = await importOriginal<typeof import('../src/crdt/localBaselineShadow')>();
  return {
    ...m,
    verifyCompleteLocalBaseline: async (...a: Parameters<typeof m.verifyCompleteLocalBaseline>) => {
      H.replayStart();
      const result = await m.verifyCompleteLocalBaseline(...a);
      H.replays++;
      H.replayEnd();
      return result;
    },
  };
});
vi.mock('../src/crdt/localBaselineReuse', async (importOriginal) => {
  const m = await importOriginal<typeof import('../src/crdt/localBaselineReuse')>();
  return {
    ...m,
    createBaselineReuse: (...a: Parameters<typeof m.createBaselineReuse>) => {
      H.indexStart();
      return m.createBaselineReuse(...a);
    },
  };
});

const clean: (() => void)[] = [];
afterEach(() => {
  H.replayStart = H.replayEnd = H.indexStart = () => {};
  clean.splice(0).forEach((f) => f());
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const plain: SessionTask = {
  signal: new AbortController().signal,
  step: (f) => f(),
  wait: async (f) => f(),
};

// The returning device of investigation 16 read about 285 rows in each full read, from a
// document of about 1 MB. This reduced owner holds a 1,000,000-character baseline and 20 own
// capsules plus 120 peer receipts after its reduction: 381 opened records per full read.
const BASELINE_CHARS = 1_000_000,
  OWN_AFTER = 20,
  PEERS_AFTER = 120;

async function reducedDevice() {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubEnv('VITE_ACCOUNT_RETENTION', '1');
  vi.stubEnv('VITE_ACCOUNT_BASELINE_READ', '1');
  vi.stubEnv('VITE_ACCOUNT_BASELINE_INSTALL', '1');
  const f = await memberFixture();
  clean.push(f.clear);
  const context: LocalBaselineContext = f.ctx;
  const hooks = { authority: () => {}, validate: () => {} };
  let inbound = context.inbound;
  // As accountReceive.ts: each authority check takes a step on the task that asked, and so
  // does the returned context's own assertion.
  const authority = vi.fn(async (task: SessionTask) => {
    hooks.authority();
    task.step(() => {});
    return {
      ...context,
      inbound,
      identity: { ...context.identity },
      route: { ...context.route },
      assertCurrent: () => task.step(() => {}),
    };
  });
  // As accountReceive.ts's reduced validator: the full ledger check over the replayed baseline.
  const verified = createVerifiedRecords<object>({ ownResults: true });
  clean.push(() => verified.clear());
  const validate: NonNullable<ContentCrypto['validate']> = async (
    records,
    task,
    _counter,
    view,
    baseline,
  ) => {
    hooks.validate();
    if (!baseline) return;
    await verified.verify(
      records,
      view ?? {},
      async () => ({
        ...structuredClone(baseline.ledger),
        baseline: structuredClone({
          anchor: baseline.anchor,
          firstSuffix: baseline.firstSuffix,
          records: baseline.records,
        }),
      }),
      () => task.step(() => {}),
    );
  };
  const crypt = {
    ...cryptFor(context.identity, await keys()),
    reuseOpened: true as const,
    warmLoads: true as const,
    readBaseline: true as const,
    baseline: authority,
    validate,
  };
  const owner = createContentOwner(context.identity, 1, crypt);
  clean.push(() => owner.dispose());
  await owner.initialize(plain, { intent: '04'.repeat(16), checkCreation() {} });
  await owner.enableSpool(plain);
  let persisted = 0;
  const append = async () => {
    for (const row of (f.rows as OpenedRecord[]).slice(persisted)) {
      const event =
        row.kind === 'heads' ||
        (row.kind === 'outbound' &&
          !new TextDecoder().decode(row.bytes).startsWith('["done/source-capture/v1"'));
      if (event) {
        const before = await owner.spoolWitness(plain),
          after = await extendSpoolWitness(before, row.bytes, crypto.subtle);
        await owner.appendSpool(plain, row, { before, after });
      } else await owner.append(plain, [row]);
      persisted++;
    }
  };
  await f.appendOwn();
  await f.appendPeer();
  await append();
  const doc = new Y.Doc({ gc: false });
  let update: Uint8Array<ArrayBuffer> | undefined;
  doc.on('update', (u: Uint8Array) => (update = new Uint8Array(u)));
  doc.getText('big').insert(0, 'y'.repeat(BASELINE_CHARS));
  doc.destroy();
  await owner.append(plain, [{ kind: 'update', bytes: update! }]);
  await owner.removeHistory(
    plain,
    async () => {},
    () => {},
    0,
  );
  for (const row of (await owner.loadAccount(plain)).records) row.bytes.fill(0);
  for (let i = 0; i < OWN_AFTER; i++) await f.appendOwn();
  for (let i = 0; i < PEERS_AFTER; i++) await f.appendPeer();
  await append();
  const adopted = await owner.loadAccount(plain);
  if (adopted.kind !== 'baseline-plus-suffix') throw Error('Expected a reduced owner');
  const records = adopted.records.length;
  for (const row of adopted.records) row.bytes.fill(0);

  // The Worker's warm-audit task stack (accountCapture.ts), with test-controlled conditions.
  const conditions = { suspended: false, input: false, foreground: false };
  const lifetime = new AbortController();
  const parent: SessionTask = { ...plain, signal: lifetime.signal };
  const auditTask = () =>
    maintenanceTask(
      budgetedTask(
        warmAuditInterruptible(parent, owner, {
          suspended: () => conditions.suspended,
          inputSince: () => conditions.input,
          foregroundPending: () => conditions.foreground,
        }),
      ),
      parent.signal,
    );
  // One audit attempt as the scheduler runs it: slices until complete, or the first refusal.
  const attempt = async (): Promise<'completed' | unknown> => {
    try {
      for (let n = 0; n < 100; n++) if (await owner.auditWarm(auditTask())) return 'completed';
      throw Error('Audit did not complete');
    } catch (cause) {
      return cause;
    }
  };
  // The queued foreground job runs once the audit job has ended, then settles.
  const foreground = async () => {
    const reads = vi.spyOn(IDBObjectStore.prototype, 'getAll');
    for (const row of (await owner.loadAccount(plain)).records) row.bytes.fill(0);
    const fullRead = reads.mock.calls.length > 0;
    reads.mockRestore();
    conditions.foreground = false;
    return fullRead;
  };
  // The oracle falls due by time, as after WARM_AUDIT_MS in the app.
  const real = performance.now.bind(performance);
  let offset = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => real() + offset);
  const oracleDue = () => {
    offset += WARM_AUDIT_MS + 1;
    expect(owner.warmAuditDue()).toBe(true);
  };
  return {
    owner,
    records,
    hooks,
    conditions,
    lifetime,
    attempt,
    foreground,
    oracleDue,
    replaceAuthority: () => (inbound = { ...inbound }),
  };
}
type Device = Awaited<ReturnType<typeof reducedDevice>>;

it('the reduced device reads its realistic history in full on every oracle', async () => {
  const x = await reducedDevice();
  expect(x.records).toBe(381);
  x.oracleDue();
  const before = H.replays;
  expect(await x.attempt()).toBe('completed');
  expect(H.replays - before).toBe(1);
  expect(x.owner.warmAuditDue()).toBe(false);
}, 60000);

// A job queued while the replay's last synchronous stretch runs reaches the owner at its first
// event-loop turn, which comes after the replay returns: the case investigation 16 measured.
// `open`: whether the window is already open when the work is queued. As the replay returns, the
// replay has not yet handed its result back, so the window opens just after.
const arrivals: readonly {
  readonly name: string;
  readonly arm: (x: Device, queue: () => void) => void;
  readonly open: boolean;
}[] = [
  { name: 'as the replay returns', arm: (_x, queue) => (H.replayEnd = queue), open: false },
  {
    name: 'at the authority re-check after the replay',
    arm: (x, queue) => (H.replayEnd = () => (x.hooks.authority = queue)),
    open: true,
  },
  { name: 'during validation', arm: (x, queue) => (x.hooks.validate = queue), open: true },
  {
    name: 'during the continuation index pass',
    arm: (_x, queue) => (H.indexStart = queue),
    open: true,
  },
];
for (const arrival of arrivals)
  it(`queued work arriving ${arrival.name} waits for the oracle to be recorded`, async () => {
    const x = await reducedDevice();
    x.oracleDue();
    let open: boolean[] = [];
    const queue = () => {
      x.conditions.foreground = true;
      open.push(x.owner.recordingOracle());
    };
    arrival.arm(x, queue);
    const before = H.replays;
    const outcome = await x.attempt();
    H.replayStart = H.replayEnd = H.indexStart = () => {};
    x.hooks.authority = x.hooks.validate = () => {};
    // Recorded, from this one replay. Queued work interrupts again at the very next step.
    expect(H.replays - before).toBe(1);
    expect(x.owner.warmAuditDue()).toBe(false);
    expect(x.owner.recordingOracle()).toBe(false);
    expect(outcome).toBeInstanceOf(MaintenanceInterrupted);
    expect(isPriorityOnlyMaintenanceInterruption(outcome)).toBe(true);
    expect(open).toEqual([arrival.open]);
    // The queued job takes the warm path; nothing moved onto it.
    expect(await x.foreground()).toBe(false);
    open = [];
    expect(await x.attempt()).toBe('completed');
    expect(H.replays - before).toBe(1);
  }, 60000);

it('continuous receive: every oracle attempt meets queued work as its replay returns', async () => {
  // Investigation 16: during catch-up the receive lane always has work queued, so each oracle
  // replay was thrown away and the oracle restarted as soon as the queue drained.
  const x = await reducedDevice();
  x.oracleDue();
  H.replayEnd = () => (x.conditions.foreground = true);
  const before = H.replays;
  const due: boolean[] = [];
  for (let n = 0; n < 5; n++) {
    await x.attempt();
    due.push(x.owner.warmAuditDue());
    await x.foreground();
  }
  expect(H.replays - before).toBe(1);
  expect(due).toEqual([false, false, false, false, false]);
}, 60000);

it('queued work before the replay starts still interrupts the oracle, and leaves no window behind', async () => {
  const x = await reducedDevice();
  x.oracleDue();
  // The oracle load's first authority check precedes its replay.
  x.hooks.authority = () => (x.conditions.foreground = true);
  const before = H.replays;
  const outcome = await x.attempt();
  x.hooks.authority = () => {};
  expect(outcome).toBeInstanceOf(MaintenanceInterrupted);
  expect(isPriorityOnlyMaintenanceInterruption(outcome)).toBe(true);
  expect(H.replays - before).toBe(0);
  expect(x.owner.warmAuditDue()).toBe(true);
  expect(await x.foreground()).toBe(false); // The oracle stays off the foreground load.
  // The interrupted oracle's mark does not carry over: a return-to-app read that the next audit
  // absorbs still yields to work first seen as its replay returns, and stays due (phase 545).
  x.owner.invalidateWarm();
  const open: boolean[] = [];
  H.replayEnd = () => {
    x.conditions.foreground = true;
    x.hooks.authority = () => open.push(x.owner.recordingOracle());
  };
  const absorbed = await x.attempt();
  H.replayEnd = () => {};
  x.hooks.authority = () => {};
  expect(open).toEqual([false]);
  expect(absorbed).toBeInstanceOf(MaintenanceInterrupted);
  expect(H.replays - before).toBe(1);
  expect(await x.foreground()).toBe(true);
}, 60000);

// Before the replay completes, nothing changes: what the replay's own checks see stops it.
const beforeCompletion: readonly {
  readonly name: string;
  readonly arm: (x: Device) => void;
  readonly replays: number;
  readonly priorityOnly: boolean;
}[] = [
  {
    name: 'queued work seen inside the replay',
    arm: (x) => (H.replayStart = () => (x.conditions.foreground = true)),
    replays: 0,
    priorityOnly: true,
  },
  {
    name: 'new local input seen inside the replay',
    arm: (x) => (H.replayStart = () => (x.conditions.input = true)),
    replays: 0,
    priorityOnly: false,
  },
  {
    name: 'new local input seen as the replay returns',
    arm: (x) => (H.replayEnd = () => (x.conditions.input = true)),
    replays: 1,
    priorityOnly: false,
  },
];
for (const control of beforeCompletion)
  it(`${control.name} still interrupts the oracle and discards the replay, as before`, async () => {
    const x = await reducedDevice();
    x.oracleDue();
    control.arm(x);
    const before = H.replays;
    const outcome = await x.attempt();
    H.replayStart = H.replayEnd = () => {};
    expect(outcome).toBeInstanceOf(MaintenanceInterrupted);
    expect(isPriorityOnlyMaintenanceInterruption(outcome)).toBe(control.priorityOnly);
    expect(H.replays - before).toBe(control.replays);
    expect(x.owner.warmAuditDue()).toBe(true);
    expect(x.owner.recordingOracle()).toBe(false);
  }, 60000);

it('a return-to-app read in the audit is not the oracle: queued work after its replay still interrupts it', async () => {
  const x = await reducedDevice();
  x.oracleDue();
  x.owner.invalidateWarm();
  const open: boolean[] = [];
  H.replayEnd = () => {
    x.conditions.foreground = true;
    x.hooks.authority = () => open.push(x.owner.recordingOracle());
  };
  const before = H.replays;
  const outcome = await x.attempt();
  H.replayEnd = () => {};
  x.hooks.authority = () => {};
  expect(outcome).toBeInstanceOf(MaintenanceInterrupted);
  expect(open).toEqual([false]);
  expect(H.replays - before).toBe(1);
  // Decision 2026-10-12 and phase 545: the next load, foreground or not, reads in full.
  expect(await x.foreground()).toBe(true);
}, 60000);

it('a return to the app during the oracle gets no window of its own', async () => {
  const x = await reducedDevice();
  x.oracleDue();
  const open: boolean[] = [];
  let returned = 0;
  H.replayEnd = () => {
    // The first replay is the oracle's; the return to the app then takes its own full read.
    if (++returned === 1) return x.owner.invalidateWarm();
    x.conditions.foreground = true;
    x.hooks.authority = () => open.push(x.owner.recordingOracle());
  };
  const before = H.replays;
  const outcome = await x.attempt();
  H.replayEnd = () => {};
  x.hooks.authority = () => {};
  expect(H.replays - before).toBe(2);
  expect(open).toEqual([false]);
  expect(outcome).toBeInstanceOf(MaintenanceInterrupted);
  expect(x.owner.warmAuditDue()).toBe(false); // The oracle's own replay was recorded.
  expect(await x.foreground()).toBe(true); // The return to the app is still due (phase 545).
}, 60000);

it('a foreground full read never opens the window', async () => {
  const x = await reducedDevice();
  x.owner.invalidateWarm();
  const open: boolean[] = [];
  H.replayEnd = () => (x.hooks.authority = () => open.push(x.owner.recordingOracle()));
  expect(await x.foreground()).toBe(true);
  expect(open.length).toBeGreaterThan(0);
  expect(open.every((value) => value === false)).toBe(true);
}, 60000);

const stops: readonly { readonly name: string; readonly stop: (x: Device) => void }[] = [
  { name: 'new local input', stop: (x) => (x.conditions.input = true) },
  { name: 'suspension', stop: (x) => (x.conditions.suspended = true) },
  { name: 'the owner closing', stop: (x) => x.lifetime.abort() },
];
for (const control of stops)
  it(`${control.name} during the window still interrupts the oracle`, async () => {
    const x = await reducedDevice();
    x.oracleDue();
    // Queued work is already waiting, so only the condition under test can be the cause.
    H.replayEnd = () => {
      x.conditions.foreground = true;
      x.hooks.validate = () => control.stop(x);
    };
    const outcome = await x.attempt();
    H.replayEnd = () => {};
    x.hooks.validate = () => {};
    expect(outcome).toBeInstanceOf(MaintenanceInterrupted);
    expect(isPriorityOnlyMaintenanceInterruption(outcome)).toBe(false);
    expect(x.owner.warmAuditDue()).toBe(true);
    expect(x.owner.recordingOracle()).toBe(false);
  }, 60000);

it('authority replaced during the window still refuses the replay', async () => {
  const x = await reducedDevice();
  x.oracleDue();
  H.replayEnd = () => {
    x.conditions.foreground = true;
    x.replaceAuthority();
  };
  const outcome = await x.attempt();
  H.replayEnd = () => {};
  expect(String(outcome)).toContain('Baseline authority changed during replay');
  expect(x.owner.recordingOracle()).toBe(false);
}, 60000);

it('a handoff during the window still fails the authority check', async () => {
  const x = await reducedDevice();
  x.oracleDue();
  H.replayEnd = () => {
    x.conditions.foreground = true;
    x.hooks.authority = () => {
      throw Error('Receive authority changed');
    };
  };
  const outcome = await x.attempt();
  H.replayEnd = () => {};
  x.hooks.authority = () => {};
  expect(String(outcome)).toContain('Receive authority changed');
  expect(x.owner.recordingOracle()).toBe(false);
}, 60000);

it('the audit guard ignores queued work only while a completed oracle replay is recorded', () => {
  const seen: unknown[] = [];
  const state = { suspended: false, input: false, foreground: true, recording: false };
  const task = warmAuditInterruptible(
    plain,
    { recordingOracle: () => state.recording },
    {
      suspended: () => state.suspended,
      inputSince: () => state.input,
      foregroundPending: () => state.foreground,
    },
  );
  const run = () => {
    try {
      task.step(() => {});
      seen.push('ran');
    } catch (cause) {
      seen.push(isPriorityOnlyMaintenanceInterruption(cause) ? 'priority' : 'other');
    }
  };
  run();
  state.recording = true;
  run();
  state.input = true;
  run();
  state.input = false;
  state.suspended = true;
  run();
  state.suspended = false;
  state.recording = false;
  run();
  expect(seen).toEqual(['priority', 'ran', 'other', 'other', 'priority']);
});
