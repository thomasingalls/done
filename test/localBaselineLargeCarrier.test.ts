// @vitest-environment node
// Phase 542: a reduced baseline past the released 4 MiB record ceiling uses a larger carrier.
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { createContentOwner } from '../src/crdt/contentStore';
import { openContentDb } from '../src/crdt/contentDatabase';
import { deriveStoreName } from '../src/crdt/storeName';
import { extendSpoolWitness } from '../src/crdt/spoolRecord';
import {
  ContentError,
  recordAAD,
  type ContentIdentity,
  type OpenedRecord,
  type StoredRecord,
} from '../src/crdt/contentRecord';
import {
  BASELINE_MAX_BYTES,
  BASELINE_MAX_CHUNKS,
  LARGE_BASELINE_CARRIER,
  LARGE_BASELINE_CHUNK_BYTES,
  LARGE_BASELINE_MAX_BYTES,
  REDUCED_BASELINE_CARRIER,
  baselineChunkPrefix,
  baselineCounterPayload,
  parseBaselineCounter,
  type BaselineCounter,
} from '../src/crdt/localBaselineAnchor';
import {
  LARGE_LOCAL_BASELINE_LIMIT,
  LARGE_LOCAL_BASELINE_WRITE_LIMIT,
  LOCAL_BASELINE_LIMIT,
  LocalBaselineCapacityError,
  assertBaselineAuthenticationMessage,
  baselineAuthenticationPayload,
  decodeLocalBaseline,
  encodeLocalBaseline,
} from '../src/crdt/localBaselineRecord';
import { anchorLocalBaseline, readEncryptedBaseline } from '../src/crdt/localBaselineStorage';
import { replayLocalBaseline, type LocalBaselineContext } from '../src/crdt/localBaselineReplay';
import { StorageCompatibilityError } from '../src/crdt/storageCompatibility';
import { contentCensus } from '../src/crdt/startupClassification';
import { Y } from '../src/crdt/yjs';
import type { SessionTask } from '../src/crdt/writeSession';
import type { Bytes } from '../src/crdt/custodyCrypto';
import { cryptFor, keys, readCensus, setup } from './local-baseline/anchor-fixture';
// @ts-expect-error Shared real-protocol JavaScript fixture.
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
const fromHex = (s: string) => new Uint8Array(Buffer.from(s, 'hex'));
const toHex = (b: Bytes) => Buffer.from(b).toString('hex');
const sha256 = (b: Bytes) => createHash('sha256').update(b).digest('hex');
const revive = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(revive)
    : v && typeof v === 'object'
      ? '$hex' in v
        ? fromHex((v as { $hex: string }).$hex)
        : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]))
      : v;
const released = JSON.parse(
  readFileSync(new URL('./local-baseline/released-baseline-vector.json', import.meta.url), 'utf8'),
);
const fakeStorage = () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
};
const putMeta = (db: IDBDatabase, key: IDBValidKey, value: unknown) =>
  new Promise<void>((yes, no) => {
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(value, key);
    tx.oncomplete = () => yes();
    tx.onabort = () => no(tx.error);
  });
const metaRows = (db: IDBDatabase) =>
  new Promise<{ key: IDBValidKey; value: unknown }[]>((yes, no) => {
    const tx = db.transaction('meta'),
      s = tx.objectStore('meta'),
      k = s.getAllKeys(),
      v = s.getAll();
    tx.oncomplete = () => yes(k.result.map((key, i) => ({ key, value: v.result[i] })));
    tx.onabort = () => no(tx.error);
  });
