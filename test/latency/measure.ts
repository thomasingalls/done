/**
 * The test-side half of the latency harness (TRD §12).
 *
 * Holds the two things every measurement here needs to agree on: what the
 * corpus is, and how a set of samples is reduced to a number. Both are stated
 * rather than chosen per test, because a baseline is only worth having if the
 * run that is compared against it did the same thing.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { recorder } from './recorder';

/** Today is editable when the active day's compose field is on screen (PRD §4). */
export const COMPOSE = '.day-panel[data-active="true"] .compose-field';
export const CARD_EDITOR = '.card[data-editing="true"] .cm-content';
export const TITLE = '.day-panel[data-active="true"] .panel-title';

/**
 * The corpus every start-up number is measured against.
 *
 * **An empty store is not a baseline.** Cold start is dominated by reading and
 * applying stored updates, so measuring it against nothing would produce a fast
 * number that Stage 1 could not be compared against honestly.
 *
 * **It grows forwards, not backwards.** The freeze is three days (TRD §4.5) and
 * a frozen day has no compose field to seed through, so the only direction with
 * room is the future. Days ahead holding finished cards are semantically odd and
 * structurally identical — the same day collections, the same canonical cards,
 * the same updates on disk — and it is the storage shape that this measures.
 *
 * **Sized so that per-record work is visible.** An earlier version of this used
 * six days and produced a cold start of about 60 ms, which sounds like good news
 * and is useless: Stage 1's per-record decryption would have disappeared into
 * the noise, and the baseline exists precisely to catch it. The corpus is a
 * fixed constant rather than a realistic store — what makes it useful is that
 * the encrypted run can reproduce it exactly.
 */
export const CORPUS = { days: 20, cardsPerDay: 15, masterLines: 400 } as const;

/**
 * What the `android` project throttles the CPU by.
 *
 * Device emulation on its own changes the viewport and the user agent and
 * nothing else, so an unthrottled Pixel 7 project measures the development
 * machine twice and reports it as two devices. Four times slower is the
 * convention Lighthouse uses for a mid-tier phone; it is a stated convention
 * rather than a measurement of any particular handset, and TRD §12's low-end
 * journal budget will still want a real one.
 *
 * It lives here rather than in one spec because two suites now throttle, and a
 * constant that has to agree in two places is a constant that will not.
 */
export const CPU_THROTTLE = 4;

/**
 * What was actually on disk when a start-up number was taken.
 *
 * Recorded because the number is meaningless without it: cold start is
 * dominated by reading and applying stored updates, so "2.5 s against what?"
 * is the whole question when the encrypted run is compared against this one.
 */
export interface StoreProfile {
  records: number;
  bytes: number;
}

export interface Sample {
  project: string;
  metric: string;
  /** Milliseconds. */
  value: number;
  /** Present where the metric is a distribution rather than one event. */
  samples?: number;
  note?: string;
}

const RESULTS = join('test-results', 'latency.jsonl');

export const record = (sample: Sample): void => {
  mkdirSync(dirname(RESULTS), { recursive: true });
  appendFileSync(RESULTS, `${JSON.stringify(sample)}\n`);
};

/** Nearest-rank, so a reported p95 is always a sample that actually happened. */
export const percentile = (samples: readonly number[], p: number): number => {
  // `toSorted` is ES2023 and the app's lib is ES2022; the copy does the same
  // job, which is why `unicorn/no-array-sort` is a warning in .oxlintrc.json.
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1] as number;
};

/** Installs the recorder and arms the boot watch before any app code runs. */
export const install = async (page: Page): Promise<void> => {
  await page.addInitScript(recorder);
  await page.addInitScript((selector: string) => {
    // Queued behind the recorder's own init script, so `latencyProbe` exists.
    window.latencyProbe.watch(selector);
  }, COMPOSE);
};

