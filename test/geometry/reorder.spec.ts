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

const seedCards = async (page: Page, section: string, multiline = false): Promise<void> => {
  const body = (value: string) =>
    multiline
      ? value + '\n' + Array.from({ length: 6 }, (_, n) => 'Detail ' + n).join('\n')
      : value;
  if (section === 'done') return addDoneCards(page, ['third', 'second', 'first'].map(body));
  const compose = activeDay(page).getByRole('textbox', { name: 'What’s scheduled?' });
  for (const value of ['third', 'second', 'first']) {
    await compose.fill(body(value));
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

/** Unlike a teleport-and-release, yield a painted frame between real touch moves so native
 * scroll arbitration can cancel the pointer before release. */
const sustainedTouchDrag = async (page: Page, source: Locator, card: Locator, target: Locator) => {
  const a = await source.boundingBox(),
    b = await target.boundingBox();
  if (!a || !b) throw Error('Missing touch drag geometry');
  const session = await page.context().newCDPSession(page);
  const x = a.x + a.width / 2,
    y = a.y + a.height / 2;
  let ended = false;
  await page.evaluate(() => {
    const events: { type: string; cancelable: boolean }[] = [];
    Object.assign(window, { reorderEvents: events });
    for (const name of ['pointercancel', 'gotpointercapture', 'lostpointercapture'])
      document.addEventListener(
        name,
        (event) => events.push({ type: event.type, cancelable: event.cancelable }),
        { capture: true },
      );
  });
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 93 }],
    });
    await page.waitForTimeout(450);
    await expect(card).toHaveAttribute('data-reordering', 'true');
    for (let step = 1; step <= 8; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y + ((b.y + b.height / 2 - y) * step) / 8, id: 93 }],
      });
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(card).toHaveAttribute('data-reordering', 'true');
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    ended = true;
  } catch (cause) {
    await test.info().attach('touch-ownership-events', {
      body: JSON.stringify(
        await page.evaluate(() => (window as unknown as { reorderEvents: unknown }).reorderEvents),
      ),
      contentType: 'application/json',
    });
    throw cause;
  } finally {
    if (!ended)
      await session
        .send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
        .catch(() => {});
    await session.detach();
  }
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

    for (const activation of ['grip', 'hold'])
      test(`sustained touch ${activation} retains ownership until release`, async ({
        page,
        isMobile,
      }) => {
        test.skip(!isMobile, 'Real touch arbitration is covered on the Android profile.');
        await page.setViewportSize({ width: 420, height: 900 });
        await openApp(page);
        await seedCards(page, section, true);
        await activeDay(page)
          .locator('[data-scroll="day"]')
          .evaluate((e) => (e.scrollTop = Math.min(120, (e.scrollHeight - e.clientHeight) / 2)));
        const day = await activeDay(page).getAttribute('data-date');
        const cards = activeDay(page).locator(`.card[data-section="${section}"]`);
        const first = cards.nth(1);
        const source =
          activation === 'grip'
            ? first.getByRole('button', { name: 'Reorder second', exact: true })
            : first.locator('.card-surface');
        await expect(source).toBeVisible();
        await sustainedTouchDrag(page, source, first, cards.nth(2));
        await expect(cards.nth(0).locator('.md-line').first()).toHaveText('first');
        await expect(cards.nth(1).locator('.md-line').first()).toHaveText('third');
        await expect(cards.nth(2).locator('.md-line').first()).toHaveText('second');
        await expect(activeDay(page)).toHaveAttribute('data-date', day!);
        await expect(activeDay(page).locator('.card-list[data-reordering="true"]')).toHaveCount(0);
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

test('an ordinary pre-hold touch still scrolls the overflowing day without reordering', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Native touch scrolling is covered on the Android profile.');
  await page.setViewportSize({ width: 420, height: 900 });
  await openApp(page);
  await addDoneCards(
    page,
    Array.from({ length: 12 }, (_, n) => `Item ${n}\n` + 'A detail\n'.repeat(6)),
  );
  const day = await activeDay(page).getAttribute('data-date');
  const scroller = activeDay(page).locator('[data-scroll="day"]');
  await scroller.evaluate((e) => (e.scrollTop = 300));
  const cards = activeDay(page).locator('.card[data-section="done"]');
  const before = await cards.evaluateAll((elements) =>
    elements.map((e) => e.getAttribute('data-card')),
  );
  const box = await cards.nth(2).locator('.card-surface').boundingBox();
  if (!box) throw Error('Missing scroll source');
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  const start = await scroller.evaluate((e) => e.scrollTop);
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 94 }],
    });
    for (let step = 1; step <= 6; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y - step * 20, id: 94 }],
      });
      await page.waitForTimeout(16);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await session.detach();
  }
  await expect.poll(() => scroller.evaluate((e) => e.scrollTop)).toBeGreaterThan(start);
  expect(
    await cards.evaluateAll((elements) => elements.map((e) => e.getAttribute('data-card'))),
  ).toEqual(before);
  await expect(activeDay(page)).toHaveAttribute('data-date', day!);
  await expect(activeDay(page).locator('.card-list[data-reordering="true"]')).toHaveCount(0);
  await expect(activeDay(page).locator('.cm-content')).toHaveCount(0);
});

test('cancelling a mobile grip drag leaves order unchanged and permits the next drag', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Native touch cancellation is covered on the Android profile.');
  await openApp(page);
  await seedCards(page, 'done');
  const cards = activeDay(page).locator('.card[data-section="done"]');
  const source = cards.first().getByRole('button', { name: 'Reorder first', exact: true });
  const box = await source.boundingBox();
  if (!box) throw Error('Missing visible grip');
  const before = await cards.evaluateAll((elements) =>
    elements.map((e) => e.getAttribute('data-card')),
  );
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 95 }],
    });
    await expect(cards.first()).toHaveAttribute('data-reordering', 'true');
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + 90, id: 95 }],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  } finally {
    await session.detach();
  }
  await expect(activeDay(page).locator('.card-list[data-reordering="true"]')).toHaveCount(0);
  expect(
    await cards.evaluateAll((elements) => elements.map((e) => e.getAttribute('data-card'))),
  ).toEqual(before);
  await sustainedTouchDrag(page, source, cards.first(), cards.nth(2));
  await expect(cards.nth(2).locator('.card-surface')).toHaveText('first');
});