const bigState = (chars: number) => {
  const doc = new Y.Doc({ gc: false });
  doc.getText('big').insert(0, 'y'.repeat(chars));
  const bytes = new Uint8Array(Y.encodeStateAsUpdate(doc));
  doc.destroy();
  return bytes;
};
/** Saves text past one storage batch as consecutive updates of at most 3 MiB. */
async function saveText(owner: ReturnType<typeof createContentOwner>, chars: number) {
  const doc = new Y.Doc({ gc: false }),
    step = 3 * 1024 * 1024;
  try {
    for (let done = 0; done < chars; done += step) {
      let update: Bytes | undefined;
      const capture = (u: Uint8Array) => {
        update = new Uint8Array(u);
      };
      doc.on('update', capture);
      doc.getText('big').insert(done, 'y'.repeat(Math.min(step, chars - done)));
      doc.off('update', capture);
      await owner.append(task, [{ kind: 'update', bytes: update! }]);
    }
  } finally {
    doc.destroy();
  }
}
/** The fixed test keys the released vector was written under. */
async function releasedCrypt(scope: ContentIdentity) {
  const aes = await crypto.subtle.importKey('raw', fromHex(released.keys.aes), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  const hmac = await crypto.subtle.importKey(
    'raw',
    fromHex(released.keys.hmac),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  return {
    hmac,
    crypt: {
      sign: (t: SessionTask, b: Bytes) =>
        t.wait(async () => new Uint8Array(await crypto.subtle.sign('HMAC', hmac, b))),
      verify: (t: SessionTask, b: Bytes, m: Bytes) =>
        t.wait(() => crypto.subtle.verify('HMAC', hmac, m, b)),
      seal: () => Promise.reject(Error('read only')),
      open: (t: SessionTask, r: StoredRecord) =>
        t.wait(
          async () =>
            new Uint8Array(
              await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: r.nonce, additionalData: recordAAD(scope, r) },
                aes,
                r.ct,
              ),
            ),
        ),
    },
  };
}
/** A real Account owner that reduces once, optionally after saving one large local state. */
async function reducedOwner(chars: number) {
  fakeStorage();
  for (const name of [
    'VITE_ACCOUNT_RETENTION',
    'VITE_ACCOUNT_BASELINE_READ',
    'VITE_ACCOUNT_BASELINE_INSTALL',
  ])
    vi.stubEnv(name, '1');
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
    exactBaselineReuse: true as const,
    readBaseline: true as const,
    baseline: auth,
  };
  const owners: ReturnType<typeof createContentOwner>[] = [];
  const makeOwner = () => {
    const owner = createContentOwner(context.identity, 1, crypt);
    owners.push(owner);
    return owner;
  };
  clean.push(() => owners.forEach((o) => o.dispose()));
  const seed = makeOwner();
  await seed.initialize(task, { intent: '04'.repeat(16), checkCreation() {} });
  await seed.enableSpool(task);
  await f.appendOwn();
  await f.appendPeer();
  for (const row of f.rows as OpenedRecord[]) {
    const event =
      row.kind === 'heads' ||
      (row.kind === 'outbound' &&
        !new TextDecoder().decode(row.bytes).startsWith('["done/source-capture/v1"'));
    if (event) {
      const before = await seed.spoolWitness(task),
        after = await extendSpoolWitness(before, row.bytes, crypto.subtle);
      await seed.appendSpool(task, row, { before, after });
    } else await seed.append(task, [row]);
  }
  if (chars <= 3 * 1024 * 1024) {
    if (chars) await seed.append(task, [{ kind: 'state', bytes: bigState(chars) }]);
  } else await saveText(seed, chars);
  const db = await openContentDb(
    task,
    await deriveStoreName(context.identity.principalId, context.identity.workspaceId),
    false,
  );
  clean.push(() => db.close());
  const metaBefore = await metaRows(db);
  const result = await seed.removeHistory(
    task,
    async () => {},
    () => {},
    0,
  );
  seed.dispose();
  const owner = {
    db,
    identity: context.identity,
    generation: 1,
    intent: '04'.repeat(16),
    crypt,
    allowReduced: true,
    assertCurrent: async () => {},
    checkCommit: () => {},
  };
  return { f, context, result, makeOwner, db, owner, crypt, metaBefore };
}
const counterOf = async (db: IDBDatabase) =>
  (await metaRows(db)).find((m) => m.key === 'counter')!.value as BaselineCounter;
