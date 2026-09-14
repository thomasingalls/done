/** Diagnostic pilot: two reverse-order blocks, then separate profiled observations. */
import { test } from '../release-validation/browser-fixture';
import { expect, type Page } from '@playwright/test';
import {
  CARD_EDITOR,
  COMPOSE,
  CPU_THROTTLE,
  install,
  openLocal,
  seed,
  percentile,
  record,
  lockLocal,
} from './measure';
import { profile } from './profile';

test.describe.configure({ mode: 'serial' });
const count = 120,
  gapMs = 50;
let app: Page, control: Page;
const typing = async (page: Page, key: string, n = count) => {
  await page.evaluate(() => window.latencyProbe.armKeystrokes());
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(gapMs);
  }
  const samples = await page.evaluate(() => window.latencyProbe.readKeystrokes());
  expect(samples).toHaveLength(n);
  expect(samples.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
  return samples;
};
test.beforeAll(async ({ browser }, info) => {
  const { baseURL, viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = info.project.use;
  expect(baseURL).toBeTruthy();
  const contextOptions = {
    baseURL: baseURL!,
    ...(viewport ? { viewport } : {}),
    ...(deviceScaleFactor === undefined ? {} : { deviceScaleFactor }),
    ...(isMobile === undefined ? {} : { isMobile }),
    ...(hasTouch === undefined ? {} : { hasTouch }),
    ...(userAgent === undefined ? {} : { userAgent }),
  };
  const context = await browser.newContext(contextOptions);
  app = await context.newPage();
  control = await (
    await browser.newContext({ ...contextOptions, serviceWorkers: 'block' })
  ).newPage();
  for (const page of [app, control]) {
    await install(page);
    if (info.project.name === 'android') {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  await app.bringToFront();
  await openLocal(app);
  await seed(app);
  await openLocal(app);
  await expect(app.locator(COMPOSE)).toBeVisible();
  await app.locator('.goals .cm-content').click();
  await app.keyboard.insertText('a card to open and type into');
  await app.locator('.goals').getByRole('button', { name: 'To Scheduled' }).click();
  await app.locator('.card[data-section="scheduled"] .card-surface').first().click();
  await expect(app.locator(CARD_EDITOR)).toBeVisible();
  await control.goto('/diagnostic-control/test/latency/control.html');
  await expect(control).toHaveTitle('Disposable latency controls');
  await expect(control.locator('#plain')).toBeVisible();
  await expect(control.locator('#bare .cm-content')).toBeVisible();
});
test.afterAll(async () => {
  await control?.context().close();
  await app?.context().close();
});

test('calibrate textarea, bare CodeMirror and admitted card in reverse-order blocks', async ({
  browser,
}, info) => {
  expect(browser.isConnected()).toBe(true);
  const rows = [];
  for (const [block, order] of [
    ['textarea', 'codemirror', 'card'],
    ['card', 'codemirror', 'textarea'],
  ].entries()) {
    for (const surface of order) {
      const page = surface === 'card' ? app : control;
      await page.bringToFront();
      const target = page.locator(
        surface === 'card' ? CARD_EDITOR : surface === 'textarea' ? '#plain' : '#bare .cm-content',
      );
      await target.click();
      await page.keyboard.press('ControlOrMeta+End');
      const samples = await typing(page, 'b');
      if (surface === 'textarea') await expect(target).toHaveValue('b'.repeat(count * (block + 1)));
      else await expect(target).toContainText('b'.repeat(count * (block + 1)));
      const row = { project: info.project.name, block: block + 1, surface, samples };
      rows.push(row);
      await info.attach(surface + '-' + (block + 1) + '.json', {
        body: JSON.stringify(row),
        contentType: 'application/json',
      });
      record({
        project: info.project.name,
        metric: surface + ' block ' + (block + 1),
        value: percentile(samples, 95),
        samples: samples.length,
        note:
          'Diagnostic p95, not qualification. 120 trusted keys, 50 ms gaps; 1280x900; CPU ' +
          (info.project.name === 'android' ? 4 : 1) +
          'x; two reverse-order blocks. No baseline subtraction.',
      });
      console.log('Calibration', info.project.name, surface, block + 1, percentile(samples, 95));
    }
  }
  expect(rows).toHaveLength(6);
});

test('profile card typing and focus separately and verify writing through a cold reopen', async ({
  browser,
}, info) => {
  expect(browser.isConnected()).toBe(true);
  await app.bringToFront();
  await app.locator(CARD_EDITOR).click();
  await app.keyboard.press('ControlOrMeta+End');
  await profile(app, info, 'card-typing', async () => {
    await typing(app, 'p', 60);
  });
  await expect(app.locator(CARD_EDITOR)).toContainText('p'.repeat(60));
  await app.keyboard.press('Escape');
  await profile(app, info, 'card-focus', async () => {
    for (let i = 0; i < 10; i++) {
      await app.locator('.card[data-section="scheduled"] .card-surface').first().click();
      await expect(app.locator(CARD_EDITOR)).toBeVisible();
      await app.keyboard.press('Escape');
      await expect(app.locator(CARD_EDITOR)).toHaveCount(0);
    }
  });
  await lockLocal(app);
  await openLocal(app);
  const card = app.locator('.card[data-section="scheduled"]').first();
  await expect(card).toContainText('b'.repeat(count * 2));
  await expect(card).toContainText('p'.repeat(60));
});
