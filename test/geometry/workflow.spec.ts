import { test } from '../release-validation/browser-fixture';
import { openApp, reloadApp, openMenuSection } from './openApp';
/** Browser regressions for Phase 2 interactions that unit tests cannot cover. */

import { addDays } from '../../src/lib/date';
import { expect, type Locator, type Page } from '@playwright/test';

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
    await openApp(page);

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
    await openApp(page);

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
    await openApp(page);

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
    await openApp(page);

    const body = activeDay(page).locator('.day-body');
    const initial = await activeDay(page).getAttribute('data-date');
    await expect(body).toHaveAttribute('data-touch-scroll', 'none');
    await expect(body).toHaveCSS('touch-action', 'none');

    await touchSwipe(page, body, { x: 0, y: -360 });

    await expect(activeDay(page)).not.toHaveAttribute('data-date', initial!);
  });

  test('a long day reserves only directions with native scroll room', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await openApp(page);
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
    await openApp(page);
    const initial = await activeDay(page).getAttribute('data-date');

    await page.keyboard.press('Alt+ArrowDown');
    await page.keyboard.press('t');
    await page.waitForTimeout(300);

    await expect(activeDay(page)).toHaveAttribute('data-date', initial!);
  });

  test('an install prompt is exposed in the menu', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openApp(page);
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

    await openMenuSection(page, 'Install');
    const install = page.getByRole('button', { name: 'Install', exact: true });
    await expect(install).toBeVisible();
    await install.click();
    await expect(page.locator('html')).toHaveAttribute('data-install-prompted', 'true');
  });

  test('merging a card keeps focus at the join point', async ({ page }) => {
    await openApp(page);
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

  test('safety-deferred cards remain visible after the compaction threshold', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-01T12:00:00Z') });
    await openApp(page);
    const compose = activeDay(page).getByRole('textbox', { name: 'What got done?' });
    await compose.fill('kept after compaction');
    await compose.press('Enter');
    await expect(activeDay(page).getByText('kept after compaction')).toBeVisible();

    await page.clock.setFixedTime(new Date('2026-08-08T12:00:00Z'));
    await reloadApp(page);
    await expect(activeDay(page)).toHaveAttribute('data-date', '2026-08-08');
    await page.clock.fastForward(4_100);

    await openMenu(page);
    await page.getByLabel('Go to date', { exact: true }).fill('2026-08-01');
    await expect(activeDay(page)).toHaveAttribute('data-date', '2026-08-01');
    await expect(activeDay(page).getByText('kept after compaction')).toBeVisible();
    await expect(activeDay(page).locator('.card[data-frozen="true"]')).toHaveCount(1);
    await expect(activeDay(page).getByRole('textbox', { name: 'What got done?' })).toHaveCount(0);
    await expect(activeDay(page).getByRole('textbox', { name: 'What’s scheduled?' })).toHaveCount(
      0,
    );
  });

  test('the device name is editable, since it is what the other device sees', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await openApp(page);
    await openMenu(page);

    await openMenuSection(page, 'Account');
    await page.getByRole('textbox', { name: 'Device name' }).fill('Kitchen laptop');
    await openMenuSection(page, 'Account');
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page.getByText('Preferences saved.')).toBeVisible();
    await page.waitForTimeout(100);
    await reloadApp(page);
    await openMenu(page);
    await openMenuSection(page, 'Account');
    await expect(page.getByRole('textbox', { name: 'Device name' })).toHaveValue('Kitchen laptop');
  });

  test('actor and rollover settings are editable and persist locally', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await openApp(page);
    await openMenu(page);

    await openMenuSection(page, 'Account');
    await page.getByRole('textbox', { name: 'Actor name' }).fill('Phase Two Tester');
    await openMenuSection(page, 'Account');
    await page.getByRole('combobox', { name: 'Day rollover hour' }).selectOption('4');
    await openMenuSection(page, 'Account');
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page.getByText('Preferences saved.')).toBeVisible();
    await expect(page.getByText('Phase Two Tester', { exact: true })).toBeVisible();

    await page.waitForTimeout(100);
    await reloadApp(page);
    await openMenu(page);
    await openMenuSection(page, 'Account');
    await expect(page.getByRole('textbox', { name: 'Actor name' })).toHaveValue('Phase Two Tester');
    await expect(page.getByRole('combobox', { name: 'Day rollover hour' })).toHaveValue('4');
  });
});