const bigText = (records: readonly OpenedRecord[]) => {
  const doc = new Y.Doc({ gc: false });
  try {
    for (const r of records)
      if (r.kind === 'state' || r.kind === 'update') Y.applyUpdate(doc, r.bytes);
    return doc.getText('big').length;
  } finally {
    doc.destroy();
  }
};

// 2.25 MiB of text hex-encodes past the released 4 MiB record ceiling.
const PAST_RELEASED = 2.25 * 1024 * 1024;

it('a reduction whose baseline is past the released ceiling completes, reads back, reopens and reduces again', async () => {
  const x = await reducedOwner(PAST_RELEASED);
  expect(x.result).toMatchObject({ kind: 'removed', revision: 1 });
  const stored = await counterOf(x.db);
  expect(stored.v).toBe(5);
  expect(stored.baseline.format).toBe(LARGE_BASELINE_CARRIER);
  expect(stored.baseline.bytes).toBeGreaterThan(BASELINE_MAX_BYTES);
  expect(stored.baseline.chunks).toBe(
    Math.ceil(stored.baseline.bytes / LARGE_BASELINE_CHUNK_BYTES),
  );
  expect(stored.baseline.chunks).toBeLessThanOrEqual(BASELINE_MAX_CHUNKS);
  const chunks = (await metaRows(x.db)).filter((m) => Array.isArray(m.key));
  expect(chunks).toHaveLength(stored.baseline.chunks);
  const held = await readEncryptedBaseline(task, x.owner);
  expect(held.baseline.payload.length).toBeGreaterThan(LOCAL_BASELINE_LIMIT);
  expect(decodeLocalBaseline(held.baseline.payload).journalEra).toBeDefined();
  // A cold owner authenticates, replays and opens the writing from the larger carrier.
  const reopened = x.makeOwner();
  await reopened.initialize(task);
  const first = await reopened.loadAccount(task);
  expect(first.kind).toBe('baseline-plus-suffix');
  expect(bigText(first.records)).toBe(PAST_RELEASED);
  // The next reduction rebases from the larger carrier and keeps it.
  expect(
    await reopened.removeHistory(
      task,
      async () => {},
      () => {},
      1,
    ),
  ).toMatchObject({
    kind: 'removed',
    revision: 2,
  });
  expect((await counterOf(x.db)).baseline).toMatchObject({
    format: LARGE_BASELINE_CARRIER,
    revision: 2,
  });
  reopened.dispose();
  const again = x.makeOwner();
  await again.initialize(task);
  expect(bigText((await again.loadAccount(task)).records)).toBe(PAST_RELEASED);
  // The released startup census still accepts its key count.
  const census = await contentCensus(
    task,
    await deriveStoreName(x.context.identity.principalId, x.context.identity.workspaceId),
    true,
  );
  expect(census!.metadataKeys).toHaveLength(1 + stored.baseline.chunks);
}, 120000);

it('a baseline that fits the released carrier is still written in it', async () => {
  const x = await reducedOwner(0);
  expect(x.result).toMatchObject({ kind: 'removed', revision: 1 });
  const stored = await counterOf(x.db);
  expect(stored.baseline.format).toBe(REDUCED_BASELINE_CARRIER);
  expect(stored.baseline.chunks).toBe(Math.ceil(stored.baseline.bytes / (256 * 1024)));
  const held = await readEncryptedBaseline(task, x.owner);
  expect(held.baseline.payload.length).toBeLessThanOrEqual(LOCAL_BASELINE_LIMIT);
}, 60000);

