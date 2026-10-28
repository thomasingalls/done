import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { build } from 'vite';
import { chromium } from '@playwright/test';
import { openFixtureBrowser } from '../account-promotion/browser-owner.mjs';
const built = await build({
  configFile: false,
  logLevel: 'error',
  build: {
    write: false,
    minify: false,
    lib: {
      entry: resolve('test/local-baseline/preparation-browser.ts'),
      name: 'PreparationCarrier',
      formats: ['iife'],
    },
  },
});
const script = (Array.isArray(built) ? built[0] : built).output.find(
  (f) => f.type === 'chunk',
).code;
async function fixture(t) {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<title>Disposable preparation carrier</title>');
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
  const fresh = async () => {
    const p = await context.newPage();
    await p.goto(url);
    await p.evaluate(script);
    return p;
  };
  return { fresh };
}
for (const mode of ['complete', 'reserved', 'abort', 'committed'])
  test(
    'native encrypted preparation ' +
      mode +
      ' preserves originals and cold resumes only durable checks',
    { timeout: 45000 },
    async (t) => {
      const f = await fixture(t),
        p = await f.fresh();
      if (mode === 'reserved' || mode === 'committed') {
        await p.evaluate((mode) => {
          window.pending = PreparationCarrier.run(mode).catch((e) => {
            window.failed = String(e);
          });
        }, mode);
        await p.waitForFunction(
          (expected) => PreparationCarrier.state() === expected || window.failed,
          mode,
          { timeout: 15000 },
        );
        assert.equal(await p.evaluate(() => window.failed ?? null), null);
      } else {
        const result = await p.evaluate((mode) => PreparationCarrier.run(mode), mode);
        assert.equal(result.kind, mode === 'abort' ? 'aborted' : 'preparation-saved');
      }
      await p.close();
      const reopened = await f.fresh(),
        result = await reopened.evaluate(() => PreparationCarrier.inspect());
      assert.equal(result.status, 'ready');
      assert.equal(result.originalsUnchanged, true);
      assert.equal(result.ordinaryRows, 2);
      assert.equal(result.entries, mode === 'reserved' || mode === 'abort' ? 1 : 2);
      assert.ok(result.next >= 7);
      t.diagnostic(JSON.stringify({ mode, ...result }));
      await reopened.close();
    },
  );
