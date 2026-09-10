import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { build } from 'vite';
import { createPrivateAccountServer } from '../../account-service/private-server.ts';
import { fresh, scope } from './fixtures.mjs';
import { finishRequest } from '../account-core/fixtures.mjs';

const compiled = await build({
  configFile: false,
  logLevel: 'error',
  build: {
    write: false,
    minify: false,
    lib: {
      entry: resolve('src/account/recoveryOwner.ts'),
      name: 'RecoveryOwner',
      formats: ['iife'],
    },
  },
});
const script = (Array.isArray(compiled) ? compiled[0] : compiled).output.find(
  (file) => file.type === 'chunk',
).code;

test(
  'native saved-code reentry, full browser restart, owner exclusion and lost finalization response',
  { timeout: 40000 },
  async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'done-recovery-native-')),
      token = fresh();
    const server = await createPrivateAccountServer({ path: join(dir, 'account.sqlite'), token });
    let browser;
    t.after(async () => {
      await browser?.close();
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    });
    const launch = () =>
      chromium.launchPersistentContext(join(dir, 'profile'), {
        headless: true,
        ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      });
    browser = await launch();
    let page = await browser.newPage();
    await page.goto(server.origin);
    let cdp = await browser.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const virtual = {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    };
    let { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: virtual,
    });
    const retryKey = fresh(),
      view = server.core.begin({ operation: 'register', retryKey });
    const registration = await page.evaluate(
      async (options) =>
        (
          await navigator.credentials.create({
            publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(options),
          })
        ).toJSON(),
      view.options,
    );
    const confirmation = await server.core.finish(finishRequest(view, retryKey, registration));
    const assertion = await page.evaluate(
      async (options) =>
        (
          await navigator.credentials.get({
            publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options),
          })
        ).toJSON(),
      confirmation.options,
    );
    const confirmed = await server.core.finish(finishRequest(confirmation, retryKey, assertion));
    assert.equal(confirmed.stage, 'credential-confirmed');
    const authState = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
    const setup = async (target) => {
      await target.evaluate(script);
      await target.evaluate(
        ({ scope, retryKey, accountId, token }) => {
          window.ownerOptions = {
            context: scope,
            retryKey,
            accountId,
            transport: {
              begin: (input) => window.post('begin', input),
              finish: async (input) => {
                if (window.holdFinish) {
                  window.finishEntered = true;
                  await new Promise(() => {});
                }
                const result = await window.post('finish', input);
                if (window.loseResponse) throw Error('simulated response loss');
                return result;
              },
            },
          };
          window.post = async (method, input) =>
            (
              await fetch('/account/recovery/' + method, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify(input),
              })
            ).json();
          window.getAssertion = async (options) => {
            window.assertions = (window.assertions ?? 0) + 1;
            return (
              await navigator.credentials.get({
                publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options),
              })
            ).toJSON();
          };
          window.run = (method, code) =>
            RecoveryOwner.withRecoveryOwner(ownerOptions, (owner) =>
              method === 'confirm' ? owner.confirm(code, getAssertion) : owner[method](),
            );
        },
        { scope, retryKey, accountId: confirmed.accountId, token },
      );
    };
    await setup(page);
    const abortNextWrite = () =>
      page.evaluate(() => {
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) {
          IDBObjectStore.prototype.put = original;
          const request = original.apply(this, args);
          this.transaction.abort();
          return request;
        };
      });
    await abortNextWrite();
    await assert.rejects(
      page.evaluate(() => run('generate')),
      /abort/i,
    );
    assert.equal(await page.evaluate(() => run('status')), 'empty');
    const { code } = await page.evaluate(() => run('generate'));
    assert.equal(await page.evaluate(() => run('status')), 'awaiting-code');
    // A complete browser process restart keeps IndexedDB; virtual passkey persistence is emulated explicitly.
    await browser.close();
    browser = await launch();
    page = await browser.newPage();
    await page.goto(server.origin);
    cdp = await browser.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    ({ authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: virtual,
    }));
    for (const credential of authState.credentials)
      await cdp.send('WebAuthn.addCredential', { authenticatorId, credential });
    await setup(page);
    assert.equal(await page.evaluate(() => run('status')), 'awaiting-code');
    await assert.rejects(
      page.evaluate(() => run('generate')),
      /already generated/,
    );
    await assert.rejects(page.evaluate(() => run('confirm', 'Z'.repeat(25))));
    assert.equal(await page.evaluate(() => window.assertions ?? 0), 0);
    // The retained record contains an envelope, with no code or confirmation shortcut.
    const inspect = () =>
      page.evaluate(async () => {
        const db = await new Promise((resolve, reject) => {
          const r = indexedDB.open(RecoveryOwner.RECOVERY_PREPARATION_DB);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        const result = await new Promise((resolve) => {
          const tx = db.transaction('progress'),
            r = tx.objectStore('progress').get('pending');
          tx.oncomplete = () => resolve(r.result);
        });
        db.close();
        return result;
      });
    const retained = await inspect();
    assert(!JSON.stringify(retained).includes(code));
    assert.equal(retained.finalization, null);
    // The same profile's other tab cannot acquire the owner while work is awaiting settlement.
    const other = await browser.newPage();
    await other.goto(server.origin);
    await setup(other);
    await page.evaluate(() => {
      window.held = RecoveryOwner.withRecoveryOwner(ownerOptions, async () => {
        window.entered = true;
        await new Promise((resolve) => (window.release = resolve));
      });
    });
    await page.waitForFunction(() => window.entered === true);
    await assert.rejects(
      other.evaluate(() => run('status')),
      /another tab/,
    );
    await page.evaluate(async () => {
      release();
      await held;
    });
    assert.equal(await other.evaluate(() => run('status')), 'awaiting-code');
    await page.evaluate((code) => {
      const begin = ownerOptions.transport.begin;
      window.controller = new AbortController();
      ownerOptions.transport.begin = async (input) => {
        window.blockedBegin = true;
        await new Promise((resolve) => (window.releaseBegin = resolve));
        return begin(input);
      };
      window.cancelledWork = RecoveryOwner.withRecoveryOwner(
        { ...ownerOptions, signal: controller.signal },
        (owner) => owner.confirm(code, getAssertion),
      ).catch((error) => error.message);
      window.restoreBegin = () => (ownerOptions.transport.begin = begin);
    }, code);
    await page.waitForFunction(() => window.blockedBegin === true);
    await page.evaluate(() => controller.abort());
    await assert.rejects(
      other.evaluate(() => run('status')),
      /another tab/,
    );
    assert.match(
      await page.evaluate(async () => {
        releaseBegin();
        restoreBegin();
        return cancelledWork;
      }),
      /closed/,
    );
    assert.equal(await other.evaluate(() => run('status')), 'awaiting-code');
    await other.close();
    await abortNextWrite();
    await assert.rejects(
      page.evaluate((code) => run('confirm', code), code),
      /abort/i,
    );
    assert.equal((await inspect()).finalization, null);
    assert.equal(server.core.resumeRecovery({ retryKey }).stage, 'recovery-ceremony');
    await page.evaluate(() => (window.holdFinish = true));
    const interrupted = page.evaluate((code) => run('confirm', code), code).catch(() => {});
    await page.waitForFunction(() => window.finishEntered === true);
    const crash = page.waitForEvent('crash');
    void cdp.send('Page.crash').catch(() => {});
    await crash;
    await page.close();
    await interrupted;
    page = await browser.newPage();
    await page.goto(server.origin);
    await setup(page);
    assert.equal(await page.evaluate(() => run('status')), 'finalization-pending');
    await page.evaluate(() => (window.loseResponse = true));
    await assert.rejects(
      page.evaluate(() => run('resume')),
      /simulated response loss/,
    );
    const committed = server.core.resumeRecovery({ retryKey });
    assert.equal(committed.stage, 'recovery-confirmed');
    assert.equal((await inspect()).finalization.recoveryId, committed.recoveryId);
    await browser.close();
    browser = await launch();
    page = await browser.newPage();
    await page.goto(server.origin);
    await setup(page);
    assert.equal(await page.evaluate(() => run('status')), 'finalization-pending');
    assert.deepEqual(await page.evaluate(() => run('resume')), committed);
    await page.evaluate(() => {
      const finish = ownerOptions.transport.finish;
      window.restoreFinish = () => (ownerOptions.transport.finish = finish);
      ownerOptions.transport.finish = async (input) => ({
        ...(await finish(input)),
        stage: 'recovery-ceremony',
      });
    });
    await assert.rejects(
      page.evaluate(() => run('resume')),
      /Unexpected finalization result/,
    );
    await page.evaluate(() => restoreFinish());
    assert.equal(await page.evaluate(() => window.assertions ?? 0), 0);
    await assert.rejects(
      page.evaluate(() =>
        RecoveryOwner.withRecoveryOwner(
          { ...ownerOptions, context: { ...ownerOptions.context, workspaceId: 'wrong' } },
          (owner) => owner.status(),
        ),
      ),
      /target changed/,
    );
  },
);
