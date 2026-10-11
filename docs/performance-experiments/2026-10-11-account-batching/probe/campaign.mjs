// Desktop typing-latency campaign. Usage: node campaign.mjs <control|local|account|extra> [smoke]
// Fixed plans, one pass each, every block retained under results/.
import { join, basename } from 'node:path';
import { rmSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  quiet,
  ROOT,
  RESULTS,
  ORIGIN,
  CONTROL_URL,
  startBackend,
  startApp,
  startControlServer,
  stop,
  stopAll,
  launch,
  createAccount,
  authenticator,
  instrument,
  network,
  typeBlock,
  preload,
  drained,
  profiled,
  aggregate,
  summary,
  pct,
  round,
  gaps,
  text,
  save,
  COMPOSE,
  CARD_EDITOR,
} from '../../2026-10-10-account-consumers/probe/lib.mjs';
import { analyse } from '../../2026-10-10-account-consumers/probe/trace.mjs';

const mode = process.argv[2];
const fixture = process.env.DONE_REOPEN_FIXTURE
  ? JSON.parse(readFileSync(process.env.DONE_REOPEN_FIXTURE, 'utf8'))
  : null;
const smoke = process.argv[3] === 'smoke';
const tag = (smoke ? 'smoke-' : '') + mode;
const n = (count) => (smoke ? Math.min(count, 12) : count);
const REAL = gaps(400, 110, 180); // "normal typing": 110-180 ms between keys, fixed sequence
const GATE = [50]; // the old gate's cadence
const CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'v8.execute',
  'blink.user_timing',
  'loading',
];
const out = { mode, smoke, started: new Date().toISOString(), host: {}, blocks: [], notes: [] };
const load = () => execFileSync('uptime').toString().trim();
out.host.uptimeStart = load();
let typed = 0; // per-key text edits submitted through the editor in this session
let offset = 0;
const note = (message) => {
  console.log('NOTE', message);
  out.notes.push(message);
};

async function diagnostics(page) {
  return page.evaluate(() => ({
    ledger: globalThis.__doneLedgerMetrics?.(),
    native: globalThis.__doneNativeCounts?.(),
  }));
}

async function census(page) {
  return page
    .evaluate(async () => {
      const dbs = {};
      for (const info of await indexedDB.databases()) {
        if (!info.name) continue;
        try {
          const db = await new Promise((accept, reject) => {
            const request = indexedDB.open(info.name);
            request.onupgradeneeded = () => {
              request.transaction?.abort();
              reject(Error('refuse upgrade'));
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(Error('blocked'));
            request.onsuccess = () => accept(request.result);
          });
          try {
            const stores = {};
            for (const name of db.objectStoreNames)
              stores[name] = await new Promise((accept, reject) => {
                const tx = db.transaction(name, 'readonly');
                const request = tx.objectStore(name).count();
                tx.oncomplete = () => accept(request.result);
                tx.onabort = () => reject(tx.error);
              });
            dbs[info.name] = stores;
          } finally {
            db.close();
          }
        } catch (error) {
          dbs[info.name] = String(error);
        }
      }
      let chars = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        chars += key.length + (localStorage.getItem(key) ?? '').length;
      }
      return {
        indexedDB: dbs,
        localStorageKeys: localStorage.length,
        localStorageChars: chars,
        heapMB: performance.memory
          ? Math.round(performance.memory.usedJSHeapSize / 1e5) / 10
          : null,
      };
    })
    .catch((error) => ({ error: String(error) }));
}