it('a released draft-3 reduced store and draft-2 record still open and authenticate byte for byte', async () => {
  fakeStorage();
  const f = await memberFixture();
  clean.push(f.clear);
  await f.appendOwn();
  await f.appendPeer();
  await f.appendHistory();
  const v = released.v5,
    identity = v.identity as ContentIdentity;
  expect(identity).toEqual(f.ctx.identity);
  const { crypt, hmac } = await releasedCrypt(identity);
  const db = await openContentDb(task, 'released-vector', true);
  clean.push(() => db.close());
  for (const row of revive(v.meta) as { key: IDBValidKey; value: unknown }[])
    await putMeta(db, row.key, row.value);
  const owner = {
    db,
    identity,
    generation: v.generation,
    intent: v.intent,
    crypt,
    allowReduced: true,
    assertCurrent: async () => {},
    checkCommit: () => {},
  };
  const held = await readEncryptedBaseline(task, owner);
  expect(held.counter.baseline.format).toBe(REDUCED_BASELINE_CARRIER);
  expect(toHex(held.baseline.payload)).toBe(v.payload);
  expect(toHex(held.baseline.mac)).toBe(v.mac);
  expect(held.anchor).toEqual(v.anchor);
  expect(toHex(baselineCounterPayload(identity, held.counter))).toBe(v.counterPayload);
  expect(toHex(baselineChunkPrefix(identity, held.counter.baseline, 0))).toBe(v.chunkPrefix0);
  expect(toHex(encodeLocalBaseline(decodeLocalBaseline(held.baseline.payload)))).toBe(v.payload);
  const message = baselineAuthenticationPayload(held.baseline.payload);
  expect(sha256(message)).toBe(v.authMessageSha256);
  assertBaselineAuthenticationMessage(message);
  const auth = {
    sign: async () => {
      throw Error('read only');
    },
    verify: (b: Bytes, mac: Bytes) => crypto.subtle.verify('HMAC', hmac, mac, b),
  };
  const { baseline: _pointer, ...allocation } = held.counter;
  const replayed = await replayLocalBaseline(
    held.baseline,
    held.anchor,
    { records: [], counter: { ...allocation, v: 2 } },
    f.ctx,
    auth,
  );
  expect(sha256(replayed.snapshot)).toBe(v.replayedSnapshotSha256);
  // The released no-era record keeps its bytes, domain and MAC.
  const d2 = fromHex(released.draft2.payload);
  expect(toHex(encodeLocalBaseline(decodeLocalBaseline(d2)))).toBe(released.draft2.payload);
  const m2 = baselineAuthenticationPayload(d2);
  expect(sha256(m2)).toBe(released.draft2.authMessageSha256);
  expect(await auth.verify(m2, fromHex(released.draft2.mac))).toBe(true);
});

