import { test } from '../release-validation/browser-fixture';
import { openApp } from './openApp';
/**
 * "Hard constraint: static render and mounted editor must be pixel-identical.
 * Text must not shift when an editor mounts" (TRD §4.4), and §11: "static card
 * render and mounted editor produce identical geometry across every supported
 * markdown construct."
 *
 * The two renders share their decoration path by construction (see
 * src/editor/staticRender.ts). What they cannot share is the container geometry
 * CodeMirror injects as an unlayered stylesheet at runtime, which is restated
 * from the same custom properties in src/styles/cards.css. This is the test
 * that keeps the restatement honest.
 */

import { expect, type Page } from '@playwright/test';

/** One construct per card, so a failure names the construct that broke. */
const CARDS = [
  'plain card',
  'title line\nand a description',
  'with **bold** in it',
  'with *italic* in it',
  'with ~~struck~~ text',
  'with `code` inline',
  'see [docs](http://x.co)',
  '# a heading card',
  '## a smaller heading',
  '- a bullet\n- another bullet',
  '- [ ] an open task',
  '- [x] a done task',
  '> a quoted card',
  'plain text',
  'a card that is quite a lot longer than the panel is wide, so that it wraps at least once',
];

const compose = async (page: Page, text: string): Promise<void> => {
  const field = page.locator('.day-panel[data-active="true"] .compose-field');
  await field.click();
  // Enter submits, so a multi-line card is typed with Shift held.
  for (const [index, line] of text.split('\n').entries()) {
    if (index > 0) await page.keyboard.press('Shift+Enter');
    await page.keyboard.insertText(line);
  }
  await page.keyboard.press('Enter');
};

const CARD_AT = (index: number): string =>
  `.day-panel[data-active="true"] .collection[data-section="done"] .card:nth-of-type(${index + 1})`;

/**
 * Every line box inside a card, measured relative to the surface that holds it
 * — `.md-line` when the card is static and `.cm-line` when it is mounted. The
 * two are the same lines rendered by the same decorations, so the numbers have
 * to match construct by construct.
 */
const lineBoxes = (
  page: Page,
  index: number,
): Promise<{ x: number; y: number; w: number; h: number }[]> =>
  page.$eval(`${CARD_AT(index)} .card-surface`, (surface) => {
    const origin = surface.getBoundingClientRect();
    return [...surface.querySelectorAll('.md-line, .cm-line')].map((line) => {
      const rect = line.getBoundingClientRect();
      const round = (value: number): number => Math.round(value * 10) / 10;
      return {
        x: round(rect.x - origin.x),
        y: round(rect.y - origin.y),
        w: round(rect.width),
        h: round(rect.height),
      };
    });
  });

test.describe('static render and mounted editor', () => {
  test('produce identical geometry for every supported construct', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('.day-panel[data-active="true"] .compose-field')).toBeVisible();

    for (const card of CARDS) await compose(page, card);

    const cards = page.locator(
      '.day-panel[data-active="true"] .collection[data-section="done"] .card',
    );
    await expect(cards).toHaveCount(CARDS.length);

    for (const [index, source] of CARDS.entries()) {
      const card = page.locator(CARD_AT(index));
      const surfaceBefore = (await card.locator('.card-surface').boundingBox())!;
      const staticLines = await lineBoxes(page, index);

      // A Done card is guarded: tapping does nothing, which is the point of
      // PRD §5. The unlock control is the explicit action on desktop.
      await card.getByRole('button', { name: 'Unlock' }).click();
      await expect(card).toHaveAttribute('data-editing', 'true');

      const surfaceAfter = (await card.locator('.card-surface').boundingBox())!;
      const mountedLines = await lineBoxes(page, index);

      expect(surfaceAfter.height, `card box changed on mount: ${source}`).toBeCloseTo(
        surfaceBefore.height,
        0,
      );
      expect(surfaceAfter.width, `card width changed on mount: ${source}`).toBeCloseTo(
        surfaceBefore.width,
        0,
      );
      expect(mountedLines, `line geometry changed on mount: ${source}`).toEqual(staticLines);

      await page.keyboard.press('Escape');
      await expect(card).toHaveAttribute('data-editing', 'false');
    }
  });
});

test.describe('the guard on Done cards', () => {
  test('does not become editable by tapping it (PRD §5)', async ({ page }) => {
    await openApp(page);
    await compose(page, 'called the dentist');

    const card = page
      .locator('.day-panel[data-active="true"] .collection[data-section="done"] .card')
      .first();
    await card.locator('.card-surface').click();
    await expect(card).toHaveAttribute('data-editing', 'false');

    await card.getByRole('button', { name: 'Unlock' }).click();
    await expect(card).toHaveAttribute('data-editing', 'true');
  });
});

test.describe('the three-item cap', () => {
  test('is visible before it is hit, and stops at three (PRD §3)', async ({ page }) => {
    await openApp(page);
    const count = page.locator(
      '.day-panel[data-active="true"] .collection[data-section="next"] .collection-count',
    );
    await expect(count).toHaveText('0/3');

    // Master → Next is the deliberate two-step flow; it is also the only way in
    // from the keyboard, which makes it the one to drive here.
    await page.setViewportSize({ width: 1280, height: 900 });
    const master = page.locator('.goals .cm-content');
    await expect(master).toBeVisible();
    await master.click();
    await page.keyboard.insertText('one\ntwo\nthree\nfour');

    await page.keyboard.down('Shift');
    for (let index = 0; index < 3; index++) await page.keyboard.press('ArrowUp');
    await page.keyboard.up('Shift');

    await page.locator('.goals').getByRole('button', { name: 'To Next' }).click();

    await expect(count).toHaveText('3/3');
    await expect(
      page.locator('.day-panel[data-active="true"] .collection[data-section="next"] .card'),
    ).toHaveCount(3);
  });
});
