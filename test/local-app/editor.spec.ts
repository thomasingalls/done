import { test } from '../release-validation/browser-fixture';
import { expect, type Page } from '@playwright/test';
import * as fc from 'fast-check';
import { openApp, reloadApp } from '../geometry/openApp';
const day = (page: Page) => page.locator('.day-panel[data-active="true"]');
const faults = async (page: Page) =>
  page.evaluate(() => {
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
const allowStorage = async (page: Page) =>
  page.evaluate(() => {
    const state = (
      window as unknown as { editorFaults: { enabled: boolean; journal: number; database: number } }
    ).editorFaults;
    state.enabled = false;
    return { journal: state.journal, database: state.database };
  });

test('compose keeps its draft through native refusal; retry admits it once and reopen retains it', async ({
  page,
}) => {
  await openApp(page);
  await faults(page);
  const compose = day(page).locator('.compose-field');
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
  await page.locator('.goals').getByRole('button', { name: 'To Next', exact: true }).click();
  await expect(day(page).locator('.collection[data-section="next"] .card')).toHaveCount(2);
  await expect(page.locator('.goals-hint')).toHaveText('2 selected');
  await expect(content).toHaveText('keepremove oneremove two');
  await page.locator('.goals').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(content).toHaveText('keep');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(content).toHaveText('keepremove oneremove two');
  await reloadApp(page);
  await expect(day(page).locator('.collection[data-section="next"] .card')).toHaveCount(2);
  await expect(page.locator('.goals .cm-content')).toHaveText('keepremove oneremove two');
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
          await day(page).locator('.compose-field').fill(text);
          await day(page).locator('.compose-field').press('Enter');
          undo.push([...values]);
          redo.length = 0;
          values.unshift(text);
        } else if (action === 'undo' && undo.length) {
          await page.getByRole('button', { name: 'Undo', exact: true }).click();
          redo.push([...values]);
          values = undo.pop()!;
        } else if (action === 'redo' && redo.length) {
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
