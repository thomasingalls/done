// @vitest-environment node
// Phase 550: a reduced device commits a verified snapshot installation and must fold it into its
// local baseline at once. The installation is in the suffix, so the warm audit's full semantic
// oracle (phase 549) can fall due at the same moment as the fold. The oracle replays a suffix
// that holds the installation; the fold's work can arrive while the oracle is being recorded.
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
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
import type { OpenedRecord } from '../src/crdt/contentRecord';
import type { LocalBaselineContext } from '../src/crdt/localBaselineReplay';
import type { InboundState } from '../src/crdt/inboundLedger';
import type { SessionTask } from '../src/crdt/writeSession';
import { cryptFor, keys } from './local-baseline/anchor-fixture';
// @ts-expect-error Shared independent real protocol fixture.
import { memberFixture } from './local-baseline/fixtures.mjs';

// Observation seam only: the replay runs unchanged.
const H = vi.hoisted(() => ({ replays: 0, replayEnd: () => {} }));
vi.mock('../src/crdt/localBaselineShadow', async (importOriginal) => {
  const m = await importOriginal<typeof import('../src/crdt/localBaselineShadow')>();
  return {
    ...m,
    verifyCompleteLocalBaseline: async (...a: Parameters<typeof m.verifyCompleteLocalBaseline>) => {
      const result = await m.verifyCompleteLocalBaseline(...a);
      H.replays++;
      H.replayEnd();
      return result;
    },
  };
});

