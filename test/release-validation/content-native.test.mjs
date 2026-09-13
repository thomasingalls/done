import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:net';
import { installedChromium } from '../../scripts/release-validation/browser.mjs';
import { createStageRunner } from '../../scripts/release-validation/stage.mjs';
import { boundedStage } from '../../scripts/release-validation/manifest.mjs';
import { digest, filePins } from '../../scripts/release-validation/identity.mjs';
import { groupState } from '../../scripts/release-validation/process-group.mjs';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const runtime = installedChromium();
const playwright = import.meta.resolve('@playwright/test');
const vite = import.meta.resolve('vite');
function fixture(t, mode, extra = {}) {
  const base = mkdtempSync(join(tmpdir(), 'done-content-owner-control-'));
  const root = join(base, 'checkout'),
    output = join(base, 'reports'),
    marker = join(base, 'ready.json');
  mkdirSync(join(root, 'scripts/release-validation'), { recursive: true });
  copyFileSync(
    'scripts/release-validation/process-guard.mjs',
    join(root, 'scripts/release-validation/process-guard.mjs'),
  );
  copyFileSync('scripts/release-validation/server.mjs', join(root, 'listen.mjs'));
  writeFileSync(join(root, 'index.html'), '<title>Owned fixture</title>');
  // Equal package bytes in two installations still create different browser class identities.
  for (const ancestor of [root, base]) {
    const packageRoot = join(ancestor, 'node_modules/owner-selection');
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(
      join(packageRoot, 'package.json'),
      JSON.stringify({ name: 'owner-selection', type: 'module', exports: './index.js' }),
    );
    writeFileSync(join(packageRoot, 'index.js'), 'export class Selection {}');
  }
  writeFileSync(join(root, 'fixture.js'), 'export { Selection } from "owner-selection";');
  writeFileSync(
    join(root, 'subject.mjs'),
    `
    import { chromium } from ${JSON.stringify(playwright)};
    import { createServer } from ${JSON.stringify(vite)};
    import { createServer as createHttpServer } from 'node:http';
    import { listenEphemeralVite } from './listen.mjs';
    import { mkdirSync, writeFileSync } from 'node:fs';
    const blocker = createHttpServer();
    await new Promise(r => blocker.listen(0, '127.0.0.1', r));
    const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: process.env.TMPDIR + '/vite', logLevel: 'error', optimizeDeps: { noDiscovery: true },
      server: { host: '127.0.0.1', port: blocker.address().port, strictPort: true, hmr: false } });
    const origin = await listenEphemeralVite(server);
    if (server.httpServer.address().port === blocker.address().port) throw Error('Configured port reused');
    if (process.env.MODE === 'module-identity') {
      const overlay = process.env.RELEASE_EDITOR_ADMISSION_OUTPUT;
      mkdirSync(overlay, { recursive: true });
      writeFileSync(overlay + '/selection.js', 'export { Selection } from "owner-selection";');
      writeFileSync('identity.html', '<title>Owned fixture</title><script type="module">import {Selection as A} from "/fixture.js"; import {Selection as B} from "/@fs/' + overlay + '/selection.js"; window.sameSelection = A === B;</script>');
    }
    const browser = await chromium.connectOverCDP(process.env.RELEASE_BROWSER_ENDPOINT);
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(origin + (process.env.MODE === 'module-identity' ? '/identity.html' : '/'));
    if (await page.title() !== 'Owned fixture') throw Error('Fixture not reached');
    writeFileSync(process.env.OWNER_MARKER, JSON.stringify({worker: process.pid, port: server.httpServer.address().port, blocker: blocker.address().port, endpoint: process.env.RELEASE_BROWSER_ENDPOINT}));
    if (process.env.MODE === 'module-identity') {
      await page.waitForFunction(() => typeof window.sameSelection === 'boolean');
      const sameSelection = await page.evaluate(() => window.sameSelection);
      console.log(JSON.stringify({moduleIdentity: sameSelection}));
      if (!sameSelection) throw Error('Overlay and fixture loaded separate dependency instances');
    }
    if (['normal', 'module-identity'].includes(process.env.MODE)) {
      await context.close(); await browser.close(); await server.close(); await new Promise(r => blocker.close(r));
    } else if (process.env.MODE === 'death') process.exit(9);
    else { process.on('SIGTERM', () => {}); setInterval(() => {}, 100); }
  `,
  );
  const stage = boundedStage(
    'native-' + mode,
    ['node', 'subject.mjs'],
    { kind: 'exit', exitCodes: [0] },
    {
      fixture: { kind: 'chromium-cdp', startupMs: 15000 },
      deadlineMs: 15000,
      graceMs: 500,
      maxLogBytes: 65536,
      env: { MODE: mode, OWNER_MARKER: marker },
      ...extra,
    },
  );
  const fingerprint = () => ({
    revision: 'native-control',
    sourceDigest: digest(
      filePins(root, [
        'subject.mjs',
        'listen.mjs',
        'index.html',
        'scripts/release-validation/process-guard.mjs',
      ]),
    ),
    dependencyDigest: 'fixture-only',
    runtime: { node: process.version },
    tools: { chromium: digest(runtime.snapshot) },
  });
  const run = createStageRunner({ root, output, fingerprint, browserRuntime: runtime });
  let drained = false;
  t.after(() => {
    if (drained) rmSync(base, { recursive: true, force: true });
    else t.diagnostic('Retained owner control: ' + base);
  });
  return {
    stage,
    run,
    marker,
    output,
    markDrained: () => {
      drained = true;
    },
  };
}
async function ready(f) {
  const until = Date.now() + 18000;
  while (!existsSync(f.marker) && Date.now() < until) await delay(20);
  assert(existsSync(f.marker), 'Native fixture did not become ready');
  return JSON.parse(readFileSync(f.marker));
}
async function assertPortClosed(port) {
  const refused = await new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port: Number(port) });
    socket.setTimeout(500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', (e) => {
      socket.destroy();
      resolve(e.code === 'ECONNREFUSED');
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
  assert(refused, 'Owned listener still reachable or closure unproved');
}
function profileProcesses(profile) {
  // Inspect process metadata only and retain only this disposable profile's matches.
  return execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,args='], {
    encoding: 'utf8',
    timeout: 5000,
  })
    .split('\n')
    .filter((line) => line.includes(profile));
}
async function drained(f, receipt, marker) {
  assert.equal(receipt.result.groupDrained, true, receipt.result.reason);
  assert.equal(receipt.result.browser.groupDrained, true);
  assert.equal(groupState(receipt.result.browser.pid), 'gone');
  assert.deepEqual(
    profileProcesses(receipt.result.browser.profile),
    [],
    'Escaped disposable browser process',
  );
  if (marker) {
    assert.equal(groupState(marker.worker), 'gone');
    await assertPortClosed(marker.port);
    await assertPortClosed(marker.blocker);
    await assertPortClosed(new URL(marker.endpoint).port);
  }
  f.markDrained();
  tEvidence(receipt);
}
function tEvidence(receipt) {
  console.log(
    JSON.stringify({
      nativeControl: receipt.stageId,
      status: receipt.status,
      reason: receipt.result.reason,
      elapsedMs: receipt.result.elapsedMs,
      workerAndBrowserDrained: receipt.result.groupDrained,
      browser: receipt.result.browser,
    }),
  );
}

