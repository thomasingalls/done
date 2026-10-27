import { expect, type Page } from '@playwright/test';
import type { EditorView } from '@codemirror/view';
import { test } from '../release-validation/browser-fixture';
import { openApp } from './openApp';

const body = (name: string) => Array.from({ length: 20 }, (_, i) => `${name} note ${i}`);
const DOCUMENT = [
  '# Work',
  ...body('work'),
  '### Site',
  ...body('site'),
  '#### Launch',
  ...body('first launch'),
  '#### Launch',
  ...body('second launch'),
  '### Admin',
  ...body('admin'),
  '# Home',
  ...body('home'),
  '## Launch',
  ...body('home launch'),
].join('\n');
const editor = (page: Page) => page.locator('.goals .cm-content');
const root = (page: Page) => page.locator('.goals-breadcrumbs');
const localMenu = (page: Page) => page.locator('#goals-heading-menu');
const seed = async (page: Page, text = DOCUMENT, width = 1280) => {
  await page.setViewportSize({ width, height: 900 });
  await openApp(page);
  if (width < 700) {
    await page.keyboard.press('Alt+ArrowRight');
    await expect(page.locator('.shell')).toHaveAttribute('data-goals', 'open');
  }
  await editor(page).click();
  await page.keyboard.insertText(text);
  await expect.poll(async () => (await state(page)).text).toBe(text);
};
const state = (page: Page) =>
  editor(page).evaluate((element) => {
    const view = (element as HTMLElement & { cmTile: { root: { view: EditorView } } }).cmTile.root
      .view;
    return { text: view.state.doc.toString(), selection: view.state.selection.toJSON() };
  });
const top = async (page: Page) => {
  await page.locator('.goals .cm-scroller').evaluate((element) => (element.scrollTop = 0));
  await expect(root(page)).toHaveAttribute('title', 'Goals › Work');
};
const outline = (page: Page) => page.getByRole('navigation', { name: 'Document outline' });
const atSite = async (page: Page) => {
  await top(page);
  await root(page).click();
  await outline(page).getByRole('button', { name: 'Site', exact: true }).click();
  await expect(root(page)).toHaveAttribute('title', 'Goals › Work › Site');
};

test('breadcrumb menus retain the whole outline, skipped levels and distinct duplicate locations', async ({
  page,
}) => {
  await seed(page);
  await top(page);
  const before = await state(page);
  await root(page).click();
  await expect(outline(page).getByRole('button')).toHaveText([
    'Work',
    'Site',
    'Launch',
    'Launch',
    'Admin',
    'Home',
    'Launch',
  ]);
  await outline(page).getByRole('button', { name: 'Site', exact: true }).click();
  await expect(root(page)).toHaveAttribute('title', 'Goals › Work › Site');
  await page.getByRole('button', { name: 'Sections inside Work', exact: true }).click();
  await expect(localMenu(page).locator('.goals-outline-item > span:first-child')).toHaveText([
    'Site',
    'Admin',
  ]);
  await page.getByRole('button', { name: 'Sections inside Site', exact: true }).click();
  const items = localMenu(page).getByRole('button');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Work › Site › Launch · line 43');
  await expect(items.nth(1)).toContainText('Work › Site › Launch · line 64');
  await items.nth(1).click();
  await expect(localMenu(page)).toBeVisible();
  await expect(root(page)).toHaveAttribute('title', 'Goals › Work › Site › Launch');
  await page.getByRole('button', { name: 'Sections inside Launch', exact: true }).click();
  await expect(localMenu(page)).toContainText('Inside Launch');
  await expect(localMenu(page)).toContainText('No subsections here.');
  await expect(localMenu(page).getByRole('button')).toHaveCount(0);
  expect(await state(page)).toEqual(before);
  await expect(editor(page)).not.toBeFocused();
});

test('breadcrumb text navigates without moving the caret or changing the formatted editor', async ({
  page,
}) => {
  await seed(page);
  await atSite(page);
  const before = await state(page);
  await page.getByRole('button', { name: 'Go to Work', exact: true }).click();
  await expect(root(page)).toHaveAttribute('title', 'Goals › Work');
  expect(await state(page)).toEqual(before);
  await expect(editor(page)).toHaveCount(1);
  await expect(editor(page)).not.toBeFocused();
  await editor(page).evaluate((element) => {
    (element as HTMLElement & { cmTile: { root: { view: EditorView } } }).cmTile.root.view.focus();
  });
  await page.keyboard.insertText('X');
  await expect(editor(page)).toContainText('home launch note 19X');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  expect(await state(page)).toEqual(before);
});

