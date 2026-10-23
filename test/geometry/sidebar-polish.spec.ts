import { expect } from '@playwright/test';
import { test } from '../release-validation/browser-fixture';
import { openApp, openMenuSection } from './openApp';

for (const width of [320, 1280]) {
  test(`sidebar preferences have readable fields and consistent targets at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: width === 320 ? 'dark' : 'light' });
    await openApp(page);
    await openMenuSection(page, 'Account');
    const menu = page.locator('#menu');
    const account = menu.locator('[data-menu-section="Account"]');
    await expect(account.getByText('User', { exact: true })).toBeVisible();
    await expect(account.getByText('Actor', { exact: true })).toHaveCount(0);
    for (const label of ['Device name', 'User name']) {
      const field = account.getByRole('textbox', { name: label, exact: true });
      await expect(field).toBeVisible();
      const geometry = await field.evaluate((input) => {
        const text = input.closest('label')!.querySelector('span')!;
        const a = input.getBoundingClientRect(),
          b = text.getBoundingClientRect();
        const form = input.closest('form')!.getBoundingClientRect();
        return { height: a.height, gap: a.top - b.bottom, width: a.width, available: form.width };
      });
      expect(geometry.height).toBeGreaterThanOrEqual(36);
      expect(geometry.gap).toBeGreaterThanOrEqual(3);
      expect(geometry.width).toBeGreaterThanOrEqual(geometry.available - 2);
    }
    for (const name of [
      'Save preferences',
      'Add an unlock code',
      'Use another account',
      'Remove from this device',
    ]) {
      const button = account.getByRole('button', { name, exact: true });
      const bounds = await button.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(36);
    }
    await account
      .getByRole('textbox', { name: 'Device name', exact: true })
      .fill('Firefox — a longer device name');
    await page.screenshot({ path: info.outputPath(`account-${width}.png`) });
    for (const section of ['Sync', 'Data', 'Install'] as const)
      await openMenuSection(page, section);
    expect(await menu.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`sidebar-${width}.png`) });
  });
}