it('persisted bytes past either bound remain integrity refusals, and unknown carriers stay compatibility refusals', async () => {
  const stored = (revive(released.v5.meta) as { key: unknown; value: unknown }[]).find(
    (m) => m.key === 'counter',
  )!.value as BaselineCounter;
  const identity = released.v5.identity as ContentIdentity,
    intent = released.v5.intent as string;
  const pointer = (change: (p: BaselineCounter['baseline']) => void) => {
    const c = structuredClone(stored);
    // Leave room in the allocation for every chunk count tried here.
    c.next_seq += 32;
    c.reserved['1']! += 32;
    change(c.baseline);
    return () => parseBaselineCounter(c, identity, intent, true);
  };
  const large = (bytes: number, chunks = Math.ceil(bytes / LARGE_BASELINE_CHUNK_BYTES)) =>
    pointer((p) => {
      p.format = LARGE_BASELINE_CARRIER;
      p.bytes = bytes;
      p.chunks = chunks;
    });
  // Well-formed larger pointers parse; their bytes are still authenticated by the reader.
  expect(large(BASELINE_MAX_BYTES + 1)().baseline.format).toBe(LARGE_BASELINE_CARRIER);
  expect(large(LARGE_BASELINE_MAX_BYTES)().baseline.chunks).toBe(BASELINE_MAX_CHUNKS);
  for (const refused of [
    // Past the new firm bound, or more chunks than any carrier allows.
    large(LARGE_BASELINE_MAX_BYTES + 1),
    large(LARGE_BASELINE_MAX_BYTES, BASELINE_MAX_CHUNKS + 1),
    // A baseline that fits the released carrier is never stored in the larger one.
    large(BASELINE_MAX_BYTES),
    large(stored.baseline.bytes),
    // Chunk arithmetic is per carrier.
    large(BASELINE_MAX_BYTES + 1, Math.ceil((BASELINE_MAX_BYTES + 1) / (256 * 1024))),
    // The released carrier keeps its released bound.
    pointer((p) => {
      p.bytes = BASELINE_MAX_BYTES + 1;
      p.chunks = Math.ceil(p.bytes / (256 * 1024));
    }),
  ]) {
    expect(refused).toThrow(ContentError);
    try {
      refused();
    } catch (e) {
      expect((e as ContentError).code).toBe('repair-required');
    }
  }
  // Only the reduced reader accepts the larger carrier, and it is never a complete history.
  expect(() =>
    parseBaselineCounter(
      {
        ...structuredClone(stored),
        baseline: { ...stored.baseline, format: LARGE_BASELINE_CARRIER },
      },
      identity,
      intent,
      false,
    ),
  ).toThrow(StorageCompatibilityError);
  expect(
    pointer((p) => {
      p.format = LARGE_BASELINE_CARRIER;
      p.bytes = BASELINE_MAX_BYTES + 1;
      p.chunks = 3;
      p.history = 'complete';
    }),
  ).toThrow(StorageCompatibilityError);
  expect(
    pointer((p) => {
      p.format = 'done/local-baseline-carrier/draft-5' as typeof p.format;
    }),
  ).toThrow(StorageCompatibilityError);
  // The format is bound by both the counter MAC payload and every chunk's encrypted prefix.
  const moved = structuredClone(stored);
  moved.baseline.format = LARGE_BASELINE_CARRIER;
  expect(baselineCounterPayload(identity, moved)).not.toEqual(
    baselineCounterPayload(identity, stored),
  );
  expect(baselineChunkPrefix(identity, moved.baseline, 0)).not.toEqual(
    baselineChunkPrefix(identity, stored.baseline, 0),
  );
  // Record bounds are checked before parsing or authentication.
  // The frame parser refuses before reading any byte of an oversized record.
  expect(() => decodeLocalBaseline(new Uint8Array(LARGE_LOCAL_BASELINE_LIMIT + 1))).toThrow(
    'Invalid inbound frame',
  );
  expect(() =>
    baselineAuthenticationPayload(new Uint8Array(LARGE_LOCAL_BASELINE_LIMIT + 1)),
  ).toThrow('Invalid local baseline');
  // A record without a journal era keeps the released bound even when well formed.
  const wire = JSON.parse(Buffer.from(fromHex(released.draft2.payload)).toString());
  wire[8] = toHex(new Uint8Array(LOCAL_BASELINE_LIMIT / 2 + 1).fill(1));
  const oversized = new TextEncoder().encode(JSON.stringify(wire));
  expect(oversized.length).toBeGreaterThan(LOCAL_BASELINE_LIMIT);
  expect(oversized.length).toBeLessThan(LARGE_LOCAL_BASELINE_LIMIT);
  expect(() => decodeLocalBaseline(oversized)).toThrow('Invalid local baseline');
  expect(() => baselineAuthenticationPayload(oversized)).toThrow('Invalid local baseline');
});

it('a stored larger chunk of the wrong size refuses before it is opened', async () => {
  const x = await reducedOwner(PAST_RELEASED);
  const chunk = (await metaRows(x.db)).find((m) => Array.isArray(m.key))!;
  const short = structuredClone(chunk.value) as StoredRecord;
  short.ct = short.ct.slice(0, 256 * 1024 + 64);
  await putMeta(x.db, chunk.key, short);
  await expect(readEncryptedBaseline(task, x.owner)).rejects.toThrow('chunk size differs');
}, 120000);

