/** Auxiliary encrypted preparation only. Never creates, replaces or deletes a logical content row. */
import { contentTransaction } from './contentDatabase';
import { probeDatabase, checkLayout } from './startupStorage';
import { parseStoredRecord, type StoredRecord, type ContentCounter } from './contentRecord';
import type { ContentCrypto } from './contentStore';
import type { RetentionInventory } from './localRetentionPlan';
import { sameRetentionInventory } from './localRetentionPlan';
import type { SessionTask } from './writeSession';
import { StorageCompatibilityError } from './storageCompatibility';
import { encodePreparationValue, decodePreparationValue } from './preparationValue';
import {
  preparationDomain,
  authenticatePreparationReceipts,
  disposePreparationReceipts,
  PreparationCapacity,
  type PreparationReceipts,
  type PreparationJournal,
  preparationReceiptCount,
} from './retentionPreparation';
import {
  capturePreparationPrefix,
  matchesPreparationPrefix,
  parsePreparationPrefix,
  type PreparationPrefix,
} from './retentionPreparationBinding';
import { sameBytes, eraseVerified } from './verifiedRecords';
import { hex, type Bytes } from './custodyCrypto';

export const PREPARATION_CHUNK_BYTES = 256 * 1024;
export const PREPARATION_MAX_CHUNKS = 256;
export const PREPARATION_MAX_BYTES = 32 * 1024 * 1024;
import { preparationStoreName } from './retentionPreparationDatabase';
export { preparationStoreName, removePreparationCache } from './retentionPreparationDatabase';

