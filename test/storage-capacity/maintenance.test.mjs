import test from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { packagedFixture, report } from '../account-residue/packaged-fixture.mjs';
test(
  'ordinary packaged Local automatically compacts durable content and cold-reopens exact writing',
  { timeout: 120000 },
  async (t) => {
    const f = await packagedFixture(t, 'maintenance'),
      page = await f.context.newPage();
    await page.goto(f.origin);
    await page.getByRole('button', { name: 'Create a local-only workspace' }).click();
    const code = await page.getByLabel('Generated device-lock code').textContent();
    await page.getByRole('button', { name: 'I saved my code' }).click();
    await page.getByLabel('Device-lock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Confirm and create' }).click();
    const editor = page.locator('.goals .cm-content');
    await editor.click();
    const expected = Array.from({ length: 140 }, (_, i) => String.fromCharCode(65 + (i % 26))).join(
      '',
    );
    const started = performance.now();
    for (const char of expected) await page.keyboard.insertText(char);
    await expect(editor).toHaveText(expected);
    let final;
    await expect
      .poll(
        async () => {
          final = await page.evaluate(async () => {
            for (const { name } of await indexedDB.databases()) {
              const db = await new Promise((r, j) => {
                const q = indexedDB.open(name);
                q.onsuccess = () => r(q.result);
                q.onerror = () => j(q.error);
              });
              try {
                if (!db.objectStoreNames.contains('content')) continue;
                return await new Promise((r, j) => {
                  const q = db.transaction('content').objectStore('content').getAll();
                  q.onsuccess = () =>
                    r(q.result.map((v) => ({ kind: v.kind, seq: v.seq, bytes: v.ct.length })));
                  q.onerror = () => j(q.error);
                });
              } finally {
                db.close();
              }
            }
          });
          return final?.length === 1 && final[0].kind === 'state' && final[0].seq > 128;
        },
        { timeout: 15000 },
      )
      .toBe(true);
    await page.getByRole('button', { name: 'Lock workspace' }).click();
    await page.reload();
    await page.getByLabel('Device-lock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(editor).toHaveText(expected);
    assert.equal(final.length, 1);
    report('maintenance-outcome', {
      status: 'passed',
      edits: 140,
      final,
      elapsedMs: performance.now() - started,
      description: 'one-host directed wall time, not a population latency estimate',
    });
  },
);
