/** Frozen native regression for runtime pending-state forks and publication consistency. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import * as fc from 'fast-check';
import {
  makeSource,
  corpusEdits,
  replay,
  complete,
  orderedByKeys,
} from '../core-reproductions/source.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
for (let i = 0; i < argv.length; i++)
  if (!['--output', '--runs', '--mutant', '--case', '--replay'].includes(argv[i]) || !argv[++i])
    throw Error('Invalid arguments');
const mutants = {
  'drop-pending-structs': {
    file: 'src/crdt/yjs.ts',
    from: 'const pending = source.store.pendingStructs;',
    to: 'const pending = null;',
    case: 'saved-forks',
    assertion: 'pending-forks-exact',
  },
  'drop-pending-deletions': {
    file: 'src/crdt/yjs.ts',
    from: 'doc.store.pendingDs = source.store.pendingDs?.slice() ?? null;',
    to: 'doc.store.pendingDs = null;',
    case: 'pending-deletion-forks',
    assertion: 'pending-deletions-exact',
  },
  'serialize-startup': {
    file: 'src/crdt/admittedWorkspace.ts',
    from: 'const doc = session.fork();',
    to: 'const doc = new Y.Doc({gc:false}); Y.applyUpdate(doc,session.snapshot());',
    case: 'pending-workspace-startup',
    assertion: 'pending-workspace-startup-completes',
  },
  'skip-workspace-check': {
    file: 'src/crdt/admittedWorkspace.ts',
    from: 'if (!session.matches(accepted!.history.doc))',
    to: 'if (false)',
    case: 'workspace-projection-drift',
    assertion: 'workspace-drift-blocks-read',
  },
  'skip-text-check': {
    file: 'src/editor/admittedText.ts',
    from: 'if (!session.matches(projection))',
    to: 'if (false)',
    case: 'text-projection-drift',
    assertion: 'text-drift-blocks-read',
  },
  'ignore-integrated-content': {
    file: 'src/crdt/yjs.ts',
    from: 'return equalBytes(aa, bb);',
    to: 'return true;',
    case: 'equal-clock-content-check',
    assertion: 'equal-clocks-do-not-prove-content',
  },
  'erase-projection-cause': {
    file: 'src/crdt/admittedWorkspace.ts',
    from: 'throw failure ?? error;',
    to: 'throw error;',
    case: 'initialization-projection-drift',
    assertion: 'initialization-preserves-projection-cause',
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
  output = resolve(option('--output', 'test-results/pending-projection/' + Date.now()));
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
    'test/pending-projection',
  ].flatMap(tree),
  'scripts/pending-projection/run.mjs',
  'scripts/core-reproductions/source.mjs',
  'test/pendingProjection.test.ts',
  'docs/pending-projection.md',
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
  scope: 'pending-projection-regression',
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
      'node_modules/yjs/src/utils/encoding.js',
      'node_modules/yjs/src/utils/StructStore.js',
    ].map((path) => [path, hash(path)]),
  ),
  browser: {},
  cases: [],
  limits: [
    'Native Chromium storage, factor custody, Web Locks, WASM and actual workspace admission; synthetic enrollment/receive authority.',
    'Generated remote records retain original framing and use a separate source-string oracle. Arbitrary original delivery can itself strand in pinned Yjs; receiver/fork equivalence is distinguished from complete semantic recovery.',
    'A controlled projection-event omission tests refusal sensitivity; persistence/authority are not replaced. One actual renderer death is tested. No generation transition, migration, new wire format or OS/power-loss claim.',
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
    server: { host: '127.0.0.1', port: 5193, strictPort: true, fs: { allow: [root] } },
  });
  await server.listen();
  const origin = 'http://127.0.0.1:5193';
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
      await p.goto(origin + '/test/pending-projection/index.html');
      await p.waitForFunction(() => Boolean(window.projection));
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
  const probe = (a, method, ...args) => call(a, 'projection', method, ...args);
  const seedBase = async (a) => {
    const code = await call(a, 'content', 'enroll');
    await call(a, 'content', 'initialize', 'init', code);
    await success(a, 'init', 'content');
    return code;
  };
  const setup = async (a) => {
    const code = await seedBase(a);
    await integration(a, 'open', code);
    await success(a, 'open');
    return code;
  };
  const receive = async (a, source, ids, owner = 'integration') => {
    for (const id of ids) {
      await call(a, owner, 'receive', 'r' + id, source.updates[id]);
      await success(a, 'r' + id, owner);
    }
  };
  const source = makeSource(corpusEdits),
    prefix = [3, 1, 5],
    suffix = [0, 2, 4, 6];
  const masterExport = (state) => state.exported.find((e) => e.path === 'master.md')?.content;
  const assertMaster = (state, expected, label) => {
    assert.equal(state.accepted.master, expected, label + '-workspace');
    assert.equal(state.views.goals.text, expected, label + '-editor');
    assert.equal(masterExport(state), expected, label + '-export');
  };
  await scenario('saved-forks', async ({ a, row }) => {
    row.result = await probe(a, 'forks', source, prefix, suffix);
    assert.deepEqual(row.result.before, [true, true], 'pending-forks-exact');
    for (const result of row.result.after) {
      assert.deepEqual(result.text, source.expected, 'original-basis-recovers');
      assert.equal(result.pendingStructs, false);
      assert.equal(result.pendingDs, false);
    }
  });
  await scenario('pending-deletion-forks', async ({ a, row }) => {
    const ds = makeSource([{ lane: 0, actor: 1, at: 1, text: '', remove: 2 }]);
    row.result = await probe(a, 'forks', ds, [3], [0, 1, 2]);
    assert.deepEqual(row.result.before, [true, true], 'pending-deletions-exact');
    for (const result of row.result.after)
      assert.deepEqual(result.text, ds.expected, 'deletion-basis-recovers');
  });
  await scenario('equal-clock-content-check', async ({ a, row }) => {
    row.result = await probe(a, 'compareContent');
    assert.equal(row.result.vectorsEqual, true);
    assert.equal(row.result.same, false, 'equal-clocks-do-not-prove-content');
  });
  for (const kind of ['workspace', 'text'])
    await scenario(`pending-${kind}-startup`, async ({ a, row }) => {
      const code = await seedBase(a);
      await probe(
        a,
        'seed',
        code,
        prefix.map((id) => source.updates[id]),
      );
      await success(a, 'seed', 'projection');
      await probe(a, 'open', code, kind);
      row.open = await settled(a, 'open', 'projection');
      assert.equal(row.open.status, 'resolved', `pending-${kind}-startup-completes`);
      row.before = await probe(a, 'snapshot');
      assert.equal(row.before.canonical.pendingStructs, true);
      await receive(a, source, suffix, 'projection');
      row.after = await probe(a, 'snapshot');
      assert.equal(
        kind === 'workspace' ? row.after.read.master : row.after.read.text,
        source.expected[0],
      );
      assert.equal(row.after.editor.text, source.expected[0]);
      assert.deepEqual(row.after.canonical.text, source.expected);
      assert.equal(row.after.canonical.pendingStructs, false);
      await probe(a, 'close');
      await success(a, 'close', 'projection');
    });
  await scenario('later-basis-workspace', async ({ a, row }) => {
    await setup(a);
    await receive(a, source, prefix);
    await integration(a, 'command', 'local', { kind: 'settings', rolloverHour: 9 });
    await success(a, 'local');
    await integration(a, 'input', 'human', { kind: 'master' }, '⟦local⟧', 0);
    await success(a, 'human');
    row.before = await snapshot(a);
    await receive(a, source, suffix);
    row.after = await snapshot(a);
    assert.equal(
      row.after.accepted.master.replace('⟦local⟧', ''),
      source.expected[0],
      'local-input-preserves-later-remote-basis',
    );
    assert(row.after.accepted.master.includes('⟦local⟧'), 'local-input-survives-later-basis');
    assertMaster(row.after, row.after.accepted.master, 'later-basis');
    assert.equal(row.after.accepted.settings.rolloverHour, 9);
    await integration(a, 'command', 'undo', { kind: 'undo' });
    await success(a, 'undo');
    assertMaster(await snapshot(a), source.expected[0], 'undo-after-basis');
    await integration(a, 'command', 'redo', { kind: 'redo' });
    await success(a, 'redo');
    assertMaster(await snapshot(a), row.after.accepted.master, 'redo-after-basis');
  });
  await scenario('pending-promotion-death', async ({ a, page, context, row }) => {
    const code = await setup(a);
    await receive(a, source, prefix);
    await integration(a, 'command', 'local', { kind: 'settings', rolloverHour: 9 });
    await success(a, 'local');
    row.beforeDeath = await snapshot(a);
    const cdp = await context.newCDPSession(a);
    const crashed = a.waitForEvent('crash');
    void cdp.send('Page.crash').catch(() => {});
    await crashed;
    await a.close();
    row.rendererDeaths = 1;
    const b = await page();
    await integration(b, 'open', code);
    await success(b, 'open');
    row.afterReopen = await snapshot(b);
    assert.equal(
      row.afterReopen.accepted.settings.rolloverHour,
      9,
      'journalled-local-command-survives',
    );
    await receive(b, source, suffix);
    row.afterBasis = await snapshot(b);
    assertMaster(row.afterBasis, source.expected[0], 'death-recovery-basis');
  });
  await scenario('pending-pressure-and-retry', async ({ a, row }) => {
    await setup(a);
    await receive(a, source, prefix);
    const before = await snapshot(a);
    await call(a, 'journal', 'fault', 'quota');
    await call(a, 'content', 'fault', 'gate-sealed');
    await integration(a, 'command', 'refused', { kind: 'settings', rolloverHour: 9 });
    await a.waitForFunction(() => window.content.snapshot().gates.includes('sealed'));
    await integration(a, 'command', 'following', { kind: 'settings', rolloverHour: 5 });
    row.pending = await snapshot(a);
    assert.equal(row.pending.accepted.settings.rolloverHour, 0, 'refused-history-stays-private');
    assert.deepEqual(row.pending.outgoing, before.outgoing, 'refused-history-not-sent');
    assert.equal(row.pending.entries.following.status, 'pending');
    await call(a, 'content', 'fault', 'abort-content');
    await call(a, 'content', 'release', 'sealed');
    await a.waitForFunction(() => window.integration.snapshot().status.state === 'blocked');
    row.aborted = await snapshot(a);
    assert.equal(row.aborted.accepted.settings.rolloverHour, 0);
    await integration(a, 'retry');
    await success(a, 'refused');
    await success(a, 'following');
    await receive(a, source, suffix);
    row.after = await snapshot(a);
    assert.equal(row.after.accepted.settings.rolloverHour, 5);
    assertMaster(row.after, source.expected[0], 'retry-basis');
  });
  for (const kind of ['workspace', 'text'])
    await scenario(`${kind}-projection-drift`, async ({ a, row }) => {
      const code = await seedBase(a);
      await probe(a, 'open', code, kind);
      await success(a, 'open', 'projection');
      row.before = await probe(a, 'snapshot');
      await probe(a, 'dropNext');
      await probe(a, 'receive', 'drift', source.updates[0]);
      row.ticket = await settled(a, 'drift', 'projection');
      row.after = await probe(a, 'snapshot');
      assert.equal(row.after.read?.error, 'projection-mismatch', `${kind}-drift-blocks-read`);
      assert.deepEqual(row.after.publications, row.before.publications, 'drift-not-published');
      assert.deepEqual(row.after.outgoing, row.before.outgoing, 'drift-not-sent');
      await probe(a, 'close');
      await success(a, 'close', 'projection');
      await probe(a, 'recover', code);
      row.recovered = await success(a, 'recover', 'projection');
      assert.equal(row.recovered.text[0], 'base0', 'drift-retains-durable-original');
      assert(
        row.recovered.records.some((b) => JSON.stringify(b) === JSON.stringify(source.updates[0])),
        'original-update-retained',
      );
      await probe(a, 'open', code, kind);
      await success(a, 'open', 'projection');
      row.reopened = await probe(a, 'snapshot');
      assert.equal(row.reopened.editor.text, 'base0', 'fresh-projection-recovers');
      await probe(a, 'close');
      await success(a, 'close', 'projection');
    });
  await scenario('initialization-projection-drift', async ({ a, row }) => {
    const code = await seedBase(a);
    await probe(a, 'dropNext', 'initialization');
    await probe(a, 'open', code);
    row.result = await settled(a, 'open', 'projection');
    assert.equal(
      row.result.error?.code,
      'projection-mismatch',
      'initialization-preserves-projection-cause',
    );
    assert.deepEqual(row.result.error.disposition, {
      kind: 'unavailable',
      reason: 'runtime-projection-mismatch',
    });
    await probe(a, 'recover', code);
    row.recovered = await success(a, 'recover', 'projection');
    assert(
      row.recovered.records.length + row.recovered.journal.length > 0,
      'initialization-retains-durable-bytes',
    );
    await probe(a, 'open', code);
    await success(a, 'open', 'projection');
    await probe(a, 'close');
    await success(a, 'close', 'projection');
  });
  await scenario('generated-workspace-histories', async ({ row }) => {
    row.histories = [];
    const details = await fc.check(
      fc.asyncProperty(
        replayHistory
          ? fc.constant(replayHistory)
          : fc.record({
              edits: fc.array(
                fc.record({
                  lane: fc.nat(2),
                  actor: fc.nat(2),
                  at: fc.nat(30),
                  remove: fc.nat(4),
                  text: fc.string({ maxLength: 4 }),
                }),
                { minLength: 1, maxLength: 10 },
              ),
              keys: fc.array(fc.nat(40), { minLength: 1, maxLength: 12 }),
              hour: fc.integer({ min: 1, max: 23 }),
            }),
        async (history) => {
          const source = makeSource(history.edits),
            order = orderedByKeys(source.updates.length, history.keys);
          const original = replay(source, order),
            whole = complete(original, source);
          let marker = '⟦local⟧';
          while (source.expected[0].includes(marker)) marker += '§';
          const context = await browser.newContext();
          try {
            await context.route('**/*', (route) =>
              new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
            );
            const a = await context.newPage();
            a.setDefaultTimeout(20000);
            await a.goto(origin + '/test/pending-projection/index.html');
            await a.waitForFunction(() => Boolean(window.projection));
            await setup(a);
            for (const id of order) {
              await receive(a, source, [id]);
              await integration(a, 'command', 'local', {
                kind: 'settings',
                rolloverHour: history.hour,
              });
              await success(a, 'local');
              if (id === order[0]) {
                await integration(a, 'input', 'human', { kind: 'master' }, marker, 0);
                await success(a, 'human');
              }
            }
            const after = await snapshot(a);
            const expected = whole ? source.expected[0] : original.text[0];
            assert(after.accepted.master.includes(marker), 'generated-local-input-survives');
            assert.equal(
              after.accepted.master.replace(marker, ''),
              expected,
              'generated-original-content-survives',
            );
            assertMaster(after, after.accepted.master, 'generated-workspace');
            assert.equal(after.accepted.settings.rolloverHour, history.hour);
            await integration(a, 'command', 'undo-local', { kind: 'undo' });
            await success(a, 'undo-local');
            const undone = await snapshot(a);
            assertMaster(undone, expected, 'generated-human-only-undo');
            await integration(a, 'durable', 'final');
            await success(a, 'final');
            row.histories.push({
              history,
              order,
              sourceComplete: whole,
              expected,
              marker,
              actual: after.accepted.master,
              afterUndo: undone.accepted.master,
            });
            if (row.histories.length % 10 === 0)
              console.log('generated histories: ' + row.histories.length);
          } finally {
            await context.close();
          }
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
  });
  for (const path of paths) {
    assert.equal(hash(path), files[path], 'Input changed: ' + path);
    assert.equal(hash(join(folder, path)), testedFiles[path]);
  }
  for (const [path, expected] of Object.entries(report.dependencies))
    assert.equal(hash(path), expected, 'Dependency changed: ' + path);
  assert(report.cases.length > 0, 'At least one requested case must execute');
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
