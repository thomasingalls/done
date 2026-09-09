/** Native exact source cleanup, crash boundaries, external-ledger properties and controls. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import * as fc from 'fast-check';
import { arbitrary as sourceArbitrary } from '../legacy-export/arbitrary.mjs';
import { expected, example } from '../legacy-export/oracle.mjs';
import { SeededExclusion } from '../legacy-export/exclusion.mjs';
import { readOptions } from './config.mjs';
import {
  Diagnostics,
  describeError,
  requireOK,
  requireInjectedAbort,
  atomicJSON,
  fingerprint,
} from './diagnostics.mjs';
import { checkHistories } from './properties.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url));
const { options, runs, seed, output, limits } = readOptions(process.argv.slice(2), root);
// The supervisor creates and exclusively owns this output directory.
const hash = (b) => createHash('sha256').update(b).digest('hex');
const walk = (dir) =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
  );
const paths = [
  ...walk('src'),
  ...walk('scripts/legacy-cleanup'),
  ...walk('test/legacy-cleanup'),
  ...walk('test/legacy-selection'),
  ...walk('test/legacy-import'),
  ...walk('scripts/legacy-export'),
  ...walk('test/legacy-export'),
  ...walk('test/legacy-source'),
  'test/storage-properties/oracle.ts',
  'test/legacyCleanup.test.ts',
  'test/legacyCleanupBounds.test.ts',
  'test/legacyCleanupFixture.ts',
  'wasm/journal-seal/seal.generated.ts',
  'docs/legacy-cleanup-preparation.md',
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
    id: 'skip-manifest-validation',
    scenario: 'longKey',
    assertion: 'invalid-manifest-preserves-all-carriers',
    patches: [
      [
        'src/crdt/legacyCleanup.ts',
        'sourceCleanup: parseLegacyCleanup(manifest)',
        'sourceCleanup: manifest',
      ],
    ],
  },
  {
    id: 'skip-destination',
    scenario: 'damage',
    assertion: 'cold-coverage-refuses',
    patches: [
      [
        'src/crdt/legacyCleanup.ts',
        'await verifySelectedRecovery(task, claim, code, plan);',
        '/* deliberately skip cold replay */',
      ],
    ],
  },
  {
    id: 'ignore-value',
    scenario: 'changed',
    assertion: 'changed-value-refuses',
    patches: [
      [
        'src/crdt/legacyCleanupStorage.ts',
        "} else if ((await fp.digest('local', [actual.key, actual.value])) !== expected.digest)",
        '} else if (false)',
      ],
    ],
  },
  {
    id: 'prefix-sweep',
    scenario: 'sweep',
    assertion: 'modern-journal-preserved',
    patches: [
      [
        'src/crdt/legacyCleanupStorage.ts',
        'if (value !== undefined) storage.removeItem(key);',
        "for (const k of Object.keys(storage)) if (k.startsWith('done.pending-update.')) storage.removeItem(k); if (value !== undefined) storage.removeItem(key);",
      ],
    ],
  },
  {
    id: 'unsigned-manifest',
    scenario: 'tamper',
    assertion: 'tampered-progress-refuses',
    patches: [
      [
        'src/crdt/localGenesisRecord.ts',
        'const payload = claim.sourceCleanup',
        'const payload = false && claim.sourceCleanup',
      ],
    ],
  },
  {
    id: 'omit-destination-journal',
    scenario: 'pending',
    assertion: 'pending-journal-refuses',
    patches: [
      [
        'src/crdt/custody.ts',
        'return await operation({ records, journal });',
        'return await operation({ records, journal: [] });',
      ],
    ],
  },
  {
    id: 'clear-forgets-source',
    scenario: 'clear',
    assertion: 'clear-reappearance-refuses',
    patches: [
      [
        'src/crdt/localClearStorage.ts',
        'if (t.legacySourceOrigin !== undefined)\n    await assertLegacySourceAbsent(task, t.legacySourceOrigin);',
        '/* deliberately forget source after clear */',
      ],
    ],
  },
];
const selected = options.case
  ? [null]
  : options.mutant
    ? options.mutant === 'baseline'
      ? [null]
      : variants.filter((v) => v.id === options.mutant)
    : [null, ...variants];
