import { decodeInboundRequest } from '../../../../account-protocol/inboundTransport';
import { decodeSubmit } from '../../../../account-protocol/deliveryTransport';
import { decodeSubmission } from '../../../../account-protocol/submission';
import { decodeNetworkEnvelope } from '../../../../account-protocol/envelope';
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import {
  pairedEditors,
  credentials,
  restoreAuthenticator,
  add,
} from '../../../../test/packaged-account/devices';
import { startBackend, startApp, stopAll, proxyRows } from './runtime.mjs';
const root = process.env.DONE_PERF_FIXTURE_ROOT!,
  out = process.env.DONE_PERF_RESULTS!;
mkdirSync(out, { recursive: true });
const target = (p: Page) => p.locator('.card').filter({ hasText: 'Receive target:' }).first();
const editor = (p: Page) => p.locator('.card[data-editing="true"] .cm-content');
async function focus(p: Page) {
  await target(p).locator('.card-surface').press('Enter');
  await editor(p).waitFor();
  await p.keyboard.press('ControlOrMeta+End');
}
async function fixtureDay(p: Page) {
  await p.getByLabel('Go to date', { exact: true }).fill('2026-10-11');
  await expect(target(p).locator('.card-surface')).toHaveAttribute('tabindex', '0');
}
async function openFixture(p: Page, code: string, joined: boolean) {
  await p.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
  await p
    .getByRole('button', { name: joined ? /Resume device connection/ : /^Unlock Device owner/ })
    .click();
  await p.getByLabel('Device-lock code', { exact: true }).fill(code);
  await p
    .getByRole('button', {
      name: joined
        ? /^(Unlock enrollment|Unlock and get invitation)$/
        : 'Confirm code and unlock with passkey',
    })
    .click();
  await p.locator('.shell').waitFor({ timeout: 180000 });
}
async function exported(p: Page) {
  const waiting = p.waitForEvent('download');
  await p.getByRole('button', { name: 'Export markdown', exact: true }).click();
  const d = await waiting;
  const bytes = readFileSync((await d.path())!);
  let offset = 0;
  const files: Record<string, string> = {};
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    expect(bytes.readUInt16LE(offset + 8)).toBe(0);
    const size = bytes.readUInt32LE(offset + 18),
      n = bytes.readUInt16LE(offset + 26),
      extra = bytes.readUInt16LE(offset + 28);
    const path = bytes.toString('utf8', offset + 30, offset + 30 + n),
      start = offset + 30 + n + extra;
    files[path] = bytes.toString('utf8', start, start + size);
    offset = start + size;
  }
  return files;
}
const now = () => Date.now();
function observe() {
  const rows: any[] = [];
  const tasks: any[] = [];
  const keys: any[] = [];
  const read = () => {
    const card = [...document.querySelectorAll('.card')].find((c) =>
      c.textContent?.includes('Receive target:'),
    );
    const text = card?.textContent ?? '';
    if (rows.at(-1)?.text !== text) rows.push({ at: Date.now(), text });
  };
  const m = new MutationObserver(read);
  m.observe(document, { childList: true, characterData: true, subtree: true });
  read();
  new PerformanceObserver((l) => {
    for (const e of l.getEntries())
      tasks.push({ at: performance.timeOrigin + e.startTime, ms: e.duration });
  }).observe({ type: 'longtask' });
  addEventListener(
    'keydown',
    (e) => {
      if (e.key.length !== 1) return;
      const row = { at: Date.now(), ms: 0 };
      keys.push(row);
      requestAnimationFrame(() => setTimeout(() => (row.ms = performance.now() - e.timeStamp), 0));
    },
    true,
  );
  (window as any).__receiveProbe = () => ({ rows, tasks, keys });
}
test('client receive matched fixture', async ({ page, browser }) => {
  const rows: any[] = [];
  let phase = 'setup';
  let pair: any;
  let contexts: any[] = [];
  const watch = (p: Page, device: string) => {
    const pending = new Map();
    p.on('request', (r) => {
      const path = new URL(r.url()).pathname;
      if (!path.startsWith('/account/')) return;
      const row: any = { device, path, phase, at: now() };
      if (path.endsWith('/read-v2')) {
        const q = decodeInboundRequest(new Uint8Array(r.postDataBuffer()!));
        Object.assign(row, { self: q.publisher === q.reader, after: q.after, limit: q.limit });
      }
      if (path.endsWith('/submit')) {
        const submitted = decodeSubmit(new Uint8Array(r.postDataBuffer()!));
        row.position = decodeNetworkEnvelope(decodeSubmission(submitted.bytes).envelope).seq;
      }
      rows.push(row);
      pending.set(r, row);
    });
    p.on('response', (r) => {
      const row = pending.get(r.request());
      if (row) Object.assign(row, { status: r.status(), end: now() });
    });
    p.on('requestfailed', (r) => {
      const row = pending.get(r);
      if (row)
        Object.assign(row, { failed: true, failedAt: now(), failure: r.failure()?.errorText });
    });
  };
  const submitCount = () =>
    rows.filter(
      (r) => r.device === 'A' && r.path === '/account/delivery/submit' && r.status === 200,
    ).length;
  const state = join(out, 'state');
  const result: any = {
    source: process.env.DONE_PERF_SOURCE,
    build: process.env.DONE_PERF_DIST,
    delayMs: Number(process.env.RECEIVE_DELAY_MS ?? 0),
    diagnostic: process.env.RECEIVE_DIAGNOSTIC === '1',
    phase: 'starting',
  };
  let profileSession: any;
  const metrics = (p: Page) =>
    p.evaluate(() => ({
      at: Date.now(),
      ledger: (window as any).__doneLedgerMetrics?.(),
      probe: (window as any).__attribution?.read(),
    }));
  try {
    if (process.env.RECEIVE_SEED === '1') {
      await startBackend(state, true);
      await startApp(state, true);
      watch(page, 'A');
      pair = await pairedEditors(page, browser, true, {
        beforeInvite: async () => {
          for (let i = 0; i < 120; i++) {
            await add(
              page,
              `Project ${i}: ` + 'Review notes, decisions and next actions. '.repeat(10),
            );
            if (i % 30 === 0) console.log('cards', i);
          }
          const goals = page.locator('.goals .cm-content');
          await goals.click();
          await page.keyboard.insertText(
            '# Plans\n\n- Follow up with the team and review the project notes.\n'.repeat(200),
          );
          await page.keyboard.press('Escape');
        },
      });
      await add(page, 'Receive target: ');
      await expect(target(pair.second)).toBeVisible({ timeout: 30000 });
      await pair.other.setOffline(true);
      await focus(page);
      let expected = await editor(page).innerText();
      for (let i = 0; i < 600; i++) {
        const before = submitCount();
        const text = String(i % 10);
        await page.keyboard.insertText(text);
        expected += text;
        await expect
          .poll(submitCount, { timeout: 30000, intervals: [25, 50, 100] })
          .toBeGreaterThan(before);
        if (i % 50 === 0) console.log('positions', i + 1);
      }
      await page.keyboard.press('Escape');
      for (const p of [page, pair.second])
        await p.getByRole('button', { name: 'Lock workspace', exact: true }).click();
      const fixture = {
        state,
        expected,
        a: {
          code: pair.first.code,
          storage: await page.context().storageState({ indexedDB: true }),
          credentials: await credentials(pair.first.auth),
        },
        b: {
          code: pair.next.code,
          storage: await pair.other.storageState({ indexedDB: true }),
          credentials: await credentials(pair.next.auth),
        },
      };
      writeFileSync(join(root, 'fixture.json'), JSON.stringify(fixture), { mode: 0o600 });
      console.log('fixture saved');
      return;
    }
    const f = JSON.parse(readFileSync(join(root, 'fixture.json'), 'utf8'));
    cpSync(f.state, state, { recursive: true, errorOnExist: true });
    await startBackend(state, true);
    await startApp(state, true);
    const pages: Page[] = [];
    const auths: any[] = [];
    for (const [i, saved] of [f.a, f.b].entries()) {
      const c = await browser.newContext({
        storageState: saved.storage,
        viewport: { width: 1440, height: 1000 },
      });
      contexts.push(c);
      if (process.env.RECEIVE_DIAGNOSTIC === '1')
        await c.addInitScript({
          path: new URL('./browser-diagnostics.js', import.meta.url).pathname,
        });
      const p = await c.newPage();
      pages.push(p);
      watch(p, i ? 'B' : 'A');
      auths.push(await restoreAuthenticator(p, saved.credentials));
      await p.goto('/');
      await p.evaluate(() => navigator.serviceWorker.ready);
      await p.reload();
      await p.waitForFunction(() => !!navigator.serviceWorker.controller);
      await c.setOffline(true);
      await openFixture(p, saved.code, !!i);
      await fixtureDay(p);
      await p.evaluate(observe);
    }
    const [a, b] = pages;
    result.before = await metrics(b);
    if (process.env.RECEIVE_DIAGNOSTIC === '1') {
      profileSession = await b.context().newCDPSession(b);
      await profileSession.send('Profiler.enable');
      await profileSession.send('Profiler.setSamplingInterval', { interval: 1000 });
      await profileSession.send('Profiler.start');
    }
    phase = 'catchup';
    result.started = now();
    await contexts[0].setOffline(false);
    await contexts[1].setOffline(false);
    // A due sender must make progress even while B is draining its backlog.
    await add(b, 'Receiver send sentinel');
    const writing = (async () => {
      await focus(a);
      result.writerStarts = [];
      for (let i = 0; i < 120; i++) {
        result.writerStarts.push(now());
        await a.keyboard.press('w');
        await a.waitForTimeout(150);
      }
      await a.keyboard.press('Escape');
    })();
    if (process.env.RECEIVE_WRITER_ONLY === '1') {
      await writing;
      await a.waitForTimeout(2500);
      await expect(target(a)).toContainText('w'.repeat(120));
      await expect(a.locator('.shell')).toContainText('Receiver send sentinel', { timeout: 15000 });
      result.mode = 'writer-only';
      result.finishedAt = now();
      result.phase = 'passed';
      return;
    }
    try {
      await expect(target(b)).toContainText(f.expected, { timeout: 600000 });
    } catch (cause) {
      if (process.env.RECEIVE_FINISH_BASELINE !== '1') throw cause;
      // Preserve the primary deadline outcome. A separately labelled continuation
      // supplies the complete pair needed for secondary live-delay measurements.
      result.primaryDeadlineMissedAt = now();
      console.log('primary deadline missed; continuing only for secondary observations');
      await expect(target(b)).toContainText(f.expected, { timeout: 600000 });
    }
    result.caughtAt = now();
    console.log('caught', result.caughtAt - result.started);
    result.after = await metrics(b);
    if (profileSession) {
      const { profile } = await profileSession.send('Profiler.stop');
      writeFileSync(join(out, 'catchup.cpuprofile'), JSON.stringify(profile));
      profileSession = undefined;
    }
    await writing;
    await expect(target(b)).toContainText('w'.repeat(120), { timeout: 30000 });
    await expect(a.locator('.shell')).toContainText('Receiver send sentinel', { timeout: 30000 });
    result.catchupCapture = await b.evaluate(() => (window as any).__receiveProbe());
    phase = 'live';
    await focus(a);
    result.live = [];
    for (let i = 0; i < 12; i++) {
      const text = ` L${i};`;
      const start = now();
      await a.keyboard.insertText(text);
      await expect(target(b)).toContainText(text, { timeout: 30000 });
      result.live.push({ ms: now() - start });
    }
    phase = 'typing';
    await focus(b);
    const start = now();
    for (let i = 0; i < 120; i++) {
      await b.keyboard.press('x');
      await b.waitForTimeout(150);
    }
    result.typing = { start, end: now() };
    await b.keyboard.press('Escape');
    await expect(target(a)).toContainText('x'.repeat(120), { timeout: 30000 });
    result.capture = await b.evaluate(() => (window as any).__receiveProbe());
    phase = 'verification';
    const expectedArchive = await exported(a);
    expect(await exported(b)).toEqual(expectedArchive);
    result.exportBytes = Object.values(expectedArchive).reduce(
      (n, s) => n + Buffer.byteLength(s),
      0,
    );
    phase = 'cold';
    await b.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    await b.goto('/');
    await contexts[1].setOffline(true);
    await b.evaluate(() => {
      (window as any).__frame = undefined;
      const m = new MutationObserver(() => {
        if (!document.querySelector('.shell')) return;
        m.disconnect();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => ((window as any).__frame = performance.now())),
        );
      });
      m.observe(document, { subtree: true, childList: true });
    });
    await b.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
    await b.getByRole('button', { name: /Resume device connection/ }).click();
    await b.getByLabel('Device-lock code', { exact: true }).fill(f.b.code);
    const coldStart = await b.evaluate(() => performance.now());
    await b
      .getByRole('button', { name: /^(Unlock enrollment|Unlock and get invitation)$/ })
      .click();
    await b.locator('.shell').waitFor({ timeout: 180000 });
    await b.waitForFunction(() => typeof (window as any).__frame === 'number');
    result.coldMs = await b.evaluate((s) => (window as any).__frame - s, coldStart);
    await fixtureDay(b);
    await expect(target(b)).toContainText(f.expected);
    await expect(target(b)).toContainText('x'.repeat(120));
    expect(await exported(b)).toEqual(expectedArchive);
    const cdp = await b.context().newCDPSession(b);
    await cdp.send('Performance.enable');
    await cdp.send('HeapProfiler.collectGarbage');
    result.heap = (await cdp.send('Performance.getMetrics')).metrics.find(
      (m) => m.name === 'JSHeapUsedSize',
    )?.value;
    const stored = await contexts[1].storageState({ indexedDB: true });
    result.records = stored.origins.flatMap((o: any) =>
      (o.indexedDB ?? []).map((d: any) => ({
        name: d.name,
        stores: d.stores.map((t: any) => ({ name: t.name, rows: t.records?.length ?? 0 })),
      })),
    );
    writeFileSync(
      join(out, 'deep-received-fixture.json'),
      JSON.stringify({
        state,
        joined: true,
        code: f.b.code,
        storage: stored,
        credentials: await credentials(auths[1]),
      }),
      { mode: 0o600 },
    );
    result.phase = 'passed';
  } catch (e) {
    result.phase = 'failed';
    result.error = String(e);
    if (process.env.RECEIVE_DIAGNOSTIC === '1' && !result.after && contexts[1]) {
      result.partialDiagnostic = await metrics(contexts[1].pages()[0]).catch(() => null);
    }
    throw e;
  } finally {
    writeFileSync(
      join(out, 'result.json'),
      JSON.stringify({ ...result, requests: rows, proxy: proxyRows }, null, 2),
    );
    if (profileSession) {
      const { profile } = await profileSession
        .send('Profiler.stop')
        .catch(() => ({ profile: null }));
      if (profile)
        writeFileSync(join(out, 'incomplete-catchup.cpuprofile'), JSON.stringify(profile));
    }
    await pair?.other.close();
    for (const c of contexts) await c.close().catch(() => {});
    await stopAll();
  }
});
