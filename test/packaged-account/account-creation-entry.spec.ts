import { test, expect } from '@playwright/test';
import { openApp } from '../geometry/openApp';
import { startService, stopService } from './server';

test.beforeEach(({ page }) => page.setDefaultTimeout(15000));

for (const carrier of ['database', 'journal'] as const)
  test(`creating an account beside legacy ${carrier} data explains the block before requesting any code`, async ({
    page,
  }, info) => {
    const service = await startService(info.outputPath('service'), undefined, true, true);
    let begins = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/__account-setup/begin') begins++;
    });
    try {
      await page.goto('/accounts');
      await page.evaluate(async (carrier) => {
        if (carrier === 'journal')
          localStorage.setItem('done.pending-update.done.legacy', 'keep legacy writing');
        else {
          const db = await new Promise<IDBDatabase>((resolve) => {
            const r = indexedDB.open('done', 1);
            r.onupgradeneeded = () => r.result.createObjectStore('updates');
            r.onsuccess = () => resolve(r.result);
          });
          db.close();
        }
      }, carrier);
      await page.getByRole('button', { name: 'Create a new account', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Your existing writing needs migration' }),
      ).toBeVisible();
      await expect(page.locator('input[type=password]')).toHaveCount(0);
      await expect(page.getByLabel('Generated unlock code')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Start setup again' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Check again', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Your existing writing needs migration' }),
      ).toBeVisible();
      expect(begins).toBe(0);
      const slot = new URL(page.url()).pathname.split('/')[2]!;
      await page.getByRole('button', { name: 'Remove from this device', exact: true }).click();
      await page.getByRole('button', { name: 'Continue to confirmation' }).click();
      await page.getByLabel('Type REMOVE to confirm').fill('REMOVE');
      await page.getByRole('button', { name: 'Remove local data', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Removed from this device' })).toBeVisible();
      expect(
        await page.evaluate(
          async ({ carrier, slot }) => {
            const names = await indexedDB.databases();
            if (carrier === 'database' && !names.some((db) => db.name === 'done')) return false;
            if (
              carrier === 'journal' &&
              localStorage.getItem('done.pending-update.done.legacy') !== 'keep legacy writing'
            )
              return false;
            const db = await new Promise<IDBDatabase>((resolve) => {
              const r = indexedDB.open('done.first-device-setup.v1');
              r.onsuccess = () => resolve(r.result);
            });
            try {
              return await new Promise<boolean>((resolve) => {
                const tx = db.transaction('attempt'),
                  r = tx.objectStore('attempt').get(slot);
                tx.oncomplete = () => resolve(r.result === undefined);
              });
            } finally {
              db.close();
            }
          },
          { carrier, slot },
        ),
      ).toBe(true);
    } finally {
      await stopService(service);
    }
  });

test('new-account creation displays and confirms its own code before later cold unlock requires it', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  try {
    await page.goto('/accounts');
    await page.getByRole('button', { name: 'Create a new account', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Create a new account', exact: true }),
    ).toBeVisible();
    await expect(page.locator('input[type=password]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Save your unlock code' })).toBeVisible();
    const code = (await page.getByLabel('Generated unlock code').textContent())!;
    await expect(page.locator('input[type=password]')).toHaveCount(0);
    await page.getByRole('button', { name: 'I saved my unlock code' }).click();
    await page.getByLabel('Unlock code', { exact: true }).fill('wrong');
    await page.getByRole('button', { name: 'Confirm unlock code' }).click();
    await expect(page.getByRole('alert')).toContainText('does not match');
    await page.getByLabel('Unlock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Confirm unlock code' }).click();
    await expect(page.getByRole('heading', { name: 'Create your passkey' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Unlock your workspace' })).toBeVisible();
    await expect(page.getByLabel('Generated unlock code')).toHaveCount(0);
    await page.getByLabel('Unlock code', { exact: true }).fill('wrong');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Could not unlock');
    await page.getByLabel('Unlock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Create your passkey' })).toBeVisible();
  } finally {
    await stopService(service);
  }
});

test('a nonexistent account-setup URL offers account selection without an unlock-code form', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  try {
    await page.goto('/setup/account-' + '33'.repeat(16) + '/inspect');
    await expect(page.getByRole('heading', { name: 'Setup needs attention' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Choose an account');
    await expect(page.locator('input[type=password]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Start setup again' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Choose an account', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Create a new account', exact: true }),
    ).toBeVisible();
  } finally {
    await stopService(service);
  }
});

test('direct sync entry returns an automatic Local list to protection without asking for an unissued code', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  try {
    await openApp(page);
    const input = page.locator('.day-panel[data-active=true] [placeholder="What got done?"]');
    await input.fill('Keep this automatic list');
    await input.press('Enter');
    await expect(page.locator('.shell')).toContainText('Keep this automatic list');
    await page.goto('/setup/local/inspect');
    await expect(page.getByRole('heading', { name: 'Add protection before sync' })).toBeVisible();
    await expect(page.locator('input[type=password]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to local workspace', exact: true }).click();
    await expect(page.locator('.shell')).toContainText('Keep this automatic list');
    await expect(
      page.getByRole('button', { name: 'Add an unlock code', exact: true }),
    ).toBeVisible();
  } finally {
    await stopService(service);
  }
});
