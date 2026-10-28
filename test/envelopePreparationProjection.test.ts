// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import {
  createEnvelopePreparation,
  envelopePreparationState,
  selectEnvelopeSources,
  type EnvelopePreparationContext,
} from '../src/crdt/accountEnvelopePreparation';
import {
  inspectSpool,
  verifySpool,
  encodeSpoolEntry,
  extendSpoolWitness,
  networkRoute,
  nextSpoolPosition,
  type SpoolState,
  type SpoolEntry,
} from '../src/crdt/spoolRecord';
import { emptySpoolWitness, sameSpoolWitness, type OpenedRecord } from '../src/crdt/contentRecord';
import { createVerifiedRecords } from '../src/crdt/verifiedRecords';
import { withContentSelection, type ContentSelection } from '../src/crdt/contentSelection';
import { encodeSourceCapsule, type CaptureRoute } from '../src/crdt/sourceCapture';
import type { SessionTask } from '../src/crdt/writeSession';
import { openNetworkEnvelope, decodeNetworkEnvelope } from '../account-protocol/envelope';
import type { Bytes } from '../src/crdt/custodyCrypto';
import { Y } from '../src/crdt/yjs';

type Owner = Parameters<Parameters<EnvelopePreparationContext['run']>[0]>[1];
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const f of cleanup.splice(0)) f();
});
const route: CaptureRoute = {
  workspace: '01'.repeat(16),
  credential: '02'.repeat(16),
  principal: '03'.repeat(16),
  epoch: 1,
  generation: 1,
};
const task: SessionTask = {
  signal: new AbortController().signal,
  step: (f) => f(),
  wait: async (f) => await f(),
};

async function cacheFixture() {
  let identity = {},
    live = true,
    monitor = false,
    visitedBytes = 0,
    fieldReads = 0;
  const token = identity;
  const history = Array.from({ length: 512 }, (_, i) => ({
    kind: 'update' as const,
    gen: 1,
    seq: i + 1,
    get bytes() {
      if (monitor) visitedBytes += 2048;
      return new Uint8Array(2048);
    },
  }));
  const state: SpoolState = {
    sources: new Map([['a', new Uint8Array([7, 8])]]),
    positions: [],
    attempts: 3,
    origin: {
      position: 7,
      link: 'ab'.repeat(32),
      attempts: 3,
      consumed: [{ id: 'a', index: 0 }],
      receipt: {
        previous: '00'.repeat(32),
        envelope: new Uint8Array([1, 2]),
        proof: new Uint8Array([3, 4]),
      },
    },
    get sourceRecords() {
      if (monitor) fieldReads++;
      return history;
    },
    get events() {
      if (monitor) fieldReads++;
      return [new Uint8Array([9, 10])];
    },
  };
  const rows: OpenedRecord[] = [{ kind: 'update', gen: 1, seq: 1, bytes: new Uint8Array([5]) }];
  const cache = createVerifiedRecords<SpoolState>({ ownResults: true });
  await cache.verify(
    rows,
    token,
    async () => state,
    () => {},
  );
  cleanup.push(() => {
    monitor = false;
    cache.clear();
  });
  monitor = true;
  let lease: ContentSelection | undefined;
  const select = <T>(project: (v: Readonly<SpoolState>) => T) =>
    withContentSelection(
      task,
      identity,
      () => live && identity === token,
      (l) => {
        lease = l;
        return cache.select(l, project);
      },
    );
  return {
    cache,
    state,
    select,
    lease: () => lease!,
    counts: () => ({ visitedBytes, fieldReads }),
    reset: () => {
      visitedBytes = 0;
      fieldReads = 0;
    },
    invalidate: () => {
      identity = {};
    },
    close: () => {
      live = false;
    },
  };
}

