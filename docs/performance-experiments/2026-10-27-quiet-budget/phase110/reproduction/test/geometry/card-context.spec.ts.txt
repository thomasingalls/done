import { expect, type Page } from '@playwright/test';
import type { EditorView } from '@codemirror/view';
import { test } from '../release-validation/browser-fixture';
import { openApp, openMenuSection, reloadApp } from './openApp';
const DOCUMENT =
  'Loose note\n# Work\n### Launch\n- Call Leila\n- Write draft\n# Home\n## Kitchen\n- Measure doors';
const editor = (page: Page) => page.locator('.goals .cm-content');
const cards = (page: Page, section = 'scheduled') =>
  page.locator(`.day-panel[data-active="true"] .card[data-section="${section}"]`);
const toggle = (page: Page) =>
  page.getByRole('checkbox', { name: 'Goals breadcrumbs on cards', exact: true });
const sourceText = (page: Page) =>
  editor(page).evaluate((element) =>
    (
      element as HTMLElement & { cmTile: { root: { view: EditorView } } }
    ).cmTile.root.view.state.doc.toString(),
  );
const seed = async (page: Page, text = DOCUMENT) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page);
  await editor(page).click();
  await page.keyboard.insertText(text);
  await expect.poll(() => sourceText(page)).toBe(text);
};
const select = async (page: Page, line: string) =>
  editor(page).evaluate((element, line) => {
    const view = (element as HTMLElement & { cmTile: { root: { view: EditorView } } }).cmTile.root
      .view;
    const at = view.state.doc.toString().indexOf(line);
    if (at < 0) throw Error('Missing sample line');
    view.dispatch({ selection: { anchor: at } });
    view.focus();
  }, line);
const transfer = async (page: Page, line: string, section = 'scheduled', move = false) => {
  await select(page, line);
  await page
    .locator('.goals')
    .getByRole('radio', { name: move ? 'Move to' : 'Copy to', exact: true })
    .check();
  await page
    .locator('.goals-destinations')
    .getByRole('button', { name: section[0]!.toUpperCase() + section.slice(1), exact: true })
    .click();
};

test('Goals paths are added in every section without changing card text or tagging direct entry', async ({
  page,
}) => {
  await seed(page);
  await transfer(page, '- Call Leila', 'next');
  await transfer(page, '- Write draft', 'done');
  await transfer(page, '- Measure doors');
  await expect(cards(page, 'next').locator('.card-goals-context')).toHaveText('Work › Launch');
  await expect(cards(page, 'done').locator('.card-goals-context')).toHaveText('Work › Launch');
  await expect(cards(page).locator('.card-goals-context')).toHaveText('Home › Kitchen');
  await expect(cards(page, 'next').locator('.card-surface')).toHaveText('Call Leila');
  await expect(cards(page, 'done')).toHaveAttribute('data-guarded', 'true');
  const entry = page
    .locator('.day-panel[data-active="true"]')
    .getByRole('textbox', { name: 'What’s scheduled?' });
  await entry.fill('Call Leila');
  await entry.press('Enter');
  await expect(entry).toHaveValue('');
  await expect(cards(page).nth(1).locator('.card-goals-context')).toHaveCount(0);
  expect(await sourceText(page)).toBe(DOCUMENT);
  await reloadApp(page);
  await expect(cards(page, 'next').locator('.card-goals-context')).toHaveText('Work › Launch');
  await expect(cards(page).first().locator('.card-goals-context')).toHaveText('Home › Kitchen');
});

test('the default-on switch hides existing cards, survives reopen and keeps capturing while hidden', async ({
  page,
}) => {
  await seed(page);
  await transfer(page, '- Call Leila');
  await openMenuSection(page, 'Account');
  await expect(toggle(page)).toBeChecked();
  await toggle(page).uncheck();
  await expect(page.locator('.card-goals-context')).toHaveCount(0);
  await reloadApp(page);
  await openMenuSection(page, 'Account');
  await expect(toggle(page)).not.toBeChecked();
  await transfer(page, '- Measure doors');
  await expect(cards(page)).toHaveCount(2);
  await expect(page.locator('.card-goals-context')).toHaveCount(0);
  await toggle(page).check();
  await expect(cards(page).locator('.card-goals-context')).toHaveText([
    'Work › Launch',
    'Home › Kitchen',
  ]);
  await expect(page.getByRole('checkbox', { name: 'Gentle context', exact: true })).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('done.ui.card-goals-context'))).toBe('1');
  expect(await page.evaluate(() => JSON.stringify(localStorage).includes('Kitchen'))).toBe(false);
});

test('card display follows another tab independently from gentle context and writing', async ({
  page,
  context,
}) => {
  await seed(page);
  await transfer(page, '- Call Leila');
  const before = await sourceText(page);
  const second = await context.newPage();
  await openApp(second);
  await openMenuSection(second, 'Account');
  await toggle(second).uncheck();
  await expect(page.locator('.card-goals-context')).toHaveCount(0);
  await openMenuSection(page, 'Account');
  await expect(toggle(page)).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Gentle context', exact: true })).toBeChecked();
  await toggle(page).check();
  await expect(toggle(second)).toBeChecked();
  await expect(cards(page).locator('.card-goals-context')).toHaveText('Work › Launch');
  expect(await sourceText(page)).toBe(before);
  await second.close();
});

