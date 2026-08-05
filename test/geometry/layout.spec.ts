/**
 * The layout constraints from TRD §8.2, which must hold under any
 * implementation and so are tested against the rendered result rather than
 * against the CSS that currently satisfies them.
 */

import { expect, test, type Page } from '@playwright/test';

const JOURNAL = '.day-panel[data-active="true"] .journal';

const fill = async (page: Page, lines: number): Promise<void> => {
  await page.goto('/');
  const content = page.locator(`${JOURNAL} .cm-content`);
  await expect(content).toBeVisible();
  await content.click();
  await page.keyboard.insertText(
    Array.from({ length: lines }, (_, index) => `- line number ${index + 1}`).join('\n'),
  );
};

test.describe('layout', () => {
  test('the document never scrolls, however much is in it', async ({ page }) => {
    await fill(page, 300);

    const overflow = await page.evaluate(() => ({
      vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));

    expect(overflow.vertical).toBeLessThanOrEqual(0);
    expect(overflow.horizontal).toBeLessThanOrEqual(0);
  });

  test('the day panel stays inside the viewport', async ({ page }) => {
    await fill(page, 300);

    const measurements = await page.evaluate(() => {
      const panel = document.querySelector('.day-panel[data-active="true"]') as HTMLElement;
      return { panel: panel.getBoundingClientRect().height, viewport: window.innerHeight };
    });

    expect(measurements.panel).toBeLessThanOrEqual(measurements.viewport + 1);
  });

  test('only the day body scrolls, and the header stays put', async ({ page }) => {
    await fill(page, 300);

    const header = page.locator('.day-panel[data-active="true"] .panel-header');
    const before = (await header.boundingBox())!;

    const body = page.locator('.day-panel[data-active="true"] .day-body');
    await body.evaluate((element) => {
      element.scrollTop = 800;
    });

    expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    const after = (await header.boundingBox())!;
    expect(after.y).toBe(before.y);
  });

  test('the four bands are in the order PRD §7.4 gives them', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.day-panel[data-active="true"]')).toBeVisible();

    const bands = await page.evaluate(() => {
      const top = (selector: string): number =>
        (document.querySelector(selector) as HTMLElement).getBoundingClientRect().top;
      return {
        yesterday: top('.day-panel[data-active="false"]'),
        header: top('.day-panel[data-active="true"] .panel-header'),
        body: top('.day-panel[data-active="true"] .day-body'),
        tomorrow: top('.day-peek[data-edge="bottom"]'),
      };
    });

    // The yesterday peek sits *above* the header, not below it: the header
    // belongs to today, and inverting this looks plausible and reads wrong.
    expect(bands.yesterday).toBeLessThan(bands.header);
    expect(bands.header).toBeLessThan(bands.body);
    expect(bands.body).toBeLessThan(bands.tomorrow);
  });

  test('the menu is a panel at wide and behind a trigger below it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await expect(page.locator('.menu')).toBeVisible();
    await expect(page.locator('.menu-trigger')).toBeHidden();

    await page.setViewportSize({ width: 420, height: 900 });
    await expect(page.locator('.menu-trigger')).toBeVisible();

    // Polled because the menu slides rather than jumps.
    await expect
      .poll(async () =>
        page.locator('.menu').evaluate((element) => element.getBoundingClientRect().right),
      )
      .toBeLessThanOrEqual(0);
  });

  test('Goals sits beside Today from medium up, and off-screen below it', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto('/');
    await expect
      .poll(async () =>
        page.locator('.goals').evaluate((element) => element.getBoundingClientRect().right),
      )
      .toBeLessThanOrEqual(901);

    await page.setViewportSize({ width: 420, height: 900 });
    await expect
      .poll(async () =>
        page.locator('.goals').evaluate((element) => element.getBoundingClientRect().left),
      )
      .toBeGreaterThanOrEqual(419);
  });

  test('the trigger opens and closes the menu', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto('/');
    await expect(page.locator(`${JOURNAL} .cm-content`)).toBeVisible();

    await page.locator('.menu-trigger').click();
    await expect(page.locator('.shell')).toHaveAttribute('data-menu', 'open');
    await expect
      .poll(async () => page.locator('.menu').evaluate((el) => el.getBoundingClientRect().left))
      .toBeCloseTo(0, 0);

    await page.locator('.scrim').click({ position: { x: 380, y: 400 } });
    await expect(page.locator('.shell')).toHaveAttribute('data-menu', 'closed');
  });

  test('a peek is a click target that moves a day (PRD §7.3)', async ({ page }) => {
    await page.goto('/');
    const title = page.locator('.day-panel[data-active="true"] .panel-title');
    const today = (await title.textContent()) ?? '';

    await page.locator('.day-peek[data-edge="bottom"]').click();
    await expect(title).not.toHaveText(today);
  });
});
