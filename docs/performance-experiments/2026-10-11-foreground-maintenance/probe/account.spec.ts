import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { restoreAuthenticator } from '../../../../test/packaged-account/devices';
import { startBackend, startApp, stopAll } from '../../2026-10-10-account-consumers/probe/lib.mjs';
test('deep Account compaction and arriving foreground input', async ({ browser }) => {
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
  const collision = process.env.MAINTENANCE_COLLISION === '1';
  result.collision = collision;
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
    let attempt = 0;
    const inputJobs: Promise<void>[] = [];
    await p.exposeFunction('__maintenanceStart', () => {
      if (collision && ++attempt === 1)
        inputJobs.push(
          (async () => {
            await new Promise((r) => setTimeout(r, 25));
            await p.keyboard.press('z');
          })(),
        );
    });
    await p.evaluate(() => {
      const w = window as any,
        native = window.setTimeout;
      w.__maintenance = { starts: [], keys: [], tasks: [], transactions: [] };
      const tx = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args: any[]) {
        const result = (tx as any).apply(this, args);
        const record = {
          at: performance.now(),
          mode: result.mode,
          ms: null as number | null,
          aborted: false,
        };
        w.__maintenance.transactions.push(record);
        result.addEventListener('complete', () => {
          record.ms = performance.now() - record.at;
        });
        result.addEventListener('abort', () => {
          record.ms = performance.now() - record.at;
          record.aborted = true;
        });
        return result;
      };
      window.setTimeout = ((fn: TimerHandler, delay?: number, ...args: any[]) =>
        native(() => {
          if (delay === 750) {
            w.__maintenance.starts.push(performance.now());
            void w.__maintenanceStart();
          }
          if (typeof fn !== 'function') throw Error('Unexpected string timer');
          fn(...args);
        }, delay)) as typeof window.setTimeout;
      const content = document.querySelector('.card[data-editing="true"] .cm-content')!;
      const base = content.textContent!.length;
      addEventListener(
        'keydown',
        (e) => {
          if (e.key === 'z') w.__maintenance.keys.push({ at: e.timeStamp, visible: null });
        },
        true,
      );
      new MutationObserver(() => {
        for (let i = 0; i < w.__maintenance.keys.length; i++) {
          const key = w.__maintenance.keys[i];
          if (key.visible === null && content.textContent!.length >= base + i + 1)
            key.visible = performance.now() - key.at;
        }
      }).observe(content, { subtree: true, childList: true, characterData: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries())
          w.__maintenance.tasks.push({ at: e.startTime, ms: e.duration });
      }).observe({ type: 'longtask' });
    });
    if (result.profiled) await cdp.send('Profiler.start');
    // The restored receiver has 125 content records. Three separately flushed inputs
    // cross the real 128-record threshold; no carrier or admission internals are called.
    for (let i = 0; i < 3; i++) {
      await p.keyboard.press('z');
      await p.waitForTimeout(500);
    }
    await p.waitForTimeout(4500);
    await Promise.all(inputJobs);
    await expect(editor).toHaveText(before + 'z'.repeat(collision ? 4 : 3));
    result.maintenance = await p.evaluate(() => (window as any).__maintenance);
    expect(result.maintenance.starts.length).toBeGreaterThan(0);
    result.retained = await p.evaluate(async () => {
      for (const entry of await indexedDB.databases()) {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(entry.name!);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          if (!db.objectStoreNames.contains('content')) continue;
          return await new Promise((resolve, reject) => {
            const tx = db.transaction(['content', 'heads', 'outbound']);
            const counts: Record<string, number> = {};
            for (const name of ['content', 'heads', 'outbound']) {
              const request = tx.objectStore(name).count();
              request.onsuccess = () => {
                counts[name] = request.result;
              };
            }
            tx.oncomplete = () => resolve(counts);
            tx.onabort = () => reject(tx.error);
          });
        } finally {
          db.close();
        }
      }
      throw Error('Content carrier missing');
    });
    expect(result.retained.content).toBeLessThanOrEqual(2);
    expect(result.retained.heads).toBe(662);
    expect(result.retained.outbound).toBeGreaterThanOrEqual(143);
    if (result.profiled) {
      const { profile } = await cdp.send('Profiler.stop');
      writeFileSync(join(output, 'maintenance.cpuprofile'), JSON.stringify(profile));
    }
    const expectedText = await editor.innerText();
    await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await p.goto('/');
    await p.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
    await p.getByRole('button', { name: /Resume device connection/ }).click();
    await p.getByLabel('Device-lock code', { exact: true }).fill(f.code);
    await p
      .getByRole('button', { name: /^(Unlock enrollment|Unlock and get invitation)$/ })
      .click();
    await expect(p.locator('.shell')).toContainText(expectedText, { timeout: 30000 });
    result.reopenedMatches = true;
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
