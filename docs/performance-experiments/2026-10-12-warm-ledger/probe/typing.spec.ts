import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { restoreAuthenticator, openSaved } from '../../../../test/packaged-account/devices';
import {
  startBackend,
  startApp,
  stopAll,
} from '../../2026-10-12-receive-attribution/probe/runtime.mjs';
const output = process.env.DONE_PERF_RESULTS!;
mkdirSync(output, { recursive: true });
test('realistic Account typing, undo and cold replay', async ({ browser }) => {
  const fixture = JSON.parse(readFileSync(process.env.DONE_REOPEN_FIXTURE!, 'utf8'));
  const state = join(output, 'state');
  cpSync(fixture.state, state, { recursive: true, errorOnExist: true });
  await startBackend(state);
  await startApp(state);
  const rows: any[] = [];
  try {
    for (let run = 0; run < Number(process.env.TYPING_REPEATS ?? 3); run++) {
      const context = await browser.newContext({
        storageState: fixture.storage,
        viewport: { width: 1440, height: 1000 },
      });
      const p = await context.newPage();
      const errors: string[] = [];
      p.on('pageerror', (e) => errors.push(e.message));
      await restoreAuthenticator(p, fixture.credentials);
      try {
        await p.goto('/');
        await p.evaluate(() => navigator.serviceWorker.ready);
        await p.reload();
        await p.waitForFunction(() => !!navigator.serviceWorker.controller);
        await context.setOffline(true);
        await openSaved(p, fixture.code, fixture.joined);
        await p.getByLabel('Go to date', { exact: true }).fill('2026-10-11');
        const card = p.locator('.card').filter({ hasText: 'Receive target:' }).first();
        await card.locator('.card-surface').press('Enter');
        const editor = p.locator('.card[data-editing="true"] .cm-content');
        await editor.waitFor();
        await p.keyboard.press('ControlOrMeta+End');
        const initial = await editor.innerText();
        const cdp = await context.newCDPSession(p);
        await cdp.send('Emulation.setCPUThrottlingRate', {
          rate: Number(process.env.TYPING_CPU ?? 1),
        });
        await p.evaluate(() => {
          const samples: any[] = [],
            tasks: any[] = [];
          (globalThis as any).__textHandlers = [];
          (globalThis as any).__warmWork = [];
          const target = document.querySelector('.card[data-editing="true"] .cm-content')!;
          const initial = target.textContent ?? '';
          addEventListener(
            'keydown',
            (e) => {
              if (e.key !== 'x') return;
              const at = performance.now(),
                row: any = { at, frame: 0 };
              samples.push(row);
              const expectedLength = initial.length + samples.length;
              const visible = () => {
                if ((target.textContent?.length ?? 0) >= expectedLength)
                  row.frame = performance.now() - at;
                else requestAnimationFrame(visible);
              };
              requestAnimationFrame(visible);
            },
            true,
          );
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) tasks.push({ at: e.startTime, ms: e.duration });
          }).observe({ type: 'longtask' });
          (window as any).__typing = () => ({
            samples,
            tasks,
            handlers: [...(globalThis as any).__textHandlers],
            work: [...(globalThis as any).__warmWork],
          });
        });
        const before = await p.evaluate(() => (window as any).__doneLedgerMetrics?.());
        let profileClock;
        if (process.env.TYPING_PROFILE === '1') {
          await cdp.send('Profiler.enable');
          await cdp.send('Performance.enable');
          const before = await p.evaluate(() => performance.now());
          const m = await cdp.send('Performance.getMetrics');
          const after = await p.evaluate(() => performance.now());
          profileClock = {
            monotonicUs: m.metrics.find((m) => m.name === 'Timestamp')!.value * 1000000,
            wallMs: (before + after) / 2,
            errorMs: (after - before) / 2,
          };
          await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
          await cdp.send('Profiler.start');
        }
        await p.keyboard.type('x'.repeat(120), { delay: 150 });
        await expect(editor).toHaveText(initial + 'x'.repeat(120));
        if (process.env.TYPING_PROFILE === '1') {
          const { profile } = await cdp.send('Profiler.stop');
          writeFileSync(join(output, `typing-${run}.cpuprofile`), JSON.stringify(profile));
        }
        const row = {
          run,
          profileClock,
          cpu: Number(process.env.TYPING_CPU ?? 1),
          before,
          after: await p.evaluate(() => (window as any).__doneLedgerMetrics?.()),
          ...(await p.evaluate(() => (window as any).__typing())),
          errors,
        };
        writeFileSync(
          join(output, `typing-${run}-before-replay.json`),
          JSON.stringify(row, null, 2),
        );
        console.log('typed', run);
        // One workspace undo per separately submitted key, across the complete live history.
        for (let i = 0; i < 120; i++) await p.keyboard.press('ControlOrMeta+z');
        await expect(editor).toHaveText(initial);
        for (let i = 0; i < 120; i++) await p.keyboard.press('ControlOrMeta+Shift+z');
        await expect(editor).toHaveText(initial + 'x'.repeat(120));
        await p.keyboard.press('Escape');
        await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
        await p.goto('/');
        await openSaved(p, fixture.code, fixture.joined);
        await p.getByLabel('Go to date', { exact: true }).fill('2026-10-11');
        await expect(card).toContainText(initial + 'x'.repeat(120));
        expect(errors).toEqual([]);
        rows.push({ ...row, replay: true, undoRedo: true });
        writeFileSync(join(output, 'typing.json'), JSON.stringify(rows, null, 2));
        console.log('typing run', run, 'complete');
      } finally {
        await context.close();
      }
    }
  } finally {
    await stopAll();
  }
});
