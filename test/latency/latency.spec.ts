/** Current factor-gated Local latency. Factor entry is setup, measured separately from application work.
 * One worker, no retries, the original workload and numeric budgets. Desktop and CPU-throttled
 * Android emulation are observations on this host, not handset or immutable-release qualification.
 */
import { test } from '../release-validation/browser-fixture';
import { expect, type Browser, type Page } from '@playwright/test';
import {
  CARD_EDITOR,
  COMPOSE,
  CORPUS,
  CPU_THROTTLE,
  TITLE,
  install,
  marks,
  percentile,
  record as saveRecord,
  seed,
  storeProfile,
  timeAction,
  untilLocalPrompt,
  unlockLocal,
  openLocal,
  lockLocal,
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

// Timing failures are reported after collecting this project; functional failures remain immediate.
const budgetErrors: string[] = [];
const budget = (check: () => void) => {
  try {
    check();
  } catch (error) {
    budgetErrors.push(
      test.info().title + ': ' + (error instanceof Error ? error.message : String(error)),
    );
  }
};
let page: Page;
let project: string;
const record = (sample: Parameters<typeof saveRecord>[0]) =>
  saveRecord({
    ...sample,
    note:
      (sample.note ?? 'Single observation.') +
      ' Viewport ' +
      JSON.stringify(page.viewportSize()) +
      '; CPU ' +
      (project === 'android' ? CPU_THROTTLE : 1) +
      'x.',
  });

test.beforeAll(async ({ browser }: { browser: Browser }, info) => {
  project = info.project.name;
  budgetErrors.length = 0;
  const { baseURL, viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = info.project.use;
  if (!baseURL) throw Error('The latency fixture requires its configured origin.');
  page = await (
    await browser.newContext({
      baseURL,
      ...(viewport === undefined ? {} : { viewport }),
      ...(deviceScaleFactor === undefined ? {} : { deviceScaleFactor }),
      ...(isMobile === undefined ? {} : { isMobile }),
      ...(hasTouch === undefined ? {} : { hasTouch }),
      ...(userAgent === undefined ? {} : { userAgent }),
    })
  ).newPage();
  await install(page);

  if (info.project.name === 'android') {
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  }
});

test.afterAll(async () => {
  await page.context().close();
  expect(budgetErrors, 'Latency budgets failed; remaining measurements were retained').toEqual([]);
});

test('start-up, against a seeded store', async () => {
  await page.goto('/');
  const firstPrompt = await untilLocalPrompt(page);
  record({
    project,
    metric: 'fresh launch → create prompt',
    value: firstPrompt,
    note: 'Empty disposable origin; no factor entry included.',
  });
  const creation = await unlockLocal(page);
  record({
    project,
    metric: 'confirm creation → Today editable',
    value: creation,
    note: 'Trusted confirmation event after code entry through painted editor; includes Local genesis.',
  });
  await seed(page); // returns locked, after verifying the entire corpus through a cold reopen
  const store = await storeProfile(page);
  const corpus = `${CORPUS.days}d × ${CORPUS.cardsPerDay} cards, ${CORPUS.masterLines}-line master; ${store.records} encrypted content records, ${store.bytes} ciphertext/nonce bytes; ${store.journalEntries} journal entries, ${store.journalUtf8Bytes} UTF-8 key/value bytes. Payload census, not filesystem allocation.`;

  await page.goto('/');
  const coldPrompt = await untilLocalPrompt(page),
    cold = await unlockLocal(page);
  record({ project, metric: 'cold launch → unlock prompt', value: coldPrompt, note: corpus });
  record({
    project,
    metric: 'cold factor submit → Today editable',
    value: cold,
    note: 'Trusted confirmation after factor entry; includes routing, custody, authenticated replay and painted UI.',
  });
  const boot = await marks(page);
  const start = boot['done:admission-load-start'],
    ready = boot['done:admission-load-ready'],
    moduleGraph = boot['done:boot'];
  for (const value of [start, ready, moduleGraph])
    expect(Number.isFinite(value), 'Required current-path timing mark is missing').toBe(true);
  expect(ready!).toBeGreaterThanOrEqual(start!);
  const contentRoot = ready! - start!;
  record({
    project,
    metric: 'encrypted content load and replay',
    value: contentRoot,
    note: 'Factor already open: createAdmissionOwner carrier read/decrypt, journal-inclusive Yjs replay and owner initialization. Not the retired plaintext startup boundary.',
  });
  record({
    project,
    metric: 'boot: module graph evaluated',
    value: moduleGraph!,
    note: 'Navigation through fetch, parse, compile and entry-module initialization.',
  });

  await lockLocal(page);
  await page.reload();
  const warmPrompt = await untilLocalPrompt(page),
    warm = await unlockLocal(page);
  record({
    project,
    metric: 'warm launch → unlock prompt',
    value: warmPrompt,
    note: 'Same tab and warm caches; factor entry excluded.',
  });
  record({
    project,
    metric: 'warm factor submit → Today editable',
    value: warm,
    note: 'Trusted confirmation after factor entry through painted editor.',
  });
  budget(() => {
    expect(
      coldPrompt + cold,
      'Cold application work excluding factor entry (TRD §12)',
    ).toBeLessThan(2500);
  });
  budget(() => {
    expect(
      warmPrompt + warm,
      'Warm application work excluding factor entry (TRD §12)',
    ).toBeLessThan(1000);
  });
  budget(() => {
    expect(contentRoot, 'Encrypted content load/replay (TRD §12)').toBeLessThan(500);
  });
});

test('keystroke → paint, in the compose field', async () => {
  await openLocal(page);
  const compose = page.locator(COMPOSE);
  await expect(compose).toBeVisible();
  await compose.click();

  await typeSlowly(page, 'a');
  await expect(compose).toHaveValue('a'.repeat(KEYSTROKES));
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
  budget(() => {
    expect(p95, 'keystroke → paint p95 (TRD §12)').toBeLessThan(16);
  });
});

test('keystroke → paint, in a card editor', async () => {
  await openLocal(page);
  await scheduleOneCard(page);

  const card = page.locator('.card[data-section="scheduled"]').first();
  await card.locator('.card-surface').click();
  await expect(page.locator(CARD_EDITOR)).toBeVisible();

  await typeSlowly(page, 'b');
  await expect(page.locator(CARD_EDITOR)).toContainText('b'.repeat(KEYSTROKES));
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
  budget(() => {
    expect(p95, 'keystroke → paint p95 (TRD §12)').toBeLessThan(16);
  });
});

test('card focus → editable', async () => {
  await openLocal(page);
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
  budget(() => {
    expect(elapsed, 'card focus → editable (TRD §12)').toBeLessThan(50);
  });
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
  await openLocal(target);
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
  budget(() => {
    expect(response, 'day-to-day navigation, first response (TRD §12)').toBeLessThan(100);
  });
  budget(() => {
    expect(settled, 'day-to-day navigation, day in place (TRD §12)').toBeLessThan(100);
  });
});

test('day-to-day navigation, by keyboard', async () => {
  const { response } = await navigate(page, 'step', async () => {
    await page.keyboard.press('Alt+ArrowDown');
  });

  // Only the response. The settled figure is recorded but deliberately not
  // asserted: it is 220 ms of chosen animation plus the work, and asserting it
  // would be asserting SNAP_MS.
  budget(() => {
    expect(response, 'day-to-day navigation, first response (TRD §12)').toBeLessThan(100);
  });
});

/** Goals is the only way into Scheduled, and Scheduled cards mount on tap. */
const scheduleOneCard = async (target: Page): Promise<void> => {
  await target.setViewportSize({ width: 1280, height: 900 });
  await expect(target.locator(COMPOSE)).toBeVisible();
  const master = target.locator('.goals .cm-content');
  await expect(master).toBeVisible();
  await master.click();
  await target.keyboard.insertText('a card to open and type into');
  await target.locator('.goals').getByRole('button', { name: 'Scheduled' }).click();
  await expect(target.locator('.card[data-section="scheduled"]').first()).toBeVisible();
};