function indicator(data) {
  // Intervals during which the workspace "waiting to be saved" aside was present.
  const intervals = [];
  let on = data.armed.statusAtStart ? data.armed.now : null;
  for (const s of data.status) {
    if (s.on && on === null) on = s.t;
    else if (!s.on && on !== null) {
      intervals.push([on, s.t]);
      on = null;
    }
  }
  if (on !== null) intervals.push([on, data.now]);
  const durations = intervals.map(([a, b]) => b - a);
  const keys = data.keys;
  let hit = 0;
  const settle = [];
  for (let i = 0; i < keys.length; i++) {
    const from = keys[i].t,
      to = i + 1 < keys.length ? keys[i + 1].t : keys[i].t + 1500;
    const mine = intervals.filter(([a, b]) => a < to && b > from);
    if (mine.length) {
      hit++;
      settle.push(Math.max(...mine.map(([, b]) => b)) - from);
    }
  }
  const texts = {};
  for (const s of data.status) if (s.on) texts[s.text] = (texts[s.text] ?? 0) + 1;
  return {
    appearances: intervals.length,
    texts,
    totalVisibleMs: round(durations.reduce((a, b) => a + b, 0)),
    visibleFraction:
      round((durations.reduce((a, b) => a + b, 0) / (data.now - data.armed.now)) * 1000) / 1000,
    visibleMs: durations.length ? summary(durations) : null,
    keysWithIndicator: hit,
    keyToClearedMs: settle.length ? summary(settle) : null,
  };
}
function networkSummary(captured, keys) {
  if (!captured) return null;
  const by = {};
  for (const r of captured.requests) {
    const key = `${r.method} ${r.url}`;
    (by[key] ??= []).push(r);
  }
  const rows = Object.entries(by).map(([key, list]) => ({
    request: key,
    count: list.length,
    perKey: round(list.length / keys),
    msP50: round(
      pct(
        list.filter((r) => r.end).map((r) => r.end - r.start),
        50,
      ),
    ),
    msMax: round(Math.max(0, ...list.filter((r) => r.end).map((r) => r.end - r.start))),
    reqBytesP50: pct(
      list.map((r) => r.requestBytes ?? 0),
      50,
    ),
    reqBytesMax: Math.max(0, ...list.map((r) => r.requestBytes ?? 0)),
    respBytesP50: pct(
      list.map((r) => r.encoded ?? r.dataBytes ?? 0),
      50,
    ),
    respBytesMax: Math.max(0, ...list.map((r) => r.encoded ?? r.dataBytes ?? 0)),
    statuses: [...new Set(list.map((r) => r.status ?? r.failed ?? 'open'))],
  }));
  return {
    requests: captured.requests.length,
    requestsPerKey: round(captured.requests.length / keys),
    streamChunks: captured.chunks.length,
    byPath: rows.sort((a, b) => b.count - a.count),
  };
}

