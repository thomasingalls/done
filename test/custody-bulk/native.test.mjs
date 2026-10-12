import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { build } from 'vite';
import { chromium } from '@playwright/test';
import { openFixtureBrowser } from '../account-promotion/browser-owner.mjs';
const built = await build({
  configFile: false,
  define: { 'import.meta.env.VITE_ACCOUNT_BULK_CUSTODY': JSON.stringify('1') },
  logLevel: 'error',
  build: {
    write: false,
    minify: false,
    lib: { entry: resolve('test/custody-bulk/browser.ts'), name: 'Harness', formats: ['iife'] },
  },
});
const script = (Array.isArray(built) ? built[0] : built).output.find(
  (f) => f.type === 'chunk',
).code;
async function fixture(t) {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>Disposable bulk inventory</title>');
  });
  let browser, context;
  t.after(async () => {
    try {
      await context?.close();
    } finally {
      try {
        await browser?.close();
      } finally {
        if (server.listening) await new Promise((r) => server.close(r));
      }
    }
  });
  await new Promise((r, j) => {
    server.once('error', j);
    server.listen(0, '127.0.0.1', r);
  });
  browser = await openFixtureBrowser(chromium);
  context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.evaluate(script);
  await page.evaluate(() => {
    window.orders = [];
    window.request = (r) =>
      new Promise((yes, no) => {
        r.onsuccess = () => yes(r.result);
        r.onerror = () => no(r.error);
      });
    window.put = async (rows) => {
      const r = indexedDB.open('done.custody', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('entries');
      const db = await request(r);
      await new Promise((yes, no) => {
        const tx = db.transaction('entries', 'readwrite');
        tx.oncomplete = yes;
        tx.onabort = () => no(tx.error);
        for (const row of rows) tx.objectStore('entries').put(row.value, row.key);
      });
      db.close();
    };
    window.owner = undefined;
    window.acquire = async () => {
      owner = await Harness.openWriteSession('owner', { dispose: () => orders.push('dispose') });
    };
    window.inventory = () => owner.run((t) => Harness.slotCustodyRows(t, 'owner'));
  });
  return page;
}
test('native range includes all suffix key types and excludes neighbors at the 32-row bound', async (t) => {
  const p = await fixture(t);
  const result = await p.evaluate(async () => {
    const keys = [
      ['owner'],
      ['owner', []],
      ['owner', [[]]],
      ['owner', new Uint8Array()],
      ['owner', new Date(0)],
      ['owner', -Infinity],
      ['owner', '\uffff'],
    ];
    while (keys.length < 32) keys.push(['owner', 'row' + keys.length]);
    await put([
      ...keys.map((key, i) => ({ key, value: { i, bytes: new Uint8Array([i]) } })),
      { key: ['owner\0', []], value: 'neighbor' },
      { key: 'owner', value: 'scalar' },
    ]);
    await acquire();
    const actual = await inventory();
    const db = await request(indexedDB.open('done.custody'));
    const expected = await owner.run((task) =>
      Harness.readScopedRows(task, db, 'entries', ['owner']),
    );
    db.close();
    const same = actual.every(
      (r, i) =>
        indexedDB.cmp(r.key, expected[i].key) === 0 &&
        r.value.i === expected[i].value.i &&
        r.value.bytes[0] === expected[i].value.bytes[0],
    );
    await put([{ key: ['owner', [[[]]]], value: 'overflow' }]);
    const refused = await inventory().then(
      () => false,
      (e) => e.message,
    );
    await owner.close();
    return { length: actual.length, same, refused };
  });
  assert.deepEqual(result, { length: 32, same: true, refused: 'too-many-scoped-control-records' });
});
test('native paired reads retain one snapshot when another connection writes between success events', async (t) => {
  const p = await fixture(t);
  const result = await p.evaluate(async () => {
    await put([
      { key: ['owner', 'a'], value: 1 },
      { key: ['owner', 'b'], value: 2 },
    ]);
    await acquire();
    const other = await request(indexedDB.open('done.custody'));
    let changed;
    const original = IDBObjectStore.prototype.getAllKeys;
    IDBObjectStore.prototype.getAllKeys = function (...args) {
      const r = original.apply(this, args);
      r.addEventListener(
        'success',
        () => {
          changed = new Promise((yes, no) => {
            const tx = other.transaction('entries', 'readwrite');
            tx.oncomplete = yes;
            tx.onabort = () => no(tx.error);
            const s = tx.objectStore('entries');
            s.delete(['owner', 'a']);
            s.put(9, ['owner', 'b']);
            s.put(3, ['owner', 'c']);
          });
        },
        { once: true },
      );
      return r;
    };
    let first;
    try {
      first = await inventory();
    } finally {
      IDBObjectStore.prototype.getAllKeys = original;
    }
    await changed;
    other.close();
    const second = await inventory();
    await owner.close();
    return { first, second };
  });
  assert.deepEqual(result, {
    first: [
      { key: ['owner', 'a'], value: 1 },
      { key: ['owner', 'b'], value: 2 },
    ],
    second: [
      { key: ['owner', 'b'], value: 9 },
      { key: ['owner', 'c'], value: 3 },
    ],
  });
});
test('closing during a native bulk read aborts and drains before disposing and releasing the permit', async (t) => {
  const p = await fixture(t);
  const result = await p.evaluate(async () => {
    await put([{ key: ['owner', 'a'], value: 1 }]);
    await acquire();
    const original = IDBObjectStore.prototype.getAllKeys;
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = transaction.apply(this, args);
      // Register before the production onabort handler; promise reactions may run
      // between callbacks for the same native event.
      tx.addEventListener('abort', () => orders.push('abort'), { once: true });
      return tx;
    };
    let closing;
    IDBObjectStore.prototype.getAllKeys = function (...args) {
      const r = original.apply(this, args);
      r.addEventListener(
        'success',
        () => {
          orders.push('close');
          closing = owner.close();
        },
        { once: true },
      );
      return r;
    };
    let refusal;
    try {
      refusal = await inventory().then(
        () => null,
        (e) => e.code,
      );
    } finally {
      IDBObjectStore.prototype.getAllKeys = original;
      IDBDatabase.prototype.transaction = transaction;
    }
    await closing;
    const next = await Harness.openWriteSession('owner');
    orders.push('next-owner');
    await next.close();
    return { refusal, orders };
  });
  assert.equal(result.refusal, 'inactive');
  assert(result.orders.indexOf('abort') >= 0);
  assert(result.orders.indexOf('abort') < result.orders.indexOf('dispose'), JSON.stringify(result));
  assert(result.orders.indexOf('dispose') < result.orders.indexOf('next-owner'));
});
test('version change closes the read connection; later reads refuse the new layout', async (t) => {
  const p = await fixture(t);
  const result = await p.evaluate(async () => {
    await put([{ key: ['owner', 'a'], value: 1 }]);
    await acquire();
    const original = IDBObjectStore.prototype.getAllKeys;
    let upgraded;
    IDBObjectStore.prototype.getAllKeys = function (...args) {
      const r = original.apply(this, args);
      r.addEventListener(
        'success',
        () => {
          upgraded = request(indexedDB.open('done.custody', 2)).then((db) => db.close());
        },
        { once: true },
      );
      return r;
    };
    let first;
    try {
      first = await inventory();
    } finally {
      IDBObjectStore.prototype.getAllKeys = original;
    }
    await upgraded;
    const refused = await inventory().then(
      () => false,
      (e) => e.message,
    );
    await owner.close();
    return { first, refused };
  });
  assert.deepEqual(result, {
    first: [{ key: ['owner', 'a'], value: 1 }],
    refused: 'unsupported-database-layout',
  });
});
test('an absent native custody database stays absent after a read', async (t) => {
  const p = await fixture(t);
  const result = await p.evaluate(async () => {
    await acquire();
    const rows = await inventory();
    await owner.close();
    return { rows, created: (await indexedDB.databases()).some((d) => d.name === 'done.custody') };
  });
  assert.deepEqual(result, { rows: null, created: false });
});