if (!selected.length) throw Error('Unknown mutant');
const report = {
  schema: 2,
  status: 'running',
  passed: false,
  deadlines: limits,
  scope: 'authenticated-journal-inclusive-source-cleanup',
  started: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  files: Object.fromEntries(Object.entries(originals).map(([p, b]) => [p, hash(b)])),
  checks: [],
  mutations: [],
  rendererCrashes: 0,
  limits: [
    'Controller-owned disposable Chromium exclusion; no production old-writer exclusion or default app cutover.',
    'Known legacy DB/journal/ancillary absence only; not whole-profile or forensic residue acceptance.',
    'Renderer gates pause at the next crypto operation or fixture return after observed commit/removal; not exact instruction cuts.',
  ],
};
const diag = new Diagnostics(output, report, limits);
const call = (page, method, ...args) =>
  diag.watch(`browser:${method}`, async () => {
    report.lastBrowserOperation = { method, started: new Date().toISOString() };
    diag.checkpoint();
    // Do not log arguments: enroll/complete/select carry unlock material.
    const result = await page.evaluate(
      ({ method, args }) => window.cleanupFixture[method](...args),
      { method, args },
    );
    const refused = (Array.isArray(result) ? result : [result]).filter(
      (r) => r?.status === 'refused',
    );
    for (const r of refused)
      diag.event('browser-refusal', {
        method,
        reason: r.reason,
        error: r.error,
        trial: diag.trial,
      });
    report.lastBrowserOperation = {
      ...report.lastBrowserOperation,
      finished: new Date().toISOString(),
      refusals: refused,
    };
    diag.checkpoint();
    return result;
  });
const ok = requireOK;
const exampleSource = () => ({ input: example(), disk: [0], wal: [1, 2] });
const modernKey = `done.pending-update.done.${'1'.repeat(32)}.${'2'.repeat(32)}.${'3'.repeat(32)}.${'0'.repeat(16)}`;
const legacyKey = (k) =>
  ['done.actor', 'done.device', 'done.sync', 'done.sync.last'].includes(k) ||
  (k.startsWith('done.pending-update.done.') &&
    !/^done\.pending-update\.done\.[0-9a-f]{32}\.[0-9a-f]{32}\.[0-9a-f]{32}\.[0-9]{16}$/u.test(k));
