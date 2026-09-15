/** Frozen production path probes. Reproduced violations are distinct from harness errors and controls. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { corpusEdits, makeSource } from './source.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
for (let i = 0; i < argv.length; i++)
  if (!['--output', '--rounds'].includes(argv[i]) || !argv[++i]) throw Error('Invalid arguments');
const rounds = Number(option('--rounds', '5'));
assert(Number.isSafeInteger(rounds) && rounds > 0);
const root = process.cwd(),
  output = resolve(option('--output', 'test-results/core-reproductions/browser-' + Date.now()));
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
    'test/core-reproductions',
  ].flatMap(tree),
  'scripts/core-reproductions/browser.mjs',
  'scripts/core-reproductions/source.mjs',
];
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const files = Object.fromEntries(paths.map((path) => [path, hash(path)]));
for (const path of paths) {
  mkdirSync(dirname(join(folder, path)), { recursive: true });
  writeFileSync(join(folder, path), readFileSync(path));
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
  scope: 'core-native-reproductions',
  started: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  files,
  node: process.version,
  browser: {},
  cases: [],
  limits: [
    'Native Chromium storage, factor custody, Web Locks, WASM, workspace adapter and CodeMirror on disposable synthetic stores. Default app and Account authority are excluded.',
    'Simultaneous keyboard input is separately reported from a CDP paused snapshot and deliberately reentrant same-task peer append.',
    'A reentrant storage hook proves error propagation under that condition; it does not establish ordinary cross-tab interleaving or its frequency.',
    'Known partial-delivery corpus is deliberately supplied through production receive. It does not establish that ordinary BroadcastChannel sender ordering creates that corpus.',
  ],
};
const save = () =>
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let browser, server;
const source = makeSource(corpusEdits);
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
const receive = async (page, id) => {
  await integration(page, 'receive', 'remote-' + id, source.updates[id]);
  await success(page, 'remote-' + id);
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
    server: { host: '127.0.0.1', port: 5191, strictPort: true, fs: { allow: [root] } },
  });
  await server.listen();
  const origin = 'http://127.0.0.1:5191';
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? chromium.executablePath(),
    headless: true,
  });
  report.browser = { version: browser.version(), platform: process.platform, arch: process.arch };

  async function scenario(name, fn) {
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
      await p.goto(origin + '/test/core-reproductions/index.html');
      await p.waitForFunction(() => Boolean(window.reproductions));
      return p;
    };
    const a = await page();
    try {
      await fn({ context, page, a, row });
      assert.deepEqual(errors, [], 'Unexpected page errors');
      row.status = 'completed-reproduction';
    } catch (error) {
      row.status = 'harness-error';
      row.error = { message: error.message, stack: error.stack };
      process.exitCode = 1;
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
  await scenario('production-clone-corpus', async ({ a, row }) => {
    row.source = source;
    row.result = await call(a, 'reproductions', 'clones', source);
    assert.equal(row.result.after.original.text[0], 'aaaabase0');
    for (const name of ['draft', 'historyFork', 'initialAccepted']) {
      assert.deepEqual(row.result.before[name].text, row.result.before.original.text);
      assert.equal(row.result.after[name].text[0], 'base0');
      assert.equal(row.result.after[name].pendingStructs, true);
    }
    row.violationReproduced = true;
  });
  for (const recovery of ['reopen', 'undo'])
    await scenario('workspace-promotion-' + recovery, async ({ a, row }) => {
      const code = await setup(a);
      for (const id of [3, 1, 5]) await receive(a, id);
      row.beforePromotion = {
        view: (await snapshot(a)).accepted.master,
        canonical: await call(a, 'reproductions', 'canonical'),
      };
      await integration(a, 'command', 'promote', { kind: 'settings', rolloverHour: 7 });
      await success(a, 'promote');
      row.atPromotion = {
        view: (await snapshot(a)).accepted.master,
        canonical: await call(a, 'reproductions', 'canonical'),
      };
      for (const id of [0, 2, 4, 6]) await receive(a, id);
      row.afterBasis = {
        snapshot: await snapshot(a),
        canonical: await call(a, 'reproductions', 'canonical'),
      };
      assert.equal(row.atPromotion.view, row.atPromotion.canonical.text[0]);
      assert.equal(row.afterBasis.canonical.text[0], 'aaaabase0');
      assert.equal(row.afterBasis.snapshot.accepted.master, 'base0');
      assert.equal(row.afterBasis.snapshot.views.goals.text, 'base0');
      assert(
        row.afterBasis.snapshot.exported
          .find((entry) => entry.path === 'master.md')
          ?.content.includes('base0'),
      );
      if (recovery === 'undo') {
        await integration(a, 'command', 'undo', { kind: 'undo' });
        await success(a, 'undo');
        row.afterUndo = {
          view: (await snapshot(a)).accepted.master,
          canonical: await call(a, 'reproductions', 'canonical'),
        };
        assert.equal(row.afterUndo.view, 'aaaabase0');
      } else {
        assert.equal((await durable(a)).status, 'resolved');
        await integration(a, 'close');
        await success(a, 'close');
        await integration(a, 'open', code);
        await success(a, 'open');
        row.afterReopen = {
          view: (await snapshot(a)).accepted.master,
          canonical: await call(a, 'reproductions', 'canonical'),
        };
        assert.equal(row.afterReopen.view, 'aaaabase0');
      }
      row.violationReproduced = true;
    });
  await scenario('journal-reentrant-peer-append', async ({ a, row }) => {
    const code = await setup(a);
    await call(a, 'reproductions', 'sibling', code);
    await integration(a, 'input', 'first', { kind: 'master' }, 'A');
    await success(a, 'first');
    await call(a, 'reproductions', 'arm', 'same-task-peer-append');
    row.barrier = await durable(a);
    row.intercepted = await call(a, 'reproductions', 'intercepted');
    assert.equal(row.barrier.error?.code, 'journal-changed');
    await integration(a, 'input', 'pending', { kind: 'master' }, 'C');
    row.blocked = await snapshot(a);
    assert.equal(row.blocked.status.state, 'blocked');
    assert.equal(row.blocked.entries.pending.status, 'pending');
    row.startupDisposition = await call(
      a,
      'reproductions',
      'startupDisposition',
      row.barrier.error.code,
    );
    await a.waitForTimeout(750);
    row.afterThreeFlushIntervals = await snapshot(a);
    assert.equal(row.afterThreeFlushIntervals.status.state, 'blocked');
    await integration(a, 'retry');
    await success(a, 'pending');
    assert.equal((await durable(a, 'retry-durable')).status, 'resolved');
    row.afterRetry = await snapshot(a);
    row.violationReproduced = true;
  });
  for (const operation of ['append', 'cleanup'])
    await scenario('journal-two-tabs-paused-' + operation, async ({ context, page, a, row }) => {
      const code = await setup(a),
        b = await page();
      await integration(b, 'open', code, 'human-two');
      await success(b, 'open');
      const cdp = await context.newCDPSession(a);
      await cdp.send('Debugger.enable');
      const paused = new Promise((resolve) => cdp.once('Debugger.paused', resolve));
      const pendingCall = a.evaluate(() => {
        window.integration.input('first', { kind: 'master' }, 'A');
        window.reproductions.arm('pause-after-enumeration');
        window.integration.durable('paused-flush');
      });
      await Promise.race([
        paused,
        new Promise((_, reject) => {
          const timer = setTimeout(() => reject(Error('No CDP pause')), 10000);
          timer.unref();
        }),
      ]);
      if (operation === 'append') {
        await integration(b, 'input', 'concurrent', { kind: 'master' }, 'B');
        await success(b, 'concurrent');
      } else assert.equal((await durable(b, 'peer-cleanup')).status, 'resolved');
      row.peerAfterOperation = await snapshot(b);
      await cdp.send('Debugger.resume');
      await pendingCall;
      row.barrier = await settled(a, 'paused-flush');
      row.intercepted = await call(a, 'reproductions', 'intercepted');
      row.after = await snapshot(a);
      row.violationReproduced = row.barrier.error?.code === 'journal-changed';
      assert.equal(row.barrier.error?.code, 'journal-changed');
      await integration(a, 'input', 'pending', { kind: 'master' }, 'C');
      await a.waitForTimeout(750);
      row.afterThreeFlushIntervals = await snapshot(a);
      assert.equal(row.afterThreeFlushIntervals.status.state, 'blocked');
      assert.equal(row.afterThreeFlushIntervals.entries.pending.status, 'pending');
      await integration(a, 'retry');
      await success(a, 'pending');
      assert.equal((await durable(a, 'retried')).status, 'resolved');
      row.afterRetry = await snapshot(a);
      await cdp.detach();
    });
  await scenario('journal-two-tabs-uninterrupted-task', async ({ page, a, row }) => {
    const code = await setup(a),
      b = await page();
    await integration(b, 'open', code, 'human-two');
    await success(b, 'open');
    let notify;
    const entered = new Promise((resolve) => {
      notify = resolve;
    });
    await a.exposeBinding('snapshotEntered', () => notify());
    const pendingCall = a.evaluate(() => {
      window.integration.input('first', { kind: 'master' }, 'A');
      window.reproductions.arm('spin-after-enumeration');
      window.integration.durable('spinning-flush');
    });
    await entered;
    row.peerOperation = await b.evaluate(() => {
      const started = Date.now();
      window.integration.input('concurrent', { kind: 'master' }, 'B');
      return { started, finished: Date.now() };
    });
    await pendingCall;
    await success(b, 'concurrent');
    row.barrier = await settled(a, 'spinning-flush');
    row.intercepted = await call(a, 'reproductions', 'intercepted');
    row.overlapped =
      row.peerOperation.started > row.intercepted.started &&
      row.peerOperation.finished < row.intercepted.finished;
    row.after = await snapshot(a);
    row.violationReproduced = row.barrier.error?.code === 'journal-changed';
    assert.equal(row.overlapped, true, 'Peer append must run during the synchronous snapshot task');
    if (row.barrier.status === 'rejected') assert.equal(row.barrier.error?.code, 'journal-changed');
  });
  for (const connect of [false, true])
    await scenario(
      'simultaneous-keyboard-' + (connect ? 'channel' : 'no-channel'),
      async ({ page, a, row }) => {
        const code = await setup(a, connect),
          b = await page();
        await integration(b, 'open', code, 'human-two', connect);
        await success(b, 'open');
        await a.locator('#goals .cm-content').focus();
        await b.locator('#goals .cm-content').focus();
        row.rounds = [];
        for (let i = 0; i < rounds; i++) {
          await Promise.all([
            a.keyboard.type('a'.repeat(160), { delay: 2 }),
            b.keyboard.type('b'.repeat(160), { delay: 2 }),
          ]);
          const barriers = await Promise.all([durable(a, 'round-' + i), durable(b, 'round-' + i)]);
          await Promise.all(
            [a, b].map((p) =>
              p.waitForFunction(
                ({ length }) => {
                  const state = window.integration.snapshot();
                  return (
                    state.status.state === 'blocked' ||
                    (state.status.pendingItems === 0 && state.accepted.master.length === length)
                  );
                },
                { length: (i + 1) * 160 * (connect ? 2 : 1) },
              ),
            ),
          );
          const [sa, sb] = await Promise.all([snapshot(a), snapshot(b)]);
          row.rounds.push({
            i,
            barriers,
            a: {
              status: sa.status,
              accepted: sa.accepted.master,
              view: sa.views.goals.text,
              errors: sa.errors,
            },
            b: {
              status: sb.status,
              accepted: sb.accepted.master,
              view: sb.views.goals.text,
              errors: sb.errors,
            },
          });
          if (sa.status.state === 'blocked' || sb.status.state === 'blocked') break;
        }
        row.violationReproduced = row.rounds.some((r) =>
          [r.a, r.b].some((v) => v.status.pressure?.code === 'journal-changed'),
        );
        row.typedCharacters = row.rounds.length * 320;
      },
    );
  for (const path of paths) {
    assert.equal(hash(path), files[path], 'Input changed: ' + path);
    assert.equal(hash(join(folder, path)), files[path]);
  }
  report.status = report.cases.some((c) => c.status === 'harness-error')
    ? 'harness-error'
    : 'completed-reproduction';
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
