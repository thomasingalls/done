import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { build } from 'vite';
import { sourceFixture } from './source-fixtures.mjs';
const built = await build({
  configFile: false,
  logLevel: 'error',
  build: {
    write: false,
    minify: false,
    lib: {
      entry: resolve('test/account-recovery/coordinator-entry.ts'),
      name: 'RecoveryFlow',
      formats: ['iife'],
    },
  },
});
const script = (Array.isArray(built) ? built[0] : built).output.find(
  (o) => o.type === 'chunk',
).code;
for (const loseReply of [false, true])
  test(
    `native recovery coordinator ${loseReply ? 'resolves a lost commit reply after browser death' : 'uses one passkey ceremony for the first editor opening'}`,
    { timeout: 60000 },
    async (t) => {
      const x = await sourceFixture(t, { now: Date.now }),
        config = { pin: x.authority.pin, networkSessions: true, membershipContinuation: true };
      const dir = mkdtempSync(join(tmpdir(), 'done-recovery-flow-'));
      const server = createServer((q, r) => {
        if (q.url === '/account/session/v1/acknowledge') {
          let text = '';
          q.on('data', (chunk) => (text += chunk));
          q.on('end', () =>
            r
              .writeHead(200, { 'Content-Type': 'application/json' })
              .end(JSON.stringify(x.f.core.sessions.acknowledge(JSON.parse(text)))),
          );
        } else
          r.writeHead(200, { 'Content-Type': 'text/html' }).end(
            '<!doctype html><title>Disposable recovery flow</title>',
          );
      });
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(4999, '127.0.0.1', resolve);
      });
      let browser,
        assertions = 0,
        lost = false,
        requests = [];
      t.after(async () => {
        await browser?.close();
        await new Promise((resolve) => {
          server.close(resolve);
          server.closeAllConnections();
        });
        rmSync(dir, { recursive: true, force: true });
      });
      const launch = () =>
        chromium.launchPersistentContext(dir, {
          headless: true,
          ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
        });
      const pageFor = async () => {
        const page = await browser.newPage();
        await page.goto(x.authority.pin.origin);
        await page.addScriptTag({ content: script });
        await page.exposeFunction('recoveryAssertion', (challenge) => {
          assertions++;
          return x.account.key.assert({ options: { challenge } });
        });
        await page.exposeFunction('recoveryRequest', async (op, body) => {
          if (op === 'commit') {
            requests.push(JSON.stringify(body));
            const response = await x.authority.owner.commitRecovery(x.f.core, body);
            if (loseReply && !lost && response.ok) {
              lost = true;
              throw Error('Simulated lost commit reply');
            }
            return response;
          }
          return op === 'read'
            ? x.authority.owner.readRecovery(x.f.core, body)
            : x.authority.owner.lostDeviceRecovery(x.f.core, op, body);
        });
        return page;
      };
      browser = await launch();
      let page = await pageFor();
      const beginning = await page.evaluate((config) => RecoveryFlow.begin(config), config);
      assert.equal(assertions, 1);
      await assert.rejects(page.evaluate(() => RecoveryFlow.prepare('wrong recovery code')));
      const code = await page.evaluate((code) => RecoveryFlow.prepare(code), x.recovery.code);
      assert.equal(
        await page.evaluate((code) => RecoveryFlow.confirm(code), code),
        beginning.slotId,
      );
      const args = { config, slotId: beginning.slotId, code };
      const hints = await page.evaluate((config) => RecoveryFlow.hints(config), config);
      assert.equal(hints.length, 1);
      assert.equal(hints[0].slotId, beginning.slotId);
      assert.equal(x.f.rows('recovery_successors').length, 0); // Saving the code is not the confirmation.
      if (loseReply) {
        await assert.rejects(
          page.evaluate(
            ({ config, slotId, code }) => RecoveryFlow.finish(config, slotId, code),
            args,
          ),
          /lost commit reply/,
        );
        assert.equal(x.f.rows('recovery_successors').length, 1);
        await browser.close();
        browser = await launch();
        page = await pageFor();
        x.f.restart();
        x.authority.restart();
        const resumed = await page.evaluate(
          ({ config, slotId, code }) => RecoveryFlow.resume(config, slotId, code),
          args,
        );
        assert.equal(resumed.stage, 'prepared');
      }
      await page.evaluate(
        ({ config, slotId, code }) => RecoveryFlow.finish(config, slotId, code),
        args,
      );
      assert.equal(x.f.rows('recovery_successors').length, 1);
      if (loseReply) {
        assert.equal(requests.length, 2);
        assert.equal(requests[0], requests[1]);
      }
      const opened = await page.evaluate(
        ({ config, slotId, code }) => RecoveryFlow.open(config, slotId, code),
        args,
      );
      assert.equal(opened.text, 'before loss\n');
      assert.equal(assertions, loseReply ? 2 : 1);
      await page.evaluate(() => RecoveryFlow.close());
      await browser.close();
      browser = await launch();
      page = await pageFor();
      assert.equal(
        (
          await page.evaluate(
            ({ config, slotId, code }) => RecoveryFlow.resume(config, slotId, code),
            args,
          )
        ).stage,
        'installed',
      );
      assert.equal(
        (
          await page.evaluate(
            ({ config, slotId, code }) => RecoveryFlow.open(config, slotId, code),
            args,
          )
        ).text,
        'before loss\n',
      );
      assert.equal(assertions, loseReply ? 3 : 2);
      await page.evaluate(() => RecoveryFlow.close());
    },
  );
