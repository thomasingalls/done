import { test, expect, type Page } from '@playwright/test';
import { openApp, protectApp, openMenuSection } from '../geometry/openApp';
import { authenticator, createdAccount } from '../device-enrollment/helpers';
import { startService, stopService } from './server';

async function menu(page: Page) {
  await openMenuSection(page, 'Account');
}
async function add(page: Page, text: string) {
  const input = page.locator('.day-panel[data-active=true] [placeholder="What got done?"]');
  await input.fill(text);
  await input.press('Enter');
  await expect(
    page.locator('.day-panel[data-active=true] .card').filter({ hasText: text }),
  ).toHaveCount(1);
}
async function countCredentials(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('test-creates', '0');
    sessionStorage.setItem('test-gets', '0');
    const create = navigator.credentials.create.bind(navigator.credentials),
      get = navigator.credentials.get.bind(navigator.credentials);
    navigator.credentials.create = (options) => {
      sessionStorage.setItem(
        'test-creates',
        String(Number(sessionStorage.getItem('test-creates')) + 1),
      );
      return create(options);
    };
    navigator.credentials.get = (options) => {
      sessionStorage.setItem('test-gets', String(Number(sessionStorage.getItem('test-gets')) + 1));
      return get(options);
    };
  });
}
for (const mobile of [false, true])
  test(`first visit opens the full app and saves without credentials (${mobile ? 'mobile' : 'desktop'})`, async ({
    page,
  }, info) => {
    const service = await startService(info.outputPath('service'), undefined, true, true);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      if (mobile) await page.setViewportSize({ width: 390, height: 844 });
      await page.route('**/__account-setup/config', (route) => route.abort());
      await countCredentials(page);
      await openApp(page);
      await expect(page.locator('.day-panel[data-active=true]')).toContainText(
        'The three most important things to focus on next.',
      );
      await expect(page.getByLabel('Getting started')).toBeVisible();
      await expect(page.locator('input[type=password]')).toHaveCount(0);
      await add(page, 'First useful thing I did');
      await expect(page.getByLabel('Getting started')).toHaveCount(0);
      await page.reload();
      await expect(page.locator('.shell')).toContainText('First useful thing I did');
      await menu(page);
      await expect(page.locator('.menu')).toContainText('Opens automatically.');
      await expect(page.getByRole('button', { name: 'Lock workspace', exact: true })).toHaveCount(
        0,
      );
      expect(
        await page.evaluate(() => [
          sessionStorage.getItem('test-creates'),
          sessionStorage.getItem('test-gets'),
        ]),
      ).toEqual(['0', '0']);
      await page.screenshot({ path: info.outputPath('first-run.png'), fullPage: true });
      expect(errors).toEqual([]);
    } finally {
      await stopService(service);
    }
  });

test('protection is optional, retains the full list, and remains required on cold visits', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  try {
    await countCredentials(page);
    await openApp(page);
    await add(page, 'Keep this before protection');
    await openMenuSection(page, 'Account');
    await page.getByLabel('Device name', { exact: true }).fill('My laptop');
    await openMenuSection(page, 'Account');
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await openMenuSection(page, 'Account');
    await page.getByRole('button', { name: 'Add an unlock code' }).click();
    await page.getByRole('button', { name: 'Keep opening automatically' }).click();
    await expect(page.locator('.shell')).toContainText('Keep this before protection');
    const code = await protectApp(page);
    await expect(page.locator('.shell')).toContainText('Keep this before protection');
    await expect(page.getByLabel('Device name', { exact: true })).toHaveValue('My laptop');
    await expect(page.getByRole('button', { name: 'Add an unlock code' })).toHaveCount(0);
    await page.goto('/');
    await expect(page.getByLabel('Unlock code', { exact: true })).toBeVisible();
    await expect(page.locator('.shell')).toHaveCount(0);
    await page.getByLabel('Unlock code', { exact: true }).fill('wrong');
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Could not unlock' })).toBeVisible();
    await page.getByLabel('Unlock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page.locator('.shell')).toContainText('Keep this before protection');
    expect(await page.evaluate(() => sessionStorage.getItem('test-gets'))).toBe('0');
  } finally {
    await stopService(service);
  }
});

test('an account can be removed on a cold locked entry without service access or credentials, preserving its separate Local list', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  try {
    await createdAccount(page);
    await add(page, 'Account work');
    const slot = new URL(page.url()).pathname.split('/')[2]!;
    await page.goto('/local/fresh');
    await expect(page.locator('.shell')).toBeVisible();
    await add(page, 'Keep this separate local list');
    let configurations = 0;
    await page.route('**/__account-setup/config', (route) => {
      configurations++;
      return route.abort();
    });
    await countCredentials(page);
    await page.goto('/remove/' + slot);
    await expect(page.getByText('Device owner’s saved list')).toBeVisible();
    await page.getByRole('button', { name: 'Continue to confirmation' }).click();
    await page.getByLabel('Type REMOVE to confirm').fill('REMOVE');
    await page.getByRole('button', { name: 'Remove local data' }).click();
    await expect(page.getByRole('heading', { name: 'Removed from this device' })).toBeVisible();
    expect(configurations).toBe(0);
    expect(await page.evaluate(() => sessionStorage.getItem('test-gets'))).toBe('0');
    await page.goto('/');
    await expect(page.locator('.shell')).toContainText('Keep this separate local list');
    await expect(page.locator('.shell')).not.toContainText('Account work');
  } finally {
    await stopService(service);
  }
});

