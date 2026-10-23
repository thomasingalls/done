import { test, expect, type Page } from '@playwright/test';
import { startService, stopService } from './server';

test.beforeEach(({ page }) => page.setDefaultTimeout(15000));

async function installLegacy(page: Page, kind: string) {
  await page.goto('/accounts');
  await page.evaluate(async (kind) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('done', kind === 'unknown version' ? 2 : 1);
      request.onupgradeneeded = () => {
        if (kind === 'database')
          request.result.createObjectStore('updates').add(new Uint8Array([0, 9, 255]), 'retained');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (kind === 'journal')
      localStorage.setItem('done.pending-update.done.legacy', 'retained journal bytes');
  }, kind);
}
async function legacySnapshot(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('done');
      request.onupgradeneeded = () => request.transaction!.abort();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const stores: { name: string; keys: IDBValidKey[]; values: unknown[] }[] = [];
      for (const name of db.objectStoreNames)
        stores.push(
          await new Promise((resolve, reject) => {
            const tx = db.transaction(name, 'readonly'),
              store = tx.objectStore(name);
            const keys = store.getAllKeys(),
              values = store.getAll();
            tx.oncomplete = () =>
              resolve({
                name,
                keys: keys.result,
                values: values.result.map((v) => (v instanceof Uint8Array ? Array.from(v) : v)),
              });
            tx.onabort = () => reject(tx.error);
          }),
        );
      return {
        version: db.version,
        stores,
        journal: localStorage.getItem('done.pending-update.done.legacy'),
      };
    } finally {
      db.close();
    }
  });
}

test('an empty placeholder opens Local, retains acknowledged writing after reload, and stays untouched', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  try {
    await installLegacy(page, 'empty');
    const before = await legacySnapshot(page);
    await page.goto('/local');
    await expect(page.locator('.shell')).toBeVisible();
    const input = page.locator('.day-panel[data-active=true] [placeholder="What got done?"]');
    await input.fill('Keep writing beside the empty placeholder');
    await input.press('Enter');
    await expect(page.locator('.shell')).toContainText('Keep writing beside the empty placeholder');
    await page.reload();
    await expect(page.locator('.shell')).toContainText('Keep writing beside the empty placeholder');
    expect(await legacySnapshot(page)).toEqual(before);
  } finally {
    await stopService(service);
  }
});

test('an empty placeholder allows a new account to issue its code and preserves protected cold unlock', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  try {
    await installLegacy(page, 'empty');
    const before = await legacySnapshot(page);
    await page.getByRole('button', { name: 'Create a new account', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Create a new account', exact: true }),
    ).toBeVisible();
    await expect(page.locator('input[type=password]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    const code = (await page.getByLabel('Generated unlock code').textContent())!;
    await page.getByRole('button', { name: 'I saved my unlock code' }).click();
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
    expect(await legacySnapshot(page)).toEqual(before);
  } finally {
    await stopService(service);
  }
});

test('an empty placeholder allows connection preparation without claiming a saved attempt', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  try {
    await installLegacy(page, 'empty');
    const before = await legacySnapshot(page);
    await page.goto('/connect/prepare?workspace=' + 'ab'.repeat(16));
    await page.getByRole('button', { name: 'Prepare this device', exact: true }).click();
    await expect(page.getByLabel('Generated unlock code')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await legacySnapshot(page)).toEqual(before);
  } finally {
    await stopService(service);
  }
});

for (const kind of ['database', 'journal', 'unknown version'])
  test(`real legacy ${kind} receives a truthful migration refusal and remains unchanged across all entries`, async ({
    page,
  }, info) => {
    const service = await startService(info.outputPath('service'), undefined, true, true);
    let begins = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/__account-setup/begin') begins++;
    });
    try {
      await installLegacy(page, kind);
      const before = await legacySnapshot(page);
      await page.goto('/connect/prepare?workspace=' + 'ab'.repeat(16));
      await page.getByRole('button', { name: 'Prepare this device', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText(
        'Existing local data needs migration before you can connect this device.',
      );
      await expect(page.getByLabel('Generated unlock code')).toHaveCount(0);
      expect(
        await page.evaluate(() =>
          Object.keys(localStorage).filter((k) => k.startsWith('done.pending-device.')),
        ),
      ).toEqual([]);
      await page.goto('/accounts');
      await page.getByRole('button', { name: 'Create a new account', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Your existing writing needs migration' }),
      ).toBeVisible();
      await expect(page.locator('input[type=password]')).toHaveCount(0);
      await page.goto('/local');
      await expect(
        page.getByRole('heading', { name: 'Your existing writing needs migration' }),
      ).toBeVisible();
      expect(await legacySnapshot(page)).toEqual(before);
      expect(begins).toBe(0);
    } finally {
      await stopService(service);
    }
  });