async function block(browser, page, net, name, count, gapList, options = {}) {
  const chars = text(count, offset);
  offset += count;
  const mark = net?.mark();
  const before = { typed, load: load() };
  const diagnosticBefore = await diagnostics(page);
  let data, traceResult, profileResult;
  console.log(`[${tag}] block ${name}: ${count} keys ...`);
  if (options.trace) {
    await browser.startTracing(page, { categories: CATEGORIES });
    data = await typeBlock(page, chars, gapList);
    const buffer = await browser.stopTracing();
    writeFileSync(join(RESULTS, `${tag}-${name}.trace.json`), buffer);
    try {
      traceResult = analyse(buffer);
    } catch (error) {
      traceResult = { error: String(error) };
    }
  } else if (options.profile) {
    const result = await profiled(page, () => typeBlock(page, chars, gapList));
    data = result.result;
    save(`${tag}-${name}.cpuprofile`, result.profile);
    profileResult = aggregate(result.profile, count);
  } else data = await typeBlock(page, chars, gapList);
  typed += count;
  const captured = net?.since(mark);
  // Key -> the typed character present in the editor DOM (the controlled editor shows accepted text only).
  const appear = [];
  if (data.armed.baseLength >= 0) {
    let cursor = 0;
    for (let i = 0; i < data.keys.length; i++) {
      const want = data.armed.baseLength + i + 1;
      while (cursor < data.lengths.length && data.lengths[cursor].len < want) cursor++;
      if (cursor < data.lengths.length) appear.push(data.lengths[cursor].t - data.keys[i].t);
    }
  }
  const paints = data.keys.map((k) => k.paint).filter((v) => v !== null);
  const queue = data.keys.map((k) => k.seen - k.t);
  const eventRows = {};
  for (const e of data.events) {
    const row = (eventRows[e.name] ??= { n: 0, processing: [], duration: [] });
    row.n++;
    row.processing.push(e.pe - e.ps);
    row.duration.push(e.d);
  }
  for (const row of Object.values(eventRows)) {
    row.processing = summary(row.processing);
    row.duration = summary(row.duration);
  }
  const result = {
    name,
    keys: count,
    cadence: gapList.length > 1 ? 'jittered 110-180 ms' : `${gapList[0]} ms`,
    typedBefore: before.typed,
    diagnosticBefore,
    diagnosticAfter: await diagnostics(page),
    loadBefore: before.load,
    samples: data.keys.length,
    keyToNextPaintMs: summary(paints),
    keyToTextInDomMs: appear.length ? summary(appear) : null,
    keysOver50msToText: appear.filter((v) => v > 50).length,
    keysOver100msToText: appear.filter((v) => v > 100).length,
    textSamples: appear.length,
    settleMs: data.settleMs,
    textComplete: data.textComplete,
    keydownQueueDelayMs: summary(queue),
    eventTimingOver16ms: eventRows,
    longTasks: {
      n: data.long.length,
      totalMs: round(data.long.reduce((a, b) => a + b.d, 0)),
      maxMs: round(Math.max(0, ...data.long.map((l) => l.d))),
    },
    longAnimationFrames: {
      n: data.loaf.length,
      maxMs: round(Math.max(0, ...data.loaf.map((l) => l.d))),
      top: data.loaf
        .sort((a, b) => b.d - a.d)
        .slice(0, 5)
        .map((l) => ({
          ms: round(l.d),
          scripts: l.scripts.map((s) => `${s.type}:${s.invoker} ${round(s.d)}ms ${s.fn}@${s.url}`),
        })),
    },
    indicator: indicator(data),
    network: networkSummary(captured, count),
    ...(traceResult ? { trace: traceResult } : {}),
    ...(profileResult ? { profile: profileResult } : {}),
    ...(options.traced ? { tracing: true } : {}),
  };
  save(`${tag}-${name}.raw.json`, { data, captured });
  out.blocks.push(result);
  save(`${tag}.summary.json`, out);
  console.log(
    `   text p50/p95/max ${result.keyToTextInDomMs?.p50}/${result.keyToTextInDomMs?.p95}/${result.keyToTextInDomMs?.max} ms (>100ms: ${result.keysOver100msToText}); paint p50/p95/max ${result.keyToNextPaintMs.p50}/${result.keyToNextPaintMs.p95}/${result.keyToNextPaintMs.max} ms; ` +
      `queue p95 ${result.keydownQueueDelayMs.p95}; indicator ${result.indicator.appearances}x on ${result.indicator.keysWithIndicator}/${count} keys; ` +
      `requests/key ${result.network?.requestsPerKey ?? '-'}` +
      (traceResult?.inputTaskMsPerKey
        ? `; input task p50/p95 ${traceResult.inputTaskMsPerKey.p50}/${traceResult.inputTaskMsPerKey.p95}; all main p50/p95 ${traceResult.allMainThreadMsPerKey.p50}/${traceResult.allMainThreadMsPerKey.p95}`
        : '') +
      (profileResult ? `; profiled active ${profileResult.activeMsPerKey} ms/key` : ''),
  );
  return { result, chars };
}

