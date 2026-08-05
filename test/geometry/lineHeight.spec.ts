/**
 * "Line heights must not shift when syntax reveals or hides. Text must never
 * jump under the cursor." (PRD §10, TRD §5.2.)
 *
 * This is the regression test that requirement asks for. It is worth being
 * strict about: it is the most common way live-preview implementations feel
 * bad, and it is invisible in review.
 *
 * Every line here is short enough not to wrap. Wrapping legitimately changes a
 * line's height when hidden syntax shortens it, and that is not the failure
 * under test.
 *
 * The surface measured is the journal — the document editor on the day in
 * focus. Phase 1 measured the only editor there was; there are several now, and
 * the journal is the one present at every breakpoint.
 */

import { expect, test, type Page } from '@playwright/test';

/**
 * Every line is short enough to fit the narrowest project viewport with its
 * syntax revealed — including the link, whose URL is the longest thing that
 * appears and disappears.
 */
const DOCUMENT = [
  'plain line',
  '# Heading one',
  '## Heading two',
  '### Heading three',
  'with **bold**',
  'with *italic*',
  'with ~~struck~~',
  'with `code`',
  'see [docs](http://x.co)',
  '- a bullet',
  '- [ ] open task',
  '- [x] done task',
  '> a quoted line',
  'marked line ^k3f9x2',
  '---',
  'closing line',
].join('\n');

/** The journal on the day in focus. Neighbouring days render static, not live. */
const JOURNAL = '.day-panel[data-active="true"] .journal';

const content = (page: Page) => page.locator(`${JOURNAL} .cm-content`);
const lines = (page: Page) => page.locator(`${JOURNAL} .cm-line`);

const seed = async (page: Page): Promise<void> => {
  await page.goto('/');
  await expect(content(page)).toBeVisible();
  await content(page).click();
  // insertText arrives as one input event, so list continuation and the other
  // Enter behaviours do not rewrite the fixture on the way in.
  await page.keyboard.insertText(DOCUMENT);
  await expect(lines(page)).toHaveCount(DOCUMENT.split('\n').length);
};

const lineBoxes = (page: Page): Promise<{ height: number; top: number }[]> =>
  page.$$eval(`${JOURNAL} .cm-line`, (elements) =>
    elements.map((line) => {
      const rect = line.getBoundingClientRect();
      return { height: Math.round(rect.height * 100) / 100, top: Math.round(rect.top * 100) / 100 };
    }),
  );

test.describe('empty editor geometry', () => {
  test('the native caret matches each placeholder line', async ({ page }) => {
    await page.goto('/');
    await expect(content(page)).toBeVisible();
    await content(page).click();

    const line = lines(page);
    const placeholder = page.locator(`${JOURNAL} .cm-placeholder`);
    const buffer = page.locator(`${JOURNAL} .cm-widgetBuffer`);
    await expect(placeholder).toBeVisible();
    await expect(buffer).toBeAttached();

    const lineGeometry = await line.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontSize: Number(style.fontSize.replace('px', '')),
        lineHeight: Number(style.lineHeight.replace('px', '')),
      };
    });
    const placeholderGeometry = await placeholder.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        lineHeight: Number(getComputedStyle(element).lineHeight.replace('px', '')),
        top: rect.top,
      };
    });
    const bufferGeometry = await buffer.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { height: rect.height, top: rect.top };
    });

    // A native contenteditable caret uses the line-height at its insertion
    // point. Each placeholder line and CodeMirror's zero-width widget buffer
    // must occupy that same 1em box, even when the placeholder wraps.
    expect(lineGeometry.lineHeight).toBeCloseTo(lineGeometry.fontSize, 2);
    expect(placeholderGeometry.lineHeight).toBeCloseTo(lineGeometry.fontSize, 2);
    expect(bufferGeometry.height).toBeCloseTo(lineGeometry.fontSize, 2);
    expect(bufferGeometry.top).toBeCloseTo(placeholderGeometry.top, 2);
  });
});

test.describe('live preview geometry', () => {
  test.beforeEach(async ({ page }) => seed(page));

  test('no line changes height as the cursor moves through the document', async ({ page }) => {
    // Baseline: cursor on the last line, so every other line is in its hidden state.
    await page.keyboard.press('Control+End');
    const baseline = await lineBoxes(page);

    const lineCount = baseline.length;
    for (let index = 0; index < lineCount; index++) {
      await page.keyboard.press('Control+Home');
      for (let step = 0; step < index; step++) await page.keyboard.press('ArrowDown');

      const heights = (await lineBoxes(page)).map((box) => box.height);
      expect(
        heights,
        `line heights changed with the cursor on line ${index + 1}: ${DOCUMENT.split('\n')[index]}`,
      ).toEqual(baseline.map((box) => box.height));
    }
  });

  test('no line moves vertically as the cursor moves through the document', async ({ page }) => {
    await page.keyboard.press('Control+End');
    const baseline = (await lineBoxes(page)).map((box) => box.top);

    for (let index = 0; index < baseline.length; index++) {
      await page.keyboard.press('Control+Home');
      for (let step = 0; step < index; step++) await page.keyboard.press('ArrowDown');
      const tops = (await lineBoxes(page)).map((box) => box.top);
      expect(tops, `text jumped with the cursor on line ${index + 1}`).toEqual(baseline);
    }
  });

  test('the task checkbox does not grow its line', async ({ page }) => {
    await page.keyboard.press('Control+End');
    const boxes = await lineBoxes(page);
    const source = DOCUMENT.split('\n');

    const plain = boxes[source.indexOf('plain line')]!.height;
    expect(boxes[source.indexOf('- [ ] open task')]!.height).toBe(plain);
    expect(boxes[source.indexOf('- [x] done task')]!.height).toBe(plain);
  });

  test('the horizontal rule keeps the height of an ordinary line', async ({ page }) => {
    await page.keyboard.press('Control+End');
    const boxes = await lineBoxes(page);
    const source = DOCUMENT.split('\n');
    expect(boxes[source.indexOf('---')]!.height).toBe(boxes[source.indexOf('plain line')]!.height);
  });

  test('syntax really is hidden when the cursor is away, and shown when it is not', async ({
    page,
  }) => {
    await page.keyboard.press('Control+End');
    // By index, not by text: the text is what changes.
    const boldLine = lines(page).nth(DOCUMENT.split('\n').indexOf('with **bold**'));
    await expect(boldLine).toHaveText('with bold');

    await boldLine.click();
    await expect(boldLine).toHaveText('with **bold**');
  });
});
