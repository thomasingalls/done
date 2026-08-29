/** Browser coverage for the viewport-derived part of TRD §8.6. */

import { expect, test, type Page } from '@playwright/test';

const section = (heading: string, count: number): string[] => [
  heading,
  ...Array.from({ length: count }, (_, index) => `body line ${heading} ${index + 1}`),
];

const DOCUMENT = [
  ...section('# Work', 50),
  ...section('## Project', 50),
  ...section('### Phase', 50),
].join('\n');

const seed = async (page: Page): Promise<void> => {
  const content = page.locator('.goals .cm-content');
  await expect(content).toBeVisible();
  await content.click();
  await page.keyboard.insertText(DOCUMENT);
};

test('the Goals breadcrumb follows the scroll edge rather than the cursor', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  const scroller = page.locator('.goals .cm-scroller');
  const breadcrumb = page.locator('.goals .goals-breadcrumbs');
  await seed(page);

  // Insertion leaves the cursor at the end. Moving only the scroll container
  // to the top must nevertheless report the first section.
  await scroller.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(breadcrumb).toHaveAttribute('title', 'Goals › Work');
  await expect(breadcrumb.locator('.goals-outline-indicator svg')).toBeVisible();
  const rootGap = await breadcrumb.evaluate((element) => {
    const root = element.querySelector('.goals-breadcrumb-root')?.getBoundingClientRect();
    const trail = element.querySelector('.goals-breadcrumb-trail-text')?.getBoundingClientRect();
    return root && trail ? trail.left - root.right : Number.POSITIVE_INFINITY;
  });
  expect(rootGap).toBeGreaterThan(0);
  expect(rootGap).toBeLessThan(12);
  const pinnedTop = (await breadcrumb.boundingBox())?.y;

  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(breadcrumb).toHaveAttribute('title', 'Goals › Work › Project › Phase');
  expect((await breadcrumb.boundingBox())?.y).toBe(pinnedTop);
});

test('the outline navigates without moving the editor selection', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await seed(page);

  const content = page.locator('.goals .cm-content');
  const scroller = page.locator('.goals .cm-scroller');
  const breadcrumb = page.locator('.goals .goals-breadcrumbs');
  await scroller.evaluate((element) => {
    element.scrollTop = 0;
  });

  await breadcrumb.click();
  const outline = page.getByRole('navigation', { name: 'Document outline' });
  await expect(outline).toBeVisible();
  await expect(outline.getByRole('button')).toHaveCount(3);
  await expect(outline.getByRole('button', { name: 'Work' })).toHaveAttribute(
    'aria-current',
    'location',
  );

  await outline.getByRole('button', { name: 'Phase' }).click();
  await expect(outline).toBeHidden();
  await expect(content).not.toBeFocused();
  await expect(breadcrumb).toHaveAttribute('title', 'Goals › Work › Project › Phase');
  expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await breadcrumb.click();
  const active = outline.getByRole('button', { name: 'Phase' });
  await expect(active).toHaveAttribute('aria-current', 'location');
  await expect(active).toBeInViewport();
  await page.keyboard.press('Escape');

  // The outline click did not move CodeMirror's selection from the end. When
  // the editor regains focus the way the app returns it — EditorView.focus(),
  // which restores the editor's own selection into the DOM (see App.tsx) —
  // typing therefore continues at the old location. A raw contentDOM.focus()
  // is not that path: it re-activates whatever caret the browser kept, and on
  // a slow run CodeMirror can have dropped the end-of-document line from its
  // rendered viewport, leaving the browser a caret clamped to the rendered
  // top that the editor then adopts as a selection change.
  await content.evaluate((element) => {
    const view = (element as { cmTile?: { root?: { view?: { focus: () => void } } } }).cmTile?.root
      ?.view;
    if (!view) throw new Error('No EditorView behind .cm-content — did cmTile move?');
    view.focus();
  });
  await page.keyboard.insertText('X');
  await expect(content).toContainText('body line ### Phase 50X');
});

test('Escape closes the outline without closing the narrow Goals surface', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto('/');
  const shell = page.locator('.shell');
  await expect(page.locator('.day-panel[data-active="true"] .compose-field')).toBeVisible();
  await page.keyboard.press('Alt+ArrowRight');
  await expect(shell).toHaveAttribute('data-goals', 'open');

  await page.locator('.goals .goals-breadcrumbs').click();
  const outline = page.getByRole('navigation', { name: 'Document outline' });
  await expect(outline).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(outline).toBeHidden();
  await expect(shell).toHaveAttribute('data-goals', 'open');
});
