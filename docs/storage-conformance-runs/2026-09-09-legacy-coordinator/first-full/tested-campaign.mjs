/** Composed seeded migration, using production owners and an external source/operation ledger. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import * as fc from 'fast-check';
import { arbitrary as sources } from '../legacy-export/arbitrary.mjs';
import { expected, example } from '../legacy-export/oracle.mjs';
import { SeededExclusion } from '../legacy-export/exclusion.mjs';
import { readOptions } from '../legacy-cleanup/config.mjs';
import {
  Diagnostics,
  describeError,
  requireOK,
  atomicJSON,
} from '../legacy-cleanup/diagnostics.mjs';
import { checkHistories } from '../legacy-cleanup/properties.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url));
const { options, output, limits, runs, seed } = readOptions(process.argv.slice(2), root);
const hash = (b) => createHash('sha256').update(b).digest('hex');
const walk = (dir) =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
  );
const paths = [
  ...walk('src'),
  ...walk('scripts/legacy-coordinator'),
  ...walk('scripts/legacy-cleanup'),
  ...walk('scripts/legacy-export'),
  ...walk('test/legacy-coordinator'),
  ...walk('test/legacy-cleanup'),
  ...walk('test/legacy-selection'),
  ...walk('test/legacy-import'),
  ...walk('test/legacy-export'),
  ...walk('test/legacy-source'),
  'test/storage-properties/oracle.ts',
  'test/legacyCoordinator.test.ts',
  'test/legacyCleanupFixture.ts',
  'wasm/journal-seal/seal.generated.ts',
  'docs/legacy-coordinator-preparation.md',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  ...walk('vendor-patches'),
];
const originals = Object.fromEntries(paths.map((p) => [p, readFileSync(join(root, p))]));
const runtime = 'src/crdt/legacyCoordinator.ts';
const variants = [
  {
    id: 'stale-inspection',
    scenario: 'freshInspection',
    assertion: 'inspection-rereads-state',
    patches: [
      [
        runtime,
        'const inspect = (code?: string, input?: LegacyImportInput) =>',
        'let cachedInspection;\n  const inspect = (code?: string, input?: LegacyImportInput) =>',
      ],
      [
        runtime,
        'return input ? withInput(input, (copy) => inspect(code, copy)) : run(() => inspect(code));',
        'return cachedInspection ??= (input ? withInput(input, (copy) => inspect(code, copy)) : run(() => inspect(code)));',
      ],
    ],
  },
  {
    id: 'unsigned-inspection',
    scenario: 'authentication',
    assertion: 'authenticated-inspection-refuses',
    patches: [
      [
        'src/crdt/legacyCoordinatorState.ts',
        'await verifyImportClaim(task, c, code);',
        '/* omitted metadata authentication */',
      ],
    ],
  },
  {
    id: 'index-as-active',
    scenario: 'selection',
    assertion: 'selected-open-ready',
    patches: [
      [
        'src/crdt/legacySelection.ts',
        'await finishSelection(task, claim, local);',
        '/* index alone incorrectly treated as active */',
      ],
    ],
  },
  {
    id: 'reset-retained',
    scenario: 'reset',
    assertion: 'retained-refusal-preserves-carriers',
    patches: [
      [
        runtime,
        'const current = await inspect(code, copy);',
        "await new Promise((resolve, reject) => { const r = indexedDB.deleteDatabase('done.custody'); r.onsuccess = resolve; r.onerror = reject; });\n        const current = await inspect(code, copy);",
      ],
    ],
  },
  {
    id: 'rebind-partial',
    scenario: 'rebind',
    assertion: 'partial-input-binding-refuses',
    patches: [
      [
        'src/crdt/legacyCoordinatorState.ts',
        'if (!sameImportBinding(binding, plan.binding))',
        'if (false)',
      ],
      [
        'src/crdt/legacyCleanup.ts',
        'if (!sameImportBinding(claim.imported, plan.binding))',
        'if (false)',
      ],
    ],
  },
  {
    id: 'skip-readback',
    scenario: 'readback',
    assertion: 'saved-readback-before-enroll',
    patches: [],
    host: true,
  },
  {
    id: 'ignore-exclusion',
    scenario: 'exclusion',
    assertion: 'exclusion-loss-refuses-dispatch',
    patches: [],
    host: true,
  },
  {
    id: 'early-close',
    scenario: 'blocked',
    assertion: 'close-drains-native',
    patches: [[runtime, 'closing = Promise.resolve(active)', 'closing = Promise.resolve()']],
  },
  {
    id: 'overwrite-selected',
    scenario: 'later',
    assertion: 'selected-edit-ledger',
    patches: [
      [
        runtime,
        "import { captureLegacyExport } from './legacyExport';",
        "import { captureLegacyExport, replayLegacyExport } from './legacyExport';",
      ],
      [
        runtime,
        'try {\n          guard();',
        "try {\n          const old = await replayLegacyExport(copy.recovery, copy.recoveryDigest);\n          await opened.workspace.text({ kind: 'master' }).input({ name: 'insert', text: old.entries.find(e => e.path === 'master.md').content }, { ranges: [{ anchor: 0, head: opened.workspace.read().master.length }], main: 0 }).accepted;\n          await opened.workspace.whenDurable();\n          guard();",
      ],
    ],
  },
  {
    id: 'terminal-only',
    scenario: 'terminal',
    assertion: 'terminal-reappearance-refuses',
    patches: [
      [
        runtime,
        'const receipt = await verifyLegacyCleanup(slotId, code, copy, { signal });',
        "const receipt = { kind: 'source-cleaned' };",
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
  scope: 'private-seeded-migration-coordinator',
  status: 'running',
  passed: false,
  started: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  files: Object.fromEntries(Object.entries(originals).map(([p, b]) => [p, hash(b)])),
  deadlines: limits,
  checks: [],
  mutations: [],
  rendererCrashes: 0,
  coverage: {},
  limits: [
    'Disposable controller exclusion only; no production old-version fence or default application cutover.',
    'Known source-carrier census; no whole-profile/forensic residue acceptance.',
    'Kills after observed native commits/removals park at next crypto or fixture return; not instruction-exact cuts.',
  ],
};
const diag = new Diagnostics(output, report, limits);
const count = (name) => {
  report.coverage[name] = (report.coverage[name] ?? 0) + 1;
};
const raw = (page, method, ...args) =>
  diag.watch(`browser:${method}`, async () => {
    report.lastBrowserOperation = { method, started: new Date().toISOString() };
    const r = await page.evaluate(
      ({ method, args }) => window.coordinatorFixture[method](...args),
      { method, args },
    );
    if (r?.status === 'refused')
      diag.event('browser-refusal', { method, reason: r.reason, error: r.error });
    return r;
  });
const ok = requireOK;
const simple = () => ({ input: { ...example(), days: [] }, disk: [0], wal: [1, 2] });
const legacyKey = (k) =>
  ['done.actor', 'done.device', 'done.sync', 'done.sync.last'].includes(k) ||
  (k.startsWith('done.pending-update.done.') &&
    !/^done\.pending-update\.done\.[0-9a-f]{32}\.[0-9a-f]{32}\.[0-9a-f]{32}\.[0-9]{16}$/u.test(k));
const arbitrary = fc.record({
  source: sources,
  budget: fc.constantFrom(16, 32),
  abort: fc.constantFrom('claim', 'slice', 'reservation', 'import-imported', 'index', 'decision'),
  cleanup: fc.integer({ min: 0, max: 7 }),
  restart: fc.boolean(),
  edit: fc
    .array(fc.constantFrom('x', 'é', '🔒', '\n'), { minLength: 1, maxLength: 8 })
    .map((s) => s.join('')),
});
let browser,
  browserServer,
  server,
  serial = 0;
async function variantRun(variant) {
  diag.guard();
  report.phase = variant?.id ?? 'baseline';
  report.status = 'running';
  diag.event('variant-start', { id: report.phase }, true);
  diag.checkpoint();
  const folder = join(output, variant?.id ?? 'baseline');
  mkdirSync(folder);
  const files = { ...originals };
  for (const [p, from, to] of variant?.patches ?? []) {
    const text = files[p].toString();
    if (text.split(from).length !== 2) throw Error('Nonunique mutation anchor: ' + variant.id);
    files[p] = Buffer.from(text.replace(from, to));
  }
  for (const [p, b] of Object.entries(files)) {
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
      server: { host: '127.0.0.1', port: 5199, strictPort: true, fs: { allow: [root] } },
    }),
  );
  await diag.watch('vite:listen', () => server.listen());
  const url = 'http://127.0.0.1:5199/test/legacy-coordinator/index.html';
  let context, controller, handle, code, saved, packetPath, source, initial, cancelled;
  const close = async () => {
    if (controller) {
      report.exclusionEvents ??= [];
      report.exclusionEvents.push(...controller.events);
      await diag.watch('context:close', () => controller.close(), limits['teardown-ms'], true);
      controller = null;
    }
  };
  const hostGuard = () => {
    if (variant?.id !== 'ignore-exclusion') handle.assert();
  };
  const call = async (method, ...args) => {
    hostGuard();
    const result = await raw(handle.page, method, ...args);
    hostGuard();
    return result;
  };
  const readInput = async () => {
    hostGuard();
    const bytes =
      variant?.id === 'skip-readback' ? Buffer.from(saved.recovery) : readFileSync(packetPath);
    assert.equal(hash(bytes), saved.recoveryDigest, 'saved-packet-digest');
    const input = { ...saved, recovery: [...bytes] };
    ok(await call('replay', input));
    count('saved-readback');
    return input;
  };
  const restart = async () => {
    const old = handle;
    handle = await diag.watch('context:restart', () => controller.establish());
    assert.throws(() => old.assert());
    await handle.page.waitForFunction(() => window.coordinatorFixture);
    hostGuard();
    count('restart');
  };
  const fresh = async (s = simple()) => {
    await close();
    source = s;
    code = null;
    cancelled = null;
    context = await browser.newContext({ serviceWorkers: 'block' });
    controller = new SeededExclusion(context, url, {
      onLoss: (event) => {
        diag.event('host-exclusion-loss', event);
        count('exclusion-loss');
        if (variant?.id !== 'ignore-exclusion' && handle?.page && !handle.page.isClosed())
          cancelled = raw(handle.page, 'cancel').catch((error) => {
            diag.event('host-cancel-unavailable', { error: describeError(error) });
          });
      },
    });
    await controller.installRoutes();
    const p = await context.newPage();
    await p.goto(url);
    await p.waitForFunction(() => window.coordinatorFixture);
    await raw(p, 'prepare', s);
    handle = await controller.establish();
    await handle.page.waitForFunction(() => window.coordinatorFixture);
    hostGuard();
    saved = ok(await call('capture'));
    const dir = join(output, 'packets', String(++serial));
    mkdirSync(dir, { recursive: true });
    packetPath = join(dir, 'recovery.json');
    writeFileSync(packetPath, Buffer.from(saved.recovery));
    const { recovery: _recovery, ...binding } = saved;
    atomicJSON(join(dir, 'binding.json'), binding);
    initial = await call('dump');
    await restart();
    await readInput();
  };
  const enroll = async (slices = 1) => {
    code = ok(await call('enroll', await readInput(), slices));
    return call('confirm', code);
  };
  const inspect = async () => ok(await call('inspect', code, await readInput()));
  const advance = async (action, slices = 32) =>
    call('advance', action, code, await readInput(), slices);
  const finishImport = async (budget = 32) => {
    for (let n = 0; n < 100; n++) {
      const c = await inspect();
      count(`stage-${c.stage ?? c.kind}`);
      if (
        c.kind === 'selected' ||
        (c.kind === 'import' && ['imported', 'selecting'].includes(c.stage))
      )
        return c;
      ok(await advance('import', budget));
    }
    throw Error('Import iteration bound');
  };
  const select = async () => {
    await finishImport();
    return ok(await advance('select'));
  };
  const sourceUnchanged = async () => {
    const now = await call('dump');
    assert.deepEqual(
      JSON.parse(now.databases).done,
      JSON.parse(initial.databases).done,
      'source-db-preserved',
    );
    assert.deepEqual(
      now.local.filter(([k]) => legacyKey(k)),
      initial.local.filter(([k]) => legacyKey(k)),
      'source-local-preserved',
    );
  };
  const ready = async (edit = '') => {
    const r = ok(await call('open', code));
    assert.equal(r.kind, 'ready', 'selected-open-ready');
    assert.equal(r.master, edit + expected(source.input)[0].content, 'selected-edit-ledger');
    assert.deepEqual(
      r.entries,
      expected(source.input)
        .filter((e) => e.path !== 'unfiled.md')
        .map((e) => (e.path === 'master.md' ? { ...e, content: edit + e.content } : e)),
      'external-day-ledger',
    );
    assert.deepEqual(r.unfiled, [source.input.orphan], 'external-unfiled-ledger');
  };
  const absent = async () => {
    const now = await call('dump');
    assert.equal(now.names.includes('done'), false, 'source-db-absent');
    assert.deepEqual(
      now.local.filter(([k]) => legacyKey(k)),
      [],
      'source-local-absent',
    );
    assert.deepEqual(
      now.local.filter(([k]) => !legacyKey(k) && !/^done\.pending-update\./u.test(k)),
      initial.local.filter(([k]) => !legacyKey(k) && !/^done\.pending-update\./u.test(k)),
      'unrelated-local-preserved',
    );
  };
  const finish = async (edit = '') => {
    ok(await advance('cleanup'));
    await restart();
    ok(await advance('verify'));
    await absent();
    await ready(edit);
    count('verified-terminal');
  };
  const abort = async (point, fn) => {
    await call('fault', `abort-${point}`);
    const r = await fn();
    const observed = await call('observedAbort');
    assert.equal(observed, point, 'native-abort-observed');
    assert.equal(r.status, 'refused', 'native-abort-refuses');
    assert.equal(r.reason, 'storage-failed', 'native-abort-storage-failure');
    count(`abort-${point}`);
    await restart();
  };
  const kill = async (point, action) => {
    await call('fault', `kill-${point}`);
    await call('start', action, code, await readInput(), 32);
    await handle.page.waitForFunction(() => window.coordinatorFixture.gated());
    assert.equal((await raw(handle.page, 'state')).point, point, 'native-kill-boundary-observed');
    const page = handle.page,
      cdp = await context.newCDPSession(page),
      crashed = page.waitForEvent('crash');
    void cdp.send('Page.crash').catch(() => {});
    await crashed;
    await page.close();
    await cdp.detach().catch(() => {});
    report.rendererCrashes++;
    count(`kill-${point}`);
    await restart();
  };
  const scenario = {
    async freshInspection() {
      await fresh();
      ok(await enroll(32));
      assert.equal((await inspect()).kind, 'import', 'preactive-inspection');
      ok(await call('otherAdvance', 'select', code, await readInput()));
      assert.equal((await inspect()).kind, 'selected', 'inspection-rereads-state');
      await finish();
    },
    async readback() {
      await fresh();
      writeFileSync(packetPath, 'corrupt');
      let refused = false;
      try {
        ok(await enroll());
      } catch {
        refused = true;
      }
      assert.equal(refused, true, 'saved-readback-before-enroll');
      assert.deepEqual(await call('dump'), initial, 'save-failure-no-intent');
    },
    async authentication() {
      await fresh();
      ok(await enroll());
      await call('mutate', 'claim');
      const r = await call('inspect', code);
      assert.equal(r.status, 'refused', 'authenticated-inspection-refuses');
    },
    async selection() {
      await fresh();
      ok(await enroll());
      await select();
      await ready();
      await finish();
    },
    async reset() {
      await fresh();
      ok(await enroll());
      const before = await call('dump');
      await advance('cleanup');
      assert.deepEqual(await call('dump'), before, 'retained-refusal-preserves-carriers');
    },
    async rebind() {
      await fresh();
      ok(await enroll());
      await select();
      await abort('cleanup-1', () => advance('cleanup'));
      const input = await readInput(),
        packet = JSON.parse(Buffer.from(input.recovery));
      packet.sourceDigest = '0'.repeat(64);
      const bytes = Buffer.from(JSON.stringify(packet)),
        changed = {
          ...input,
          recovery: [...bytes],
          recoveryDigest: hash(bytes),
          sourceDigest: packet.sourceDigest,
        };
      const r = await call('advance', 'cleanup', code, changed, 32);
      assert.equal(r.status, 'refused', 'partial-input-binding-refuses');
      await finish();
    },
    async exclusion() {
      await fresh();
      ok(await enroll());
      const before = await call('dump');
      const rogue = await context.newPage();
      await rogue.close();
      if (cancelled) await cancelled;
      let refused = false;
      try {
        const r = await advance('import');
        refused = r.status === 'refused';
      } catch {
        refused = true;
      }
      assert.equal(refused, true, 'exclusion-loss-refuses-dispatch');
      await raw(handle.page, 'drained');
      assert.deepEqual(await raw(handle.page, 'dump'), before, 'lost-epoch-preserves-carriers');
      await restart();
      await select();
      await finish();
    },
    async blocked() {
      await fresh();
      ok(await enroll());
      await select();
      await call('holdSource');
      await call('start', 'cleanup', code, await readInput());
      await handle.page.waitForFunction(() => window.coordinatorFixture.state().progress?.blocked);
      await raw(handle.page, 'cancel');
      await raw(handle.page, 'compete');
      // Event-loop turns distinguish a fulfilled close from the deliberately unsettled native deletion.
      await handle.page.evaluate(() => new Promise((r) => setTimeout(r, 40)));
      const s = await raw(handle.page, 'state');
      assert.equal(s.state, 'closing', 'close-drains-native');
      assert.equal(s.settled, false, 'blocked-operation-drains');
      assert.equal(s.competing, false, 'blocked-delete-permit-retained');
      await raw(handle.page, 'releaseSource');
      await raw(handle.page, 'drained');
      await raw(handle.page, 'finishCompetitor');
      assert.equal(
        (await raw(handle.page, 'result')).status,
        'refused',
        'cancelled-operation-refuses',
      );
      await restart();
      await finish();
    },
    async later() {
      await fresh();
      ok(await enroll());
      await select();
      ok(await call('journalEdit', code, 'later '));
      await finish('later ');
    },
    async terminal() {
      await fresh();
      ok(await enroll());
      await select();
      ok(await advance('cleanup'));
      await call('setLocal', 'done.actor', 'reappeared');
      const r = await advance('verify');
      assert.equal(r.status, 'refused', 'terminal-reappearance-refuses');
      await ready();
    },
  };
  const check = async (id, fn) => {
    if (options.replay || (options.case && !options.case.split(',').includes(id))) return;
    report.phase = id;
    diag.event('case-start', { id }, true);
    diag.checkpoint();
    try {
      await diag.watch(`case:${id}`, fn, limits['case-ms']);
      report.checks.push({ id, passed: true });
    } catch (error) {
      report.checks.push({ id, passed: false, error: describeError(error) });
      throw error;
    }
  };
  const history = async (value) => {
    await fresh(value.source);
    if (value.abort === 'claim') await abort('claim', () => enroll());
    else ok(await enroll());
    if ((await inspect()).kind === 'unused') ok(await enroll());
    if (['slice', 'reservation', 'import-imported'].includes(value.abort))
      await abort(value.abort, () => advance('import', 32));
    await finishImport(value.budget);
    if (value.restart) await restart();
    if (['index', 'decision'].includes(value.abort))
      await abort(value.abort, () => advance('select'));
    await select();
    await sourceUnchanged();
    ok(await call('journalEdit', code, value.edit));
    const before = await call('dump'),
      missing = await call('advance', 'import', code, null);
    assert.equal(missing.reason, 'migration-recovery-input-required', 'missing-packet-refuses');
    assert.deepEqual(await call('dump'), before, 'missing-packet-preserves');
    count('missing-packet');
    const total = initial.local.filter(([k]) => legacyKey(k)).length + 1;
    await abort(`cleanup-${value.cleanup % (total + 1)}`, () => advance('cleanup'));
    if (value.restart) ok(await call('compact', code));
    await finish(value.edit);
  };
  try {
    if (variant) {
      try {
        await diag.watch(`control:${variant.id}`, scenario[variant.scenario], limits['case-ms']);
        throw Error('Control survived');
      } catch (error) {
        diag.guard();
        if (!(error instanceof assert.AssertionError) || !error.message.includes(variant.assertion))
          throw error;
        report.mutations.push({ id: variant.id, detected: true, assertion: variant.assertion });
        diag.event('control-detected', { id: variant.id }, true);
      }
      return;
    }
    for (const [id, fn] of Object.entries(scenario)) await check(id, fn);
    await check('ten-day-saved-cold-flow', async () => {
      await fresh({ input: example(), disk: [0], wal: [1, 2] });
      ok(await enroll());
      await select();
      await sourceUnchanged();
      await finish();
    });
    for (const point of [
      'claim',
      'custody',
      'import-content',
      'counter',
      'witness-ready',
      'import-importing',
      'reservation',
      'slice',
      'import-imported',
    ])
      await check(`kill-${point}`, async () => {
        await fresh();
        code = ok(await call('enroll', await readInput(), 32));
        await kill(point, 'confirm');
        await select();
        await finish();
      });
    for (const point of ['import-selecting', 'index', 'decision'])
      await check(`kill-${point}`, async () => {
        await fresh();
        ok(await enroll());
        await finishImport();
        await kill(point, 'select');
        await select();
        await finish();
      });
    for (const point of [
      'cleanup-0',
      'database',
      'cleanup-1',
      'remove-0',
      'cleanup-2',
      'remove-1',
      'cleanup-7',
    ])
      await check(`kill-${point}`, async () => {
        await fresh();
        ok(await enroll());
        await select();
        await kill(point, 'cleanup');
        await finish();
      });
    await check('stale-dispatch-after-selection', async () => {
      await fresh();
      ok(await enroll());
      await finishImport();
      await call('fault', 'park-dispatch');
      await call('start', 'import', code, await readInput());
      await handle.page.waitForFunction(() => window.coordinatorFixture.gated());
      ok(await raw(handle.page, 'otherAdvance', 'select', code, await readInput()));
      const before = await raw(handle.page, 'dump');
      await raw(handle.page, 'resumeGate');
      assert.equal((await raw(handle.page, 'result')).status, 'refused', 'stale-dispatch-refuses');
      assert.deepEqual(await call('dump'), before, 'stale-dispatch-no-remint');
      await finish();
    });
    await check('exclusion-loss-while-parked', async () => {
      await fresh();
      ok(await enroll());
      const before = await call('dump');
      await call('fault', 'park-dispatch');
      await call('start', 'import', code, await readInput());
      await handle.page.waitForFunction(() => window.coordinatorFixture.gated());
      const rogue = await context.newPage();
      await rogue.close();
      if (cancelled) await cancelled;
      await raw(handle.page, 'drained');
      assert.equal(
        (await raw(handle.page, 'result')).status,
        'refused',
        'parked-exclusion-refuses',
      );
      assert.deepEqual(await raw(handle.page, 'dump'), before, 'parked-exclusion-preserves');
      await restart();
      await select();
      await finish();
    });
    await check('missing-file-selected-open-and-clear', async () => {
      await fresh();
      ok(await enroll());
      await select();
      ok(await call('journalEdit', code, 'kept '));
      unlinkSync(packetPath);
      await assert.rejects(() => readInput());
      await ready('kept ');
      writeFileSync(packetPath, Buffer.from(saved.recovery));
      await finish('kept ');
      ok(await call('clearAll', code));
      assert.equal(ok(await call('inspect')).owner, 'clear', 'clear-owner-required');
      assert.equal((await advance('import')).status, 'refused', 'cleared-no-remint');
      count('clear-handoff');
    });
    if (options.case) {
      if (!report.checks.length) throw Error('Unknown case');
    } else {
      report.phase = 'baseline';
      const details = await checkHistories(
        diag,
        'baseline',
        options.replay
          ? fc.constant(JSON.parse(readFileSync(resolve(root, options.replay), 'utf8')))
          : arbitrary,
        history,
        {
          seed,
          numRuns: options.replay ? 1 : runs,
          ...(options.path ? { path: options.path } : {}),
        },
      );
      report.properties = {
        seed,
        runs: details.numRuns,
        failed: details.failed,
        shrinks: details.numShrinks,
        path: details.counterexamplePath,
      };
      if (details.failed) {
        atomicJSON(join(output, 'counterexample.json'), details.counterexample[0]);
        throw details.errorInstance;
      }
    }
  } finally {
    await diag.closeResources([
      ['context', close],
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
  const processHandle = browserServer.process();
  process.send?.({ type: 'browser-start', pid: processHandle.pid });
  processHandle.once('exit', () => {
    if (process.connected) process.send({ type: 'browser-exit', pid: processHandle.pid });
  });
  browser = await diag.watch('browser:connect', () =>
    chromium.connect(browserServer.wsEndpoint(), { timeout: limits['call-ms'] }),
  );
  report.browser = { version: browser.version(), platform: process.platform };
  for (const variant of selected) await variantRun(variant);
  report.testsPassed = true;
} catch (error) {
  diag.recordFailure(error);
  process.exitCode = 1;
} finally {
  diag.checkpoint();
  try {
    await diag.closeResources([
      ['vite', () => server?.close()],
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
  if (process.connected) process.send({ type: 'done' }, () => process.disconnect());
}
