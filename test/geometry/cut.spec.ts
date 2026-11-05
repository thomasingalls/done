import { devices, expect, type Locator, type Page } from '@playwright/test';
import type { EditorView } from '@codemirror/view';
import { test } from '../release-validation/browser-fixture';
import { openApp, reloadApp } from './openApp';
import { refuseNativeContent, allowNativeContent } from '../local-app/native-storage-faults';

test.use({
  userAgent: devices['Desktop Chrome'].userAgent.replace(
    /\([^)]*\)/,
    '(Macintosh; Intel Mac OS X 10_15_7)',
  ),
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
    document.addEventListener(
      'cut',
      (event) => {
        Object.assign(window, { lastCut: { text: '', trusted: event.isTrusted } });
      },
      true,
    );
    // Clipboard data becomes protected after event dispatch. Observe the native
    // write synchronously and forward it, rather than reading it later.
    const set = DataTransfer.prototype.setData;
    DataTransfer.prototype.setData = function (type, value) {
      set.call(this, type, value);
      const last = (window as unknown as { lastCut?: { text: string } }).lastCut;
      if (last && type === 'text/plain') last.text = this.getData(type);
    };
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page);
});
const body = (editor: Locator) =>
  editor.evaluate((element) =>
    (
      element as HTMLElement & { cmTile: { root: { view: EditorView } } }
    ).cmTile.root.view.state.doc.toString(),
  );
const select = (editor: Locator, anchor: number, head = anchor) =>
  editor.evaluate(
    (element, selection) => {
      const view = (element as HTMLElement & { cmTile: { root: { view: EditorView } } }).cmTile.root
        .view;
      view.dispatch({ selection });
      view.focus();
    },
    { anchor, head },
  );
const copied = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { lastCut: { text: string; trusted: boolean } }).lastCut,
  );
const failStorage = async (page: Page) => {
  await refuseNativeContent(page);
  return page.evaluate(() => {
    const fault = { enabled: true };
    Object.assign(window, { cutFault: fault });
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (fault.enabled && key.startsWith('done.pending-update.'))
        throw new DOMException('Quota', 'QuotaExceededError');
      return set.call(this, key, value);
    };
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value, key) {
      const request = add.call(this, value, key);
      if (fault.enabled && this.name === 'content')
        request.addEventListener('success', () => this.transaction.abort(), { once: true });
      return request;
    };
  });
};

for (const surface of ['Goals', 'card']) {
  test(`Mac Cmd X cuts a whole ${surface} line, retains selected cuts and persists undo/redo`, async ({
    page,
  }) => {
    const text = 'first\nsecond\nlast';
    let editor: Locator;
    if (surface === 'Goals') {
      editor = page.locator('.goals .cm-content');
      await editor.click();
      await page.keyboard.insertText(text);
    } else {
      const entry = page
        .locator('.day-panel[data-active="true"]')
        .getByRole('textbox', { name: 'What’s scheduled?' });
      await entry.fill(text);
      await entry.press('Enter');
      await page.locator('.card-surface').click();
      editor = page.locator('.card .cm-content');
    }
    await expect.poll(() => body(editor)).toBe(text);
    await select(editor, 8);
    await editor.press('Meta+x');
    await expect.poll(() => body(editor)).toBe('first\nlast');
    expect(await copied(page)).toEqual({ text: 'second\n', trusted: true });
    await editor.press('Meta+z');
    await expect.poll(() => body(editor)).toBe(text);
    await editor.press('Meta+Shift+z');
    await expect.poll(() => body(editor)).toBe('first\nlast');
    await select(editor, 1, 4);
    await editor.press('Meta+x');
    expect(await copied(page)).toEqual({ text: 'irs', trusted: true });
    await expect.poll(() => body(editor)).toBe('ft\nlast');
    await editor.press('Meta+z');
    await expect.poll(() => body(editor)).toBe('first\nlast');
    await reloadApp(page);
    if (surface === 'card') await page.locator('.card-surface').click();
    await expect
      .poll(() =>
        body(
          surface === 'card'
            ? page.locator('.card .cm-content')
            : page.locator('.goals .cm-content'),
        ),
      )
      .toBe('first\nlast');
  });
}

test('Cut copies immediately but only publishes deletion after refused storage retries', async ({
  page,
}) => {
  const editor = page.locator('.goals .cm-content');
  await editor.click();
  await page.keyboard.insertText('first\nsecond\nlast');
  await expect.poll(() => body(editor)).toBe('first\nsecond\nlast');
  await failStorage(page);
  await select(editor, 8);
  await editor.press('Meta+x');
  expect(await copied(page)).toEqual({ text: 'second\n', trusted: true });
  await expect(page.locator('.workspace-status')).toContainText('Input is waiting for storage.');
  await expect.poll(() => body(editor)).toBe('first\nsecond\nlast');
  await allowNativeContent(page);
  await page.evaluate(() => {
    (window as unknown as { cutFault: { enabled: boolean } }).cutFault.enabled = false;
  });
  await page
    .locator('.workspace-status')
    .getByRole('button', { name: 'Retry storage', exact: true })
    .click();
  await expect.poll(() => body(editor)).toBe('first\nlast');
  await reloadApp(page);
  await expect.poll(() => body(page.locator('.goals .cm-content'))).toBe('first\nlast');
});

test('Cut refuses to delete a visible line while earlier typing is still pending', async ({
  page,
}) => {
  const editor = page.locator('.goals .cm-content');
  await editor.click();
  await page.keyboard.insertText('base');
  await expect.poll(() => body(editor)).toBe('base');
  await failStorage(page);
  await page.keyboard.insertText('pending');
  await expect(page.locator('.workspace-status')).toContainText('Input is waiting for storage.');
  await editor.press('Meta+x');
  await expect(page.locator('.goals .admission-status')).toContainText('Wait for pending writing');
  expect((await copied(page)).text).toBe('');
  await expect.poll(() => body(editor)).toBe('base');
  await page
    .locator('.workspace-status')
    .getByRole('button', { name: 'Discard pending input', exact: true })
    .click();
  await allowNativeContent(page);
  await page.evaluate(() => {
    (window as unknown as { cutFault: { enabled: boolean } }).cutFault.enabled = false;
  });
  await reloadApp(page);
  await expect.poll(() => body(page.locator('.goals .cm-content'))).toBe('base');
});
