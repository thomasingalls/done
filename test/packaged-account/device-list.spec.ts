import { test, expect, type Page } from '@playwright/test';
import { pairedEditors, add } from './devices';
import { startService, stopService } from './server';

async function showDevices(page: Page, count: number) {
  await page.getByRole('button', { name: 'Devices', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Devices', exact: true })).toBeVisible();
  await expect(page.locator('.account-device-list li')).toHaveCount(count);
  await expect(page.locator('.account-device-list')).toContainText('This device');
  await expect(page.locator('.account-device-list [data-device-state=certified]')).toHaveCount(
    count,
  );
  await expect(page).toHaveURL(/\/devices(?:\?|$)/);
}

test('verified Devices is available on both account owners; Back preserves writing and cold URLs require unlock', async ({
  page,
  browser,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', async (r) => {
    if (r.status() < 400 || !new URL(r.url()).pathname.startsWith('/__account-setup/')) return;
    const body = await r.json().catch(() => ({}));
    console.log(
      'Account refusal:',
      new URL(r.url()).pathname,
      r.status(),
      body.refusal ?? body.reason ?? 'unavailable',
    );
  });
  try {
    pair = await pairedEditors(page, browser, true, {
      beforeInvite: async () => {
        await showDevices(page, 1);
        await expect(
          page.getByRole('button', { name: 'Connect another device', exact: true }),
        ).toBeEnabled();
        await page.goBack();
        await expect(page.locator('.shell')).toContainText('Keep the first device writing');
        await showDevices(page, 1);
        await page.getByRole('button', { name: 'Connect another device', exact: true }).click();
        await expect(page).toHaveURL(/\/connect\/unlock\?slot=/);
        return 'invite';
      },
    });
    for (const p of [page, pair.second]) {
      await showDevices(p, 2);
      await expect(
        p.getByRole('button', { name: 'Connect another device', exact: true }),
      ).toBeDisabled();
      await expect(p.locator('.account-device-list')).toContainText(
        'Key-storage details are not recorded',
      );
      await p.getByRole('button', { name: 'Back to writing', exact: true }).click();
      await expect(p.locator('.shell')).toContainText('Keep the first device writing');
    }
    await add(pair.second, 'Writing after visiting Devices');
    await expect(page.locator('.shell')).toContainText('Writing after visiting Devices', {
      timeout: 15000,
    });
    await showDevices(page, 2);
    await page.reload();
    await expect(page.getByLabel('Device-lock code', { exact: true })).toBeVisible();
    await expect(page.locator('.account-device-list')).toHaveCount(0);
    await page.getByLabel('Device-lock code', { exact: true }).fill(pair.first.code);
    await page
      .getByRole('button', { name: 'Confirm code and unlock with passkey', exact: true })
      .click();
    await expect(page.locator('.shell')).toContainText('Writing after visiting Devices');
    await showDevices(page, 2);
    await page.screenshot({ path: info.outputPath('devices.png'), fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    await pair?.other.close();
    await stopService(service);
  }
});
