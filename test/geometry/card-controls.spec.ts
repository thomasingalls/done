import { expect, type Locator, type Page } from '@playwright/test';
import type { EditorView } from '@codemirror/view';
import { test } from '../release-validation/browser-fixture';
import { openApp } from './openApp';

const day = (page: Page) => page.locator('.day-panel[data-active="true"]');
const cards = (page: Page, section: string) =>
  day(page).locator(`.card[data-section="${section}"]`);
const add = async (page: Page, text: string, section = 'scheduled') => {
  const field = day(page).getByRole('textbox', {
    name: section === 'done' ? 'What got done?' : 'What’s scheduled?',
  });
  await field.fill(text);
  await field.press('Enter');
  await expect(field).toHaveValue('');
  const card = cards(page, section).filter({ hasText: text });
  await expect(card).toHaveCount(1);
  return card;
};
const box = async (element: Locator) => {
  const rect = await element.boundingBox();
  if (!rect) throw Error('Missing card control geometry');
  return rect;
};
const alignment = (card: Locator) =>
  card.evaluate((element) => {
    const origin = element.getBoundingClientRect();
    const inkLeft = (node: Element) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect().left - origin.left;
    };
    const line = element.querySelector('.card-surface .md-line, .card-surface .cm-line')!;
    const button = element.querySelector('.card-actions button:not(.card-reorder-handle)')!;
    const surface = element.querySelector('.card-surface')!.getBoundingClientRect();
    const slot = element
      .querySelector('.card-reorder-slot, .card-reorder-handle')
      ?.getBoundingClientRect();
    const context = element.querySelector('.card-goals-context');
    return {
      text: inkLeft(line),
      action: inkLeft(button),
      context: context ? inkLeft(context) : null,
      surfaceWidth: surface.width,
      slotWidth: slot?.width ?? 0,
      slotEnd: slot ? origin.right - slot.right : 0,
    };
  });

test('Next offers Done, Later and Done for now, with no Remove or Duplicate', async ({ page }) => {
  await openApp(page);
  const source = await add(page, 'Continue this');
  await source.getByRole('button', { name: 'Move to Next: Continue this', exact: true }).click();
  const next = cards(page, 'next');
  await expect(next.getByRole('button', { name: /^Remove this card:/ })).toHaveCount(0);
  await expect(next.getByRole('button', { name: /^Duplicate to Scheduled:/ })).toHaveCount(0);
  await expect(
    next.getByRole('button', { name: 'Move to Done: Continue this', exact: true }),
  ).toBeVisible();
  await expect(
    next.getByRole('button', { name: 'Move to Scheduled: Continue this', exact: true }),
  ).toBeVisible();
  await expect(
    next.getByRole('button', { name: 'Done for now: Continue this', exact: true }),
  ).toBeVisible();
});

