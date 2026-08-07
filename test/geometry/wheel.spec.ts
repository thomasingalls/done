/** Desktop wheel-navigation regressions, including macOS-style momentum tails. */

import { expect, test, type Locator, type Page } from '@playwright/test';
import { addDays, type ISODate } from '../../src/lib/date';

const activeDay = (page: Page) => page.locator('.day-panel[data-active="true"]');

const wheel = async (target: Locator, deltaY: number): Promise<void> => {
  await target.evaluate((element, amount) => {
    element.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        deltaY: amount,
      }),
    );
  }, deltaY);
};

const openDesktop = async (page: Page): Promise<{ header: Locator; initial: ISODate }> => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(activeDay(page)).toBeVisible();
  const initial = (await activeDay(page).getAttribute('data-date')) as ISODate;
  return { header: activeDay(page).locator('.panel-header'), initial };
};

const makeDayScrollable = async (page: Page): Promise<Locator> => {
  const body = activeDay(page).locator('.day-body');
  await body.evaluate((element) => {
    const filler = document.createElement('div');
    filler.style.flex = '0 0 2000px';
    element.append(filler);
    element.scrollTop = 0;
  });
  await expect.poll(() => body.evaluate((element) => element.scrollHeight)).toBeGreaterThan(2000);
  return body;
};

test.describe('desktop wheel navigation', () => {
  test.skip(({ isMobile }) => isMobile, 'Mouse-wheel navigation is a desktop interaction.');

  test('requires deliberate motion', async ({ page }) => {
    const { header, initial } = await openDesktop(page);

    await wheel(header, 60);
    await page.waitForTimeout(100);
    await expect(activeDay(page)).toHaveAttribute('data-date', initial);

    await wheel(header, 120);
    await expect(activeDay(page)).toHaveAttribute('data-date', addDays(initial, 1));
  });

  test('allows the next between-day gesture without an idle wait', async ({ page }) => {
    const { header, initial } = await openDesktop(page);

    await wheel(header, 120);
    await expect(activeDay(page)).toHaveAttribute('data-date', addDays(initial, 1));

    await wheel(header, 120);
    await expect(activeDay(page)).toHaveAttribute('data-date', addDays(initial, 2));
  });

  test('moves at most one day through a momentum tail', async ({ page }) => {
    const { header, initial } = await openDesktop(page);

    await wheel(header, 120);
    await page.waitForTimeout(110);
    await wheel(header, 40);
    await page.waitForTimeout(110);
    await wheel(header, 30);
    await page.waitForTimeout(110);
    await wheel(header, 60);
    await page.waitForTimeout(110);
    await wheel(header, 50);

    await expect(activeDay(page)).toHaveAttribute('data-date', addDays(initial, 1));

    await page.waitForTimeout(260);
    await wheel(header, 120);
    await expect(activeDay(page)).toHaveAttribute('data-date', addDays(initial, 2));
  });

  test('hands off from within-day only after native scrolling ends', async ({ page }) => {
    const { initial } = await openDesktop(page);
    const body = await makeDayScrollable(page);

    await body.evaluate(async (element) => {
      const scrollEnded = new Promise<void>((resolve) => {
        element.addEventListener('scrollend', () => resolve(), { once: true });
      });
      const emitWheel = (deltaY: number): void => {
        element.dispatchEvent(
          new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            deltaMode: WheelEvent.DOM_DELTA_PIXEL,
            deltaY,
          }),
        );
      };

      emitWheel(120);
      element.scrollTop = element.scrollHeight;
      emitWheel(120);
      emitWheel(120);
      await scrollEnded;
    });

    await expect(activeDay(page)).toHaveAttribute('data-date', initial);

    await wheel(body, 120);
    await expect(activeDay(page)).toHaveAttribute('data-date', addDays(initial, 1));
  });

  test('a fresh native wheel at the boundary moves to the next day', async ({ page }) => {
    const { initial } = await openDesktop(page);
    const body = await makeDayScrollable(page);
    const box = await body.boundingBox();
    if (!box) throw new Error('Day body is not visible');

    const scrollEnded = body.evaluate(
      (element) =>
        new Promise<void>((resolve) => {
          element.addEventListener('scrollend', () => resolve(), { once: true });
        }),
    );
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 4000);
    await scrollEnded;

    await expect(activeDay(page)).toHaveAttribute('data-date', initial);
    await page.mouse.wheel(0, 120);
    await expect(activeDay(page)).toHaveAttribute('data-date', addDays(initial, 1));
  });

  test('starts accumulation anew when direction reverses', async ({ page }) => {
    const { header, initial } = await openDesktop(page);

    await header.evaluate((element) => {
      for (const deltaY of [60, -60, -40]) {
        element.dispatchEvent(
          new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            deltaMode: WheelEvent.DOM_DELTA_PIXEL,
            deltaY,
          }),
        );
      }
    });

    await expect(activeDay(page)).toHaveAttribute('data-date', addDays(initial, -1));
  });
});
