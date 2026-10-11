// Shared helpers for the disposable desktop typing-latency probe. Nothing here touches the repo.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { SourceMap } from 'node:module';
import { chromium } from '@playwright/test';

export const ROOT = resolve(process.env.DONE_PERF_ROOT ?? '/tmp/done-account-consumers');
export const SRC = process.env.DONE_PERF_SOURCE;
export const DIST = join(SRC, 'dist');
export const RESULTS = process.env.DONE_PERF_RESULTS;
export const APP_PORT = 53771;
export const SERVICE_PORT = 53772;
export const CONTROL_PORT = 53773;
export const ORIGIN = `http://localhost:${APP_PORT}`;
export const CONTROL_URL = `http://localhost:${CONTROL_PORT}/control/test/latency/control.html`;
mkdirSync(RESULTS, { recursive: true });

const children = new Set();
function start(script, ready, env) {
  const child = spawn(process.execPath, [script], {
    cwd: SRC,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  let output = '';
  child.output = () => output;
  return new Promise((accept, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(Error('startup timeout: ' + output));
    }, 20000);
    child.once('exit', (code) => {
      clearTimeout(timer);
      children.delete(child);
      reject(Error(`exited ${code}: ${output}`));
    });
    const data = (chunk) => {
      output = (output + chunk.toString()).slice(-8000);
      if (output.includes(ready)) {
        clearTimeout(timer);
        accept(child);
      }
    };
    child.stdout.on('data', data);
    child.stderr.on('data', data);
  });
}
export function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((accept) => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
    child.once('exit', () => {
      clearTimeout(timer);
      children.delete(child);
      accept();
    });
    child.kill('SIGTERM');
  });
}
const env = (state, sessions) => ({
  ACCOUNT_NETWORK_SESSIONS: sessions ? '1' : '0',
  ACCOUNT_MEMBERSHIP_CONTINUATION: sessions ? '1' : '0',
  ACCOUNT_SETUP_PORT: String(APP_PORT),
  ACCOUNT_SETUP_ORIGIN: ORIGIN,
  ACCOUNT_SERVICE_PORT: String(SERVICE_PORT),
  ACCOUNT_SETUP_STATE: state,
  ACCOUNT_SETUP_DIST: DIST,
});
export const startBackend = (state, sessions = true) =>
  start('scripts/serve-account-service.mjs', 'Account API development:', env(state, sessions));
export const startApp = (state, sessions = true) =>
  start('scripts/serve-account.mjs', 'Account packaged development:', env(state, sessions));

export function startControlServer() {
  const root = join(ROOT, 'controlroot');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const server = createServer((request, response) => {
    const path = join(root, new URL(request.url, 'http://x').pathname);
    if (!path.startsWith(root) || !existsSync(path) || !statSync(path).isFile())
      return void response.writeHead(404).end();
    response.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' });
    response.end(readFileSync(path));
  });
  return new Promise((accept) => server.listen(CONTROL_PORT, '127.0.0.1', () => accept(server)));
}
export async function stopAll(extra = []) {
  for (const child of [...children]) await stop(child);
  for (const server of extra) await new Promise((done) => server.close(() => done()));
}
process.on('exit', () => {
  for (const child of children) child.kill('SIGKILL');
});

export const launch = () => chromium.launch({ headless: true });

/** Virtual passkey authenticator, as test/device-enrollment/helpers.ts does. */
export async function authenticator(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, authenticatorId };
}
/** Same journey as test/device-enrollment/helpers.ts createdAccount. */
export async function createAccount(page) {
  await page.goto(ORIGIN + '/private/account-setup.html');
  await page.getByRole('button', { name: 'I already have a workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Create a new account', exact: true }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Device owner');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  const code = await page.getByLabel('Generated device-lock code').textContent();
  await page.getByRole('button', { name: 'I saved my device-lock code' }).click();
  await page.getByLabel('Device-lock code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Confirm device-lock code', exact: true }).click();
  const auth = await authenticator(page);
  await page.getByRole('button', { name: 'Create passkey', exact: true }).click();
  await page.getByRole('button', { name: 'Use my passkey', exact: true }).click();
  const recovery = await page.getByLabel('Generated recovery code').textContent();
  await page.getByRole('button', { name: 'I saved my recovery code' }).click();
  await page.getByLabel('Recovery code', { exact: true }).fill(recovery);
  await page.getByRole('button', { name: 'Finish account setup' }).click();
  await page.locator('.shell').waitFor({ state: 'visible', timeout: 30000 });
  return { code, auth, recovery };
}