test('Done toggles Unlock and Lock in place, hides locked actions and disables the retained grip', async ({
  page,
}, testInfo) => {
  await openApp(page);
  await add(page, 'Earlier', 'done');
  const card = await add(page, 'Finished', 'done');
  const ids = await cards(page, 'done').evaluateAll((elements) =>
    elements.map((e) => e.getAttribute('data-card')),
  );
  const toggle = card.getByRole('button', { name: /^(Unlock|Lock)$/ });
  const grip = card.getByRole('button', { name: 'Reorder Finished', exact: true });
  await expect(card.locator('.card-actions button:not(.card-reorder-handle)')).toHaveText([
    'Unlock',
  ]);
  await expect(grip).toBeVisible();
  await expect(grip).toBeEnabled();
  const locked = await box(toggle);
  const initialAlignment = await alignment(card);
  expect(Math.abs(initialAlignment.text - initialAlignment.action)).toBeLessThanOrEqual(1);
  await card.screenshot({ path: testInfo.outputPath('done-locked.png') });
  await toggle.click();
  await expect(toggle).toHaveText('Lock');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(card.locator('.cm-content')).toBeFocused();
  expect(await box(toggle)).toEqual(locked);
  const unlockedAlignment = await alignment(card);
  expect(Math.abs(unlockedAlignment.text - unlockedAlignment.action)).toBeLessThanOrEqual(1);
  await expect(card.locator('.card-actions button:not(.card-reorder-handle)')).toHaveText([
    'Lock',
    'Next',
    'Later',
    'Duplicate',
    'Remove',
  ]);
  await expect(grip).toBeVisible();
  await expect(grip).toBeDisabled();
  await grip.dispatchEvent('keydown', { key: 'ArrowDown', bubbles: true });
  expect(
    await cards(page, 'done').evaluateAll((elements) =>
      elements.map((e) => e.getAttribute('data-card')),
    ),
  ).toEqual(ids);
  await card.screenshot({ path: testInfo.outputPath('done-unlocked.png') });
  // The same coordinate still hits Lock, without searching for the new label.
  await page.mouse.click(locked.x + locked.width / 2, locked.y + locked.height / 2);
  await expect(toggle).toHaveText('Unlock');
  await expect(card.locator('.cm-content')).toHaveCount(0);
  await expect(card.locator('.card-actions button:not(.card-reorder-handle)')).toHaveText([
    'Unlock',
  ]);
  await expect(grip).toBeEnabled();
  expect(await box(toggle)).toEqual(locked);
  await toggle.click();
  await day(page).getByRole('textbox', { name: 'What got done?' }).click();
  await expect(toggle).toHaveText('Unlock');
  await expect(grip).toBeEnabled();
  expect(
    await cards(page, 'done').evaluateAll((elements) =>
      elements.map((e) => e.getAttribute('data-card')),
    ),
  ).toEqual(ids);
});

test('card text and action labels keep their inset as the grip appears, disables and disappears', async ({
  page,
}) => {
  await openApp(page);
  const original = await add(page, 'Alpha');
  const id = await original.getAttribute('data-card');
  const card = day(page).locator(`.card[data-card="${id}"]`);
  await expect(card.locator('.card-reorder-handle')).toHaveCount(0);
  const before = await alignment(card);
  expect(Math.abs(before.text - before.action)).toBeLessThanOrEqual(1);
  const other = await add(page, 'Beta');
  await expect(card.locator('.card-reorder-handle')).toBeEnabled();
  expect(await alignment(card)).toEqual(before);
  await card.locator('.card-surface').click();
  await expect(card.locator('.card-reorder-handle')).toBeDisabled();
  expect(await alignment(card)).toEqual(before);
  await card.locator('.cm-content').press('Enter');
  await expect(card.locator('.card-reorder-handle')).toBeEnabled();
  await other.getByRole('button', { name: 'Remove this card: Beta', exact: true }).click();
  await expect(card.locator('.card-reorder-handle')).toHaveCount(0);
  expect(await alignment(card)).toEqual(before);
});

test('heading breadcrumbs share the text and action inset, including on a narrow card', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page);
  const editor = page.locator('.goals .cm-content');
  const text = '# Project\n## Area\nSample task';
  await editor.click();
  await page.keyboard.insertText(text);
  await expect
    .poll(() =>
      editor.evaluate((element) =>
        (
          element as HTMLElement & { cmTile: { root: { view: EditorView } } }
        ).cmTile.root.view.state.doc.toString(),
      ),
    )
    .toBe(text);
  await page
    .locator('.goals-destinations')
    .getByRole('button', { name: 'Scheduled', exact: true })
    .click();
  const card = cards(page, 'scheduled').first();
  await expect(card.locator('.card-goals-context')).toHaveText('Project › Area');
  await page.setViewportSize({ width: 360, height: 900 });
  await expect(card).toBeInViewport();
  const positions = await alignment(card);
  expect(Math.abs(positions.text - positions.action)).toBeLessThanOrEqual(1);
  expect(Math.abs(positions.text - positions.context!)).toBeLessThanOrEqual(1);
  expect(
    await card.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1);
});
