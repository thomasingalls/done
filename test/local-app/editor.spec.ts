import { test } from '../release-validation/browser-fixture';
import { expect, type Page } from '@playwright/test';
import * as fc from 'fast-check';
import { openApp, reloadApp, protectApp, openMenuSection } from '../geometry/openApp';
import { addDays } from '../../src/lib/date';
import { refuseNativeContent, allowNativeContent } from './native-storage-faults';
const day = (page: Page) => page.locator('.day-panel[data-active="true"]');
const faults = async (page: Page) => {
  await refuseNativeContent(page);
  return page.evaluate(() => {
    const state = { enabled: true, journal: 0, database: 0 };
    Object.assign(window, { editorFaults: state });
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (state.enabled && key.startsWith('done.pending-update.')) {
        state.journal++;
        throw new DOMException('Synthetic quota refusal', 'QuotaExceededError');
      }
      return set.call(this, key, value);
    };
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value, key) {
      const request = add.call(this, value, key);
      if (state.enabled && this.name === 'content') {
        state.database++;
        request.addEventListener('success', () => this.transaction.abort(), { once: true });
      }
      return request;
    };
  });
};
const allowStorage = async (page: Page) => {
  const native = await allowNativeContent(page);
  return page.evaluate((native) => {
    const state = (
      window as unknown as { editorFaults: { enabled: boolean; journal: number; database: number } }
    ).editorFaults;
    state.enabled = false;
    return { journal: state.journal, database: state.database + native };
  }, native);
};

test('compose keeps its draft through native refusal; retry admits it once and reopen retains it', async ({
  page,
}) => {
  await openApp(page);
  await faults(page);
  const compose = day(page).getByRole('textbox', { name: 'What got done?' });
  await compose.fill('Retain this pending draft');
  await compose.press('Enter');
  await expect(page.locator('.workspace-status')).toContainText('Input is waiting for storage.');
  await expect(compose).toHaveValue('Retain this pending draft');
  await expect(day(page).locator('.card')).toHaveCount(0);
  const seen = await allowStorage(page);
  expect(seen.journal).toBeGreaterThan(0);
  expect(seen.database).toBeGreaterThan(0);
  await page.locator('.workspace-status').getByRole('button', { name: 'Retry storage' }).click();
  await expect(day(page).locator('.card')).toHaveCount(1);
  await expect(compose).toHaveValue('');
  await reloadApp(page);
  await expect(day(page).locator('.card')).toHaveText(/Retain this pending draft/);
});

test('discarded editor input never appears, and locking disposes the mounted editor', async ({
  page,
}) => {
  await openApp(page);
  await protectApp(page);
  const content = page.locator('.goals .cm-content');
  await content.click();
  await page.keyboard.insertText('accepted');
  await expect(content).toHaveText('accepted');
  await faults(page);
  await page.keyboard.insertText('refused');
  await expect(page.locator('.workspace-status')).toContainText('Input is waiting for storage.');
  await expect(content).toHaveText('accepted');
  await page
    .locator('.workspace-status')
    .getByRole('button', { name: 'Discard pending input' })
    .click();
  await allowStorage(page);
  await openMenuSection(page, 'Account');
  await page.getByRole('button', { name: 'Lock workspace' }).click();
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  await expect(page.getByText('accepted', { exact: true })).toHaveCount(0);
  await reloadApp(page);
  await expect(page.locator('.goals .cm-content')).toHaveText('accepted');
});

