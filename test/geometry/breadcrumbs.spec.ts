/** Browser coverage for the viewport-derived part of TRD §8.6. */

import { expect, test } from '@playwright/test';

const section = (heading: string, count: number): string[] => [
  heading,
  ...Array.from({ length: count }, (_, index) => `body line ${heading} ${index + 1}`),
];

const DOCUMENT = [
  ...section('# Work', 50),
  ...section('## Project', 50),
  ...section('### Phase', 50),
].join('\n');

test('the Goals breadcrumb follows the scroll edge rather than the cursor', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  const content = page.locator('.goals .cm-content');
  const scroller = page.locator('.goals .cm-scroller');
  const breadcrumb = page.locator('.goals .goals-breadcrumbs');
  await expect(content).toBeVisible();

  await content.click();
  await page.keyboard.insertText(DOCUMENT);

  // Insertion leaves the cursor at the end. Moving only the scroll container
  // to the top must nevertheless report the first section.
  await scroller.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(breadcrumb).toHaveAttribute('aria-label', 'Goals › Work');
  const pinnedTop = (await breadcrumb.boundingBox())?.y;

  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(breadcrumb).toHaveAttribute('aria-label', 'Goals › Work › Project › Phase');
  expect((await breadcrumb.boundingBox())?.y).toBe(pinnedTop);
});
