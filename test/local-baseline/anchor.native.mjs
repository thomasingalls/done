import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { build } from 'vite';
import { chromium } from '@playwright/test';
import { openFixtureBrowser } from '../account-promotion/browser-owner.mjs';
const predecessor = '43fe12aa';
const oldRecord = execFileSync('git', ['show', predecessor + ':src/crdt/contentRecord.ts'], {
  encoding: 'utf8',
});
async function bundle(old = false) {
  const r = await build({
    configFile: false,
    logLevel: 'error',
    plugins: old
      ? [
          {
            name: 'frozen-predecessor-reader',
            enforce: 'pre',
            transform(_code, id) {
              if (id.endsWith('/src/crdt/contentRecord.ts')) return oldRecord;
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/local-baseline/anchor-browser.ts'),
        name: 'BaselineCarrier',
        formats: ['iife'],
      },
    },
  });
  return (Array.isArray(r) ? r[0] : r).output.find((f) => f.type === 'chunk').code;
}
const current = await bundle(),
  old = await bundle(true);
async function fixture(t) {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<title>Disposable baseline carrier</title>');
  });
  let browser, context;
  t.after(async () => {
    await context?.close();
    await browser?.close();
    await new Promise((r) => server.close(r));
  });
  await new Promise((r, j) => {
    server.once('error', j);
    server.listen(0, '127.0.0.1', r);
  });
  browser = await openFixtureBrowser(chromium);
  context = await browser.newContext();
  const url = 'http://127.0.0.1:' + server.address().port;
  const fresh = async (script = current) => {
    const p = await context.newPage();
    await p.goto(url);
    await p.evaluate(script);
    return p;
  };
  return { fresh, context };
}
for (const mode of ['complete', 'reserved', 'abort-final', 'lost-reply']) {
  test(
    'native ' +
      mode +
      ' settles atomically, preserves all history and cold-refuses unsupported readers',
    { timeout: 40000 },
    async (t) => {
      const f = await fixture(t),
        p = await f.fresh();
      if (mode === 'reserved' || mode === 'lost-reply') {
        await p.evaluate((mode) => {
          window.pending = BaselineCarrier.run(mode).catch((e) => {
            window.failed = String(e);
          });
        }, mode);
        await p.waitForFunction(
          (expected) => BaselineCarrier.state() === expected || window.failed,
          mode === 'reserved' ? 'reserved' : 'committed',
        );
        assert.equal(await p.evaluate(() => window.failed), undefined);
        // Kill the renderer, so promise callbacks/finally cannot clean up the carrier.
        const cdp = await f.context.newCDPSession(p);
        const crashed = p.waitForEvent('crash', { timeout: 5000 });
        void cdp.send('Page.crash').catch(() => {});
        await crashed;
        await p.close().catch(() => {});
      } else {
        const result = await p.evaluate(async (mode) => {
          try {
            return await BaselineCarrier.run(mode);
          } catch (e) {
            return { error: e.message };
          }
        }, mode);
        if (mode === 'abort-final') assert(result.error);
        else assert(result.hash);
        await p.close();
      }
      const cold = await f.fresh(),
        status = await cold.evaluate(() => BaselineCarrier.inspect());
      assert.equal(status.unchanged, true);
      const installed = mode === 'complete' || mode === 'lost-reply';
      assert.equal(status.v, installed ? 3 : 2);
      assert(status.next > 2);
      if (installed) {
        assert.equal(status.hashMatches, true);
        assert(status.chunks > 1);
      }
      assert.equal(
        await cold.evaluate(() => BaselineCarrier.ordinaryOpen()),
        installed ? 'app-update-required' : 'opened',
      );
      await cold.close();
      const prior = await f.fresh(old);
      assert.equal(
        await prior.evaluate(() => BaselineCarrier.ordinaryOpen()),
        installed ? 'repair-required' : 'opened',
      );
      await prior.close();
      const again = await f.fresh();
      assert.deepEqual(await again.evaluate(() => BaselineCarrier.inspect()), status);
    },
  );
}
