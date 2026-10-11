import { test, expect } from '@playwright/test';
import { pairedEditors, add } from './devices';
import { startService, stopService } from './server';

test('an invalid receive page stays stopped, shows a stable notice and retries without reloading', async ({
  page,
  browser,
}, info) => {
  const service = await startService(info.outputPath('service'), undefined, true, true);
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  const refusals: { path: string; status: number }[] = [];
  const watch = (p: typeof page) =>
    p.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (path.startsWith('/account/') && response.status() >= 400)
        refusals.push({ path, status: response.status() });
    });
  watch(page);
  try {
    pair = await pairedEditors(page, browser, true, {
      beforeCompare: async (second) => {
        watch(second);
      },
    });
    const second = pair.second;
    let invalid = 0;
    await second.route('**/account/delivery/read-v2', async (route) => {
      invalid++;
      await route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        body: Buffer.from([0, 1, 2]),
      });
    });
    await add(page, 'Arrives only after explicit authenticated retry');
    const notice = second.locator('.sync-notice');
    await expect(notice).toContainText('Changes from your other devices are not arriving here.', {
      timeout: 45000,
    });
    await expect(notice).toContainText('receive:integrity');
    expect(await notice.evaluate((e) => getComputedStyle(e).position)).toBe('fixed');
    const count = invalid;
    await second.waitForTimeout(1200);
    expect(invalid).toBe(count);
    await second.unroute('**/account/delivery/read-v2');
    await notice.getByRole('button', { name: 'Retry receiving', exact: true }).click();
    await expect(second.locator('.shell')).toContainText(
      'Arrives only after explicit authenticated retry',
      { timeout: 15000 },
    );
    await expect(notice).toHaveCount(0);
    await add(second, 'Writing after receive recovery');
    await expect(page.locator('.shell')).toContainText('Writing after receive recovery', {
      timeout: 15000,
    });
  } catch (cause) {
    console.log('HTTP refusals:', refusals);
    throw cause;
  } finally {
    await pair?.other.close();
    await stopService(service);
  }
});
