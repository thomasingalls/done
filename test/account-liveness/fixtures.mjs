import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir, loadavg, release } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { openFixtureBrowser } from '../account-promotion/browser-owner.mjs';
import { build } from 'vite';
import { authenticator, finishRequest } from '../account-core/fixtures.mjs';
import { instrument, clockSeam, targets, verificationOracle } from './instrument.mjs';
import { installProbe } from './probe.mjs';
export { args } from '../account-residue/fixtures.mjs';
export {
  createLocal,
  openLocal,
  prepareRecovery,
  select,
  insert,
  close,
  read,
} from '../account-residue/lifecycle.mjs';
const output =
  process.env.ACCOUNT_REPORT_DIR ??
  resolve('test-results/account-liveness-focused', new Date().toISOString().replaceAll(':', '-'));
export const report = (name, data) => {
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, name + '.json'), JSON.stringify(data, null, 2) + '\n');
};
export const hash = (b) => createHash('sha256').update(b).digest('hex');
const bundles = new Map();
export async function bundle(measured) {
  if (bundles.has(measured)) return bundles.get(measured);
  const hits = {};
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: measured
      ? [
          {
            name: 'liveness-measurement',
            enforce: 'pre',
            transform(code, id) {
              return clockSeam(verificationOracle(instrument(code, id, hits), id), id);
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-liveness/browser.ts'),
        name: 'Product',
        formats: ['iife'],
      },
    },
  });
  if (measured)
    for (const [path, functions] of Object.entries(targets))
      if (path.startsWith('/src/'))
        for (const [name] of Object.values(functions)) assert.equal(hits[name], 1, name);
  const script = (Array.isArray(result) ? result[0] : result).output.find(
    (o) => o.type === 'chunk',
  ).code;
  const value = { script, hits, sha256: hash(script) };
  bundles.set(measured, value);
  return value;
}
export async function fixture(t) {
  await bundle(true);
  await bundle(false);
  const dir = mkdtempSync(join(tmpdir(), 'done-liveness-')),
    token = randomBytes(32).toString('base64url');
  const child = fork(new URL('./service.mjs', import.meta.url), [], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let serial = 0,
    browser,
    context,
    page,
    closed = false;
  const pending = new Map(),
    diagnostics = [];
  for (const channel of ['stdout', 'stderr'])
    child[channel].on('data', (b) => {
      if (diagnostics.length < 100) diagnostics.push({ channel, text: b.toString() });
    });
  child.on('message', (m) => {
    const p = pending.get(m.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(m.id);
    if (m.error) p.reject(Error(m.error));
    else p.resolve(m.result);
  });
  child.on('exit', () => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error('Service exited: ' + JSON.stringify(diagnostics)));
    }
    pending.clear();
  });
  const rpc = (method, args) =>
    new Promise((resolve, reject) => {
      const id = ++serial,
        timer = setTimeout(() => {
          pending.delete(id);
          reject(Error('RPC timeout: ' + method));
        }, 30000);
      pending.set(id, { resolve, reject, timer });
      child.send({ id, method, args });
    });
  const dispose = async () => {
    if (closed) return;
    closed = true;
    try {
      await context?.close();
    } finally {
      try {
        await browser?.close();
      } finally {
        try {
          if (child.connected) await rpc('close');
        } finally {
          child.kill();
          rmSync(dir, { recursive: true, force: true });
        }
      }
    }
  };
  t.after(dispose);
  const { origin, pin, hits } = await rpc('start', { dir, token });
  for (const [name] of Object.values(targets['/account-service/delivery.ts']))
    assert.equal(hits[name], 1);
  browser = await openFixtureBrowser(chromium);
  context = await browser.newContext();
  const keys = new Map();
  await context.route(origin + '/', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Synthetic liveness trial</title>',
    }),
  );
  await context.exposeBinding('trialAssertion', (_, { kind, input }) => {
    if (kind === 'activation')
      return keys
        .get(input.allowCredentials[0].id)
        .assert({ options: input }, { client: { origin } });
    const response = keys
      .get(input.credentialId)
      .assert(
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
  const setup = async (p, measured = true) => {
    await p.goto(origin);
    await p.evaluate((await bundle(measured)).script);
    await p.evaluate(installProbe);
    if (!measured) await p.evaluate(() => livenessProbe.restoreCrypto());
    await p.evaluate(
      ({ pin, token }) => {
        globalThis.pin = pin;
        globalThis.syncToken = token;
        globalThis.request = async (path, input) =>
          (
            await fetch(path, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
              body: JSON.stringify(input),
            })
          ).json();
        globalThis.prove = (input) => request('/account/authority/prove', input);
        globalThis.transport = {
          inspect: (i) => request('/account/preparation/inspect', i),
          abandon: (i) => request('/account/preparation/abandon', i),
        };
        globalThis.admissionTransport = {
          begin: (i) => request('/account/promotion/begin', i),
          challenge: (i) => request('/account/promotion/challenge', i),
          finish: (i) => request('/account/promotion/finish', i),
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
            actor: { kind: 'human', name: 'Synthetic author', color: '#123456' },
            device: { id: 'liveness-device', name: 'Synthetic device' },
          },
          today: () => '2026-09-12',
        });
        globalThis.setOnline = (online) => {
          Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
          dispatchEvent(new Event(online ? 'online' : 'offline'));
        };
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
    dispose,
    get page() {
      return page;
    },
    metadata: {
      node: process.version,
      chromium: browser.version(),
      platform: process.platform,
      arch: process.arch,
      os: release(),
      serviceHits: hits,
      bundles: Object.fromEntries(
        [...bundles].map(([k, v]) => [k, { sha256: v.sha256, hits: v.hits }]),
      ),
    },
    async cold(measured = true) {
      await page.close();
      page = await context.newPage();
      await setup(page, measured);
    },
    async register() {
      const key = authenticator(),
        retryKey = randomBytes(32).toString('base64url');
      keys.set(key.id, key);
      const call = (path, input) =>
        page.evaluate(({ path, input }) => request(path, input), { path, input });
      let v = await call('/account/begin', { operation: 'register', retryKey });
      const accountId = v.options.user.id;
      v = await call(
        '/account/finish',
        finishRequest(v, retryKey, key.register(v, { client: { origin } })),
      );
      const receipt = await call(
        '/account/finish',
        finishRequest(v, retryKey, key.assert(v, { client: { origin } })),
      );
      assert.equal(receipt.stage, 'credential-confirmed');
      return { accountId, retryKey, key };
    },
  };
  page = await context.newPage();
  await setup(page);
  return f;
}
export async function sync(f, item, online = true) {
  await f.page.evaluate(
    async ({ item, online }) => {
      setOnline(online);
      globalThis.opened = await Product.openOwnedSyncingAccountWorkspace(
        ownerOptions(item),
        syncToken,
      );
      globalThis.editor = opened.workspace;
      globalThis.syncTimeline = [{ at: performance.now(), status: opened.sync.status }];
      opened.sync.onStatus((status) => syncTimeline.push({ at: performance.now(), status }));
    },
    { item: Object.fromEntries(Object.entries(item).filter(([k]) => k !== 'key')), online },
  );
}
export async function settle(f, minimum = 0, expedite = true) {
  await f.page.waitForFunction(
    (minimum) =>
      opened.sync.status.send.phase === 'idle' &&
      opened.sync.status.send.acceptedThrough >= minimum,
    minimum,
    { timeout: 120000 },
  );
  const target = await f.page.evaluate((expedite) => {
    if (expedite) opened.sync.retry('receive');
    return opened.sync.status.send.acceptedThrough;
  }, expedite);
  await f.page.waitForFunction(
    (target) =>
      opened.sync.status.receive.phase === 'idle' &&
      opened.sync.status.receive.receivedThrough >= target,
    target,
    { timeout: 120000 },
  );
  return target;
}
export async function sample(f, name, operation) {
  await f.rpc('reset');
  await f.page.evaluate(() => livenessProbe.reset());
  const load = loadavg(),
    at = performance.now();
  try {
    const value = await operation();
    return {
      name,
      milliseconds: performance.now() - at,
      load,
      value,
      client: await f.page.evaluate(() => livenessProbe.stop()),
      service: await f.rpc('metrics'),
    };
  } catch (e) {
    report('failed-' + name, { error: e.stack, load, milliseconds: performance.now() - at });
    throw e;
  }
}
