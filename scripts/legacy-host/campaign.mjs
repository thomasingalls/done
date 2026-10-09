import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fc from 'fast-check';
import { readOptions } from '../legacy-cleanup/config.mjs';
import { Diagnostics, atomicJSON, requireOK } from '../legacy-cleanup/diagnostics.mjs';
import { checkHistories } from '../legacy-cleanup/properties.mjs';
import { arbitrary as sources } from '../legacy-export/arbitrary.mjs';
import { example, checkEntries } from '../legacy-export/oracle.mjs';
import { assets, predecessor, sha, walk } from './assets.mjs';
import { mutatedModule } from './mutations.mjs';
import { launchProfile, secondProcess } from './browser.mjs';
import { PreflightExclusion } from './exclusion.mjs';
import { eventually } from './cdp.mjs';
import { savePacket, readPacket, classifyCarriers, hasFirstWrite } from './recovery.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const { options, output, limits, runs, seed } = readOptions(process.argv.slice(2), root);
if (options.mutant) throw Error('Use --case controls for the named host controls');
const paths = [
  'src',
  'scripts/legacy-host',
  'test/legacy-host',
  'scripts/legacy-cleanup',
  'scripts/legacy-export',
  'test/legacy-export',
].flatMap((dir) => walk(join(root, dir)));
paths.push(join(root, 'package.json'), join(root, 'pnpm-lock.yaml'));
const hashes = () =>
  Object.fromEntries(paths.map((p) => [p.slice(root.length + 1), sha(readFileSync(p))]));
for (const path of paths.filter(
  (p) => p.includes('/legacy-host/') || p.endsWith('/package.json'),
)) {
  const target = join(output, 'tested', path.slice(root.length + 1));
  mkdirSync(resolve(target, '..'), { recursive: true });
  writeFileSync(target, readFileSync(path));
}
const report = {
  schema: 1,
  scope: 'disposable-persistent-profile-host-preflight',
  status: 'running',
  passed: false,
  started: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  files: hashes(),
  predecessor,
  checks: [],
  probes: [],
  controls: [],
  coverage: {},
  processRestarts: 0,
  hostDisposition: 'unmeasured',
  migrationAuthority: false,
  deadlines: limits,
  limits: [
    'Single pinned Chromium and predecessor build; no real profile access or supported deployed-version census.',
    'Read-only source capture/replay; no enrollment/import/selection/cleanup/default-app integration.',
    'Finite probes cannot certify universal exclusion. Unsupported is a valid measured result, distinct from harness failure.',
    'Installed-window UI and all platform/whole-profile residue acceptance remain outside this headless campaign.',
  ],
};
const diag = new Diagnostics(output, report, limits),
  live = new Set();
let server,
  serial = 0;
