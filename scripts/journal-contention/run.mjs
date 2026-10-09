/** Frozen production path probes. Reproduced violations are distinct from harness errors and controls. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import * as fc from 'fast-check';

const argv = process.argv.slice(2);
const option = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
for (let i = 0; i < argv.length; i++)
  if (!['--output', '--runs', '--mutant', '--case'].includes(argv[i]) || !argv[++i])
    throw Error('Invalid arguments');
const mutants = {
  'skip-retry': {
    file: 'src/crdt/journalStore.ts',
    from: 'JOURNAL_SNAPSHOT_ATTEMPTS = 3',
    to: 'JOURNAL_SNAPSHOT_ATTEMPTS = 1',
    case: 'transient-workspace',
    assertion: 'transient-flush-completes',
  },
  'exceed-budget': {
    file: 'src/crdt/journalStore.ts',
    from: 'JOURNAL_SNAPSHOT_ATTEMPTS = 3',
    to: 'JOURNAL_SNAPSHOT_ATTEMPTS = 5',
    case: 'sustained-contention',
    assertion: 'contention-capture-budget',
  },
  'retry-storage-failure': {
    file: 'src/crdt/journalStore.ts',
    from: 'if (!isJournalChanged(cause)) throw cause;',
    to: "if (!isJournalChanged(cause) && cause.code === 'repair-required') throw cause;",
    case: 'fatal-after-churn',
    assertion: 'noncontention-error-not-retried',
  },
  'seal-before-capture': {
    file: 'src/crdt/custody.ts',
    from: 'snapshot ??= await owner.journal.readSnapshot(task, firstFailure);',
    to: "await owner.carrier.append(task, [{kind: 'update', bytes: new Uint8Array([0, 0])}]); snapshot ??= await owner.journal.readSnapshot(task, firstFailure);",
    case: 'sustained-contention',
    assertion: 'read-retries-do-not-seal',
  },
};
const mutantName = option('--mutant', null),
  mutation = mutantName ? mutants[mutantName] : null;
if (mutantName && !mutation) throw Error('Unknown mutant');
const selected = option('--case', null);
const runs = Number(option('--runs', '100'));
assert(Number.isSafeInteger(runs) && runs > 0);
const root = process.cwd(),
  output = resolve(option('--output', 'test-results/journal-contention/' + Date.now()));
assert(!existsSync(output), 'Refusing existing output');
const folder = join(output, 'snapshot');
mkdirSync(folder, { recursive: true });
const tree = (path) =>
  readdirSync(path, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tree(join(path, e.name)) : [join(path, e.name)],
  );
const paths = [
  ...tree('src'),
  'wasm/journal-seal/seal.generated.ts',
  'pnpm-lock.yaml',
  'package.json',
  ...[
    'test/content',
    'test/journal',
    'test/workspace-admission',
    'test/journal-contention',
  ].flatMap(tree),
  'scripts/journal-contention/run.mjs',
  'test/journalSnapshot.test.ts',
  'docs/journal-contention.md',
  'docs/journal-store.md',
  'docs/ordered-admission.md',
  'docs/owned-startup.md',
];
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const files = Object.fromEntries(paths.map((path) => [path, hash(path)]));
for (const path of paths) {
  mkdirSync(dirname(join(folder, path)), { recursive: true });
  writeFileSync(join(folder, path), readFileSync(path));
}
const testedFiles = { ...files };
if (mutation) {
  const path = join(folder, mutation.file),
    source = readFileSync(path, 'utf8');
  assert.equal(source.split(mutation.from).length, 2, 'Unique mutation anchor');
  writeFileSync(path, source.replace(mutation.from, mutation.to));
  testedFiles[mutation.file] = hash(path);
}
const aliases = {
  '@workspace': 'src/crdt/admittedWorkspace.ts',
  '@admission': 'src/crdt/admission.ts',
  '@styles': 'src/styles/index.css',
  '@editor': 'src/editor/admittedEditor.ts',
  '@channel': 'src/crdt/workspaceChannel.ts',
  '@document': 'src/crdt/admissionDocument.ts',
  '@yjs': 'src/crdt/yjs.ts',
  '@custody': 'src/crdt/custody.ts',
  '@custody-record': 'src/crdt/custodyRecord.ts',
  '@custody-crypto': 'src/crdt/custodyCrypto.ts',
  '@write-session': 'src/crdt/writeSession.ts',
  '@content-record': 'src/crdt/contentRecord.ts',
  '@journal-codec': 'src/crdt/journalCodec.ts',
  '@store-name': 'src/crdt/storeName.ts',
  '@startup': 'src/crdt/ownedStartup.ts',
};
const report = {
  schema: 1,
  scope: 'journal-contention-regression',
  mutation: mutation ? { id: mutantName, ...mutation } : null,
  testedFiles,
  started: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  files,
  node: process.version,
  browser: {},
  cases: [],
  limits: [
    'Native Chromium storage, factor custody, Web Locks, WASM and actual workspace admission; synthetic enrollment/receive authority.',
    'Cross-tab scheduling uses a CDP pause; generated churn uses reentrant peer no-op appends at enumeration. Neither estimates ordinary two-tab failure frequency.',
    'Retry cancellation extends only the native retry timer; no storage outcome or lifecycle guard is replaced. No generation transition, migration or OS/power-loss claim.',
  ],
};
const save = () =>
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let browser, server;
const call = (page, owner, method, ...args) =>
  page.evaluate(({ owner, method, args }) => window[owner][method](...args), {
    owner,
    method,
    args,
  });
const integration = (page, method, ...args) => call(page, 'integration', method, ...args);
const settled = async (page, id, owner = 'integration') => {
  await page.waitForFunction(
    ({ owner, id }) =>
      ['resolved', 'rejected'].includes(window[owner].snapshot().entries[id]?.status),
    { owner, id },
  );
  return page.evaluate(({ owner, id }) => window[owner].snapshot().entries[id], { owner, id });
};
const success = async (page, id, owner) => {
  const result = await settled(page, id, owner);
  assert.equal(result.status, 'resolved', JSON.stringify(result));
  return result.value;
};
const snapshot = (page) => integration(page, 'snapshot');
const durable = async (page, id = 'durable') => {
  await integration(page, 'durable', id);
  return settled(page, id);
};

try {
  server = await createServer({
    configFile: false,
    root: folder,
    logLevel: 'error',
    cacheDir: join(output, 'vite-cache'),
    resolve: {
      alias: Object.fromEntries(
        Object.entries(aliases).map(([key, value]) => [key, join(folder, value)]),
      ),
    },
    optimizeDeps: { noDiscovery: true },
    server: { host: '127.0.0.1', port: 5192, strictPort: true, fs: { allow: [root] } },
  });
  await server.listen();
  const origin = 'http://127.0.0.1:5192';
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? chromium.executablePath(),
    headless: true,
  });
  report.browser = { version: browser.version(), platform: process.platform, arch: process.arch };

  async function scenario(name, fn) {
    if ((mutation && mutation.case !== name) || (selected && selected !== name)) return;
    const context = await browser.newContext(),
      errors = [],
      row = { name, errors };
    report.cases.push(row);
    save();
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
    );
    const page = async () => {
      const p = await context.newPage();
      p.setDefaultTimeout(20000);
      p.on('pageerror', (e) => errors.push(e.message));
      await p.goto(origin + '/test/journal-contention/index.html');
      await p.waitForFunction(() => Boolean(window.contention));
      return p;
    };
    const a = await page();
    try {
      await fn({ context, page, a, row });
      assert.deepEqual(errors, [], 'Unexpected page errors');
      row.status = 'passed';
    } catch (error) {
      row.status = error.name === 'AssertionError' ? 'failed' : 'harness-error';
      row.error = { name: error.name, message: error.message, stack: error.stack };
      if (!mutation) process.exitCode = 1;
    } finally {
      await context.close();
      save();
      console.log(name + ': ' + row.status);
    }
  }
  const setup = async (a, connect = false) => {
    const code = await call(a, 'content', 'enroll');
    await call(a, 'content', 'initialize', 'init', code);
    await success(a, 'init', 'content');
    await integration(a, 'open', code, 'human-one', connect);
    await success(a, 'open');
    return code;
  };
  const extra = (a, method, ...args) => call(a, 'contention', method, ...args);
  const stats = (a) => extra(a, 'snapshot');
  const seedOnly = async (a) => {
    const code = await call(a, 'content', 'enroll');
    await call(a, 'content', 'initialize', 'init', code);
    await success(a, 'init', 'content');
    await extra(a, 'peer', code);
    return code;
  };
  await scenario('transient-workspace', async ({ a, row }) => {
    const code = await setup(a);
    await extra(a, 'peer', code);
    await a.evaluate(() => {
      window.integration.input('first', { kind: 'master' }, 'A');
      window.contention.arm(1);
      window.integration.durable('durable');
      window.integration.input('following', { kind: 'master' }, 'C');
    });
    row.barrier = await settled(a, 'durable');
    assert.equal(row.barrier.status, 'resolved', 'transient-flush-completes');
    await success(a, 'following');
    row.after = await snapshot(a);
    row.stats = await stats(a);
    assert.equal(row.after.status.state, 'active', 'transient-does-not-block');
    assert.equal(row.after.accepted.master, 'AC', 'following-input-promotes-without-retry');
    assert.equal(row.stats.attempts, 2, 'one-churn-two-captures');
  });
  for (const operation of ['append', 'cleanup'])
    await scenario('cross-tab-' + operation, async ({ context, page, a, row }) => {
      const code = await setup(a),
        b = await page();
      await integration(b, 'open', code, 'human-two');
      await success(b, 'open');
      const cdp = await context.newCDPSession(a);
      await cdp.send('Debugger.enable');
      const paused = new Promise((resolve) => cdp.once('Debugger.paused', resolve));
      const pending = a.evaluate(() => {
        window.integration.input('first', { kind: 'master' }, 'A');
        window.contention.arm(0, true);
        window.integration.durable('durable');
        window.integration.input('following', { kind: 'master' }, 'C');
      });
      await Promise.race([
        paused,
        new Promise((_, reject) => {
          const t = setTimeout(() => reject(Error('Missing CDP boundary')), 10000);
          t.unref();
        }),
      ]);
      if (operation === 'append') {
        await integration(b, 'input', 'peer', { kind: 'master' }, 'B');
        await success(b, 'peer');
      } else assert.equal((await durable(b)).status, 'resolved');
      await cdp.send('Debugger.resume');
      await pending;
      row.barrier = await settled(a, 'durable');
      assert.equal(row.barrier.status, 'resolved', 'cross-tab-capture-recovers');
      await success(a, 'following');
      row.after = await snapshot(a);
      row.stats = await stats(a);
      assert.equal(row.after.status.state, 'active');
      assert.equal(row.after.accepted.master, 'AC');
      assert.equal(row.stats.attempts, 2);
      await cdp.detach();
    });
  await scenario('sustained-contention', async ({ a, row }) => {
    const code = await setup(a);
    await extra(a, 'peer', code);
    const before = await stats(a);
    await a.evaluate(() => {
      window.integration.input('first', { kind: 'master' }, 'A');
      window.contention.arm(100);
      window.integration.durable('durable');
      window.integration.input('following', { kind: 'master' }, 'C');
    });
    row.barrier = await settled(a, 'durable');
    row.after = await snapshot(a);
    row.stats = await stats(a);
    assert.equal(row.barrier.error?.code, 'journal-busy', 'sustained-has-distinct-contention');
    assert.equal(row.stats.attempts, 3, 'contention-capture-budget');
    assert.equal(row.stats.encryptions, before.encryptions, 'read-retries-do-not-seal');
    assert.equal(Object.keys(row.stats.journal).length, 4, 'busy-retains-all-journalled-input');
    assert.equal(row.after.entries.following.status, 'pending');
    assert.equal(row.after.status.pressure.code, 'journal-busy');
    await a.waitForTimeout(750);
    assert.equal((await stats(a)).attempts, 3, 'no-unbounded-retry-loop');
    await extra(a, 'disarm');
    await integration(a, 'retry');
    await success(a, 'following');
    assert.equal((await durable(a, 'explicit-retry')).status, 'resolved');
    row.afterRetry = await snapshot(a);
    assert.equal(row.afterRetry.accepted.master, 'AC');
  });
  for (const changes of [1, 100])
    await scenario('startup-' + (changes === 1 ? 'transient' : 'busy'), async ({ a, row }) => {
      const code = await seedOnly(a);
      await extra(a, 'arm', changes);
      await extra(a, 'open', 'probe', code);
      row.result = await settled(a, 'probe', 'contention');
      row.stats = await stats(a);
      if (changes === 1) {
        assert.equal(row.result.status, 'resolved', 'startup-retries-churn');
        assert.equal(row.stats.attempts, 2);
      } else {
        assert.equal(row.result.error?.code, 'journal-busy');
        assert.deepEqual(row.result.error.disposition, {
          kind: 'busy',
          reason: 'journal-read-contention',
        });
        assert.equal(row.stats.attempts, 3);
      }
    });
  for (const operation of ['flush', 'open'])
    await scenario('cancel-retry-' + operation, async ({ page, a, row }) => {
      const code = await seedOnly(a);
      await extra(a, 'append');
      const before = await stats(a);
      await extra(a, 'arm', 1, false, true);
      if (operation === 'flush') await extra(a, 'flush', 'pending');
      else await extra(a, 'open', 'pending', code);
      await a.waitForFunction(() => window.contention.snapshot().held === 1);
      row.waiting = await stats(a);
      assert.equal(row.waiting.attempts, 1);
      if (operation === 'flush') await extra(a, 'closePeer');
      else await extra(a, 'cancelOpen');
      row.result = await settled(a, 'pending', 'contention');
      assert.equal(row.result.status, 'rejected', 'cancelled-read-refuses');
      assert(['inactive', 'AbortError', 'cancelled'].includes(row.result.error.code));
      row.after = await stats(a);
      assert.equal(row.after.held, 0, 'cancel-removes-retry-timer');
      assert.equal(row.after.attempts, 1, 'cancel-prevents-another-capture');
      assert.equal(row.after.encryptions, before.encryptions, 'cancel-prevents-sealing');
      await extra(a, 'closeAll');
      const b = await page();
      await call(b, 'content', 'exclusive', 'exclusive');
      await success(b, 'exclusive', 'content');
      row.exclusiveGranted = true;
      assert(
        (await call(a, 'journal', 'snapshot')).memories.every((memory) => memory.zero),
        'cancel-clears-key-caches',
      );
    });
  await scenario('fatal-after-churn', async ({ a, row }) => {
    await seedOnly(a);
    await extra(a, 'append');
    const before = await stats(a);
    await extra(a, 'arm', 1, false, false, true);
    await extra(a, 'flush', 'fatal');
    row.result = await settled(a, 'fatal', 'contention');
    row.stats = await stats(a);
    assert.equal(row.result.error?.code, 'unavailable', 'noncontention-error-not-retried');
    assert.equal(row.stats.attempts, 2);
    assert.equal(row.stats.encryptions, before.encryptions);
    assert.equal(Object.keys(row.stats.journal).length, 2);
  });
  await scenario('corruption-is-not-contention', async ({ a, row }) => {
    await seedOnly(a);
    await extra(a, 'append');
    await call(a, 'journal', 'tamper', 'legacy');
    const before = await stats(a);
    await extra(a, 'arm', 0);
    await extra(a, 'flush', 'fatal');
    row.result = await settled(a, 'fatal', 'contention');
    row.stats = await stats(a);
    assert.equal(row.result.error?.code, 'repair-required');
    assert.equal(row.stats.attempts, 1);
    assert.deepEqual(row.stats.journal, before.journal);
    assert.equal(row.stats.encryptions, before.encryptions);
  });
  await scenario('content-abort-is-not-retried', async ({ a, row }) => {
    await seedOnly(a);
    await extra(a, 'append');
    const before = await stats(a);
    await extra(a, 'arm', 1);
    await call(a, 'content', 'fault', 'abort-content');
    await extra(a, 'flush', 'aborted');
    row.result = await settled(a, 'aborted', 'contention');
    row.stats = await stats(a);
    assert.equal(row.result.status, 'rejected', 'content-abort-still-refuses');
    assert.equal(row.stats.attempts, 2, 'no-new-capture-after-content-start');
    assert.equal(row.stats.encryptions - before.encryptions, 2, 'each-abandoned-seal-counted-once');
    assert.equal(Object.keys(row.stats.journal).length, 2, 'failed-content-retains-both-inputs');
    const disk = await call(a, 'content', 'inventory');
    assert.equal(disk.content.length, 0, 'aborted-records-not-published');
  });
  await scenario('generated-read-histories', async ({ a, row }) => {
    await seedOnly(a);
    row.histories = [];
    let expected = 0;
    const details = await fc.check(
      fc.asyncProperty(
        fc.record({
          changes: fc.integer({ min: 0, max: 6 }),
          operation: fc.constantFrom('flush', 'recover'),
        }),
        async (history) => {
          await extra(a, 'append');
          const before = await stats(a);
          await extra(a, 'arm', history.changes);
          await extra(a, history.operation, 'generated');
          const result = await settled(a, 'generated', 'contention'),
            after = await stats(a);
          row.histories.push({
            history,
            result,
            attempts: after.attempts,
            sealDelta: after.encryptions - before.encryptions,
          });
          assert.equal(after.attempts, Math.min(history.changes + 1, 3), 'generated-read-bound');
          if (history.changes < 3)
            assert.equal(result.status, 'resolved', 'generated-transient-recovers');
          else assert.equal(result.error?.code, 'journal-busy', 'generated-sustained-refuses');
          assert.equal(
            after.encryptions - before.encryptions,
            history.operation === 'flush' && history.changes < 3 ? history.changes + 1 : 0,
            'generated-read-seal-accounting',
          );
          if (history.operation === 'recover' && history.changes < 3) {
            assert.equal(result.value.journal.length, history.changes + 1);
            assert(result.value.journal.every((entry) => JSON.stringify(entry.bytes) === '[0,0]'));
          }
          expected += 1 + Math.min(history.changes, 3);
          await extra(a, 'disarm');
          await extra(a, 'flush', 'cleanup');
          await success(a, 'cleanup', 'contention');
        },
      ),
      { seed: 8941, numRuns: runs, endOnFailure: true },
    );
    row.properties = {
      seed: details.seed,
      runs: details.numRuns,
      failed: details.failed,
      path: details.counterexamplePath,
      history: details.counterexample?.[0],
    };
    if (details.failed) {
      writeFileSync(
        join(output, 'counterexample.json'),
        JSON.stringify(row.properties, null, 2) + '\n',
      );
      throw details.errorInstance;
    }
    await extra(a, 'recover', 'final');
    const recovered = await success(a, 'final', 'contention');
    assert.equal(recovered.records.length, expected, 'all-original-records-recover');
    assert(recovered.records.every((entry) => JSON.stringify(entry.bytes) === '[0,0]'));
    assert.equal(recovered.journal.length, 0);
    row.recoveredOriginals = expected;
  });
  for (const path of paths) {
    assert.equal(hash(path), files[path], 'Input changed: ' + path);
    assert.equal(hash(join(folder, path)), testedFiles[path]);
  }
  assert(report.cases.length > 0, 'At least one requested case must execute');
  if (mutation) {
    const failed = report.cases[0];
    const detected =
      failed.status === 'failed' && failed.error?.message.includes(mutation.assertion);
    report.status = detected ? 'detected' : 'mutation-not-detected';
    if (!detected) process.exitCode = 1;
  } else report.status = report.cases.some((c) => c.status !== 'passed') ? 'failed' : 'passed';
} catch (error) {
  report.status = 'harness-error';
  report.error = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
  report.finished = new Date().toISOString();
  save();
}
