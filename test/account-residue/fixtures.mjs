import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir, release } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { build } from 'vite';
import { authenticator, finishRequest } from '../account-core/fixtures.mjs';
import { hash, assess } from './matcher.mjs';
import { acquire, REQUIRED } from './node-collector.mjs';
import { captureDiagnostic } from './browser-collector.mjs';
import { freshScopeIssues } from './policy.mjs';
export const report = (name, data) => {
  if (REPORT_DIR) {
    mkdirSync(REPORT_DIR, { recursive: true });
    writeFileSync(join(REPORT_DIR, name + '.json'), JSON.stringify(data, null, 2) + '\n');
  }
};
const REPORT_DIR =
  process.env.ACCOUNT_REPORT_DIR ??
  resolve('test-results/account-residue-focused', new Date().toISOString().replaceAll(':', '-'));
const cache = new Map();
export async function bundle(leak = false) {
  if (cache.has(leak)) return cache.get(leak);
  let hits = 0;
  const built = await build({
    configFile: false,
    logLevel: 'error',
    plugins: [
      {
        name: 'residue-write-leak',
        enforce: 'pre',
        transform(code, id) {
          if (id.endsWith('/src/crdt/admissionQueue.ts')) {
            const anchor =
              "if (state !== 'active' || !journalDirty || timer !== undefined) return;";
            assert.equal(code.split(anchor).length, 2);
            return code.replace(
              anchor,
              anchor + '\n    if ((globalThis as any).trialHoldFlush) return;',
            );
          }
          if (!leak || !id.endsWith('/src/crdt/journalStore.ts')) return;
          const anchor = 's.setItem(storageKey, value);';
          assert.equal(code.split(anchor).length, 2);
          hits++;
          return code.replace(
            anchor,
            anchor +
              "\n        s.setItem('unexpected-plaintext-side-write', JSON.stringify([...update]));",
          );
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-residue/browser.ts'),
        name: 'Product',
        formats: ['iife'],
      },
    },
  });
  assert.equal(hits, leak ? 1 : 0);
  const script = (Array.isArray(built) ? built[0] : built).output.find(
    (o) => o.type === 'chunk',
  ).code;
  cache.set(leak, script);
  return script;
}
export const marker = (role) => 'needle_' + role + '_' + randomBytes(16).toString('hex');
export async function fixture(t, { leak = false } = {}) {
  // Assets are compiled before any run's sentinel or factor is generated.
  const script = await bundle(leak),
    dir = mkdtempSync(join(tmpdir(), 'done-residue-'));
  const token = randomBytes(32).toString('base64url'),
    child = fork(new URL('./service.mjs', import.meta.url), [], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
  const buffers = { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) },
    pending = new Map(),
    diagnosticErrors = [];
  let next = 0,
    browser,
    context,
    page,
    closed = false;
  for (const name of ['stdout', 'stderr'])
    child[name].on('data', (b) => {
      if (buffers[name].length + b.length > 64 * 1024 ** 2) {
        if (!diagnosticErrors.includes('service-diagnostic-byte-budget'))
          diagnosticErrors.push('service-diagnostic-byte-budget');
        return;
      }
      buffers[name] = Buffer.concat([buffers[name], b]);
    });
  child.on('message', (m) => {
    const item = pending.get(m.id);
    if (item) {
      item.message = m;
      item.check();
    }
  });
  child.on('exit', (code) => {
    for (const item of pending.values()) item.reject(Error('Service exited ' + code));
  });
  const rpc = (method, args) =>
    new Promise((resolve, reject) => {
      const id = ++next,
        timer = setTimeout(() => {
          finish(Error('Service RPC timeout: ' + method));
        }, 30000);
      const finish = (error, result) => {
        clearTimeout(timer);
        clearInterval(poll);
        pending.delete(id);
        if (error) reject(error);
        else resolve(result);
      };
      const check = () => {
        const m = pending.get(id)?.message;
        if (!m) return;
        if (method === 'barrier' && !m.error) {
          for (const name of ['stdout', 'stderr'])
            if (!buffers[name].includes('\nRESIDUE-FENCE:' + id + '\n')) return;
        }
        finish(m.error ? Error(m.error) : null, m.result);
      };
      const poll = setInterval(check, 5);
      pending.set(id, { check, reject: (e) => finish(e), message: null });
      child.send({ id, method, args });
    });
  const dispose = async () => {
    if (closed) return;
    closed = true;
    await browser?.close();
    try {
      await rpc('close');
    } finally {
      child.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  };
  t.after(dispose);
  const { origin, pin } = await rpc('start', { dir, token });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  context = await browser.newContext();
  await context.route(origin + '/', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      headers: {
        'Content-Security-Policy':
          "default-src 'none'; script-src 'wasm-unsafe-eval'; connect-src 'self'",
      },
      body: '<!doctype html><title>Disposable residue trial</title>',
    }),
  );
  const messages = [],
    diagnosticTasks = new Set(),
    workerList = [];
  const attach = (p) => {
    p.on('console', (m) => {
      // Capture string output and serializable argument values; do not rely only on console.text summaries.
      const index = messages.length;
      messages.push({ kind: 'capture-pending' });
      const work = Promise.all(m.args().map((a) => a.evaluate(captureDiagnostic))).then(
        (args) => {
          messages[index] = { kind: 'console', type: m.type(), text: m.text(), args };
        },
        () => {
          messages[index] = { kind: 'unreadable-console-argument' };
          diagnosticErrors.push('unreadable-console-argument');
        },
      );
      diagnosticTasks.add(work);
      work.finally(() => diagnosticTasks.delete(work));
    });
    p.on('pageerror', (e) =>
      messages.push({ kind: 'pageerror', message: e.message, stack: e.stack }),
    );
    p.on('worker', (w) => workerList.push({ url: w.url(), captured: false }));
  };
  context.on('page', attach);
  context.on('serviceworker', (w) => workerList.push({ url: w.url(), captured: false }));
  const keys = new Map();
  await context.exposeBinding('trialAssertion', (_, { kind, input }) => {
    if (kind === 'activation')
      return keys
        .get(input.allowCredentials[0].id)
        .assert({ options: input }, { client: { origin } });
    const key = keys.get(input.credentialId),
      response = key.assert(
        { options: { challenge: Buffer.from(input.challenge).toString('base64url') } },
        { client: { origin } },
      );
    return {
      credentialId: response.id,
      ...Object.fromEntries(
        ['authenticatorData', 'clientDataJSON', 'signature'].map((k) => [
          k,
          [...Buffer.from(response.response[k], 'base64url')],
        ]),
      ),
    };
  });
  const setup = async (p) => {
    await p.goto(origin);
    await p.evaluate(script);
    await p.evaluate(
      ({ pin, token }) => {
        globalThis.pin = pin;
        globalThis.request = async (path, input) => {
          const r = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify(input),
          });
          return r.json();
        };
        globalThis.prove = (input) => request('/account/authority/prove', input);
        globalThis.transport = {
          inspect: (input) => request('/account/preparation/inspect', input),
          abandon: (input) => request('/account/preparation/abandon', input),
        };
        globalThis.admissionTransport = {
          begin: (input) => request('/account/promotion/begin', input),
          challenge: (input) => request('/account/promotion/challenge', input),
          finish: (input) => request('/account/promotion/finish', input),
        };
        globalThis.assertActivation = (input) => trialAssertion({ kind: 'activation', input });
        globalThis.assertPasskey = async (req) => {
          const r = await trialAssertion({
            kind: 'passkey',
            input: { ...req, challenge: [...req.challenge] },
          });
          return {
            ...r,
            ...Object.fromEntries(
              ['authenticatorData', 'clientDataJSON', 'signature'].map((k) => [
                k,
                new Uint8Array(r[k]),
              ]),
            ),
          };
        };
        globalThis.ownerOptions = (item) => ({
          slotId: item.slotId,
          code: item.code,
          pin,
          assertPasskey,
          identity: {
            id: item.scope.principalId,
            actor: { kind: 'human', name: 'Trial author', color: '#123456' },
            device: { id: 'trial-device', name: 'Trial device' },
          },
          today: () => '2026-09-12',
        });
        globalThis.syncToken = token;
      },
      { pin, token },
    );
  };
  const f = {
    origin,
    pin,
    context,
    browser,
    rpc,
    script,
    token,
    dispose,
    dbPaths: { core: join(dir, 'core.sqlite'), authority: join(dir, 'authority.sqlite') },
    diagnostics: async () => {
      await Promise.all(diagnosticTasks);
      return messages;
    },
    serviceDiagnostics: () => ({ ...buffers }),
    workers: async () => workerList,
    diagnosticErrors: () => diagnosticErrors,
    get page() {
      return page;
    },
    cold: async () => {
      await page.close();
      page = await context.newPage();
      await setup(page);
    },
    register: async () => {
      const key = authenticator(),
        retryKey = randomBytes(32).toString('base64url');
      keys.set(key.id, key);
      let view = await call('/account/begin', { operation: 'register', retryKey });
      const accountId = view.options.user.id;
      view = await call(
        '/account/finish',
        finishRequest(view, retryKey, key.register(view, { client: { origin } })),
      );
      const receipt = await call(
        '/account/finish',
        finishRequest(view, retryKey, key.assert(view, { client: { origin } })),
      );
      assert.equal(receipt.stage, 'credential-confirmed');
      return { accountId, retryKey, key };
    },
  };
  const call = (path, input) =>
    page.evaluate(({ path, input }) => request(path, input), { path, input });
  f.call = call;
  page = await context.newPage();
  await setup(page);
  return f;
}
export const factor = (id, code) => ({ id, values: [code, code.replace(/[\s-]/g, '')] });
export const args = (item) => Object.fromEntries(Object.entries(item).filter(([k]) => k !== 'key'));
export async function checkpoint(
  f,
  needles,
  id,
  { allow = () => false, expected = 'complete-no-prohibited-match', ...options } = {},
) {
  needles = [
    ...needles,
    {
      id: 'httpToken',
      values: [f.token],
      raw: [Buffer.from(f.token, 'base64url').toString('base64')],
    },
  ];
  const raw = await acquire(f, options),
    result = assess(raw.collections, needles, REQUIRED, allow);
  result.issues.push(...freshScopeIssues(raw.collections));
  if (!result.matches.length && result.issues.length) result.verdict = 'incomplete';
  if (raw.workerCoverage.some((w) => !w.captured)) {
    result.issues.push({ reason: 'uncaptured-worker' });
    if (!result.matches.length) result.verdict = 'incomplete';
  }
  if ((await f.diagnostics()).some((d) => d.kind === 'unreadable-console-argument')) {
    result.issues.push({ reason: 'unreadable-diagnostic' });
    if (!result.matches.length) result.verdict = 'incomplete';
  }
  report(id + '.needles.raw', {
    notice: 'Controller-held synthetic needles. Outside the tested app/service exposure domain.',
    needles,
  });
  report(id + '.raw', {
    notice:
      'Synthetic raw captured storage only. Contains planted data/capabilities; outside the tested app/service exposure domain.',
    ...raw,
  });
  const locator = (value) => {
    if (
      typeof value === 'string' &&
      needles.some((n) => (n.values ?? []).some((v) => value.includes(v)))
    )
      return '[redacted-locator:' + hash(value) + ']';
    if (Array.isArray(value)) return value.map(locator);
    return value;
  };
  const safe = {
    ...result,
    ...Object.fromEntries(
      ['matches', 'exposures', 'issues', 'acquired'].map((key) => [
        key,
        result[key].map((row) => ({
          ...row,
          ...(row.location ? { location: locator(row.location) } : {}),
        })),
      ]),
    ),
  };
  report(id, {
    ...safe,
    bundleSha256: hash(f.script),
    runtime: {
      node: process.version,
      browser: f.browser.version(),
      platform: process.platform,
      osRelease: release(),
      arch: process.arch,
    },
    stable: raw.stable,
    scope:
      'R1 named logical carriers, not physical residue, all keys, or arbitrary fragmented/transformed plaintext',
  });
  assert.equal(
    result.verdict,
    expected,
    JSON.stringify({ id, matches: safe.matches, issues: safe.issues }),
  );
  return result;
}
