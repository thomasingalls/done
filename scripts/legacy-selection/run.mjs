/** Native selection handoff, crash/abort boundaries, external-ledger properties and controls. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import * as fc from 'fast-check';
import { arbitrary as sourceArbitrary } from '../legacy-export/arbitrary.mjs';
import { expected, example } from '../legacy-export/oracle.mjs';
import { SeededExclusion } from '../legacy-export/exclusion.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url)),
  args = process.argv.slice(2),
  options = {};
for (let i = 0; i < args.length; i += 2) {
  const key = args[i].slice(2);
  if (
    !args[i].startsWith('--') ||
    !['output', 'runs', 'seed', 'path', 'replay', 'mutant'].includes(key) ||
    !args[i + 1] ||
    options[key]
  )
    throw Error('Invalid options');
  options[key] = args[i + 1];
}
const runs = Number(options.runs ?? 60),
  seed = Number(options.seed ?? 8941);
if (!Number.isSafeInteger(runs) || runs < 1 || !Number.isSafeInteger(seed))
  throw Error('Invalid seed/runs');
const output = resolve(
  root,
  options.output ??
    `test-results/legacy-selection/${new Date().toISOString().replaceAll(':', '-')}`,
);
if (existsSync(output)) throw Error('Output exists');
mkdirSync(output, { recursive: true });
const hash = (b) => createHash('sha256').update(b).digest('hex');
const walk = (dir) =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
  );
const paths = [
  ...walk('src'),
  ...walk('account-protocol'),
  ...walk('scripts/legacy-selection'),
  ...walk('test/legacy-selection'),
  ...walk('test/legacy-import'),
  ...walk('scripts/legacy-export'),
  ...walk('test/legacy-export'),
  ...walk('test/legacy-source'),
  'test/storage-properties/oracle.ts',
  'test/legacySelection.test.ts',
  'wasm/journal-seal/seal.generated.ts',
  'docs/legacy-selection-preparation.md',
  'docs/storage-contract.md',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'vendor-patches/yjs@13.6.31.patch',
  'vendor-patches/yjs-13.6.31.json',
];
const originals = Object.fromEntries(paths.map((p) => [p, readFileSync(join(root, p))]));
const variants = [
  {
    id: 'trust-imported',
    scenario: 'damage',
    assertion: 'cold-damage-refuses',
    patches: [
      [
        'src/crdt/legacySelection.ts',
        'await verifyDestination(task, claim, code, plan);',
        '/* deliberately trust imported stage */',
      ],
    ],
  },
  {
    id: 'ignore-source',
    scenario: 'source',
    assertion: 'changed-source-refuses',
    patches: [
      [
        'src/crdt/legacySelection.ts',
        'const observed = await inspectLegacySource(task);',
        'return; const observed = await inspectLegacySource(task);',
      ],
    ],
  },
  {
    id: 'unsigned-provenance',
    scenario: 'provenance',
    assertion: 'provenance-tampering-refuses',
    patches: [
      ['src/crdt/localGenesisRecord.ts', 'const p = claim.imported;', 'const p = undefined;'],
    ],
  },
  {
    id: 'skip-final-route-check',
    scenario: 'lostRoute',
    assertion: 'index-loss-refuses',
    patches: [
      [
        'src/crdt/legacySelection.ts',
        "if (!(await importCensus(task, claim)).slot) refuseImport('selection-index-missing');",
        '/* deliberately skip final route check */',
      ],
    ],
  },
  {
    id: 'retain-preactive-marker',
    scenario: 'complete',
    assertion: 'selected-route-present',
    patches: [
      ['src/crdt/legacySelection.ts', 'store.delete(key);', '/* deliberately split handoff */'],
    ],
  },
];
const selected = options.mutant
  ? options.mutant === 'baseline'
    ? [null]
    : variants.filter((v) => v.id === options.mutant)
  : [null, ...variants];
if (!selected.length) throw Error('Unknown mutant');
const report = {
  schema: 1,
  scope: 'verified-local-import-selection',
  started: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  files: Object.fromEntries(Object.entries(originals).map(([p, b]) => [p, hash(b)])),
  checks: [],
  mutations: [],
  rendererCrashes: 0,
  limits: [
    'Controller-owned disposable Chromium exclusion; no production old-writer exclusion or default app cutover.',
    'No source deletion. Explicit Markdown/system adapter; real fidelity/carrier choice remains open.',
    'Commit-observation gates pause at next crypto operation or fixture return; request-success aborts cover precommit rollback. Not an exhaustive crash matrix.',
  ],
};
const call = (page, method, ...args) =>
  page.evaluate(({ method, args }) => window.selectionFixture[method](...args), { method, args });
