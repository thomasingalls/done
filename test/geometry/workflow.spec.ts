/** Browser regressions for Phase 2 interactions that unit tests cannot cover. */

import { expect, test, type Locator, type Page } from '@playwright/test';

const activeDay = (page: Page) => page.locator('.day-panel[data-active="true"]');

const openMenu = async (page: Page): Promise<void> => {
  const trigger = page.locator('.menu-trigger');
  if (await trigger.isVisible()) await trigger.click();
  await expect(page.locator('.menu')).toBeVisible();
};

/** A real Chromium touch sequence, so `touch-action` and `pointercancel` participate. */
const touchSwipe = async (
  page: Page,
  target: Locator,
  movement: { x: number; y: number },
): Promise<void> => {
  const box = await target.boundingBox();
  if (!box) throw new Error('Swipe target is not visible');

  const session = await page.context().newCDPSession(page);
  const start = { x: box.x + box.width / 2, y: box.y + box.height * 0.72 };
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...start, id: 71 }],
  });
  for (let step = 1; step <= 8; step++) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: start.x + (movement.x * step) / 8,
          y: start.y + (movement.y * step) / 8,
          id: 71,
        },
      ],
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
};

test.describe('Phase 2 workflow', () => {
  test('touch gestures bind after the asynchronous store opens', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto('/');

    const shell = page.locator('.shell');
    await expect(shell).toHaveAttribute('data-select', 'on');

    await shell.evaluate((element) => {
      const pointer = (type: string, x: number): void => {
        element.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: 300,
            isPrimary: true,
            pointerId: 41,
            pointerType: 'touch',
          }),
        );
      };
      pointer('pointerdown', 80);
      pointer('pointermove', 300);
      pointer('pointerup', 300);
    });

    await expect(shell).toHaveAttribute('data-menu', 'open');
  });

  test('a canceled touch drag snaps back instead of remaining in progress', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto('/');

    const shell = page.locator('.shell');
    await shell.evaluate((element) => {
      const pointer = (type: string, x: number): void => {
        element.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: 300,
            isPrimary: true,
            pointerId: 42,
            pointerType: 'touch',
          }),
        );
      };
      pointer('pointerdown', 300);
      pointer('pointermove', 100);
      pointer('pointercancel', 100);
    });

    await expect(shell).toHaveAttribute('data-goals', 'closed');
  });

  test('Goals swipes own the editor surface and restore its caret after reopening', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto('/');

    const shell = page.locator('.shell');
    const compose = activeDay(page).getByRole('textbox', { name: 'What got done?' });

    // Begin over a live text input: movement still belongs to spatial navigation.
    await touchSwipe(page, compose, { x: -220, y: 0 });
    await expect(shell).toHaveAttribute('data-goals', 'open');

    const editor = page.locator('.goals .cm-content');
    await expect(page.locator('.goals .cm-scroller')).toHaveCSS('touch-action', 'pan-y');
    await expect(editor).not.toBeFocused();
    await expect(editor).toBeFocused();

    await page.keyboard.insertText('abcd');
    await editor.press('ArrowLeft');
    await editor.press('ArrowLeft');

    // The editor is the large hit target that previously triggered pointercancel.
    await touchSwipe(page, editor, { x: 220, y: 0 });
    await expect(shell).toHaveAttribute('data-goals', 'closed');
    await expect(editor).not.toBeFocused();

    // Let the close snap expose Today before starting the next real touch.
    await page.waitForTimeout(250);
    await touchSwipe(page, compose, { x: -220, y: 0 });
    await expect(shell).toHaveAttribute('data-goals', 'open');
    await expect(editor).toBeFocused();

    await page.keyboard.insertText('X');
    await expect(editor).toContainText('abXcd');
  });

  test('a vertical swipe from the day body navigates instead of being cancelled', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto('/');

    const body = activeDay(page).locator('.day-body');
    const initial = await activeDay(page).getAttribute('data-date');
    await expect(body).toHaveAttribute('data-touch-scroll', 'none');
    await expect(body).toHaveCSS('touch-action', 'none');

    await touchSwipe(page, body, { x: 0, y: -360 });

    await expect(activeDay(page)).not.toHaveAttribute('data-date', initial!);
  });

  test('a long day reserves only directions with native scroll room', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto('/');
    const body = activeDay(page).locator('.day-body');
    // One tall card is enough to make the body scroll, and `insertText` puts the
    // newlines in directly — Enter in the compose field would submit each line.
    const compose = activeDay(page).getByRole('textbox', { name: 'What got done?' });
    await compose.click();
    await page.keyboard.insertText(
      Array.from({ length: 100 }, (_, index) => `line ${index + 1}`).join('\n'),
    );
    await compose.press('Enter');

    await body.evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect(body).toHaveAttribute('data-touch-scroll', 'top');
    await expect(body).toHaveCSS('touch-action', 'pan-down');
    const date = await activeDay(page).getAttribute('data-date');
    await touchSwipe(page, body, { x: 0, y: -240 });
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(activeDay(page)).toHaveAttribute('data-date', date!);

    await body.evaluate((element) => {
      element.scrollTop = (element.scrollHeight - element.clientHeight) / 2;
    });
    await expect(body).toHaveAttribute('data-touch-scroll', 'middle');
    await expect(body).toHaveCSS('touch-action', 'pan-y');

    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(body).toHaveAttribute('data-touch-scroll', 'bottom');
    await expect(body).toHaveCSS('touch-action', 'pan-up');
  });

  test('direct navigation cancels an unfinished day transition', async ({ page }) => {
    await page.goto('/');
    const initial = await activeDay(page).getAttribute('data-date');

    await page.keyboard.press('Alt+ArrowDown');
    await page.keyboard.press('t');
    await page.waitForTimeout(300);

    await expect(activeDay(page)).toHaveAttribute('data-date', initial!);
  });

  test('an install prompt is exposed in the menu', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(event, {
        prompt: async () => {
          document.documentElement.dataset['installPrompted'] = 'true';
        },
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(event);
    });

    const install = page.getByRole('button', { name: 'Install app' });
    await expect(install).toBeVisible();
    await install.click();
    await expect(page.locator('html')).toHaveAttribute('data-install-prompted', 'true');
  });

  test('merging a card keeps focus at the join point', async ({ page }) => {
    await page.goto('/');
    const day = activeDay(page);
    const compose = day.getByRole('textbox', { name: 'What got done?' });

    // Done reads newest-first, so composing in reverse puts them on screen in
    // the order the merge below reads: `first` above `second`.
    await compose.fill('second');
    await compose.press('Enter');
    await compose.fill('first');
    await compose.press('Enter');

    const cards = day.locator('.card[data-section="done"]');
    await expect(cards).toHaveCount(2);
    await cards.nth(1).getByRole('button', { name: 'Unlock' }).click();
    const editor = cards.nth(1).locator('.cm-content');
    await expect(editor).toBeFocused();
    await editor.press('Home');
    await editor.press('Backspace');

    await expect(cards).toHaveCount(1);
    const merged = cards.first().locator('.cm-content');
    await expect(merged).toBeFocused();
    await page.keyboard.insertText('|');
    await expect(merged).toContainText('first|second');
  });

  test('compacted cards remain visible as a frozen archive', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-01T12:00:00Z') });
    await page.goto('/');
    const compose = activeDay(page).getByRole('textbox', { name: 'What got done?' });
    await compose.fill('kept after compaction');
    await compose.press('Enter');
    await expect(activeDay(page).getByText('kept after compaction')).toBeVisible();

    await page.clock.setFixedTime(new Date('2026-08-08T12:00:00Z'));
    await page.reload();
    await expect(activeDay(page)).toHaveAttribute('data-date', '2026-08-08');
    await page.clock.fastForward(4_100);

    await openMenu(page);
    await page.locator('.menu-day').first().click();
    await expect(activeDay(page)).toHaveAttribute('data-date', '2026-08-01');
    await expect(activeDay(page).getByText('kept after compaction')).toBeVisible();
    await expect(activeDay(page).locator('.card[data-frozen="true"]')).toHaveCount(1);
    await expect(activeDay(page).getByRole('textbox', { name: 'What got done?' })).toHaveCount(0);
  });

  test('the device name is editable, since it is what the other device sees', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto('/');
    await openMenu(page);

    await page.getByRole('textbox', { name: 'Device name' }).fill('Kitchen laptop');
    await page.waitForTimeout(100);
    await page.reload();
    await openMenu(page);
    await expect(page.getByRole('textbox', { name: 'Device name' })).toHaveValue('Kitchen laptop');
  });

  test('actor and rollover settings are editable and persist locally', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto('/');
    await openMenu(page);

    await page.getByRole('textbox', { name: 'Actor name' }).fill('Phase Two Tester');
    await page.getByRole('combobox', { name: 'Day rollover hour' }).selectOption('4');
    await expect(page.getByText('Phase Two Tester', { exact: true })).toBeVisible();

    await page.waitForTimeout(100);
    await page.reload();
    await openMenu(page);
    await expect(page.getByRole('textbox', { name: 'Actor name' })).toHaveValue('Phase Two Tester');
    await expect(page.getByRole('combobox', { name: 'Day rollover hour' })).toHaveValue('4');
  });
});
