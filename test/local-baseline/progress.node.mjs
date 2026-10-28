import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { resolve } from 'node:path';
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
  waitPredicate,
  configure,
} from '../account-sync/fixtures.mjs';

let hits = 0;
const result = await build({
  configFile: false,
  logLevel: 'error',
  define: accountRetentionFlags({ VITE_ACCOUNT_RETENTION_AUTO: '1' }),
  plugins: [
    {
      name: 'growth-threshold-only',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('/src/crdt/automaticLocalRetention.ts')) return;
        const anchor = 'LOCAL_RETENTION_MIN_RECORDS = 1024;';
        assert.equal(code.split(anchor).length, 2);
        hits++;
        return code.replace(anchor, 'LOCAL_RETENTION_MIN_RECORDS = 1;');
      },
    },
  ],
  build: {
    write: false,
    minify: false,
    lib: { entry: resolve('test/account-sync/browser.ts'), name: 'Harness', formats: ['iife'] },
  },
});
assert.equal(hits, 1);
const script = (Array.isArray(result) ? result[0] : result).output.find(
  (x) => x.type === 'chunk',
).code;
test(
  'real automatic reduction reports numeric stages, contains observers, keeps undo and cold reopens',
  { timeout: 90000 },
  async (t) => {
    const f = await native(t),
      previous = f.setup;
    f.setup = async (page) => {
      await previous(page);
      await page.evaluate(script);
      await configure(page, f.testOperatorToken);
    };
    await f.setup(f.page);
    const item = await selected(f, 'disposable-local-progress');
    await syncing(f.page, item);
    await settled(f.page);
    const original = await f.page.evaluate(() => editor.read().master);
    await f.page.evaluate(() => {
      globalThis.retentionStages = [];
      const runtime = opened.devices.localHistory;
      runtime.onStatus(() => {
        const p = runtime.status.progress;
        if (p && retentionStages.length < 64) retentionStages.push({ ...p });
      });
      runtime.onStatus(() => {
        if (runtime.status.progress) throw Error('presentation observer');
      });
    });
    await edit(f.page, 0, 0, 'PROGRESS ');
    await f.page.evaluate(() => editor.whenDurable());
    await settled(f.page);
    await online(f.page, false);
    await waitPredicate(
      f.page,
      () => opened.devices.localHistory.diagnostics.completions === 1,
      30000,
    );
    const trace = await f.page.evaluate(() => ({
      events: retentionStages,
      diagnostics: opened.devices.localHistory.diagnostics,
    }));
    for (const stage of [
      'durability',
      'reading',
      'opening',
      'verifying',
      'building',
      'coverage',
      'current',
      'installing',
      'readback',
      'complete',
    ])
      assert.ok(
        trace.events.some((p) => p.stage === stage),
        stage,
      );
    assert.ok(
      trace.events.some((p) => p.stage === 'opening' && p.completed === p.total && p.total > 0),
    );
    assert.equal(trace.diagnostics.attempts, 1);
    assert.equal(trace.diagnostics.interruptions, 0);
    assert.equal(await f.page.evaluate(() => editor.read().master), 'PROGRESS ' + original);
    await f.page.evaluate(() => editor.command({ kind: 'undo' }).accepted);
    assert.equal(await f.page.evaluate(() => editor.read().master), original);
    await f.page.evaluate(() => editor.command({ kind: 'redo' }).accepted);
    await f.page.evaluate(() => editor.whenDurable());
    await close(f.page);
    await cold(f);
    await online(f.page, false);
    await syncing(f.page, item);
    assert.equal(await f.page.evaluate(() => editor.read().master), 'PROGRESS ' + original);
    assert.equal(await f.page.evaluate(() => opened.devices.localHistory.diagnostics.attempts), 0);
    assert.equal(
      await f.page.evaluate(() => opened.devices.localHistory.status.progress),
      undefined,
    );
    t.diagnostic(JSON.stringify(trace));
    await close(f.page);
  },
);