const ok = (r) => {
  assert.equal(r.status, 'ok', `operation-accepted: ${r.reason ?? ''}`);
  return r.value;
};
const exampleSource = () => ({ input: example(), disk: [0], wal: [1, 2] });
const arbitrary = fc.record({
  source: sourceArbitrary,
  boundary: fc.constantFrom('none', 'intent', 'index', 'decision'),
  edit: fc
    .array(fc.constantFrom('a', '\n', '🔒', 'é'), { minLength: 1, maxLength: 10 })
    .map((x) => x.join('')),
});
let browser, server;
async function variantRun(variant) {
  const folder = join(output, variant?.id ?? 'baseline');
  mkdirSync(folder);
  const tested = { ...originals };
  for (const [p, from, to] of variant?.patches ?? []) {
    const text = tested[p].toString();
    if (text.split(from).length !== 2) throw Error('Nonunique mutation anchor: ' + variant.id);
    tested[p] = Buffer.from(text.replace(from, to));
  }
  for (const [p, bytes] of Object.entries(tested)) {
    mkdirSync(resolve(folder, p, '..'), { recursive: true });
    writeFileSync(join(folder, p), bytes);
  }
  server = await createServer({
    configFile: false,
    root: folder,
    logLevel: 'error',
    cacheDir: join(folder, 'vite-cache'),
    optimizeDeps: { noDiscovery: true },
    server: { host: '127.0.0.1', port: 5197, strictPort: true, fs: { allow: [root] } },
  });
  await server.listen();
  const url = 'http://127.0.0.1:5197/test/legacy-selection/index.html';
  let context, controller, handle, input, code, before, source;
  const close = async () => {
    await controller?.close();
    controller = null;
  };
  const restart = async () => {
    const old = handle;
    handle = await controller.establish();
    assert.throws(() => old.assert());
    handle.assert();
    await handle.page.waitForFunction(() => window.selectionFixture);
  };
  const fresh = async (s = exampleSource(), complete = true) => {
    await close();
    source = s;
    context = await browser.newContext({ serviceWorkers: 'block' });
    controller = new SeededExclusion(context, url);
    await controller.installRoutes();
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => window.selectionFixture);
    input = await call(page, 'prepare', source);
    handle = await controller.establish();
    handle.assert();
    await handle.page.waitForFunction(() => window.selectionFixture);
    code = await call(handle.page, 'enroll', input, complete ? 32 : 1);
    ok(await call(handle.page, complete ? 'complete' : 'confirm', code, input));
    before = await call(handle.page, 'dump');
    await restart();
  };
  const sourcePreserved = async () => {
    handle.assert();
    const after = await call(handle.page, 'dump');
    assert.deepEqual(
      JSON.parse(after.databases).done,
      JSON.parse(before.databases).done,
      'source-rows-preserved',
    );
    // Normal workspace opening may leave scoped encrypted journal entries; compare exact legacy values.
    assert.deepEqual(
      after.local.filter(([k]) => before.local.some(([b]) => b === k)),
      before.local,
      'source-local-values-preserved',
    );
    assert.equal(
      await call(handle.page, 'sourceDigest'),
      input.sourceDigest,
      'source-digest-preserved',
    );
    return after;
  };
  const select = async () => ok(await call(handle.page, 'select', code, input));
  const ready = async (edit) => {
    const value = ok(await call(handle.page, 'open', code, edit));
    assert.equal(value.kind, 'ready', 'selected-route-present');
    assert.equal(
      value.master,
      (edit ?? '') + expected(source.input)[0].content,
      'selected-master-ledger',
    );
    assert.deepEqual(
      value.entries,
      expected(source.input)
        .filter((e) => e.path !== 'unfiled.md')
        .map((e) => (e.path === 'master.md' ? { ...e, content: (edit ?? '') + e.content } : e)),
      'selected-all-days-ledger',
    );
    assert.deepEqual(value.unfiled, [source.input.orphan], 'selected-unfiled-ledger');
    return value;
  };
  const noContentWrites = async () => {
    const now = await call(handle.page, 'dump'),
      a = JSON.parse(before.databases),
      b = JSON.parse(now.databases);
    for (const [name, rows] of Object.entries(a))
      if (name !== 'done.custody' && name !== 'done.slots')
        assert.deepEqual(b[name], rows, 'selection-does-not-write-content-or-counters');
    const live = (rows) => rows.filter((r) => r[0] === 'entries' && r[1].length === 3);
    assert.deepEqual(
      live(b['done.custody']),
      live(a['done.custody']),
      'selection-does-not-replace-live-keys',
    );
  };
  const complete = async () => {
    const first = await select();
    await noContentWrites();
    await ready();
    await restart();
    assert.deepEqual(await select(), first, 'selection-retry-idempotent');
    await ready();
    await sourcePreserved();
  };
  const damage = async (phase = 'imported') => {
    if (phase !== 'imported') ok(await call(handle.page, 'advance', code, phase === 'indexed'));
    await call(handle.page, 'mutateSelection', 'missing');
    const r = await call(handle.page, 'select', code, input);
    assert.equal(r.status, 'refused', 'cold-damage-refuses');
    assert.equal(r.reason, 'selection-slices-missing', 'cold-damage-reason');
  };
  const lostRoute = async () => {
    await call(handle.page, 'fault', 'lose-index');
    const result = await call(handle.page, 'select', code, input);
    assert.equal(result.reason, 'selection-index-missing', 'index-loss-refuses');
    assert.equal((await call(handle.page, 'inspect')).kind, 'migration-required');
  };
  const changedSource = async () => {
    await call(handle.page, 'mutateSelection', 'source');
    assert.equal(
      (await call(handle.page, 'select', code, input)).reason,
      'selection-source-changed',
      'changed-source-refuses',
    );
  };
  const provenance = async () => {
    await select();
    await call(handle.page, 'mutateSelection', 'provenance');
    const opened = ok(await call(handle.page, 'open', code));
    assert.equal(opened.kind, 'repair-required', 'provenance-tampering-refuses');
  };
  const check = async (id, fn) => {
    await fn();
    report.checks.push({ id, passed: true });
    process.stdout.write(`PASS ${id}\n`);
  };
  const history = async (value) => {
    await fresh(value.source);
    if (value.boundary !== 'none') {
      await call(handle.page, 'fault', `abort-${value.boundary}`);
      assert.equal(
        (await call(handle.page, 'select', code, input)).status,
        'refused',
        'request-success-abort-refuses',
      );
      assert.equal(
        (await call(handle.page, 'inspect')).kind,
        'migration-required',
        'partial-selection-not-ready',
      );
      await restart();
    }
    await select();
    await noContentWrites();
    await ready(value.edit);
    await restart();
    await select();
    const opened = ok(await call(handle.page, 'open', code));
    assert.equal(opened.kind, 'ready', 'selected-route-present');
    assert.equal(
      opened.master,
      value.edit + expected(source.input)[0].content,
      'post-selection-edit-survives-retry',
    );
    await sourcePreserved();
  };
  try {
    if (variant) {
      if (variant.scenario === 'damage') {
        // Generated control checks sensitivity and saves a shrunk history, not just a directed fault.
        const control = fc.record({
          text: fc.array(fc.constantFrom('x', 'y', '🔒'), { maxLength: 8 }),
          phase: fc.constantFrom('imported', 'intent', 'indexed'),
        });
        const details = await fc.check(
          fc.asyncProperty(control, async (value) => {
            await fresh({
              input: { ...example(), master: value.text.join(''), days: [] },
              disk: [0],
              wal: [1, 2],
            });
            await damage(value.phase);
          }),
          { seed, numRuns: 15, endOnFailure: false },
        );
        if (!details.failed) throw Error('Control survived');
        writeFileSync(
          join(output, 'trust-imported-counterexample.json'),
          JSON.stringify(details.counterexample[0], null, 2) + '\n',
        );
        report.controlProperty = {
          seed,
          runs: details.numRuns,
          shrinks: details.numShrinks,
          path: details.counterexamplePath,
        };
        throw details.errorInstance;
      }
      await fresh();
      if (variant.scenario === 'source') await changedSource();
      else if (variant.scenario === 'provenance') await provenance();
      else if (variant.scenario === 'lostRoute') await lostRoute();
      else await complete();
      throw Error('Control survived');
    }
    await check('complete-cold-selection-and-reopen', async () => {
      await fresh();
      await complete();
    });
    await check('competing-selectors-converge', async () => {
      await fresh();
      const values = (await call(handle.page, 'raceSelect', code, input)).map(ok);
      assert.deepEqual(values[0], values[1]);
      await noContentWrites();
      await ready();
    });
    await check('incomplete-and-wrong-factor-refuse', async () => {
      await fresh(undefined, false);
      assert.equal((await call(handle.page, 'select', code, input)).reason, 'import-not-complete');
      assert.equal(
        (await call(handle.page, 'select', 'bad', input)).reason,
        'import-unlock-failed',
      );
    });
    for (const boundary of ['intent', 'index', 'decision']) {
      await check(`request-success-abort-${boundary}`, async () => {
        await fresh();
        await call(handle.page, 'fault', `abort-${boundary}`);
        assert.equal((await call(handle.page, 'select', code, input)).status, 'refused');
        assert.equal(
          (await call(handle.page, 'inspect')).kind,
          'migration-required',
          'aborted-decision-not-ready',
        );
        await restart();
        await complete();
      });
      await check(`renderer-death-${boundary}`, async () => {
        await fresh();
        await call(handle.page, 'fault', `kill-${boundary}`);
        const pending = call(handle.page, 'select', code, input).catch(() => {});
        await handle.page.waitForFunction(() => window.selectionFixture.gated(), null, {
          timeout: 20000,
        });
        const page = handle.page,
          cdp = await context.newCDPSession(page),
          death = page.waitForEvent('crash');
        void cdp.send('Page.crash').catch(() => {});
        await death;
        await page.close();
        await pending;
        report.rendererCrashes++;
        await restart();
        await complete();
      });
    }
    for (const phase of ['imported', 'intent', 'indexed'])
      await check(`cold-missing-${phase}`, async () => {
        await fresh();
        await damage(phase);
        await sourcePreserved();
      });
    await check('unreadable-ciphertext-refuses', async () => {
      await fresh();
      await call(handle.page, 'mutateSelection', 'ciphertext');
      assert.equal((await call(handle.page, 'select', code, input)).status, 'refused');
      await sourcePreserved();
    });
    await check('route-lost-before-decision', async () => {
      await fresh();
      await lostRoute();
      await restart();
      await complete();
    });
    await check('source-change-after-verification-refuses', async () => {
      await fresh();
      await call(handle.page, 'fault', 'change-source-at-index');
      assert.equal(
        (await call(handle.page, 'select', code, input)).reason,
        'selection-source-changed',
      );
      assert.equal((await call(handle.page, 'inspect')).kind, 'migration-required');
    });
    await check('source-change-refuses', async () => {
      await fresh();
      await changedSource();
    });
    await check('selected-provenance-authenticated', async () => {
      await fresh();
      await provenance();
    });
    await check('selected-index-loss-refuses', async () => {
      await fresh();
      await select();
      await call(handle.page, 'mutateSelection', 'index');
      assert.equal((await call(handle.page, 'select', code, input)).status, 'refused');
    });
    await check('conflicting-route-refuses', async () => {
      await fresh();
      ok(await call(handle.page, 'advance', code, true));
      await call(handle.page, 'mutateSelection', 'route');
      assert.equal((await call(handle.page, 'select', code, input)).status, 'refused');
    });
    await check('clear-waits-for-source-cleanup-owner', async () => {
      await fresh();
      await select();
      assert.equal(
        (await call(handle.page, 'clear', code)).reason,
        'import-source-cleanup-needs-owner',
      );
      await sourcePreserved();
    });
    let details;
    if (options.replay) {
      const saved = JSON.parse(readFileSync(resolve(root, options.replay), 'utf8'));
      if ('phase' in saved) {
        await fresh({
          input: { ...example(), master: saved.text.join(''), days: [] },
          disk: [0],
          wal: [1, 2],
        });
        await damage(saved.phase);
      } else await history(saved);
      details = { failed: false, numRuns: 1, replay: options.replay };
    } else
      details = await fc.check(fc.asyncProperty(arbitrary, history), {
        seed,
        numRuns: runs,
        ...(options.path ? { path: options.path } : {}),
        endOnFailure: false,
      });
    report.properties = {
      seed,
      runs: details.numRuns,
      failed: details.failed,
      shrinks: details.numShrinks ?? 0,
      path: details.counterexamplePath ?? null,
      error: details.errorInstance?.stack ?? null,
    };
    if (details.failed) {
      writeFileSync(
        join(output, 'counterexample.json'),
        JSON.stringify(details.counterexample[0], null, 2) + '\n',
      );
      throw details.errorInstance;
    }
    process.stdout.write(`PASS generated ${details.numRuns}\n`);
  } catch (error) {
    if (
      variant &&
      error instanceof assert.AssertionError &&
      error.message.includes(variant.assertion)
    ) {
      report.mutations.push({
        id: variant.id,
        detected: true,
        assertion: variant.assertion,
        actual: error.actual ?? null,
      });
      process.stdout.write(`DETECTED ${variant.id}\n`);
    } else throw error;
  } finally {
    await close();
    await server.close();
    server = null;
  }
}
try {
  report.yjsGuard = execFileSync(process.execPath, ['scripts/check-yjs-patch.mjs'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  browser = await chromium.launch({ headless: true });
  report.browser = { version: browser.version(), platform: process.platform };
  for (const variant of selected) await variantRun(variant);
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error.stack;
  process.exitCode = 1;
} finally {
  await server?.close();
  await browser?.close();
  report.finished = new Date().toISOString();
  report.inputsUnchanged = Object.entries(originals).every(
    ([p, b]) => hash(readFileSync(join(root, p))) === hash(b),
  );
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(output + '\n');
}
