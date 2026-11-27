// @vitest-environment node
// Phase 545 budget: on a reduced owner, the number of whole-document builds in one replay does not
// grow with the source capsules saved since the reduction, for a forced read (what a return to the
// app triggers) and for a cold open. The per-call reference shows what the guard would catch.
import { afterEach, expect, it, vi } from 'vitest';
// The replay must load before inboundLedger's mock factory runs (they form an import cycle).
import '../src/crdt/localBaselineReplay';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { createContentOwner } from '../src/crdt/contentStore';
import { keys, cryptFor } from './local-baseline/anchor-fixture';
import { extendSpoolWitness } from '../src/crdt/spoolRecord';
import { Y } from '../src/crdt/yjs';
import type { SessionTask } from '../src/crdt/writeSession';
import type { LocalBaselineContext } from '../src/crdt/localBaselineReplay';
import type { OpenedRecord } from '../src/crdt/contentRecord';
import type { Bytes } from '../src/crdt/custodyCrypto';
// @ts-expect-error Shared independent real protocol fixture.
import { memberFixture } from './local-baseline/fixtures.mjs';

const count = vi.hoisted(() => ({
  reference: false,
  threshold: Infinity,
  builds: 0,
  applied: new WeakMap<object, number>(),
}));
vi.mock('../src/crdt/yjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/crdt/yjs')>();
  const apply = actual.Y.applyUpdate;
  // A whole-document build is any document that has been given at least the baseline snapshot.
  const Y = {
    ...actual.Y,
    applyUpdate: (doc: object, update: Uint8Array, origin?: unknown) => {
      const before = count.applied.get(doc) ?? 0,
        after = before + update.length;
      count.applied.set(doc, after);
      if (before < count.threshold && after >= count.threshold) count.builds++;
      return apply(doc as never, update, origin);
    },
  };
  return { ...actual, Y };
});
vi.mock('../src/crdt/inboundLedger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/crdt/inboundLedger')>();
  return {
    ...actual,
    createPassCoverage: (records: readonly OpenedRecord[]) =>
      count.reference
        ? {
            check: (u: readonly Bytes[]) => actual.verifyInboundCoverage(records, u),
            clear() {},
          }
        : actual.createPassCoverage(records),
  };
});

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

it('whole-document builds per replay stay constant as capsules accumulate, warm-forced and cold', async () => {
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
  const crypt = {
    ...cryptFor(context.identity, await keys()),
    reuseOpened: true as const,
    warmLoads: true as const,
    readBaseline: true as const,
    baseline: async () => ({
      ...context,
      identity: { ...context.identity },
      route: { ...context.route },
    }),
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
        const before = await owner.spoolWitness(task),
          after = await extendSpoolWitness(before, row.bytes, crypto.subtle);
        await owner.appendSpool(task, row, { before, after });
      } else await owner.append(task, [row]);
      persisted++;
    }
  };
  await f.appendOwn();
  await f.appendPeer();
  await append();
  // A document far larger than any one capsule, so only whole-document builds cross the threshold.
  const doc = new Y.Doc({ gc: false });
  let large: Bytes | undefined;
  doc.on('update', (u: Uint8Array) => (large = new Uint8Array(u)));
  doc.getText('large').insert(0, 'z'.repeat(64 * 1024));
  doc.destroy();
  await owner.append(task, [{ kind: 'update', bytes: large! }]);
  await owner.removeHistory(
    task,
    async () => {},
    () => {},
    0,
  );
  const first = await owner.loadAccount(task);
  if (first.kind !== 'baseline-plus-suffix') throw Error('Expected a reduced owner');
  count.threshold = Math.floor(first.records[0]!.bytes.length * 0.9);

  const measure = async (reference: boolean) => {
    count.reference = reference;
    try {
      let at = count.builds;
      owner.invalidateWarm();
      await owner.loadAccount(task);
      const forced = count.builds - at;
      at = count.builds;
      const cold = createContentOwner(context.identity, 1, crypt);
      try {
        await cold.initialize(task);
        await cold.loadAccount(task);
      } finally {
        cold.dispose();
      }
      return { forced, cold: count.builds - at };
    } finally {
      count.reference = false;
    }
  };
  const shared: { forced: number; cold: number }[] = [],
    reference: { forced: number; cold: number }[] = [];
  let added = 0;
  for (const capsules of [0, 2, 8]) {
    while (added < capsules) {
      await f.appendOwn();
      added++;
    }
    await append();
    await owner.loadAccount(task);
    shared.push(await measure(false));
    reference.push(await measure(true));
  }
  // One pass view, one inbound-ledger view and the two document-state encodings, at any count.
  expect(shared).toEqual([
    { forced: 4, cold: 4 },
    { forced: 4, cold: 4 },
    { forced: 4, cold: 4 },
  ]);
  // Before phase 545: three receipt checks, then one more build per capsule plus the self-receive
  // check once any capsule is accepted.
  expect(reference).toEqual([
    { forced: 6, cold: 6 },
    { forced: 9, cold: 9 },
    { forced: 15, cold: 15 },
  ]);
}, 60000);