let cards = 0;
async function newCard(page, label = `measure card ${++cards}`) {
  // Under load the Goals insert can still be queued when Scheduled is clicked, which then moves nothing
  // (this is what stopped account run 1). Wait for the accepted text before acting on it.
  await drained(page);
  const goals = page.locator('.goals .cm-content');
  await goals.click();
  await page.keyboard.press('ControlOrMeta+End');
  const existing = (await goals.textContent()) ?? '';
  if (existing.trim()) await page.keyboard.press('Enter');
  await page.keyboard.insertText(label);
  const began = Date.now();
  while (!((await goals.textContent()) ?? '').includes(label)) {
    if (Date.now() - began > 180000)
      throw Error('Goals text was not accepted within 180 s: ' + label);
    await page.waitForTimeout(100);
  }
  await drained(page);
  await page.locator('.goals').getByRole('button', { name: 'Scheduled' }).click();
  const card = page.locator('.card[data-section="scheduled"]').filter({ hasText: label });
  await card.first().waitFor({ state: 'visible', timeout: 180000 });
  await drained(page);
  return label;
}
async function openCard(page, label) {
  if (await page.locator(CARD_EDITOR).count()) {
    await page.keyboard.press('Escape');
    await page
      .locator(CARD_EDITOR)
      .waitFor({ state: 'detached', timeout: 15000 })
      .catch(() => {});
  }
  const card = page.locator('.card[data-section="scheduled"]').filter({ hasText: label });
  await card.first().locator('.card-surface').click();
  await page.locator(CARD_EDITOR).waitFor({ state: 'visible', timeout: 60000 });
  await page.keyboard.press('ControlOrMeta+End');
  await drained(page);
  await page.waitForTimeout(1000);
}
async function verify(page, chars, where = CARD_EDITOR) {
  const content = (await page.locator(where).textContent()) ?? '';
  const ok = content.replaceAll(' ', ' ').endsWith(chars.slice(-40));
  if (!ok)
    note(
      `TEXT MISMATCH after block: expected tail ${JSON.stringify(chars.slice(-40))}, got ${JSON.stringify(content.slice(-60))}`,
    );
  return ok;
}
async function bulk(page, count, capMs = 15 * 60000) {
  // Untimed history growth: per-key edits into separate bulk cards, 250 characters each.
  // Declared before the run: stop growing after capMs and measure wherever the history then stands.
  const started = Date.now();
  let left = count;
  while (left > 0) {
    if (Date.now() - started > capMs) {
      note(
        `preload cap reached with ${left} of ${count} edits still to type; measuring at ${typed}`,
      );
      break;
    }
    const size = Math.min(250, left);
    const label = await newCard(page, `bulk card ${++cards}`);
    await openCard(page, label);
    await preload(page, text(size, offset), smoke ? 20 : 60);
    offset += size;
    typed += size;
    left -= size;
  }
  await page.keyboard.press('Escape');
  await drained(page);
  console.log(`[${tag}] preloaded ${count} edits in ${Date.now() - started} ms (now ${typed})`);
  out.notes.push(
    `preload of ${count} edits took ${Date.now() - started} ms at 60 ms cadence including drain`,
  );
}
async function point(browser, page, net, name, plan) {
  const label = await newCard(page);
  await openCard(page, label);
  const stats = await census(page);
  out.blocks.push({ name: `${name}-census`, typed, census: stats });
  for (const [suffix, count, gapList, options] of plan) {
    const quietMs = net ? await quiet(page, net) : 0;
    const { chars, result } = await block(
      browser,
      page,
      net,
      `${name}-${suffix}`,
      n(count),
      gapList,
      options,
    );
    result.quietWaitBeforeMs = quietMs;
    await verify(page, chars);
    await drained(page);
  }
  await page.keyboard.press('Escape');
}

async function createLocal(page) {
  await page.goto(ORIGIN + '/local/fresh');
  await page.getByRole('button', { name: 'Create a local-only workspace' }).click();
  const code = await page.getByLabel('Generated device-lock code').textContent();
  await page.getByRole('button', { name: 'I saved my code' }).click();
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Confirm and create', exact: true }).click();
  await page.locator(COMPOSE).waitFor({ state: 'visible', timeout: 30000 });
  return code;
}
let throttleSession;
async function throttle(page, rate) {
  // The override lives as long as its session, so keep one open.
  throttleSession ??= await page.context().newCDPSession(page);
  await throttleSession.send('Emulation.setCPUThrottlingRate', { rate });
}

