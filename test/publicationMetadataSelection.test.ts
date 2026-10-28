// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { createDeliveryOperations, type DeliveryContext } from '../src/crdt/accountDelivery';
import {
  createEnvelopePreparation,
  type EnvelopePreparationContext,
} from '../src/crdt/accountEnvelopePreparation';
import { emptyDelivery, type DeliveryCensus, type DeliveryState } from '../src/crdt/deliveryRecord';
import type { SpoolState } from '../src/crdt/spoolRecord';
import type { OpenedRecord } from '../src/crdt/contentRecord';
import type { CaptureRoute } from '../src/crdt/sourceCapture';
import type { SessionTask } from '../src/crdt/writeSession';
import { withContentSelection, type ContentSelection } from '../src/crdt/contentSelection';
import { copyRecords, createVerifiedRecords } from '../src/crdt/verifiedRecords';

type Owner = Parameters<Parameters<DeliveryContext['run']>[0]>[1];
type View = { census: DeliveryCensus; state: DeliveryState };
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const f of cleanup.splice(0)) f();
});
const route: CaptureRoute = {
  workspace: 'ab'.repeat(16),
  credential: 'bc'.repeat(16),
  principal: 'cd'.repeat(16),
  epoch: 1,
  generation: 1,
};

async function fixture(canSelect = true) {
  const counts = {
    rawLoads: 0,
    selections: 0,
    nativeChecks: 0,
    authorityChecks: 0,
    inspections: 0,
    recordStateReads: 0,
    allocations: 0,
    publicationChecks: 0,
    byteReads: 0,
  };
  let identity = {},
    live = true,
    nativeHealthy = true,
    authorityHealthy = true;
  const token = identity;
  const task: SessionTask = {
    signal: new AbortController().signal,
    step: (f) => {
      if (!live) throw Error('owner closed');
      return f();
    },
    wait: async (f) => {
      task.step(() => {});
      const value = await f();
      task.step(() => {});
      return value;
    },
  };
  const records: OpenedRecord[] = Array.from({ length: 256 }, (_, i) => ({
    kind: 'update',
    gen: 1,
    seq: i + 1,
    get bytes() {
      counts.byteReads++;
      return new Uint8Array([i & 255, 7, 9]);
    },
  }));
  const spool: SpoolState = {
    sources: new Map(),
    positions: [],
    attempts: 0,
    sourceRecords: copyRecords(records),
    events: [],
  };
  const state = emptyDelivery();
  state.submissions.set(1, new Uint8Array([71, 72]));
  const cache = createVerifiedRecords<View>({ ownResults: true });
  await cache.verify(
    records,
    token,
    async () => ({ census: { spool, entries: [], ledger: [] }, state }),
    () => task.step(() => {}),
  );
  cleanup.push(cache.clear);
  counts.byteReads = 0;
  let lastLease: ContentSelection | undefined;
  const native = () => {
    counts.nativeChecks++;
    task.step(() => {});
    if (!nativeHealthy) throw Error('native counter/authentication refused');
  };
  // The actual cache/lease implementation is used. This fixture supplies its carrier's fresh-guard boundary;
  // native cryptographic mutation coverage remains in warmContent and the whole-client/native campaigns.
  const owner = {
    carrier: {
      canSelect,
      async load() {
        native();
        counts.rawLoads++;
        return copyRecords(records);
      },
      async select<T>(_task: SessionTask, select: (lease: ContentSelection) => T) {
        native();
        counts.selections++;
        return withContentSelection(
          task,
          identity,
          () => live && identity === token,
          (lease) => {
            lastLease = lease;
            return select(lease);
          },
        );
      },
      async appendSpool() {
        counts.allocations++;
        throw Error('unexpected allocation');
      },
      async spoolWitness() {
        throw Error('unexpected witness allocation');
      },
    },
  } as unknown as Owner;
  const assertCurrent = async () => {
    counts.authorityChecks++;
    task.step(() => {});
    if (!authorityHealthy) throw Error('authority superseded');
  };
  const delivery: DeliveryContext & {
    loadState(
      task: SessionTask,
      owner: Owner,
    ): Promise<{ census: DeliveryCensus; state: DeliveryState }>;
  } = {
    authority: () => ({}) as ReturnType<DeliveryContext['authority']>,
    pin: () => ({}) as ReturnType<DeliveryContext['pin']>,
    signer: () => ({}) as CryptoKey,
    publicKey: () => ({}) as CryptoKey,
    assertCurrent,
    run: (operation) => operation(task, owner, route),
    inspect: (rows) => {
      counts.inspections++;
      return cache.read(rows, (v) => v.census);
    },
    verified: (rows) => {
      counts.recordStateReads++;
      return cache.read(rows, (v) => v.state);
    },
    loadState: (t, o) =>
      o.carrier.select(t, (lease) => ({
        census: cache.select(lease, (v) => v.census),
        state: cache.select(lease, (v) => v.state),
      })),
  };
  const envelope: EnvelopePreparationContext & {
    loadSelection(task: SessionTask, owner: Owner): Promise<SpoolState>;
  } = {
    whenDurable: async () => {},
    key: () => new Uint8Array(32),
    signer: () => ({}) as CryptoKey,
    run: (operation) => operation(task, owner, route),
    inspect: (rows) => {
      counts.inspections++;
      return cache.readIfMatches(rows, (v) => v.census.spool)!.value;
    },
    loadSelection: (t, o) =>
      o.carrier.select(t, (lease) => cache.select(lease, (v) => v.census.spool)),
    checkPublication: async (_t, _o, _r, rows) => {
      counts.publicationChecks++;
      await assertCurrent();
      // The production selected branch independently reloads its small publication projection.
      if (rows) cache.read(rows, (v) => v.state.conflict);
      else
        await owner.carrier.select(task, (lease) => cache.select(lease, (v) => v.state.conflict));
    },
  };
  return {
    owner,
    task,
    counts,
    cache,
    records,
    delivery,
    envelope,
    lastLease: () => lastLease!,
    close: () => {
      live = false;
    },
    invalidate: () => {
      identity = {};
    },
    badNative: () => {
      nativeHealthy = false;
    },
    badAuthority: () => {
      authorityHealthy = false;
    },
  };
}

