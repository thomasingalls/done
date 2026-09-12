import assert from 'node:assert/strict';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { captureDiagnostic, collectBrowser } from './browser-collector.mjs';
import { collectValues } from './node-collector.mjs';
import { collectFiles } from './files.mjs';
import { assess, hash, LIMITS } from './matcher.mjs';

export const extendedLimits = { ...LIMITS, containers: true };
const required = [
  'indexedDB',
  'localStorage',
  'sessionStorage',
  'cacheStorage',
  'opfs',
  'cookies',
  'diagnostics',
];
export const output =
  process.env.ACCOUNT_REPORT_DIR ??
  resolve('test-results/privacy-extended', new Date().toISOString().replaceAll(':', '-'));
export const report = (name, value) => {
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, name + '.json'), JSON.stringify(value, null, 2) + '\n');
};
const lib = async (entry, name) => {
  const result = await build({
    configFile: false,
    publicDir: false,
    logLevel: 'error',
    plugins: [react()],
    define: { 'process.env.NODE_ENV': '"production"' },
    build: { write: false, minify: false, lib: { entry: resolve(entry), name, formats: ['iife'] } },
  });
  return (Array.isArray(result) ? result[0] : result).output.find((o) => o.type === 'chunk').code;
};
export async function packagedFixture(t, name) {
  const dir = mkdtempSync(join(tmpdir(), 'done-packaged-residue-'));
  let context, server;
  t.after(async () => {
    await context?.close();
    await new Promise((r) => (server ? server.close(r) : r()));
    rmSync(dir, { recursive: true, force: true });
  });
  // All product and test assets precede secret generation.
  await build({ logLevel: 'error', build: { outDir: join(dir, 'app'), emptyOutDir: true } });
  const utility = await lib('test/account-residue/private-ui.tsx', 'PrivateUi');
  const control = await lib('test/account-residue/extended-browser.ts', 'Control');
  const cleanup = await lib('private/cleanup.ts', 'Cleanup');
  server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    res.setHeader('Cache-Control', 'no-store');
    if (
      pathname === '/control.html' ||
      pathname === '/private.html' ||
      pathname === '/private/migration.html'
    ) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(
        '<!doctype html><div id="root"></div>' +
          (pathname !== '/control.html' ? '<script src="/private.js"></script>' : ''),
      );
      return;
    }
    if (pathname === '/private.js') {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.end(utility);
      return;
    }
    const path = join(dir, 'app', pathname === '/' ? 'index.html' : pathname);
    try {
      res.setHeader(
        'Content-Type',
        {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.webmanifest': 'application/manifest+json',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
        }[extname(path)] ?? 'application/octet-stream',
      );
      res.end(readFileSync(path));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port,
    profile = join(dir, 'profile');
  const launch = () =>
    chromium.launchPersistentContext(profile, {
      headless: true,
      viewport: { width: 1280, height: 900 },
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    });
  const diagnostics = [],
    pending = new Set(),
    errors = [],
    workers = [];
  t.after(async () => {
    await Promise.all([...pending]);
    report(name + '-diagnostics', { diagnostics, errors, workers });
  });
  const attach = (c) => {
    // Context-wide console events include service worker messages, attached before any navigation.
    c.on('console', (message) => {
      const p = Promise.all(message.args().map((arg) => arg.evaluate(captureDiagnostic)))
        .then(
          (values) => diagnostics.push({ type: message.type(), text: message.text(), values }),
          () => errors.push('unreadable-console-argument'),
        )
        .finally(() => pending.delete(p));
      pending.add(p);
    });
    c.on('page', (page) => page.on('pageerror', (e) => diagnostics.push({ error: e.message })));
    c.on('serviceworker', (worker) => workers.push(worker.url()));
  };
  context = await launch();
  context.setDefaultTimeout(10000);
  attach(context);
  const f = {
    name,
    origin,
    profile,
    control,
    cleanup,
    get context() {
      return context;
    },
    async diagnostics() {
      await Promise.all([...pending]);
      return structuredClone(diagnostics);
    },
    async scan(page, needles, point, allow = () => false) {
      await Promise.all([...pending]);
      const once = async () => [
        ...(await page.evaluate(collectBrowser, { limits: extendedLimits })),
        collectValues('cookies', await context.cookies()),
        collectValues('diagnostics', diagnostics),
      ];
      const first = await once(),
        second = await once();
      const stable = JSON.stringify(first) === JSON.stringify(second);
      const result = assess([...first, ...second], needles, required, allow, extendedLimits);
      if (!stable || errors.length) {
        result.issues.push({ reason: !stable ? 'acquisition-changed' : 'diagnostics-incomplete' });
        if (!result.matches.length) result.verdict = 'incomplete';
      }
      report(name + '-' + point + '-raw', { first, second, needles, errors, workers });
      report(name + '-' + point, result);
      assert.equal(
        result.verdict,
        'complete-no-prohibited-match',
        JSON.stringify({
          point,
          matches: result.matches.slice(0, 5),
          issues: result.issues.slice(0, 5),
        }),
      );
      return result;
    },
    async files(needles, point) {
      await context.close();
      context = null;
      const collection = collectFiles(profile, 'profile');
      const result = assess([collection], needles, ['profile'], () => false, extendedLimits);
      report(name + '-' + point + '-raw', { collection, needles });
      report(name + '-' + point, result);
      return result;
    },
    async reopen() {
      context = await launch();
      attach(context);
      return context.newPage();
    },
    async blank() {
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.setBypassServiceWorker', { bypass: true });
      await page.goto(origin + '/control.html');
      await page.evaluate(control);
      return page;
    },
    async download(page, button, artifact) {
      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name: button, exact: true }).click();
      const path = join(dir, artifact);
      await (await pending).saveAs(path);
      return path;
    },
    async cleanupUi(page) {
      await (
        await context.newCDPSession(page)
      ).send('Network.setBypassServiceWorker', { bypass: true });
      await page.evaluate(() => {
        const iframe = document.createElement('iframe');
        iframe.id = 'residue-cleanup';
        iframe.src = '/control.html';
        document.body.append(iframe);
      });
      await expect(page.locator('#residue-cleanup')).toBeVisible();
      await expect
        .poll(() => page.frames().some((frame) => frame.url().endsWith('/control.html')))
        .toBe(true);
      const frame = page.frames().find((frame) => frame.url().endsWith('/control.html'));
      assert(frame);
      await frame.evaluate(cleanup);
      return page.locator('#done-private-cleanup');
    },
  };
  report(name + '-assets', {
    browser: context.browser()?.version(),
    control: hash(control),
    utility: hash(utility),
    cleanup: hash(cleanup),
    app: collectFiles(join(dir, 'app'))
      .entries.filter((e) => e.type === 'file')
      .map((e) => ({ path: e.location, sha256: hash(Buffer.from(e.raw, 'base64')) })),
  });
  return f;
}
