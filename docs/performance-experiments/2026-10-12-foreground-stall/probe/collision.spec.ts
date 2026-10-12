import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { restoreAuthenticator } from '../../../../test/packaged-account/devices';
import {
  startBackend,
  startApp,
  stopAll,
} from '../../2026-10-12-receive-attribution/probe/runtime.mjs';
async function exported(p: Page) {
  const download = p.waitForEvent('download');
  await p.getByRole('button', { name: 'Export markdown', exact: true }).click();
  const b = readFileSync((await (await download).path())!);
  let at = 0;
  const files: Record<string, string> = {};
  while (b.readUInt32LE(at) === 0x04034b50) {
    expect(b.readUInt16LE(at + 8)).toBe(0);
    const size = b.readUInt32LE(at + 18),
      n = b.readUInt16LE(at + 26),
      extra = b.readUInt16LE(at + 28);
    const name = b.toString('utf8', at + 30, at + 30 + n),
      start = at + 30 + n + extra;
    files[name] = b.toString('utf8', start, start + size);
    at = start + size;
  }
  return files;
}
test('input during the full reference audit, followed by complete audit and cold replay', async ({
  browser,
}) => {
  const out = process.env.DONE_PERF_RESULTS!,
    f = JSON.parse(readFileSync(process.env.DONE_REOPEN_FIXTURE!, 'utf8'));
  mkdirSync(out, { recursive: true });
  const state = join(out, 'state');
  cpSync(f.state, state, { recursive: true, errorOnExist: true });
  const result: any = { controlledThresholds: true, build: process.env.DONE_PERF_DIST };
  let c;
  try {
    await startBackend(state, true);
    await startApp(state, true);
    c = await browser.newContext({
      storageState: f.storage,
      viewport: { width: 1440, height: 1000 },
    });
    await c.addInitScript({ path: new URL('./browser-stall.js', import.meta.url).pathname });
    const p = await c.newPage();
    await restoreAuthenticator(p, f.credentials);
    await p.goto('/');
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.reload();
    await p.waitForFunction(() => !!navigator.serviceWorker.controller);
    await c.setOffline(true);
    const unlock = async () => {
      await p.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
      await p.getByRole('button', { name: /Resume device connection/ }).click();
      await p.getByLabel('Device-lock code', { exact: true }).fill(f.code);
      await p
        .getByRole('button', { name: /^(Unlock enrollment|Unlock and get invitation)$/ })
        .click();
      await p.locator('.shell').waitFor({ timeout: 180000 });
      await p.getByLabel('Go to date', { exact: true }).fill('2026-10-11');
    };
    await unlock();
    await p.waitForTimeout(3000);
    const beforeArchive = await exported(p);
    const card = p.locator('.card').filter({ hasText: 'Receive target:' }).first();
    await card.locator('.card-surface').press('Enter');
    const editor = p.locator('.card[data-editing="true"] .cm-content');
    await p.keyboard.press('ControlOrMeta+End');
    const before = await editor.innerText();
    let attempts = 0;
    const jobs: Promise<void>[] = [];
    await p.exposeFunction('__auditStarted', () => {
      if (++attempts !== 1) return;
      jobs.push(
        (async () => {
          await new Promise((r) => setTimeout(r, 25));
          result.inputSentAt = Date.now();
          await p.keyboard.press('q');
          result.inputResolvedAt = Date.now();
        })(),
      );
    });
    await p.evaluate(() => {
      const w = window as any;
      w.__stall.reset();
      w.__collision = { keys: [], tasks: [] };
      const content = document.querySelector('.card[data-editing="true"] .cm-content')!;
      addEventListener(
        'keydown',
        (e) => {
          if (e.key === 'q') w.__collision.keys.push({ at: Date.now(), visible: null });
        },
        true,
      );
      new MutationObserver(() => {
        const key = w.__collision.keys.at(-1);
        if (key && key.visible === null && content.textContent?.endsWith('q'))
          key.visible = Date.now();
      }).observe(content, { subtree: true, childList: true, characterData: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries())
          w.__collision.tasks.push({ at: performance.timeOrigin + e.startTime, ms: e.duration });
      }).observe({ type: 'longtask' });
      w.__stallArmed = true;
    });
    let profiler: any;
    if (process.env.STALL_PROFILE === '1') {
      profiler = await c.newCDPSession(p);
      await profiler.send('Performance.enable');
      const began = Date.now(),
        m = await profiler.send('Performance.getMetrics');
      result.profileClock = {
        monotonicUs: m.metrics.find((x: any) => x.name === 'Timestamp').value * 1000000,
        wallMs: (began + Date.now()) / 2,
        errorMs: (Date.now() - began) / 2,
      };
      await profiler.send('Profiler.enable');
      await profiler.send('Profiler.setSamplingInterval', { interval: 1000 });
      await profiler.send('Profiler.start');
    }
    result.started = Date.now();
    result.before = await p.evaluate(() => (window as any).__doneLedgerMetrics());
    await p.keyboard.press('z');
    await expect(editor).toHaveText(before + 'zq', { timeout: 30000 });
    await Promise.all(jobs);
    // Wait well past the next durable idle opportunity; do not score a postponed audit as success.
    await p.waitForTimeout(7000);
    result.after = await p.evaluate(() => ({
      ledger: (window as any).__doneLedgerMetrics(),
      stall: (window as any).__stall.read(),
      collision: (window as any).__collision,
    }));
    expect(result.after.ledger.audits).toBeGreaterThan(result.before.audits);
    expect(result.after.ledger.mismatches).toBe(0);
    const done = result.after.stall.spans.filter(
      (s: any) => s.name === 'accountReceive.ts.checkFull',
    );
    expect(done.length).toBeGreaterThan(0);
    if (process.env.STALL_EXPECT_REPAIR === '1') {
      expect(
        result.after.ledger.auditInterruptions - result.before.auditInterruptions,
      ).toBeGreaterThan(0);
      expect(result.after.ledger.auditCompletions - result.before.auditCompletions).toBeGreaterThan(
        0,
      );
      // No cold/full verification was displaced into the foreground input after cancellation.
      expect(result.after.ledger.full - result.before.full).toBe(
        result.after.ledger.audits - result.before.audits,
      );
    }
    result.auditAttempts = attempts;
    result.caughtAt = Date.now();
    result.catchupCapture = { tasks: result.after.collision.tasks };
    if (profiler)
      writeFileSync(
        join(out, 'catchup.cpuprofile'),
        JSON.stringify((await profiler.send('Profiler.stop')).profile),
      );
    const afterArchive = await exported(p);
    const changed = Object.keys(afterArchive).filter((k) => afterArchive[k] !== beforeArchive[k]);
    expect(changed).toHaveLength(1);
    expect(afterArchive[changed[0]!]).toBe(
      beforeArchive[changed[0]!].replace(before, before + 'zq'),
    );
    result.exportsDifferOnlyByTypedKeys = true;
    await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await p.goto('/');
    await unlock();
    expect(await exported(p)).toEqual(afterArchive);
    result.coldReplayMatches = true;
    result.status = 'passed';
  } catch (e) {
    result.status = 'failed';
    result.error = String(e);
    throw e;
  } finally {
    writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2));
    await c?.close();
    await stopAll();
  }
});
