/**
 * The latency budgets from TRD §12, measured (sequencing.md §3.1, Stage 0).
 *
 * **Why this exists now and not later.** Stage 1 replaces the plaintext store
 * with an encrypted one, adding a key-store read, an unseal and per-record
 * decryption to the boot path. Every number in this file that is not taken
 * before that lands is a number that can never be taken again, and a cold-start
 * regression afterwards would be both invisible and unattributable
 * (docs/performance.md).
 *
 * **Serial, one worker, and deliberately not part of `pnpm check`.** These are
 * measurements, not assertions: two of them running at once measure the
 * contention rather than the app. They are run when someone chooses to take a
 * measurement, which is the same discipline `scripts/check-budget.mjs --record`
 * already uses for the bundle.
 *
 * The budgets are asserted as well as recorded, but softly — a failure here
 * means *go and look*, and sequencing.md §3.2 allows a number the budget has
 * been consciously revised to as an alternative to meeting it.
 */

import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  CARD_EDITOR,
  COMPOSE,
  CORPUS,
  TITLE,
  install,
  marks,
  percentile,
  record,
  seed,
  storeProfile,
  timeAction,
  untilEditable,
} from './measure';

test.describe.configure({ mode: 'serial' });

/** How many keystrokes a p95 is taken over. */
const KEYSTROKES = 120;

/**
 * Milliseconds between keystrokes, and it is not a detail.
 *
 * Pressing keys as fast as the driver allows measures throughput under a
 * firehose: keydowns arrive several to a frame, every pending measurement
 * queues behind every other, and the p95 comes out around 120 ms in a plain
 * textarea — which is a fact about the harness and not about the app.
 * "Keystroke → paint" is a per-keystroke latency, so each keystroke has to be
 * given its own frame. 50 ms is comfortably more than one frame at 60 Hz and is
 * about the cadence of a fast typist.
 */
const KEYSTROKE_GAP_MS = 50;

/** One keystroke per frame, so each is measured on its own. */
const typeSlowly = async (target: Page, key: string): Promise<void> => {
  await target.evaluate(() => window.latencyProbe.armKeystrokes());
  for (let index = 0; index < KEYSTROKES; index += 1) {
    await target.keyboard.press(key);
    await target.waitForTimeout(KEYSTROKE_GAP_MS);
  }
};

/**
 * What the `android` project throttles the CPU by.
 *
 * Device emulation on its own changes the viewport and the user agent and
 * nothing else, so an unthrottled Pixel 7 project measures the development
 * machine twice and reports it as two devices. Four times slower is the
 * convention Lighthouse uses for a mid-tier phone; it is a stated convention
 * rather than a measurement of any particular handset, and TRD §12's low-end
 * journal budget will still want a real one.
 */
const CPU_THROTTLE = 4;

let page: Page;
let project: string;

test.beforeAll(async ({ browser }: { browser: Browser }, info) => {
  project = info.project.name;
  page = await (await browser.newContext()).newPage();
  await install(page);

  if (info.project.name === 'android') {
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  }
});

test.afterAll(async () => {
  await page.context().close();
});

test('start-up, against a seeded store', async () => {
  // 1. First run: nothing stored, nothing cached, no service worker.
  await page.goto('/');
  const firstRun = await untilEditable(page);
  record({ project, metric: 'first run → Today editable', value: firstRun });

  await seed(page);

  // 2. Cold start: a new document, with the corpus on disk and the caches warm.
  //    This is the returning user opening the app, and the TRD §12 row.
  await page.goto('/');
  const cold = await untilEditable(page);
  const boot = await marks(page);
  const store = await storeProfile(page);
  record({
    project,
    metric: 'cold start → Today editable',
    value: cold,
    note:
      `${CORPUS.days}d × ${CORPUS.cardsPerDay} cards, ${CORPUS.masterLines}-line master; ` +
      `${store.records} update records, ${(store.bytes / 1024).toFixed(1)} kB on disk`,
  });

  // Content-root load is bracketed by the app's own marks because there is no
  // DOM signal for it — and it is the row Stage 1 changes most.
  const contentRoot = (boot['done:content-root'] ?? 0) - (boot['done:store-open'] ?? 0);
  record({ project, metric: 'content-root load (encoded state)', value: contentRoot });
  record({
    project,
    metric: 'boot: module graph evaluated',
    value: boot['done:boot'] ?? 0,
    note: 'fetch, parse, compile and initialise, before any store work',
  });

  // 3. Warm start: the same document reloaded, so the JS code cache, the
  //    service worker and the connection are all hot.
  await page.reload();
  const warm = await untilEditable(page);
  record({ project, metric: 'warm start → Today editable', value: warm });

  expect(cold, 'cold start → Today editable (TRD §12)').toBeLessThan(2500);
  expect(warm, 'warm start → Today editable (TRD §12)').toBeLessThan(1000);
  expect(contentRoot, 'content-root load (TRD §12)').toBeLessThan(500);
});

