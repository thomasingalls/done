// Catch-up probe (scratch only): device A builds a backlog while device B is offline, then B catches up.
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pairedEditors, add } from '../base/test/packaged-account/devices';
import { startService, stopService } from '../base/test/packaged-account/server';

const COUNTERS = `(() => {
  const c = (window.__cnt = { idbRO: 0, idbRW: 0, subtle: {} });
  const t = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (s, mode, o) {
    mode === 'readwrite' ? c.idbRW++ : c.idbRO++;
    return t.call(this, s, mode, o);
  };
  for (const k of ['sign','verify','encrypt','decrypt','digest','deriveBits','deriveKey','importKey','exportKey','generateKey','wrapKey','unwrapKey']) {
    const f = SubtleCrypto.prototype[k];
    if (!f) continue;
    SubtleCrypto.prototype[k] = function (...a) { c.subtle[k] = (c.subtle[k] || 0) + 1; return f.apply(this, a); };
  }
})();`;

const SAMPLER = `(() => {
  if (window.__cu) return;
  const cu = (window.__cu = { len: [], long: [], loaf: [], keys: [], edit: [] });
  const now = () => performance.timeOrigin + performance.now();
  const target = () => [...document.querySelectorAll('.card')].find((c) => c.textContent.includes('Probe card A'));
  let last = -1, lastEdit = -1;
  const sample = () => {
    const el = target();
    const n = el ? el.textContent.length : -1;
    if (n !== last) { last = n; cu.len.push([now(), n]); }
    const ed = document.querySelector('.card[data-editing="true"] .cm-content');
    const m = ed ? ed.textContent.length : -1;
    if (m !== lastEdit) { lastEdit = m; cu.edit.push([now(), m]); }
  };
  new MutationObserver(sample).observe(document.body, { subtree: true, childList: true, characterData: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) cu.long.push([performance.timeOrigin + e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true });
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) cu.loaf.push([performance.timeOrigin + e.startTime, e.duration, e.blockingDuration]); }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {}
  window.addEventListener('keydown', (e) => cu.keys.push([now(), performance.timeOrigin + e.timeStamp, e.key]), true);
  sample();
})();`;

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const WORDS =
  'the quick brown fox jumps over a lazy dog and keeps typing plain words for the probe ';

