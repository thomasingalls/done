import { test, expect } from '@playwright/test';
import { pairedEditors, add } from './devices';
import { startService, stopService } from './server';

test('a required sign-in offers the passkey action and resumes both lanes without reloading', async ({
  page,
  browser,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  try {
    pair = await pairedEditors(page, browser, true);
    const second = pair.second;
    let refusals = 0;
    await second.route('**/account/delivery/read-v2', async (route) => {
      refusals++;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          v: 1,
          kind: 'authorization-refused',
          refusal: 'sign-in-required',
        }),
      });
    });
    await add(page, 'Waiting for the phone passkey');
    const notice = second.locator('.sync-notice');
    await expect(notice).toContainText('receive:sign-in-required', { timeout: 45000 });
    await expect(notice).not.toContainText('network-unavailable');
    await expect(notice.getByRole('button', { name: 'Retry receiving', exact: true })).toHaveCount(
      0,
    );
    const count = refusals;
    await second.waitForTimeout(1500);
    expect(refusals).toBe(count);
    await second.unroute('**/account/delivery/read-v2');
    await notice.getByRole('button', { name: 'Reconnect sync', exact: true }).click();
    await expect(second.locator('.shell')).toContainText('Waiting for the phone passkey', {
      timeout: 15000,
    });
    await expect(notice).toHaveCount(0);
    await add(second, 'Writing after the passkey reconnect');
    await expect(page.locator('.shell')).toContainText('Writing after the passkey reconnect', {
      timeout: 15000,
    });
  } finally {
    await pair?.other.close();
    await stopService(service);
  }
});
