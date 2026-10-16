import { test, expect } from '@playwright/test';
import { account } from '../device-enrollment/helpers';
import {
  startService,
  stopService,
  startBackend,
  startApplication,
  stopProcess,
  origin,
} from './server';
test('compiled setup survives independent API and application restarts without refreshing the page', async ({
  page,
  request,
}, info) => {
  const state = info.outputPath('service');
  const service = await startService(state);
  try {
    await page.goto('/');
    await expect(page.locator('.shell[data-local-workspace]')).toBeVisible();
    await expect(page.locator('input[type=password]')).toHaveCount(0);
    const first = await account(page);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await stopProcess(service.backend);
    expect((await request.get('/')).status()).toBe(200);
    const unavailable = await request.post('/__account-setup/config', {
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      data: {},
    });
    expect(unavailable.status()).toBe(503);
    expect(unavailable.headers()['cache-control']).toBe('no-store');
    service.backend = await startBackend(state);
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
    const before = await request.post('/__account-setup/access', {
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      data: {},
    });
    const beforeConfig = await before.json();
    await stopProcess(service.app);
    service.app = await startApplication();
    const after = await request.post('/__account-setup/access', {
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      data: {},
    });
    expect(await after.json()).toEqual(beforeConfig);
    const afterAppRestart = page.waitForResponse(
      (r) => r.url().endsWith('/__account-setup/ceremony/bootstrap') && r.status() === 200,
    );
    await page.getByRole('button', { name: 'Check again', exact: true }).click();
    await afterAppRestart;
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