test('Move and Duplicate keep a historical snapshot across source edits, undo and cold reopen', async ({
  page,
}) => {
  await seed(page);
  await transfer(page, '- Measure doors', 'scheduled', true);
  await expect.poll(() => sourceText(page)).not.toContain('- Measure doors');
  const source = cards(page).first();
  await expect(source.locator('.card-goals-context')).toHaveText('Home › Kitchen');
  await source
    .getByRole('button', { name: 'Duplicate to Scheduled: Measure doors', exact: true })
    .click();
  await expect(cards(page)).toHaveCount(2);
  await select(page, 'Kitchen');
  await editor(page).evaluate((element) => {
    const view = (element as HTMLElement & { cmTile: { root: { view: EditorView } } }).cmTile.root
      .view;
    const at = view.state.doc.toString().indexOf('Kitchen');
    view.dispatch({ selection: { anchor: at, head: at + 7 } });
    view.focus();
  });
  await page.keyboard.insertText('Renamed');
  await expect.poll(() => sourceText(page)).toContain('Renamed');
  await expect(cards(page).locator('.card-goals-context')).toHaveText([
    'Home › Kitchen',
    'Home › Kitchen',
  ]);
  await openMenuSection(page, 'Data');
  await page.locator('#menu').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => sourceText(page)).toContain('Kitchen');
  await page.locator('#menu').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(cards(page)).toHaveCount(1);
  await page.locator('#menu').getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(cards(page)).toHaveCount(2);
  await reloadApp(page);
  await expect(cards(page).locator('.card-goals-context')).toHaveText([
    'Home › Kitchen',
    'Home › Kitchen',
  ]);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`narrow ${scheme} context wraps literal headings without restyling card text`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const heading = '<b>' + 'VeryLongHeading'.repeat(18) + '</b>';
    await seed(page, `# ${heading}\n- sample task`);
    await transfer(page, '- sample task');
    const card = cards(page).first();
    const path = card.locator('.card-goals-context');
    await expect(path).toHaveText(heading);
    await expect(path.locator('b')).toHaveCount(0);
    await page.setViewportSize({ width: 360, height: 900 });
    await expect(card).toBeInViewport();
    expect(
      await card.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    const properties = () =>
      card.locator('.card-surface').evaluate((element) => {
        const css = getComputedStyle(element);
        return [
          css.fontFamily,
          css.fontSize,
          css.lineHeight,
          css.padding,
          element.getBoundingClientRect().height,
        ];
      });
    const before = await properties();
    await openMenuSection(page, 'Account');
    await toggle(page).uncheck();
    await expect(path).toHaveCount(0);
    expect(await properties()).toEqual(before);
  });
}

test('refused preference saving leaves the visit usable and the card metadata intact', async ({
  page,
}) => {
  await seed(page);
  await transfer(page, '- Call Leila');
  await openMenuSection(page, 'Account');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'done.ui.card-goals-context') throw Error('blocked');
      return original.call(this, key, value);
    };
  });
  await toggle(page).uncheck();
  await expect(page.locator('.card-goals-context')).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'Browser preferences could not be saved' }),
  ).toBeVisible();
  await toggle(page).check();
  await expect(cards(page).locator('.card-goals-context')).toHaveText('Work › Launch');
});

test('an external display change preserves the active card editor, caret and composition', async ({
  page,
  context,
}) => {
  await seed(page);
  await transfer(page, '- Call Leila');
  const second = await context.newPage();
  await openApp(second);
  const card = cards(page).first();
  await card.locator('.card-surface').click();
  const content = card.locator('.cm-content');
  const before = await content.evaluate((element) => {
    const view = (element as HTMLElement & { cmTile: { root: { view: EditorView } } }).cmTile.root
      .view;
    view.dispatch({ selection: { anchor: 4 } });
    view.focus();
    Reflect.set(window, 'cardContextEditor', view);
    view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    return view.state.selection.toJSON();
  });
  // Actual cross-tab storage notification, without a pointer action blurring the
  // editor under observation. The ordinary checkbox's visit/storage behavior is
  // covered above.
  await second.evaluate(() => localStorage.setItem('done.ui.card-goals-context', '0'));
  await expect(page.locator('.card-goals-context')).toHaveCount(0);
  await expect(card).toHaveAttribute('data-editing', 'true');
  expect(
    await content.evaluate((element) => {
      const view = (element as HTMLElement & { cmTile: { root: { view: EditorView } } }).cmTile.root
        .view;
      return {
        same: view === Reflect.get(window, 'cardContextEditor'),
        selection: view.state.selection.toJSON(),
      };
    }),
  ).toEqual({ same: true, selection: before });
  await content.evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'X' })),
  );
  await expect
    .poll(() =>
      content.evaluate((element) =>
        (
          element as HTMLElement & { cmTile: { root: { view: EditorView } } }
        ).cmTile.root.view.state.doc.toString(),
      ),
    )
    .toBe('CallX Leila');
  await openMenuSection(page, 'Data');
  await page.locator('#menu').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(card.locator('.card-surface')).toHaveText('Call Leila');
  await second.close();
});
