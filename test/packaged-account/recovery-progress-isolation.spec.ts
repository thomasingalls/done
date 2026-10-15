import { writeFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { openApp } from '../geometry/openApp';
import { authenticator } from '../device-enrollment/helpers';
import { startService, stopService } from './server';

async function protectAndRegister(page: Page) {
  await page.getByRole('button', { name: 'Set up sync', exact: true }).click();
  await page.getByRole('button', { name: 'Sync this list', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const code = (await page.getByLabel('Generated unlock code').textContent())!;
  await page.getByRole('button', { name: 'I saved my unlock code' }).click();
  await page.getByLabel('Unlock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Confirm and protect', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to sync setup', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to passkey setup', exact: true }).click();
  await page.getByRole('button', { name: 'Create passkey', exact: true }).click();
  await page.getByRole('button', { name: 'Use my passkey', exact: true }).click();
  return code;
}

test('an orphaned legacy recovery draft cannot block another protected Local setup or mislabel its accepted factor', async ({
  page,
  context,
}, info) => {
  const service = await startService(
    info.outputPath('service'),
    process.env['PASSKEY_TEST_BUILD'],
    true,
    true,
  );
  try {
    await openApp(page);
    await authenticator(page);
    await protectAndRegister(page);
    await expect(
      page.getByRole('heading', { name: 'Save your recovery code', exact: true }),
    ).toBeVisible();
    // A real owner generated this sealed draft. Retain it only in test memory to model a
    // historical removal that left the old unscoped `pending` row behind.
    const legacy = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('done.account-recovery-preparation.v1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<unknown>((resolve, reject) => {
          const tx = db.transaction('progress');
          const read = tx.objectStore('progress').getAll();
          tx.oncomplete = () => resolve(read.result.find((row) => row?.v === 1 && row?.draft));
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    });
    expect(legacy).toBeTruthy();
    await page.goto('/remove/local');
    await page.getByRole('button', { name: 'Continue to confirmation' }).click();
    await page.getByLabel('Type REMOVE to confirm').fill('REMOVE');
    await page.getByRole('button', { name: 'Remove local data', exact: true }).click();
    await page.getByRole('button', { name: 'Start fresh', exact: true }).click();
    await expect(page.locator('.shell')).toBeVisible();
    await page.evaluate(async (legacy) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('done.account-recovery-preparation.v1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('progress', 'readwrite');
          tx.objectStore('progress').put(legacy, 'pending');
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    }, legacy);
    const writing = 'Keep the new Local writing independently of stale recovery';
    const input = page.locator('.day-panel[data-active=true] [placeholder="What got done?"]');
    await input.fill(writing);
    await input.press('Enter');
    const code = await protectAndRegister(page);
    try {
      await expect(
        page.getByRole('heading', { name: 'Save your recovery code', exact: true }),
      ).toBeVisible();
    } catch (failure) {
      const error = await page.getByRole('alert').textContent();
      const other = await context.newPage();
      await other.goto('/local');
      await other.getByLabel('Unlock code', { exact: true }).fill(code);
      await other.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(other.locator('.shell')).toContainText(writing);
      await other.close();
      await page.reload();
      await page.getByLabel('Unlock code', { exact: true }).fill(code);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      const resumedError = await page.getByRole('alert').textContent();
      const observation = info.outputPath('retained-state-failure.json');
      await writeFile(
        observation,
        JSON.stringify(
          {
            error,
            resumedError,
            independentLocalFactorAccepted: true,
            path: new URL(page.url()).pathname,
          },
          null,
          2,
        ),
      );
      await info.attach('retained-state-failure', {
        path: observation,
        contentType: 'application/json',
      });
      throw failure;
    }
    await page.reload();
    await page.getByLabel('Unlock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Check your saved copy', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Back to local workspace', exact: true }).click();
    await page.getByLabel('Unlock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page.locator('.shell')).toContainText(writing);
    const retainedLegacy = await page.evaluate(async () => {
      const request = indexedDB.open('done.account-recovery-preparation.v1');
      const db = await new Promise<IDBDatabase>((resolve) => {
        request.onsuccess = () => resolve(request.result);
      });
      const read = db.transaction('progress').objectStore('progress').getAll();
      const value = await new Promise<unknown[]>((resolve) => {
        read.onsuccess = () => resolve(read.result);
      });
      db.close();
      return value;
    });
    expect(
      retainedLegacy.filter((row) => JSON.stringify(row) === JSON.stringify(legacy)),
    ).toHaveLength(1);
  } finally {
    await stopService(service);
  }
});
