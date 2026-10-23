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

for (const [width, textSize] of [
  [280, 16],
  [360, 24],
  [320, 32],
  [1280, 16],
] as const) {
  test(`sidebar labels fit at ${width}px with ${textSize}px base text`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({
      colorScheme: width === 1280 ? 'light' : 'dark',
      reducedMotion: 'reduce',
    });
    await openApp(page);
    await openMenuSection(page, 'Account');
    // Set this after opening the menu so oversized baseline controls cannot prevent the check.
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = `${size}px`;
    }, textSize);
    const menu = page.locator('#menu');
    const account = menu.locator('[data-menu-section="Account"]');
    await account.locator('summary').click();
    await expect(account).not.toHaveAttribute('open');
    await page.screenshot({ path: info.outputPath('collapsed.png') });
    const panel = await menu.boundingBox();
    expect.soft(panel!.x).toBeGreaterThanOrEqual(-1);
    expect.soft(panel!.x + panel!.width).toBeLessThanOrEqual(width + 1);

    await openMenuSection(page, 'Account');
    await account
      .getByRole('textbox', { name: 'User name', exact: true })
      .fill('LongUsername'.repeat(5));
    await account.getByRole('button', { name: 'Save preferences', exact: true }).click();
    await expect(account.getByRole('status')).toHaveText('Preferences saved.');
    for (const section of ['Sync', 'Data', 'Install'] as const)
      await openMenuSection(page, section);

    const clipping = await menu.evaluate((node) => {
      const failures: string[] = [];
      // Total scrollWidth misses text painted into a button's padding or clipped by its edge.
      for (const el of node.querySelectorAll(
        '.menu-day, .menu-button, summary, .menu-date-control > span',
      )) {
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const style = getComputedStyle(el);
        const left = box.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
        const right =
          box.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);
        const range = document.createRange();
        range.selectNodeContents(el);
        if ([...range.getClientRects()].some((r) => r.left < left - 1 || r.right > right + 1))
          failures.push(el.textContent!.trim());
      }
      if (node.scrollWidth > node.clientWidth + 1) failures.push('horizontal panel overflow');
      return failures;
    });
    expect.soft(clipping).toEqual([]);
    const remove = account.getByRole('button', { name: 'Remove from this device', exact: true });
    await remove.scrollIntoViewIfNeeded();
    // IntersectionObserver rounds fractional scroll positions; allow one CSS pixel at an edge.
    const removeBox = (await remove.boundingBox())!;
    expect(removeBox.x).toBeGreaterThanOrEqual(-1);
    expect(removeBox.y).toBeGreaterThanOrEqual(-1);
    expect(removeBox.x + removeBox.width).toBeLessThanOrEqual(width + 1);
    expect(removeBox.y + removeBox.height).toBeLessThanOrEqual(901);
    await page.screenshot({ path: info.outputPath('account.png') });
    const install = menu.getByRole('button', { name: 'Install', exact: true });
    await install.scrollIntoViewIfNeeded();
    const installBox = (await install.boundingBox())!;
    expect(installBox.x).toBeGreaterThanOrEqual(-1);
    expect(installBox.y).toBeGreaterThanOrEqual(-1);
    expect(installBox.x + installBox.width).toBeLessThanOrEqual(width + 1);
    expect(installBox.y + installBox.height).toBeLessThanOrEqual(901);
    await page.screenshot({ path: info.outputPath('expanded-bottom.png') });
  });
}
