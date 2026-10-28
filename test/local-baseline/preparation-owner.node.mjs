import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { resolve } from 'node:path';
import { retentionPreparationIdentity } from '../../vite/retentionPreparationIdentity.ts';
import { accountRetentionFlags } from '../../vite/accountRetentionFlags.ts';
import {
  native,
  selected,
  syncing,
  settled,
  online,
  edit,
  close,
  cold,
  configure,
} from '../account-sync/fixtures.mjs';
const flags = {
  VITE_ACCOUNT_RETENTION_AUTO: '0',
  VITE_ACCOUNT_BASELINE_INSTALL: '1',
  VITE_ACCOUNT_RETENTION: '1',
  VITE_ACCOUNT_RETENTION_RESUME: '1',
  VITE_ACCOUNT_HISTORY_AUTO: '0',
};
const built = await build({
  configFile: false,
  logLevel: 'error',
  define: {
    ...accountRetentionFlags(flags),
    'import.meta.env.VITE_ACCOUNT_RETENTION_RESUME': JSON.stringify('1'),
    __ACCOUNT_PREPARATION_VERIFIER__: JSON.stringify(
      retentionPreparationIdentity(process.cwd(), { ...flags, $mode: 'production' }).digest,
    ),
  },
  build: {
    write: false,
    minify: false,
    lib: { entry: resolve('test/account-sync/browser.ts'), name: 'Harness', formats: ['iife'] },
  },
});
const script = (Array.isArray(built) ? built[0] : built).output.find(
  (f) => f.type === 'chunk',
).code;
const snapshot = (p) =>
  p
    .evaluate(async () => {
      const d = await new Promise((yes, no) => {
        const r = indexedDB.open(opened.dbName);
        r.onsuccess = () => yes(r.result);
        r.onerror = () => no(r.error);
      });
      try {
        return await new Promise((yes, no) => {
          const tx = d.transaction(['content', 'heads', 'outbound', 'meta']),
            result = {};
          for (const n of ['content', 'heads', 'outbound', 'meta']) {
            const s = tx.objectStore(n),
              keys = s.getAllKeys(),
              values = s.getAll();
            values.onsuccess = () => (result[n] = [keys.result, values.result]);
          }
          tx.oncomplete = () =>
            yes(JSON.stringify(result, (_k, v) => (v instanceof Uint8Array ? [...v] : v)));
          tx.onabort = () => no(tx.error);
        });
      } finally {
        d.close();
      }
    })
    .then(JSON.parse);
