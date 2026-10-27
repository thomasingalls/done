import { test } from '../release-validation/browser-fixture';
import { openApp } from './openApp';
/**
 * The layout constraints from TRD §8.2, which must hold under any
 * implementation and so are tested against the rendered result rather than
 * against the CSS that currently satisfies them.
 */

import { expect, type Page } from '@playwright/test';

/**
 * Fills the day in focus with one very tall card. `insertText` puts the
 * newlines in directly; Enter in the compose field would submit each line.
 */
const fill = async (page: Page, lines: number): Promise<void> => {
  await openApp(page);
  const compose = page.locator(
    '.day-panel[data-active="true"] .collection[data-section="done"] .compose-field',
  );
  await expect(compose).toBeVisible();
  await compose.click();
  await page.keyboard.insertText(
    Array.from({ length: lines }, (_, index) => `- line number ${index + 1}`).join('\n'),
  );
  await compose.press('Enter');
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
    await openApp(page);
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

  test('the master list fills the Goals column rather than collapsing', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openApp(page);

    const editor = page.locator('.goals .cm-editor');
    await expect(editor).toBeVisible();

    const measurements = await page.evaluate(() => {
      const height = (selector: string): number =>
        (document.querySelector(selector) as HTMLElement).getBoundingClientRect().height;
      return {
        editor: height('.goals .cm-editor'),
        body: height('.goals-body'),
        panel: height('.goals'),
        header: height('.goals .panel-header'),
        actions: height('.goals-actions'),
      };
    });

    // The band between the header and the actions row takes the slack, and the
    // editor takes the band. Neither is allowed to be a sliver.
    expect(measurements.body).toBeCloseTo(
      measurements.panel - measurements.header - measurements.actions,
      0,
    );
    expect(measurements.editor).toBeCloseTo(measurements.body, 0);
    expect(measurements.editor).toBeGreaterThan(200);
  });

  test('Goals is wider than Today whenever the two are panels', async ({ page }) => {
    for (const width of [900, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await openApp(page);
      await expect(page.locator('.goals')).toBeVisible();

      const widths = await page.evaluate(() => ({
        today: (document.querySelector('.plane') as HTMLElement).getBoundingClientRect().width,
        goals: (document.querySelector('.goals') as HTMLElement).getBoundingClientRect().width,
      }));

      expect(widths.goals).toBeGreaterThan(widths.today);
    }
  });

  test('a short day has no phantom scrolling space', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await openApp(page);
    const body = page.locator('.day-panel[data-active="true"] .day-body');

    const measurements = await body.evaluate((element) => ({
      client: element.clientHeight,
      scroll: element.scrollHeight,
      paddingBottom: Number.parseFloat(getComputedStyle(element).paddingBottom),
    }));

    expect(measurements.scroll - measurements.client).toBeLessThanOrEqual(1);
    expect(measurements.paddingBottom).toBeLessThan(32);
  });

  test('the menu is a panel at wide and behind a trigger below it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openApp(page);
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
    await openApp(page);
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
    await openApp(page);
    await expect(
      page.locator(
        '.day-panel[data-active="true"] .collection[data-section="done"] .compose-field',
      ),
    ).toBeVisible();

    await page.locator('.menu-trigger').click();
    await expect(page.locator('.shell')).toHaveAttribute('data-menu', 'open');
    await expect
      .poll(async () => page.locator('.menu').evaluate((el) => el.getBoundingClientRect().left))
      .toBeCloseTo(0, 0);

    await page.locator('.scrim').click({ position: { x: 380, y: 400 } });
    await expect(page.locator('.shell')).toHaveAttribute('data-menu', 'closed');
  });

  test('the day reads Next, Done, Scheduled, in that order', async ({ page }) => {
    await openApp(page);
    const day = page.locator('.day-panel[data-active="true"]');
    await expect(day.locator('.collection')).toHaveCount(3);

    const compose = day.getByRole('textbox', { name: 'What got done?' });
    await compose.click();
    await page.keyboard.insertText('something finished');
    await compose.press('Enter');

    const scheduled = day.getByRole('textbox', { name: 'What’s scheduled?' });
    await scheduled.fill('a scheduled thing');
    await scheduled.press('Enter');

    await expect(day.locator('.collection')).toHaveCount(3);
    expect(
      await day
        .locator('.collection')
        .evaluateAll((sections) => sections.map((section) => section.getAttribute('data-section'))),
    ).toEqual(['next', 'done', 'scheduled']);
  });

  test('a peek is a click target that moves a day (PRD §7.3)', async ({ page }) => {
    await openApp(page);
    const title = page.locator('.day-panel[data-active="true"] .panel-title');
    const today = (await title.textContent()) ?? '';

    await page.locator('.day-peek[data-edge="bottom"]').click();
    await expect(title).not.toHaveText(today);
  });

  test('an adjacent day is fully laid out before it moves into focus', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await openApp(page);

    const next = page.locator('.day-panel[data-active="false"]').last();
    await expect(next.locator('.collection')).toHaveCount(3);
    await expect(next.locator('.compose-field')).toHaveCount(2);
    await next.evaluate((element) => {
      element.setAttribute('data-was-prerendered', 'true');
    });

    await page.locator('.day-peek[data-edge="bottom"]').click();
    await expect(page.locator('.day-panel[data-active="true"]')).toHaveAttribute(
      'data-was-prerendered',
      'true',
    );
  });
});