export const COMPOSE = '.day-panel[data-active="true"] .compose-field';
export const CARD_EDITOR = '.card[data-editing="true"] .cm-content';

/** In-page instrumentation. Serialised by Playwright, so it closes over nothing. */
export const instrument = () => {
  const keys = []; // {t, key, paint}
  const status = []; // {t, on, text}
  const long = [];
  const loaf = [];
  const events = [];
  let capturing = false;
  const afterPaint = () =>
    new Promise((done) =>
      requestAnimationFrame(() => setTimeout(() => done(performance.now()), 0)),
    );
  addEventListener(
    'keydown',
    (event) => {
      if (!capturing || !event.isTrusted) return;
      const row = { t: event.timeStamp, seen: performance.now(), key: event.key, paint: null };
      keys.push(row);
      void afterPaint().then((painted) => (row.paint = painted - row.t));
    },
    true,
  );
  // When does the typed character actually reach the DOM? Track the focused editor's text length.
  const lengths = []; // {t, len}
  let lastLen = -1;
  const focusedLength = () => {
    const active = document.activeElement;
    if (!active) return -1;
    if (active instanceof HTMLTextAreaElement) return active.value.length;
    const content = active.closest?.('.cm-content') ?? null;
    return content ? (content.textContent ?? '').length : -1;
  };
  const readLength = () => {
    if (!capturing) return;
    const len = focusedLength();
    if (len !== lastLen) {
      lastLen = len;
      lengths.push({ t: performance.now(), len });
    }
  };
  addEventListener('input', readLength, true);
  // The user-visible "waiting to be saved" indicators: the workspace aside and the editor message.
  let last = '';
  const read = () => {
    readLength();
    const aside = document.querySelector('aside.workspace-status');
    const text = aside ? (aside.textContent ?? '').trim() : '';
    if (text !== last) {
      last = text;
      status.push({ t: performance.now(), on: !!aside, text });
    }
  };
  new MutationObserver(read).observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) long.push({ t: e.startTime, d: e.duration, name: e.name });
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        loaf.push({
          t: e.startTime,
          d: e.duration,
          blocking: e.blockingDuration,
          render: e.renderStart,
          scripts: (e.scripts ?? []).map((s) => ({
            invoker: s.invoker,
            type: s.invokerType,
            d: s.duration,
            fn: s.sourceFunctionName,
            url: (s.sourceURL ?? '').split('/').pop(),
            pos: s.sourceCharPosition,
          })),
        });
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        if (capturing)
          events.push({
            name: e.name,
            t: e.startTime,
            ps: e.processingStart,
            pe: e.processingEnd,
            d: e.duration,
          });
    }).observe({ type: 'event', durationThreshold: 16, buffered: false });
  } catch {}
  window.probe = {
    arm: () => {
      keys.length = status.length = long.length = loaf.length = events.length = lengths.length = 0;
      lastLen = focusedLength();
      const baseLength = lastLen;
      last = document.querySelector('aside.workspace-status')
        ? (document.querySelector('aside.workspace-status').textContent ?? '').trim()
        : '';
      capturing = true;
      return {
        now: performance.now(),
        origin: performance.timeOrigin,
        statusAtStart: last,
        baseLength,
      };
    },
    unpainted: () => keys.filter((k) => k.paint === null).length,
    length: () => focusedLength(),
    read: () => {
      capturing = false;
      return {
        lengths: lengths.slice(),
        now: performance.now(),
        keys: keys.slice(),
        status: status.slice(),
        long: long.slice(),
        loaf: loaf.slice(),
        events: events.slice(),
      };
    },
  };
};

export const pct = (values, p) => {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return null;
  return s[Math.min(Math.max(Math.ceil((p / 100) * s.length), 1), s.length) - 1];
};
export const summary = (values) => ({
  n: values.length,
  p50: round(pct(values, 50)),
  p95: round(pct(values, 95)),
  max: round(Math.max(...values)),
  mean: round(values.reduce((a, b) => a + b, 0) / (values.length || 1)),
});
export const round = (v) => (v === null || v === undefined ? v : Math.round(v * 10) / 10);