it('the 8 MiB write ceiling is a capacity refusal for a new candidate; the read bound stays 32 MiB', async () => {
  const b = decodeLocalBaseline(fromHex(released.v5.payload));
  // A journal-era candidate fits up to the write ceiling.
  const under = LARGE_LOCAL_BASELINE_WRITE_LIMIT / 2 - 16 * 1024;
  const fits = encodeLocalBaseline({ ...b, snapshot: new Uint8Array(under).fill(7) });
  expect(fits.length).toBeGreaterThan(LOCAL_BASELINE_LIMIT);
  expect(fits.length).toBeLessThanOrEqual(LARGE_LOCAL_BASELINE_WRITE_LIMIT);
  expect(decodeLocalBaseline(fits).snapshot.length).toBe(under);
  // Past it, encoding refuses as capacity, not integrity, though the reader would accept it.
  for (const bytes of [LARGE_LOCAL_BASELINE_WRITE_LIMIT / 2, LARGE_LOCAL_BASELINE_LIMIT / 2])
    expect(() => encodeLocalBaseline({ ...b, snapshot: new Uint8Array(bytes).fill(7) })).toThrow(
      LocalBaselineCapacityError,
    );
  // A record without an era keeps the released ceiling as capacity.
  const { journalEra: _era, ...plain } = b;
  expect(() =>
    encodeLocalBaseline({ ...plain, snapshot: new Uint8Array(LOCAL_BASELINE_LIMIT / 2 + 1) }),
  ).toThrow(LocalBaselineCapacityError);
});

// 4 MiB of text encodes just over the write ceiling; 64 KiB less encodes just under it.
const AT_WRITE_CEILING = LARGE_LOCAL_BASELINE_WRITE_LIMIT / 2;

it('a reduction just over the write ceiling parks as capacity and writes nothing', async () => {
  const x = await reducedOwner(AT_WRITE_CEILING);
  // The refusal names the write ceiling and the encoded size the candidate needed (phase 543).
  expect(x.result).toEqual({
    kind: 'skipped',
    reason: 'capacity',
    detail: {
      cause: 'snapshot-size',
      needed: expect.any(Number),
      allowed: LARGE_LOCAL_BASELINE_WRITE_LIMIT,
    },
  });
  const needed = (x.result as { detail: { needed: number } }).detail.needed;
  expect(needed).toBeGreaterThan(LARGE_LOCAL_BASELINE_WRITE_LIMIT);
  expect(needed).toBeLessThan(LARGE_LOCAL_BASELINE_WRITE_LIMIT + 64 * 1024);
  expect(await metaRows(x.db)).toEqual(x.metaBefore);
  expect((await counterOf(x.db)).v).toBe(2);
}, 120000);

it('a reduction just under the write ceiling completes in draft-4 and reads back', async () => {
  const x = await reducedOwner(AT_WRITE_CEILING - 64 * 1024);
  expect(x.result).toMatchObject({ kind: 'removed', revision: 1 });
  const stored = await counterOf(x.db);
  expect(stored.baseline.format).toBe(LARGE_BASELINE_CARRIER);
  const held = await readEncryptedBaseline(task, x.owner);
  expect(held.baseline.payload.length).toBeLessThanOrEqual(LARGE_LOCAL_BASELINE_WRITE_LIMIT);
  expect(held.baseline.payload.length).toBeGreaterThan(
    LARGE_LOCAL_BASELINE_WRITE_LIMIT - 256 * 1024,
  );
  const cold = x.makeOwner();
  await cold.initialize(task);
  expect(bigText((await cold.loadAccount(task)).records)).toBe(AT_WRITE_CEILING - 64 * 1024);
}, 120000);

/** Replace a reduced store's baseline with a larger valid one, as a later build with a higher
 * write ceiling would store it: same cut and era, a superset document, the draft-4 carrier. */
