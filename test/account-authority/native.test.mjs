import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { build } from 'vite';
import fc from 'fast-check';
import { PrivateAuthority } from '../../account-service/authority.ts';
import { createPrivateAccountServer } from '../../account-service/private-server.ts';
import { verifyPinnedAuthority } from '../../account-protocol/authority.ts';
const built = await build({
  configFile: false,
  logLevel: 'error',
  build: {
    write: false,
    minify: false,
    lib: {
      entry: resolve('test/account-authority/browser.ts'),
      name: 'Harness',
      formats: ['iife'],
    },
  },
});
const script = (Array.isArray(built) ? built[0] : built).output.find(
  (f) => f.type === 'chunk',
).code;
async function native(t) {
  const dir = mkdtempSync(join(tmpdir(), 'done-authority-native-')),
    key = randomBytes(32),
    token = randomBytes(32).toString('base64url');
  let pin;
  const server = await createPrivateAccountServer({
    path: join(dir, 'account.sqlite'),
    token,
    authority: (policy) => {
      pin = PrivateAuthority.initialize(join(dir, 'authority.sqlite'), policy, key);
      return PrivateAuthority.open(join(dir, 'authority.sqlite'), pin, key);
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
  // This inert page is the disposable application harness. The API adapter keeps its default-src none CSP.
  await context.route(server.origin + '/', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      headers: {
        'Content-Security-Policy':
          "default-src 'none'; script-src 'wasm-unsafe-eval'; connect-src 'self'; frame-ancestors 'none'",
      },
      body: '<!doctype html><title>Disposable promotion preflight harness</title>',
    }),
  );
  const page = await context.newPage();
  const setup = async (page) => {
    await page.goto(server.origin);
    await page.evaluate(script);
    await page.evaluate(
      ({ pin, token }) => {
        window.pin = pin;
        window.networkCalls = 0;
        window.prove = async (input) => {
          window.networkCalls++;
          const response = await fetch('/account/authority/prove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify(input),
          });
          return response.json();
        };
      },
      { pin, token },
    );
  };
  await setup(page);
  return { server, browser, context, page, pin, token, setup };
}
async function local(page, slotId) {
  return page.evaluate(async (slotId) => {
    const ceremony = Harness.beginLocalGenesis(slotId),
      code = ceremony.displayCode;
    const receipt = await ceremony.confirm(code);
    return { slotId, code, scope: receipt.scope };
  }, slotId);
}
const accountId = () => randomBytes(32).toString('base64url');
const inspect = (page, item) =>
  page.evaluate(
    (item) => Harness.inspectLocalPromotion({ ...item, pin, proveAuthority: prove }),
    item,
  );

