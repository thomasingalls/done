import { expect, type Page } from '@playwright/test';
import { test } from '../release-validation/browser-fixture';
import { openApp, reloadApp } from './openApp';

const day = (page: Page) => page.locator('.day-panel[data-active="true"]');
const cards = (page: Page, section: string) =>
  day(page).locator(`.card[data-section="${section}"]`);
const add = async (page: Page, text: string, section = 'scheduled') => {
  const field = day(page).getByRole('textbox', {
    name: section === 'done' ? 'What got done?' : 'What’s scheduled?',
  });
  await field.fill(text);
  await field.press('Enter');
  await expect(cards(page, section).filter({ hasText: text })).toBeVisible();
};

test('Scheduled quick entry accepts multiline tasks on the selected day and persists them', async ({
  page,
}) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await openApp(page);
  await page.locator('.day-peek[data-edge="bottom"]').click();
  const date = await day(page).getAttribute('data-date');
  const field = day(page).getByRole('textbox', { name: 'What’s scheduled?' });
  await field.fill('Call the dentist');
  await field.press('Shift+Enter');
  await field.press('End');
  await field.type('Ask about Tuesday');
  await day(page)
    .locator('.collection[data-section="scheduled"]')
    .getByRole('button', { name: 'Add', exact: true })
    .click();
  await expect(cards(page, 'scheduled')).toHaveCount(1);
  await expect(cards(page, 'scheduled')).toContainText('Ask about Tuesday');
  await expect(field).toHaveValue('');
  await reloadApp(page);
  // Startup returns to today; navigate back to the day the task was entered on.
  if ((await day(page).getAttribute('data-date')) !== date)
    await page.locator('.day-peek[data-edge="bottom"]').click();
  await expect(day(page)).toHaveAttribute('data-date', date!);
  await expect(cards(page, 'scheduled')).toContainText('Call the dentist');
  await expect(cards(page, 'scheduled')).toContainText('Ask about Tuesday');
});

test('Done moves require unlock, remain reachable by keyboard, and respect the Next cap', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page);
  for (const text of ['one', 'two', 'three']) {
    await add(page, text);
    await cards(page, 'scheduled')
      .filter({ hasText: text })
      .getByRole('button', { name: `Move to Next: ${text}`, exact: true })
      .click();
  }
  await add(page, 'done by mistake', 'done');
  const done = cards(page, 'done').filter({ hasText: 'done by mistake' });
  await expect(
    done.getByRole('button', { name: 'Move to Next: done by mistake', exact: true }),
  ).toHaveCount(0);
  await done.getByRole('button', { name: 'Unlock', exact: true }).click();
  await day(page).getByRole('textbox', { name: 'What got done?' }).focus();
  await expect(
    done.getByRole('button', { name: 'Move to Scheduled: done by mistake', exact: true }),
  ).toHaveCount(0);
  await done.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(
    done.getByRole('button', { name: 'Move to Next: done by mistake', exact: true }),
  ).toBeDisabled();
  const later = done.getByRole('button', {
    name: 'Move to Scheduled: done by mistake',
    exact: true,
  });
  await later.focus();
  await later.press('Enter');
  await expect(cards(page, 'done')).toHaveCount(0);
  await expect(cards(page, 'scheduled')).toContainText('done by mistake');

  await cards(page, 'next')
    .filter({ hasText: 'one' })
    .getByRole('button', { name: 'Move to Done: one', exact: true })
    .click();
  const reopened = cards(page, 'done').filter({ hasText: 'one' });
  await reopened.getByRole('button', { name: 'Unlock', exact: true }).click();
  await reopened.getByRole('button', { name: 'Move to Next: one', exact: true }).click();
  await expect(cards(page, 'next')).toHaveCount(3);
  await expect(cards(page, 'done')).toHaveCount(0);
});

for (const section of ['next', 'scheduled']) {
  test(`${section} keyboard reorder is undoable and survives reload`, async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      'Keyboard grips are exercised on desktop; mobile uses the touch drag tests.',
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await openApp(page);
    for (const text of ['first', 'second', 'third']) {
      await add(page, text);
      if (section === 'next')
        await cards(page, 'scheduled')
          .filter({ hasText: text })
          .getByRole('button', { name: `Move to Next: ${text}`, exact: true })
          .click();
    }
    await cards(page, section)
      .first()
      .getByRole('button', { name: 'Reorder first', exact: true })
      .press('ArrowDown');
    await expect(cards(page, section).nth(0)).toContainText('second');
    await expect(cards(page, section).nth(1)).toContainText('first');
    await page.locator('#menu').getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(cards(page, section).nth(0)).toContainText('first');
    await page.locator('#menu').getByRole('button', { name: 'Redo', exact: true }).click();
    await reloadApp(page);
    await expect(cards(page, section).nth(0)).toContainText('second');
    await expect(cards(page, section).nth(1)).toContainText('first');
  });
}