const arbitrary = fc.record({
  source: sourceArbitrary,
  boundary: fc.nat(100),
  damage: fc.boolean(),
  edit: fc
    .array(fc.constantFrom('a', 'é', '🔒', '\n'), { minLength: 1, maxLength: 10 })
    .map((v) => v.join('')),
});
let browser, browserServer, server;
async function variantRun(variant) {
  diag.guard();
  report.status = 'running';
  report.phase = variant?.id ?? 'baseline';
  diag.event('variant-start', { id: report.phase }, true);
  diag.checkpoint();
  const folder = join(output, variant?.id ?? 'baseline');
  mkdirSync(folder);
  const tested = { ...originals };
  for (const [p, from, to] of variant?.patches ?? []) {
    const s = tested[p].toString();
    if (s.split(from).length !== 2) throw Error('Nonunique mutation anchor: ' + variant.id);
    tested[p] = Buffer.from(s.replace(from, to));
  }
  for (const [p, b] of Object.entries(tested)) {
    mkdirSync(resolve(folder, p, '..'), { recursive: true });
    writeFileSync(join(folder, p), b);
  }
  server = await diag.watch('vite:create', () =>
    createServer({
      configFile: false,
      root: folder,
      logLevel: 'error',
      cacheDir: join(folder, 'vite-cache'),
      optimizeDeps: { noDiscovery: true },
      server: { host: '127.0.0.1', port: 5198, strictPort: true, fs: { allow: [root] } },
    }),
  );
  await diag.watch('vite:listen', () => server.listen());
  const url = 'http://127.0.0.1:5198/test/legacy-cleanup/index.html';
  let controller, context, handle, input, code, before, source;
  const close = async () => {
    await diag.watch('context:close', () => controller?.close(), limits['teardown-ms'], true);
    controller = null;
  };
  const restart = () =>
    diag.watch('context:restart', async () => {
      const old = handle;
      handle = await controller.establish();
      assert.throws(() => old.assert());
      handle.assert();
      await handle.page.waitForFunction(() => window.cleanupFixture);
    });
  const fresh = (s = exampleSource(), select = true) =>
    diag.watch(
      'fixture:fresh',
      async () => {
        await close();
        source = s;
        context = await browser.newContext({ serviceWorkers: 'block' });
        controller = new SeededExclusion(context, url);
        await controller.installRoutes();
        const p = await context.newPage();
        await p.goto(url);
        await p.waitForFunction(() => window.cleanupFixture);
        input = await call(p, 'prepare', s);
        handle = await controller.establish();
        await handle.page.waitForFunction(() => window.cleanupFixture);
        handle.assert();
        code = await call(handle.page, 'enroll', input, 32);
        ok(await call(handle.page, 'complete', code, input));
        if (select) ok(await call(handle.page, 'select', code, input));
        before = await call(handle.page, 'dump');
        await restart();
      },
      limits['case-ms'],
    );
  const clean = async () => {
    handle.assert();
    return ok(await call(handle.page, 'clean', code, input));
  };
  const sourcePreserved = async () => {
    const now = await call(handle.page, 'dump');
    assert.deepEqual(
      JSON.parse(now.databases).done,
      JSON.parse(before.databases).done,
      'source-db-preserved',
    );
    assert.deepEqual(
      now.local.filter(([k]) => legacyKey(k)),
      before.local.filter(([k]) => legacyKey(k)),
      'source-values-preserved',
    );
  };
  const preserved = async () => {
    const now = await call(handle.page, 'dump'),
      a = JSON.parse(before.databases),
      b = JSON.parse(now.databases);
    for (const [name, rows] of Object.entries(a))
      if (!['done', 'done.custody'].includes(name))
        assert.deepEqual(b[name], rows, 'destination-content-counter-index-unchanged');
    const live = (r) => r.filter((e) => e[0] === 'entries' && e[1].length >= 3);
    assert.deepEqual(
      live(b['done.custody']),
      live(a['done.custody']),
      'destination-openers-unchanged',
    );
    for (const [key, value] of before.local.filter(([k]) => !legacyKey(k)))
      assert.deepEqual(
        now.local.find(([k]) => k === key),
        [key, value],
        'non-source-key-preserved',
      );
    return now;
  };
  const absent = async () => {
    const now = await preserved();
    assert.ok(!now.names.includes('done'), 'source-db-absent');
    assert.deepEqual(
      now.local.filter(([k]) => legacyKey(k)),
      [],
      'known-source-values-absent',
    );
  };
  const ready = async (edit = '') => {
    const o = ok(await call(handle.page, 'open', code));
    assert.equal(o.kind, 'ready', 'destination-remains-recoverable');
    assert.equal(o.master, edit + expected(source.input)[0].content, 'destination-external-master');
    assert.deepEqual(
      o.entries,
      expected(source.input)
        .filter((e) => e.path !== 'unfiled.md')
        .map((e) => (e.path === 'master.md' ? { ...e, content: edit + e.content } : e)),
      'destination-external-days',
    );
    assert.deepEqual(o.unfiled, [source.input.orphan], 'destination-external-unfiled');
  };
  const check = async (id, fn) => {
    if (options.replay || (options.case && !options.case.split(',').includes(id))) return;
    diag.guard();
    report.phase = id;
    diag.event('case-start', { id }, true);
    diag.checkpoint();
    try {
      await diag.watch(`case:${id}`, fn, limits['case-ms']);
      report.checks.push({ id, passed: true });
      process.stdout.write(`PASS ${id}\n`);
    } catch (error) {
      report.checks.push({ id, passed: false, error: describeError(error) });
      process.stdout.write(`FAIL ${id}: ${error.message}\n`);
      diag.guard();
    } finally {
      diag.checkpoint();
    }
  };
  const death = async (fault, method = 'clean') => {
    await call(handle.page, 'fault', fault);
    const pending = call(handle.page, method, code, input).catch(() => {});
    await handle.page.waitForFunction(() => window.cleanupFixture.gated(), null, {
      timeout: 20000,
    });
    const p = handle.page,
      cdp = await context.newCDPSession(p),
      crashed = p.waitForEvent('crash');
    void cdp.send('Page.crash').catch(() => {});
    await crashed;
    await p.close();
    await pending;
    report.rendererCrashes++;
    await restart();
  };
  const partial = async () => {
    await call(handle.page, 'fault', 'abort-2');
    assert.equal(
      (await call(handle.page, 'clean', code, input)).status,
      'refused',
      'progress-abort-refuses',
    );
    await restart();
  };
  const damage = async () => {
    await call(handle.page, 'mutateSelection', 'missing');
    const r = await call(handle.page, 'clean', code, input);
    assert.equal(r.status, 'refused', 'cold-coverage-refuses');
    assert.ok(
      ['cleanup-destination-pending', 'cleanup-import-coverage-missing'].includes(r.reason),
      'cold-coverage-reason',
    );
  };
  const longKey = async () => {
    const result = await call(handle.page, 'clean', code, input);
    assert.equal(result.reason, 'invalid-source-cleanup-entry', 'manifest-bound-refuses');
    const after = await call(handle.page, 'dump');
    assert.deepEqual(after, before, 'invalid-manifest-preserves-all-carriers');
  };
  const changed = async () => {
    await partial();
    await call(handle.page, 'setLocal', 'done.actor', 'replacement');
    assert.equal(
      (await call(handle.page, 'clean', code, input)).reason,
      'cleanup-source-value-changed',
      'changed-value-refuses',
    );
  };
  const pendingJournal = async () => {
    ok(await call(handle.page, 'journalEdit', code, 'dependent', true));
    assert.equal(
      (await call(handle.page, 'clean', code, input)).reason,
      'cleanup-destination-pending',
      'pending-journal-refuses',
    );
  };
  const tamper = async () => {
    await call(handle.page, 'fault', 'abort-1');
    assert.equal((await call(handle.page, 'clean', code, input)).status, 'refused');
    await call(handle.page, 'tamper', 'cursor');
    assert.equal(
      (await call(handle.page, 'clean', code, input)).reason,
      'local-progress-authentication-failed',
      'tampered-progress-refuses',
    );
  };
  const clearReappears = async () => {
    await clean();
    ok(await call(handle.page, 'clearAll', code));
    await restart();
    await call(handle.page, 'setLocal', 'done.device', 'reappeared');
    assert.equal(
      (await call(handle.page, 'resumeClear', code)).reason,
      'cleanup-source-remains',
      'clear-reappearance-refuses',
    );
  };
  const history = async (value) => {
    await fresh(value.source);
    ok(await call(handle.page, 'journalEdit', code, value.edit));
    before = await call(handle.page, 'dump');
    const total = before.local.filter(([k]) => legacyKey(k)).length + 1,
      boundary = value.boundary % (total + 1);
    await call(handle.page, 'fault', `abort-${boundary}`);
    const aborted = await call(handle.page, 'clean', code, input);
    requireInjectedAbort(aborted, boundary, await call(handle.page, 'observedAbort'));
    await restart();
    const claim = await call(handle.page, 'claim'),
      r = claim.sourceCleanup;
    if (value.damage && r && r.next < r.entries.length) {
      const key = r.entries.at(-1).key;
      await call(handle.page, 'setLocal', key, 'changed-generated');
      const initial = await call(handle.page, 'dump');
      assert.equal(
        (await call(handle.page, 'clean', code, input)).status,
        'refused',
        'generated-changed-source-refuses',
      );
      assert.deepEqual(
        (await call(handle.page, 'dump')).local,
        initial.local,
        'refusal-preserves-remaining-source',
      );
      await preserved();
    } else {
      const receipt = await clean();
      await absent();
      await restart();
      assert.deepEqual(await clean(), receipt, 'cleanup-retry-same-intent');
      await absent();
    }
    await ready(value.edit);
  };
  try {
    if (variant) {
      if (variant.scenario === 'longKey') {
        const ar = fc.record({
          text: fc.array(fc.constantFrom('x', 'y', '🔒'), { maxLength: 8 }),
          keySize: fc.integer({ min: 4097, max: 6000 }),
        });
        const details = await checkHistories(
          diag,
          variant.id,
          ar,
          async (v) => {
            await fresh({
              input: { ...example(), master: v.text.join(''), days: [] },
              disk: [0],
              wal: [1, 2],
              keySize: v.keySize,
            });
            await longKey();
          },
          { seed, numRuns: 15 },
        );
        if (!details.failed) throw Error('Control survived');
        writeFileSync(
          join(output, 'manifest-counterexample.json'),
          JSON.stringify(details.counterexample[0], null, 2) + '\n',
        );
        report.manifestProperty = {
          seed,
          runs: details.numRuns,
          shrinks: details.numShrinks,
          path: details.counterexamplePath,
        };
        throw details.errorInstance;
      }
      if (variant.scenario === 'damage') {
        const ar = fc.record({ text: fc.array(fc.constantFrom('x', 'y', '🔒'), { maxLength: 8 }) });
        const details = await checkHistories(
          diag,
          variant.id,
          ar,
          async (v) => {
            await fresh({
              input: { ...example(), master: v.text.join(''), days: [] },
              disk: [0],
              wal: [1, 2],
            });
            await damage();
          },
          { seed, numRuns: 15 },
        );
        if (!details.failed) throw Error('Control survived');
        writeFileSync(
          join(output, 'skip-destination-counterexample.json'),
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
      await diag.watch(
        `control:${variant.id}`,
        async () => {
          await fresh();
          if (variant.scenario === 'changed') await changed();
          if (variant.scenario === 'pending') await pendingJournal();
          if (variant.scenario === 'tamper') await tamper();
          if (variant.scenario === 'clear') await clearReappears();
          if (variant.scenario === 'sweep') {
            await call(handle.page, 'clean', code, input);
            assert.equal(
              (await call(handle.page, 'dump')).local.find(([k]) => k === modernKey)?.[1],
              '2:unrelated-encrypted-carrier',
              'modern-journal-preserved',
            );
          }
          throw Error('Control survived');
        },
        limits['case-ms'],
      );
    }
    await check('complete-exact-cleanup-and-retry', async () => {
      await fresh();
      const receipt = await clean();
      await absent();
      await restart();
      assert.deepEqual(await clean(), receipt);
      await absent();
      await ready();
    });
    await check('overlong-manifest-key-refuses-before-any-write', async () => {
      await fresh({ ...exampleSource(), keySize: 5000 });
      await longKey();
      await ready();
    });
    await check('cleanup-after-journal-flush-and-compaction', async () => {
      await fresh();
      ok(await call(handle.page, 'journalEdit', code, 'compacted-new '));
      ok(await call(handle.page, 'compact', code));
      before = await call(handle.page, 'dump');
      await clean();
      await absent();
      await restart();
      await ready('compacted-new ');
    });
    await check('journal-only-source-with-absent-database', async () => {
      await fresh({ input: example(), disk: [], wal: [0, 1, 2], noDatabase: true });
      await clean();
      await absent();
      await ready();
    });
    await check('competing-cleaners-converge', async () => {
      await fresh();
      const r = (await call(handle.page, 'raceClean', code, input)).map(ok);
      assert.deepEqual(r[0], r[1]);
      await absent();
    });
    await check('unselected-and-wrong-factor-refuse', async () => {
      await fresh(undefined, false);
      assert.equal((await call(handle.page, 'clean', code, input)).status, 'refused');
      await sourcePreserved();
      ok(await call(handle.page, 'select', code, input));
      assert.equal((await call(handle.page, 'clean', 'bad', input)).status, 'refused');
      await sourcePreserved();
    });
    for (let n = 0; n <= 7; n++)
      await check(`request-success-abort-${n}`, async () => {
        await fresh();
        await call(handle.page, 'fault', `abort-${n}`);
        assert.equal((await call(handle.page, 'clean', code, input)).status, 'refused');
        await preserved();
        await restart();
        await clean();
        await absent();
        await ready();
      });
    for (const cut of [
      'database',
      ...Array.from({ length: 8 }, (_, i) => `progress-${i}`),
      ...Array.from({ length: 6 }, (_, i) => `remove-${i}`),
    ])
      await check(`renderer-death-${cut}`, async () => {
        await fresh();
        await death(`kill-${cut}`);
        await clean();
        await absent();
        await ready();
      });
    await check('cold-destination-missing', async () => {
      await fresh();
      await damage();
      await sourcePreserved();
    });
    await check('cold-destination-ciphertext', async () => {
      await fresh();
      await call(handle.page, 'mutateSelection', 'ciphertext');
      assert.equal((await call(handle.page, 'clean', code, input)).status, 'refused');
      await sourcePreserved();
    });
    await check('cold-destination-pending-journal', async () => {
      await fresh();
      await pendingJournal();
      await sourcePreserved();
    });
    await check('terminal-observer-change-refuses', async () => {
      await fresh();
      await call(handle.page, 'fault', 'terminal-observer-change');
      assert.equal(
        (await call(handle.page, 'clean', code, input)).reason,
        'cleanup-source-reappeared',
      );
      await preserved();
    });
    await check('changed-source-before-intent', async () => {
      await fresh();
      await call(handle.page, 'setLocal', 'done.actor', 'changed');
      assert.equal(
        (await call(handle.page, 'clean', code, input)).reason,
        'cleanup-source-changed',
      );
      assert.equal((await call(handle.page, 'claim')).sourceCleanup, undefined);
    });
    await check('changed-source-after-intent', async () => {
      await fresh();
      await call(handle.page, 'fault', 'change-after-intent');
      const r = await call(handle.page, 'clean', code, input);
      assert.ok(['cleanup-source-value-changed', 'cleanup-source-changed'].includes(r.reason));
      assert.ok((await call(handle.page, 'dump')).names.includes('done'));
    });
    await check('changed-value-on-resume', async () => {
      await fresh();
      await changed();
      await preserved();
    });
    await check('unknown-key-on-resume', async () => {
      await fresh();
      await partial();
      await call(handle.page, 'setLocal', 'done.pending-update.done.unknown.0', '1:unknown');
      assert.equal(
        (await call(handle.page, 'clean', code, input)).reason,
        'cleanup-unknown-source-key',
      );
    });
    await check('missing-future-key-on-resume', async () => {
      await fresh();
      await partial();
      await call(handle.page, 'setLocal', 'done.sync', null);
      assert.equal(
        (await call(handle.page, 'clean', code, input)).reason,
        'cleanup-source-missing',
      );
    });
    await check('tampered-progress-refuses', async () => {
      await fresh();
      await tamper();
    });
    for (const f of ['remove-refused', 'remove-throws'])
      await check(f, async () => {
        await fresh();
        await call(handle.page, 'fault', f);
        assert.equal((await call(handle.page, 'clean', code, input)).status, 'refused');
        await restart();
        await clean();
        await absent();
      });
    await check('blocked-delete-cancellation-retains-permit', async () => {
      await fresh();
      await call(handle.page, 'holdSource');
      await call(handle.page, 'startBlocked', code, input);
      await handle.page.waitForFunction(() => window.cleanupFixture.status().progress?.blocked);
      await call(handle.page, 'abort');
      await call(handle.page, 'startCompeting');
      await handle.page.waitForTimeout(100);
      const status = await call(handle.page, 'status');
      assert.equal(status.settled, false, 'blocked-delete-unsettled');
      assert.equal(status.competing, false, 'blocked-delete-retains-permit');
      await call(handle.page, 'releaseSource');
      assert.equal((await call(handle.page, 'finishBlocked')).status, 'refused');
      await restart();
      await clean();
      await absent();
    });
    await check('imported-clear-before-and-after-cleanup', async () => {
      await fresh();
      assert.equal(
        (await call(handle.page, 'clear', code)).reason,
        'import-source-cleanup-needs-owner',
      );
      await clean();
      ok(await call(handle.page, 'clearAll', code));
      await restart();
      ok(await call(handle.page, 'resumeClear', code));
    });
    await check('imported-clear-after-custody-removal-death', async () => {
      await fresh();
      await clean();
      await death('kill-clear-index', 'clearAll');
      ok(await call(handle.page, 'resumeClear', code));
      await call(handle.page, 'setLocal', 'done.actor', 'reappeared');
      assert.equal((await call(handle.page, 'resumeClear', code)).reason, 'cleanup-source-remains');
    });
    await check('terminal-clear-source-reappearance', async () => {
      await fresh();
      await clearReappears();
    });
    if (report.checks.some((c) => !c.passed))
      throw Error('Directed cleanup cases failed; see per-case errors.');
    let details;
    if (options.case) {
      if (!report.checks.length) throw Error('Unknown case');
      details = { failed: false, numRuns: 0 };
      report.case = options.case;
    } else if (options.replay) {
      const saved = JSON.parse(readFileSync(resolve(root, options.replay), 'utf8'));
      report.phase = 'replay';
      diag.trial = {
        campaign: 'replay',
        attempt: 1,
        stage: 'replay',
        seed,
        inputHash: fingerprint(saved),
      };
      atomicJSON(join(output, 'replay-current-input.json'), saved);
      diag.event('trial-start', diag.trial, true);
      diag.checkpoint();
      try {
        await diag.watch(
          'replay',
          async () => {
            if ('keySize' in saved) {
              await fresh({
                input: { ...example(), master: saved.text.join(''), days: [] },
                disk: [0],
                wal: [1, 2],
                keySize: saved.keySize,
              });
              await longKey();
            } else if ('text' in saved) {
              await fresh({
                input: { ...example(), master: saved.text.join(''), days: [] },
                disk: [0],
                wal: [1, 2],
              });
              await damage();
            } else await history(saved);
          },
          limits['case-ms'],
        );
      } catch (error) {
        diag.failure('replay', saved, error);
        throw error;
      }
      diag.event('trial-passed', diag.trial, true);
      diag.trial = null;
      details = { failed: false, numRuns: 1 };
    } else
      details = await checkHistories(diag, 'baseline', arbitrary, history, {
        seed,
        numRuns: runs,
        ...(options.path ? { path: options.path } : {}),
      });
    report.properties = {
      seed,
      runs: details.numRuns,
      failed: details.failed,
      shrinks: details.numShrinks ?? 0,
      path: details.counterexamplePath ?? null,
      error: details.errorInstance ? describeError(details.errorInstance) : null,
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
    diag.guard();
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
    } else {
      diag.recordFailure(error);
      diag.checkpoint();
      throw error;
    }
  } finally {
    await diag.closeResources([
      ['context', () => controller?.close()],
      [
        'vite',
        async () => {
          await server?.close();
          server = null;
        },
      ],
    ]);
  }
}
try {
  report.yjsGuard = execFileSync(process.execPath, ['scripts/check-yjs-patch.mjs'], {
    cwd: root,
    encoding: 'utf8',
    timeout: limits['call-ms'],
  }).trim();
  browserServer = await diag.watch('browser:launch', () =>
    chromium.launchServer({ headless: true, timeout: limits['call-ms'] }),
  );
  const browserProcess = browserServer.process();
  process.send?.({ type: 'browser-start', pid: browserProcess.pid });
  browserProcess.once('exit', () => {
    if (process.connected) process.send({ type: 'browser-exit', pid: browserProcess.pid });
  });
  browser = await diag.watch('browser:connect', () =>
    chromium.connect(browserServer.wsEndpoint(), { timeout: limits['call-ms'] }),
  );
  report.browser = { version: browser.version(), platform: process.platform };
  for (const variant of selected) await variantRun(variant);
  report.testsPassed = true;
} catch (error) {
  diag.recordFailure(error);
  report.error = describeError(error);
  diag.event('campaign-failed', { error: report.error }, true);
  process.exitCode = 1;
} finally {
  // Persist partial results before attempting any potentially blocked teardown.
  diag.checkpoint();
  try {
    await diag.closeResources([
      [
        'vite',
        async () => {
          await server?.close();
          server = null;
        },
      ],
      ['browser-client', () => browser?.close()],
      ['browser-server', () => browserServer?.close()],
    ]);
  } catch (error) {
    diag.recordFailure(error);
    process.exitCode = 1;
  }
  report.finished = new Date().toISOString();
  report.inputsUnchanged = Object.entries(originals).every(
    ([p, b]) => hash(readFileSync(join(root, p))) === hash(b),
  );
  report.passed =
    report.testsPassed === true && !report.failure && !diag.fatal && report.inputsUnchanged;
  report.status = 'finished';
  if (!report.passed) process.exitCode = 1;
  diag.checkpoint();
  diag.dispose();
  process.stdout.write(output + '\n');
  if (process.connected) {
    process.send({ type: 'done' }, () => process.disconnect());
  }
}