export interface PreparationSource {
  context: string;
  inventory: RetentionInventory;
  counter: ContentCounter;
}
interface Delta {
  bytes: number;
  hash: string;
  mac: Bytes;
  chunks: number[];
}
interface Head {
  context: string;
  prefix: PreparationPrefix;
  deltas: Delta[];
}
interface Raw {
  head: unknown;
  chunks: { key: IDBValidKey; value: unknown }[];
}
export interface PreparationCheckpoint {
  readonly kind: 'preparation-checkpoint';
}
interface Held {
  source: { context: string; prefix: PreparationPrefix };
  raw: Raw;
  head?: Head;
  proofs: PreparationReceipts[];
  imported?: true;
}
const held = new WeakMap<PreparationCheckpoint, Held>();
export interface PreparationStorageOwner {
  name: string;
  crypt: Pick<ContentCrypto, 'open' | 'seal' | 'sign' | 'verify'>;
  /** Fresh native census, authenticated counter and current custody-derived context. */
  capture(task: SessionTask): Promise<PreparationSource>;
  /** Serialized authenticated content allocator. Never called from discretionary read work. */
  reserve(task: SessionTask, count: number): Promise<{ first: number; generation: number }>;
}
const hash = async (b: Bytes) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', b)));
const invalid = (): never => {
  throw Error('Invalid encrypted preparation checkpoint');
};
const positive = (n: unknown) => Number.isSafeInteger(n) && Number(n) > 0;
function parseHead(input: unknown): Head {
  if (
    !Array.isArray(input) ||
    input.length !== 5 ||
    !(input[0] instanceof Uint8Array) ||
    !sameBytes(input[0], preparationDomain('head')) ||
    input[1] !== 1 ||
    typeof input[2] !== 'string' ||
    !/^[0-9a-f]{64}$/.test(input[2]) ||
    !Array.isArray(input[4]) ||
    input[4].length > PREPARATION_MAX_CHUNKS
  )
    return invalid();
  const deltas: Delta[] = [],
    seen = new Set<number>();
  let total = 0;
  for (const d of input[4]) {
    if (
      !Array.isArray(d) ||
      d.length !== 4 ||
      !positive(d[0]) ||
      d[0] > PREPARATION_MAX_BYTES ||
      typeof d[1] !== 'string' ||
      !/^[0-9a-f]{64}$/.test(d[1]) ||
      !(d[2] instanceof Uint8Array) ||
      d[2].length !== 32 ||
      !Array.isArray(d[3]) ||
      d[3].length !== Math.ceil(d[0] / PREPARATION_CHUNK_BYTES)
    )
      return invalid();
    total += d[0];
    if (total > PREPARATION_MAX_BYTES) return invalid();
    const chunks: number[] = [];
    for (const seq of d[3]) {
      if (!positive(seq) || seen.has(seq) || seen.size >= PREPARATION_MAX_CHUNKS) return invalid();
      seen.add(seq);
      chunks.push(seq);
    }
    deltas.push({ bytes: d[0], hash: d[1], mac: d[2].slice(), chunks });
  }
  return { context: input[2], prefix: parsePreparationPrefix(input[3]), deltas };
}
function assertLayout(db: IDBDatabase) {
  if (db.version !== 1) throw new StorageCompatibilityError('Preparation cache reader required.');
  checkLayout(db, { head: null, chunks: null });
}
async function openForWrite(task: SessionTask, name: string): Promise<IDBDatabase> {
  const found = await probeDatabase(task, name, async (db) => {
    assertLayout(db);
    return true;
  });
  // This open owns creation. The preliminary probe never leaves an empty database behind.
  if (found !== null && found !== true) invalid();
  return task.wait(
    () =>
      new Promise((resolve, reject) => {
        let abandoned = false,
          failure: unknown;
        const r = task.step(() => indexedDB.open(name, 1));
        r.onupgradeneeded = () => {
          try {
            task.step(() => {
              r.result.createObjectStore('head');
              r.result.createObjectStore('chunks');
            });
          } catch (e) {
            failure = e;
            r.transaction!.abort();
          }
        };
        r.onblocked = () => {
          abandoned = true;
          reject(Error('Preparation cache is blocked'));
        };
        r.onerror = () => reject(failure ?? r.error);
        r.onsuccess = () => {
          const db = r.result;
          if (abandoned || task.signal.aborted) {
            db.close();
            reject(Error('Preparation cache open cancelled'));
            return;
          }
          try {
            task.step(() => assertLayout(db));
            db.onversionchange = () => db.close();
            resolve(db);
          } catch (e) {
            db.close();
            reject(e);
          }
        };
      }),
  );
}
async function readRaw(task: SessionTask, name: string): Promise<Raw> {
  const result = await probeDatabase(task, name, (db) => {
    assertLayout(db);
    return task.wait(() =>
      contentTransaction<Raw>(db, task, ['head', 'chunks'], 'readonly', (tx, result, guard) => {
        const value: Raw = { head: undefined, chunks: [] };
        result(value);
        const count = tx.objectStore('head').count(),
          h = tx.objectStore('head').get('current');
        h.onsuccess = () =>
          guard(() => {
            if (count.result > 1) invalid();
            value.head = h.result;
          });
        const store = tx.objectStore('chunks'),
          keys = store.getAllKeys(undefined, PREPARATION_MAX_CHUNKS + 1),
          values = store.getAll(undefined, PREPARATION_MAX_CHUNKS + 1);
        values.onsuccess = () =>
          guard(() => {
            if (
              keys.result.length !== values.result.length ||
              keys.result.length > PREPARATION_MAX_CHUNKS
            )
              invalid();
            value.chunks = keys.result.map((key, i) => ({ key, value: values.result[i] }));
          });
      }),
    );
  });
  return result ?? { head: undefined, chunks: [] };
}
const same = (a: unknown, b: unknown) =>
  sameRetentionInventory(
    { rows: [], metadata: [{ key: 'cache', value: a }] },
    { rows: [], metadata: [{ key: 'cache', value: b }] },
  );
export function importPreparationCheckpoint(
  checkpoint: PreparationCheckpoint,
  journal: PreparationJournal,
) {
  const p = held.get(checkpoint);
  if (!p?.head) throw Error('Preparation checkpoint has no reusable proof');
  if (p.imported) throw Error('Preparation checkpoint already imported');
  for (const proof of p.proofs) journal.import(proof);
  for (const proof of p.proofs) disposePreparationReceipts(proof);
  p.proofs.length = 0;
  p.imported = true;
}
/** Encoded bytes one more saved slice may take under the delta, chunk and byte caps that
 * savePreparationDelta enforces; zero when no further slice can be saved. */
