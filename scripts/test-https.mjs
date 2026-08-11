/**
 * The boundary the fast suites deliberately do not cross: a production build
 * in a real secure browser context, through Vite's WSS proxy, to the real
 * relay. Its certificate is ephemeral and trusted only by this browser run.
 */

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { X509Certificate, createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const token = 'https-integration-token';
const room = 'done';

const createTestCertificate = () => {
  const directory = mkdtempSync(join(tmpdir(), 'done-https-test-'));
  const certPath = join(directory, 'cert.pem');
  const keyPath = join(directory, 'key.pem');
  const result = spawnSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-sha256',
      '-days',
      '2',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1',
      '-keyout',
      keyPath,
      '-out',
      certPath,
    ],
    { encoding: 'utf8' },
  );
  if (result.error?.code === 'ENOENT') throw new Error('openssl is required for pnpm test:https');
  if (result.status !== 0) {
    rmSync(directory, { recursive: true, force: true });
    throw new Error(`could not create the HTTPS test certificate: ${result.stderr.trim()}`);
  }
  return { certPath, directory, keyPath };
};

const spkiFingerprint = (certificatePath) => {
  const certificate = new X509Certificate(readFileSync(certificatePath));
  const publicKey = certificate.publicKey.export({ format: 'der', type: 'spki' });
  return createHash('sha256').update(publicKey).digest('base64');
};

const within = (promise, label, timeout = 15_000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeout);
      timer.unref();
    }),
  ]);

const freePort = () =>
  new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        probe.close();
        reject(new Error('could not choose a test port'));
        return;
      }
      probe.close(() => resolvePort(address.port));
    });
  });

const startRelay = (port) =>
  new Promise((resolveRelay, reject) => {
    const child = spawn(process.execPath, ['dist/server.js'], {
      cwd: resolve(root, 'relay'),
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(port),
        RELAY_ALLOW_ANONYMOUS: '',
        RELAY_ROOMS: room,
        RELAY_TOKEN: token,
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('HTTPS test relay did not start'));
    }, 10_000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (!chunk.includes('listening')) return;
      clearTimeout(timer);
      resolveRelay(child);
    });
    child.once('error', (cause) => {
      clearTimeout(timer);
      reject(cause);
    });
    child.once('exit', (code) => {
      if (code === 0) return;
      clearTimeout(timer);
      reject(new Error(`HTTPS test relay exited with ${code}`));
    });
  });

const stopRelay = (child) =>
  new Promise((resolveStop) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      resolveStop();
      return;
    }
    child.once('exit', resolveStop);
    child.kill('SIGTERM');
  });

const openSocket = (page, url) =>
  page.evaluate(
    (address) =>
      new Promise((resolveSocket, reject) => {
        const socket = new WebSocket(address);
        const timer = window.setTimeout(() => {
          socket.close();
          reject(new Error('websocket did not open'));
        }, 5_000);
        socket.addEventListener('open', () => {
          window.clearTimeout(timer);
          socket.close();
          resolveSocket(true);
        });
        socket.addEventListener('error', () => {
          window.clearTimeout(timer);
          reject(new Error('websocket failed'));
        });
      }),
    url,
  );

const refusedCode = (page, url) =>
  page.evaluate(
    (address) =>
      new Promise((resolveCode, reject) => {
        const socket = new WebSocket(address);
        const timer = window.setTimeout(() => {
          socket.close();
          reject(new Error('relay did not refuse the websocket'));
        }, 5_000);
        socket.addEventListener('close', (event) => {
          window.clearTimeout(timer);
          resolveCode(event.code);
        });
      }),
    url,
  );

let relay;
let vite;
let browser;
let certificateDirectory;

try {
  console.log('HTTPS integration: creating an ephemeral certificate');
  const certificate = createTestCertificate();
  certificateDirectory = certificate.directory;

  const relayPort = await freePort();
  let appPort = await freePort();
  while (appPort === relayPort) appPort = await freePort();
  process.env['DEV_HTTPS'] = '1';
  process.env['DEV_HTTPS_CERT'] = certificate.certPath;
  process.env['DEV_HTTPS_KEY'] = certificate.keyPath;
  process.env['DEV_RELAY_PORT'] = String(relayPort);

  console.log('HTTPS integration: starting the relay and Vite preview');
  relay = await startRelay(relayPort);
  vite = await preview({
    configFile: resolve(root, 'vite.config.ts'),
    preview: { host: '127.0.0.1', port: appPort, strictPort: true },
  });

  browser = await chromium.launch({
    args: [`--ignore-certificate-errors-spki-list=${spkiFingerprint(certificate.certPath)}`],
    ...(process.env['CHROMIUM_PATH'] ? { executablePath: process.env['CHROMIUM_PATH'] } : {}),
  });
  // Chromium accepts only this ephemeral leaf's public key, which still permits
  // service workers; a blanket ignoreHTTPSErrors exception does not.
  const context = await browser.newContext();
  const page = await context.newPage();
  const origin = `https://127.0.0.1:${appPort}`;
  console.log('HTTPS integration: opening the secure browser context');
  await within(page.goto(origin), 'HTTPS navigation');

  assert.equal(await page.evaluate(() => window.isSecureContext), true);
  console.log('HTTPS integration: waiting for the production service worker');
  assert.equal(
    await within(
      page.evaluate(async () => (await navigator.serviceWorker.ready).scope),
      'service-worker registration',
    ),
    `${origin}/`,
  );
  assert.equal(await page.evaluate(async () => (await fetch('/relay/health')).text()), 'ok\n');

  console.log('HTTPS integration: exercising WSS upgrade and authorization');
  await openSocket(page, `wss://127.0.0.1:${appPort}/relay/${room}?token=${token}`);
  assert.equal(
    await refusedCode(page, `wss://127.0.0.1:${appPort}/relay/${room}?token=wrong`),
    4401,
  );

  // Reload once under the worker, then prove that the precached shell starts
  // while the browser is offline. The CRDT data itself remains in IndexedDB.
  console.log('HTTPS integration: reloading the precached shell offline');
  await within(page.reload(), 'service-worker-controlled reload');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
    timeout: 10_000,
  });
  await context.setOffline(true);
  await within(page.reload({ waitUntil: 'domcontentloaded' }), 'offline shell reload');
  assert.equal(await page.locator('#root').count(), 1);

  await context.close();
  console.log(
    'HTTPS integration: secure context, service worker, offline shell, and WSS proxy passed',
  );
} finally {
  await browser?.close();
  await vite?.close();
  await stopRelay(relay);
  if (certificateDirectory) rmSync(certificateDirectory, { recursive: true, force: true });
}
