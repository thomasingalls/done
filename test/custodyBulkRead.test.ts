// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import fc from 'fast-check';
import { readScopedRows, readScopedRowsBulk } from '../src/crdt/startupStorage';
import { slotCustodyRows } from '../src/crdt/localGenesisRecord';
import { createAuthorityAuthentication } from '../src/crdt/accountAuthority';
import type { SessionTask } from '../src/crdt/writeSession';

const task: SessionTask = {
  signal: new AbortController().signal,
  step: (f) => f(),
  wait: async (f) => f(),
};
beforeEach(() => {
  vi.stubEnv('VITE_ACCOUNT_BULK_CUSTODY', '1');
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
type Row = { key: IDBValidKey; value: unknown };
let id = 0;
async function database(rows: Row[], name = 'bulk-' + ++id) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('entries');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  await write(db, (s) => {
    for (const r of rows) s.put(r.value, r.key);
  });
  return db;
}
function write(db: IDBDatabase, f: (store: IDBObjectStore) => void) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('entries', 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    f(tx.objectStore('entries'));
  });
}
const read = (db: IDBDatabase, prefix: string[]) => readScopedRowsBulk(task, db, 'entries', prefix);
it('matches the cursor across exact keys, nested array suffixes and neighboring slot strings', async () => {
  const keys: IDBValidKey[] = [
    'owner',
    1,
    new Date(1),
    new Uint8Array([1]),
    [],
    ['owne'],
    ['owner'],
    ['owner', -Infinity],
    ['owner', new Date(2)],
    ['owner', ''],
    ['owner', '\uffff'],
    ['owner', new Uint8Array([255])],
    ['owner', []],
    ['owner', [[]]],
    ['owner', ['\uffff']],
    ['owner\0'],
    ['owner\0', []],
    ['owner\0suffix'],
    ['owner-sibling'],
    ['ownerz'],
  ];
  const rows = keys.map((key, i) => ({ key, value: { i, bytes: new Uint8Array([i]) } }));
  const db = await database(rows);
  try {
    const actual = await read(db, ['owner']);
    expect(actual).toStrictEqual(await readScopedRows(task, db, 'entries', ['owner']));
    expect(actual).toHaveLength(9);
    for (const r of actual) expect((r.key as IDBValidKey[])[0]).toBe('owner');
    expect(await read(db, [])).toStrictEqual(await readScopedRows(task, db, 'entries', []));
  } finally {
    db.close();
  }
});
it.each(['', '\0', '\uffff', '\ud800', 'x\0', 'x\uffff'])(
  'handles boundary string prefixes %j without truncating array suffixes',
  async (last) => {
    const prefix = ['outer', last],
      neighbor = ['outer', last + '\0'];
    const db = await database([
      { key: prefix, value: 1 },
      { key: [...prefix, [[[]]]], value: 2 },
      { key: neighbor, value: 3 },
      { key: ['outer'], value: 4 },
    ]);
    try {
      expect(await read(db, prefix)).toStrictEqual(
        await readScopedRows(task, db, 'entries', prefix),
      );
      expect(await read(db, prefix)).toHaveLength(2);
    } finally {
      db.close();
    }
  },
);
it.each([0, 32, 33, 40])(
  'retains the 32-row refusal with %s scoped rows, independent of other slots',
  async (count) => {
    const db = await database([
      ...Array.from({ length: count }, (_, i) => ({ key: ['owner', i], value: i })),
      ...Array.from({ length: 40 }, (_, i) => ({ key: ['owner\0', i], value: i })),
    ]);
    try {
      if (count > 32) {
        await expect(read(db, ['owner'])).rejects.toThrow('too-many-scoped-control-records');
        await expect(readScopedRows(task, db, 'entries', ['owner'])).rejects.toThrow(
          'too-many-scoped-control-records',
        );
      } else expect(await read(db, ['owner'])).toHaveLength(count);
    } finally {
      db.close();
    }
  },
);
it.each([undefined, '1'])(
  'reader flag %j returns detached rows and detects changed, missing and extra inventory on the next check',
  async (mode) => {
    vi.stubEnv('VITE_ACCOUNT_BULK_CUSTODY', mode);
    const rows = [
      { key: ['owner', 'custody'], value: { mac: new Uint8Array(32), ct: new Uint8Array([1, 2]) } },
    ];
    const db = await database(rows, 'done.custody');
    let checks = 0;
    const memo = createAuthorityAuthentication({
      read: (t) => slotCustodyRows(t, 'owner'),
      authenticate: async (_t, observed) => {
        checks++;
        expect(observed).toStrictEqual(rows);
      },
    });
    try {
      await memo.check(task);
      const projection = await read(db, ['owner']);
      (projection[0]!.value as (typeof rows)[0]['value']).ct.fill(0);
      (projection[0]!.key as string[])[0] = 'elsewhere';
      await memo.check(task);
      expect(checks).toBe(1);
      await write(db, (s) =>
        s.put({ ...rows[0]!.value, ct: new Uint8Array([9, 2]) }, rows[0]!.key),
      );
      await expect(memo.check(task)).rejects.toThrow();
      await write(db, (s) => s.delete(rows[0]!.key));
      await expect(memo.check(task)).rejects.toThrow();
      await write(db, (s) => {
        s.put(rows[0]!.value, rows[0]!.key);
        s.put({}, ['owner', [[]]]);
      });
      await expect(memo.check(task)).rejects.toThrow();
      expect(checks).toBe(4);
    } finally {
      memo.dispose();
      db.close();
    }
  },
);
it('captures the string prefix before awaiting task scheduling', async () => {
  const db = await database([
    { key: ['owner'], value: 1 },
    { key: ['other'], value: 2 },
  ]);
  const prefix = ['owner'];
  try {
    const pending = readScopedRowsBulk(
      {
        ...task,
        wait: async (f) => {
          await Promise.resolve();
          return f();
        },
      },
      db,
      'entries',
      prefix,
    );
    prefix[0] = 'other';
    expect(await pending).toStrictEqual([{ key: ['owner'], value: 1 }]);
  } finally {
    db.close();
  }
});
it('generated UTF-16 prefixes and mixed IDB suffixes return exactly the cursor inventory', async () => {
  const string = fc
    .array(fc.integer({ min: 0, max: 65535 }), { maxLength: 5 })
    .map((xs) => String.fromCharCode(...xs));
  const atom = fc.oneof(
    string,
    fc.integer(),
    fc.integer().map((n) => new Date(n)),
    fc.uint8Array({ minLength: 1, maxLength: 4 }),
  );
  const suffix = fc.oneof(
    atom,
    fc.array(atom, { maxLength: 3 }),
    fc.array(fc.array(atom, { maxLength: 2 }), { maxLength: 2 }),
  );
  await fc.assert(
    fc.asyncProperty(
      fc.array(string, { minLength: 1, maxLength: 3 }),
      fc.array(suffix, { maxLength: 28 }),
      async (prefix, suffixes) => {
        const upper = [...prefix];
        upper[upper.length - 1] += '\0';
        const db = await database([
          { key: prefix, value: 'exact' },
          ...suffixes.map((s, i) => ({
            key: [...prefix, s] as IDBValidKey,
            value: { i, b: new Uint8Array([i]) },
          })),
          { key: [...upper, [[]]], value: 'neighbor' },
          { key: prefix.at(-1)!, value: 'non-array' },
        ]);
        try {
          expect(await read(db, prefix)).toStrictEqual(
            await readScopedRows(task, db, 'entries', prefix),
          );
        } finally {
          db.close();
        }
      },
    ),
    { seed: 101228, numRuns: 100 },
  );
});