test(
  'native Local+encrypted-journal preflight, independent pin, repeatable recovery context and refusal boundaries',
  { timeout: 30000 },
  async (t) => {
    const { page, setup, pin: expected, server, token } = await native(t),
      item = { ...(await local(page, 'promotion-main')), accountId: accountId() };
    await page.evaluate((item) => Harness.append(item.scope, item.code, 'journal'), item);
    const before = await page.evaluate(() => Harness.inventory()),
      first = await inspect(page, item);
    assert.equal(first.recovered.journalEntries, 1);
    assert.deepEqual(first.pin, expected);
    assert.equal(first.source.storeId.length, 32);
    assert.deepEqual(first.context.principalId, item.scope.principalId);
    assert.deepEqual(first.context.workspaceId, item.scope.workspaceId);
    assert.equal(await page.evaluate(() => Harness.inventory()), before);
    assert.match(
      await page.evaluate((item) => Harness.readText(item.scope, item.code), item),
      /written before promotion/,
    );
    await page.reload();
    await setup(page);
    assert.deepEqual(await inspect(page, item), first);
    // The recovery seal now binds a root checked through independent configuration and an authenticated Local scope.
    assert.equal(
      await page.evaluate(async (context) => {
        const { draft, code } = await Harness.generateRecovery(context);
        const challenge = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
          .replaceAll('+', '-')
          .replaceAll('/', '_')
          .replaceAll('=', '');
        return (
          await Harness.confirmRecovery(draft, code, challenge, await Harness.draftDigest(draft))
        ).length;
      }, first.context),
      128,
    );
    await page.evaluate((item) => Harness.importedClaim(item.slotId, item.code), item);
    const importedBefore = await page.evaluate(() => Harness.inventory());
    assert.deepEqual((await inspect(page, item)).context, first.context);
    assert.equal(await page.evaluate(() => Harness.inventory()), importedBefore);
    const calls = await page.evaluate(() => networkCalls);
    await assert.rejects(inspect(page, { ...item, code: 'wrong' }));
    assert.equal(await page.evaluate(() => networkCalls), calls);
    await assert.rejects(
      page.evaluate(
        (item) =>
          Harness.inspectLocalPromotion({
            ...item,
            pin: { ...pin, authRoot: 'ab'.repeat(32) },
            proveAuthority: prove,
          }),
        item,
      ),
      /pin changed/,
    );
    const pending = { ...(await local(page, 'promotion-pending')), accountId: accountId() };
    await page.evaluate((item) => Harness.append(item.scope, item.code, 'pending'), pending);
    const prior = await page.evaluate(() => networkCalls);
    await assert.rejects(inspect(page, pending), /pending-dependencies/);
    assert.equal(await page.evaluate(() => networkCalls), prior);
    const admitted = { ...(await local(page, 'promotion-admitted')), accountId: accountId() };
    await page.evaluate((item) => Harness.append(item.scope, item.code, 'heads'), admitted);
    await assert.rejects(inspect(page, admitted), /admission-material/);
    // Same adapter policy boundaries protect this new route.
    const response = await fetch(server.origin + '/account/authority/prove', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: server.origin,
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({ nonce: '00'.repeat(32) }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(
      await verifyPinnedAuthority(expected, '00'.repeat(32), await response.json()),
      expected,
    );
    const denied = await fetch(server.origin + '/account/authority/prove', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.invalid',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({ nonce: '00'.repeat(32) }),
    });
    assert.equal(denied.status, 403);
  },
);

test(
  'native preflight cancellation holds slot exclusion until the network attempt settles',
  { timeout: 20000 },
  async (t) => {
    const { page, context, setup } = await native(t),
      item = { ...(await local(page, 'promotion-cancel')), accountId: accountId() };
    const other = await context.newPage();
    await setup(other);
    await page.evaluate((item) => {
      window.controller = new AbortController();
      window.work = Harness.inspectLocalPromotion({
        ...item,
        pin,
        signal: controller.signal,
        proveAuthority: async (input) => {
          window.entered = true;
          await new Promise((resolve) => (window.release = resolve));
          return prove(input);
        },
      }).then(
        () => 'success',
        (error) => error.code ?? error.name,
      );
    }, item);
    await page.waitForFunction(() => window.entered === true);
    await page.evaluate(() => controller.abort());
    await other.evaluate((slot) => {
      window.acquired = false;
      window.waiter = Harness.withExclusiveSlot(slot, async () => {
        window.acquired = true;
      });
    }, item.slotId);
    assert.equal(await other.evaluate(() => window.acquired), false);
    await page.evaluate(async () => {
      release();
      await work;
    });
    await other.evaluate(() => waiter);
    assert.equal(await other.evaluate(() => window.acquired), true);
    assert.notEqual(await page.evaluate(() => work), 'success');
    assert.equal((await inspect(other, item)).kind, 'promotion-preflight');
  },
);

test(
  '40 generated native histories preserve carriers and keep the recovery context stable',
  { timeout: 40000 },
  async (t) => {
    const { page, setup } = await native(t);
    let count = 0;
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('inspect', 'wrong-code', 'restart', 'disk-edit', 'journal-edit'), {
          minLength: 1,
          maxLength: 8,
        }),
        async (commands) => {
          const item = { ...(await local(page, 'generated-' + count++)), accountId: accountId() };
          let context;
          try {
            for (const command of commands) {
              if (command === 'restart') {
                await page.reload();
                await setup(page);
              }
              if (command === 'disk-edit' || command === 'journal-edit') {
                await page.evaluate(
                  ({ item, kind }) => Harness.append(item.scope, item.code, kind),
                  {
                    item,
                    kind: command === 'disk-edit' ? 'disk' : 'journal',
                  },
                );
                continue;
              }
              const before = await page.evaluate(() => Harness.inventory());
              if (command === 'wrong-code')
                await assert.rejects(inspect(page, { ...item, code: 'wrong' }));
              else {
                const result = await inspect(page, item);
                context ??= result.context;
                assert.deepEqual(result.context, context);
              }
              // Reads leave every retained byte unchanged; restart additionally reloads the page.
              assert.equal(await page.evaluate(() => Harness.inventory()), before);
            }
          } catch (error) {
            if (process.env.ACCOUNT_REPORT_DIR)
              writeFileSync(
                join(process.env.ACCOUNT_REPORT_DIR, 'native-counterexample-' + count + '.json'),
                JSON.stringify(
                  {
                    seed: 9182026,
                    commands,
                    scope: item.scope,
                    error: String(error),
                    inventory: await page.evaluate(() => Harness.inventory()),
                  },
                  null,
                  2,
                ),
              );
            throw error;
          }
        },
      ),
      { numRuns: 40, seed: 9182026, endOnFailure: true },
    );
    assert.equal(count, 40);
  },
);