export function preparationCheckpointRoom(checkpoint: PreparationCheckpoint): number {
  const p = held.get(checkpoint);
  if (!p) throw Error('Preparation checkpoint expired');
  const prior = p.head?.deltas ?? [];
  if (prior.length + 1 > PREPARATION_MAX_CHUNKS) return 0;
  const chunks = PREPARATION_MAX_CHUNKS - prior.flatMap((d) => d.chunks).length,
    bytes = PREPARATION_MAX_BYTES - prior.reduce((a, d) => a + d.bytes, 0);
  return Math.max(0, Math.min(bytes, chunks * PREPARATION_CHUNK_BYTES));
}
export function disposePreparationCheckpoint(checkpoint: PreparationCheckpoint) {
  const p = held.get(checkpoint);
  if (p) {
    for (const proof of p.proofs) disposePreparationReceipts(proof);
    eraseVerified(p.raw);
    eraseVerified(p.head);
    held.delete(checkpoint);
  }
}
export async function loadPreparationCheckpoint(
  task: SessionTask,
  owner: PreparationStorageOwner,
  source: PreparationSource,
): Promise<{ status: 'empty' | 'stale' | 'invalid' | 'ready'; checkpoint: PreparationCheckpoint }> {
  const prefix = await capturePreparationPrefix(source.inventory, source.counter);
  task.step(() => {});
  const name = preparationStoreName(owner.name),
    raw = await readRaw(task, name);
  let status: 'empty' | 'stale' | 'invalid' | 'ready' = 'empty',
    head: Head | undefined;
  const proofs: PreparationReceipts[] = [];
  try {
    if (raw.head === undefined) {
      if (raw.chunks.length) status = 'invalid';
    } else {
      const r = parseStoredRecord(raw.head);
      if (r.gen !== source.counter.active_gen) status = 'stale';
      else {
        if (
          r.kind !== 'heads' ||
          r.seq >= source.counter.next_seq ||
          r.ct.length > PREPARATION_CHUNK_BYTES
        )
          invalid();
        const plain = await owner.crypt.open(task, r);
        let value: unknown;
        try {
          task.step(() => {});
          value = decodePreparationValue(plain);
          head = parseHead(value);
        } finally {
          plain.fill(0);
          eraseVerified(value);
        }
        if (
          head.context !== source.context ||
          !(await matchesPreparationPrefix(head.prefix, source.inventory, source.counter))
        )
          status = 'stale';
        else {
          const selected = head.deltas.flatMap((d) => d.chunks),
            byKey = new Map(raw.chunks.map((r) => [r.key, r.value]));
          if (selected.length !== raw.chunks.length || selected.some((k) => !byKey.has(k)))
            invalid();
          for (const delta of head.deltas) {
            const payload = new Uint8Array(delta.bytes);
            try {
              for (const [i, seq] of delta.chunks.entries()) {
                const r = parseStoredRecord(byKey.get(seq));
                if (
                  r.seq !== seq ||
                  r.kind !== 'heads' ||
                  r.gen !== source.counter.active_gen ||
                  r.seq >= source.counter.next_seq ||
                  r.ct.length > PREPARATION_CHUNK_BYTES + 1024
                )
                  invalid();
                const plain = await owner.crypt.open(task, r);
                let value: unknown;
                try {
                  task.step(() => {});
                  value = decodePreparationValue(plain);
                  if (
                    !Array.isArray(value) ||
                    value.length !== 6 ||
                    !(value[0] instanceof Uint8Array) ||
                    !sameBytes(value[0], preparationDomain('chunk')) ||
                    value[1] !== source.context ||
                    value[2] !== delta.hash ||
                    value[3] !== i ||
                    value[4] !== delta.chunks.length ||
                    !(value[5] instanceof Uint8Array) ||
                    value[5].length !==
                      Math.min(PREPARATION_CHUNK_BYTES, delta.bytes - i * PREPARATION_CHUNK_BYTES)
                  )
                    invalid();
                  payload.set((value as unknown[])[5] as Bytes, i * PREPARATION_CHUNK_BYTES);
                } finally {
                  plain.fill(0);
                  eraseVerified(value);
                }
              }
              if ((await hash(payload)) !== delta.hash) invalid();
              proofs.push(
                await authenticatePreparationReceipts(
                  source.context,
                  payload,
                  delta.mac,
                  { verify: (b, m) => owner.crypt.verify(task, b, m) },
                  () => task.step(() => {}),
                ),
              );
            } finally {
              payload.fill(0);
            }
          }
          task.step(() => {});
          status = 'ready';
        }
      }
    }
  } catch (cause) {
    const cleanup = () => {
      for (const p of proofs) disposePreparationReceipts(p);
      eraseVerified(raw);
      eraseVerified(head);
    };
    try {
      task.step(() => {});
    } catch (stopped) {
      cleanup();
      throw stopped;
    }
    if (cause instanceof StorageCompatibilityError) {
      cleanup();
      throw cause;
    }
    status = 'invalid';
  }
  if (status !== 'ready') {
    for (const p of proofs) disposePreparationReceipts(p);
    proofs.length = 0;
    eraseVerified(head);
    head = undefined;
  }
  try {
    task.step(() => {});
  } catch (cause) {
    for (const p of proofs) disposePreparationReceipts(p);
    eraseVerified(raw);
    eraseVerified(head);
    throw cause;
  }
  const checkpoint: PreparationCheckpoint = Object.freeze({ kind: 'preparation-checkpoint' });
  held.set(checkpoint, {
    source: { context: source.context, prefix },
    raw,
    ...(head ? { head } : {}),
    proofs,
  });
  return { status, checkpoint };
}
/** Same-task convenience. Composition seals its delta before its read task settles. */
export async function savePreparationCheckpoint(
  task: SessionTask,
  owner: PreparationStorageOwner,
  checkpoint: PreparationCheckpoint,
  journal: PreparationJournal,
) {
  if (!held.has(checkpoint)) throw Error('Preparation checkpoint expired');
  const delta = await journal.delta({ sign: (b) => owner.crypt.sign(task, b) });
  try {
    return {
      ...(await savePreparationDelta(task, owner, checkpoint, delta)),
      entries: journal.statistics.entries,
    };
  } finally {
    eraseVerified(delta);
  }
}
/** A freshly authenticated delta is the handoff; no expired task or journal callback escapes. */
export async function savePreparationDelta(
  task: SessionTask,
  owner: PreparationStorageOwner,
  checkpoint: PreparationCheckpoint,
  input: { payload: Bytes; mac: Bytes },
) {
  const p = held.get(checkpoint);
  if (!p) throw Error('Preparation checkpoint expired');
  const delta = { payload: input.payload.slice(), mac: input.mac.slice() };
  let fresh: PreparationSource | undefined;
  const chunks: StoredRecord[] = [];
  let header: StoredRecord | undefined, headBytes: Bytes | undefined;
  try {
    fresh = await owner.capture(task);
    if (
      fresh.context !== p.source.context ||
      !(await matchesPreparationPrefix(p.source.prefix, fresh.inventory, fresh.counter))
    )
      throw Error('Preparation capture changed');
    const prefix = await capturePreparationPrefix(fresh.inventory, fresh.counter);
    const prior = p.head?.deltas ?? [];
    const proof = await authenticatePreparationReceipts(
      fresh.context,
      delta.payload,
      delta.mac,
      { verify: (b, m) => owner.crypt.verify(task, b, m) },
      () => task.step(() => {}),
    );
    let newEntries: number;
    try {
      newEntries = preparationReceiptCount(proof);
    } finally {
      disposePreparationReceipts(proof);
    }
    if (!newEntries) throw Error('Preparation checkpoint has no new work');
    const n = Math.ceil(delta.payload.length / PREPARATION_CHUNK_BYTES),
      total = prior.reduce((a, d) => a + d.bytes, 0) + delta.payload.length;
    if (
      prior.length + 1 > PREPARATION_MAX_CHUNKS ||
      prior.flatMap((d) => d.chunks).length + n > PREPARATION_MAX_CHUNKS
    )
      throw new PreparationCapacity({ cause: 'resume-progress' });
    if (total > PREPARATION_MAX_BYTES)
      throw new PreparationCapacity({
        cause: 'resume-progress',
        needed: total,
        allowed: PREPARATION_MAX_BYTES,
      });
    const reservation = await owner.reserve(task, n + 1);
    if (
      reservation.generation !== fresh.counter.active_gen ||
      reservation.first < fresh.counter.next_seq
    )
      invalid();
    const digest = await hash(delta.payload);
    for (let i = 0; i < n; i++) {
      const body = encodePreparationValue([
        preparationDomain('chunk'),
        fresh.context,
        digest,
        i,
        n,
        delta.payload.subarray(i * PREPARATION_CHUNK_BYTES, (i + 1) * PREPARATION_CHUNK_BYTES),
      ]);
      try {
        chunks.push(
          await owner.crypt.seal(
            task,
            { v: 1, kind: 'heads', gen: reservation.generation, seq: reservation.first + i },
            body,
          ),
        );
      } finally {
        body.fill(0);
      }
    }
    const descriptor: Delta = {
      bytes: delta.payload.length,
      hash: digest,
      mac: delta.mac,
      chunks: chunks.map((r) => r.seq),
    };
    const head: Head = { context: fresh.context, prefix, deltas: [...prior, descriptor] };
    headBytes = encodePreparationValue([
      preparationDomain('head'),
      1,
      head.context,
      head.prefix,
      head.deltas.map((d) => [d.bytes, d.hash, d.mac, d.chunks]),
    ]);
    if (headBytes.length > PREPARATION_CHUNK_BYTES - 16)
      throw new PreparationCapacity({
        cause: 'resume-index',
        needed: headBytes.length,
        allowed: PREPARATION_CHUNK_BYTES - 16,
      });
    header = await owner.crypt.seal(
      task,
      { v: 1, kind: 'heads', gen: reservation.generation, seq: reservation.first + n },
      headBytes,
    );
    const db = await openForWrite(task, preparationStoreName(owner.name));
    try {
      await task.wait(() =>
        contentTransaction<void>(
          db,
          task,
          ['head', 'chunks'],
          'readwrite',
          (tx, _result, guard) => {
            const current = tx.objectStore('head').get('current');
            current.onsuccess = () =>
              guard(() => {
                if (!same(current.result, p.raw.head))
                  throw Error('Preparation checkpoint changed');
                const store = tx.objectStore('chunks');
                if (!p.head) {
                  store.clear();
                  tx.objectStore('head').clear();
                }
                for (const r of chunks) store.add(r, r.seq);
                tx.objectStore('head').put(header!, 'current');
              });
          },
          'strict',
        ),
      );
    } finally {
      db.close();
    }
    const observed = await owner.capture(task),
      readback = await loadPreparationCheckpoint(task, owner, observed);
    try {
      const actual = held.get(readback.checkpoint)!;
      const expected = [
        ...(p.head ? p.raw.chunks : []),
        ...chunks.map((r) => ({ key: r.seq, value: r })),
      ];
      if (
        readback.status !== 'ready' ||
        !same(actual.raw.head, header) ||
        !same(
          actual.raw.chunks,
          expected.sort((a, b) => Number(a.key) - Number(b.key)),
        )
      )
        throw Error('Preparation checkpoint readback failed');
      task.step(() => {});
      return Object.freeze({
        kind: 'preparation-saved' as const,
        newEntries,
      });
    } finally {
      disposePreparationCheckpoint(readback.checkpoint);
    }
  } finally {
    eraseVerified(fresh?.inventory);
    eraseVerified(delta);
    eraseVerified(chunks);
    eraseVerified(header);
    headBytes?.fill(0);
  }
}
