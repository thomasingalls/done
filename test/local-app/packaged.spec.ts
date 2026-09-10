import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => console.error('packaged page error:', error.message));
  page.on('requestfailed', (request) =>
    console.error('packaged request failed:', request.url(), request.failure()?.errorText),
  );
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('packaged console:', message.text());
  });
});

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const entries = await page.evaluate(async () => {
    const result = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        result.push({ cache: name, url: request.url, vary: response?.headers.get('vary') });
      }
    }
    return result;
  });
  await info.attach('offline-cache-diagnostic', {
    body: JSON.stringify(entries, null, 2),
    contentType: 'application/json',
  });
  console.log('offline cache diagnostic:', JSON.stringify(entries));
});

test('the existing editor still opens from the ordinary shell online and offline', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(page.locator('.cm-editor').first()).toBeVisible();
  await expect(page.locator('.local-startup')).toHaveCount(0);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => {}));
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.cm-editor').first()).toBeVisible();
  await expect(page.locator('.local-startup')).toHaveCount(0);
});

test('packaged Local entry cold-opens offline without falling back to the legacy shell', async ({
  page,
  context,
}) => {
  await page.goto('/local.html');
  await expect(page.locator('.local-startup')).toHaveAttribute('data-state', 'fresh');
  await page.getByRole('button', { name: 'Create Local workspace' }).click();
  const code = (await page.getByLabel('Generated device-lock code').textContent())!;
  await page.getByRole('button', { name: 'I saved my code' }).click();
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Confirm and create' }).click();
  await expect(page.locator('.local-startup')).toHaveAttribute('data-state', 'ready');
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(page.locator('.local-startup')).toHaveAttribute('data-state', 'unlock-required');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => {}));
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.local-startup')).toHaveAttribute('data-state', 'unlock-required');
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.locator('.local-startup')).toHaveAttribute('data-state', 'ready');
  expect(
    await page.evaluate(async () => (await indexedDB.databases()).some((db) => db.name === 'done')),
  ).toBe(false);
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.local-startup')).toHaveAttribute('data-state', 'unlock-required');
  await page.screenshot({ path: 'test-results/local-app/locked-mobile.png' });
});