test('owned Chromium and server complete through CDP and leave no profile processes or listeners', async (t) => {
  const f = fixture(t, 'normal');
  const receipt = await f.run(f.stage);
  assert.equal(receipt.status, 'passed', receipt.result.reason);
  await drained(f, receipt, await ready(f));
});

test('worker deadline drains a live browser and TERM-resistant server within the declared bound', async (t) => {
  const f = fixture(t, 'timeout', { deadlineMs: 3000 });
  const receipt = await f.run(f.stage);
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.result.reason, 'timeout');
  assert(receipt.result.elapsedMs < 15000 + 3000 + 4 * 500 + 1000);
  await drained(f, receipt, await ready(f));
});

test('cancellation after a real page loads drains both owned process groups', async (t) => {
  const f = fixture(t, 'cancel'),
    controller = new AbortController();
  const pending = f.run(f.stage, { signal: controller.signal });
  const marker = await ready(f);
  controller.abort();
  const receipt = await pending;
  assert.equal(receipt.result.reason, 'cancelled');
  await drained(f, receipt, marker);
});

test('worker death cannot leave its browser or server running or claim a passing receipt', async (t) => {
  const f = fixture(t, 'death');
  const receipt = await f.run(f.stage);
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.result.code, 9);
  await drained(f, receipt, await ready(f));
});

test('unexpected browser death stops and drains the waiting worker', async (t) => {
  const f = fixture(t, 'browser-death'),
    pending = f.run(f.stage);
  const marker = await ready(f);
  // The port file is in the owner-created profile; obtain the owner PID from its process metadata.
  const match = execFileSync('/bin/ps', ['-axo', 'pid=,args='], { encoding: 'utf8', timeout: 5000 })
    .split('\n')
    .find(
      (line) =>
        line.includes('--user-data-dir=' + f.output) && line.includes('--remote-debugging-port=0'),
    );
  assert(match, 'Owned browser PID unavailable');
  process.kill(Number(match.trim().split(/\s+/)[0]), 'SIGKILL');
  const receipt = await pending;
  assert.equal(receipt.status, 'failed');
  assert.match(receipt.result.reason, /Owned browser exited/);
  await drained(f, receipt, marker);
});

test('browser startup deadline still drains its group before returning failure', async (t) => {
  const f = fixture(t, 'startup-timeout', { fixture: { kind: 'chromium-cdp', startupMs: 1 } });
  const receipt = await f.run(f.stage);
  assert.equal(receipt.status, 'failed');
  assert.match(receipt.result.reason, /Browser startup deadline/);
  assert.equal(receipt.result.code, null);
  assert(!existsSync(f.marker));
  await drained(f, receipt);
});

test('source overlays and fixture imports share one dependency instance inside the checkout', async (t) => {
  const f = fixture(t, 'module-identity');
  const receipt = await f.run(f.stage);
  t.diagnostic(readFileSync(join(f.output, receipt.key, 'output.log'), 'utf8'));
  const compared = readFileSync(join(f.output, receipt.key, 'output.log'), 'utf8').includes(
    'moduleIdentity',
  );
  await drained(f, receipt, await ready(f));
  assert(compared, 'Module comparison must actually execute');
  assert.equal(receipt.status, 'passed', receipt.result.reason);
});
