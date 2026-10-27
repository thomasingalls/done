import { devices, expect, type Locator, type Page } from '@playwright/test';
import type { EditorView } from '@codemirror/view';
import { test } from '../release-validation/browser-fixture';
import { openApp, reloadApp } from './openApp';

// These are Mac hardware-shortcut tests, including in the mobile-layout project.
// Keep the user agent consistent with the platform below: an Android UA activates
// CodeMirror's virtual-keyboard Enter handling before the Mac keymap can run.
test.use({
  userAgent: devices['Desktop Chrome'].userAgent.replace(
    /\([^)]*\)/,
    '(Macintosh; Intel Mac OS X 10_15_7)',
  ),
});

const activeDay = (page: Page) => page.locator('.day-panel[data-active="true"]');
const lines = (editor: Locator) => editor.locator('.cm-line').allTextContents();
const select = async (editor: Locator, anchor: number, head = anchor) => {
  await editor.evaluate(
    (element, range) => {
      const view = (element as HTMLElement & { cmTile?: { root?: { view?: EditorView } } }).cmTile
        ?.root?.view;
      if (!view) throw Error('No Goals EditorView');
      view.dispatch({ selection: range });
      view.focus();
    },
    { anchor, head },
  );
};
const seed = async (page: Page, text: string) => {
  const editor = page.locator('.goals .cm-content');
  await editor.click();
  await page.keyboard.insertText(text);
  await expect.poll(() => lines(editor)).toEqual(text.split('\n'));
  return editor;
};

test.beforeEach(async ({ page }) => {
  // Exercise the macOS keymap even on a Linux CI browser.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page);
});

test('Option arrows move Goals lines with undo/redo and leave the day in place', async ({
  page,
}) => {
  const editor = await seed(page, 'one\ntwo\nthree');
  const date = await activeDay(page).getAttribute('data-date');
  await select(editor, 5);
  await editor.press('Alt+ArrowUp');
  await expect.poll(() => lines(editor)).toEqual(['two', 'one', 'three']);
  await editor.press('Alt+ArrowUp'); // Already at the top: still owned by the editor.
  await expect.poll(() => lines(editor)).toEqual(['two', 'one', 'three']);
  await editor.press('Alt+ArrowDown');
  await expect.poll(() => lines(editor)).toEqual(['one', 'two', 'three']);
  await editor.press('Meta+z');
  await expect.poll(() => lines(editor)).toEqual(['two', 'one', 'three']);
  await editor.press('Meta+Shift+z');
  await expect.poll(() => lines(editor)).toEqual(['one', 'two', 'three']);
  await page.waitForTimeout(300); // Day navigation commits after the snap animation.
  await expect(activeDay(page)).toHaveAttribute('data-date', date!);
  await expect(page.locator('.goals .admission-status')).not.toContainText('admission adapter');

  await page.locator('.goals-breadcrumbs').focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(activeDay(page)).not.toHaveAttribute('data-date', date!);
});

test('app navigation yields to text fields, consumed keys, composition and extra modifiers', async ({
  page,
}) => {
  const date = await activeDay(page).getAttribute('data-date');
  const compose = activeDay(page).getByRole('textbox', { name: 'What got done?' });
  await compose.fill('draft');
  await compose.press('Alt+ArrowDown');
  await page.waitForTimeout(300);
  await expect(activeDay(page)).toHaveAttribute('data-date', date!);
  await expect(compose).toHaveValue('draft');

  await page.locator('.goals-breadcrumbs').focus();
  for (const kind of ['handled', 'composing', 'meta', 'control', 'shift']) {
    await page.evaluate((kind) => {
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        altKey: true,
        bubbles: true,
        cancelable: true,
        isComposing: kind === 'composing',
        metaKey: kind === 'meta',
        ctrlKey: kind === 'control',
        shiftKey: kind === 'shift',
      });
      if (kind === 'handled') event.preventDefault();
      document.activeElement!.dispatchEvent(event);
    }, kind);
    await page.waitForTimeout(300);
    await expect(activeDay(page)).toHaveAttribute('data-date', date!);
  }
});

test('Cmd Delete removes the line prefix, supports undo/redo and survives reopening', async ({
  page,
}) => {
  const editor = await seed(page, 'first\nremove keep\nlast');
  await select(editor, 13);
  await editor.press('Meta+Backspace');
  await expect.poll(() => lines(editor)).toEqual(['first', 'keep', 'last']);
  await expect(page.locator('.goals .admission-status')).not.toContainText('admission adapter');
  await editor.press('Meta+z');
  await expect.poll(() => lines(editor)).toEqual(['first', 'remove keep', 'last']);
  await editor.press('Meta+Shift+z');
  await expect.poll(() => lines(editor)).toEqual(['first', 'keep', 'last']);
  await reloadApp(page);
  await expect
    .poll(() => lines(page.locator('.goals .cm-content')))
    .toEqual(['first', 'keep', 'last']);
});

