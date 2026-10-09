import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createPublicKey, verify } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { build } from 'vite';
const compiled = await build({
  configFile: false,
  logLevel: 'error',
  build: {
    write: false,
    minify: false,
    lib: { entry: resolve('test/account-recovery/seed-entry.ts'), name: 'Seed', formats: ['iife'] },
  },
});
const script = (Array.isArray(compiled) ? compiled[0] : compiled).output.find(
  (o) => o.type === 'chunk',
).code;
test(
  'native recovery custody resumes the same candidate and exact progress after death during lock setup',
  { timeout: 40000 },
  async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'done-recovery-seed-'));
    const server = createServer((_q, r) =>
      r
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end('<!doctype html><title>Disposable recovery custody</title>'),
    );
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    let browser;
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
    browser = await launch();
    let page = await browser.newPage();
    await page.goto(origin);
    await page.addScriptTag({ content: script });
    const saved = await page.evaluate(() => Seed.prepare());
    // Hold after the seed/claim and reservation are durable, before credential installation.
    await page.evaluate((code) => {
      void Seed.confirm(code, true).catch(() => {});
    }, saved.code);
    await page.waitForFunction(() => window.seedBoundary === true);
    await browser.close();
    browser = await launch();
    page = await browser.newPage();
    await page.goto(origin);
    await page.addScriptTag({ content: script });
    await assert.rejects(page.evaluate(() => Seed.reopen('wrong')));
    const reopened = await page.evaluate((code) => Seed.reopen(code), saved.code);
    assert.deepEqual([reopened.participant.wPub, reopened.participant.sPub], saved.publicKeys);
    assert.deepEqual(reopened.progress, {
      v: 1,
      kind: 'retained-recovery-probe',
      exactRequest: 'resume these exact bytes',
    });
    assert.equal(reopened.startup.kind, 'unlock-required');
    assert(
      verify(
        null,
        Buffer.from('retained recovery key'),
        createPublicKey({
          format: 'der',
          type: 'spki',
          key: Buffer.from('302a300506032b6570032100' + saved.publicKeys[1], 'hex'),
        }),
        Buffer.from(reopened.participant.signature, 'hex'),
      ),
    );
    await browser.close();
    browser = await launch();
    page = await browser.newPage();
    await page.goto(origin);
    await page.addScriptTag({ content: script });
    const again = await page.evaluate((code) => Seed.reopen(code), saved.code);
    assert.deepEqual(again, reopened);
  },
);