test('Goals copy and separate line removal preserve suffix boundaries and workspace undo', async ({
  page,
}) => {
  await openApp(page);
  const content = page.locator('.goals .cm-content');
  await content.click();
  await page.keyboard.insertText('keep\nremove one\nremove two');
  await expect(content).toHaveText('keepremove oneremove two');
  await content.press('Home');
  await content.press('ArrowUp');
  await content.press('Home');
  await content.press('Shift+ArrowDown');
  await content.press('Shift+End');
  await page.locator('.goals').getByRole('button', { name: 'Next', exact: true }).click();
  await expect(day(page).locator('.collection[data-section="next"] .card')).toHaveCount(2);
  await expect(page.locator('.goals-hint')).toHaveCount(0);
  await expect(content).toHaveText('keepremove oneremove two');
  await page.getByRole('button', { name: 'More Goals actions' }).click();
  await page.getByRole('menuitem', { name: 'Remove selected lines' }).click();
  await expect(content).toHaveText('keep');
  await page.getByRole('button', { name: 'More Goals actions' }).click();
  await page.getByRole('menuitem', { name: 'Undo', exact: true }).click();
  await expect(content).toHaveText('keepremove oneremove two');
  await reloadApp(page);
  await expect(day(page).locator('.collection[data-section="next"] .card')).toHaveCount(2);
  await expect(page.locator('.goals .cm-content')).toHaveText('keepremove oneremove two');
});

test('Goals Move is explicit, resets to Copy, disables a full destination and undoes together', async ({
  page,
}) => {
  await openApp(page);
  const goals = page.locator('.goals');
  const content = goals.locator('.cm-content');
  const nextCards = day(page).locator('.collection[data-section="next"] .card');
  await content.click();
  await page.keyboard.insertText('keep\ntransfer');
  await expect(goals.getByRole('radio', { name: 'Copy to', exact: true })).toBeChecked();
  await expect(page.getByText('Copy keeps the original.')).toHaveCount(0);
  await goals.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(nextCards).toHaveCount(1);
  await expect(content).toHaveText('keeptransfer');
  await goals.getByRole('radio', { name: 'Move to', exact: true }).check();
  await goals.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(content).toHaveText('keep');
  await expect(day(page).locator('.collection[data-section="done"] .card')).toHaveCount(1);
  await expect(goals.getByRole('radio', { name: 'Copy to', exact: true })).toBeChecked();
  await openMenuSection(page, 'Data');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(content).toHaveText('keeptransfer');
  await expect(day(page).locator('.collection[data-section="done"] .card')).toHaveCount(0);
  await goals.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(nextCards).toHaveCount(2);
  await goals.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(nextCards).toHaveCount(3);
  await goals.getByRole('radio', { name: 'Move to', exact: true }).check();
  await expect(goals.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await expect(goals.getByRole('status', { name: 'Transfer result' })).toHaveCount(0);
  await expect(content).toHaveText('keeptransfer');
  await expect(nextCards).toHaveCount(3);
  await expect(goals.getByRole('radio', { name: 'Move to', exact: true })).toBeChecked();
  await reloadApp(page);
  await expect(page.locator('.goals .cm-content')).toHaveText('keeptransfer');
  await expect(nextCards).toHaveCount(3);
});

test('Goals destinations require room for the whole selection in either mode on the focused day', async ({
  page,
}) => {
  await openApp(page);
  const goals = page.locator('.goals');
  const content = goals.locator('.cm-content');
  const toNext = goals.getByRole('button', { name: 'Next', exact: true });
  const destinations = goals.getByRole('button', { name: /^(Next|Scheduled|Done)$/ });
  for (const button of await destinations.all()) await expect(button).toBeDisabled();
  await content.click();
  await page.keyboard.insertText('- [ ] ');
  for (const button of await destinations.all()) await expect(button).toBeDisabled();
  await page.keyboard.insertText('first\n- second');
  await expect(toNext).toBeEnabled();
  await toNext.click();
  await expect(day(page).locator('.collection[data-section="next"] .card')).toHaveCount(1);
  await toNext.click();
  await expect(day(page).locator('.collection[data-section="next"] .card')).toHaveCount(2);
  await content.click();
  await content.press('ControlOrMeta+a');
  await goals.getByRole('radio', { name: 'Move to', exact: true }).check();
  await expect(toNext).toBeDisabled();
  await goals.getByRole('radio', { name: 'Copy to', exact: true }).check();
  await expect(toNext).toBeDisabled();
  await content.press('ControlOrMeta+Shift+c');
  await expect(day(page).locator('.collection[data-section="next"] .card')).toHaveCount(2);
  const today = (await day(page).getAttribute('data-date'))!;
  await page.getByLabel('Go to date', { exact: true }).fill(addDays(today, 1));
  await expect(toNext).toBeEnabled();
  await toNext.click();
  await expect(day(page).locator('.collection[data-section="next"] .card')).toHaveCount(2);
  await expect(toNext).toBeDisabled();
  await page.getByLabel('Go to date', { exact: true }).fill(today);
  await expect(toNext).toBeDisabled();
  await page.getByLabel('Go to date', { exact: true }).fill(addDays(today, -3));
  for (const button of await destinations.all()) await expect(button).toBeDisabled();
  await goals.getByRole('button', { name: 'More Goals actions' }).click();
  await expect(goals.getByRole('menuitem', { name: 'Remove selected lines' })).toBeEnabled();
});

const actionBoxes = (page: Page) =>
  page.locator('.goals-destinations button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const { x, y, width, height } = button.getBoundingClientRect();
      return { x, y, width, height };
    }),
  );