test('Cmd Delete deletes a selection and joins at the start of a line', async ({ page }) => {
  const editor = await seed(page, 'first\nsecond\nthird');
  await select(editor, 8, 10);
  await editor.press('Meta+Backspace');
  await expect.poll(() => lines(editor)).toEqual(['first', 'send', 'third']);
  await select(editor, 6);
  await editor.press('Meta+Backspace');
  await expect.poll(() => lines(editor)).toEqual(['firstsend', 'third']);
  await select(editor, 0);
  await editor.press('Meta+Backspace');
  await expect.poll(() => lines(editor)).toEqual(['firstsend', 'third']);
});

test('Cmd Delete respects a wrapped display line', async ({ page }) => {
  const text = 'word '.repeat(100) + 'end';
  const editor = await seed(page, text);
  await select(editor, text.length);
  // Read the browser caret geometry independently of CodeMirror's boundary command.
  const start = await editor.evaluate((element) => {
    const line = element.querySelector('.cm-line')!;
    const text = line.firstChild!;
    const range = document.createRange();
    range.setStart(text, text.textContent!.length - 1);
    range.setEnd(text, text.textContent!.length);
    const bottom = range.getBoundingClientRect().top;
    let start = text.textContent!.length - 1;
    while (start > 0) {
      range.setStart(text, start - 1);
      range.setEnd(text, start);
      if (range.getBoundingClientRect().top < bottom - 1) break;
      start--;
    }
    return start;
  });
  expect(start).toBeGreaterThan(0);
  await editor.press('Meta+Backspace');
  await expect.poll(() => lines(editor)).toEqual([text.slice(0, start)]);
  await editor.press('Meta+z');
  await expect.poll(() => lines(editor)).toEqual([text]);
});

test('Cmd Enter leaves task text and undo history unchanged; click still toggles', async ({
  page,
}) => {
  const editor = await seed(page, '- [ ] task');
  const markdown = () =>
    editor.evaluate((element) => {
      const view = (element as HTMLElement & { cmTile?: { root?: { view?: EditorView } } }).cmTile
        ?.root?.view;
      if (!view) throw Error('No Goals EditorView');
      return view.state.doc.toString();
    });
  await editor.press('Meta+Enter');
  await expect.poll(markdown).toBe('- [ ] task');
  await editor.press('Meta+z');
  await expect.poll(markdown).toBe('');
  await editor.press('Meta+Shift+z');
  await expect.poll(markdown).toBe('- [ ] task');
  await editor.press('Shift+Enter');
  await page.keyboard.insertText('other');
  await expect.poll(markdown).toBe('- [ ] task\nother');
  await page.locator('.goals .cm-md-task').click();
  await expect.poll(markdown).toBe('- [x] task\nother');
  await editor.press('Meta+z');
  await expect.poll(markdown).toBe('- [ ] task\nother');
  await editor.press('Meta+Shift+z');
  await expect.poll(markdown).toBe('- [x] task\nother');
  await expect(page.locator('.goals .admission-status')).not.toContainText('admission adapter');
});

test('Option Backspace deletes words and selections with undo and durable reopen', async ({
  page,
}) => {
  const editor = await seed(page, 'keep café word');
  await editor.press('Alt+Backspace');
  await expect.poll(() => lines(editor)).toEqual(['keep café ']);
  await editor.press('Meta+z');
  await expect.poll(() => lines(editor)).toEqual(['keep café word']);
  await select(editor, 5, 10);
  await editor.press('Alt+Backspace');
  await expect.poll(() => lines(editor)).toEqual(['keep word']);
  await editor.press('Meta+z');
  await expect.poll(() => lines(editor)).toEqual(['keep café word']);
  await editor.press('Meta+Shift+z');
  await expect.poll(() => lines(editor)).toEqual(['keep word']);
  await reloadApp(page);
  await expect.poll(() => lines(page.locator('.goals .cm-content'))).toEqual(['keep word']);
});

test('Cmd brackets indent and outdent the selected lines through admission', async ({ page }) => {
  const editor = await seed(page, 'one\ntwo');
  await select(editor, 0, 7);
  await editor.press('Meta+]');
  await expect.poll(() => lines(editor)).toEqual(['  one', '  two']);
  await editor.press('Meta+[');
  await expect.poll(() => lines(editor)).toEqual(['one', 'two']);
  await editor.press('Meta+z');
  await expect.poll(() => lines(editor)).toEqual(['  one', '  two']);
  await editor.press('Meta+Shift+z');
  await expect.poll(() => lines(editor)).toEqual(['one', 'two']);
  await expect(page.locator('.goals .admission-status')).not.toContainText('admission adapter');
});

test('Shift Enter adds a plain newline while Goals Enter still continues lists', async ({
  page,
}) => {
  const editor = await seed(page, '- item');
  await editor.press('Enter');
  await expect.poll(() => lines(editor)).toEqual(['- item', '- ']);
  await editor.press('Meta+z');
  await expect.poll(() => lines(editor)).toEqual(['- item']);
  await editor.press('Shift+Enter');
  await expect.poll(() => lines(editor)).toEqual(['- item', '']);
  await editor.press('Meta+z');
  await expect.poll(() => lines(editor)).toEqual(['- item']);
  await expect(page.locator('.goals .admission-status')).not.toContainText('admission adapter');
});
