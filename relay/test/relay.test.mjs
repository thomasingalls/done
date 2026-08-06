/**
 * The relay, end to end.
 *
 * Not a unit test of the pipe: the pipe is upstream's. This runs the real
 * process the way the Dockerfile runs it, connects the real client provider the
 * app connects with, and asserts the four things the app depends on and that
 * only an integration test can see —
 *
 *   1. two devices converge through it,
 *   2. a device that was offline while another wrote catches up on connect,
 *   3. a wrong token is refused with a code the client can read, and
 *   4. state survives a restart of the relay.
 *
 * The app's own suite has no business starting servers, so this lives with the
 * thing it tests and runs on `pnpm --dir relay test`.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const TOKEN = 'a-shared-secret';
const ROOM = 'done';

let port = 0;
let dataDirectory = '';
let relay = null;

const endpoint = () => `ws://127.0.0.1:${port}`;

const startRelay = () =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['dist/server.js'], {
      cwd: new URL('..', import.meta.url).pathname,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(port),
        RELAY_TOKEN: TOKEN,
        RELAY_ROOMS: ROOM,
        RELAY_DATA_DIR: dataDirectory,
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    });

    const timer = setTimeout(() => reject(new Error('relay did not start')), 10_000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (!chunk.includes('listening')) return;
      clearTimeout(timer);
      resolve(child);
    });
    child.once('error', reject);
  });

const stopRelay = (child) =>
  new Promise((resolve) => {
    if (!child || child.exitCode !== null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
  });

/** A client, shaped like the app's: one doc, one provider, one token. */
const connect = (doc, token = TOKEN) =>
  new WebsocketProvider(endpoint(), ROOM, doc, {
    WebSocketPolyfill: WebSocket,
    params: { token },
    disableBc: true,
    maxBackoffTime: 250,
  });

const until = async (predicate, message, timeout = 5_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(message);
};

describe('the relay', () => {
  before(async () => {
    // A free port, taken by binding one and letting it go — a fixed port makes
    // this test fail for whoever is already running the relay locally.
    const net = await import('node:net');
    port = await new Promise((resolve) => {
      const probe = net.createServer();
      probe.listen(0, '127.0.0.1', () => {
        const { port: chosen } = probe.address();
        probe.close(() => resolve(chosen));
      });
    });
    dataDirectory = mkdtempSync(join(tmpdir(), 'done-relay-'));
    relay = await startRelay();
  });

  after(async () => {
    await stopRelay(relay);
    rmSync(dataDirectory, { recursive: true, force: true });
  });

  it('carries changes between two devices', async () => {
    const phone = new Y.Doc();
    const laptop = new Y.Doc();
    const a = connect(phone);
    const b = connect(laptop);

    await until(() => a.synced && b.synced, 'neither client synced');

    phone.getText('master').insert(0, 'call the dentist\n');
    await until(
      () => laptop.getText('master').toString().includes('call the dentist'),
      'the laptop never saw the phone',
    );

    laptop.getText('master').insert(0, 'draft the migration plan\n');
    await until(
      () => phone.getText('master').toString().includes('draft the migration plan'),
      'the phone never saw the laptop',
    );

    // The conflict the whole architecture exists for: both sides kept.
    assert.equal(phone.getText('master').toString(), laptop.getText('master').toString());

    a.destroy();
    b.destroy();
    phone.destroy();
    laptop.destroy();
  });

  it('holds what one device wrote until the other connects', async () => {
    const phone = new Y.Doc();
    const a = connect(phone);
    await until(() => a.synced, 'the phone never synced');
    phone.getText('master').insert(0, 'wrote this while the laptop was shut\n');
    await new Promise((resolve) => setTimeout(resolve, 250));
    a.destroy();
    phone.destroy();

    const laptop = new Y.Doc();
    const b = connect(laptop);
    await until(
      () => laptop.getText('master').toString().includes('while the laptop was shut'),
      'the relay did not hold the change',
    );

    b.destroy();
    laptop.destroy();
  });

  it('refuses a wrong token with a code the client can read', async () => {
    const doc = new Y.Doc();
    const provider = connect(doc, 'not-the-token');

    let code = 0;
    provider.on('connection-close', (event) => {
      code = event?.code ?? 0;
    });

    await until(() => code !== 0, 'the relay never closed the connection');
    assert.equal(code, 4401);
    assert.equal(provider.synced, false);

    provider.destroy();
    doc.destroy();
  });

  it('refuses a room it does not serve', async () => {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(endpoint(), 'somebody-elses-room', doc, {
      WebSocketPolyfill: WebSocket,
      params: { token: TOKEN },
      disableBc: true,
      maxBackoffTime: 250,
    });

    let code = 0;
    provider.on('connection-close', (event) => {
      code = event?.code ?? 0;
    });

    await until(() => code !== 0, 'the relay never closed the connection');
    assert.equal(code, 4404);

    provider.destroy();
    doc.destroy();
  });

  it('keeps the document across a restart', async () => {
    const phone = new Y.Doc();
    const a = connect(phone);
    await until(() => a.synced, 'the phone never synced');
    phone.getText('master').insert(0, 'survives a deploy\n');
    await new Promise((resolve) => setTimeout(resolve, 250));
    a.destroy();
    phone.destroy();

    await stopRelay(relay);
    relay = await startRelay();

    const laptop = new Y.Doc();
    const b = connect(laptop);
    await until(
      () => laptop.getText('master').toString().includes('survives a deploy'),
      'the restarted relay had forgotten the document',
    );

    b.destroy();
    laptop.destroy();
  });

  it('answers a health check and serves nothing else', async () => {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.text()).trim(), 'ok');

    const anything = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(anything.status, 404);
  });
});
