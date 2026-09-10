import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { request } from 'node:http';
import { chromium } from '@playwright/test';
import { createPrivateAccountServer } from '../../account-service/private-server.ts';
import { fresh, finishRequest } from './fixtures.mjs';

test(
  'native discoverable passkey registration/confirmation, restart/login and browser cancellation',
  { timeout: 30000 },
  async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'done-account-native-')),
      path = join(dir, 'service.sqlite'),
      token = fresh();
    let server = await createPrivateAccountServer({ path, token });
    t.after(async () => {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    });
    const browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    });
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.goto(server.origin);
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
    const call = (method, input) =>
      page.evaluate(
        async ({ method, input, token }) => {
          const response = await fetch(`/account/${method}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(input),
          });
          return response.json();
        },
        { method, input, token },
      );
    const create = (view) =>
      page.evaluate(async (options) => {
        const credential = await navigator.credentials.create({
          publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(options),
        });
        return credential.toJSON();
      }, view.options);
    const get = (view) =>
      page.evaluate(async (options) => {
        const credential = await navigator.credentials.get({
          publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options),
        });
        return credential.toJSON();
      }, view.options);
    const retryKey = fresh(),
      view = await call('begin', { operation: 'register', retryKey });
    const response = await create(view),
      next = await call('finish', finishRequest(view, retryKey, response));
    assert.equal(next.operation, 'confirm-registration');
    const proof = finishRequest(next, retryKey, await get(next));
    const result = await call('finish', proof);
    assert.equal(result.stage, 'credential-confirmed');
    const credentials = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
    assert.equal(credentials.credentials.length, 1);
    assert.equal(credentials.credentials[0].isResidentCredential, true);
    const port = Number(new URL(server.origin).port);
    await server.close();
    server = await createPrivateAccountServer({ path, token, port });
    assert.deepEqual(await call('finish', proof), result);
    const r2 = fresh(),
      login = await call('begin', { operation: 'authenticate', retryKey: r2 });
    const loginProof = finishRequest(login, r2, await get(login));
    assert.equal((await call('finish', loginProof)).refusal, 'account-not-active');
    // Pre-seed activation solely to exercise assertions; there is no service activation endpoint.
    const db = new DatabaseSync(path);
    db.prepare("UPDATE accounts SET state='active' WHERE id=?").run(result.accountId);
    db.close();
    assert.equal((await call('finish', loginProof)).stage, 'account-proof');
    await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled: false });
    const r3 = fresh(),
      cancelled = await call('begin', { operation: 'authenticate', retryKey: r3 });
    const errorName = await page.evaluate(async (options) => {
      try {
        await navigator.credentials.get({
          publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options),
          signal: AbortSignal.timeout(150),
        });
        return 'unexpected-success';
      } catch (error) {
        return error.name;
      }
    }, cancelled.options);
    assert.equal(errorName, 'TimeoutError');
    assert.equal((await call('cancel', { retryKey: r3 })).stage, 'cancelled');
    assert.equal((await call('resume', { retryKey: r3 })).refusal, 'cancelled');
  },
);

test(
  'private adapter refuses missing token, hostile origin/host and oversized input',
  { timeout: 10000 },
  async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'done-account-http-')),
      token = fresh();
    const server = await createPrivateAccountServer({ path: join(dir, 'account.sqlite'), token });
    t.after(async () => {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    });
    const headers = {
      'Content-Type': 'application/json',
      Origin: server.origin,
      Authorization: `Bearer ${token}`,
    };
    const post = (extra) =>
      fetch(`${server.origin}/account/begin`, {
        method: 'POST',
        headers: { ...headers, ...extra },
        body: JSON.stringify({ operation: 'register', retryKey: fresh() }),
      });
    assert.equal((await post({ Authorization: '' })).status, 403);
    assert.equal((await post({ Origin: 'https://evil.invalid' })).status, 403);
    // fetch rewrites Host; use the HTTP transport to actually send a hostile authority.
    const hostileHost = await new Promise((resolve, reject) => {
      const req = request(
        `${server.origin}/account/begin`,
        {
          method: 'POST',
          headers: { ...headers, Host: 'evil.invalid' },
        },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      req.on('error', reject);
      req.end('{}');
    });
    assert.equal(hostileHost, 403);
    assert.equal(
      (
        await fetch(`${server.origin}/account/begin`, {
          method: 'POST',
          headers,
          body: ' '.repeat(131073),
        })
      ).status,
      413,
    );
    assert.equal((await post({})).status, 200);
  },
);