async function storeAsLaterBuild(x: Awaited<ReturnType<typeof reducedOwner>>, extra: number) {
  const held = await readEncryptedBaseline(task, x.owner),
    old = decodeLocalBaseline(held.baseline.payload);
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, old.snapshot);
  doc.getText('big').insert(doc.getText('big').length, 'z'.repeat(extra));
  const snapshot = new Uint8Array(Y.encodeStateAsUpdate(doc));
  doc.destroy();
  const wire = JSON.parse(new TextDecoder().decode(held.baseline.payload));
  wire[8] = toHex(snapshot);
  const payload = new TextEncoder().encode(JSON.stringify(wire));
  const mac = await x.crypt.sign(task, baselineAuthenticationPayload(payload));
  const packed = new Uint8Array(mac.length + payload.length);
  packed.set(mac);
  packed.set(payload, mac.length);
  const before = held.counter,
    chunks = Math.ceil(packed.length / LARGE_BASELINE_CHUNK_BYTES),
    grow = chunks - before.baseline.chunks,
    generation = before.baseline.generation;
  const pointer: BaselineCounter['baseline'] = {
    ...before.baseline,
    format: LARGE_BASELINE_CARRIER,
    commitment: toHex(mac),
    chunks,
    bytes: packed.length,
  };
  const counter: BaselineCounter = {
    ...before,
    next_seq: before.next_seq + grow,
    reserved: { ...before.reserved, [generation]: before.reserved[String(generation)]! + grow },
    baseline: pointer,
  };
  counter.mac = await x.crypt.sign(task, baselineCounterPayload(x.context.identity, counter));
  const sealed: StoredRecord[] = [];
  for (let i = 0; i < chunks; i++) {
    const prefix = baselineChunkPrefix(x.context.identity, pointer, i),
      part = packed.subarray(i * LARGE_BASELINE_CHUNK_BYTES, (i + 1) * LARGE_BASELINE_CHUNK_BYTES),
      plain = new Uint8Array(prefix.length + part.length);
    plain.set(prefix);
    plain.set(part, prefix.length);
    sealed.push(
      await x.crypt.seal(
        task,
        { v: 1, gen: generation, seq: pointer.firstSequence + i, kind: 'heads' },
        plain,
      ),
    );
  }
  await new Promise<void>((yes, no) => {
    const tx = x.db.transaction('meta', 'readwrite'),
      store = tx.objectStore('meta');
    store.put(counter, 'counter');
    sealed.forEach((row, i) => store.put(row, ['local-baseline', i]));
    for (let i = chunks; i < before.baseline.chunks; i++) store.delete(['local-baseline', i]);
    tx.oncomplete = () => yes();
    tx.onabort = () => no(tx.error);
  });
  return payload.length;
}

it('a stored draft-4 baseline between the write ceiling and the read bound opens, but cannot reduce again here', async () => {
  const x = await reducedOwner(PAST_RELEASED),
    extra = 2.5 * 1024 * 1024;
  const bytes = await storeAsLaterBuild(x, extra);
  expect(bytes).toBeGreaterThan(LARGE_LOCAL_BASELINE_WRITE_LIMIT);
  expect(bytes).toBeLessThanOrEqual(LARGE_LOCAL_BASELINE_LIMIT);
  const held = await readEncryptedBaseline(task, x.owner);
  expect(held.baseline.payload.length).toBe(bytes);
  const { baseline: _pointer, ...allocation } = held.counter;
  await replayLocalBaseline(
    held.baseline,
    held.anchor,
    { records: [], counter: { ...allocation, v: 2 } },
    x.context,
    { verify: (b, mac) => x.crypt.verify(task, b, mac) },
  );
  // A cold owner authenticates, replays and opens it.
  const cold = x.makeOwner();
  await cold.initialize(task);
  const read = await cold.loadAccount(task);
  expect(read.kind).toBe('baseline-plus-suffix');
  expect(bigText(read.records)).toBe(PAST_RELEASED + extra);
  // Its next candidate is past this build's write ceiling: the reduction parks, writing nothing.
  const before = await metaRows(x.db);
  expect(
    await cold.removeHistory(
      task,
      async () => {},
      () => {},
      1,
    ),
  ).toEqual({
    kind: 'skipped',
    reason: 'capacity',
    detail: {
      cause: 'snapshot-size',
      needed: expect.any(Number),
      allowed: LARGE_LOCAL_BASELINE_WRITE_LIMIT,
    },
  });
  expect(await metaRows(x.db)).toEqual(before);
}, 120000);

