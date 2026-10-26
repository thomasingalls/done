import { devices, expect, type Page } from '@playwright/test';
import { test } from '../release-validation/browser-fixture';
import { openApp, reloadApp } from './openApp';

const scheduled = (page: Page) =>
  page.locator('.day-panel[data-active="true"] .card[data-section="scheduled"]');
const field = (page: Page) =>
  page.locator('.day-panel[data-active="true"]').getByRole('textbox', {
    name: 'What’s scheduled?',
  });

// Use Mac hardware bindings in both layouts, independently of Android's virtual
// keyboard event synthesis. This tests focus ownership, not a physical phone IME.
test.use({
  userAgent: devices['Desktop Chrome'].userAgent.replace(
    /\([^)]*\)/,
    '(Macintosh; Intel Mac OS X 10_15_7)',
  ),
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }),
  );
  await openApp(page);
});

const add = async (page: Page, text: string) => {
  await field(page).fill(text);
  await field(page).press('Enter');
  await expect(field(page)).toHaveValue('');
};

const split = async (page: Page) => {
  await add(page, 'headtail');
  await scheduled(page).first().locator('.card-surface').click();
  const editor = scheduled(page).first().locator('.cm-content');
  await editor.press('Home');
  for (let i = 0; i < 4; i++) await editor.press('ArrowRight');
  for (let i = 0; i < 3; i++) await editor.press('Shift+Enter');
  await expect(scheduled(page)).toHaveCount(2);
  const card = scheduled(page).nth(1);
  await expect(card.locator('.cm-content')).toBeFocused();
  return card;
};

const merge = async (page: Page) => {
  await add(page, 'head');
  await add(page, 'tail');
  await scheduled(page).nth(1).locator('.card-surface').click();
  const editor = scheduled(page).nth(1).locator('.cm-content');
  await editor.press('Home');
  await editor.press('Backspace');
  await expect(scheduled(page)).toHaveCount(1);
  const card = scheduled(page).first();
  await expect(card.locator('.cm-content')).toBeFocused();
  await expect(card.locator('.cm-content')).toHaveText('headtail');
  return card;
};

for (const [name, focus] of [
  ['split', split],
  ['merge', merge],
] as const) {
  test(`${name} focus can leave by clicking another input and stays there while typing`, async ({
    page,
  }) => {
    const card = await focus(page);
    await page.keyboard.insertText('|');
    await field(page).click();
    await expect(card).toHaveAttribute('data-editing', 'false');
    await expect(field(page)).toBeFocused();
    await field(page).pressSequentially('another task');
    await expect(field(page)).toHaveValue('another task');
    await field(page).press('Enter');
    // Match add() above: Enter starts an asynchronous admitted submission.
    // Reopening below tests accepted writing, not interruption of that request.
    await expect(field(page)).toHaveValue('');
    await expect(scheduled(page).filter({ hasText: 'another task' })).toHaveCount(1);
    await expect(card).toHaveAttribute('data-editing', 'false');
    await expect(field(page)).toBeFocused();
    await reloadApp(page);
    await expect(scheduled(page).filter({ hasText: 'another task' })).toHaveCount(1);
    await expect(scheduled(page).filter({ hasText: '|tail' })).toHaveCount(1);
  });

  test(`${name} focus can Tab through its actions and leave the card`, async ({ page }) => {
    const card = await focus(page);
    // Internal action focus must not relock/unmount the card before activation.
    const done = card.getByRole('button', { name: /^Move to Done:/ });
    await done.focus();
    await expect(card).toHaveAttribute('data-editing', 'true');
    await expect(done).toBeFocused();
    const remove = card.getByRole('button', { name: /^Remove this card:/ });
    await remove.focus();
    await remove.press('Tab');
    await expect(card).toHaveAttribute('data-editing', 'false');
    await expect(field(page)).toBeFocused();
    await field(page).press('Shift+Tab');
    await expect(remove).toBeFocused();
    await expect(card).toHaveAttribute('data-editing', 'false');
  });
}
