/** Frozen native regression for runtime pending-state forks and publication consistency. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import * as fc from 'fast-check';
import { makeSource, corpusEdits, orderedByKeys } from '../core-reproductions/source.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
for (let i = 0; i < argv.length; i++)
  if (!['--output', '--runs', '--mutant', '--case', '--replay'].includes(argv[i]) || !argv[++i])
    throw Error('Invalid arguments');
const mutants = {
  'missed-wakeup': {
    file: 'runtime/yjs.mjs',
    from: '          // Retain this wake-up even when the available reader starts after the dependency.\n          updateMissingSv(/** @type {number} */ (missing), getState(store, missing));\n          if (structRefs.refs.length === structRefs.i) {',
    to: '          if (structRefs.refs.length === structRefs.i) {\n            updateMissingSv(/** @type {number} */ (missing), getState(store, missing));',
    case: 'saved-original-order',
    assertion: 'original-records-complete',
  },
  'park-ready-wakeup': {
    file: 'runtime/yjs.mjs',
    from: '    // Drain wake-ups satisfied later in this pass, including a newly parked pending union.\n    if (store.pendingStructs) {',
    to: '    // Mutant: only a previously pending union can trigger a retry.\n    if (pending && store.pendingStructs) {',
    case: 'saved-ready-wakeup',
    assertion: 'delivery-ticket-accepted',
  },
  'drop-snapshot-pending': {
    file: 'src/crdt/yjs.ts',
    from: 'export const encodeState = (doc: YDoc): Uint8Array => Y.encodeStateAsUpdate(doc);',
    to: 'export const encodeState = (doc: YDoc): Uint8Array => encodeIntegratedState(doc);',
    case: 'pending-channel-initial',
    assertion: 'pending-structs-reach-joiner',
  },
  'drop-snapshot-deletions': {
    file: 'src/crdt/yjs.ts',
    from: 'export const encodeState = (doc: YDoc): Uint8Array => Y.encodeStateAsUpdate(doc);',
    to: 'export const encodeState = (doc: YDoc): Uint8Array => Y.encodeStateAsUpdate({...doc,store:{...doc.store,pendingDs:null}} as YDoc);',
    case: 'pending-deletion-channel',
    assertion: 'pending-deletions-reach-joiner',
  },
  'skip-hello-snapshot': {
    file: 'src/crdt/workspaceChannel.ts',
    from: 'send(bytes);',
    to: '/* omit hello response */',
    case: 'pending-channel-hello',
    assertion: 'hello-snapshot-received',
  },
};
const mutantName = option('--mutant', null),
  mutation = mutantName ? mutants[mutantName] : null;
if (mutantName && !mutation) throw Error('Unknown mutant');
const selected = option('--case', null);
const replayPath = option('--replay', null);
const replayHistory = replayPath ? JSON.parse(readFileSync(replayPath, 'utf8')).history : null;
if (replayPath)
  assert(
    replayHistory && Array.isArray(replayHistory.edits) && Array.isArray(replayHistory.keys),
    'Invalid replay history',
  );
const runs = replayHistory ? 1 : Number(option('--runs', '100'));
assert(Number.isSafeInteger(runs) && runs > 0);
const root = process.cwd(),
  output = resolve(option('--output', 'test-results/yjs-delivery/native-' + Date.now()));
assert(!existsSync(output), 'Refusing existing output');
const folder = join(output, 'snapshot');
mkdirSync(folder, { recursive: true });
const tree = (path) =>
  readdirSync(path, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tree(join(path, e.name)) : [join(path, e.name)],
  );
