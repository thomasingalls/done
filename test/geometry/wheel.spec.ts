/** Desktop regressions for the bounded native three-day wheel surface. */

import { expect, test, type Locator, type Page } from '@playwright/test';
import { addDays, type ISODate } from '../../src/lib/date';

const activeDay = (page: Page) => page.locator('.day-panel[data-active="true"]');

const nativeWheel = async (page: Page, target: Locator, deltaY: number): Promise<void> => {
  const box = await target.boundingBox();
  if (!box) throw new Error('Wheel target is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
};

const openDesktop = async (
  page: Page,
): Promise<{ body: Locator; header: Locator; initial: ISODate }> => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(activeDay(page)).toBeVisible();
  const initial = (await activeDay(page).getAttribute('data-date')) as ISODate;
  return {
    body: activeDay(page).locator('.day-body'),
    header: activeDay(page).locator('.panel-header'),
    initial,
  };
};

const makeDayScrollable = async (body: Locator): Promise<void> => {
  await body.evaluate((element) => {
    const filler = document.createElement('div');
    filler.style.flex = '0 0 2000px';
    element.append(filler);
    element.scrollTop = 0;
  });
  await expect.poll(() => body.evaluate((element) => element.scrollHeight)).toBeGreaterThan(2000);
};

const moveToBottom = (target: Locator): Promise<void> =>
  target.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

test.describe('desktop wheel navigation', () => {
  test.skip(({ isMobile }) => isMobile, 'Mouse-wheel navigation is a desktop interaction.');

  test('an arbitrarily large wheel moves exactly one day', async ({ page }) => {
    const { header, initial } = await openDesktop(page);

    await nativeWheel(page, header, 100_000);

    await expect(activeDay(page)).toHaveAttribute('data-date', addDays(initial, 1));
  });

  test('a fresh gesture can immediately move one more day', async ({ page }) => {
    const { header, initial } = await openDesktop(page);

    await nativeWheel(page, header, 100_000);
    await expect(activeDay(page)).toHaveAttribute('data-date', addDays(initial, 1));

    await nativeWheel(page, activeDay(page).locator('.day-body'), 100_000);
    await expect(activeDay(page)).toHaveAttribute('data-date', addDays(initial, 2));
  });

  test('a large upward wheel moves exactly one day into the past', async ({ page }) => {
    const { header, initial } = await openDesktop(page);

    await nativeWheel(page, header, -100_000);

    await expect(activeDay(page)).toHaveAttribute('data-date', addDays(initial, -1));
  });

  test('a wheel stays within a long day while it has scroll room', async ({ page }) => {
    const { body, initial } = await openDesktop(page);
    await makeDayScrollable(body);

    await nativeWheel(page, body, 100);
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(activeDay(page)).toHaveAttribute('data-date', initial);
  });

  test('a fresh wheel at the end of a long day changes dates', async ({ page }) => {
    const { body, initial } = await openDesktop(page);
    await makeDayScrollable(body);
    await moveToBottom(body);

    await nativeWheel(page, body, 100_000);
    await expect(activeDay(page)).toHaveAttribute('data-date', addDays(initial, 1));
  });
});

test.describe('day scroll reset', () => {
  test.skip(({ isMobile }) => isMobile, 'Mouse-wheel navigation is a desktop interaction.');

  test('leaving a day resets its within-day scroll position', async ({ page }) => {
    const { body, initial } = await openDesktop(page);
    await makeDayScrollable(body);

    await moveToBottom(body);

    await nativeWheel(page, body, 100_000);
    await expect(activeDay(page)).toHaveAttribute('data-date', addDays(initial, 1));
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(0);

    await nativeWheel(page, activeDay(page).locator('.panel-header'), -100_000);
    await expect(activeDay(page)).toHaveAttribute('data-date', initial);
    await expect
      .poll(() =>
        activeDay(page)
          .locator('.day-body')
          .evaluate((element) => element.scrollTop),
      )
      .toBe(0);
  });
});