test('local menus support keyboard navigation, outside dismissal and the full outline', async ({
  page,
}) => {
  await seed(page);
  await atSite(page);
  const trigger = page.getByRole('button', { name: 'Sections inside Site', exact: true });
  await trigger.click();
  const buttons = localMenu(page).getByRole('button');
  await expect(buttons.nth(0)).toBeFocused();
  await page.keyboard.press('End');
  await expect(buttons.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(buttons.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(buttons.nth(1)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(buttons.nth(0)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(localMenu(page)).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await root(page).click();
  await expect(localMenu(page)).toBeHidden();
  await expect(outline(page)).toBeVisible();
  await page.getByRole('button', { name: 'Sections inside Work', exact: true }).click();
  await expect(outline(page)).toBeHidden();
  await expect(localMenu(page)).toBeVisible();
  await page.locator('.day-panel[data-active="true"] .compose-field').first().click();
  await expect(localMenu(page)).toBeHidden();
});

test('accepted document changes close menus and reject a retained stale destination', async ({
  page,
}) => {
  await seed(page);
  await atSite(page);
  await page.getByRole('button', { name: 'Sections inside Site', exact: true }).click();
  const before = await state(page);
  await localMenu(page)
    .getByRole('button')
    .nth(1)
    .evaluate((button) => {
      const element = document.querySelector('.goals .cm-content') as HTMLElement & {
        cmTile: { root: { view: EditorView } };
      };
      const view = element.cmTile.root.view;
      const original = view.update.bind(view);
      // Observe the real admitted projection before React has dismissed the old
      // menu. Raw document transactions are deliberately refused by this app.
      view.update = (transactions) => {
        original(transactions);
        if (!transactions.some((transaction) => transaction.docChanged)) return;
        view.update = original;
        const scroll = view.scrollDOM.scrollTop;
        const dispatch = view.dispatch.bind(view);
        let dispatched = 0;
        view.dispatch = (...specs) => {
          dispatched++;
          Reflect.apply(dispatch, view, specs);
        };
        try {
          (button as HTMLButtonElement).click();
        } finally {
          view.dispatch = dispatch;
        }
        Object.assign(window, {
          staleNavigation: { scroll, after: view.scrollDOM.scrollTop, dispatched },
        });
      };
      view.dispatch({ selection: { anchor: 0 } });
      view.focus();
    });
  await page.keyboard.insertText('new intro ');
  await expect.poll(async () => (await state(page)).text).toBe(`new intro ${before.text}`);
  const result = await page.evaluate(
    () =>
      Reflect.get(window, 'staleNavigation') as
        | { scroll: number; after: number; dispatched: number }
        | undefined,
  );
  expect(result).toBeDefined();
  expect(result!.after).toBe(result!.scroll);
  expect(result!.dispatched).toBe(0);
  await expect(localMenu(page)).toBeHidden();
  expect((await state(page)).selection.ranges[0]!.anchor).toBe(10);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`narrow ${scheme} navigation keeps the deepest breadcrumb and complete outline accessible`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await seed(page, DOCUMENT, 360);
    await atSite(page);
    await page.getByRole('button', { name: 'Sections inside Site', exact: true }).click();
    await localMenu(page).getByRole('button').nth(1).click();
    const leaf = page.getByRole('button', { name: 'Sections inside Launch', exact: true });
    await expect(leaf).toBeInViewport();
    await leaf.click();
    await expect(editor(page)).not.toBeFocused();
    await page.keyboard.press('Escape');
    await expect(localMenu(page)).toBeHidden();
    await expect(page.locator('.shell')).toHaveAttribute('data-goals', 'open');
    await root(page).click();
    await expect(outline(page).getByRole('button')).toHaveCount(7);
    expect(
      await page.locator('.goals').evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
  });
}

test('the full outline remains available before any headings are written', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page);
  await root(page).click();
  await expect(outline(page)).toContainText('Headings will appear here as you add them.');
  await expect(page.locator('.goals-crumb-menu')).toHaveCount(1);
  await expect(editor(page)).not.toBeFocused();
});

test('Goals owns the full outline; each trailing caret drills into its own children without closing', async ({
  page,
}) => {
  await seed(page);
  await top(page);
  const before = await state(page);
  const goals = root(page);
  await expect(goals.locator('svg')).toHaveCount(0);
  const rootCaret = page.getByRole('button', { name: 'Sections inside Goals', exact: true });
  expect(
    await rootCaret.evaluate((e) =>
      e.previousElementSibling?.classList.contains('goals-breadcrumbs'),
    ),
  ).toBe(true);
  await rootCaret.click();
  await expect(localMenu(page).locator('.goals-outline-item > span:first-child')).toHaveText([
    'Work',
    'Home',
  ]);
  await localMenu(page).getByRole('button').first().click();
  await expect(localMenu(page)).toBeVisible();
  await expect(localMenu(page)).toContainText('Inside Work');
  await expect(localMenu(page).locator('.goals-outline-item > span:first-child')).toHaveText([
    'Site',
    'Admin',
  ]);
  await localMenu(page).getByRole('button').first().click();
  await expect(localMenu(page)).toContainText('Inside Site');
  await expect(localMenu(page).getByRole('button')).toHaveCount(2);
  await localMenu(page).getByRole('button').first().click();
  await expect(localMenu(page)).toContainText('Inside Launch');
  await expect(localMenu(page)).toContainText('No subsections here.');
  await expect(localMenu(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(rootCaret).toBeFocused();
  await goals.click();
  await expect(outline(page).getByRole('button')).toHaveCount(7);
  await outline(page).getByRole('button', { name: 'Site', exact: true }).click();
  await expect(localMenu(page)).toContainText('Inside Site');
  expect(await state(page)).toEqual(before);
  const shape = await page.locator('.goals-navigation button').evaluateAll((buttons) =>
    buttons.map((e) => {
      const style = getComputedStyle(e);
      return { height: e.getBoundingClientRect().height, radius: style.borderRadius };
    }),
  );
  expect(new Set(shape.map((s) => s.height)).size).toBe(1);
  expect(shape[0]!.height).toBe(24);
  expect(new Set(shape.map((s) => s.radius)).size).toBe(1);
});
