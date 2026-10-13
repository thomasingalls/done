// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import { keys, cryptFor } from './local-baseline/anchor-fixture';
// @ts-expect-error Shared real protocol fixture is JavaScript.
import { memberFixture } from './local-baseline/fixtures.mjs';
import { inspectInbound } from '../src/crdt/inboundLedger';
import { extendSpoolWitness } from '../src/crdt/spoolRecord';
import {
  CONTENT_STORES,
  emptySpoolWitness,
  counterPayload,
  recordStore,
  type ContentCounter,
  type OpenedRecord,
  type StoredRecord,
} from '../src/crdt/contentRecord';
import { openContentDb } from '../src/crdt/contentDatabase';
import {
  planLocalRetention,
  disposeRetentionPlan,
  type RetentionInventory,
  type LocalRetentionPlan,
} from '../src/crdt/localRetentionPlan';
import { removePlannedLocalHistory } from '../src/crdt/localRetentionStorage';
import { readEncryptedBaseline } from '../src/crdt/localBaselineStorage';
import {
  parseBaselineCounter,
  baselineCounterPayload,
  baselineChunkPrefix,
  type BaselineCounter,
} from '../src/crdt/localBaselineAnchor';
import {
  replayFullLocalHistory,
  replayLocalBaseline,
  type LocalBaselineContext,
} from '../src/crdt/localBaselineReplay';
import { verifyCompleteLocalBaseline } from '../src/crdt/localBaselineShadow';
import type { SessionTask } from '../src/crdt/writeSession';
import type { Bytes } from '../src/crdt/custodyCrypto';
const clean: (() => void)[] = [];
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
});
afterEach(() => {
  clean.splice(0).forEach((fn) => fn());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const task: SessionTask = {
  signal: new AbortController().signal,
  step: (f) => f(),
  wait: (f) => Promise.resolve(f()),
};
async function write(db: IDBDatabase, store: string, key: IDBValidKey, value: unknown) {
  await new Promise<void>((yes, no) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => yes();
    tx.onabort = () => no(tx.error);
  });
}
async function census(db: IDBDatabase): Promise<RetentionInventory> {
  return new Promise((yes, no) => {
    const tx = db.transaction([...CONTENT_STORES]),
      result: RetentionInventory = { rows: [], metadata: [] };
    for (const name of CONTENT_STORES) {
      const s = tx.objectStore(name),
        keys = s.getAllKeys(),
        values = s.getAll();
      values.onsuccess = () => {
        keys.result.forEach((key, i) => {
          const value = values.result[i];
          if (name === 'meta') result.metadata.push({ key, value });
          else result.rows.push({ store: name, key, value });
        });
      };
    }
    tx.oncomplete = () => yes(result);
    tx.onabort = () => no(tx.error);
  });
}
const raw = (i: RetentionInventory) =>
  i.metadata.find((m) => m.key === 'counter')!.value as BaselineCounter;
async function fixture() {
  const f = await memberFixture();
  clean.push(f.clear);
  await f.appendOwn();
  await f.appendPeer();
  await f.appendHistory();
  const context: LocalBaselineContext = f.ctx,
    rows: OpenedRecord[] = f.rows;
  const c = inspectInbound(rows, context.route, context.inbound);
  let spool = emptySpoolWitness();
  for (const e of c.delivery.spool.events)
    spool = await extendSpoolWitness(spool, e, crypto.subtle);
  const next = rows.at(-1)!.seq + 4;
  const counter: ContentCounter = {
    v: 2,
    store_id: context.identity.storeId,
    intent: '04'.repeat(16),
    active_gen: 1,
    next_seq: next,
    reserved: { 1: next - 1 },
    spool,
    mac: new Uint8Array(32),
  };
  const crypt = cryptFor(context.identity, await keys());
  counter.mac = await crypt.sign(task, counterPayload(context.identity, counter));
  const db = await openContentDb(task, 'retention-unit', true);
  clean.push(() => db.close());
  await write(db, 'meta', 'counter', counter);
  for (const r of rows)
    await write(
      db,
      recordStore(r.kind),
      r.seq,
      await crypt.seal(task, { v: 1, seq: r.seq, gen: r.gen, kind: r.kind }, r.bytes),
    );
  const auth = {
    sign: (b: Bytes) => crypt.sign(task, b),
    verify: (b: Bytes, mac: Bytes) => crypt.verify(task, b, mac),
  };
  const owner = {
    db,
    identity: context.identity,
    intent: counter.intent,
    generation: 1,
    crypt,
    allowReduced: true,
    assertCurrent: async () => {},
    checkCommit: () => {},
  };
  const binding = { lifetime: {}, intent: counter.intent, allowReduced: true };
  const plan = async () => {
    const p = await planLocalRetention(
      task,
      await census(db),
      context,
      { open: (r) => crypt.open(task, r), verify: auth.verify, auth },
      binding,
    );
    if (p.kind === 'skipped') throw Error(p.reason);
    clean.push(() => disposeRetentionPlan(p));
    return p;
  };
  return {
    f,
    owner,
    context,
    rows,
    counter,
    auth,
    binding,
    plan,
    read: () => census(db),
    remove: async (p: LocalRetentionPlan) => removePlannedLocalHistory(task, owner, p, binding),
  };
}

it('real encrypted v5 bytes replay without predecessors, preserve checkpoint/peer frontiers and permit an empty second cut', async () => {
  const f = await fixture(),
    before = await f.read(),
    p = await f.plan();
  const expected = await f.remove(p);
  expect(await f.read()).toEqual(expected);
  expect(expected.rows).toEqual([]);
  const held = await readEncryptedBaseline(task, f.owner),
    { baseline: _p, ...allocation } = held.counter;
  const input = { records: [], counter: { ...allocation, v: 2 as const } };
  const reduced = await replayLocalBaseline(held.baseline, held.anchor, input, f.context, f.auth);
  const full = await replayFullLocalHistory({ records: f.rows, counter: f.counter }, f.context);
  expect(reduced.snapshot).toEqual(full.snapshot);
  expect(reduced.inbound.prefix).toEqual(full.inbound.prefix);
  expect(reduced.inbound.installedHistory).toEqual(full.inbound.installedHistory);
  expect(raw(expected).next_seq).toBeGreaterThan(raw(before).next_seq);
  expect((await f.remove(await f.plan())).rows).toEqual([]);
  const again = await readEncryptedBaseline(task, f.owner);
  expect(again.anchor.revision).toBe(2);
  await expect(
    verifyCompleteLocalBaseline(
      { records: [f.rows[0]!], counter: { ...again.counter, v: 2 } },
      f.context,
      f.auth,
      again,
      true,
      true,
    ),
  ).rejects.toThrow('integrity');
});

it('default/older readers reject v5; history mode, carrier and era are closed and bound to MAC/AAD', async () => {
  const f = await fixture();
  await f.remove(await f.plan());
  const stored = raw(await f.read());
  expect(() => parseBaselineCounter(stored, f.owner.identity, f.owner.intent)).toThrow(
    'reader required',
  );
  await expect(readEncryptedBaseline(task, { ...f.owner, allowReduced: false })).rejects.toThrow(
    'reader required',
  );
  for (const change of [
    (c: BaselineCounter) => {
      (c as unknown as { v: unknown }).v = '5';
    },
    (c: BaselineCounter) => {
      c.baseline.journalEra!.revision = c.baseline.revision - 1;
    },
    (c: BaselineCounter) => {
      c.baseline.history = 'complete';
    },
    (c: BaselineCounter) => {
      c.baseline.format = 'done/local-baseline-carrier/draft-2';
    },
    (c: BaselineCounter) => {
      delete c.baseline.journalEra;
    },
  ]) {
    const c = structuredClone(stored);
    change(c);
    expect(() => parseBaselineCounter(c, f.owner.identity, f.owner.intent, true)).toThrow();
  }
  const renamed = structuredClone(stored);
  renamed.v = 4;
  renamed.baseline.format = 'done/local-baseline-carrier/draft-2';
  renamed.baseline.history = 'complete';
  expect(baselineCounterPayload(f.owner.identity, renamed)).not.toEqual(
    baselineCounterPayload(f.owner.identity, stored),
  );
  expect(
    baselineChunkPrefix(f.owner.identity, { ...stored.baseline, history: 'complete' }, 0),
  ).not.toEqual(baselineChunkPrefix(f.owner.identity, stored.baseline, 0));
  await write(f.owner.db, 'meta', 'counter', renamed);
  await expect(readEncryptedBaseline(task, f.owner)).rejects.toThrow();
});

it('abort after an enumerated delete rolls back the whole exchange and burns only the predecessor reservation', async () => {
  const f = await fixture(),
    before = await f.read(),
    p = await f.plan();
  let hit = false;
  const original = IDBObjectStore.prototype.delete;
  const spy = vi
    .spyOn(IDBObjectStore.prototype, 'delete')
    .mockImplementation(function (this: IDBObjectStore, key) {
      const r = original.call(this, key);
      if (this.name !== 'meta' && !hit) {
        hit = true;
        this.transaction.abort();
      }
      return r;
    });
  await expect(f.remove(p)).rejects.toThrow();
  spy.mockRestore();
  expect(hit).toBe(true);
  const after = await f.read();
  expect(after.rows).toEqual(before.rows);
  expect(raw(after).v).toBe(2);
  expect(raw(after).next_seq).toBeGreaterThan(raw(before).next_seq);
  const burned = raw(after).next_seq;
  await expect(f.remove(p)).rejects.toThrow('inventory changed');
  await f.remove(await f.plan());
  expect(raw(await f.read()).baseline.firstSequence).toBe(burned);
});

for (const fault of ['late-key', 'changed-row', 'journal', 'authority', 'seal-failure'])
  it(`refuses ${fault} after reservation with no partial deletion`, async () => {
    const f = await fixture(),
      before = await f.read(),
      p = await f.plan(),
      seal = f.owner.crypt.seal;
    let once = true,
      faultActive = false;
    f.owner.checkCommit = () => {
      if (faultActive && fault === 'journal') throw Error('journal changed');
    };
    f.owner.assertCurrent = async () => {
      if (faultActive && fault === 'authority') throw Error('authority changed');
    };
    f.owner.crypt.seal = async (t, h, b) => {
      if (once) {
        once = false;
        if (fault === 'seal-failure') throw Error('injected encryption failure');
        faultActive = true;
        if (fault === 'late-key')
          await write(f.owner.db, 'content', f.counter.next_seq - 1, {
            ...(before.rows.find((r) => r.store === 'content')!.value as StoredRecord),
            seq: f.counter.next_seq - 1,
          });
        if (fault === 'changed-row') {
          const r = before.rows.find((r) => r.store === 'content')!,
            v = structuredClone(r.value) as StoredRecord;
          v.ct[0]! ^= 1;
          await write(f.owner.db, r.store, r.key, v);
        }
      }
      return seal(t, h, b);
    };
    await expect(f.remove(p)).rejects.toThrow();
    const after = await f.read();
    expect(raw(after).v).toBe(2);
    expect(raw(after).next_seq).toBeGreaterThan(raw(before).next_seq);
    for (const row of before.rows)
      expect(after.rows.some((r) => r.store === row.store && r.key === row.key)).toBe(true);
    if (fault !== 'late-key' && fault !== 'changed-row') expect(after.rows).toEqual(before.rows);
  });

it('a fabricated or disposed plan cannot reserve or delete', async () => {
  const f = await fixture(),
    before = await f.read();
  await expect(f.remove({ kind: 'local-retention-dry-run' })).rejects.toThrow('expired');
  const p = await f.plan();
  disposeRetentionPlan(p);
  await expect(f.remove(p)).rejects.toThrow('expired');
  expect(await f.read()).toEqual(before);
});

it('a different storage owner cannot use the plan even with the same supplied lifetime binding', async () => {
  const f = await fixture(),
    before = await f.read(),
    p = await f.plan();
  await expect(
    removePlannedLocalHistory(
      task,
      { ...f.owner, identity: { ...f.owner.identity, storeId: '99'.repeat(16) } },
      p,
      f.binding,
    ),
  ).rejects.toThrow('differs');
  expect(await f.read()).toEqual(before);
});

it('rotation with no remaining physical rows keeps v5, the old encrypted baseline/opener and every reservation', async () => {
  const { rotateContent } = await import('../src/crdt/contentRotation');
  const f = await fixture();
  await f.remove(await f.plan());
  const old = await readEncryptedBaseline(task, f.owner);
  const { baseline: _pointer, ...allocation } = old.counter;
  const counter = { ...allocation, v: 2 as const };
  const reserve = vi.fn(async (n: number) => n);
  const seal = vi.fn(() => {
    throw Error('must not seal a synthetic row');
  });
  await rotateContent(
    task,
    {
      db: f.owner.db,
      scope: f.owner.identity,
      generation: 1,
      intent: f.owner.intent,
      allowReduced: true,
      crypt: f.owner.crypt,
      read: async () => ({ counter, rows: [] }),
      authenticate: async () => [],
      baseline: async () => old,
      assertCurrent: f.owner.assertCurrent,
    },
    {
      generation: 2,
      reserve,
      seal,
      open: (r) => f.owner.crypt.open(task, r),
      checkJournal: f.owner.checkCommit,
    },
  );
  expect(reserve).toHaveBeenCalledExactlyOnceWith(0);
  expect(seal).not.toHaveBeenCalled();
  const after = await readEncryptedBaseline(task, { ...f.owner, generation: 2 });
  expect(after.counter.v).toBe(5);
  expect(after.counter.active_gen).toBe(2);
  expect(after.counter.reserved).toEqual({ ...old.counter.reserved, 2: 0 });
  expect(after.counter.next_seq).toBe(old.counter.next_seq);
  expect(after.counter.baseline).toEqual(old.counter.baseline);
  expect(after.chunks).toEqual(old.chunks);
  expect((await f.read()).rows).toEqual([]);
  await expect(
    readEncryptedBaseline(task, {
      ...f.owner,
      generation: 2,
      crypt: {
        ...f.owner.crypt,
        open: async () => {
          throw Error('old opener absent');
        },
      },
    }),
  ).rejects.toThrow('old opener absent');
});
