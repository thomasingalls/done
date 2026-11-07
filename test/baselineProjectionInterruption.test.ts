// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { createContentOwner } from '../src/crdt/contentStore';
import { keys, cryptFor } from './local-baseline/anchor-fixture';
import { extendSpoolWitness } from '../src/crdt/spoolRecord';
import { makeSourceCapsule, decodeSourceCapsule, eraseCapsule } from '../src/crdt/sourceCapture';
import { selectEnvelopeSources } from '../src/crdt/accountEnvelopePreparation';
import { sameAccountLedger } from '../src/crdt/incrementalAccountLedger';
import { MaintenanceInterrupted } from '../src/crdt/contentMaintenance';
import { Y } from '../src/crdt/yjs';
import type { SessionTask } from '../src/crdt/writeSession';
import type { LocalBaselineContext } from '../src/crdt/localBaselineReplay';
import type { OpenedRecord } from '../src/crdt/contentRecord';
// @ts-expect-error Shared independent real-crypto protocol fixture.
import { memberFixture } from './local-baseline/fixtures.mjs';

const clean: (() => void)[] = [];
afterEach(() => {
  clean.splice(0).forEach((f) => f());
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const task: SessionTask = {
  signal: new AbortController().signal,
  step: (f) => f(),
  wait: async (f) => f(),
};
async function fixture() {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const flag of [
    'VITE_ACCOUNT_RETENTION',
    'VITE_ACCOUNT_BASELINE_READ',
    'VITE_ACCOUNT_BASELINE_INSTALL',
  ])
    vi.stubEnv(flag, '1');
  const f = await memberFixture();
  clean.push(f.clear);
  const context: LocalBaselineContext = f.ctx;
  const auth = vi.fn(async (_task?: SessionTask) => ({
    ...context,
    identity: { ...context.identity },
    route: { ...context.route },
  }));
  const crypt = {
    ...cryptFor(context.identity, await keys()),
    reuseOpened: true as const,
    warmLoads: true as const,
    readBaseline: true as const,
    baseline: auth,
  };
  const owner = createContentOwner(context.identity, 1, crypt);
  clean.push(() => owner.dispose());
  await owner.initialize(task, { intent: '04'.repeat(16), checkCreation() {} });
  await owner.enableSpool(task);
  let persisted = 0;
  const append = async () => {
    for (const row of (f.rows as OpenedRecord[]).slice(persisted)) {
      const event =
        row.kind === 'heads' ||
        (row.kind === 'outbound' &&
          !new TextDecoder().decode(row.bytes).startsWith('["done/source-capture/v1"'));
      if (event) {
        const before = await owner.spoolWitness(task);
        const after = await extendSpoolWitness(before, row.bytes, crypto.subtle);
        await owner.appendSpool(task, row, { before, after });
      } else await owner.append(task, [row]);
      persisted++;
    }
  };
  await f.appendOwn();
  await f.appendPeer();
  await append();
  await owner.removeHistory(
    task,
    async () => {},
    () => {},
    0,
  );
  await owner.loadAccount(task);
  const pending = async () => {
    const doc = new Y.Doc({ gc: false });
    doc.getText('pending').insert(0, 'one real unallocated update');
    const update = new Uint8Array(Y.encodeStateAsUpdate(doc));
    doc.destroy();
    const capsule = makeSourceCapsule(context.route, [
      { actor: context.route.principal, kind: 'human', bytes: update },
    ]);
    const opened = decodeSourceCapsule(capsule, context.route),
      id = opened.id;
    eraseCapsule(opened);
    await owner.append(task, [
      { kind: 'update', bytes: update },
      { kind: 'outbound', bytes: capsule },
    ]);
    clean.push(() => {
      update.fill(0);
      capsule.fill(0);
    });
    return id;
  };
  const read = async () => {
    const value = await owner.loadAccount(task);
    if (value.kind !== 'baseline-plus-suffix') throw Error('Expected reduced logical view');
    return value;
  };
  const interruptAfterAdvance = () => {
    const original = auth.getMockImplementation()!;
    auth.mockImplementationOnce(original).mockRejectedValueOnce(new MaintenanceInterrupted());
  };
  return { f, context, owner, append, pending, read, interruptAfterAdvance };
}

it('interruption after continuation keeps a newly durable unallocated source visible on retry', async () => {
  const x = await fixture(),
    id = await x.pending();
  x.interruptAfterAdvance();
  await expect(x.read()).rejects.toBeInstanceOf(MaintenanceInterrupted);
  const resumed = await x.read();
  x.owner.invalidateWarm();
  const oracle = await x.read();
  expect(oracle.ledger.census.delivery.spool.sources.has(id)).toBe(true);
  const selected = await selectEnvelopeSources(
    oracle.ledger.census.delivery.spool,
    x.context.route,
    true,
    crypto.subtle,
  );
  expect(selected.map((s) => s.id)).toEqual([id]);
  expect(resumed.ledger.census.delivery.spool.sources.has(id)).toBe(true);
  expect(sameAccountLedger(resumed.ledger, oracle.ledger)).toBe(true);
  expect(resumed.records).toEqual(oracle.records);
});

it('interruption after continuation cannot roll the logical delivery frontier back on retry', async () => {
  const x = await fixture();
  await x.f.appendOwn();
  await x.append();
  x.interruptAfterAdvance();
  await expect(x.read()).rejects.toBeInstanceOf(MaintenanceInterrupted);
  const resumed = await x.read();
  x.owner.invalidateWarm();
  const oracle = await x.read();
  expect(oracle.ledger.delivery.acceptedThrough).toBe(2);
  expect(resumed.ledger.delivery.acceptedThrough).toBe(2);
  expect(sameAccountLedger(resumed.ledger, oracle.ledger)).toBe(true);
});

it('a completed continuation remains warm and agrees with independent full replay', async () => {
  const x = await fixture(),
    id = await x.pending();
  const disk = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  const continued = await x.read();
  expect(disk).not.toHaveBeenCalled();
  expect(continued.ledger.census.delivery.spool.sources.has(id)).toBe(true);
  x.owner.invalidateWarm();
  const oracle = await x.read();
  expect(sameAccountLedger(continued.ledger, oracle.ledger)).toBe(true);
});

it('an interrupted unchanged projection remains valid without forcing a full disk read', async () => {
  const x = await fixture();
  x.interruptAfterAdvance();
  await expect(x.read()).rejects.toBeInstanceOf(MaintenanceInterrupted);
  const disk = vi.spyOn(IDBObjectStore.prototype, 'getAll');
  const resumed = await x.read();
  expect(disk).not.toHaveBeenCalled();
  x.owner.invalidateWarm();
  const oracle = await x.read();
  expect(sameAccountLedger(resumed.ledger, oracle.ledger)).toBe(true);
});

it('a second interruption during recovery cannot restore the half-installed source projection', async () => {
  const x = await fixture(),
    id = await x.pending();
  x.interruptAfterAdvance();
  await expect(x.read()).rejects.toBeInstanceOf(MaintenanceInterrupted);
  // A cold/reference recovery may itself yield to foreground work.
  x.interruptAfterAdvance();
  await expect(x.read()).rejects.toBeInstanceOf(MaintenanceInterrupted);
  const resumed = await x.read();
  x.owner.invalidateWarm();
  const oracle = await x.read();
  expect(oracle.ledger.census.delivery.spool.sources.has(id)).toBe(true);
  expect(resumed.ledger.census.delivery.spool.sources.has(id)).toBe(true);
  expect(sameAccountLedger(resumed.ledger, oracle.ledger)).toBe(true);
});