test('sync adds required protection, preserves writing, and combines the final approval', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await countCredentials(page);
    await openApp(page);
    await add(page, 'My existing local work');
    await authenticator(page);
    await openMenuSection(page, 'Sync');
    await page.getByRole('button', { name: 'Set up sync' }).click();
    await page.getByRole('button', { name: 'Sync this list' }).click();
    await expect(page.getByText('Sync requires local protection.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const code = (await page.getByLabel('Generated unlock code').textContent())!;
    await page.getByRole('button', { name: 'I saved my unlock code' }).click();
    await page.getByLabel('Unlock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Confirm and protect' }).click();
    await page.getByRole('button', { name: 'Continue to sync setup' }).click();
    await page.getByRole('button', { name: 'Continue to passkey setup' }).click();
    await expect(page.getByRole('heading', { name: 'Create your passkey' })).toBeVisible();
    await page.getByRole('button', { name: 'Create passkey', exact: true }).click();
    await page.getByRole('button', { name: 'Use my passkey', exact: true }).click();
    const recovery = (await page.getByLabel('Generated recovery code').textContent())!;
    await page.getByRole('button', { name: 'I saved my recovery code' }).click();
    await page.getByLabel('Recovery code', { exact: true }).fill(recovery);
    await page.getByRole('button', { name: 'Confirm recovery and use passkey' }).click();
    await expect(
      page.getByRole('heading', { name: 'Enable encrypted sync', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Approve with passkey' }).click();
    await expect(
      page.getByRole('heading', { name: 'Open your list and connect sync', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Approve with passkey' }).click();
    await expect(page.locator('.shell')).toContainText('My existing local work');
    expect(
      await page.evaluate(() => [
        sessionStorage.getItem('test-creates'),
        sessionStorage.getItem('test-gets'),
      ]),
    ).toEqual(['1', '4']);
    await expect(page.getByRole('button', { name: 'Connect sync', exact: true })).toHaveCount(0);
    await page.reload();
    await page.getByLabel('Unlock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Confirm code and unlock with passkey' }).click();
    await expect(page.locator('.shell')).toContainText('My existing local work');
    expect(await page.evaluate(() => sessionStorage.getItem('test-gets'))).toBe('1');
    expect(errors).toEqual([]);
  } finally {
    await stopService(service);
  }
});

test('locked local data can be explicitly removed and startup waits for Start fresh', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  try {
    await openApp(page);
    await add(page, 'Only local copy');
    await protectApp(page);
    await openMenuSection(page, 'Account');
    await page.getByRole('button', { name: 'Lock workspace' }).click();
    await expect(page.getByLabel('Unlock code', { exact: true })).toBeVisible();
    await openMenuSection(page, 'Account');
    await page.getByRole('button', { name: 'Remove from this device', exact: true }).click();
    await page.getByRole('button', { name: 'Continue to confirmation' }).click();
    await expect(page.getByRole('button', { name: 'Remove local data' })).toBeDisabled();
    await page.getByLabel('Type REMOVE to confirm').fill('REMOVE');
    await page.getByRole('button', { name: 'Remove local data' }).click();
    await expect(page.getByRole('heading', { name: 'Removed from this device' })).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'This workspace was removed' })).toBeVisible();
    await expect(page.locator('.shell')).toHaveCount(0);
    await page.getByRole('button', { name: 'Start fresh' }).click();
    await expect(page.locator('.shell')).toBeVisible();
    await expect(page.locator('.shell')).not.toContainText('Only local copy');
  } finally {
    await stopService(service);
  }
});

test('protection retires another live tab and copies its acknowledged writing', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  const second = await page.context().newPage();
  try {
    await openApp(page);
    await add(page, 'First tab work');
    await second.goto('/');
    await expect(second.locator('.shell')).toContainText('First tab work');
    await add(second, 'Other tab work');
    const code = await protectApp(page);
    await expect(page.locator('.shell')).toContainText('Other tab work');
    await expect(second.locator('.shell')).toHaveCount(0);
    await second.reload();
    await second.getByLabel('Unlock code', { exact: true }).fill(code);
    await second.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(second.locator('.shell')).toContainText('Other tab work');
  } finally {
    await second.close();
    await stopService(service);
  }
});

test('an interrupted protection transition resumes after reload with the saved code', async ({
  page,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  try {
    await openApp(page);
    await add(page, 'Keep through a refused deletion');
    await page.evaluate(() => {
      const native = indexedDB.deleteDatabase.bind(indexedDB);
      let refused = false;
      indexedDB.deleteDatabase = (name) => {
        if (/^done\.[a-f0-9]{32}$/.test(name) && !refused) {
          refused = true;
          const request = {} as IDBOpenDBRequest;
          queueMicrotask(() => request.onerror?.call(request, new Event('error')));
          return request;
        }
        return native(name);
      };
    });
    await openMenuSection(page, 'Account');
    await page.getByRole('button', { name: 'Add an unlock code' }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const code = (await page.getByLabel('Generated unlock code').textContent())!;
    await page.getByRole('button', { name: 'I saved my unlock code' }).click();
    await page.getByLabel('Unlock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Confirm and protect' }).click();
    await expect(page.getByRole('heading', { name: 'Finish enabling protection' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Finish enabling protection' })).toBeVisible();
    await page.getByLabel('Unlock code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page.locator('.shell')).toContainText('Keep through a refused deletion');
    await expect(page.locator('.menu')).toContainText('Unlock code enabled.');
  } finally {
    await stopService(service);
  }
});
