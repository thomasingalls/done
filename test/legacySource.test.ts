// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { inspectLegacySource } from '../src/crdt/legacySource';
import type { SessionTask } from '../src/crdt/writeSession';
import {
  database,
  key,
  modernKey,
  reset,
  seed,
  source,
  transaction,
} from './legacy-source/fixture';

// Unit adapter only. Native tests use the real owner and transaction events.
const task: SessionTask = {
  signal: new AbortController().signal,
  step: (f) => f(),
  wait: async (f) => f(),
};
beforeEach(() => {
  const entries = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    get length() {
      return entries.size;
    },
    key: (i: number) => [...entries.keys()][i] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    clear: () => entries.clear(),
  });
});
afterEach(async () => {
  await reset();
  vi.unstubAllGlobals();
});

describe('read-only predecessor source observation', () => {
  it('does not create the absent database or classify the origin as fresh', async () => {
    const result = await inspectLegacySource(task);
    expect(result.kind).toBe('legacy-source-observation');
    expect(result.databasePresent).toBe(false);
    expect(await indexedDB.databases()).toEqual([]);
  });
  it('distinguishes an empty retained database from absence', async () => {
    const absent = await inspectLegacySource(task);
    (await database()).close();
    const empty = await inspectLegacySource(task);
    expect(empty.databasePresent).toBe(true);
    expect(empty.digest).not.toBe(absent.digest);
  });
  it('preserves the journal-only deletion and its original bytes', async () => {
    await seed([0, 1, 2, 3], [4]);
    const result = await inspectLegacySource(task);
    expect(result.dependencies).toBe('complete');
    expect([...result.journal[0]!.bytes]).toEqual(source().updates[4]);
    expect(localStorage.getItem(key(0))).toBe(result.journal[0]!.value);
    expect(localStorage.getItem(modernKey)).toBe('2:unrelated-encrypted-carrier');
  });
  it.each([3, 4])(
    'flags missing insertion/deletion dependencies without discarding update %i',
    async (id) => {
      await seed([], [id]);
      const result = await inspectLegacySource(task);
      expect(result.dependencies).toBe('missing');
      expect([...result.journal[0]!.bytes]).toEqual(source().updates[id]);
    },
  );
  it.each([
    ['unknown-version', '2:AAAA', 'unsupported-legacy-journal-version'],
    ['invalid-base64', '1:???', 'unreadable-legacy-journal'],
    ['invalid-update', '1:/w==', 'unreadable-legacy-update'],
  ])('refuses %s and preserves the original carrier', async (_name, value, reason) => {
    await seed([], []);
    localStorage.setItem(key(0), value!);
    await expect(inspectLegacySource(task)).rejects.toMatchObject({ reason });
    expect(localStorage.getItem(key(0))).toBe(value);
  });
  it('does not infer that an ambiguous modern-looking namespace is unrelated', async () => {
    await seed([], []);
    localStorage.setItem(modernKey + '.extra', '1:AAA=');
    await expect(inspectLegacySource(task)).rejects.toMatchObject({
      reason: 'unsupported-legacy-journal-key',
    });
  });
  it('refuses unknown custom data instead of silently omitting it from migration input', async () => {
    const db = await database();
    await transaction(db, (tx) => tx.objectStore('custom').put('private-custom', 'unknown'));
    db.close();
    await expect(inspectLegacySource(task)).rejects.toMatchObject({
      reason: 'unsupported-legacy-custom-data',
    });
  });
  it('hashes exact record identity, bytes and ancillary values without authenticating them', async () => {
    await seed([0], []);
    const first = await inspectLegacySource(task);
    localStorage.setItem('done.device', 'different');
    const renamed = await inspectLegacySource(task);
    expect(renamed.digest).not.toBe(first.digest);
    const db = await database();
    await transaction(db, (tx) => {
      tx.objectStore('updates').delete(1);
      tx.objectStore('updates').add(new Uint8Array(source().updates[0]!), 2);
    });
    db.close();
    expect((await inspectLegacySource(task)).digest).not.toBe(renamed.digest);
  });
  it.each(['version', 'extra-store', 'no-auto-increment'])(
    'refuses unsupported %s without upgrading it',
    async (variant) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('done', variant === 'version' ? 2 : 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('updates', {
            autoIncrement: variant !== 'no-auto-increment',
          });
          request.result.createObjectStore('custom');
          if (variant === 'extra-store') request.result.createObjectStore('unexpected');
        };
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
      const before = await indexedDB.databases();
      await expect(inspectLegacySource(task)).rejects.toMatchObject({
        reason: 'unsupported-legacy-layout',
      });
      expect(await indexedDB.databases()).toEqual(before);
    },
  );
  it.each([undefined, 'not-update-bytes'])(
    'refuses a retained malformed record (%s)',
    async (value) => {
      const db = await database();
      await transaction(db, (tx) => tx.objectStore('updates').put(value, 1));
      db.close();
      await expect(inspectLegacySource(task)).rejects.toMatchObject({
        reason: 'unsupported-legacy-record',
      });
    },
  );
  it('refuses an oversized inventory instead of truncating it', async () => {
    for (let i = 0; i <= 4096; i++) localStorage.setItem(key(i), '1:AAA=');
    await expect(inspectLegacySource(task)).rejects.toMatchObject({ reason: 'source-limit' });
    expect(localStorage.length).toBe(4097);
  });
  it('preserves generated partitions, ordering and duplicates without changing source storage', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 4 }), { maxLength: 20 }),
        fc.array(fc.integer({ min: 0, max: 4 }), { maxLength: 20 }),
        async (disk, wal) => {
          await seed(disk, wal);
          const result = await inspectLegacySource(task);
          expect(result.updates.map((r) => [r.key, [...r.bytes]])).toEqual(
            disk.map((id, i) => [1 + i * 2, source().updates[id]]),
          );
          expect(result.journal.map((r) => [r.key, [...r.bytes]])).toEqual(
            wal
              .map((id, i) => [key(i), source().updates[id]])
              .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
          );
          expect((await inspectLegacySource(task)).digest).toBe(result.digest);
        },
      ),
      { numRuns: 100, seed: 8941 },
    );
  });
});
