import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadavg } from 'node:os';
import { restoreAuthenticator, openSaved } from '../../../../test/packaged-account/devices';
import {
  startBackend,
  startApp,
  stopAll,
} from '../../2026-10-12-receive-attribution/probe/runtime.mjs';
const out = process.env.DONE_PERF_RESULTS!;
mkdirSync(out, { recursive: true });
const digest = (b: any) => createHash('sha256').update(b).digest('hex');
async function archive(p: Page) {
  const waiting = p.waitForEvent('download');
  await p.getByRole('button', { name: 'Export markdown', exact: true }).click();
  const bytes = readFileSync((await (await waiting).path())!);
  let at = 0;
  const files: Record<string, string> = {};
  while (bytes.readUInt32LE(at) === 0x04034b50) {
    expect(bytes.readUInt16LE(at + 8)).toBe(0);
    const size = bytes.readUInt32LE(at + 18),
      n = bytes.readUInt16LE(at + 26),
      extra = bytes.readUInt16LE(at + 28),
      start = at + 30 + n + extra;
    files[bytes.toString('utf8', at + 30, at + 30 + n)] = bytes.toString(
      'utf8',
      start,
      start + size,
    );
    at = start + size;
  }
  return {
    hash: digest(JSON.stringify(Object.fromEntries(Object.entries(files).sort()))),
    bytes: Object.values(files).reduce((n, s) => n + Buffer.byteLength(s), 0),
  };
}
async function prepare(p: Page, f: any) {
  await restoreAuthenticator(p, f.credentials);
  await p.goto('/');
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload();
  await p.waitForFunction(() => !!navigator.serviceWorker.controller);
  await p.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
  await p.getByRole('button', { name: /Resume device connection/ }).click();
  await p.getByLabel('Device-lock code', { exact: true }).fill(f.code);
  await p.context().setOffline(true);
}
async function unlock(p: Page) {
  await p.evaluate(() => {
    (window as any).__frame = undefined;
    const observer = new MutationObserver(() => {
      if (!document.querySelector('.shell')?.getClientRects().length) return;
      observer.disconnect();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          (window as any).__frame = performance.now();
        }),
      );
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  });
  const at = await p.evaluate(() => performance.now());
  await p.getByRole('button', { name: /^(Unlock enrollment|Unlock and get invitation)$/ }).click();
  const open = p.getByRole('button', { name: 'Open your writing', exact: true });
  await expect(p.locator('.shell').or(open)).toBeVisible({ timeout: 120000 });
  if (await open.isVisible()) await open.click();
  await p.waitForFunction(() => typeof (window as any).__frame === 'number', undefined, {
    timeout: 120000,
  });
  return p.evaluate(
    (at) => ({
      frameMs: (window as any).__frame - at,
      metrics: (window as any).__doneLedgerMetrics(),
      native: { ...(window as any).__cryptoCounts },
    }),
    at,
  );
}
async function monitor(p: Page) {
  await p.addInitScript(() => {
    (window as any).__cryptoCounts = {};
    (window as any).__tasks = [];
    for (const name of [
      'verify',
      'decrypt',
      'digest',
      'importKey',
      'deriveKey',
      'encrypt',
      'sign',
    ]) {
      const fn = (SubtleCrypto.prototype as any)[name];
      (SubtleCrypto.prototype as any)[name] = function (...args: any[]) {
        const c = (window as any).__cryptoCounts;
        c[name] = (c[name] ?? 0) + 1;
        return fn.apply(this, args);
      };
    }
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        (window as any).__tasks.push({ at: e.startTime, ms: e.duration });
    }).observe({ type: 'longtask' });
  });
}
async function cut(p: Page, r: number) {
  return p.evaluate(async (r) => {
    const owner = (window as any).__depthOwner;
    await owner.workspace.whenDurable();
    const t = performance.now();
    const result = await owner.removeLocalHistory(r);
    return { ms: performance.now() - t, result };
  }, r);
}
const diff = (a: any, b: any) =>
  Object.fromEntries(Object.keys(b).map((k) => [k, b[k] - (a[k] ?? 0)]));
