/** Two directed native checks, not a conformance campaign. No retained browser profile or server. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

test(
  'native login carrier: aborted publication burns its nonce; queued tab observes sign-out',
  { timeout: 30000 },
  async (t) => {
    const require = createRequire(import.meta.url),
      v = createRequire(require.resolve('vite'));
    const { rolldown } = await import(v.resolve('rolldown'));
    const input = '\0native-login';
    const bundle = await rolldown({
      input,
      plugins: [
        {
          name: 'native-login-entry',
          resolveId(id) {
            if (id === input) return id;
          },
          load(id) {
            if (id === input)
              return `import * as vault from ${JSON.stringify(fileURLToPath(new URL('../../src/account/sessionVault.ts', import.meta.url)))}; globalThis.sessionTests = vault;`;
          },
        },
      ],
    });
    let output;
    try {
      output = await bundle.generate({ format: 'iife' });
    } finally {
      await bundle.close();
    }
    const browser = await chromium.launch({
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    });
    t.after(() => browser.close());
    const context = await browser.newContext();
    await context.route('http://localhost:4999/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Disposable session custody check</title>',
      }),
    );
    const [a, b] = await Promise.all([context.newPage(), context.newPage()]);
    for (const page of [a, b]) {
      await page.goto('http://localhost:4999/session-custody-check');
      await page.addScriptTag({ content: output.output[0].code });
      await page.evaluate(() => {
        const signal = new AbortController().signal;
        globalThis.task = { signal, step: (fn) => fn(), wait: async (fn) => fn() };
        globalThis.scope = {
          pin: {
            v: 1,
            serviceId: '12'.repeat(16),
            authRoot: '34'.repeat(32),
            origin: location.origin,
            rpId: location.hostname,
          },
          slotId: 'native-slot',
          rootId: 'root',
          accountId: 'account',
        };
        globalThis.root = new Uint8Array(32).fill(17);
      });
    }
    assert.deepEqual(
      await a.evaluate(async () => {
        let vault = await sessionTests.openSessionVault(task, root, scope);
        await vault.save(task, { writingIndependentLogin: 'previous' });
        const put = IDBObjectStore.prototype.put;
        let aborted = false;
        IDBObjectStore.prototype.put = function (value, ...args) {
          const request = put.call(this, value, ...args);
          if (this.name === 'slots' && value.seal?.sequence === 2) {
            this.transaction.abort();
            aborted = true;
          }
          return request;
        };
        let refused = false;
        try {
          await vault.save(task, { writingIndependentLogin: 'partial' });
        } catch {
          refused = true;
        } finally {
          IDBObjectStore.prototype.put = put;
          vault.close();
        }
        vault = await sessionTests.openSessionVault(task, root, scope);
        const prior = await vault.load(task);
        await vault.save(task, 'next');
        vault.close();
        const db = await new Promise((resolve) => {
          const q = indexedDB.open(sessionTests.SESSION_DB);
          q.onsuccess = () => resolve(q.result);
        });
        const row = await new Promise((resolve) => {
          const q = db.transaction('slots').objectStore('slots').get(scope.slotId);
          q.onsuccess = () => resolve(q.result);
        });
        db.close();
        return { aborted, refused, prior, counter: row.counter, sequence: row.seal.sequence };
      }),
      {
        aborted: true,
        refused: true,
        prior: { writingIndependentLogin: 'previous' },
        counter: 3,
        sequence: 3,
      },
    );

    await a.evaluate(() => {
      globalThis.held = navigator.locks.request(
        'done/slot-writer/' + JSON.stringify(scope.slotId),
        { mode: 'exclusive' },
        async () => {
          globalThis.vault = await sessionTests.openSessionVault(task, root, scope);
          globalThis.acquired = true;
          await new Promise((resolve) => {
            globalThis.release = resolve;
          });
          vault.close();
        },
      );
    });
    await a.waitForFunction(() => globalThis.acquired === true);
    await b.evaluate(() => {
      globalThis.waiting = navigator.locks.request(
        'done/slot-writer/' + JSON.stringify(scope.slotId),
        { mode: 'exclusive' },
        async () => {
          const vault = await sessionTests.openSessionVault(task, root, scope);
          try {
            globalThis.observed = await vault.load(task);
          } finally {
            vault.close();
          }
        },
      );
    });
    assert.equal(await b.evaluate(() => globalThis.observed), undefined);
    await a.evaluate(async () => {
      await vault.save(task, 'signed-out');
      release();
      await held;
    });
    await b.evaluate(() => waiting);
    assert.equal(await b.evaluate(() => globalThis.observed), 'signed-out');
  },
);