const paths = [
  ...tree('src'),
  ...tree('account-protocol'),
  'pnpm-workspace.yaml',
  'scripts/check-yjs-patch.mjs',
  'vendor-patches/yjs-13.6.31.json',
  'vendor-patches/yjs@13.6.31.patch',
  'wasm/journal-seal/seal.generated.ts',
  'pnpm-lock.yaml',
  'package.json',
  ...['test/content', 'test/journal', 'test/workspace-admission', 'test/yjs-delivery'].flatMap(
    tree,
  ),
  'scripts/yjs-delivery/run.mjs',
  'scripts/core-reproductions/source.mjs',
  'test/yjsDelivery.test.ts',
  'test/core-reproductions/original-order.json',
  'docs/yjs-delivery.md',
  'docs/workspace-admission.md',
  'docs/editor-admission.md',
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
mkdirSync(join(folder, 'runtime'), { recursive: true });
writeFileSync(join(folder, 'runtime/yjs.mjs'), readFileSync('node_modules/yjs/dist/yjs.mjs'));
const testedFiles = { ...files, 'runtime/yjs.mjs': hash(join(folder, 'runtime/yjs.mjs')) };
if (mutation) {
  const path = join(folder, mutation.file),
    source = readFileSync(path, 'utf8');
  assert.equal(source.split(mutation.from).length, 2, 'Unique mutation anchor');
  writeFileSync(path, source.replace(mutation.from, mutation.to));
  testedFiles[mutation.file] = hash(path);
}
const aliases = {
  yjs: 'runtime/yjs.mjs',
  '@workspace': 'src/crdt/admittedWorkspace.ts',
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
  '@admission': 'src/crdt/admission.ts',
  '@text': 'src/editor/admittedText.ts',
};
const report = {
  schema: 1,
  scope: 'yjs-delivery-regression',
  mutation: mutation ? { id: mutantName, ...mutation } : null,
  testedFiles,
  started: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  files,
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  node: process.version,
  dependencies: Object.fromEntries(
    [
      'node_modules/yjs/package.json',
      'node_modules/yjs/dist/yjs.mjs',
      'node_modules/yjs/dist/yjs.cjs',
      'node_modules/yjs/src/utils/encoding.js',
      'node_modules/yjs/src/utils/StructStore.js',
    ].map((path) => [path, hash(path)]),
  ),
  browser: {},
  cases: [],
  limits: [
    'Native Chromium custody/storage/admission/channel with synthetic enrollment and receive authority.',
    'Generated source authors synchronize between edits; concurrent structural sources are covered by the separate Node campaign.',
    'One renderer death; no migration, OS/power-loss, platform or performance acceptance.',
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
const integration = (page, method, ...args) => call(page, 'delivery', method, ...args);
const settled = async (page, id, owner = 'delivery') => {
  await page.waitForFunction(
    ({ owner, id }) =>
      ['resolved', 'rejected'].includes(window[owner].snapshot().entries[id]?.status),
    { owner, id },
  );
  return page.evaluate(({ owner, id }) => window[owner].snapshot().entries[id], { owner, id });
};
const success = async (page, id, owner) => {
  const result = await settled(page, id, owner);
  assert.equal(
    result.status,
    'resolved',
    'delivery-ticket-accepted: ' +
      JSON.stringify({
        result,
        state: owner === 'content' ? null : await call(page, 'delivery', 'snapshot'),
      }),
  );
  return result.value;
};
const snapshot = (page) => integration(page, 'snapshot');

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
    server: { host: '127.0.0.1', port: 5194, strictPort: true, fs: { allow: [root] } },
  });
  await server.listen();
  const origin = 'http://127.0.0.1:5194';
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
      await p.goto(origin + '/test/yjs-delivery/index.html?preparation=local-snapshots');
      await p.waitForFunction(() => Boolean(window.delivery));
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
  const probe = (a, method, ...args) => call(a, 'delivery', method, ...args);
  const source = makeSource(corpusEdits),
    prefix = [3, 1, 5],
    suffix = [0, 2, 4, 6];
  const seedBase = async (a) => {
    const code = await call(a, 'content', 'enroll');
    await call(a, 'content', 'initialize', 'init', code);
    await success(a, 'init', 'content');
    return code;
  };
  const open = async (a, code, actor = 'human') => {
    await probe(a, 'open', code, actor);
    await success(a, 'open');
  };
  const receive = async (a, source, ids) => {
    for (const id of ids) {
      await probe(a, 'receive', 'r' + id, source.updates[id]);
      await success(a, 'r' + id);
    }
  };
  const assertContent = (s, expected, label) => {
    assert.deepEqual(s.canonical.text, expected, label);
    assert.equal(s.canonical.pendingStructs, false, label + '-no-pending-structs');
    assert.equal(s.canonical.pendingDs, false, label + '-no-pending-deletions');
    assert.equal(s.read.master, expected[0], label + '-workspace');
    assert.equal(s.editor, expected[0], label + '-editor');
    assert.equal(
      s.exported.find((e) => e.path === 'master.md')?.content,
      expected[0],
      label + '-export',
    );
    assert.deepEqual(s.errors, [], label + '-channel-errors');
  };
  const handshake = async (a, b, first = 'receiver') => {
    if (first === 'receiver') {
      await probe(b, 'connect');
      await probe(a, 'connect');
    } else {
      await probe(a, 'connect');
      await probe(b, 'connect');
    }
    // A regular local update is a FIFO sentinel on the same sender's BroadcastChannel.
    // Waiting for its acceptance proves all preceding snapshot messages have been processed.
    await (first === 'receiver' ? b : a).waitForFunction(
      () => window.delivery.snapshot().hellos >= 1,
    );
    await probe(a, 'command', 'sentinel', { kind: 'settings', rolloverHour: 2 });
    await success(a, 'sentinel');
    await b.waitForFunction(() => window.delivery.snapshot().read.settings.rolloverHour === 2);
    await probe(b, 'durable', 'sentinel-durable');
    await success(b, 'sentinel-durable');
  };
  await scenario('saved-original-order', async ({ a, row }) => {
    const code = await seedBase(a);
    await open(a, code);
    const c = JSON.parse(
      readFileSync('test/core-reproductions/original-order.json', 'utf8'),
    ).outcome;
    await receive(a, c.source, c.order);
    row.after = await snapshot(a);
    assertContent(row.after, c.source.expected, 'original-records-complete');
    await probe(a, 'close');
    await success(a, 'close');
    await open(a, code);
    row.reopened = await snapshot(a);
    assertContent(row.reopened, c.source.expected, 'original-reopen');
  });
  for (const mode of ['initial', 'hello', 'deletion'])
    await scenario(
      mode === 'deletion' ? 'pending-deletion-channel' : `pending-channel-${mode}`,
      async ({ a, page, row }) => {
        const code = await seedBase(a);
        await open(a, code, 'donor');
        const b = await page();
        await open(b, code, 'receiver');
        const s =
          mode === 'deletion'
            ? makeSource([{ lane: 0, actor: 1, at: 1, text: '', remove: 2 }])
            : source;
        const p = mode === 'deletion' ? [3] : prefix,
          tail = mode === 'deletion' ? [0, 1, 2] : suffix;
        await receive(a, s, p);
        row.donor = await snapshot(a);
        await probe(b, 'input', 'local', '⟦local⟧');
        await success(b, 'local');
        await handshake(a, b, mode === 'hello' ? 'donor' : 'receiver');
        row.joined = await snapshot(b);
        assert(
          row.joined.received >= 2,
          mode === 'hello' ? 'hello-snapshot-received' : 'initial-snapshot-received',
        );
        if (mode === 'deletion')
          assert.equal(row.joined.canonical.pendingDs, true, 'pending-deletions-reach-joiner');
        else
          assert.equal(row.joined.canonical.pendingStructs, true, 'pending-structs-reach-joiner');
        await probe(a, 'close');
        await success(a, 'close');
        await a.close();
        await receive(b, s, tail);
        row.after = await snapshot(b);
        const master = row.after.read.master;
        assert(master.includes('⟦local⟧'), 'receiver-local-survives');
        assert.equal(master.replace('⟦local⟧', ''), s.expected[0], 'handoff-basis-text');
        assertContent(row.after, [master, ...s.expected.slice(1)], 'handoff-basis');
        await probe(b, 'command', 'undo', { kind: 'undo' });
        await success(b, 'undo');
        assertContent(await snapshot(b), s.expected, 'handoff-human-undo');
      },
    );
  await scenario('snapshot-only-recovery-death', async ({ a, row }) => {
    const code = await seedBase(a);
    await open(a, code, 'donor');
    await receive(a, source, prefix);
    const wire = await probe(a, 'wire');
    row.wireHash = createHash('sha256').update(Uint8Array.from(wire)).digest('hex');
    // Fresh browser context: it cannot recover original prefix records from the donor's shared disk.
    const isolated = await browser.newContext(),
      isolatedErrors = [];
    isolated.on('page', (p) => p.on('pageerror', (e) => isolatedErrors.push(e.message)));
    try {
      const b = await isolated.newPage();
      await b.goto(origin + '/test/yjs-delivery/index.html?preparation=local-snapshots');
      await b.waitForFunction(() => Boolean(window.delivery));
      const code2 = await seedBase(b);
      await open(b, code2, 'receiver');
      await probe(b, 'receive', 'handoff', wire);
      await success(b, 'handoff');
      await probe(b, 'command', 'local', { kind: 'settings', rolloverHour: 7 });
      await success(b, 'local');
      row.beforeDeath = await snapshot(b);
      const cdp = await isolated.newCDPSession(b),
        died = b.waitForEvent('crash');
      void cdp.send('Page.crash').catch(() => {});
      await died;
      await b.close();
      row.rendererDeaths = 1;
      const c = await isolated.newPage();
      await c.goto(origin + '/test/yjs-delivery/index.html?preparation=local-snapshots');
      await c.waitForFunction(() => Boolean(window.delivery));
      await probe(c, 'recover', code2);
      const recovered = await success(c, 'recover');
      assert(
        recovered.records.some((u) => JSON.stringify(u) === JSON.stringify(wire)),
        'exact-handoff-record-survives',
      );
      for (const id of prefix)
        assert(
          !recovered.records.some((u) => JSON.stringify(u) === JSON.stringify(source.updates[id])),
          'no-donor-original-recovery',
        );
      row.recovery = {
        text: recovered.text,
        pendingStructs: recovered.pendingStructs,
        records: recovered.records.length,
        journal: recovered.journal.length,
      };
      await open(c, code2, 'receiver');
      assert.equal((await snapshot(c)).read.settings.rolloverHour, 7, 'journalled-local-survives');
      await receive(c, source, suffix);
      row.after = await snapshot(c);
      assertContent(row.after, source.expected, 'snapshot-only-basis');
      assert.deepEqual(isolatedErrors, [], 'isolated-page-errors');
    } finally {
      await isolated.close();
    }
  });
  await scenario('snapshot-pressure-retry', async ({ a, row }) => {
    const code = await seedBase(a);
    await open(a, code);
    const d = await import('yjs');
    const donor = new d.Doc();
    for (const id of prefix) d.applyUpdate(donor, Uint8Array.from(source.updates[id]));
    const wire = [...d.encodeStateAsUpdate(donor)];
    donor.destroy();
    await call(a, 'content', 'fault', 'gate-sealed');
    await probe(a, 'receive', 'handoff', wire);
    await a.waitForFunction(() => window.content.snapshot().gates.includes('sealed'));
    await probe(a, 'input', 'local', 'private');
    row.pressured = await snapshot(a);
    assert.equal(row.pressured.read.master, '', 'pending-snapshot-unpublished');
    assert.equal(row.pressured.entries.local.status, 'pending');
    await call(a, 'content', 'fault', 'abort-content');
    await call(a, 'content', 'release', 'sealed');
    await a.waitForFunction(() => window.delivery.snapshot().status.state === 'blocked');
    assert.equal((await snapshot(a)).read.master, '', 'aborted-snapshot-unpublished');
    await probe(a, 'retry');
    await success(a, 'handoff');
    await success(a, 'local');
    await receive(a, source, suffix);
    row.after = await snapshot(a);
    assert.equal(
      row.after.read.master.replace('private', ''),
      source.expected[0],
      'retry-preserves-basis',
    );
    assertContent(row.after, [row.after.read.master, ...source.expected.slice(1)], 'retry-views');
  });
  const generated = async ({ row }, savedHistory = replayHistory) => {
    const arbitrary = fc.record({
      edits: fc.array(
        fc.record({
          lane: fc.nat(2),
          actor: fc.nat(2),
          at: fc.nat(30),
          remove: fc.nat(8),
          text: fc
            .array(fc.constantFrom('a', 'b', ' ', '\n', 'é'), { maxLength: 4 })
            .map((x) => x.join('')),
        }),
        { minLength: 1, maxLength: 10 },
      ),
      keys: fc.array(fc.nat(10000), { minLength: 20, maxLength: 20 }),
      split: fc.nat(20),
      early: fc.nat(20),
    });
    row.histories = [];
    const details = await fc.check(
      fc.asyncProperty(savedHistory ? fc.constant(savedHistory) : arbitrary, async (history) => {
        const context = await browser.newContext(),
          generatedErrors = [];
        context.on('page', (p) => p.on('pageerror', (e) => generatedErrors.push(e.message)));
        try {
          const pages = await Promise.all([context.newPage(), context.newPage()]);
          for (const p of pages) {
            p.setDefaultTimeout(20000);
            await p.goto(origin + '/test/yjs-delivery/index.html?preparation=local-snapshots');
            await p.waitForFunction(() => Boolean(window.delivery));
          }
          const [a, b] = pages,
            code = await seedBase(a);
          await open(a, code, 'donor');
          await open(b, code, 'receiver');
          const s = makeSource(history.edits),
            order = orderedByKeys(s.updates.length, history.keys),
            split = history.split % (order.length + 1),
            early = history.early % (order.length - split + 1);
          await receive(a, s, order.slice(0, split));
          await receive(b, s, order.slice(split, split + early));
          await probe(b, 'input', 'local', '⟦local⟧');
          await success(b, 'local');
          await handshake(a, b);
          const joined = await snapshot(b);
          await probe(a, 'close');
          await success(a, 'close');
          await a.close();
          await receive(b, s, order.slice(split + early));
          const after = await snapshot(b),
            master = after.read.master;
          assert(master.includes('⟦local⟧'), 'generated-local-survives');
          assert.equal(master.replace('⟦local⟧', ''), s.expected[0], 'generated-original-ledger');
          assertContent(after, [master, ...s.expected.slice(1)], 'generated-views');
          await probe(b, 'command', 'undo', { kind: 'undo' });
          await success(b, 'undo');
          assertContent(await snapshot(b), s.expected, 'generated-human-undo');
          assert.deepEqual(generatedErrors, [], 'generated-page-errors');
          row.histories.push({
            history,
            order,
            split,
            early,
            pendingAtJoin: joined.canonical.pendingStructs,
            pendingDeletionAtJoin: joined.canonical.pendingDs,
            expected: s.expected,
            actual: after.canonical.text,
          });
          if (row.histories.length % 10 === 0)
            console.log('generated handoffs:', row.histories.length);
        } finally {
          await context.close();
        }
      }),
      { seed: 8941, numRuns: savedHistory ? 1 : runs, endOnFailure: true },
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
  };
  await scenario('saved-ready-wakeup', (data) =>
    generated(
      data,
      JSON.parse(readFileSync('test/yjs-delivery/ready-wakeup.json', 'utf8')).history,
    ),
  );
  await scenario('generated-channel-handoffs', (data) => generated(data));
  for (const path of paths) {
    assert.equal(hash(path), files[path], 'Input changed: ' + path);
    assert.equal(hash(join(folder, path)), testedFiles[path]);
  }
  for (const [path, expected] of Object.entries(report.dependencies))
    assert.equal(hash(path), expected, 'Dependency changed: ' + path);
  assert(report.cases.length > 0, 'At least one requested case must execute');
  assert.equal(hash(join(folder, 'runtime/yjs.mjs')), testedFiles['runtime/yjs.mjs']);
  if (mutation) {
    const failed = report.cases[0],
      detected = failed.status === 'failed' && failed.error?.message.includes(mutation.assertion);
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
