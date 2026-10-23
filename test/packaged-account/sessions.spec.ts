import { openMenuSection } from '../geometry/openApp';
import { test, expect } from '@playwright/test';
import { pairedEditors, credentials, restoreAuthenticator, openSaved, add } from './devices';
import { startService, stopService, startBackend, stopProcess, origin } from './server';

test('packaged session host enrolls both devices, renews after restart and retains offline writing', async ({
  page,
  browser,
  request,
}, info) => {
  const state = info.outputPath('service');
  const service = await startService(state, undefined, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  const errors: string[] = [],
    paths: string[] = [];
  let streams = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => paths.push(new URL(r.url()).pathname));
  page.on('response', (r) => {
    if (new URL(r.url()).pathname === '/account/notifications/v1/subscribe' && r.status() === 200)
      streams++;
  });
  try {
    pair = await pairedEditors(page, browser, true, {
      beforeCompare: async () => {
        await expect.poll(() => streams).toBeGreaterThan(0);
        const input = page.getByLabel('Code on the new device');
        await input.fill('AB');
        // The comparison state starts a newly scoped subscription. Let its mandatory
        // ready/catch-up finish before measuring the subsequent idle interval.
        await page.waitForTimeout(1500);
        const before = paths.filter((p) => p === '/__account-setup/ceremony/exchange').length;
        // Deliberate observation window: ordinary 2.5s polling or a replay/hint loop would
        // run here. A live subscription preserves the comparison and focus without either.
        await page.waitForTimeout(5500);
        expect(
          paths.filter((p) => p === '/__account-setup/ceremony/exchange').length - before,
        ).toBe(0);
        await expect(input).toHaveValue('AB');
        await expect(input).toBeFocused();
      },
    });
    const config = await request.post('/__account-setup/config', {
      headers: { Origin: origin },
      data: {},
    });
    expect(await config.json()).toMatchObject({ v: 2, networkSessions: true });
    expect(
      (
        await request.post('/__account-setup/access', { headers: { Origin: origin }, data: {} })
      ).status(),
    ).toBe(404);
    await add(page, 'Session transport A to B');
    await expect(pair.second.locator('.shell')).toContainText('Session transport A to B', {
      timeout: 20000,
    });
    await add(pair.second, 'Session transport B to A');
    await expect(page.locator('.shell')).toContainText('Session transport B to A', {
      timeout: 20000,
    });
    // After catch-up, a healthy stream replaces the old five-second read loop.
    await page.waitForTimeout(1000);
    const reads = paths.filter((p) => p === '/account/delivery/read-v2').length;
    await page.waitForTimeout(6000);
    expect(paths.filter((p) => p === '/account/delivery/read-v2')).toHaveLength(reads);
    await stopProcess(service.backend);
    await add(page, 'Queued across session service restart');
    service.backend = await startBackend(state, true);
    await expect(pair.second.locator('.shell')).toContainText(
      'Queued across session service restart',
      { timeout: 20000 },
    );
    const saved = await credentials(pair.next.auth);
    await openMenuSection(pair.second, 'Account');
    await pair.second.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await pair.other.setOffline(true);
    await pair.second.close();
    const reopened = await pair.other.newPage();
    await restoreAuthenticator(reopened, saved);
    await reopened.goto(origin + '/');
    await openSaved(reopened, pair.next.code, true);
    await add(reopened, 'Offline session reopening');
    await pair.other.setOffline(false);
    await expect(page.locator('.shell')).toContainText('Offline session reopening', {
      timeout: 20000,
    });
    expect(paths).toContain('/account/grant/v1/finish');
    expect(paths).not.toContain('/__account-setup/access');
    expect(errors).toEqual([]);
  } finally {
    await pair?.other.close();
    await stopService(service);
  }
});