test('two-device catch-up', async ({ page, browser }) => {
  const output = process.env.CATCHUP_OUTPUT!;
  const phases = (process.env.CATCHUP_PHASES ?? '30').split(',').map(Number);
  const profilePhase = Number(process.env.CATCHUP_PROFILE_PHASE ?? -1);
  const profileSeconds = Number(process.env.CATCHUP_PROFILE_SECONDS ?? 30);
  const typePhase = Number(process.env.CATCHUP_TYPE_PHASE ?? -1);
  const cadence = Number(process.env.CATCHUP_CADENCE ?? 150);
  const maxBuildMs = Number(process.env.CATCHUP_MAX_BUILD_S ?? 900) * 1000;
  const maxCatchMs = Number(process.env.CATCHUP_MAX_CATCH_S ?? 900) * 1000;
  process.chdir(process.env.CATCHUP_SOURCE!);
  mkdirSync(output, { recursive: true });
  // Optional service CPU profile: both spawned processes inherit this; the backend's is the larger file.
  if (process.env.CATCHUP_SERVICE_PROF === '1')
    process.env.NODE_OPTIONS = `--cpu-prof --cpu-prof-dir=${output}/service-prof`;
  const service = await startService(output + '/state', process.env.CATCHUP_DIST!, true, true);
  delete process.env.NODE_OPTIONS;
  const rows: any[] = [];
  let phase = 'setup';
  const watch = (p: Page, device: string) => {
    const requests = new Map();
    p.on('request', (r) => {
      const path = new URL(r.url()).pathname;
      if (!path.startsWith('/account/') && !path.startsWith('/__account-setup/')) return;
      const row: any = { device, phase, path, start: Date.now() };
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
  await page.addInitScript(COUNTERS);
  const newContext = browser.newContext.bind(browser);
  (browser as any).newContext = async (...a: any[]) => {
    const c = await newContext(...a);
    await c.addInitScript(COUNTERS);
    return c;
  };
  watch(page, 'A');
  const result: any = { phases: [], cadence, started: Date.now() };
  const dbSize = () => {
    const out: any = {};
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        const s = statSync(p);
        if (s.isDirectory()) walk(p);
        else if (/sqlite/.test(f)) out[p.slice(output.length + 1)] = s.size;
      }
    };
    try {
      walk(output + '/state');
    } catch {}
    return out;
  };
  const submitsA = () =>
    rows.filter(
      (r) => r.device === 'A' && r.path === '/account/delivery/submit' && r.status === 200,
    ).length;
  let pair: Awaited<ReturnType<typeof pairedEditors>> | undefined;
  let cdp: any;
  try {
    pair = await pairedEditors(page, browser, true, {
      beforeCompare: async (second) => watch(second, 'B'),
    });
    const B = pair.second;
    console.log('MARK editors-open', Date.now());
    await add(page, 'Probe card A');
    await add(B, 'Probe card B');
    for (const p of [page, B])
      for (const name of ['Probe card A', 'Probe card B'])
        await expect(p.locator('.shell')).toContainText(name, { timeout: 20000 });
    await B.evaluate(SAMPLER);
    const cardA = (p: Page) => p.locator('.card').filter({ hasText: 'Probe card A' }).first();
    const editA = async () => {
      await cardA(page).locator('.card-surface').press('Enter');
      await page.locator('.card[data-editing="true"] .cm-content').waitFor();
      await page.keyboard.press('ControlOrMeta+End');
    };
    cdp = await B.context().newCDPSession(B);
    let typedTotal = 0;
    for (let i = 0; i < phases.length; i++) {
      const target = phases[i]!;
      const ph: any = { index: i, target };
      phase = `p${i}-build`;
      await pair.other.setOffline(true);
      ph.offlineAt = Date.now();
      await page.waitForTimeout(1000);
      await editA();
      const before = submitsA();
      const buildStart = Date.now();
      let keys = 0;
      while (submitsA() - before < target && Date.now() - buildStart < maxBuildMs) {
        const ch = WORDS[(typedTotal + keys) % WORDS.length]!;
        await page.keyboard.press(ch === ' ' ? 'Space' : ch);
        keys++;
        if (keys % 200 === 0)
          console.log('MARK build', i, 'keys', keys, 'positions', submitsA() - before, Date.now());
        await page.waitForTimeout(cadence);
      }
      typedTotal += keys;
      await page.keyboard.press('Escape');
      // Drain A: no new submit for 3 s and no submit in flight.
      let quiet = Date.now(),
        last = submitsA();
      while (Date.now() - quiet < 3000) {
        await page.waitForTimeout(250);
        const inflight = rows.some(
          (r) => r.device === 'A' && r.path === '/account/delivery/submit' && !r.end,
        );
        if (submitsA() !== last || inflight) {
          last = submitsA();
          quiet = Date.now();
        }
        if (Date.now() - buildStart > maxBuildMs + 120000) break;
      }
      ph.keys = keys;
      ph.positions = submitsA() - before;
      ph.ledgerPositionsAfter = submitsA();
      ph.buildMs = Date.now() - buildStart;
      ph.db = dbSize();
      const expected = norm((await cardA(page).textContent()) ?? '');
      ph.expectedChars = expected.length;
      ph.beforeChars = norm((await cardA(B).textContent()) ?? '').length;
      ph.countersBefore = await B.evaluate('JSON.parse(JSON.stringify(window.__cnt))');
      ph.load = (await import('node:os')).loadavg();
      console.log(
        'MARK built',
        i,
        JSON.stringify({
          keys,
          positions: ph.positions,
          buildMs: ph.buildMs,
          expectedChars: ph.expectedChars,
          beforeChars: ph.beforeChars,
        }),
      );
      phase = `p${i}-catchup`;
      const online = Date.now();
      ph.onlineAt = online;
      await pair.other.setOffline(false);
      let profiled = false,
        typedOnB = false,
        converged = false;
      while (Date.now() - online < maxCatchMs) {
        const text = norm(
          (await cardA(B)
            .textContent()
            .catch(() => '')) ?? '',
        );
        if (text === expected) {
          converged = true;
          break;
        }
        if (i === profilePhase && !profiled && Date.now() - online > 4000) {
          profiled = true;
          await cdp.send('Profiler.enable');
          await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
          ph.profileStart = Date.now();
          ph.profileCountersStart = await B.evaluate('JSON.parse(JSON.stringify(window.__cnt))');
          await cdp.send('Profiler.start');
          await B.waitForTimeout(profileSeconds * 1000);
          const { profile } = await cdp.send('Profiler.stop');
          ph.profileEnd = Date.now();
          ph.profileCountersEnd = await B.evaluate('JSON.parse(JSON.stringify(window.__cnt))');
          writeFileSync(`${output}/B-p${i}.cpuprofile`, JSON.stringify(profile));
          console.log('MARK profiled', i, ph.profileEnd - ph.profileStart);
          continue;
        }
        if (
          i === typePhase &&
          !typedOnB &&
          (i !== profilePhase || profiled) &&
          Date.now() - online > 4000
        ) {
          typedOnB = true;
          const cardB = B.locator('.card').filter({ hasText: 'Probe card B' }).first();
          await cardB.locator('.card-surface').press('Enter');
          await B.locator('.card[data-editing="true"] .cm-content').waitFor();
          await B.keyboard.press('ControlOrMeta+End');
          ph.typeStart = Date.now();
          for (let k = 0; k < 60; k++) {
            const ch = WORDS[k % WORDS.length]!;
            await B.keyboard.press(ch === ' ' ? 'Space' : ch);
            await B.waitForTimeout(150);
          }
          ph.typeEnd = Date.now();
          await B.keyboard.press('Escape');
          console.log('MARK typed-on-B', i, ph.typeEnd - ph.typeStart);
          continue;
        }
        await B.waitForTimeout(200);
      }
      ph.converged = converged;
      ph.convergedAt = Date.now();
      ph.catchupMs = ph.convergedAt - online;
      ph.afterChars = norm(
        (await cardA(B)
          .textContent()
          .catch(() => '')) ?? '',
      ).length;
      ph.countersAfter = await B.evaluate('JSON.parse(JSON.stringify(window.__cnt))');
      console.log(
        'MARK caught-up',
        i,
        JSON.stringify({ converged, catchupMs: ph.catchupMs, afterChars: ph.afterChars }),
      );
      // Let B's lanes go quiet before the next phase.
      await B.waitForTimeout(3000);
      ph.quietAt = Date.now();
      result.phases.push(ph);
      if (!converged) break;
    }
    result.sampler = await B.evaluate('JSON.parse(JSON.stringify(window.__cu))');
    result.ended = Date.now();
  } catch (e) {
    result.error = String(e);
    try {
      if (pair) await pair.second.screenshot({ path: output + '/B-error.png' });
      await page.screenshot({ path: output + '/A-error.png' });
      if (pair)
        result.sampler = await pair.second.evaluate(
          'JSON.parse(JSON.stringify(window.__cu || null))',
        );
    } catch {}
    throw e;
  } finally {
    writeFileSync(output + '/catchup.json', JSON.stringify({ ...result, rows }));
    await pair?.other.close().catch(() => {});
    await stopService(service);
  }
});
