import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { build } from 'vite';
import { PrivateAuthority } from '../../account-service/authority.ts';
import { createPrivateAccountServer } from '../../account-service/private-server.ts';
import { authenticator, fresh, finishRequest } from '../account-core/fixtures.mjs';
import { generateRecovery, confirmRecovery } from '../../src/account/recovery.ts';
export { fresh };
export async function bundle(mutant = false) {
  const built = await build({
    configFile: false,
    logLevel: 'error',
    plugins: mutant
      ? [
          {
            name: 'promotion-mac-control',
            enforce: 'pre',
            transform(code, id) {
              if (id.endsWith('/src/crdt/promotionRecord.ts')) {
                const needle = "throw Error('Promotion authentication failed');";
                if (!code.includes(needle)) throw Error('Control target missing');
                return code.replace(needle, 'void 0;');
              }
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-promotion/browser.ts'),
        name: 'Harness',
        formats: ['iife'],
      },
    },
  });
  return (Array.isArray(built) ? built[0] : built).output.find((f) => f.type === 'chunk').code;
}
const script = await bundle();
export async function native(t) {
  const dir = mkdtempSync(join(tmpdir(), 'done-promotion-')),
    key = randomBytes(32),
    token = fresh();
  let pin;
  const server = await createPrivateAccountServer({
    path: join(dir, 'account.sqlite'),
    token,
    authority(policy) {
      pin = PrivateAuthority.initialize(join(dir, 'root.sqlite'), policy, key);
      return PrivateAuthority.open(join(dir, 'root.sqlite'), pin, key);
    },
  });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  t.after(async () => {
    await browser.close();
    await server.close();
    key.fill(0);
    rmSync(dir, { recursive: true, force: true });
  });
  const context = await browser.newContext();
  await context.route(server.origin + '/', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      headers: {
        'Content-Security-Policy':
          "default-src 'none'; script-src 'wasm-unsafe-eval'; connect-src 'self'",
      },
      body: '<!doctype html><title>Disposable promotion harness</title>',
    }),
  );
  const setup = async (page) => {
    await page.goto(server.origin);
    await page.evaluate(script);
    await page.evaluate(
      ({ pin, token }) => {
        window.pin = pin;
        window.calls = 0;
        window.request = async (path, input) => {
          calls++;
          return (
            await fetch(path, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
              body: JSON.stringify(input),
            })
          ).json();
        };
        window.prove = (input) => request('/account/authority/prove', input);
        window.transport = {
          inspect: (input) => request('/account/preparation/inspect', input),
          abandon: (input) => request('/account/preparation/abandon', input),
        };
      },
      { pin, token },
    );
  };
  const page = await context.newPage();
  await setup(page);
  const register = async () => {
    const key = authenticator(),
      retryKey = fresh();
    let view = server.core.begin({ operation: 'register', retryKey });
    const accountId = view.options.user.id;
    view = await server.core.finish(
      finishRequest(view, retryKey, key.register(view, { client: { origin: server.origin } })),
    );
    const result = await server.core.finish(
      finishRequest(view, retryKey, key.assert(view, { client: { origin: server.origin } })),
    );
    if (!result.ok) throw Error(JSON.stringify(result));
    return { key, retryKey, accountId };
  };
  const local = async (slotId) => {
    const item = await page.evaluate(async (slotId) => {
      const c = Harness.beginLocalGenesis(slotId),
        code = c.displayCode,
        receipt = await c.confirm(code);
      return { slotId, code, scope: receipt.scope };
    }, slotId);
    const account = await register();
    const inspected = await page.evaluate(
      (item) => Harness.inspectLocalPromotion({ ...item, pin, proveAuthority: prove }),
      { ...item, accountId: account.accountId },
    );
    return { ...item, ...account, context: inspected.context };
  };
  const ready = async (slotId) => {
    const item = await local(slotId),
      generated = await generateRecovery(item.context);
    let view = await server.core.beginRecovery({ retryKey: item.retryKey, draft: generated.draft });
    if (!view.ok) throw Error(JSON.stringify(view));
    const receipt = await server.core.finishRecovery({
      retryKey: item.retryKey,
      recoveryId: view.recoveryId,
      recoveryProof: await confirmRecovery(
        generated.draft,
        generated.code,
        view.options.challenge,
        view.draftDigest,
      ),
      response: item.key.assert(view, { client: { origin: server.origin } }),
    });
    if (!receipt.ok) throw Error(JSON.stringify(receipt));
    return { ...item, draft: generated.draft, receipt };
  };
  return { page, browser, context, setup, ready, local, server, pin, script };
}
export const args = (item) => ({
  slotId: item.slotId,
  code: item.code,
  scope: item.scope,
  accountId: item.accountId,
  retryKey: item.retryKey,
  draft: item.draft,
});
export const prepare = (page, item) =>
  page.evaluate(
    (item) => Harness.prepareLocalPromotion({ ...item, pin, proveAuthority: prove, transport }),
    args(item),
  );
export const abandon = (page, item) =>
  page.evaluate((item) => Harness.abandonLocalPromotion({ ...item, pin, transport }), args(item));
export const snapshot = (page, item) =>
  page.evaluate((scope) => Harness.snapshot(scope), item.scope);
export const text = (page, item) =>
  page.evaluate((item) => Harness.readText(item.scope, item.code), args(item));
export const edit = (page, item) =>
  page.evaluate((item) => Harness.append(item.scope, item.code, 'journal'), args(item));
export const inventory = (page) => page.evaluate(() => Harness.inventory());
// Instrument actual IDB request success/transaction completion, not production transition helpers.
export async function boundary(page, stage, side) {
  await page.evaluate(
    ({ stage, side }) => {
      const put = IDBObjectStore.prototype.put,
        marks = new WeakMap();
      IDBObjectStore.prototype.put = function (value, key) {
        const req = put.call(this, value, key);
        if (Array.isArray(key) && key[1] === 'application-upgrade' && value.stage === stage) {
          marks.set(this.transaction, true);
          if (side === 'before')
            req.addEventListener('success', () => {
              window.hit = true;
              this.transaction.abort();
            });
        }
        return req;
      };
      const d = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
      Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
        ...d,
        set(fn) {
          d.set.call(this, function (event) {
            if (marks.has(this) && side === 'after') {
              window.hit = true;
              window.release = () => fn.call(this, event);
            } else fn.call(this, event);
          });
        },
      });
    },
    { stage, side },
  );
}