it('the complete-history writer refuses a candidate past the released carrier before reserving', async () => {
  fakeStorage();
  const f = await setup(task, 'ef'.repeat(16), 40);
  clean.push(f.close);
  const b = decodeLocalBaseline(f.input.baseline.payload);
  const payload = encodeLocalBaseline({
    ...b,
    journalEra: { current: 'ab'.repeat(32), previous: null, revision: 1 },
    snapshot: new Uint8Array(LOCAL_BASELINE_LIMIT / 2 + 1).fill(3),
  });
  expect(payload.length).toBeGreaterThan(LOCAL_BASELINE_LIMIT);
  const seal = vi.spyOn(f.owner.crypt, 'seal'),
    before = await readCensus(task, f.owner);
  await expect(
    anchorLocalBaseline(task, f.owner, f.census, {
      baseline: {
        payload,
        mac: await f.owner.crypt.sign(task, baselineAuthenticationPayload(payload)),
      },
      anchor: { revision: 1, hash: sha256(payload) },
    }),
  ).rejects.toMatchObject({
    detail: { cause: 'snapshot-size', needed: payload.length, allowed: LOCAL_BASELINE_LIMIT },
  });
  expect(seal).not.toHaveBeenCalled();
  expect(await readCensus(task, f.owner)).toEqual(before);
});

it('a candidate refusal names its bound with exact sizes and counts (phase 543)', () => {
  const b = decodeLocalBaseline(fromHex(released.v5.payload));
  const refusal = (candidate: typeof b) => {
    try {
      encodeLocalBaseline(candidate);
    } catch (cause) {
      expect(cause).toBeInstanceOf(LocalBaselineCapacityError);
      return (cause as LocalBaselineCapacityError).detail;
    }
    throw Error('encoded');
  };
  // The size a later build would have written: the same wire with this snapshot.
  const wireLength = (snapshot: Bytes) => {
    const wire = JSON.parse(new TextDecoder().decode(fromHex(released.v5.payload)));
    wire[8] = toHex(snapshot);
    return new TextEncoder().encode(JSON.stringify(wire)).length;
  };
  // Past the ceiling only once encoded: the measured encoded length.
  const encodedPast = new Uint8Array(LARGE_LOCAL_BASELINE_WRITE_LIMIT / 2).fill(5);
  expect(refusal({ ...b, snapshot: encodedPast })).toEqual({
    cause: 'snapshot-size',
    needed: wireLength(encodedPast),
    allowed: LARGE_LOCAL_BASELINE_WRITE_LIMIT,
  });
  // A snapshot alone past the ceiling is refused before encoding, with the same exact figure.
  const rawPast = new Uint8Array(LARGE_LOCAL_BASELINE_WRITE_LIMIT + 1).fill(5);
  expect(refusal({ ...b, snapshot: rawPast })).toEqual({
    cause: 'snapshot-size',
    needed: wireLength(rawPast),
    allowed: LARGE_LOCAL_BASELINE_WRITE_LIMIT,
  });
  expect(refusal({ ...b, sources: Array.from({ length: 4097 }, () => b.sources[0]!) })).toEqual({
    cause: 'snapshot-sources',
    needed: 4097,
    allowed: 4096,
  });
  expect(refusal({ ...b, streams: Array.from({ length: 129 }, () => b.streams[0]!) })).toEqual({
    cause: 'snapshot-publishers',
    needed: 129,
    allowed: 128,
  });
});
