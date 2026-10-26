import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { resolve } from 'node:path';
import {
  native,
  selected,
  syncing,
  settled,
  online,
  edit,
  close,
  cold,
  waitPredicate,
  configure,
} from '../account-sync/fixtures.mjs';

// Use a tiny growth threshold, not a fake verification/removal operation. Quiet/retry clocks,
// authority, census, journal, cryptography and the actual strict IDB exchange are unchanged.
async function bundle(auto) {
  const hits = { threshold: 0, observation: 0 };
  const result = await build({
    configFile: false,
    logLevel: 'error',
    define: Object.fromEntries(
      [
        ['BASELINE_READ', '1'],
        ['BASELINE_INSTALL', '1'],
        ['RETENTION', '1'],
        ['RETENTION_AUTO', auto ? '1' : '0'],
      ].map(([key, value]) => ['import.meta.env.VITE_ACCOUNT_' + key, JSON.stringify(value)]),
    ),
    plugins: [
      {
        name: 'observe-private-automatic-retention',
        enforce: 'pre',
        transform(code, id) {
          if (id.endsWith('/src/crdt/automaticLocalRetention.ts')) {
            const from = 'LOCAL_RETENTION_MIN_RECORDS = 1024;';
            assert.equal(code.split(from).length, 2);
            hits.threshold++;
            return code.replace(from, 'LOCAL_RETENTION_MIN_RECORDS = 1;');
          }
          if (id.endsWith('/src/crdt/accountReceive.ts')) {
            const from = 'remove: result.removeLocalHistory,';
            assert.equal(code.split(from).length, 2);
            hits.observation++;
            return code.replace(
              from,
              `remove: async (revision) => {
                globalThis.automaticAttempts = (globalThis.automaticAttempts ?? 0) + 1;
                const outcome = await result.removeLocalHistory(revision);
                (globalThis.automaticResults ??= []).push(outcome);
                return outcome;
              },`,
            );
          }
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: { entry: resolve('test/account-sync/browser.ts'), name: 'Harness', formats: ['iife'] },
    },
  });
  assert.deepEqual(hits, { threshold: 1, observation: 1 });
  return (Array.isArray(result) ? result[0] : result).output.find((x) => x.type === 'chunk').code;
}
const enabled = await bundle(true),
  disabled = await bundle(false);
async function setup(t, id, script) {
  const f = await native(t),
    previous = f.setup;
  f.setup = async (page) => {
    await previous(page);
    await page.evaluate(script);
    await configure(page, f.testOperatorToken);
  };
  await f.setup(f.page);
  const item = await selected(f, id);
  await syncing(f.page, item);
  await settled(f.page);
  await online(f.page, false);
  return { f, item };
}
async function inventory(page) {
  return page.evaluate(async () => {
    const db = await new Promise((yes, no) => {
      const r = indexedDB.open(opened.dbName);
      r.onsuccess = () => yes(r.result);
      r.onerror = () => no(r.error);
    });
    try {
      return await new Promise((yes, no) => {
        const tx = db.transaction(['meta', 'content', 'heads', 'outbound']);
        const counter = tx.objectStore('meta').get('counter');
        const counts = ['content', 'heads', 'outbound'].map((s) => tx.objectStore(s).count());
        tx.oncomplete = () =>
          yes({
            version: counter.result.v,
            revision: counter.result.baseline?.revision ?? 0,
            rows: counts.reduce((n, r) => n + r.result, 0),
          });
        tx.onabort = () => no(tx.error);
      });
    } finally {
      db.close();
    }
  });
}
test(
  'private policy schedules the real removal owner, retains writing/undo and cold reopens',
  { timeout: 90000 },
  async (t) => {
    const { f, item } = await setup(t, 'automatic-local-retention', enabled);
    const original = await f.page.evaluate(() => editor.read().master);
    await edit(f.page, 0, 0, 'AUTOMATIC ');
    await f.page.evaluate(() => editor.whenDurable());
    await online(f.page, true);
    await settled(f.page);
    await online(f.page, false);
    const before = await inventory(f.page);
    assert.ok(before.rows > 0);
    assert.equal(before.version, 2);
    await waitPredicate(
      f.page,
      () => globalThis.automaticResults?.some((r) => r.kind === 'removed'),
      30000,
    );
    const after = await inventory(f.page);
    assert.equal(after.version, 5);
    assert.equal(after.revision, 1);
    assert.equal(after.rows, 0);
    assert.equal(await f.page.evaluate(() => editor.read().master), 'AUTOMATIC ' + original);
    await f.page.evaluate(() => editor.command({ kind: 'undo' }).accepted);
    assert.equal(await f.page.evaluate(() => editor.read().master), original);
    await f.page.evaluate(() => editor.command({ kind: 'redo' }).accepted);
    await f.page.evaluate(() => editor.whenDurable());
    await close(f.page);
    await cold(f);
    await online(f.page, false);
    await syncing(f.page, item);
    assert.equal(await f.page.evaluate(() => editor.read().master), 'AUTOMATIC ' + original);
    assert.equal((await inventory(f.page)).version, 5);
    t.diagnostic(JSON.stringify({ before, after }));
    await close(f.page);
  },
);
test(
  'disabled policy never converts; closing the enabled owner cancels its pending timer',
  { timeout: 90000 },
  async (t) => {
    const { f, item } = await setup(t, 'automatic-retention-gates', disabled);
    const before = await inventory(f.page);
    await f.page.waitForTimeout(10500);
    assert.equal(await f.page.evaluate(() => globalThis.automaticAttempts ?? 0), 0);
    assert.deepEqual(await inventory(f.page), before);
    await close(f.page);
    await f.page.evaluate(enabled);
    await configure(f.page, f.testOperatorToken);
    await syncing(f.page, item);
    await close(f.page);
    await f.page.waitForTimeout(10500);
    assert.equal(await f.page.evaluate(() => globalThis.automaticAttempts ?? 0), 0);
    await f.page.evaluate(disabled);
    await configure(f.page, f.testOperatorToken);
    await online(f.page, false);
    await syncing(f.page, item);
    assert.deepEqual(await inventory(f.page), before);
    await close(f.page);
  },
);