/** Counts the update records `y-indexeddb` has written, and their size. */
export const storeProfile = (page: Page): Promise<StoreProfile> =>
  page.evaluate(
    () =>
      new Promise<StoreProfile>((resolve, reject) => {
        const request = indexedDB.open('done');
        request.addEventListener('error', () => reject(new Error('could not open the store')));
        request.addEventListener('success', () => {
          const database = request.result;
          const updates = database.transaction('updates').objectStore('updates').getAll();
          updates.addEventListener('error', () =>
            reject(new Error('could not read the updates store')),
          );
          updates.addEventListener('success', () => {
            const rows = updates.result as ArrayBufferLike[];
            resolve({
              records: rows.length,
              bytes: rows.reduce((total, row) => total + row.byteLength, 0),
            });
            database.close();
          });
        });
      }),
  );

/** Milliseconds from navigation start to the compose field being painted. */
export const untilEditable = async (page: Page): Promise<number> => {
  await expect(page.locator(COMPOSE)).toBeVisible();
  await expect
    .poll(() => page.evaluate((s) => window.latencyProbe.read(s), COMPOSE))
    .not.toBeNull();
  return (await page.evaluate((s) => window.latencyProbe.read(s), COMPOSE)) as number;
};

/** The application's own boot marks (`src/lib/marks.ts`), by name. */
export const marks = (page: Page): Promise<Record<string, number>> =>
  page.evaluate(() => window.latencyProbe.marks());

/**
 * Times an interaction from the browser's own event timestamp to the paint that
 * satisfies `selector`. The action must be the next trusted pointer or key
 * event on the page, which is what `armAction` is waiting for.
 */
export const timeAction = async (
  page: Page,
  selector: string,
  act: () => Promise<void>,
): Promise<number> => {
  await page.evaluate((s) => {
    window.latencyProbe.clear(s);
    window.latencyProbe.watch(s);
    window.latencyProbe.armAction();
  }, selector);

  await act();

  await expect
    .poll(() => page.evaluate((s) => window.latencyProbe.read(s), selector))
    .not.toBeNull();
  const [start, painted] = await page.evaluate(
    (s) => [window.latencyProbe.actionStart(), window.latencyProbe.read(s)] as const,
    selector,
  );
  expect(start, 'the action did not produce a trusted event').not.toBeNull();
  return (painted as number) - (start as number);
};

/**
 * Writes the corpus through the interface, rather than into IndexedDB behind
 * the app's back. Slower, and the only version that is certain to produce the
 * shape of update the app actually stores.
 */
export const seed = async (page: Page): Promise<void> => {
  await page.goto('/');
  await expect(page.locator(COMPOSE)).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  const master = page.locator('.goals .cm-content');
  await expect(master).toBeVisible();
  await master.click();
  await page.keyboard.insertText(
    Array.from(
      { length: CORPUS.masterLines },
      (_, index) =>
        `- ${index % 7 === 0 ? '**' : ''}goal ${index + 1}${index % 7 === 0 ? '**' : ''} — a line of the master list`,
    ).join('\n'),
  );

  for (let day = 0; day < CORPUS.days; day += 1) {
    const compose = page.locator(COMPOSE);
    await expect(compose).toBeVisible();
    for (let card = 0; card < CORPUS.cardsPerDay; card += 1) {
      await compose.click();
      await page.keyboard.insertText(
        `day ${day + 1}, card ${card + 1} — something that was finished`,
      );
      await compose.press('Enter');
    }
    if (day < CORPUS.days - 1) {
      // Forwards, because the past freezes after three days and a frozen day
      // has no compose field to write through (TRD §4.5).
      await page.locator('.day-peek[data-edge="bottom"]').click();
      // Clear of the snap, which is 220 ms (App.tsx SNAP_MS).
      await page.waitForTimeout(400);
    }
  }

  // Every update durable before the context is measured or reopened.
  await page.waitForTimeout(1000);

  // A seed that silently does nothing turns every start-up number into a
  // measurement of an empty store reported as a measurement of a full one.
  await page.goto('/');
  await expect(page.locator(COMPOSE)).toBeVisible();
  await expect(
    page.locator('.day-panel[data-active="true"] .collection[data-section="done"] .card'),
  ).toHaveCount(CORPUS.cardsPerDay);
};
