import { expect, type Page } from '@playwright/test';
import { test } from '../release-validation/browser-fixture';
import { openApp, openMenuSection, reloadApp } from './openApp';

const DOCUMENT = [
  '# Work',
  'work note',
  '## Site',
  'site note',
  '### Launch',
  'current task',
  'child note',
  '### Later',
  ...Array.from({ length: 35 }, (_, index) => `later note ${index}`),
  '# Home',
  'home note',
].join('\n');
const editor = (page: Page) => page.locator('.goals .cm-content');

test('queued context measurement survives resize and rapid preference changes without editor exceptions', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /CodeMirror|EditorView\.update|update is in progress/u.test(message.text())
    )
      errors.push(message.text());
  });
  await seed(page);
  await expect(page.locator('.cm-gentle-dim')).not.toHaveCount(0);
  await openMenuSection(page, 'Account');
  const toggle = page.getByRole('checkbox', { name: 'Gentle context', exact: true });
  for (let index = 0; index < 3; index++) {
    await toggle.uncheck();
    await page.setViewportSize({ width: 1280, height: 800 + index * 20 });
    await toggle.check();
  }
  await place(page, 'current task');
  await page.locator('.goals .cm-scroller').evaluate((element) => (element.scrollTop = 0));
  await expect(page.locator('.cm-gentle-dim')).not.toHaveCount(0);
  expect(errors).toEqual([]);
});
const place = async (page: Page, needle: string) => {
  await editor(page).evaluate((element, text) => {
    const view = (
      element as unknown as {
        cmTile: {
          root: {
            view: {
              state: { doc: { toString: () => string } };
              dispatch: (value: unknown) => void;
              focus: () => void;
            };
          };
        };
      }
    ).cmTile.root.view;
    const at = view.state.doc.toString().indexOf(text);
    if (at < 0) throw Error('Missing sample line');
    view.dispatch({ selection: { anchor: at } });
    view.focus();
  }, needle);
};
const seed = async (page: Page) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page);
  await editor(page).click();
  await page.keyboard.insertText(DOCUMENT);
  await place(page, 'current task');
  await page.locator('.goals .cm-scroller').evaluate((element) => (element.scrollTop = 0));
};

test('gentle context defaults on, follows the caret and releases when it is offscreen', async ({
  page,
}) => {
  await seed(page);
  await expect(page.locator('.cm-gentle-dim').filter({ hasText: /^work note$/ })).toBeVisible();
  await expect(page.locator('.cm-gentle-dim').filter({ hasText: /^site note$/ })).toBeVisible();
  await expect(page.locator('.cm-gentle-dim').filter({ hasText: /^current task$/ })).toHaveCount(0);
  const before = await editor(page).evaluate((element) => {
    const view = (
      element as unknown as {
        cmTile: {
          root: {
            view: {
              state: { doc: { toString: () => string }; selection: { main: { head: number } } };
            };
          };
        };
      }
    ).cmTile.root.view;
    return { text: view.state.doc.toString(), head: view.state.selection.main.head };
  });
  await page
    .locator('.goals .cm-scroller')
    .evaluate((element) => (element.scrollTop = element.scrollHeight));
  await expect(page.locator('.cm-gentle-dim')).toHaveCount(0);
  await page.locator('.goals .cm-scroller').evaluate((element) => (element.scrollTop = 0));
  await expect(page.locator('.cm-gentle-dim')).not.toHaveCount(0);
  expect(
    await editor(page).evaluate((element) => {
      const view = (
        element as unknown as {
          cmTile: {
            root: {
              view: {
                state: { doc: { toString: () => string }; selection: { main: { head: number } } };
              };
            };
          };
        }
      ).cmTile.root.view;
      return { text: view.state.doc.toString(), head: view.state.selection.main.head };
    }),
  ).toEqual(before);
});

test('the sidebar toggle preserves writing, line geometry and undo, and survives reopening', async ({
  page,
}) => {
  await seed(page);
  await openMenuSection(page, 'Account');
  const toggle = page.getByRole('checkbox', { name: 'Gentle context', exact: true });
  await expect(toggle).toBeChecked();
  const geometry = () =>
    editor(page)
      .locator('.cm-line')
      .evaluateAll((lines) =>
        lines.map((line) => ({
          text: line.textContent,
          width: line.getBoundingClientRect().width,
          height: line.getBoundingClientRect().height,
        })),
      );
  const before = await geometry();
  await toggle.uncheck();
  await expect(page.locator('.cm-gentle-dim')).toHaveCount(0);
  expect(await geometry()).toEqual(before);
  await reloadApp(page);
  await openMenuSection(page, 'Account');
  await expect(toggle).not.toBeChecked();
  await expect(editor(page)).toContainText('current task');
  await toggle.check();
  await place(page, 'current task');
  await page.locator('.goals .cm-scroller').evaluate((element) => (element.scrollTop = 0));
  await expect(page.locator('.cm-gentle-dim')).not.toHaveCount(0);
  await place(page, 'current task');
  await page.keyboard.insertText('new ');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(editor(page)).not.toContainText('new current task');
  await expect(editor(page)).toContainText('current task');
});

test('the display preference updates other tabs without changing workspace settings', async ({
  page,
  context,
}) => {
  await seed(page);
  const second = await context.newPage();
  await openApp(second);
  await openMenuSection(second, 'Account');
  const otherToggle = second.getByRole('checkbox', { name: 'Gentle context', exact: true });
  await expect(otherToggle).toBeChecked();
  await openMenuSection(page, 'Account');
  await page.getByRole('checkbox', { name: 'Gentle context', exact: true }).uncheck();
  await expect(otherToggle).not.toBeChecked();
  await otherToggle.check();
  await expect(page.getByRole('checkbox', { name: 'Gentle context', exact: true })).toBeChecked();
  await second.close();
});

test('blocked preference storage keeps the toggle usable for the visit', async ({ page }) => {
  await seed(page);
  await openMenuSection(page, 'Account');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'done.ui.gentle-context') throw Error('blocked');
      return original.call(this, key, value);
    };
  });
  await page.getByRole('checkbox', { name: 'Gentle context', exact: true }).uncheck();
  await expect(page.locator('.cm-gentle-dim')).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'Browser preferences could not be saved' }),
  ).toBeVisible();
  await expect(editor(page)).toContainText('current task');
});