// Deterministic jitter so every condition sees the same gap sequence.
export function gaps(n, lo, hi, seed = 20261010) {
  let s = seed >>> 0;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  return Array.from({ length: n }, () => Math.round(lo + next() * (hi - lo)));
}
const SENTENCES =
  'the quick brown fox jumps over the lazy dog, and then it stops to think about what it has finished today. ' +
  'writing a note should feel like typing in a plain text field, with nothing between the key and the letter. ' +
  'we moved three cards into done this morning, kept two for tomorrow, and left the rest in the goals list. ';
export const text = (n, offset = 0) =>
  Array.from({ length: n }, (_, i) => SENTENCES[(offset + i) % SENTENCES.length]).join('');

export async function press(page, ch) {
  await page.keyboard.press(ch === ' ' ? 'Space' : ch);
}
/** Type `chars` with the given gaps, returning the in-page capture. */
export async function typeBlock(page, chars, gapList) {
  const armed = await page.evaluate(() => window.probe.arm());
  const wall = [];
  for (let i = 0; i < chars.length; i++) {
    wall.push(Date.now());
    await press(page, chars[i]);
    await page.waitForTimeout(gapList[i % gapList.length]);
  }
  // Let trailing paints, saves and deliveries land before reading.
  const typedAt = Date.now();
  await page.waitForTimeout(1500);
  const want = armed.baseLength + chars.length;
  let textComplete = false;
  while (Date.now() - typedAt < 120000) {
    const [unpainted, len] = await page.evaluate(() => [
      window.probe.unpainted(),
      window.probe.length(),
    ]);
    if (!unpainted && (armed.baseLength < 0 || len >= want)) {
      textComplete = true;
      break;
    }
    await page.waitForTimeout(250);
  }
  const settleMs = Date.now() - typedAt;
  const data = await page.evaluate(() => window.probe.read());
  return { armed, wall, settleMs, textComplete, ...data };
}
/** Untimed pre-load: type and then wait for the queue to drain. */
export async function preload(page, chars, gap = 60) {
  for (const ch of chars) {
    await press(page, ch);
    await page.waitForTimeout(gap);
  }
  await drained(page);
}
export async function drained(page, timeout = 120000) {
  const started = Date.now();
  let quiet = 0;
  while (Date.now() - started < timeout) {
    const busy = await page.evaluate(() => !!document.querySelector('aside.workspace-status'));
    quiet = busy ? 0 : quiet + 1;
    if (quiet >= 5) return Date.now() - started;
    await page.waitForTimeout(200);
  }
  throw Error('queue did not drain');
}

/** Network capture through CDP, so request, response and stream chunks share one clock. */
export async function network(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const rows = new Map();
  const chunks = [];
  let base; // wallTime - timestamp
  cdp.on('Network.requestWillBeSent', (e) => {
    base ??= e.wallTime - e.timestamp;
    rows.set(e.requestId, {
      id: e.requestId,
      url: new URL(e.request.url).pathname,
      method: e.request.method,
      start: (base + e.timestamp) * 1000,
      requestBytes: e.request.postData
        ? e.request.postData.length
        : (e.request.postDataEntries ?? []).reduce((n, p) => n + (p.bytes?.length ?? 0), 0),
      hasPost: !!e.request.hasPostData,
      initiator: e.initiator?.type,
    });
  });
  cdp.on('Network.responseReceived', (e) => {
    const row = rows.get(e.requestId);
    if (!row) return;
    row.status = e.response.status;
    row.mime = e.response.mimeType;
    row.responseAt = (base + e.timestamp) * 1000;
  });
  cdp.on('Network.dataReceived', (e) => {
    const row = rows.get(e.requestId);
    if (!row) return;
    row.dataBytes = (row.dataBytes ?? 0) + e.dataLength;
    if (row.mime === 'text/event-stream' || /notifications/.test(row.url))
      chunks.push({ t: (base + e.timestamp) * 1000, bytes: e.dataLength, url: row.url });
  });
  cdp.on('Network.loadingFinished', (e) => {
    const row = rows.get(e.requestId);
    if (!row) return;
    row.end = (base + e.timestamp) * 1000;
    row.encoded = e.encodedDataLength;
  });
  cdp.on('Network.loadingFailed', (e) => {
    const row = rows.get(e.requestId);
    if (!row) return;
    row.end = (base + e.timestamp) * 1000;
    row.failed = e.errorText;
  });
  return {
    cdp,
    mark: () => ({ rows: rows.size, chunks: chunks.length }),
    since: (mark) => ({
      requests: [...rows.values()].slice(mark.rows),
      chunks: chunks.slice(mark.chunks),
    }),
    all: () => ({ requests: [...rows.values()], chunks: chunks.slice() }),
  };
}