test(
  'composed account saves one bounded slice, survives renderer close, admits writing and cold completes with independent readback',
  { timeout: 90000 },
  async (t) => {
    const f = await native(t),
      prior = f.setup;
    f.setup = async (p) => {
      await prior(p);
      await p.evaluate(script);
      await configure(p, f.testOperatorToken);
    };
    await f.setup(f.page);
    const item = await selected(f, 'disposable-preparation-owner');
    await syncing(f.page, item);
    await settled(f.page);
    await online(f.page, false);
    const original = await f.page.evaluate(() => editor.read().master),
      before = await snapshot(f.page);
    const first = await f.page.evaluate(async () => {
      const prior = performance.now.bind(performance);
      let n = 0;
      Object.defineProperty(performance, 'now', { configurable: true, value: () => ++n * 2100 });
      try {
        return await opened.removeLocalHistory(0);
      } finally {
        Object.defineProperty(performance, 'now', { configurable: true, value: prior });
      }
    });
    assert.equal(first.kind, 'preparation-saved');
    assert.equal(first.newEntries, 1);
    const saved = await snapshot(f.page);
    for (const k of ['content', 'heads', 'outbound']) assert.deepEqual(saved[k], before[k]);
    assert.ok(
      saved.meta[1][saved.meta[0].indexOf('counter')].next_seq >
        before.meta[1][before.meta[0].indexOf('counter')].next_seq,
    );
    await close(f.page);
    await cold(f);
    await online(f.page, false);
    await syncing(f.page, item);
    assert.equal(await f.page.evaluate(() => editor.read().master), original);
    await edit(f.page, 0, 0, 'RESUMED ');
    await f.page.evaluate(() => editor.whenDurable());
    const result = await f.page.evaluate(() => opened.removeLocalHistory(0));
    assert.equal(result.kind, 'removed');
    assert.equal(await f.page.evaluate(() => editor.read().master), 'RESUMED ' + original);
    const names = await f.page.evaluate(() => indexedDB.databases());
    assert.equal(
      names.some((d) => d.name === f.dbName + '.preparation-v1'),
      false,
    );
    await f.page.evaluate(() => editor.command({ kind: 'undo' }).accepted);
    assert.equal(await f.page.evaluate(() => editor.read().master), original);
    await close(f.page);
    await cold(f);
    await online(f.page, false);
    await syncing(f.page, item);
    assert.equal(await f.page.evaluate(() => editor.read().master), original);
    t.diagnostic(JSON.stringify({ first, result, coldReopen: true, undo: true }));
    await close(f.page);
  },
);
// Lower only growth/slice thresholds in this disposable build, keeping the real scheduler,
// quiet clock, journal, authority, crypto, allocator and strict exchange/readback operations.
const controls = new Map([
  [
    '/src/crdt/automaticLocalRetention.ts',
    ['LOCAL_RETENTION_MIN_RECORDS = 1024;', 'LOCAL_RETENTION_MIN_RECORDS = 1;'],
  ],
  [
    '/src/crdt/retentionPreparation.ts',
    ['PREPARATION_SLICE_MS = 2000;', 'PREPARATION_SLICE_MS = 1;'],
  ],
]);
controls.set('/src/crdt/accountReceive.ts', [
  'remove: result.removeLocalHistory,',
  `remove: async (...args) => { try { const r = await result.removeLocalHistory(...args); (globalThis.preparationOutcomes ??= []).push(r); return r; } catch (e) { globalThis.preparationFailure = e.stack; throw e; } },`,
]);
const hits = new Set();
const automatic = await build({
  configFile: false,
  logLevel: 'error',
  define: {
    ...accountRetentionFlags({ ...flags, VITE_ACCOUNT_RETENTION_AUTO: '1' }),
    'import.meta.env.VITE_ACCOUNT_RETENTION_RESUME': JSON.stringify('1'),
    __ACCOUNT_PREPARATION_VERIFIER__: JSON.stringify(
      retentionPreparationIdentity(process.cwd(), {
        ...flags,
        VITE_ACCOUNT_RETENTION_AUTO: '1',
        $mode: 'production',
      }).digest,
    ),
  },
  plugins: [
    {
      name: 'disposable-slice-thresholds',
      enforce: 'pre',
      transform(code, id) {
        const key = [...controls.keys()].find((k) => id.endsWith(k));
        if (!key) return;
        const [before, after] = controls.get(key);
        assert.equal(code.split(before).length, 2);
        assert.equal(hits.has(key), false);
        hits.add(key);
        return code.replace(before, after);
      },
    },
  ],
  build: {
    write: false,
    minify: false,
    lib: { entry: resolve('test/account-sync/browser.ts'), name: 'Harness', formats: ['iife'] },
  },
});
assert.equal(hits.size, 3);
const autoScript = (Array.isArray(automatic) ? automatic[0] : automatic).output.find(
  (f) => f.type === 'chunk',
).code;
test(
  'automatic local policy continues durable slices and completes through the real account queue without service automation',
  { timeout: 120000 },
  async (t) => {
    const f = await native(t),
      prior = f.setup;
    f.setup = async (p) => {
      await prior(p);
      await p.evaluate(autoScript);
      await configure(p, f.testOperatorToken);
    };
    await f.setup(f.page);
    const item = await selected(f, 'disposable-automatic-preparation');
    await syncing(f.page, item);
    await settled(f.page);
    await online(f.page, false);
    const original = await f.page.evaluate(() => editor.read().master);
    try {
      await f.page.waitForFunction(
        () =>
          opened.devices.localHistory.diagnostics.completions === 1 ||
          opened.devices.localHistory.status.phase === 'halted',
        undefined,
        { timeout: 60000 },
      );
    } finally {
      t.diagnostic(
        JSON.stringify(
          await f.page.evaluate(() => ({
            status: opened.devices.localHistory.status,
            diagnostics: opened.devices.localHistory.diagnostics,
            outcomes: globalThis.preparationOutcomes,
            failure: globalThis.preparationFailure,
          })),
        ),
      );
    }
    const stats = await f.page.evaluate(() => opened.devices.localHistory.diagnostics);
    assert.ok(stats.attempts > 1);
    assert.equal(stats.completions, 1);
    assert.equal(await f.page.evaluate(() => editor.read().master), original);
    t.diagnostic(JSON.stringify(stats));
    await close(f.page);
    await cold(f);
    await online(f.page, false);
    await syncing(f.page, item);
    assert.equal(await f.page.evaluate(() => editor.read().master), original);
    await close(f.page);
  },
);
