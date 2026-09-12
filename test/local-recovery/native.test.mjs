import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { expect } from '@playwright/test';
import { packagedFixture, report, extendedLimits } from '../account-residue/packaged-fixture.mjs';
import { collectBrowser } from '../account-residue/browser-collector.mjs';

test(
  'packaged refused Local offers authenticated partial ZIP and leaves all original carriers intact',
  { timeout: 120000 },
  async (t) => {
    const f = await packagedFixture(t, 'recovery'),
      page = await f.context.newPage();
    const writing = 'recovery_雪_' + randomBytes(24).toString('hex');
    await page.goto(f.origin);
    await page.getByRole('button', { name: 'Create Local workspace' }).click();
    const code = await page.getByLabel('Generated device-lock code').textContent();
    await page.getByRole('button', { name: 'I saved my code' }).click();
    await page.getByLabel('Device-lock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Confirm and create' }).click();
    const editor = page.locator('.goals .cm-content');
    await editor.click();
    await page.keyboard.insertText(writing);
    await expect(editor).toContainText(writing);
    await page.getByRole('button', { name: 'Lock workspace' }).click();
    await expect(page.locator('.local-startup')).toHaveAttribute('data-state', 'unlock-required');
    // Fault only this disposable profile: preserve authentic writing, append an unauthentic record.
    await page.evaluate(async () => {
      for (const { name } of await indexedDB.databases()) {
        const db = await new Promise((resolve, reject) => {
          const r = indexedDB.open(name);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        try {
          if (!db.objectStoreNames.contains('content')) continue;
          await new Promise((resolve, reject) => {
            const tx = db.transaction('content', 'readwrite'),
              store = tx.objectStore('content');
            tx.oncomplete = resolve;
            tx.onabort = () => reject(tx.error);
            const r = store.openCursor(null, 'prev');
            r.onsuccess = () => {
              const row = r.result.value,
                key = r.result.key + 1;
              row.seq = key;
              row.ct[0] ^= 1;
              store.put(row, key);
            };
          });
        } finally {
          db.close();
        }
      }
    });
    const inventory = async () =>
      (await page.evaluate(collectBrowser, { limits: extendedLimits })).filter((r) =>
        ['indexedDB', 'localStorage'].includes(r.surface),
      );
    const before = await inventory();
    await page.getByLabel('Device-lock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page.locator('.local-startup')).toHaveAttribute(
      'data-state',
      /repair-required|unlock-failed/,
    );
    await expect(editor).toHaveCount(0);
    await page.getByText('Recover readable writing', { exact: true }).click();
    const blocker = await f.blank();
    await blocker.evaluate(async () => {
      let entered;
      const ready = new Promise((r) => {
        entered = r;
      });
      globalThis.held = navigator.locks.request(
        'done/slot-writer/"local"',
        { mode: 'exclusive' },
        async () => {
          entered();
          await new Promise((r) => {
            globalThis.release = r;
          });
        },
      );
      await ready;
    });
    let downloads = 0;
    page.on('download', () => downloads++);
    await page.getByLabel('Recovery device-lock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Save partial recovery' }).click();
    await expect(page.getByRole('button', { name: 'Cancel recovery' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel recovery' }).click();
    await blocker.evaluate(async () => {
      globalThis.release();
      await globalThis.held;
    });
    await blocker.close();
    await expect(page.locator('.local-recovery [role=status]')).toContainText('Recovery cancelled');
    assert.equal(downloads, 0);
    assert.deepEqual(await inventory(), before);
    await page.getByLabel('Recovery device-lock code', { exact: true }).fill(code);
    const path = await f.download(page, 'Save partial recovery', 'partial.zip');
    await expect(page.locator('.local-recovery [role=status]')).toContainText(
      'Completeness is not verified',
    );
    // ZIP interpretation is independent of the product encoder.
    const recovered = JSON.parse(
      execFileSync(
        'python3',
        [
          '-c',
          'import json,zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({n:z.read(n).decode("utf8") for n in z.namelist()}))',
          path,
        ],
        { encoding: 'utf8' },
      ),
    );
    assert.equal(recovered['recovered/master.md'], writing);
    const result = JSON.parse(recovered['recovery-report.json']);
    assert.equal(result.complete, false);
    assert.equal(result.unreadableRecords, 1);
    assert(!JSON.stringify(recovered).includes(code));
    assert.deepEqual(await inventory(), before);
    await f.scan(
      page,
      [
        { id: 'writing', values: [writing] },
        { id: 'factor', values: [code, code.replaceAll('-', '')] },
      ],
      'after-partial-export',
    );
    assert.equal(downloads, 1);
    report('recovery-outcome', {
      status: 'passed',
      report: result,
      carriersUnchanged: true,
      independentZip: true,
    });
  },
);