/** CPU profile around `act`, source-mapped against the scratch build. */
// Keep one profiler session for the page lifetime. Detaching an additional CDP session in
// this Chromium build disables the page's virtual WebAuthn environment, breaking later unlocks.
const profileSessions = new WeakMap();
export async function profiled(page, act, intervalUs = 250) {
  let session = profileSessions.get(page);
  if (!session) {
    session = await page.context().newCDPSession(page);
    profileSessions.set(page, session);
  }
  await session.send('Profiler.enable');
  await session.send('Profiler.setSamplingInterval', { interval: intervalUs });
  await session.send('Profiler.start');
  let result, failure;
  try {
    result = await act();
  } catch (error) {
    failure = error;
  } finally {
    var { profile } = await session.send('Profiler.stop');
  }
  if (failure) { save('failed-action.cpuprofile', profile); throw failure; }
  return { result, profile };
}
const maps = new Map();
function mapFrame(frame) {
  if (!frame.url.startsWith(ORIGIN + '/') || !frame.url.endsWith('.js')) return null;
  const path = join(DIST, new URL(frame.url).pathname + '.map');
  if (!existsSync(path)) return null;
  let map = maps.get(path);
  if (!map) {
    map = new SourceMap(JSON.parse(readFileSync(path, 'utf8')));
    maps.set(path, map);
  }
  const entry = map.findEntry(frame.lineNumber, frame.columnNumber);
  if (!('originalSource' in entry)) return null;
  return {
    source: entry.originalSource
      .replace(/^.*?(?=(src|node_modules|account-protocol|wasm)\/)/, '')
      .replace(/^.*node_modules\/\.pnpm\/[^/]+\/node_modules\//, 'npm:'),
    line: entry.originalLine + 1,
    name: entry.name,
  };
}
/** Aggregate a CPU profile into self and inclusive time per source-mapped function. */
export function aggregate(profile, keys) {
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const label = new Map();
  for (const n of profile.nodes) {
    const f = n.callFrame;
    const m = mapFrame(f);
    const fn = f.functionName || '(anonymous)';
    label.set(
      n.id,
      m
        ? `${fn} ${m.source}:${m.line}`
        : f.url
          ? `${fn} ${f.url.split('/').pop()}:${f.lineNumber + 1}`
          : fn,
    );
  }
  const self = new Map(),
    incl = new Map();
  let total = 0,
    idle = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i];
    const dt = profile.timeDeltas[i];
    total += dt;
    const name = label.get(id);
    if (name === '(idle)') {
      idle += dt;
      continue;
    }
    self.set(name, (self.get(name) ?? 0) + dt);
    const seen = new Set();
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
      const l = label.get(cur);
      if (seen.has(l)) continue;
      seen.add(l);
      incl.set(l, (incl.get(l) ?? 0) + dt);
    }
  }
  const top = (m, n) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name, us]) => ({ name, ms: round(us / 1000), msPerKey: round(us / 1000 / keys) }));
  return {
    totalMs: round(total / 1000),
    idleMs: round(idle / 1000),
    activeMs: round((total - idle) / 1000),
    activeMsPerKey: round((total - idle) / 1000 / keys),
    self: top(self, 40),
    inclusive: top(incl, 70),
  };
}
export const save = (name, value) => {
  writeFileSync(join(RESULTS, name), typeof value === 'string' ? value : JSON.stringify(value));
  return join(RESULTS, name);
};

/** Wait until no request has started for `idle` ms (the long-lived stream excepted). */
export async function quiet(page, net, idle = 2000, timeout = 180000) {
  const started = Date.now();
  let last = net.mark().rows,
    since = Date.now();
  while (Date.now() - started < timeout) {
    await page.waitForTimeout(250);
    const now = net.mark().rows;
    if (now !== last) {
      last = now;
      since = Date.now();
    } else if (Date.now() - since >= idle) return Date.now() - started;
  }
  return -1;
}