const count = (name) => {
  report.coverage[name] = (report.coverage[name] ?? 0) + 1;
};
const call = (browser, target, method, ...args) =>
  diag.watch(`fixture:${method}`, () =>
    browser.cdp.evaluate(
      target.sessionId,
      `window.hostFixture[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
    ),
  );
const evaluate = (browser, target, expression) =>
  diag.watch('fixture:script', () => browser.cdp.evaluate(target.sessionId, expression));
async function browserMetadata(browser) {
  if (report.browser) return;
  report.browser = await browser.cdp.send('Browser.getVersion');
  report.browser.launcherSha256 = sha(readFileSync(browser.executable));
  const url = new URL(browser.cdp.socket.url);
  url.protocol = 'http:';
  url.pathname = '/json/protocol';
  const response = await fetch(url, { signal: AbortSignal.timeout(limits['call-ms']) });
  if (!response.ok) throw Error('Browser protocol discovery failed');
  const bytes = new Uint8Array(await response.arrayBuffer());
  writeFileSync(join(output, 'browser-protocol.json'), bytes);
  report.browser.protocolSha256 = sha(bytes);
}
async function launch(name) {
  const browser = await diag.watch('launch-profile', () =>
    launchProfile(output, name, { timeout: limits['call-ms'] }),
  );
  live.add(browser);
  await browserMetadata(browser);
  const host = new PreflightExclusion(browser.cdp, (type, data) => diag.event(type, data));
  browser.host = host;
  browser.acquisition = await host.install();
  return browser;
}
async function stop(browser, force = false) {
  await diag.watch(
    force ? 'kill-browser' : 'close-browser',
    () => browser.stop(force),
    limits['teardown-ms'],
    true,
  );
  live.delete(browser);
}
async function fixture(browser, name = 'index', query = '') {
  const target = await browser.host.create();
  await browser.cdp.send('Network.enable', {}, target.sessionId);
  await browser.cdp.send('Network.setBypassServiceWorker', { bypass: true }, target.sessionId);
  await browser.host.admit(target);
  await browser.cdp.send(
    'Page.navigate',
    { url: `${server.url}/test/legacy-host/${name}.html${query}` },
    target.sessionId,
  );
  const global = {
    index: 'hostFixture',
    seed: 'seedFixture',
    writer: 'writerFixture',
    broadcast: 'broadcastFixture',
  }[name];
  try {
    await eventually(`fixture ${name} ready`, () =>
      browser.cdp.evaluate(target.sessionId, `Boolean(window.${global})`),
    );
  } catch (error) {
    diag.event(
      'fixture-load-failed',
      {
        name,
        state: await browser.cdp.evaluate(
          target.sessionId,
          `({path:location.pathname,ready:document.readyState,title:document.title,scripts:[...document.scripts].map(s=>new URL(s.src||location.href).pathname)})`,
        ),
        targets: [...browser.host.targets.values()].map((t) => ({
          type: t.type,
          waiting: t.waiting,
          detached: t.detached,
        })),
      },
      true,
    );
    throw error;
  }
  return target;
}
async function prepare(spec, tag = 'source') {
  const name = `${tag}-${++serial}`,
    browser = await launch(name),
    target = await fixture(browser, 'seed');
  await evaluate(browser, target, `window.seedFixture(${JSON.stringify(spec)})`);
  await browser.host.closeTarget(target);
  const reader = await fixture(browser);
  return { name, browser, reader };
}
const sample = () => ({ input: example(), disk: [0], wal: [1, 2] });
const same = (actual, expected, label = 'source-carriers-preserved') =>
  assert.equal(sha(JSON.stringify(actual)), sha(JSON.stringify(expected)), label);
const unchangedSource = (actual, expected) => {
  same(actual.databases, expected.databases);
  same(actual.local, expected.local);
  same(actual.caches, expected.caches);
  same(actual.registrations, expected.registrations);
};
const recordInventory = (id, inventory) => {
  report.inventories ??= [];
  report.inventories.push({
    id,
    sha256: sha(JSON.stringify(inventory)),
    databases: inventory.databases.length,
    localKeys: inventory.local.length,
    caches: inventory.caches.length,
    registrations: inventory.registrations.length,
  });
};
async function test(name, fn) {
  if (options.case && options.case !== name) return;
  report.phase = name;
  await diag.watch(`case:${name}`, fn, limits['case-ms']);
  report.checks.push(name);
  diag.event('case-passed', { name }, true);
}

/** The oracle is persisted carrier state, not waitingForDebugger or our event callback count. */
async function probe(kind, { recurse = true, pause = true } = {}) {
  const name = `probe-${++serial}`,
    browser = await launchProfile(output, name, { timeout: limits['call-ms'] });
  live.add(browser);
  await browserMetadata(browser);
  const host = new PreflightExclusion(browser.cdp, (type, data) => diag.event(type, data), {
    recurse,
    pause,
  });
  browser.host = host;
  await host.install();
  const reader = await fixture(browser),
    before = await call(browser, reader, 'inventory'),
    id = `${kind}-${serial}`;
  const probeUrl = `${server.url}/probe/page?id=${id}`,
    workerUrl = `${server.url}/probe/worker.js?id=${id}`;
  const oldTargets = new Set(host.targets.keys());
  if (kind === 'page') await host.create(probeUrl);
  else if (kind === 'frame')
    await evaluate(
      browser,
      reader,
      `{const frame=document.createElement('iframe');frame.src=${JSON.stringify(probeUrl)};document.body.append(frame);}`,
    );
  else if (kind === 'dedicated')
    await evaluate(browser, reader, `window.probeWorker=new Worker(${JSON.stringify(workerUrl)})`);
  else if (kind === 'shared')
    await evaluate(
      browser,
      reader,
      `window.probeWorker=new SharedWorker(${JSON.stringify(workerUrl)});window.probeWorker.port.start()`,
    );
  else if (kind === 'blob')
    await evaluate(
      browser,
      reader,
      `window.probeWorker=new Worker(URL.createObjectURL(new Blob([${JSON.stringify(`importScripts(${JSON.stringify(workerUrl)})`)}],{type:'text/javascript'})))`,
    );
  else if (kind === 'service-worker')
    await evaluate(
      browser,
      reader,
      `void navigator.serviceWorker.register(${JSON.stringify(workerUrl)},{scope:'/probe/'}).catch(()=>{})`,
    );
  else throw Error('Unknown probe');
  // A bounded observation window is reported as such, never upgraded to a universal no-execution proof.
  await new Promise((r) => setTimeout(r, 200));
  await host.drain();
  const during = await call(browser, reader, 'inventory');
  const wrote = hasFirstWrite(during, id);
  const targets = [...host.targets.values()].filter((t) => !oldTargets.has(t.id));
  const observation = {
    kind,
    recurse,
    pause,
    windowMs: 200,
    waiting: targets.map((t) => ({ type: t.type, waiting: t.waiting })),
    wroteBeforeRelease: wrote,
    outcome: wrote ? 'unsupported-first-write' : 'no-write-observed-in-window',
    beforeHash: sha(JSON.stringify(before)),
    duringHash: sha(JSON.stringify(during)),
  };
  report.probes.push(observation);
  if (wrote) {
    atomicJSON(join(output, `exclusion-counterexample-${kind}-${recurse}-${pause}.json`), {
      ...observation,
      browser: report.browser,
      predecessor,
      steps: [
        'install browser Target.setAutoAttach',
        'create target or child',
        'do not call Runtime.runIfWaitingForDebugger on new target',
        'read source-origin carrier from separate observer',
      ],
    });
    count('exclusion-counterexample');
  }
  for (const target of targets) if (!target.detached) await host.admit(target);
  const released = await eventually(
    'positive first-write control',
    () => call(browser, reader, 'inventory'),
    (state) =>
      state.local.some(([key]) => key === `preflight.sentinel.${id}`) ||
      state.databases.some(
        (db) =>
          db.name === 'preflight-worker-probe' &&
          db.stores.some((store) => store.rows.some(([key]) => key === id)),
      ),
  );
  count(`probe-${kind}`);
  await stop(browser);
  return { ...observation, evidence: { id, during, released } };
}

async function runHistory(spec) {
  let { name, browser, reader } = await prepare(spec.source, 'history');
  // Define the existing-on-disk fixture after clean browser shutdown, without a sleep-based flush claim.
  await stop(browser);
  browser = await launch(name);
  reader = await fixture(browser);
  report.processRestarts++;
  let original = await call(browser, reader, 'inventory'),
    edits = '';
  recordInventory(name, original);
  const captured = requireOK(await call(browser, reader, 'capture'));
  const file = join(output, `${name}.recovery.json`),
    binding = await savePacket(file, captured);
  captured.bytes.fill(0); // Actual subsequent reads must use the closed file.
  for (const command of spec.commands) {
    count(command);
    if (command === 'restart' || command === 'kill') {
      await stop(browser, command === 'kill');
      browser = await launch(name);
      reader = await fixture(browser);
      report.processRestarts++;
    } else if (command === 'open-close') {
      const extra = await fixture(browser);
      await browser.host.closeTarget(extra);
    } else if (command === 'freeze-restore') {
      await browser.cdp.send('Page.setWebLifecycleState', { state: 'frozen' }, reader.sessionId);
      await browser.cdp.send('Page.setWebLifecycleState', { state: 'active' }, reader.sessionId);
    } else if (command === 'detach') {
      const epoch = browser.host.epoch;
      browser.host.guard(epoch);
      await browser.cdp.close();
      assert.throws(() => browser.host.guard(epoch), /host-epoch-lost/u);
      await stop(browser, true);
      browser = await launch(name);
      reader = await fixture(browser);
      report.processRestarts++;
    } else if (command === 'source-drift') {
      const writer = await fixture(browser, 'writer');
      await evaluate(browser, writer, 'window.writerFixture.open()');
      await evaluate(browser, writer, 'window.writerFixture.edit("history-edit")');
      await evaluate(browser, writer, 'window.writerFixture.durable()');
      await browser.host.closeTarget(writer);
      edits += 'history-edit';
      // External source-writer activity has its own persistence boundary. In particular, a
      // successful localStorage removal may roll back on whole-browser death (retained regression).
      await stop(browser);
      browser = await launch(name);
      reader = await fixture(browser);
      report.processRestarts++;
      original = await call(browser, reader, 'inventory');
      const changed = requireOK(await call(browser, reader, 'capture'));
      checkEntries(requireOK(await call(browser, reader, 'replay', changed.bytes, changed)), {
        ...spec.source.input,
        suffix: spec.source.input.suffix + edits,
      });
      changed.bytes.fill(0);
    } else if (command === 'replace-file') {
      const originalBytes = readFileSync(file);
      writeFileSync(file, 'replaced');
      await assert.rejects(() => readPacket(file, binding), /saved-file-mismatch/u);
      writeFileSync(file, originalBytes);
      originalBytes.fill(0);
    } else if (command === 'missing-file') {
      const originalBytes = readFileSync(file);
      unlinkSync(file);
      await assert.rejects(() => readPacket(file, binding), { code: 'ENOENT' });
      writeFileSync(file, originalBytes, { mode: 0o600 });
      originalBytes.fill(0);
    } else if (command === 'wrong-origin') {
      const bytes = await readPacket(file, binding);
      const result = await call(browser, reader, 'replay', [...bytes], {
        ...binding,
        origin: 'https://wrong.invalid',
      });
      bytes.fill(0);
      assert.equal(result.reason, 'input-origin-mismatch');
    } else if (command === 'readback') {
      const bytes = await readPacket(file, binding);
      const entries = requireOK(await call(browser, reader, 'replay', [...bytes], binding));
      bytes.fill(0);
      checkEntries(entries, spec.source.input);
    } else throw Error('Unknown history command');
    const saved = await readPacket(file, binding);
    const verification = await call(browser, reader, 'verifyCurrent', [...saved], binding);
    saved.fill(0);
    if (edits) assert.equal(verification.reason, 'source-changed');
    else requireOK(verification);
    unchangedSource(await call(browser, reader, 'inventory'), original);
  }
  // Every history crosses a full process boundary, regardless of the generated schedule.
  await stop(browser, true);
  browser = await launch(name);
  reader = await fixture(browser);
  report.processRestarts++;
  const bytes = await readPacket(file, binding),
    entries = requireOK(await call(browser, reader, 'replay', [...bytes], binding));
  bytes.fill(0);
  checkEntries(entries, spec.source.input);
  unchangedSource(await call(browser, reader, 'inventory'), original);
  assert.equal(classifyCarriers(original), 'unsupported-carrier', 'unknown-carrier-refuses');
  await stop(browser);
}

const pendingHistories = new Set();
function history(spec) {
  const existing = new Set(live);
  const promise = runHistory(spec).finally(async () => {
    for (const browser of [...live]) if (!existing.has(browser)) await stop(browser, true);
  });
  pendingHistories.add(promise);
  void promise.finally(() => pendingHistories.delete(promise)).catch(() => {});
  return promise;
}

try {
  server = await diag.watch('build-pinned-assets', () => assets(root, output), limits['case-ms']);
  report.assets = server.files;
  report.dependencySources = Object.fromEntries(
    [
      'lib0/broadcastchannel.js',
      'lib0/storage.js',
      'y-websocket/src/y-websocket.js',
      'yjs/dist/yjs.mjs',
    ].map((p) => [p, sha(readFileSync(join(root, 'node_modules', p)))]),
  );
  await test('target-exclusion', async () => {
    for (const kind of ['page', 'frame', 'dedicated', 'shared', 'blob', 'service-worker'])
      await probe(kind);
    await probe('page', { recurse: false });
    await probe('page', { pause: false });
    report.hostDisposition = report.probes.some((p) => p.wroteBeforeRelease)
      ? 'unsupported'
      : 'unproven';
    assert.notEqual(report.hostDisposition, 'supported', 'no-unearned-migration-authority');
  });
  await test('recovery-boundaries', async () => {
    await history({
      source: sample(),
      commands: ['readback', 'replace-file', 'missing-file', 'restart', 'wrong-origin', 'kill'],
    });
    const { browser, reader } = await prepare(
      { ...sample(), disk: [0], wal: [2] },
      'missing-dependency',
    );
    const before = await call(browser, reader, 'inventory');
    const result = await call(browser, reader, 'capture');
    assert.equal(result.reason, 'legacy-dependencies-missing');
    unchangedSource(await call(browser, reader, 'inventory'), before);
    await stop(browser);
  });
  await test('dependency-carrier', async () => {
    for (const fallback of [false, true]) {
      const browser = await launch(`broadcast-${++serial}`),
        reader = await fixture(browser),
        target = await fixture(browser, 'broadcast', fallback ? '?fallback' : '');
      const text = 'synthetic-wire-ledger',
        result = await evaluate(
          browser,
          target,
          `window.broadcastFixture.run(${JSON.stringify(text)})`,
        );
      assert.equal(result.present, fallback);
      assert.equal(result.retainedAfterClose, fallback);
      if (fallback) {
        assert.equal(result.recovered, text, 'fallback-update-contains-plaintext');
        assert.equal(
          classifyCarriers(await call(browser, reader, 'inventory')),
          'unsupported-carrier',
        );
      }
      report.broadcast ??= [];
      report.broadcast.push({
        fallback,
        present: result.present,
        retainedAfterClose: result.retainedAfterClose,
        contentRecovered: result.recovered === text,
      });
      await stop(browser);
    }
  });
  await test('legacy-writer', async () => {
    for (const volatile of [false, true]) {
      const spec = sample(),
        { browser, reader } = await prepare(spec, 'old-writer');
      const writer = await fixture(browser, 'writer');
      await evaluate(browser, writer, 'window.writerFixture.open()');
      await evaluate(browser, writer, 'window.writerFixture.durable()');
      const before = await call(browser, reader, 'inventory');
      await call(browser, reader, 'lock');
      await eventually('exclusive new lock', () =>
        evaluate(browser, reader, 'window.hostLockHeld'),
      );
      const edit = 'legacy-probe-edit',
        visible = await evaluate(
          browser,
          writer,
          `window.writerFixture.edit(${JSON.stringify(edit)},${volatile})`,
        );
      assert(visible.endsWith(edit));
      if (!volatile) await evaluate(browser, writer, 'window.writerFixture.durable()');
      await evaluate(browser, reader, 'window.releaseHostLock()');
      await browser.host.closeTarget(writer);
      const after = await call(browser, reader, 'inventory');
      if (volatile) unchangedSource(after, before);
      else assert.notDeepEqual(after.databases, before.databases, 'old-writer-ignores-new-lock');
      const captured = requireOK(await call(browser, reader, 'capture'));
      const entries = requireOK(await call(browser, reader, 'replay', captured.bytes, captured));
      const master = entries.find((e) => e.path === 'master.md').content;
      assert.equal(master.endsWith(edit), !volatile, 'volatile-visible-edit-is-not-durable');
      count(volatile ? 'volatile-edit-distinguished' : 'old-writer-under-lock');
      await stop(browser);
    }
  });
  await test('cached-shell', async () => {
    const { name, browser, reader } = await prepare(sample(), 'cached');
    const old = await browser.host.create();
    await browser.host.admit(old);
    await browser.cdp.send('Page.navigate', { url: server.url + '/' }, old.sessionId);
    // Setup intentionally permits the real predecessor worker to install its precache.
    await eventually('predecessor app', () =>
      evaluate(browser, old, 'Boolean(document.querySelector(".goals .cm-content"))'),
    );
    await eventually('predecessor worker target', () =>
      [...browser.host.targets.values()].find((t) => t.type === 'service_worker' && t.waiting),
    );
    for (const target of browser.host.targets.values())
      if (target.type === 'service_worker' && target.waiting) await browser.host.admit(target);
    await evaluate(browser, old, 'navigator.serviceWorker.ready.then(()=>true)');
    await eventually(
      'precache installed',
      () => call(browser, reader, 'inventory'),
      (i) => i.caches.some((c) => c.name.startsWith('done-precache-') && c.entries.length > 2),
    );
    await browser.host.closeTarget(old);
    // Finish legacy setup before defining the immutable preflight baseline: closing the old app
    // is not an acknowledgement that its already queued transactions have finished.
    await stop(browser);
    const settled = await launch(name),
      settledReader = await fixture(settled);
    const before = await call(settled, settledReader, 'inventory');
    assert(before.caches.length > 0);
    const captured = requireOK(await call(settled, settledReader, 'capture'));
    checkEntries(
      requireOK(await call(settled, settledReader, 'replay', captured.bytes, captured)),
      sample().input,
    );
    const file = join(output, 'cached.recovery.json'),
      binding = await savePacket(file, captured);
    captured.bytes.fill(0);
    await stop(settled, true);
    const cold = await launch(name),
      observer = await fixture(cold);
    report.processRestarts += 2;
    const coldInventory = await call(cold, observer, 'inventory');
    atomicJSON(join(output, 'cached-before.json'), before);
    atomicJSON(join(output, 'cached-after.json'), coldInventory);
    const targetCensus = await cold.cdp.send('Target.getTargets');
    const restoredOldPages = targetCensus.targetInfos.filter(
      (t) =>
        t.type === 'page' &&
        t.title === 'done' &&
        t.url === server.url + '/test/legacy-host/index.html',
    );
    atomicJSON(join(output, 'cached-targets.json'), targetCensus);
    const sourceDrift =
      sha(JSON.stringify(coldInventory.databases)) !== sha(JSON.stringify(before.databases)) ||
      sha(JSON.stringify(coldInventory.local)) !== sha(JSON.stringify(before.local));
    same(coldInventory.caches, before.caches, 'precache-retained');
    same(coldInventory.registrations, before.registrations, 'worker-registration-retained');
    const reread = await readPacket(file, binding);
    checkEntries(
      requireOK(await call(cold, observer, 'replay', [...reread], binding)),
      sample().input,
    );
    const current = await call(cold, observer, 'verifyCurrent', [...reread], binding);
    reread.fill(0);
    if (current.status === 'refused') assert.equal(current.reason, 'source-changed');
    const restartCounterexample =
      restoredOldPages.length > 0 || sourceDrift || current.status === 'refused';
    if (restartCounterexample) {
      report.hostDisposition = 'unsupported';
      atomicJSON(join(output, 'restart-exclusion-counterexample.json'), {
        browser: report.browser,
        predecessor,
        restoredOldApplicationPages: restoredOldPages.length,
        sourceChanged: sourceDrift || current.status === 'refused',
        recoveryFileReplayed: true,
        outcome: 'unsupported-restored-executable',
        steps: [
          'install pinned predecessor precache',
          'open maintenance URL with worker bypass on that target',
          'kill browser with maintenance page retained',
          'restart same profile and attach controller',
          'observe restored old app at maintenance URL and current source binding',
        ],
      });
    }
    // Positive offline executable control: release the pinned worker so it can serve its retained shell.
    const offline = await cold.host.create();
    await cold.cdp.send('Network.enable', {}, offline.sessionId);
    await cold.cdp.send(
      'Network.emulateNetworkConditions',
      { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
      offline.sessionId,
    );
    await cold.host.admit(offline);
    await cold.cdp.send('Page.navigate', { url: server.url + '/' }, offline.sessionId);
    await eventually('cold service worker', () =>
      [...cold.host.targets.values()].find((t) => t.type === 'service_worker'),
    );
    for (const target of cold.host.targets.values())
      if (target.type === 'service_worker' && target.waiting) await cold.host.admit(target);
    await eventually('actual offline predecessor shell', () =>
      evaluate(cold, offline, 'Boolean(document.querySelector(".goals .cm-content"))'),
    );
    await evaluate(cold, offline, 'document.querySelector(".goals .cm-content").focus()');
    await cold.cdp.send('Input.insertText', { text: 'offline-old-write' }, offline.sessionId);
    await eventually(
      'offline old write persisted',
      () => call(cold, observer, 'inventory'),
      (i) =>
        sha(JSON.stringify(i.databases)) !== sha(JSON.stringify(before.databases)) ||
        i.local.some(
          ([k]) =>
            k.startsWith('done.pending-update.done.') && !before.local.some(([x]) => x === k),
        ),
    );
    report.cachedShell = {
      restartOutcome: restartCounterexample
        ? 'unsupported-restored-executable'
        : 'no-execution-observed',
      restoredOldApplicationPages: restoredOldPages.length,
      sourceChanged: sourceDrift || current.status === 'refused',
      retainedAcrossProcessRestart: true,
      offlineRendered: true,
      offlineWriterPersisted: true,
    };
    await stop(cold);
  });
  await test('loss-and-existing-document', async () => {
    const browser = await launch(`loss-${++serial}`),
      reader = await fixture(browser);
    const old = await browser.host.create(`${server.url}/probe/page?id=history-${serial}`);
    await browser.host.admit(old);
    await eventually('old first execution', () => server.hits.includes(`history-${serial}`));
    await browser.cdp.send('Page.setWebLifecycleState', { state: 'frozen' }, old.sessionId);
    await browser.cdp.send('Page.setWebLifecycleState', { state: 'active' }, old.sessionId);
    await evaluate(
      browser,
      old,
      'localStorage.setItem("preflight.resumed","old-visible-document")',
    );
    assert(
      (await call(browser, reader, 'inventory')).local.some(([k]) => k === 'preflight.resumed'),
    );
    count('frozen-document-resumes');
    const epoch = browser.host.epoch;
    await browser.cdp.close();
    assert.throws(() => browser.host.guard(epoch), /host-epoch-lost/u);
    await stop(browser, true);
    count('host-detach');
    const fresh = await launch(`loss-${serial}`);
    assert.throws(() => fresh.host.guard(epoch), /host-epoch-lost/u);
    await stop(fresh);
    count('stale-epoch');
  });
  await test('history-and-second-process', async () => {
    const browser = await launch('history-and-process'),
      reader = await fixture(browser);
    const id = 'restorable-page',
      old = await browser.host.create(server.url + '/probe/page?id=' + id);
    await browser.host.admit(old);
    await browser.cdp.send('Page.enable', {}, old.sessionId);
    await eventually('history source page', () => server.hits.includes(id));
    const initial = await browser.cdp.send('Page.getNavigationHistory', {}, old.sessionId);
    const entry = initial.entries[initial.currentIndex];
    await browser.cdp.send('Page.navigate', { url: 'about:blank' }, old.sessionId);
    await eventually(
      'left history document',
      () => evaluate(browser, old, 'location.href'),
      (url) => url === 'about:blank',
    );
    await browser.cdp.send('Page.navigateToHistoryEntry', { entryId: entry.id }, old.sessionId);
    await eventually(
      'history document returned',
      () => evaluate(browser, old, 'location.pathname'),
      (path) => path === '/probe/page',
    );
    const restored = await evaluate(
      browser,
      old,
      'localStorage.getItem("preflight.history.restorable-page")',
    );
    assert(['load', 'bfcache'].includes(restored));
    report.historyRestore = { observed: restored, bfcacheExercised: restored === 'bfcache' };
    const result = await secondProcess(browser, server.url + '/probe/page?id=second-process');
    const wrote = await eventually(
      'secondary process observation',
      () => call(browser, reader, 'inventory'),
      (state) => result.code !== 0 || hasFirstWrite(state, 'second-process'),
    );
    report.secondProcess = { ...result, sourceWrite: hasFirstWrite(wrote, 'second-process') };
    if (report.secondProcess.sourceWrite) report.hostDisposition = 'unsupported';
    await stop(browser);
  });
  await test('direct-asset-and-transport', async () => {
    const { browser, reader } = await prepare(sample(), 'direct-asset');
    const config = {
      endpoint: server.url.replace('http:', 'ws:') + '/relay',
      room: 'synthetic-room',
      token: '',
      enabled: true,
    };
    await evaluate(
      browser,
      reader,
      'localStorage.setItem("done.sync",' + JSON.stringify(JSON.stringify(config)) + ')',
    );
    assert.equal(
      classifyCarriers(await call(browser, reader, 'inventory')),
      'remote-reconciliation-required',
    );
    const old = await browser.host.create(server.url + '/probe/old-asset.html');
    await browser.host.admit(old);
    await eventually('pinned asset app initialized', () =>
      evaluate(browser, old, 'Boolean(document.querySelector(".goals .cm-content"))'),
    );
    await eventually(
      'old provider attempted relay',
      () => server.upgrades.length,
      (n) => n > 0,
    );
    const previous = server.upgrades.length;
    await evaluate(browser, reader, 'localStorage.removeItem("done.sync")');
    await eventually(
      'old provider reconnects after configuration removal',
      () => server.upgrades.length,
      (n) => n > previous,
    );
    await evaluate(browser, old, 'document.querySelector(".goals .cm-content").focus()');
    await browser.cdp.send('Input.insertText', { text: 'direct-asset-edit' }, old.sessionId);
    const capture = await eventually(
      'direct asset persisted edit',
      () => call(browser, reader, 'capture'),
      (r) => r.status === 'ok',
    );
    const entries = requireOK(
      await call(browser, reader, 'replay', capture.value.bytes, capture.value),
    );
    assert(entries.find((e) => e.path === 'master.md').content.includes('direct-asset-edit'));
    report.transport = {
      configuredSourceRefused: true,
      oldProviderReconnectedAfterRemoval: true,
      directAssetPersistedEdit: true,
    };
    await stop(browser);
  });
  await test('unsettled-profile-crash', async () => {
    const { name, browser, reader } = await prepare(
      { ...sample(), disk: [1], wal: [0, 2] },
      'unsettled',
    );
    const before = await call(browser, reader, 'inventory'),
      captured = requireOK(await call(browser, reader, 'capture'));
    const file = join(output, 'unsettled.recovery.json'),
      binding = await savePacket(file, captured);
    captured.bytes.fill(0);
    await stop(browser, true);
    const cold = await launch(name),
      observer = await fixture(cold);
    report.processRestarts++;
    const after = await call(cold, observer, 'inventory'),
      bytes = await readPacket(file, binding);
    checkEntries(
      requireOK(await call(cold, observer, 'replay', [...bytes], binding)),
      sample().input,
    );
    bytes.fill(0);
    report.unsettledSource = {
      localCarriersChanged: sha(JSON.stringify(before.local)) !== sha(JSON.stringify(after.local)),
      originalLocalCount: before.local.length,
      recoveredLocalCount: after.local.length,
      recoveryFileReplayed: true,
    };
    atomicJSON(join(output, 'unsettled-source-observation.json'), {
      ...report.unsettledSource,
      beforeHash: sha(JSON.stringify(before)),
      afterHash: sha(JSON.stringify(after)),
    });
    await stop(cold);
  });
  await test('controls', async () => {
    const detected = async (id, label, fn, evidence) => {
      await assert.rejects(fn, (error) => error.message.includes(label), id);
      report.controls.push({
        id,
        assertion: label,
        detected: true,
        ...(evidence ? { mutation: evidence } : {}),
      });
    };
    const page = await probe('page', { pause: false });
    // Faulty host acknowledgement from an after-creation-only controller; independent carrier oracle.
    const lateAcknowledgement = { excluded: true };
    await detected('after-creation-only', 'first-line-write-before-ack', async () =>
      assert.equal(
        lateAcknowledgement.excluded,
        !hasFirstWrite(page.evidence.during, page.evidence.id),
        'first-line-write-before-ack',
      ),
    );
    const worker = await probe('dedicated');
    const blind = await mutatedModule(
      root,
      output,
      'omit-worker-coverage',
      'scripts/legacy-host/recovery.mjs',
      "db.name === 'preflight-worker-probe' &&",
      'false &&',
    );
    await detected(
      'omit-worker-coverage',
      'released-worker-write-must-be-observed',
      async () =>
        assert.equal(
          blind.module.hasFirstWrite(worker.evidence.released, worker.evidence.id),
          true,
          'released-worker-write-must-be-observed',
        ),
      blind.evidence,
    );
    const { browser, reader } = await prepare(sample(), 'controls'),
      inventory = await call(browser, reader, 'inventory');
    const captured = requireOK(await call(browser, reader, 'capture')),
      file = join(output, 'control.recovery.json'),
      binding = await savePacket(file, captured);
    const memory = await mutatedModule(
      root,
      output,
      'memory-readback',
      'scripts/legacy-host/recovery.mjs',
      'const bytes = await readFile(file);',
      'const bytes = Buffer.from(' +
        JSON.stringify(Buffer.from(captured.bytes).toString('base64')) +
        ', "base64");',
    );
    writeFileSync(file, 'replacement');
    await detected(
      'memory-readback',
      'actual-file-was-not-read',
      async () =>
        assert.rejects(
          () => memory.module.readPacket(file, binding),
          /saved-file-mismatch/u,
          'actual-file-was-not-read',
        ),
      memory.evidence,
    );
    const requested = { ...binding, origin: 'https://wrong.invalid' };
    assert.equal(
      (await call(browser, reader, 'replay', captured.bytes, requested)).status,
      'refused',
    );
    // Mutant host silently substitutes its preferred origin for the caller's requested origin.
    const substituted = { ...requested, origin: binding.origin };
    await detected('different-origin-input', 'different-origin-must-refuse', async () =>
      assert.equal(
        (await call(browser, reader, 'replay', captured.bytes, substituted)).status,
        'refused',
        'different-origin-must-refuse',
      ),
    );
    const carrier = await mutatedModule(
      root,
      output,
      'ignore-fallback-carrier',
      'scripts/legacy-host/recovery.mjs',
      readFileSync(join(root, 'scripts/legacy-host/recovery.mjs'), 'utf8')
        .split('\n')
        .find((line) => line.includes('wss?')),
      '    if (/^wss?:\\/\\//u.test(key)) continue;',
    );
    const broadcast = await fixture(browser, 'broadcast', '?fallback');
    await evaluate(browser, broadcast, 'window.broadcastFixture.run("control-ledger")');
    const actual = await call(browser, reader, 'inventory');
    // Remove only the deliberately unrelated fixture key from this classification input, not storage.
    actual.local = actual.local.filter(([key]) => key !== 'other-app');
    await detected(
      'ignore-fallback-carrier',
      'unsupported-carrier-must-refuse',
      async () =>
        assert.equal(
          carrier.module.classifyCarriers(actual),
          'unsupported-carrier',
          'unsupported-carrier-must-refuse',
        ),
      carrier.evidence,
    );
    const epoch = browser.host.epoch;
    browser.host.guard(epoch);
    browser.host.invalidate('seeded-loss');
    assert.throws(() => browser.host.guard(epoch), /host-epoch-lost/u);
    const stale = await mutatedModule(
      root,
      output,
      'stale-epoch',
      'scripts/legacy-host/exclusion.mjs',
      'if (this.loss || epoch !== this.epoch)',
      'if (false)',
    );
    await detected(
      'stale-epoch',
      'lost-epoch-must-refuse',
      async () =>
        assert.throws(
          () => stale.module.PreflightExclusion.prototype.guard.call(browser.host, epoch),
          /host-epoch-lost/u,
          'lost-epoch-must-refuse',
        ),
      stale.evidence,
    );
    // Destructive control belongs to the disposable fixture, never the preflight implementation.
    await evaluate(browser, reader, 'localStorage.clear()');
    await detected('broad-storage-deletion', 'source-carriers-preserved', async () =>
      unchangedSource(await call(browser, reader, 'inventory'), inventory),
    );
    await stop(browser);
  });
  await test('history-coverage-control', async () => {
    const { browser, reader } = await prepare(sample(), 'history-control');
    const id = 'history-coverage',
      old = await browser.host.create(`${server.url}/probe/page?id=${id}`);
    await browser.host.admit(old);
    await eventually(
      'initial history write',
      () => call(browser, reader, 'inventory'),
      (s) => hasFirstWrite(s, id),
    );
    await browser.cdp.send('Page.enable', {}, old.sessionId);
    const history = await browser.cdp.send('Page.getNavigationHistory', {}, old.sessionId),
      entry = history.entries[history.currentIndex];
    await browser.cdp.send('Page.navigate', { url: 'about:blank' }, old.sessionId);
    await eventually(
      'history control left page',
      () => evaluate(browser, old, 'location.href'),
      (url) => url === 'about:blank',
    );
    // Only the disposable probe's marker; absence before return is part of this control's oracle.
    await evaluate(browser, reader, `localStorage.removeItem("preflight.sentinel.${id}")`);
    assert.equal(hasFirstWrite(await call(browser, reader, 'inventory'), id), false);
    await browser.cdp.send('Page.navigateToHistoryEntry', { entryId: entry.id }, old.sessionId);
    await eventually(
      'history control returned',
      () => evaluate(browser, old, 'location.pathname'),
      (path) => path === '/probe/page',
    );
    const observed = await evaluate(
      browser,
      old,
      `localStorage.getItem("preflight.history.${id}")`,
    );
    assert(['load', 'bfcache'].includes(observed));
    // Exercise a fresh write from the restored document even when its first script is not rerun.
    await evaluate(browser, old, `localStorage.setItem("preflight.sentinel.${id}", "restored")`);
    const restored = await call(browser, reader, 'inventory');
    assert.equal(hasFirstWrite(restored, id), true);
    const blind = await mutatedModule(
      root,
      output,
      'omit-history-coverage',
      'scripts/legacy-host/recovery.mjs',
      'inventory.local.some(([key]) => key === `preflight.sentinel.${id}`)',
      'false',
    );
    await assert.rejects(
      async () =>
        assert.equal(
          blind.module.hasFirstWrite(restored, id),
          true,
          'restored-document-write-must-be-observed',
        ),
      (error) => error.message.includes('restored-document-write-must-be-observed'),
    );
    report.controls.push({
      id: 'omit-history-coverage',
      assertion: 'restored-document-write-must-be-observed',
      detected: true,
      mutation: blind.evidence,
    });
    report.historyControl = { observed, bfcacheExercised: observed === 'bfcache' };
    await stop(browser);
  });
  if (!options.case || options.case === 'histories') {
    const arbitrary = fc.record({
      source: sources,
      commands: fc.array(
        fc.constantFrom(
          'readback',
          'restart',
          'kill',
          'replace-file',
          'missing-file',
          'wrong-origin',
          'open-close',
          'freeze-restore',
          'detach',
          'source-drift',
        ),
        { minLength: 2, maxLength: 7 },
      ),
    });
    if (options.replay)
      await history(JSON.parse(readFileSync(resolve(root, options.replay), 'utf8')));
    else {
      const details = await checkHistories(diag, 'host-histories', arbitrary, history, {
        seed,
        numRuns: runs,
        ...(options.path ? { path: options.path } : {}),
      });
      report.properties = {
        seed,
        runs: details.numRuns,
        failed: details.failed,
        shrinks: details.numShrinks,
        path: details.counterexamplePath,
      };
      if (details.failed) {
        atomicJSON(join(output, 'host-counterexample.json'), details.counterexample);
        throw Error('Generated host history failed');
      }
    }
  }
  if (options.case && !report.checks.length && options.case !== 'histories')
    throw Error('Unknown case');
  report.unsupported = [
    'production-profile-control',
    'installed-window-ui',
    'uncontrolled-remote-participants',
    'whole-profile-residue',
    'cross-origin-transfer',
  ];
  if (report.hostDisposition === 'unmeasured') report.hostDisposition = 'unproven';
  report.passed = true;
} catch (error) {
  diag.recordFailure(error);
  process.exitCode = 1;
} finally {
  await diag
    .closeResources(
      [...live]
        .map((browser) => ['browser', () => stop(browser, true)])
        .concat([['pending-histories', () => Promise.allSettled([...pendingHistories])]])
        .concat(server ? [['asset-server', () => server.close()]] : []),
    )
    .catch((error) => {
      diag.recordFailure(error);
      process.exitCode = 1;
    });
  try {
    assert.deepEqual(hashes(), report.files);
    report.inputsUnchanged = true;
  } catch (error) {
    diag.recordFailure(error);
    process.exitCode = 1;
  }
  report.status = 'finished';
  report.finished = new Date().toISOString();
  diag.checkpoint();
  diag.dispose();
  diag.event(
    'finished',
    { passed: report.passed, hostDisposition: report.hostDisposition, output },
    true,
  );
  if (process.connected) process.send({ type: 'done' }, () => process.disconnect());
}
