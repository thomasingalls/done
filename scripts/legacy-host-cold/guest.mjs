import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { execFileSync, fork, spawn } from 'node:child_process';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import fc from 'fast-check';
import * as Y from 'yjs';
import { launch, page, fixtureEval, policyTable, inertPage, frameReady } from './browser.mjs';
import { poll as eventually, denialConfig, triggerVerdict } from './checks.mjs';
import { fixtureServer, origin, other, sentinel } from './fixtures.mjs';
import { readInventory, hash } from './observer.mjs';
import { CDP } from '../legacy-host/cdp.mjs';
import { within, atomicJSON } from '../legacy-cleanup/diagnostics.mjs';
import { example } from '../legacy-export/oracle.mjs';

if (!globalThis.WebSocket)
  globalThis.WebSocket = createRequire(import.meta.url)('undici').WebSocket;
const [mode, output, assets, policy = 'deny'] = process.argv.slice(2);
if (mode === 'controller') {
  const cdp = await CDP.connect(output);
  process.send({ ready: true });
  await new Promise(() => {
    cdp.on('disconnected', () => process.exit(0));
  });
} else {
  await main();
}

async function main() {
  if (
    !['seed', 'directed', 'generated'].includes(mode) ||
    !['deny', 'allow', 'origin'].includes(policy)
  )
    throw Error('guest-arguments');
  mkdirSync(output, { recursive: true });
  const reportPath = join(output, `${mode}-${policy}.json`);
  if (existsSync(reportPath)) throw Error('immutable-output-exists');
  const report = {
    mode,
    policy,
    started: new Date().toISOString(),
    scope: 'synthetic closed profiles; no migration authority',
    cases: [],
    unsupported: [],
    limits: { callMs: 30000, caseMs: 120000, totalMs: 600000, teardownMs: 10000, shrinkMs: 120000 },
    passed: false,
  };
  report.fixtureBundleHash = hash(readFileSync(process.argv[1], 'utf8'));
  let browser;
  const server = fixtureServer(assets);
  const event = (kind, data = {}) => {
    const row = { time: new Date().toISOString(), kind, ...data };
    appendFileSync(join(output, `${mode}-${policy}.jsonl`), JSON.stringify(row) + '\n');
    console.log(JSON.stringify(row));
    atomicJSON(reportPath, report);
  };
  const totalTimer = setTimeout(() => {
    event('total-timeout');
    browser?.stop(true).finally(() => process.exit(124));
  }, report.limits.totalMs);
  const heartbeat = setInterval(() => event('heartbeat'), 15000);
  const attempt = async (name, operation) => {
    event('case-start', { name });
    try {
      const result = await within(name, report.limits.caseMs, operation);
      report.cases.push({ name, passed: true, result });
      event('case-pass', { name });
      return result;
    } catch (error) {
      report.cases.push({ name, passed: false, error: error.stack });
      const path = join(output, `${mode}-${policy}-first-failure.json`);
      if (!existsSync(path)) atomicJSON(path, { name, error: error.stack, report });
      event('case-fail', { name, message: error.message });
      throw error;
    }
  };
  const start = async (name = policy, url = origin + '/inert', connect = true) => {
    browser = await launch(output, name, url, connect);
    return browser;
  };
  const stop = async (force = false) => {
    await browser?.stop(force);
    browser = null;
  };
  const inventory = async () => {
    const id = await inertPage(browser, origin);
    try {
      return await readInventory(browser.cdp, id, origin);
    } finally {
      await browser.cdp.send('Target.closeTarget', { targetId: id });
    }
  };
  const oldInventory = async () => {
    if (policy !== 'allow') return inventory();
    // The positive control intentionally runs writers. A moving-source refusal is not a negative
    // observation: retain it and require a subsequent complete read. Denied reads never retry drift.
    return eventually('complete positive-control source read', async () => {
      try {
        return await inventory();
      } catch (error) {
        if (!/^observer-(storage-changed|pagination)/u.test(error.message)) throw error;
        report.controlReadRetries ??= [];
        report.controlReadRetries.push(error.message);
        return null;
      }
    });
  };
  const fixtureMaster = (observed) => {
    // Fixture oracle only; this is not a production capture/parser/packet bridge.
    const doc = new Y.Doc();
    try {
      for (const [, value] of observed.databases
        .find((d) => d.name === 'done')
        .stores.find((s) => s.name === 'updates').rows)
        Y.applyUpdate(doc, new Uint8Array(value.bytes));
      for (const [, value] of observed.local.filter(([key]) =>
        key.startsWith('done.pending-update.done.'),
      )) {
        assert.ok(value.startsWith('1:'), 'fixture-journal-format');
        Y.applyUpdate(doc, Buffer.from(value.slice(2), 'base64'));
      }
      assert.equal(doc.store.pendingStructs, null, 'fixture-dependencies-complete');
      assert.equal(doc.store.pendingDs, null, 'fixture-deletes-complete');
      return doc.getText('master').toString();
    } finally {
      doc.destroy();
    }
  };
  const baseline = () => JSON.parse(readFileSync(join(output, `baseline-${policy}.json`), 'utf8'));
  const preserved = async (label) => {
    const after = await inventory();
    atomicJSON(join(output, `${mode}-${policy}-${label}-inventory.json`), after);
    assert.deepEqual(after, baseline(), 'closed-source-carriers-preserved');
    return hash(after);
  };
  const controllerDeath = async (id) => {
    await page(browser, origin + '/deferred?id=' + id);
    const [port, path] = readFileSync(join(browser.profile, 'DevToolsActivePort'), 'utf8')
      .trim()
      .split('\n');
    const stale = browser.cdp;
    await browser.disconnect();
    const child = fork(process.argv[1], ['controller', `ws://127.0.0.1:${port}${path}`], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    const exit = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    try {
      await within(
        'separate controller connected',
        10000,
        () => new Promise((resolve) => child.once('message', resolve)),
      );
      child.kill('SIGKILL');
      assert.equal((await within('controller death', 10000, () => exit)).signal, 'SIGKILL');
      await eventually('navigation with no debugger connection', () =>
        server.hits.some((h) => h.path === '/probe' && h.id === id),
      );
      if (policy === 'allow')
        await eventually('controller-loss positive write', () =>
          server.hits.some((h) => h.path === '/hit' && h.id === id),
        );
      assert.equal(browser.exited, false, 'browser-survives-controller-death');
      await assert.rejects(
        stale.send('Target.getTargets'),
        /disconnected/,
        'stale-connection-refused',
      );
      await browser.connect();
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  };
  const crashRestart = async (id) => {
    await stop(true);
    browser = await launch(output, policy, origin + '/probe?id=' + id, false, { restore: true });
    await eventually('cold first navigation before attachment', () =>
      server.hits.some((h) => h.path === '/probe' && h.id === id),
    );
    if (policy === 'allow')
      await eventually('cold restart positive write', () =>
        server.hits.some((h) => h.path === '/hit' && h.id === id),
      );
    await browser.connect();
    return {
      restoredTargets: (await browser.cdp.send('Target.getTargets')).targetInfos.map((t) => ({
        type: t.type,
        url: t.url,
      })),
    };
  };
  try {
    if (mode !== 'seed' && policy !== 'allow') {
      const positive = JSON.parse(readFileSync(join(output, 'directed-allow.json'), 'utf8'));
      assert.equal(positive.passed, true, 'native-positive-controls-required');
      assert.equal(
        positive.fixtureBundleHash,
        report.fixtureBundleHash,
        'same-positive-executable-required',
      );
      if (mode === 'generated') {
        const directed = JSON.parse(readFileSync(join(output, 'directed-deny.json'), 'utf8'));
        assert.equal(directed.passed, true, 'directed-denial-required');
        assert.equal(directed.fixtureBundleHash, report.fixtureBundleHash);
      }
    }
    await server.start();
    const mount = readFileSync('/proc/self/mountinfo', 'utf8')
      .split('\n')
      .find((l) => l.includes(' /etc/chromium/policies/managed '));
    assert.ok(mount?.split(' ')[5].split(',').includes('ro'), 'policy-mount-readonly');
    const config = JSON.parse(readFileSync('/etc/chromium/policies/managed/denial.json', 'utf8'));
    if (policy === 'deny')
      denialConfig(JSON.stringify(config), { readonly: true, mandatory: true, beforeLaunch: true });
    assert.deepEqual(
      config,
      policy === 'deny'
        ? { DefaultJavaScriptSetting: 2 }
        : policy === 'origin'
          ? { DefaultJavaScriptSetting: 1, JavaScriptBlockedForUrls: [origin] }
          : { DefaultJavaScriptSetting: 1 },
      'policy-file-exact',
    );
    assert.equal(process.getuid(), 1000, 'unprivileged-browser-controller');
    assert.match(
      readFileSync('/proc/self/status', 'utf8'),
      /^NoNewPrivs:\s+1$/mu,
      'no-new-privileges-inherited',
    );
    try {
      execFileSync('/usr/bin/sudo', ['-n', 'true'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      throw Error('controller-can-elevate');
    } catch (error) {
      assert.equal(error.status, 1, 'controller-cannot-elevate');
      report.privilegeBoundary = {
        noNewPrivs: 1,
        sudoExit: error.status,
        stderr: String(error.stderr).slice(0, 1500),
      };
    }
    try {
      appendFileSync('/etc/chromium/policies/managed/denial.json', '\n');
      throw Error('controller-can-write-policy');
    } catch (error) {
      assert.ok(['EROFS', 'EACCES'].includes(error.code), 'controller-cannot-remove-denial');
      report.policyWriteRefusal = error.code;
    }
    const interfaces = execFileSync('/usr/sbin/ip', ['-j', 'addr'], { encoding: 'utf8' });
    assert.deepEqual(
      JSON.parse(interfaces).map((i) => i.ifname),
      ['lo'],
      'network-namespace-loopback-only',
    );
    report.runtime = {
      mount,
      config,
      interfaces: JSON.parse(interfaces),
      packages: execFileSync(
        '/usr/bin/dpkg-query',
        ['-W', 'chromium', 'chromium-sandbox', 'nodejs', 'node-undici'],
        { encoding: 'utf8' },
      ),
      kernel: execFileSync('/usr/bin/uname', ['-a'], { encoding: 'utf8' }),
      binary: execFileSync(
        '/usr/bin/sha256sum',
        ['/usr/lib/chromium/chromium', '/usr/bin/chromium'],
        { encoding: 'utf8' },
      ),
    };
    report.runtime.externalConnect = await within(
      'independent network denial',
      3000,
      () =>
        new Promise((resolve, reject) => {
          const socket = createConnection({ host: '198.51.100.1', port: 9 });
          socket.once('error', (e) => {
            socket.destroy();
            resolve(e.code);
          });
          socket.once('connect', () => {
            socket.destroy();
            reject(Error('external-network-available'));
          });
          socket.setTimeout(2000, () => {
            socket.destroy();
            reject(Error('network-denial-not-demonstrated'));
          });
        }),
    );
    assert.equal(report.runtime.externalConnect, 'ENETUNREACH');
    // Canary has no source data. Effective policy is observed before any seeded profile is launched.
    await attempt('isolated-canary-policy-and-first-script', async () => {
      await start(`canary-${mode}-${policy}`, origin + '/probe?id=canary');
      report.browser = await browser.cdp.send('Browser.getVersion');
      report.commandLine = await browser.cdp.send('Browser.getBrowserCommandLine');
      assert.equal(report.commandLine.arguments.includes('--no-sandbox'), false);
      report.effectivePolicy = await policyTable(browser);
      const row = report.effectivePolicy.rows.find((r) => r[0] === 'DefaultJavaScriptSetting');
      assert.ok(
        row &&
          row[1] === String(config.DefaultJavaScriptSetting) &&
          ['Platform', 'Machine', 'Mandatory', 'OK'].every((v) => row.includes(v)),
        'effective-mandatory-policy',
      );
      assert.equal(
        report.effectivePolicy.rows.some((r) => r[0] === 'JavaScriptAllowedForUrls'),
        false,
        'no-policy-allow-exceptions',
      );
      if (policy === 'allow')
        await eventually('canary positive execution', () =>
          server.hits.some((h) => h.path === '/hit' && h.id === 'canary'),
        );
      const value = (await inventory()).local.find(([k]) => k === sentinel('canary'))?.[1];
      assert.equal(value, policy === 'allow' ? 'ran' : undefined, 'canary-first-script');
      // Read the browser's sandbox diagnostics without evaluating page script.
      const id = await page(browser, 'chrome://sandbox/');
      const { sessionId } = await browser.cdp.send('Target.attachToTarget', {
        targetId: id,
        flatten: true,
      });
      const flatten = (n) => [
        n.nodeType === 3 ? n.nodeValue : '',
        ...(n.children ?? []).flatMap(flatten),
      ];
      report.sandbox = await eventually(
        'sandbox DOM',
        async () =>
          flatten(
            (await browser.cdp.send('DOM.getDocument', { depth: -1 }, sessionId)).root,
          ).filter(Boolean),
        (text) => text.some((t) => t.includes('Seccomp')),
      );
      assert.ok(
        report.sandbox.includes('You are adequately sandboxed.'),
        'effective-browser-sandbox',
      );
      await stop();
      return { sentinel: value ?? null };
    });
    if (mode === 'seed') {
      assert.equal(policy, 'allow', 'seed-requires-explicit-control-namespace');
      for (const name of ['deny', 'allow', 'origin', 'old-deny', 'old-allow'])
        await attempt(`seed-clean-reopen-${name}`, async () => {
          await start(name);
          const id = await page(browser, origin + '/test/legacy-host/seed.html');
          await eventually('source seeder loaded', () =>
            fixtureEval(browser, id, 'typeof window.seedFixture === "function"'),
          );
          const input = example();
          const source = await fixtureEval(
            browser,
            id,
            `window.seedFixture(${JSON.stringify({ input, disk: [0], wal: [1, 2] })})`,
          );
          const bytes = fc
            .sample(fc.uint8Array({ minLength: 0, maxLength: 512 }), { seed: 8941, numRuns: 23 })
            .map((b, i) => [i % 2 ? `κ-${i}-😀` : i, { bytes: [...b] }]);
          await fixtureEval(
            browser,
            id,
            `(async()=>{const rows=${JSON.stringify(bytes)};await new Promise((resolve,reject)=>{const r=indexedDB.open('cold-bytes',1);r.onupgradeneeded=()=>r.result.createObjectStore('rows');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const d=r.result,t=d.transaction('rows','readwrite');for(const [k,v] of rows)t.objectStore('rows').put(new Uint8Array(v.bytes),k);t.oncomplete=()=>{d.close();resolve()};t.onabort=()=>reject(t.error)}});localStorage.setItem('unknown.κ.😀','exact\\u0000bytes 🦋');return true})()`,
          );
          if (!name.startsWith('old-'))
            await fixtureEval(
              browser,
              id,
              `navigator.serviceWorker.register('/sentinel-sw.js',{scope:'/'}).then(()=>navigator.serviceWorker.ready).then(()=>true)`,
            );
          atomicJSON(join(output, `ledger-${name}.json`), { input, source, bytes });
          await stop();
          await start(name);
          const actual = await inventory();
          const actualBytes = actual.databases.find((d) => d.name === 'cold-bytes').stores[0].rows;
          assert.deepEqual(new Map(actualBytes), new Map(bytes), 'native-binary-roundtrip');
          assert.equal(
            actual.local.find(([k]) => k === 'unknown.κ.😀')?.[1],
            'exact\u0000bytes 🦋',
          );
          assert.deepEqual(
            actual.databases.find((d) => d.name === 'done').stores.find((s) => s.name === 'updates')
              .rows,
            [[1, { bytes: source.updates[0] }]],
            'seeded-old-database',
          );
          for (const i of [0, 1])
            assert.equal(
              actual.local.find(([k]) => k === `done.pending-update.done.fixture.${i}`)?.[1],
              '1:' + Buffer.from(source.updates[i + 1]).toString('base64'),
              'seeded-old-journal',
            );
          if (name.startsWith('old-')) {
            const old = await page(browser, origin + '/');
            await eventually('actual predecessor editor', () =>
              fixtureEval(browser, old, 'Boolean(document.querySelector(".goals .cm-content"))'),
            );
            await fixtureEval(browser, old, 'navigator.serviceWorker.ready.then(()=>true)');
            const blank = await page(browser, 'about:blank');
            for (const target of (await browser.cdp.send('Target.getTargets')).targetInfos.filter(
              (t) => t.type === 'page' && t.targetId !== blank,
            ))
              await browser.cdp.send('Target.closeTarget', { targetId: target.targetId });
            await stop();
            await start(name, 'about:blank');
            const cached = await inventory();
            assert.equal(
              fixtureMaster(cached),
              input.master + input.suffix.slice(1),
              'cached-fixture-master-ledger',
            );
            assert.ok(
              cached.caches.some((c) => c.entries.some((e) => e.url.endsWith('.js'))),
              'retained-predecessor-cache',
            );
            atomicJSON(join(output, `baseline-${name}.json`), cached);
            await stop();
            return {
              hash: hash(cached),
              binaryRows: bytes.length,
              cachedAssets: cached.caches.flatMap((c) => c.entries).length,
            };
          }
          atomicJSON(join(output, `baseline-${name}.json`), actual);
          await stop();
          return { hash: hash(actual), binaryRows: bytes.length };
        });
    } else if (mode === 'directed') {
      await start();
      const probes = [
        ['first-page', origin + '/probe?id=first-page'],
        ['same-frame', origin + '/embed?kind=frame&id=same-frame'],
        ['foreign-frame', other + '/embed?kind=frame&id=foreign-frame'],
        ['srcdoc', origin + '/embed?kind=srcdoc&id=srcdoc'],
        ['blank', origin + '/embed?kind=blank&id=blank'],
        ...['dedicated', 'shared', 'blob'].map((k) => [k, origin + `/spawn?kind=${k}&id=${k}`]),
        ['sw-fetch', origin + '/sw-trigger'],
      ];
      for (const [id, url] of probes)
        await attempt(id, async () => {
          await page(browser, url);
          if (policy === 'allow' || (policy === 'origin' && id === 'foreign-frame'))
            await eventually('positive fixture write ' + id, () =>
              server.hits.some((h) => h.path === '/hit' && h.id === id),
            );
          else await new Promise((r) => setTimeout(r, 250));
          const observed = await inventory();
          atomicJSON(join(output, `${mode}-${policy}-${id}.json`), observed);
          if (policy === 'deny') assert.deepEqual(observed, baseline(), 'denial-no-native-write');
          else if (policy === 'allow' || id === 'foreign-frame') {
            const written =
              observed.local.some(([k, v]) => k === sentinel(id) && v === 'ran') ||
              observed.databases.some(
                (d) =>
                  d.name === 'cold-worker' &&
                  d.stores.some((s) => s.rows.some(([k, v]) => k === id && v === 'ran')),
              );
            assert.ok(written, 'same-executable-positive-native-write');
          }
          return {
            hit: server.hits.some((h) => h.path === '/hit' && h.id === id),
            inventoryHash: hash(observed),
          };
        });
      await attempt('controller-death-and-reconnect', async () => {
        await controllerDeath('directed-controller');
        if (policy === 'deny') return preserved('controller-death');
        if (policy === 'allow')
          assert.ok((await inventory()).local.some(([k]) => k === sentinel('directed-controller')));
      });
      await attempt('browser-kill-cold-start-and-session-restore', async () => {
        const result = await crashRestart('directed-cold');
        if (policy === 'deny') await preserved('cold-restart');
        return result;
      });
      await attempt('second-invocation-with-controller-absent', async () => {
        const args = browser.args
          .slice(0, -1)
          .filter((a) => !a.startsWith('--remote-debugging-port'));
        await browser.disconnect();
        const second = spawn('/usr/bin/chromium', [...args, origin + '/probe?id=second'], {
          detached: true,
          stdio: ['ignore', 'ignore', 'pipe'],
        });
        let stderr = '';
        second.stderr.on('data', (c) => {
          stderr = (stderr + c).slice(-1000);
        });
        try {
          const result = await within(
            'second invocation exit',
            10000,
            () =>
              new Promise((resolve, reject) => {
                second.once('error', reject);
                second.once('exit', (code, signal) => resolve({ code, signal }));
              }),
          );
          await browser.connect();
          if (policy === 'deny') await preserved('second-invocation');
          return {
            ...result,
            stderr,
            navigation: server.hits.some((h) => h.path === '/probe' && h.id === 'second'),
          };
        } finally {
          if (second.exitCode === null && second.signalCode === null) {
            try {
              process.kill(-second.pid, 'SIGKILL');
            } catch {}
          }
        }
      });
      await attempt('ordinary-history-and-frozen-document', async () => {
        const id = await page(browser, origin + '/probe?id=history-a');
        const { sessionId } = await browser.cdp.send('Target.attachToTarget', {
          targetId: id,
          flatten: true,
        });
        try {
          await browser.cdp.send('Page.enable', {}, sessionId);
          await browser.cdp.send(
            'Page.navigate',
            { url: origin + '/probe?id=history-b' },
            sessionId,
          );
          await frameReady(browser, sessionId, origin + '/probe?id=history-b');
          await eventually('second history request', () =>
            server.hits.some((h) => h.path === '/probe' && h.id === 'history-b'),
          );
          const history = await browser.cdp.send('Page.getNavigationHistory', {}, sessionId);
          const entry = history.entries.find((e) => e.url === origin + '/probe?id=history-a');
          assert.ok(entry, 'history-entry-retained');
          await browser.cdp.send('Page.navigateToHistoryEntry', { entryId: entry.id }, sessionId);
          await frameReady(browser, sessionId, origin + '/probe?id=history-a');
          await browser.cdp.send('Page.setWebLifecycleState', { state: 'frozen' }, sessionId);
          await browser.cdp.send('Page.setWebLifecycleState', { state: 'active' }, sessionId);
          if (policy === 'deny') await preserved('history-frozen');
          return { historyEntries: history.entries.length, bfcacheProven: false };
        } finally {
          await browser.cdp.send('Target.detachFromTarget', { sessionId }).catch(() => {});
        }
      });
      report.workerVerdict = triggerVerdict({
        denied: policy === 'deny',
        positiveWrite: true,
        delivered: policy === 'allow',
      });
      report.unsupported.push(
        'Retained service-worker fetch trigger under denial is not independently acknowledged; absence alone is a finite observation.',
        'Independent background event delivery, actual BFCache restoration and installed windows remain unproven. Frozen/active and ordinary history commands were exercised.',
      );
      if (policy !== 'origin')
        await attempt('cached-predecessor-maintenance-and-direct-asset', async () => {
          await stop();
          await start('old-' + policy, origin + '/maintenance', false);
          // First source launch occurs with no debugger connection and policy already mounted.
          await new Promise((r) => setTimeout(r, 500));
          await browser.connect();
          const initial = JSON.parse(
            readFileSync(join(output, `baseline-old-${policy}.json`), 'utf8'),
          );
          const observed = await oldInventory();
          atomicJSON(join(output, `old-${policy}-cold-inventory.json`), observed);
          if (policy === 'deny')
            assert.deepEqual(observed, initial, 'cached-old-cold-preservation');
          for (const url of [origin + '/maintenance', origin + '/old-asset']) {
            const id = await page(browser, origin + '/inert');
            const { sessionId } = await browser.cdp.send('Target.attachToTarget', {
              targetId: id,
              flatten: true,
            });
            try {
              await browser.cdp.send('Network.enable', {}, sessionId);
              await browser.cdp.send(
                'Network.setBypassServiceWorker',
                { bypass: url.endsWith('/old-asset') },
                sessionId,
              );
              if (url.endsWith('/maintenance'))
                await browser.cdp.send(
                  'Network.emulateNetworkConditions',
                  { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
                  sessionId,
                );
              await browser.cdp.send('Page.navigate', { url }, sessionId);
              if (policy === 'allow') {
                await eventually('same predecessor positive editor', () =>
                  fixtureEval(browser, id, 'Boolean(document.querySelector(".goals .cm-content"))'),
                );
                await fixtureEval(
                  browser,
                  id,
                  'document.querySelector(".goals .cm-content").focus()',
                );
                const text = url.endsWith('/maintenance')
                  ? 'cached-positive-edit'
                  : 'direct-positive-edit';
                await browser.cdp.send('Input.insertText', { text }, sessionId);
                await eventually('actual predecessor native source write', async () =>
                  fixtureMaster(await oldInventory()).includes(text),
                );
              } else {
                await new Promise((r) => setTimeout(r, 500));
                assert.deepEqual(await inventory(), initial, 'old-executable-source-preserved');
              }
            } finally {
              await browser.cdp.send('Target.closeTarget', { targetId: id }).catch(() => {});
            }
          }
          await stop(true);
          browser = await launch(output, 'old-' + policy, origin + '/maintenance', false, {
            restore: true,
          });
          await new Promise((r) => setTimeout(r, 500));
          await browser.connect();
          const after = await oldInventory();
          atomicJSON(join(output, `old-${policy}-crash-restored-inventory.json`), after);
          if (policy === 'deny')
            assert.deepEqual(after, initial, 'old-maintenance-crash-restore-preserved');
          return { before: hash(initial), after: hash(after), denial: policy === 'deny' };
        });
    } else {
      assert.equal(policy, 'deny', 'generated-denial-only');
      const commands = [
        'page',
        'frame',
        'foreign',
        'srcdoc',
        'blank',
        'dedicated',
        'shared',
        'blob',
        'history',
      ];
      const coverage = Object.fromEntries(
        [...commands, 'controller-death', 'cold-restart'].map((c) => [c, 0]),
      );
      report.generated = {
        seed: 8941,
        runs: 20,
        coverage,
        endOnFailure: true,
        shrinking:
          'disabled: retain first failing stateful sequence without reusing its contaminated profile',
        histories: [],
      };
      const inputs = fc.sample(
        fc.array(fc.constantFrom(...commands), { minLength: 3, maxLength: 7 }),
        { seed: 8941, numRuns: 20 },
      );
      atomicJSON(join(output, 'generated-inputs.json'), inputs);
      await start();
      for (const [i, input] of inputs.entries())
        await attempt('generated-' + i, async () => {
          const history = { i, commands: input, before: await preserved(`g${i}-before`) };
          report.generated.histories.push(history);
          event('history-input', { i, input });
          for (const [j, command] of input.entries()) {
            const id = `g${i}-${j}`;
            coverage[command]++;
            const url =
              command === 'page'
                ? origin + '/probe?id=' + id
                : command === 'foreign'
                  ? other + '/embed?kind=frame&id=' + id
                  : ['frame', 'srcdoc', 'blank'].includes(command)
                    ? origin + '/embed?kind=' + command + '&id=' + id
                    : command === 'history'
                      ? origin + '/probe?id=' + id
                      : origin + '/spawn?kind=' + command + '&id=' + id;
            const targetId = await page(browser, url);
            if (command === 'history') {
              const { sessionId } = await browser.cdp.send('Target.attachToTarget', {
                targetId,
                flatten: true,
              });
              try {
                await browser.cdp.send('Page.reload', {}, sessionId);
              } finally {
                await browser.cdp.send('Target.detachFromTarget', { sessionId });
              }
            }
          }
          await controllerDeath(`g${i}-controller`);
          coverage['controller-death']++;
          await preserved(`g${i}-controller`);
          await crashRestart(`g${i}-cold`);
          coverage['cold-restart']++;
          history.after = await preserved(`g${i}-after`);
          // Only generated test pages are closed. No source cache/session file or carrier reset.
          for (const t of (await browser.cdp.send('Target.getTargets')).targetInfos.filter(
            (t) => t.type === 'page' && t.url.includes('id=g'),
          ))
            await browser.cdp.send('Target.closeTarget', { targetId: t.targetId });
        });
      for (const count of Object.values(coverage))
        assert.ok(count > 0, 'generated-command-coverage');
      assert.equal(coverage['controller-death'], 20);
      assert.equal(coverage['cold-restart'], 20);
    }
    report.passed = true;
  } catch (error) {
    report.error = error.stack;
    process.exitCode = 1;
  } finally {
    clearTimeout(totalTimer);
    clearInterval(heartbeat);
    await stop().catch((error) => {
      report.teardownError = error.stack;
      report.passed = false;
      process.exitCode = 1;
    });
    await server.close();
    report.ended = new Date().toISOString();
    report.hits = server.hits;
    atomicJSON(reportPath, report);
    console.log(JSON.stringify({ mode, policy, passed: report.passed, error: report.error }));
  }
}