it('the full projection control copies a MiB of history; envelope projection visits none of it', async () => {
  const f = await cacheFixture();
  const full = f.select((s) => s);
  expect(full.sourceRecords).toHaveLength(512);
  expect(f.counts()).toEqual({ visitedBytes: 512 * 2048, fieldReads: 2 });
  f.reset();
  const narrow = f.select(envelopePreparationState);
  expect(f.counts()).toEqual({ visitedBytes: 0, fieldReads: 0 });
  expect(Object.keys(narrow).sort()).toEqual(['attempts', 'origin', 'positions', 'sources']);
  expect(nextSpoolPosition(narrow)).toBe(8);
});
it('selected maps, position arrays and origin proof/consumption buffers remain detached', async () => {
  const f = await cacheFixture();
  const selected = f.select(envelopePreparationState);
  selected.sources.get('a')!.fill(0);
  selected.positions.push({
    position: 8,
    source: { id: 'a', index: 0, hash: '0'.repeat(64) },
    attempts: [],
  });
  selected.origin!.receipt!.proof.fill(0);
  selected.origin!.consumed[0]!.index = 99;
  const again = f.select(envelopePreparationState);
  expect(again.sources.get('a')).toEqual(new Uint8Array([7, 8]));
  expect(again.positions).toHaveLength(0);
  expect(again.origin!.receipt!.proof).toEqual(new Uint8Array([3, 4]));
  expect(again.origin!.consumed[0]!.index).toBe(0);
  expect(f.counts().visitedBytes).toBe(0);
});
it.each(['expired', 'identity', 'clear', 'closed'] as const)(
  'a narrower projection cannot reuse a %s view',
  async (kind) => {
    const f = await cacheFixture();
    f.select(envelopePreparationState);
    if (kind === 'identity') f.invalidate();
    if (kind === 'clear') f.cache.clear();
    if (kind === 'closed') f.close();
    if (kind === 'expired')
      expect(() => f.cache.select(f.lease(), envelopePreparationState)).toThrow('expired');
    else expect(() => f.select(envelopePreparationState)).toThrow();
  },
);

