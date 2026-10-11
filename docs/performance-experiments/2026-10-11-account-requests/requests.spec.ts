import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createdAccount } from '../../../test/device-enrollment/helpers';
import { pairedEditors, add } from '../../../test/packaged-account/devices';
import { startService, stopService } from '../../../test/packaged-account/server';

test('bounded sustained request volume', async ({ page, browser }) => {
  const output = process.env.REQUEST_OUTPUT!;
  if (!process.env.REQUEST_SOURCE) throw Error('An explicit backend source is required');
  process.chdir(process.env.REQUEST_SOURCE);
  console.log('backend source', process.cwd());
  mkdirSync(output, { recursive: true });
  const service = await startService(output + '/state', process.env.REQUEST_DIST!, true, true);
  const rows: any[] = [],
    timings: any[] = [];
  let phase = 'setup',
    pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  const watch = (p: Page, device: string) => {
    const requests = new Map();
    p.on('request', (r) => {
      const path = new URL(r.url()).pathname;
      if (!path.startsWith('/account/') && !path.startsWith('/__account-setup/')) return;
      const row = { device, phase, path, start: Date.now() };
      rows.push(row);
      requests.set(r, row);
    });
    p.on('response', (r) => {
      const row = requests.get(r.request());
      if (row) Object.assign(row, { status: r.status(), end: Date.now() });
    });
    p.on('requestfailed', (r) => {
      const row = requests.get(r);
      if (row) Object.assign(row, { failed: r.failure()?.errorText, end: Date.now() });
    });
  };
  watch(page, 'A');
  let result: any = { condition: process.env.REQUEST_CONDITION, keysPerDevice: 600 };
  try {
    console.log('setup begins');
    if (process.env.REQUEST_DEVICES === '2') {
      pair = await pairedEditors(page, browser, true, {
        beforeCompare: async (second) => watch(second, 'B'),
      });
    } else await createdAccount(page);
    console.log('editors open');
    const writers = pair ? [page, pair.second] : [page];
    for (let i = 0; i < writers.length; i++) await add(writers[i]!, 'Probe card ' + i);
    if (pair)
      for (const p of writers)
        for (let i = 0; i < 2; i++)
          await expect(p.locator('.shell')).toContainText('Probe card ' + i, { timeout: 15000 });
    for (let i = 0; i < writers.length; i++) {
      await writers[i]!.locator('.card')
        .filter({ hasText: 'Probe card ' + i })
        .first()
        .locator('.card-surface')
        .press('Enter');
      await writers[i]!.locator('.card[data-editing="true"] .cm-content').waitFor();
      await writers[i]!.keyboard.press('ControlOrMeta+End');
    }
    await page.waitForTimeout(2000);
    console.log('typing begins');
    phase = 'typing';
    const started = Date.now();
    const expected = writers.map((_, i) => (' abcdefghijklmnop' + i).repeat(36).slice(0, 600));
    await Promise.all(
      writers.map(async (p, i) => {
        const starts = [];
        for (const ch of expected[i]!) {
          if (starts.length % 100 === 0) console.log('typed', i, starts.length);
          starts.push(Date.now());
          await p.keyboard.press(ch === ' ' ? 'Space' : ch);
          await p.waitForTimeout(150);
        }
        timings.push({ device: i, starts, end: Date.now() });
      }),
    );
    const typed = Date.now();
    phase = 'drain';
    for (const p of writers) await p.keyboard.press('Escape');
    // Whole card text, not just an end marker, must converge on both editors.
    for (const p of writers)
      for (let i = 0; i < writers.length; i++)
        await expect(
          p
            .locator('.card')
            .filter({ hasText: 'Probe card ' + i })
            .first(),
        ).toContainText(expected[i]!, { timeout: Math.max(1, 15000 - (Date.now() - typed)) });
    await expect
      .poll(() => rows.filter((r) => r.path === '/account/delivery/submit').every((r) => r.end), {
        timeout: 15000,
      })
      .toBe(true);
    await page.waitForTimeout(2000);
    result = { ...result, started, typed, end: Date.now(), timings, rows };
    const active = rows.filter((r) => r.phase === 'typing' || r.phase === 'drain');
    const scoped = active.filter(
      (r) => !r.path.includes('/notifications/') && !r.path.includes('/session/'),
    );
    const submits = scoped.filter((r) => r.path === '/account/delivery/submit' && r.status === 200);
    const counts = Object.fromEntries(
      [...new Set(scoped.map((r) => r.path))].map((path) => [
        path,
        scoped.filter((r) => r.path === path).length,
      ]),
    );
    result.summary = {
      durationMs: typed - started,
      requests: scoped.length,
      submits: submits.length,
      requestsPerKey: scoped.length / (writers.length * 600),
      requestsPerSubmit: scoped.length / submits.length,
      refusals: active.filter((r) => r.status === 429).length,
      counts,
      convergenceMs: result.end - typed,
    };
    console.log(JSON.stringify(result.summary));
    if (process.env.REQUEST_CONDITION !== 'baseline') {
      expect(result.summary.refusals).toBe(0);
      if (!pair) {
        expect(result.summary.requestsPerKey).toBeLessThanOrEqual(0.6);
        expect(result.summary.requestsPerSubmit).toBeLessThanOrEqual(1.2);
      }
    }
  } catch (e) {
    result.error = String(e);
    throw e;
  } finally {
    writeFileSync(output + '/requests.json', JSON.stringify({ ...result, timings, rows }, null, 2));
    await pair?.other.close();
    await stopService(service);
  }
});