const state = fixture?.state ?? join(ROOT, 'state', basename(RESULTS));
if (!fixture) rmSync(state, { recursive: true, force: true });
let browser, controlServer, page;
try {
  browser = await launch();
  out.host.chromium = browser.version();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ...(fixture ? { storageState: fixture.storage } : {}),
  });
  page = await context.newPage();
  page.on('pageerror', (e) => note('PAGEERROR ' + e.message));
  await page.addInitScript(instrument);
  await page.addInitScript(() => {
    const counts = {};
    const bump = (name) => (counts[name] = (counts[name] ?? 0) + 1);
    const tx = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      bump('idb-' + (args[1] ?? 'readonly'));
      return tx.apply(this, args);
    };
    for (const name of [
      'encrypt',
      'decrypt',
      'sign',
      'verify',
      'digest',
      'importKey',
      'deriveKey',
      'deriveBits',
      'generateKey',
      'exportKey',
    ]) {
      const fn = SubtleCrypto.prototype[name];
      SubtleCrypto.prototype[name] = function (...args) {
        bump(name);
        return fn.apply(this, args);
      };
    }
    const random = Crypto.prototype.getRandomValues;
    Crypto.prototype.getRandomValues = function (...args) {
      bump('random');
      return random.apply(this, args);
    };
    Object.defineProperty(globalThis, '__doneNativeCounts', { value: () => ({ ...counts }) });
  });
  const A = ['A-realistic', 200, REAL];
  const B = ['B-50ms', 120, GATE];
  const T = ['T-traced', 100, REAL, { trace: true }];
  const P = ['P-profiled', 100, REAL, { profile: true }];

  if (mode === 'control') {
    controlServer = await startControlServer();
    await page.goto(CONTROL_URL);
    for (const [surface, selector] of [
      ['textarea', '#plain'],
      ['codemirror', '#bare .cm-content'],
    ]) {
      await page.locator(selector).click();
      for (const [suffix, count, gapList, options] of [A, B, T])
        await block(browser, page, null, `${surface}-${suffix}`, n(count), gapList, options);
    }
  } else if (mode === 'local') {
    const backend = await startBackend(state, true);
    await startApp(state, true);
    void backend;
    await createLocal(page);
    const net = await network(page);
    await point(browser, page, net, 'local-p0', [A, B, T, P]);
    await bulk(page, n(1000) - typed > 0 ? n(1000) - typed : n(10));
    await point(browser, page, net, 'local-p1', [A, T, P]);
    await throttle(page, 4);
    await point(browser, page, net, 'local-cpu4x', [B]);
    await throttle(page, 1);
  } else if (['slope', 'long', 'diagnostic', 'reopen', 'matched'].includes(mode)) {
    await startBackend(state, true);
    await startApp(state, true);
    const net = await network(page);
    const account = fixture
      ? { code: fixture.code, auth: await authenticator(page) }
      : await createAccount(page);
    if (fixture) {
      for (const credential of fixture.credentials)
        await account.auth.cdp.send('WebAuthn.addCredential', {
          authenticatorId: account.auth.authenticatorId,
          credential,
        });
    }
    if (!fixture) await page.locator(COMPOSE).waitFor({ state: 'visible' });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const heap = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      const { metrics } = await cdp.send('Performance.getMetrics');
      return metrics.find((x) => x.name === 'JSHeapUsedSize')?.value;
    };
    for (const prior of fixture
      ? [fixture.typed - 100]
      : smoke
        ? [0]
        : mode === 'diagnostic'
          ? [0, 2220]
          : [0, 520, 1220, 2220]) {
      if (fixture) typed = fixture.typed;
      if (!fixture && typed < prior) await bulk(page, prior - typed);
      if (!fixture && typed !== prior) throw Error('Required history point not reached: ' + prior);
      if (!fixture)
        await point(browser, page, net, 'history-' + prior, [mode === 'diagnostic' ? P : T]);
      console.log('SETTLE', prior);
      if (!fixture) await quiet(page, net);
      const warmHeapBytes = await heap();
      const diagnostic = await diagnostics(page);
      if (!fixture && !smoke && mode !== 'slope' && prior !== 2220) {
        out.blocks.push({
          name: 'history-' + prior + '-maintenance',
          typed,
          warmHeapBytes,
          diagnostic,
        });
        save(tag + '.summary.json', out);
        continue;
      }
      if (!fixture) await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
      await page.goto(ORIGIN + '/');
      await page.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
      await page.getByRole('button', { name: /^Unlock Device owner/ }).click();
      await page.getByLabel('Device-lock code', { exact: true }).fill(account.code);
      const saved = {
        state,
        typed,
        code: account.code,
        storage: await context.storageState({ indexedDB: true }),
        credentials: (
          await account.auth.cdp.send('WebAuthn.getCredentials', {
            authenticatorId: account.auth.authenticatorId,
          })
        ).credentials,
      };
      writeFileSync(join(ROOT, 'fixture-' + basename(RESULTS) + '.json'), JSON.stringify(saved), {
        mode: 0o600,
      });
      console.log('COLD START', prior);
      const opened = Date.now();
      const reopen = async () => {
        await page.getByRole('button', { name: 'Confirm code and unlock with passkey' }).click();
        const progress = setInterval(async () => {
          console.log(
            'COLD SCREEN',
            await page
              .locator('body')
              .innerText()
              .catch(() => 'unavailable'),
          );
        }, 30000);
        try {
          await page.locator('.shell').waitFor({ state: 'visible', timeout: 180000 });
        } finally {
          clearInterval(progress);
        }
      };
      if (mode === 'diagnostic' || fixture) {
        const r = await profiled(page, reopen);
        save(tag + '-cold.cpuprofile', r.profile);
        out.coldProfile = aggregate(r.profile, 1);
      } else await reopen();
      const coldOpenMs = Date.now() - opened;
      await quiet(page, net);
      const reopenedHeapBytes = await heap();
      out.blocks.push({
        name: 'history-' + prior + '-maintenance',
        typed,
        warmHeapBytes,
        reopenedHeapBytes,
        coldOpenMs,
        diagnostic,
        coldDiagnostic: await diagnostics(page),
      });
      save(tag + '.summary.json', out);
      console.log('MAINTENANCE', JSON.stringify(out.blocks.at(-1)));
      if (mode === 'matched') {
        await point(browser, page, net, 'retained-history', [
          ['P-profiled', 300, REAL, { profile: true }],
        ]);
        await quiet(page, net);
        out.blocks.push({
          name: 'post-typing-maintenance',
          typed,
          diagnostic: await diagnostics(page),
          census: await census(page),
        });
        save(tag + '.summary.json', out);
      }
    }
    out.blocks.push({ name: 'final-census', typed, census: await census(page) });
  } else if (mode === 'account') {
    const backend = await startBackend(state, true);
    await startApp(state, true);
    const net = await network(page);
    const account = await createAccount(page);
    void account;
    await page.locator(COMPOSE).waitFor({ state: 'visible' });
    await page.waitForTimeout(2000);
    await point(browser, page, net, 'acct-p0', [A, B]);
    await point(browser, page, net, 'acct-p1', [A, T]);
    // Service unreachable: the gateway answers 503 while the account API process is stopped.
    await stop(backend);
    await page.waitForTimeout(3000);
    await point(browser, page, net, 'acct-service-down', [T]);
    out.blocks.push({ name: 'acct-final-census', typed, census: await census(page) });
  } else if (mode === 'extra') {
    // A second fresh account: attribution at zero history, the old gate's CPU-4x cadence, and Goals typing.
    await startBackend(state, true);
    await startApp(state, true);
    const net = await network(page);
    await createAccount(page);
    await page.locator(COMPOSE).waitFor({ state: 'visible' });
    await page.waitForTimeout(2000);
    await point(browser, page, net, 'extra-fresh', [T, P]);
    await throttle(page, 4);
    await point(browser, page, net, 'extra-cpu4x', [B]);
    await throttle(page, 1);
    // Goals (master) typing: the other admitted editor.
    const goals = page.locator('.goals .cm-content');
    await goals.click();
    await page.keyboard.press('ControlOrMeta+End');
    await drained(page);
    const { chars } = await block(browser, page, net, 'extra-goals-A-realistic', n(200), REAL);
    await verify(page, chars, '.goals .cm-content');
    out.blocks.push({ name: 'extra-final-census', typed, census: await census(page) });
  } else throw Error('mode?');
} catch (error) {
  note('CAMPAIGN FAILED: ' + (error?.stack ?? error));
  if (page)
    out.failureScreen = await page
      .locator('body')
      .innerText()
      .catch(() => 'unavailable');
  process.exitCode = 1;
} finally {
  out.host.uptimeEnd = load();
  out.finished = new Date().toISOString();
  out.typed = typed;
  save(`${tag}.summary.json`, out);
  await browser?.close().catch(() => {});
  await stopAll(controlServer ? [controlServer] : []);
  console.log(`[${tag}] done; typed ${typed}; summary ${join(RESULTS, tag + '.summary.json')}`);
}