const clean: (() => void)[] = [];
afterEach(() => {
  H.replayEnd = () => {};
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

/** A reduced device whose suffix holds a committed snapshot installation with cuts below the
 * frontiers it reduced past: the state a verified installation leaves until it is folded. */
async function deviceAwaitingFold() {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubEnv('VITE_ACCOUNT_RETENTION', '1');
  vi.stubEnv('VITE_ACCOUNT_BASELINE_READ', '1');
  vi.stubEnv('VITE_ACCOUNT_BASELINE_INSTALL', '1');
  const f = await memberFixture();
  clean.push(f.clear);
  const context: LocalBaselineContext = f.ctx;
  const authority = vi.fn(async (task: SessionTask) => {
    task.step(() => {});
    return {
      ...context,
      identity: { ...context.identity },
      route: { ...context.route },
      assertCurrent: () => task.step(() => {}),
    };
  });
  // As accountReceive.ts's reduced validator, keeping the adopted view for inspection.
  const verified = createVerifiedRecords<{ inbound: InboundState }>({ ownResults: true });
  clean.push(() => verified.clear());
  let foldDue: boolean | undefined;
  const validate: NonNullable<ContentCrypto['validate']> = async (
    records,
    task,
    _counter,
    view,
    baseline,
  ) => {
    if (!baseline) return;
    await verified.verify(
      records,
      (view ?? {}) as never,
      async () =>
        ({
          ...structuredClone(baseline.ledger),
          baseline: structuredClone({
            anchor: baseline.anchor,
            firstSuffix: baseline.firstSuffix,
            records: baseline.records,
          }),
        }) as never,
      () => task.step(() => {}),
    );
    foldDue = verified.read(records, (v) => v.inbound.foldDue === true);
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
  // A snapshot is admitted at own 1 / peer 1, then this device receives and writes past it and
  // reduces before installing it. The installation lands afterwards, at the end of the suffix.
  await f.appendOwn();
  await f.appendPeer();
  await f.appendHistory();
  const installation = (f.rows as OpenedRecord[]).splice(-2);
  await f.appendOwn();
  for (let i = 0; i < 3; i++) await f.appendPeer();
  await append();
  expect(
    (
      await owner.removeHistory(
        plain,
        async () => {},
        () => {},
        0,
      )
    ).kind,
  ).toBe('removed');
  for (const row of (await owner.loadAccount(plain)).records) row.bytes.fill(0);
  for (const row of installation) f.rows.push({ ...row, seq: f.rows.length + 1 });
  for (let i = 0; i < 4; i++) await f.appendPeer();
  await append();
  const adopted = await owner.loadAccount(plain);
  if (adopted.kind !== 'baseline-plus-suffix') throw Error('Expected a reduced owner');
  for (const row of adopted.records) row.bytes.fill(0);

  const conditions = { foreground: false };
  const lifetime = new AbortController();
  const parent: SessionTask = { ...plain, signal: lifetime.signal };
  const auditTask = () =>
    maintenanceTask(
      budgetedTask(
        warmAuditInterruptible(parent, owner, {
          suspended: () => false,
          inputSince: () => false,
          foregroundPending: () => conditions.foreground,
        }),
      ),
      parent.signal,
    );
  const attempt = async (): Promise<'completed' | unknown> => {
    try {
      for (let n = 0; n < 100; n++) if (await owner.auditWarm(auditTask())) return 'completed';
      throw Error('Audit did not complete');
    } catch (cause) {
      return cause;
    }
  };
  const real = performance.now.bind(performance);
  let offset = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => real() + offset);
  const oracleDue = () => {
    offset += WARM_AUDIT_MS + 1;
    expect(owner.warmAuditDue()).toBe(true);
  };
  // The fold: the same reduction the automatic owner runs, at the current baseline revision.
  const fold = async () => {
    const before = await owner.loadAccount(plain);
    const revision = before.kind === 'baseline-plus-suffix' ? before.anchor.revision : -1;
    for (const row of before.records) row.bytes.fill(0);
    const result = await owner.removeHistory(
      plain,
      async () => {},
      () => {},
      revision,
    );
    conditions.foreground = false;
    return { result: result.kind, revision };
  };
  return { owner, conditions, attempt, oracleDue, fold, foldDue: () => foldDue };
}

it('the oracle replays a suffix holding the unfolded installation, and the fold carries it after', async () => {
  const x = await deviceAwaitingFold();
  // Adopting the reduced view reports the installation older builds cannot replay.
  expect(x.foldDue()).toBe(true);
  x.oracleDue();
  const before = H.replays;
  expect(await x.attempt()).toBe('completed');
  expect(H.replays - before).toBe(1);
  const { result, revision } = await x.fold();
  expect(result).toBe('removed');
  const after = await x.owner.loadAccount(plain);
  expect(after.kind === 'baseline-plus-suffix' && after.anchor.revision).toBe(revision + 1);
  for (const row of after.records) row.bytes.fill(0);
  // Folded: nothing is reported any more, and the next oracle replays the new baseline.
  expect(x.foldDue()).toBe(false);
  x.oracleDue();
  expect(await x.attempt()).toBe('completed');
}, 60000);

it('the fold queued as the oracle replay returns waits for it to be recorded, then folds', async () => {
  const x = await deviceAwaitingFold();
  x.oracleDue();
  // The fold's storage work reaches the queue just as the oracle's replay returns (phase 549's
  // window): the oracle is recorded from that replay rather than discarded.
  const open: boolean[] = [];
  H.replayEnd = () => {
    x.conditions.foreground = true;
    open.push(x.owner.recordingOracle());
  };
  const before = H.replays;
  const outcome = await x.attempt();
  H.replayEnd = () => {};
  expect(H.replays - before).toBe(1);
  expect(x.owner.warmAuditDue()).toBe(false);
  expect(outcome).toBeInstanceOf(MaintenanceInterrupted);
  expect(isPriorityOnlyMaintenanceInterruption(outcome)).toBe(true);
  expect(open).toEqual([false]);
  // The queued fold then runs and carries the installation; the oracle is not due again.
  expect((await x.fold()).result).toBe('removed');
  expect(x.foldDue()).toBe(false);
  expect(x.owner.warmAuditDue()).toBe(false);
  const oracle = H.replays;
  expect(await x.attempt()).toBe('completed');
  expect(H.replays - oracle).toBe(0);
}, 60000);

it('a fold that reaches the queue before the oracle replay satisfies the oracle with its new baseline', async () => {
  const x = await deviceAwaitingFold();
  x.oracleDue();
  // The fold runs first. Its own complete replay builds the new baseline, so the oracle due
  // beforehand is no longer due and replays nothing more.
  expect((await x.fold()).result).toBe('removed');
  expect(x.foldDue()).toBe(false);
  expect(x.owner.warmAuditDue()).toBe(false);
  const before = H.replays;
  expect(await x.attempt()).toBe('completed');
  expect(H.replays - before).toBe(0);
  expect(x.foldDue()).toBe(false);
}, 60000);
