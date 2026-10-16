import { test } from '../release-validation/browser-fixture';
import { openApp } from './openApp';
/** Browser coverage for the pointer details of collection reordering. */

import { expect, type Locator, type Page } from '@playwright/test';

const activeDay = (page: Page) => page.locator('.day-panel[data-active="true"]');

const addDoneCards = async (page: Page, values: readonly string[]): Promise<void> => {
  const compose = activeDay(page).getByRole('textbox', { name: 'What got done?' });
  for (const value of values) {
    await compose.fill(value);
    await compose.press('Enter');
  }
};

const seedCards = async (page: Page, section: string): Promise<void> => {
  if (section === 'done') return addDoneCards(page, ['third', 'second', 'first']);
  const compose = activeDay(page).getByRole('textbox', { name: 'What’s scheduled?' });
  for (const value of ['first', 'second', 'third']) {
    await compose.fill(value);
    await compose.press('Enter');
    if (section === 'next')
      await activeDay(page)
        .locator('.card[data-section="scheduled"]')
        .filter({ hasText: value })
        .getByRole('button', { name: `Move to Next: ${value}`, exact: true })
        .click();
  }
};

const touchHoldDrag = async (
  page: Page,
  source: Locator,
  target: Locator | null,
): Promise<void> => {
  const sourceBox = await source.boundingBox();
  if (!sourceBox) throw new Error('Drag source is not visible');
  const targetBox = target ? await target.boundingBox() : null;
  if (target && !targetBox) throw new Error('Drag target is not visible');

  const start = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 };
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...start, id: 81 }],
  });
  await page.waitForTimeout(450);

  if (targetBox) {
    const end = { x: start.x, y: targetBox.y + targetBox.height / 2 };
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...end, id: 81 }],
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
};

for (const section of ['done', 'next', 'scheduled']) {
  test.describe(`${section} card reordering`, () => {
    test('a mouse drag on the grip reorders cards', async ({ page, isMobile }) => {
      test.skip(isMobile, 'The mouse grip is the desktop activation path.');
      await page.setViewportSize({ width: 1280, height: 900 });
      await openApp(page);
      await seedCards(page, section);

      const cards = activeDay(page).locator(`.card[data-section="${section}"]`);
      const handle = cards.first().getByRole('button', { name: 'Reorder first' });
      const handleBox = await handle.boundingBox();
      const targetBox = await cards.nth(2).boundingBox();
      if (!handleBox || !targetBox) throw new Error('Reorder controls are not visible');

      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x + handleBox.width / 2, targetBox.y + targetBox.height / 2, {
        steps: 8,
      });
      await page.mouse.up();

      await expect(cards.nth(0).locator('.card-surface')).toContainText('second');
      await expect(cards.nth(1).locator('.card-surface')).toContainText('third');
      await expect(cards.nth(2).locator('.card-surface')).toContainText('first');
    });

    test('a touch long-press then drag reorders cards', async ({ page, isMobile }) => {
      test.skip(!isMobile, 'Long-press activation is exercised in the Android project.');
      await page.setViewportSize({ width: 420, height: 900 });
      await openApp(page);
      await seedCards(page, section);

      const cards = activeDay(page).locator(`.card[data-section="${section}"]`);
      await touchHoldDrag(page, cards.first().locator('.card-surface'), cards.nth(2));

      await expect(cards.nth(0).locator('.card-surface')).toContainText('second');
      await expect(cards.nth(1).locator('.card-surface')).toContainText('third');
      await expect(cards.nth(2).locator('.card-surface')).toContainText('first');
    });

    test('movement before the hold remains day navigation', async ({ page, isMobile }) => {
      test.skip(section !== 'done', 'The shared arbitration is covered once.');
      test.skip(!isMobile, 'The touch arbitration path is exercised in the Android project.');
      await page.setViewportSize({ width: 420, height: 900 });
      await openApp(page);
      await addDoneCards(page, ['second', 'first']);

      const initial = await activeDay(page).getAttribute('data-date');
      const surface = activeDay(page)
        .locator('.card[data-section="done"]')
        .first()
        .locator('.card-surface');
      const box = await surface.boundingBox();
      if (!box) throw new Error('Swipe source is not visible');

      const session = await page.context().newCDPSession(page);
      const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ ...start, id: 82 }],
      });
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: start.x, y: start.y - 360, id: 82 }],
      });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await session.detach();

      await expect(activeDay(page)).not.toHaveAttribute('data-date', initial!);
    });

    test('a stationary touch long-press still unlocks Done', async ({ page, isMobile }) => {
      test.skip(section !== 'done', 'Done has the guarded unlock path.');
      test.skip(!isMobile, 'Long-press activation is exercised in the Android project.');
      await page.setViewportSize({ width: 420, height: 900 });
      await openApp(page);
      await addDoneCards(page, ['second', 'first']);

      const first = activeDay(page).locator('.card[data-section="done"]').first();
      await touchHoldDrag(page, first.locator('.card-surface'), null);

      await expect(first.locator('.cm-content')).toBeFocused();
      await expect(activeDay(page).locator('.card-list[data-reordering="true"]')).toHaveCount(0);
    });
  });
}
