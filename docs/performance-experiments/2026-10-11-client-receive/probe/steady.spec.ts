import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { restoreAuthenticator } from '../../../../test/packaged-account/devices';
import { startBackend, startApp, stopAll } from '../../2026-10-10-account-consumers/probe/lib.mjs';
test('deep received history offline cold open and substantial-workspace typing', async ({
  browser,
}) => {
  const output = process.env.DONE_PERF_RESULTS!,
    f = JSON.parse(readFileSync(process.env.DONE_REOPEN_FIXTURE!, 'utf8'));
  mkdirSync(output, { recursive: true });
  const state = join(output, 'state');
  cpSync(f.state, state, { recursive: true, errorOnExist: true });
  let c;
  const result: any = {
    source: process.env.DONE_PERF_SOURCE,
    profiled: process.env.RECEIVE_PROFILE === '1',
  };
  try {
    await startBackend(state, true);
    await startApp(state, true);
    c = await browser.newContext({
      storageState: f.storage,
      viewport: { width: 1440, height: 1000 },
    });
    const p = await c.newPage();
    await restoreAuthenticator(p, f.credentials);
    await p.goto('/');
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.reload();
    await p.waitForFunction(() => !!navigator.serviceWorker.controller);
    await c.setOffline(true);
    await p.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
    await p.getByRole('button', { name: /Resume device connection/ }).click();
    await p.getByLabel('Device-lock code', { exact: true }).fill(f.code);
    const cdp = await c.newCDPSession(p);
    await cdp.send('Performance.enable');
    if (result.profiled) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.start');
    }
    await p.evaluate(() => {
      const w = window as any;
      w.__native = {};
      for (const name of ['decrypt', 'verify', 'digest'] as const) {
        const old = SubtleCrypto.prototype[name];
        (SubtleCrypto.prototype as any)[name] = function (...a: any[]) {
          w.__native[name] = (w.__native[name] ?? 0) + 1;
          return (old as any).apply(this, a);
        };
      }
      w.__frame = null;
      const m = new MutationObserver(() => {
        if (!document.querySelector('.shell')) return;
        m.disconnect();
        requestAnimationFrame(() => requestAnimationFrame(() => (w.__frame = performance.now())));
      });
      m.observe(document, { subtree: true, childList: true });
    });
    const start = await p.evaluate(() => performance.now());
    await p
      .getByRole('button', { name: /^(Unlock enrollment|Unlock and get invitation)$/ })
      .click();
    await p.waitForFunction(
      () => typeof (window as any).__frame === 'number',
      {},
      { timeout: 180000 },
    );
    result.cold = await p.evaluate(
      (s) => ({ ms: (window as any).__frame - s, native: (window as any).__native }),
      start,
    );
    if (result.profiled) {
      const { profile } = await cdp.send('Profiler.stop');
      writeFileSync(join(output, 'cold.cpuprofile'), JSON.stringify(profile));
    }
    await cdp.send('HeapProfiler.collectGarbage');
    result.heap = (await cdp.send('Performance.getMetrics')).metrics.find(
      (m) => m.name === 'JSHeapUsedSize',
    )?.value;
    const download = p.waitForEvent('download');
    await p.getByRole('button', { name: 'Export markdown', exact: true }).click();
    const archive = readFileSync((await (await download).path())!);
    let off = 0;
    const files: Record<string, string> = {};
    while (archive.readUInt32LE(off) === 0x04034b50) {
      const size = archive.readUInt32LE(off + 18),
        n = archive.readUInt16LE(off + 26),
        extra = archive.readUInt16LE(off + 28);
      expect(archive.readUInt16LE(off + 8)).toBe(0);
      const path = archive.toString('utf8', off + 30, off + 30 + n),
        start = off + 30 + n + extra;
      files[path] = archive.toString('utf8', start, start + size);
      off = start + size;
    }
    result.exportHash = createHash('sha256').update(JSON.stringify(files)).digest('hex');
    result.exportBytes = Object.values(files).reduce((n, s) => n + Buffer.byteLength(s), 0);
    const card = p.locator('.card').filter({ hasText: 'Receive target:' }).first();
    await card.locator('.card-surface').press('Enter');
    const editor = p.locator('.card[data-editing="true"] .cm-content');
    await editor.waitFor();
    await p.keyboard.press('ControlOrMeta+End');
    const before = await editor.innerText();
    await p.evaluate(() => {
      const w = window as any,
        rows: any[] = [],
        tasks: any[] = [];
      const content = document.querySelector('.card[data-editing="true"] .cm-content')!;
      const base = content.textContent!.length;
      const read = () => {
        const len = content.textContent!.length;
        for (let i = 0; i < rows.length; i++)
          if (rows[i].visible === null && len >= base + i + 1)
            rows[i].visible = performance.now() - rows[i].at;
      };
      addEventListener(
        'keydown',
        (e) => {
          if (e.key === 'z') {
            const row = {
              at: e.timeStamp,
              frame: null as number | null,
              visible: null as number | null,
            };
            rows.push(row);
            requestAnimationFrame(() =>
              setTimeout(() => (row.frame = performance.now() - row.at), 0),
            );
          }
        },
        true,
      );
      new MutationObserver(read).observe(content, {
        subtree: true,
        childList: true,
        characterData: true,
      });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) tasks.push({ ms: e.duration, at: e.startTime });
      }).observe({ type: 'longtask' });
      w.__typing = () => ({ rows, tasks });
    });
    if (result.profiled) await cdp.send('Profiler.start');
    // The diagnostic-only profile crosses the 128-change maintenance threshold.
    const keys = result.profiled ? 160 : 120;
    for (let i = 0; i < keys; i++) {
      await p.keyboard.press('z');
      await p.waitForTimeout(150);
    }
    await expect(editor).toHaveText(before + 'z'.repeat(keys));
    result.typingFinishedAt = await p.evaluate(() => performance.now());
    // Observe the normal idle maintenance window without forcing a compaction.
    await p.waitForTimeout(2000);
    result.typing = await p.evaluate(() => (window as any).__typing());
    if (result.profiled) {
      const { profile } = await cdp.send('Profiler.stop');
      writeFileSync(join(output, 'typing.cpuprofile'), JSON.stringify(profile));
    }
    result.status = 'passed';
  } catch (e) {
    result.status = 'failed';
    result.error = String(e);
    throw e;
  } finally {
    writeFileSync(join(output, 'result.json'), JSON.stringify(result, null, 2));
    await c?.close();
    await stopAll();
  }
});