it('delivery metadata uses a fresh carrier selection without raw-history loads or redundant array matches', async () => {
  const f = await fixture();
  const api = createDeliveryOperations(f.delivery);
  const first = await api.prepareSubmission(1);
  expect(first).toMatchObject({ kind: 'ready', bytes: new Uint8Array([71, 72]) });
  if (first.kind === 'ready') first.bytes!.fill(0);
  expect(await api.prepareSubmission(1)).toMatchObject({
    kind: 'ready',
    bytes: new Uint8Array([71, 72]),
  });
  expect(f.counts).toMatchObject({
    selections: 2,
    nativeChecks: 2,
    authorityChecks: 2,
    rawLoads: 0,
    inspections: 0,
    recordStateReads: 0,
    byteReads: 0,
    allocations: 0,
  });
  expect(() => f.cache.select(f.lastLease(), (v) => v)).toThrow('expired');
});

it('envelope metadata selection still checks publication before an idle return without copying physical records', async () => {
  const f = await fixture();
  expect(await createEnvelopePreparation(f.envelope).prepareNextEnvelope()).toBeNull();
  expect(f.counts).toMatchObject({
    selections: 2,
    nativeChecks: 2,
    publicationChecks: 1,
    authorityChecks: 1,
    rawLoads: 0,
    inspections: 0,
    byteReads: 0,
    allocations: 0,
  });
  expect(() => f.cache.select(f.lastLease(), (v) => v)).toThrow('expired');
});

it.each(['delivery', 'envelope'] as const)(
  '%s retains the record-based reference fallback when carrier selection is unavailable',
  async (kind) => {
    const f = await fixture(false);
    if (kind === 'delivery')
      expect(await createDeliveryOperations(f.delivery).prepareSubmission(1)).toMatchObject({
        kind: 'ready',
      });
    else expect(await createEnvelopePreparation(f.envelope).prepareNextEnvelope()).toBeNull();
    expect(f.counts.rawLoads).toBe(1);
    expect(f.counts.selections).toBe(0);
    expect(f.counts.inspections).toBe(1);
    expect(f.counts.byteReads).toBeGreaterThan(0);
  },
);

it.each(['delivery', 'envelope'] as const)(
  '%s selected metadata refuses fresh native failure without falling back or allocating',
  async (kind) => {
    const f = await fixture();
    f.badNative();
    const work =
      kind === 'delivery'
        ? createDeliveryOperations(f.delivery).prepareSubmission(1)
        : createEnvelopePreparation(f.envelope).prepareNextEnvelope();
    await expect(work).rejects.toThrow('native counter/authentication refused');
    expect(f.counts.rawLoads).toBe(0);
    expect(f.counts.allocations).toBe(0);
  },
);

it.each(['delivery', 'envelope'] as const)(
  '%s selected projection cannot authorize work after an authority refusal',
  async (kind) => {
    const f = await fixture();
    f.badAuthority();
    const work =
      kind === 'delivery'
        ? createDeliveryOperations(f.delivery).prepareSubmission(1)
        : createEnvelopePreparation(f.envelope).prepareNextEnvelope();
    await expect(work).rejects.toThrow('authority superseded');
    expect(f.counts.rawLoads).toBe(0);
    expect(f.counts.allocations).toBe(0);
  },
);

it('stale view, clear and closed owner refuse selection before any original bytes can be reused', async () => {
  for (const refuse of ['identity', 'clear', 'closed'] as const) {
    const f = await fixture();
    if (refuse === 'identity') f.invalidate();
    if (refuse === 'clear') f.cache.clear();
    if (refuse === 'closed') f.close();
    await expect(createDeliveryOperations(f.delivery).prepareSubmission(1)).rejects.toThrow();
    expect(f.counts.rawLoads).toBe(0);
    expect(f.counts.allocations).toBe(0);
  }
});