test('keystroke → paint, in the compose field', async () => {
  await page.goto('/');
  const compose = page.locator(COMPOSE);
  await expect(compose).toBeVisible();
  await compose.click();

  await typeSlowly(page, 'a');
  const samples = await page.evaluate(() => window.latencyProbe.readKeystrokes());
  expect(samples.length).toBeGreaterThan(KEYSTROKES / 2);

  const p95 = percentile(samples, 95);
  record({
    project,
    metric: 'keystroke → paint, compose field',
    value: p95,
    samples: samples.length,
    note: 'a plain textarea — the PRD §4 flow, nothing to mount',
  });
  expect(p95, 'keystroke → paint p95 (TRD §12)').toBeLessThan(16);
});

test('keystroke → paint, in a card editor', async () => {
  await page.goto('/');
  await scheduleOneCard(page);

  const card = page.locator('.card[data-section="scheduled"]').first();
  await card.locator('.card-surface').click();
  await expect(page.locator(CARD_EDITOR)).toBeVisible();

  await typeSlowly(page, 'b');
  const samples = await page.evaluate(() => window.latencyProbe.readKeystrokes());
  expect(samples.length).toBeGreaterThan(KEYSTROKES / 2);

  const p95 = percentile(samples, 95);
  record({
    project,
    metric: 'keystroke → paint, card editor',
    value: p95,
    samples: samples.length,
    note: 'CodeMirror with live preview and the decoration path — the sustained-typing surface',
  });
  expect(p95, 'keystroke → paint p95 (TRD §12)').toBeLessThan(16);
});

test('card focus → editable', async () => {
  await page.goto('/');
  await scheduleOneCard(page);

  const card = page.locator('.card[data-section="scheduled"]').first();
  const elapsed = await timeAction(page, CARD_EDITOR, async () => {
    await card.locator('.card-surface').click();
  });

  record({
    project,
    metric: 'card focus → editable',
    value: elapsed,
    note: 'tap on a Scheduled card to a mounted, painted CodeMirror instance',
  });
  expect(elapsed, 'card focus → editable (TRD §12)').toBeLessThan(50);
});

/**
 * Two paths, and they are not the same measurement.
 *
 * A peek, the menu and `t` all call `goTo`, which swaps the date immediately.
 * A drag or Alt-Arrow calls `step`, which animates for `SNAP_MS` (220 ms in
 * App.tsx) and swaps the date underneath once the movement has landed — so its
 * settled figure can never be under 100 ms, by construction and on purpose.
 *
 * TRD §12 has one row and does not say which of these it means, or whether
 * "navigation" is the app responding or the day being in place. All four
 * numbers are recorded so the question can be answered from evidence rather
 * than re-argued; only the reading that is unambiguous is asserted.
 */
const navigate = async (
  target: Page,
  path: string,
  act: () => Promise<void>,
): Promise<{ response: number; settled: number }> => {
  await target.goto('/');
  await expect(target.locator(COMPOSE)).toBeVisible();
  const before = await target.locator(TITLE).textContent();

  await target.evaluate(() => window.latencyProbe.armAction());
  await act();
  await expect(target.locator(TITLE)).not.toHaveText(before ?? '');

  // The date swap is the last thing to happen, so one more painted frame after
  // it is the settled state.
  const painted = await target.evaluate(
    () =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() => setTimeout(() => resolve(performance.now()), 0));
      }),
  );
  const [started, responded] = await target.evaluate(
    () => [window.latencyProbe.actionStart(), window.latencyProbe.actionPainted()] as const,
  );

  const response = (responded as number) - (started as number);
  const settled = painted - (started as number);

  record({
    project,
    metric: `day-to-day navigation, ${path} (response)`,
    value: response,
    note: 'to the first painted frame after the event',
  });
  record({
    project,
    metric: `day-to-day navigation, ${path} (settled)`,
    value: settled,
    note: 'to the new day painted in place',
  });

  return { response, settled };
};

test('day-to-day navigation, by peek', async () => {
  const { response, settled } = await navigate(page, 'goTo', async () => {
    await page.locator('.day-peek[data-edge="bottom"]').click();
  });

  // `goTo` has no animation in it, so both readings are the app's own cost and
  // the budget applies to either.
  expect(response, 'day-to-day navigation, first response (TRD §12)').toBeLessThan(100);
  expect(settled, 'day-to-day navigation, day in place (TRD §12)').toBeLessThan(100);
});

test('day-to-day navigation, by keyboard', async () => {
  const { response } = await navigate(page, 'step', async () => {
    await page.keyboard.press('Alt+ArrowDown');
  });

  // Only the response. The settled figure is recorded but deliberately not
  // asserted: it is 220 ms of chosen animation plus the work, and asserting it
  // would be asserting SNAP_MS.
  expect(response, 'day-to-day navigation, first response (TRD §12)').toBeLessThan(100);
});

/** Goals is the only way into Scheduled, and Scheduled cards mount on tap. */
const scheduleOneCard = async (target: Page): Promise<void> => {
  await target.setViewportSize({ width: 1280, height: 900 });
  await expect(target.locator(COMPOSE)).toBeVisible();
  const master = target.locator('.goals .cm-content');
  await expect(master).toBeVisible();
  await master.click();
  await target.keyboard.insertText('a card to open and type into');
  await target.locator('.goals').getByRole('button', { name: 'To Scheduled' }).click();
  await expect(target.locator('.card[data-section="scheduled"]').first()).toBeVisible();
};
