import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  credentials,
  restoreAuthenticator,
  openSaved,
} from '../../../../test/packaged-account/devices';
import {
  startBackend,
  startApp,
  stopAll,
  proxyRows,
} from '../../2026-10-12-receive-attribution/probe/runtime.mjs';
const out = process.env.DONE_PERF_RESULTS!;
mkdirSync(out, { recursive: true });
const goals = '.goals .cm-content';
const cardEditor = '.card[data-editing="true"] .cm-content';
const target = (p: Page) => p.locator('.card').filter({ hasText: 'Project 2:' }).first();
const peerCard = (p: Page) => p.locator('.card').filter({ hasText: 'Project 1:' }).first();
async function text(p: Page, selector = goals) {
  return p.evaluate((selector) => {
    const view = (window as any).__perfEditors.find(
      (v: any) => v.contentDOM === document.querySelector(selector),
    );
    if (!view) throw Error('Missing instrumented editor');
    return view.state.doc.toString();
  }, selector);
}
async function focus(p: Page, kind: string) {
  if (kind === 'card') await target(p).locator('.card-surface').press('Enter');
  else await p.locator(goals).click();
  const selector = kind === 'card' ? cardEditor : goals;
  await p.locator(selector).waitFor();
  await p.keyboard.press('ControlOrMeta+End');
  return selector;
}
async function archive(p: Page) {
  const pending = p.waitForEvent('download');
  await p.getByRole('button', { name: 'Export markdown', exact: true }).click();
  const bytes = readFileSync((await (await pending).path())!);
  let at = 0;
  const files: Record<string, string> = {};
  while (bytes.readUInt32LE(at) === 0x04034b50) {
    expect(bytes.readUInt16LE(at + 8)).toBe(0);
    const size = bytes.readUInt32LE(at + 18),
      n = bytes.readUInt16LE(at + 26),
      extra = bytes.readUInt16LE(at + 28);
    const start = at + 30 + n + extra;
    files[bytes.toString('utf8', at + 30, at + 30 + n)] = bytes.toString(
      'utf8',
      start,
      start + size,
    );
    at = start + size;
  }
  return files;
}
const digest = (value: any) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function sync(p: Page) {
  return p.evaluate(() => (window as any).__perfSync?.());
}
async function settle(p: Page) {
  await expect
    .poll(
      async () => {
        const s = await sync(p);
        return s && ['send', 'receive'].every((k) => s[k].phase === 'idle' && !s[k].reason);
      },
      { timeout: 300000 },
    )
    .toBeTruthy();
}
test('unchanged authority typing with silent, active and backlogged peers', async ({ browser }) => {
  const seed = process.env.ONLINE_SEED === '1';
  const chars = Number(process.env.GOALS_CHARS ?? 12000);
  const kind = process.env.TYPING_TARGET ?? 'card';
  const mode = process.env.TYPING_MODE ?? 'silent';
  const online = true;
  const backlog = mode === 'backlog';

  const original = JSON.parse(readFileSync('/tmp/done-client-receive/fixture.json', 'utf8'));
  const f = process.env.DONE_PAIR_FIXTURE
    ? JSON.parse(readFileSync(process.env.DONE_PAIR_FIXTURE, 'utf8'))
    : original;
  const state = join(out, 'state');
  cpSync(f.state, state, { recursive: true, errorOnExist: true });
  const contexts: any[] = [],
    pages: Page[] = [],
    auths: any[] = [],
    requests: any[] = [],
    errors: string[] = [];
  const result: any = {
    base: '9bf9f3c6',
    arm: process.env.TYPING_ARM,
    mode,
    seed,
    goalsChars: chars,
    kind,
    online,
    cpu: 4,
    delayMs: Number(process.env.RECEIVE_DELAY_MS ?? 0),
  };
  let phase = 'opening';
  try {
    await startBackend(state);
    await startApp(state);
    for (const [index, saved] of [f.a, f.b].entries()) {
      const c = await browser.newContext({
        storageState: saved.storage,
        viewport: { width: 1440, height: 1000 },
      });
      contexts.push(c);
      const p = await c.newPage();
      pages.push(p);
      const pending = new Map();
      p.on('pageerror', (e) => errors.push(e.message));
      p.on('request', (r) => {
        const path = new URL(r.url()).pathname;
        if (!path.startsWith('/account/')) return;
        const row: any = { device: index ? 'B' : 'A', path, phase, at: Date.now() };
        requests.push(row);
        pending.set(r, row);
      });
      p.on('response', (r) => {
        const row = pending.get(r.request());
        if (row) Object.assign(row, { status: r.status(), end: Date.now() });
      });
      p.on('requestfailed', (r) => {
        const row = pending.get(r);
        if (row) Object.assign(row, { failed: true, end: Date.now() });
      });
      auths.push(await restoreAuthenticator(p, saved.credentials));
      await p.goto('/');
      await p.evaluate(() => navigator.serviceWorker.ready);
      await p.reload();
      await p.waitForFunction(() => !!navigator.serviceWorker.controller);
      if (backlog && index) await c.setOffline(true);
      await openSaved(p, saved.code, !!index);
      await p.getByLabel('Go to date', { exact: true }).fill('2026-10-11');
      console.log('opened', index ? 'B' : 'A');
    }
    const [a, b] = pages;
    if (!backlog) await Promise.all(pages.map(settle));
    console.log(backlog ? 'receiver opened offline with backlog' : 'settled pair');
    // Catch up the old writer seed once; compare complete exported writing before timing.
    if (!backlog)
      await expect
        .poll(async () => digest(await archive(a)) === digest(await archive(b)), { timeout: 60000 })
        .toBeTruthy();
    if (seed) {
      await focus(b, 'goals');
      const paragraph = '# Plans\n\n- Follow up with the team and review the project notes.\n';
      const desired = paragraph.repeat(Math.ceil(chars / paragraph.length)).slice(0, chars);
      console.log('seed Goals', chars);
      await b.keyboard.press('ControlOrMeta+a');
      await b.keyboard.insertText(desired);
      await expect.poll(() => text(b), { timeout: 120000 }).toBe(desired);
      await expect.poll(() => text(a), { timeout: 120000 }).toBe(desired);
      await Promise.all(pages.map(settle));
      expect(await archive(a)).toEqual(await archive(b));
      await b.keyboard.press('Escape');
      const next: any = { state };
      result.seedRows = [];
      for (const [index, p] of pages.entries()) {
        await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
        const storage = await contexts[index].storageState({ indexedDB: true });
        next[index ? 'b' : 'a'] = {
          code: (index ? f.b : f.a).code,
          storage,
          credentials: await credentials(auths[index]),
        };
        result.seedRows.push(
          storage.origins.flatMap((o: any) =>
            (o.indexedDB ?? []).flatMap((d: any) =>
              d.stores.map((s: any) => ({ store: s.name, rows: s.records?.length ?? 0 })),
            ),
          ),
        );
      }
      writeFileSync(join(out, 'fixture.json'), JSON.stringify(next), { mode: 0o600 });
      result.phase = 'passed';
      return;
    }
    if (!online) await Promise.all(contexts.map((c) => c.setOffline(true)));
    await peerCard(a).locator('.card-surface').press('Enter');
    await a.keyboard.press('ControlOrMeta+End');
    const peerInitial = await text(a, cardEditor);
    const selector = await focus(b, kind);
    const initial = await text(b, selector);
    result.initialChars = initial.length;
    result.actualGoalsChars = (await text(b)).length;
    await b.waitForTimeout(1500);
    const cdp = await contexts[1].newCDPSession(b);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await b.evaluate((selector) => {
      const view = (window as any).__perfEditors.find(
        (v: any) => v.contentDOM === document.querySelector(selector),
      );
      const initial = view.state.doc.length,
        samples: any[] = [],
        tasks: any[] = [];
      (globalThis as any).__textHandlers = [];
      (globalThis as any).__warmWork = [];
      (globalThis as any).__textWork = [];
      addEventListener(
        'keydown',
        (e) => {
          if (e.key !== 'x') return;
          const row: any = {
            at: performance.now(),
            dispatchMs: Math.max(0, performance.now() - e.timeStamp),
            frame: 0,
          };
          samples.push(row);
          const expected = initial + samples.length;
          const visible = () => {
            if (
              view.state.doc.length >= expected &&
              (view.contentDOM.textContent ?? '').endsWith('x')
            )
              row.frame = performance.now() - row.at;
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
        timeOrigin: performance.timeOrigin,
        samples,
        tasks,
        handlers: [...(globalThis as any).__textHandlers],
        work: [...(globalThis as any).__warmWork],
        textWork: [...(globalThis as any).__textWork],
        visibility: document.visibilityState,
      });
    }, selector);
    result.before = await b.evaluate(() => (window as any).__doneLedgerMetrics());
    result.syncBefore = await Promise.all(pages.map(sync));
    if (process.env.TYPING_PROFILE === '1') {
      await cdp.send('Profiler.enable');
      await cdp.send('Performance.enable');
      const start = await b.evaluate(() => performance.now()),
        m = await cdp.send('Performance.getMetrics'),
        end = await b.evaluate(() => performance.now());
      result.profileClock = {
        monotonicUs: m.metrics.find((x: any) => x.name === 'Timestamp')!.value * 1e6,
        wallMs: (start + end) / 2,
        errorMs: (end - start) / 2,
      };
      await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
      await cdp.send('Profiler.start');
    }
    phase = 'typing';
    result.started = Date.now();
    console.log('timing', process.env.TYPING_ARM, mode);
    if (backlog) await contexts[1].setOffline(false);
    const peerWriting = (async () => {
      if (mode !== 'active') return;
      for (let i = 0; i < 10; i++) {
        await a.waitForTimeout(2000);
        await a.keyboard.press('p');
      }
    })();
    await b.keyboard.type('x'.repeat(120), { delay: 150 });
    await expect.poll(() => text(b, selector)).toBe(initial + 'x'.repeat(120));
    result.ended = Date.now();
    result.after = await b.evaluate(() => (window as any).__doneLedgerMetrics());
    Object.assign(result, await b.evaluate(() => (window as any).__typing()));
    result.syncAfter = await Promise.all(pages.map(sync));
    if (process.env.TYPING_PROFILE === '1')
      writeFileSync(
        join(out, 'typing.cpuprofile'),
        JSON.stringify((await cdp.send('Profiler.stop')).profile),
      );
    writeFileSync(
      join(out, 'before-verification.json'),
      JSON.stringify({ ...result, requests, errors }, null, 2),
    );
    phase = 'verification';
    console.log('typed; verifying');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await peerWriting;
    await b.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => text(b, selector)).toBe(initial + 'x'.repeat(119));
    await b.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(() => text(b, selector)).toBe(initial + 'x'.repeat(120));
    result.undoRedo = true;
    if (!online) await Promise.all(contexts.map((c) => c.setOffline(false)));
    await expect
      .poll(() => text(a, cardEditor))
      .toBe(peerInitial + (mode === 'active' ? 'p'.repeat(10) : ''));
    await expect
      .poll(async () => digest(await archive(a)) === digest(await archive(b)), { timeout: 300000 })
      .toBeTruthy();
    await Promise.all(pages.map(settle));
    result.syncConverged = await Promise.all(pages.map(sync));
    const expected = await archive(b);
    result.converged = true;
    result.exportHash = digest(expected);
    await b.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await contexts[1].setOffline(true);
    await b.goto('/');
    await openSaved(b, f.b.code, true);
    expect(await archive(b)).toEqual(expected);
    result.coldReplay = true;
    expect(errors).toEqual([]);
    result.phase = 'passed';
  } catch (error) {
    result.phase = 'failed';
    result.error = String(error).slice(0, 2000);
    result.syncFailure = await Promise.all(pages.map((p) => sync(p).catch(() => null)));
    throw error;
  } finally {
    writeFileSync(
      join(out, 'result.json'),
      JSON.stringify({ ...result, requests, proxyRows, errors }, null, 2),
    );
    for (const c of contexts) await c.close();
    await stopAll();
  }
});
