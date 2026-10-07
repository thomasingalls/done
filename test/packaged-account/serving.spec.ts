import { test, expect } from '@playwright/test';
import { account } from '../device-enrollment/helpers';
import { startService, stopService, origin } from './server';
test('compiled account setup renews access after a service restart without refreshing the page', async ({
  page,
  request,
}, info) => {
  const state = info.outputPath('service');
  let service = await startService(state);
  try {
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: 'I already have a workspace', exact: true }),
    ).toBeVisible();
    const first = await account(page);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await stopService(service);
    service = await startService(state);
    const renewed = page.waitForResponse(
      (r) => r.url().endsWith('/__account-setup/access') && r.status() === 200,
    );
    const resumed = page.waitForResponse(
      (r) => r.url().endsWith('/__account-setup/ceremony/bootstrap') && r.status() === 200,
    );
    await page.getByRole('button', { name: 'Check again', exact: true }).click();
    await renewed;
    await resumed;
    await expect(page.getByLabel('Device invitation link')).toHaveValue(first.link);
    const wrongOrigin = await request.post('/__account-setup/access', {
      headers: { Origin: 'https://unrelated.invalid', 'Content-Type': 'application/json' },
      data: {},
    });
    expect(wrongOrigin.status()).toBe(403);
    const direct = await request.post('/__account-setup/access', {
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      data: {},
    });
    expect(direct.status()).toBe(200);
    expect(direct.headers()['cache-control']).toBe('no-store');
    for (const path of ['/.dev/account.sqlite', '/src/main.tsx', '/assets/missing.js'])
      expect((await request.get(path)).status()).toBe(404);
    const cacheUrls = await page.evaluate(async () =>
      (
        await Promise.all(
          (
            await caches.keys()
          ).map(async (k) => (await (await caches.open(k)).keys()).map((r) => r.url)),
        )
      ).flat(),
    );
    expect(cacheUrls.length).toBeGreaterThan(5);
    expect(
      cacheUrls.some(
        (url) => url.includes('__account-setup') || url.includes('/account/delivery/'),
      ),
    ).toBe(false);
  } finally {
    await stopService(service);
  }
});