test('packaged deep received history, paired complete and reduced', async ({ browser }) => {
  const path = process.env.DONE_REOPEN_FIXTURE!;
  const f = JSON.parse(readFileSync(path, 'utf8'));
  const state = join(out, 'state');
  cpSync(f.state, state, { recursive: true, errorOnExist: true });
  const rows: any[] = [];
  const report: any = { fixtureSha256: digest(readFileSync(path)), source: '354c9c59', rows };
  const save = () => writeFileSync(join(out, 'results.json'), JSON.stringify(report, null, 2));
  try {
    await startBackend(state);
    await startApp(state);
    const c = await browser.newContext({ storageState: f.storage });
    const p = await c.newPage();
    await monitor(p);
    await prepare(p, f);
    await unlock(p);
    report.expected = await archive(p);
    report.before = (await c.storageState({ indexedDB: true })).origins.flatMap((o: any) =>
      (o.indexedDB ?? []).flatMap((d: any) =>
        d.stores.map((s: any) => ({ store: s.name, rows: s.records.length })),
      ),
    );
    const profile = process.env.CUT_PROFILE === '1' ? await c.newCDPSession(p) : undefined;
    if (profile) {
      await profile.send('Profiler.enable');
      await profile.send('Profiler.start');
    }
    report.cut = await cut(p, 0);
    if (profile)
      writeFileSync(
        join(out, 'cut.cpuprofile'),
        JSON.stringify((await profile.send('Profiler.stop')).profile),
      );
    expect(report.cut.result.kind).toBe('removed');
    expect(await archive(p)).toEqual(report.expected);
    await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    const reduced = await c.storageState({ indexedDB: true });
    await c.close();
    writeFileSync(
      join(out, 'reduced-fixture.json'),
      JSON.stringify({ ...f, state, storage: reduced }),
      { mode: 0o600 },
    );
    save();
    await stopAll();
    if (process.env.CUT_PROFILE === '1') return;
    for (let rep = 0; rep < 3; rep++)
      for (const arm of rep % 2 ? ['reduced', 'complete'] : ['complete', 'reduced']) {
        console.log('packaged', rep, arm);
        const runState = join(out, `state-${rep}-${arm}`);
        cpSync(f.state, runState, { recursive: true, errorOnExist: true });
        await startBackend(runState);
        await startApp(runState);
        const context = await browser.newContext({
          storageState: arm === 'complete' ? f.storage : reduced,
        });
        const p = await context.newPage();
        const errors: string[] = [];
        p.on('pageerror', (e) => errors.push(e.message));
        const row: any = { rep, arm, load: loadavg() };
        try {
          await monitor(p);
          await prepare(p, f);
          row.cold = await unlock(p);
          expect(await archive(p)).toEqual(report.expected);
          const cdp = await context.newCDPSession(p);
          await cdp.send('HeapProfiler.collectGarbage');
          row.heap = await cdp.send('Runtime.getHeapUsage');
          // Real online scheduler, silent peer. No simulated bypass of network login or authority.
          await context.setOffline(false);
          await expect
            .poll(
              () =>
                p.evaluate(() => {
                  const s = (window as any).__depthOwner.sync.status;
                  return ['send', 'receive'].every((k) => s[k].phase === 'idle' && !s[k].reason);
                }),
              { timeout: 120000 },
            )
            .toBeTruthy();
          await p.getByLabel('Go to date', { exact: true }).fill('2026-10-11');
          const card = p.locator('.card').filter({ hasText: 'Receive target:' }).first();
          await card.locator('.card-surface').press('Enter');
          const editor = p.locator('.card[data-editing="true"] .cm-content');
          await editor.waitFor();
          await p.keyboard.press('ControlOrMeta+End');
          const initial = await editor.innerText();
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
          await p.evaluate(() => {
            (window as any).__keys = [];
            (window as any).__tasks = [];
            addEventListener(
              'keydown',
              (e) => {
                if (e.key !== 'x') return;
                const row = { at: performance.now(), frame: 0 };
                (window as any).__keys.push(row);
                requestAnimationFrame(() => {
                  row.frame = performance.now() - row.at;
                });
              },
              true,
            );
          });
          row.before = await p.evaluate(() => (window as any).__doneLedgerMetrics());
          await p.keyboard.type('x'.repeat(120), { delay: 150 });
          await expect(editor).toHaveText(initial + 'x'.repeat(120));
          row.after = await p.evaluate(() => (window as any).__doneLedgerMetrics());
          row.work = diff(row.before.work, row.after.work);
          Object.assign(
            row,
            await p.evaluate(() => ({
              keys: (window as any).__keys,
              tasks: (window as any).__tasks,
              sync: (window as any).__depthOwner.sync.status,
            })),
          );
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
          await p.keyboard.press('ControlOrMeta+z');
          await expect(editor).toHaveText(initial + 'x'.repeat(119));
          await p.keyboard.press('ControlOrMeta+Shift+z');
          await expect(editor).toHaveText(initial + 'x'.repeat(120));
          row.undoRedo = true;
          await p.evaluate(() => (window as any).__depthOwner.workspace.whenDurable());
          const expected = await archive(p);
          await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
          await context.setOffline(true);
          await p.goto('/');
          await openSaved(p, f.code, true);
          expect(await archive(p)).toEqual(expected);
          row.recovered = true;
          expect(errors).toEqual([]);
          row.phase = 'passed';
        } catch (e) {
          row.error = String(e);
          row.phase = 'failed';
          throw e;
        } finally {
          row.errors = errors;
          rows.push(row);
          save();
          await context.close();
          await stopAll();
        }
      }
  } finally {
    save();
    await stopAll();
  }
});
