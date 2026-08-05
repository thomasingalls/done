/**
 * The layout constraints from TRD §8.2, which must hold under any
 * implementation and so are tested against the rendered result rather than
 * against the CSS that currently satisfies them.
 */

import { expect, test, type Page } from '@playwright/test';

const fill = async (page: Page, lines: number): Promise<void> => {
  await page.goto('/');
  const content = page.locator('.cm-content');
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

  test('the panel stays inside the viewport', async ({ page }) => {
    await fill(page, 300);

    const measurements = await page.evaluate(() => {
      const panel = document.querySelector('.panel') as HTMLElement;
      return { panel: panel.getBoundingClientRect().height, viewport: window.innerHeight };
    });

    expect(measurements.panel).toBeLessThanOrEqual(measurements.viewport + 1);
  });

  test('only the editor scrolls, and the header stays put', async ({ page }) => {
    await fill(page, 300);

    const header = page.locator('.panel-header');
    const before = (await header.boundingBox())!;

    await page.locator('.cm-scroller').evaluate((element) => {
      element.scrollTop = 800;
    });

    const scrolled = await page.locator('.cm-scroller').evaluate((element) => element.scrollTop);
    expect(scrolled).toBeGreaterThan(0);

    const after = (await header.boundingBox())!;
    expect(after.y).toBe(before.y);
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

  test('the trigger opens and closes the menu', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto('/');
    await expect(page.locator('.cm-content')).toBeVisible();

    await page.locator('.menu-trigger').click();
    await expect(page.locator('.shell')).toHaveAttribute('data-menu', 'open');
    await expect
      .poll(async () => page.locator('.menu').evaluate((el) => el.getBoundingClientRect().left))
      .toBeCloseTo(0, 0);

    await page.locator('.scrim').click({ position: { x: 380, y: 400 } });
    await expect(page.locator('.shell')).toHaveAttribute('data-menu', 'closed');
  });
});