for (const width of [320, 420, 1280]) {
  test(`Goals action buttons stay fixed through mode, transfer and empty selection at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await openApp(page);
    if (width < 768) {
      await page
        .locator('.day-panel[data-active="true"] .panel-header')
        .getByRole('button', { name: 'Open Goals', exact: true })
        .click();
      await expect(page.locator('.goals .cm-content')).toBeFocused();
    }
    const goals = page.locator('.goals');
    const content = goals.locator('.cm-content');
    await content.click();
    await page.keyboard.insertText('move me');
    const before = await actionBoxes(page);
    await page.setViewportSize({ width: width + 80, height: 900 });
    expect((await actionBoxes(page)).map((box) => box.width)).toEqual(
      before.map((box) => box.width),
    );
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => actionBoxes(page)).toEqual(before);
    const footer = (await goals.locator('.goals-actions').boundingBox())!;
    for (const box of before) {
      expect(box.x).toBeGreaterThanOrEqual(footer.x);
      expect(box.x + box.width).toBeLessThanOrEqual(footer.x + footer.width);
    }
    const mode = (await goals.locator('.goals-transfer-mode').boundingBox())!;
    expect(mode.x).toBe(before[0]!.x);
    expect(mode.y + mode.height).toBeLessThan(before[0]!.y);
    const more = goals.getByRole('button', { name: 'More Goals actions' });
    const moreBox = (await more.boundingBox())!;
    expect(moreBox.y).toBe(mode.y);
    expect(moreBox.x).toBeGreaterThanOrEqual(mode.x + mode.width + 16);
    expect(new Set(before.map((box) => box.y)).size).toBe(1);
    expect(footer.y + footer.height - (before[0]!.y + before[0]!.height)).toBeLessThan(16);
    await more.click();
    const menu = goals.getByRole('menu', { name: 'Goals actions' });
    await expect(menu).toBeVisible();
    expect(await actionBoxes(page)).toEqual(before);
    expect(await goals.locator('.goals-actions').boundingBox()).toEqual(footer);
    const menuBox = (await menu.boundingBox())!;
    expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(moreBox.y);
    expect(menuBox.x).toBeGreaterThanOrEqual(footer.x);
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();
    await goals.getByRole('radio', { name: 'Move to', exact: true }).check();
    expect(await goals.locator('.goals-transfer-mode').boundingBox()).toEqual(mode);
    expect(await actionBoxes(page)).toEqual(before);
    await goals.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(goals.getByRole('radio', { name: 'Copy to', exact: true })).toBeChecked();
    await expect(goals.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
    expect(await actionBoxes(page)).toEqual(before);
  });
}

test('Goals mobile menu removes the current line, undoes, redoes and dismisses accessibly', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openApp(page);
  await page
    .locator('.day-panel[data-active="true"] .panel-header')
    .getByRole('button', { name: 'Open Goals', exact: true })
    .click();
  const goals = page.locator('.goals');
  const content = goals.locator('.cm-content');
  const more = goals.getByRole('button', { name: 'More Goals actions' });
  const menu = goals.getByRole('menu', { name: 'Goals actions' });
  await more.click();
  for (const item of await menu.getByRole('menuitem').all()) await expect(item).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();
  await expect(page.locator('.shell')).toHaveAttribute('data-goals', 'open');
  await content.click();
  await page.keyboard.insertText('keep\nremove me');
  await more.click();
  await expect(menu.getByRole('menuitem', { name: 'Undo', exact: true })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: 'Redo', exact: true })).toBeDisabled();
  await menu.getByRole('menuitem', { name: 'Remove selected lines' }).click();
  await expect(content).toHaveText('keep');
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();
  await more.click();
  await menu.getByRole('menuitem', { name: 'Undo', exact: true }).click();
  await expect(content).toHaveText('keepremove me');
  await more.click();
  await menu.getByRole('menuitem', { name: 'Redo', exact: true }).click();
  await expect(content).toHaveText('keep');
  await more.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Undo', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Remove selected lines' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(menu.getByRole('menuitem', { name: 'Undo', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'Remove selected lines' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(menu).toHaveCount(0);
  await expect(goals.getByRole('button', { name: 'Next', exact: true })).toBeFocused();
  await more.click();
  await content.click();
  await expect(menu).toHaveCount(0);
  await expect(content).toHaveText('keep');
});

test('Goals failures appear once above the fixed bar and dismiss themselves', async ({ page }) => {
  await openApp(page);
  const goals = page.locator('.goals');
  const content = goals.locator('.cm-content');
  await content.click();
  await page.keyboard.insertText('retain this');
  await goals.getByRole('radio', { name: 'Move to', exact: true }).check();
  const before = await actionBoxes(page);
  await faults(page);
  await goals.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.workspace-status')).toContainText('Input is waiting for storage.');
  expect(await actionBoxes(page)).toEqual(before);
  await page
    .locator('.workspace-status')
    .getByRole('button', { name: 'Discard pending input' })
    .click();
  await allowStorage(page);
  const feedback = goals.getByRole('status', { name: 'Transfer result' });
  await expect(feedback).toHaveText('Nothing moved. Try again.');
  await expect(page.locator('.workspace-status')).toHaveCount(0);
  expect(await actionBoxes(page)).toEqual(before);
  const message = (await feedback.boundingBox())!;
  const footer = (await goals.locator('.goals-actions').boundingBox())!;
  expect(message.y + message.height).toBeLessThan(footer.y);
  await expect(feedback).toHaveCount(0, { timeout: 6000 });
  expect(await actionBoxes(page)).toEqual(before);
  await expect(content).toHaveText('retain this');
});

test('generated compose and history sequences match a separate ledger before and after cold open', async ({
  browser,
  baseURL,
}, info) => {
  test.setTimeout(120_000);
  if (!baseURL) throw Error('Native editor tests require a base URL.');
  const histories = fc.sample(
    fc.array(fc.constantFrom('compose', 'undo', 'redo'), { minLength: 3, maxLength: 12 }),
    { seed: 8941, numRuns: 20 },
  );
  await info.attach('generated-inputs', {
    body: JSON.stringify({ seed: 8941, histories }),
    contentType: 'application/json',
  });
  for (const actions of histories) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
    try {
      const page = await context.newPage();
      await openApp(page);
      let values: string[] = [];
      const undo: string[][] = [],
        redo: string[][] = [];
      for (const [index, action] of actions.entries()) {
        if (action === 'compose') {
          const text = `entry ${index} 🙂`;
          await day(page).getByRole('textbox', { name: 'What got done?' }).fill(text);
          await day(page).getByRole('textbox', { name: 'What got done?' }).press('Enter');
          undo.push([...values]);
          redo.length = 0;
          values.unshift(text);
        } else if (action === 'undo' && undo.length) {
          await openMenuSection(page, 'Data');
          await page.getByRole('button', { name: 'Undo', exact: true }).click();
          redo.push([...values]);
          values = undo.pop()!;
        } else if (action === 'redo' && redo.length) {
          await openMenuSection(page, 'Data');
          await page.getByRole('button', { name: 'Redo', exact: true }).click();
          undo.push([...values]);
          values = redo.pop()!;
        }
        await expect(day(page).locator('.card .card-surface')).toHaveText(values);
      }
      await reloadApp(page);
      await expect(day(page).locator('.card .card-surface')).toHaveText(values);
    } finally {
      await context.close();
    }
  }
});