async function envelopeFixture(resumed = false, canSelect = true) {
  const doc = new Y.Doc({ gc: false });
  doc.getText('body').insert(0, 'one original update');
  const update = Y.encodeStateAsUpdate(doc).slice();
  doc.destroy();
  const key = new Uint8Array(32).fill(9);
  const pair = (await crypto.subtle.generateKey('Ed25519', false, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const rows: OpenedRecord[] = [
    {
      kind: 'outbound',
      gen: 1,
      seq: 1,
      bytes: encodeSourceCapsule({
        ...route,
        v: 1,
        id: 'ab'.repeat(16),
        sources: [{ actor: route.principal, kind: 'human', bytes: update }],
      }),
    },
  ];
  let identity = {},
    witness = emptySpoolWitness(),
    nativeHealthy = true,
    authorityHealthy = true,
    writes = 0,
    loads = 0,
    selections = 0;
  const add = async (entry: SpoolEntry) => {
    const bytes = encodeSpoolEntry(entry, route);
    witness = await extendSpoolWitness(witness, bytes, crypto.subtle);
    rows.push({
      kind: entry.type === 'envelope' ? 'outbound' : 'heads',
      gen: 1,
      seq: rows.length + 1,
      bytes,
    });
    identity = {};
  };
  if (resumed) {
    const refs = await selectEnvelopeSources(inspectSpool(rows, route), route, true, crypto.subtle);
    await add({ type: 'position', position: 1, source: refs[0]! });
    await add({ type: 'attempt', position: 1, attempt: 1 });
  }
  const cache = createVerifiedRecords<SpoolState>({ ownResults: true });
  cleanup.push(cache.clear);
  const fresh = async () => {
    if (!nativeHealthy) throw Error('native counter refused');
    await cache.verify(
      rows,
      identity,
      async (copy) => {
        const s = inspectSpool(copy, route);
        await verifySpool(s, route, key, pair.publicKey, crypto.subtle);
        return s;
      },
      () => {},
    );
  };
  const owner = {
    carrier: {
      canSelect,
      load: async () => {
        await fresh();
        loads++;
        return rows.map((r) => ({ ...r, bytes: r.bytes.slice() }));
      },
      select: async <T>(_t: SessionTask, project: (lease: ContentSelection) => T) => {
        await fresh();
        selections++;
        const token = identity;
        return withContentSelection(task, token, () => identity === token, project);
      },
      spoolWitness: async () => {
        await fresh();
        return { ...witness };
      },
      appendSpool: async (
        _t: SessionTask,
        input: { kind: OpenedRecord['kind']; bytes: Bytes },
        options: {
          before: typeof witness;
          after: typeof witness;
          beforeCommit: () => Promise<void>;
        },
      ) => {
        expect(sameSpoolWitness(witness, options.before)).toBe(true);
        await options.beforeCommit();
        expect(
          sameSpoolWitness(
            await extendSpoolWitness(witness, input.bytes, crypto.subtle),
            options.after,
          ),
        ).toBe(true);
        rows.push({ ...input, bytes: input.bytes.slice(), gen: 1, seq: rows.length + 1 });
        witness = { ...options.after };
        identity = {};
        writes++;
        return { sequences: [rows.length] };
      },
    },
  } as unknown as Owner;
  const context: EnvelopePreparationContext = {
    batchSources: true,
    whenDurable: async () => {},
    key: () => key,
    signer: () => pair.privateKey,
    run: (fn) => fn(task, owner, route),
    inspect: inspectSpool,
    loadSelection: (t, o) => o.carrier.select(t, (l) => cache.select(l, envelopePreparationState)),
    checkPublication: async () => {
      if (!authorityHealthy) throw Error('authority superseded');
      await fresh();
    },
  };
  return {
    api: createEnvelopePreparation(context),
    rows,
    key,
    pair,
    update,
    counts: () => ({ writes, loads, selections }),
    badNative: () => {
      nativeHealthy = false;
    },
    badAuthority: () => {
      authorityHealthy = false;
    },
  };
}
it.each([false, true])(
  'fresh/resumed=%s envelope preparation preserves exact originals and burned attempts',
  async (resumed) => {
    const f = await envelopeFixture(resumed);
    const prepared = await f.api.prepareNextEnvelope();
    expect(prepared?.position).toBe(1);
    expect(f.counts().loads).toBe(0);
    expect(f.counts().selections).toBe(resumed ? 2 : 3);
    expect(f.counts().writes).toBe(resumed ? 2 : 3);
    expect(decodeNetworkEnvelope(prepared!.bytes).seq).toBe(1);
    const body = await openNetworkEnvelope(
      prepared!.bytes,
      networkRoute(route),
      f.pair.publicKey,
      f.key,
    );
    expect(body.actor_id).toBe(route.principal);
    expect(body.updates).toEqual([f.update]);
    const state = inspectSpool(f.rows, route);
    expect(state.attempts).toBe(resumed ? 2 : 1);
    await verifySpool(state, route, f.key, f.pair.publicKey, crypto.subtle);
    expect(await f.api.prepareNextEnvelope()).toBeNull();
  },
);
it('record-based reference preparation still seals the same original update', async () => {
  const f = await envelopeFixture(false, false);
  const prepared = await f.api.prepareNextEnvelope();
  expect(f.counts()).toEqual({ writes: 3, loads: 3, selections: 0 });
  expect(decodeNetworkEnvelope(prepared!.bytes).seq).toBe(1);
  const body = await openNetworkEnvelope(
    prepared!.bytes,
    networkRoute(route),
    f.pair.publicKey,
    f.key,
  );
  expect(body.updates).toEqual([f.update]);
});
it.each(['native', 'authority'] as const)(
  'narrow envelope preparation refuses %s failure before any allocation',
  async (kind) => {
    const f = await envelopeFixture();
    if (kind === 'native') f.badNative();
    else f.badAuthority();
    await expect(f.api.prepareNextEnvelope()).rejects.toThrow(
      kind === 'native' ? 'native counter refused' : 'authority superseded',
    );
    expect(f.counts().writes).toBe(0);
    expect(f.rows).toHaveLength(1);
  },
);