for (const width of [420, 1280]) {
  test(`sidebar native date navigation at ${width}px keeps only Yesterday Today Tomorrow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await openApp(page);
    const today = (await activeDay(page).getAttribute('data-date'))!;
    await openMenu(page);
    const nav = page.getByRole('navigation', { name: 'Day', exact: true });
    await expect(nav.getByRole('button')).toHaveText(['Yesterday', 'Today', 'Tomorrow']);
    const picker = nav.getByLabel('Go to date', { exact: true });
    await expect(picker).toHaveAttribute('type', 'date');
    await expect(picker).toHaveValue(today);
    await picker.fill(addDays(today, 10));
    await expect(activeDay(page)).toHaveAttribute('data-date', addDays(today, 10));
    await openMenu(page);
    await expect(picker).toHaveValue(addDays(today, 10));
    await nav.getByRole('button', { name: 'Yesterday', exact: true }).click();
    await expect(activeDay(page)).toHaveAttribute('data-date', addDays(today, -1));
    await openMenu(page);
    await nav.getByRole('button', { name: 'Tomorrow', exact: true }).click();
    await expect(activeDay(page)).toHaveAttribute('data-date', addDays(today, 1));
    await openMenu(page);
    await nav.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(activeDay(page)).toHaveAttribute('data-date', today);
  });
}

for (const width of [420, 1280]) {
  test(`sidebar sections start collapsed and retain preferences at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await openApp(page);
    await openMenu(page);
    const menu = page.locator('#menu');
    const sections = menu.locator('details.menu-disclosure');
    await expect(sections).toHaveCount(4);
    await expect(sections.locator('summary')).toHaveText(['Account', 'Sync', 'Data', 'Install']);
    for (const section of await sections.all()) await expect(section).not.toHaveAttribute('open');
    await expect(menu.getByLabel('Device name', { exact: true })).toBeHidden();
    const account = sections.filter({
      has: page.getByRole('heading', { name: 'Account', exact: true }),
    });
    await account.locator('summary').focus();
    await account.locator('summary').press('Enter');
    await expect(
      account.getByRole('button', { name: 'Add an unlock code', exact: true }),
    ).toBeVisible();
    await expect(
      account.getByRole('button', { name: 'Use another account', exact: true }),
    ).toBeVisible();
    await expect(
      account.getByRole('button', { name: 'Remove from this device', exact: true }),
    ).toBeVisible();
    await expect(account.getByRole('button', { name: 'Export markdown', exact: true })).toHaveCount(
      0,
    );
    await account.getByLabel('Device name', { exact: true }).fill('UX test device');
    await account.getByRole('button', { name: 'Save preferences', exact: true }).click();
    await expect(account.getByRole('status')).toContainText('Preferences saved.');
    await account.locator('summary').click();
    await expect(account.getByLabel('Device name', { exact: true })).toBeHidden();
    await account.locator('summary').click();
    await expect(account.getByLabel('Device name', { exact: true })).toHaveValue('UX test device');
    await page.screenshot({ path: info.outputPath(`sidebar-${width}.png`) });
    await reloadApp(page);
    await openMenu(page);
    for (const section of await sections.all()) await expect(section).not.toHaveAttribute('open');
    await account.locator('summary').click();
    await expect(account.getByLabel('Device name', { exact: true })).toHaveValue('UX test device');
    const data = sections.filter({ has: page.getByRole('heading', { name: 'Data', exact: true }) });
    await data.locator('summary').click();
    await expect(data.getByRole('button', { name: 'Export markdown', exact: true })).toBeVisible();
    await expect(data.getByRole('button', { name: 'Lock workspace', exact: true })).toHaveCount(0);
  });
}
