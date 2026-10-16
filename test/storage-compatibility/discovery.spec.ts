import { test } from '../release-validation/browser-fixture';
import { expect, type Page } from '@playwright/test';

const fixture = '/test/storage-compatibility/';
async function call(page: Page, method: string, ...args: unknown[]) {
  await page.waitForFunction(
    (method) => typeof (window as any).compat?.[method] === 'function',
    method,
    { timeout: 10000 },
  );
  return page.evaluate(({ method, args }) => (window as any).compat[method](...args), {
    method,
    args,
  });
}
for (const entry of [
  '/',
  '/index.html',
  '/local.html',
  '/local/ready',
  '/private/account-setup.html',
])
  for (const hosted of [false, true])
    test(`Local entry ${entry} preserves a refused encrypted future schema before ${hosted ? 'hosted' : 'Local-only'} discovery`, async ({
      page,
      baseURL,
    }) => {
      const origin = new URL(baseURL!);
      origin.hostname = 'localhost';
      const go = (path: string) => page.goto(new URL(path, origin).href);
      await go(fixture);
      const { code, scope } = await call(page, 'seed');
      await call(page, 'futureSchema', code, scope);
      const before = await call(page, 'census');
      let discoveries = 0;
      await page.route('**/__account-setup/config', (route) => {
        discoveries++;
        return route.fulfill({
          status: hosted ? 200 : 404,
          contentType: 'application/json',
          body: JSON.stringify(
            hosted
              ? {
                  v: 2,
                  networkSessions: true,
                  membershipContinuation: true,
                  pin: {
                    v: 1,
                    serviceId: '11'.repeat(16),
                    origin: new URL(page.url()).origin,
                    rpId: 'localhost',
                    authRoot: '22'.repeat(32),
                  },
                }
              : {},
          ),
        });
      });
      if (entry === '/private/account-setup.html')
        // Packaged serving maps this legacy alias to index.html. Plain Vite's
        // dedicated development HTML instead requires an injected server config.
        await page.route('**/private/account-setup.html', async (route) => {
          const response = await route.fetch({ url: new URL('/', origin).href });
          await route.fulfill({ response });
        });
      await go(entry);
      await expect(page.getByLabel('Unlock code', { exact: true })).toBeVisible();
      await expect(page.locator('.shell')).toHaveCount(0);
      await page.getByLabel('Unlock code', { exact: true }).fill('wrong code');
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(page.locator('.local-startup')).toHaveAttribute('data-state', 'unlock-failed');
      await page.getByLabel('Unlock code', { exact: true }).fill(code);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(page.locator('.local-startup')).toHaveAttribute(
        'data-state',
        'app-update-required',
      );
      await expect(page.locator('.shell')).toHaveCount(0);
      await go(fixture);
      expect(await call(page, 'census')).toEqual(before);
      expect(discoveries).toBe(0);
    });

test('unreadable saved-entry metadata refuses Local bootstrap before discovery or creation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args: Parameters<IDBFactory['open']>) => {
      if (args[0] === 'done.first-device-setup.v1')
        throw Error('Focused entry metadata read failure');
      return open(...args);
    };
  });
  let discoveries = 0;
  await page.route('**/__account-setup/config', (route) => {
    discoveries++;
    return route.fulfill({ status: 404, body: '{}' });
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toHaveText(
    'Saved setup could not be read. Your browser data has been kept.',
  );
  await expect(page.locator('.shell')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create a new account' })).toHaveCount(0);
  expect(discoveries).toBe(0);
  expect(
    await page.evaluate(async () => ({
      databases: await indexedDB.databases(),
      local: { ...localStorage },
    })),
  ).toEqual({ databases: [], local: {} });
});
