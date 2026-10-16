/** Native production import owner, interrupted slices and external-ledger properties. Synthetic origins only. */
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
  throw Error('Invalid property count/seed');
const output = resolve(
  root,
  options.output ?? `test-results/legacy-import/${new Date().toISOString().replaceAll(':', '-')}`,
);
if (existsSync(output)) throw Error('Output exists');
mkdirSync(output, { recursive: true });
const hash = (value) => createHash('sha256').update(value).digest('hex');
const walk = (dir) =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
  );
const paths = [
  ...walk('src'),
  ...walk('account-protocol'),
  ...walk('scripts/legacy-import'),
  ...walk('test/legacy-import'),
  ...walk('scripts/legacy-export'),
  ...walk('test/legacy-export'),
  ...walk('test/legacy-source'),
  'test/storage-properties/oracle.ts',
  'test/legacyImport.test.ts',
  'test/legacyImportReceipts.test.ts',
  'wasm/journal-seal/seal.generated.ts',
  'docs/legacy-import-preparation.md',
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
    id: 'mutable-receipt',
    scenario: 'receipt',
    assertion: 'receipt-output-bound',
    patches: [
      [
        'src/crdt/legacyImportPlan.ts',
        '`${IMPORT_RECEIPT_PREFIX}:${cursor}`',
        'IMPORT_RECEIPT_PREFIX',
      ],
    ],
  },
  {
    id: 'omit-master',
    scenario: 'complete',
    assertion: 'all-master-days-recovered',
    patches: [
      [
        'src/crdt/legacyImportPlan.ts',
        'addText(entry.content, null);',
        '/* deliberately omit master */',
      ],
      [
        'src/crdt/legacyImport.ts',
        'verifyImportedProjection(replay, plan, intent, claim.createdAt);',
        '/* deliberately skip semantic guard */',
      ],
    ],
  },
  {
    id: 'receipt-without-data',
    scenario: 'complete',
    assertion: 'slice-projection-guard',
    refusal: 'import-projection-mismatch',
    patches: [
      [
        'src/crdt/legacyImportPlan.ts',
        'applyImportAction(doc, plan.actions[cursor]!, intent, createdAt);',
        "if (plan.actions[cursor].kind !== 'text') applyImportAction(doc, plan.actions[cursor]!, intent, createdAt);",
      ],
    ],
  },
  {
    id: 'repeat-slice',
    scenario: 'repeat',
    assertion: 'slice-projection-guard',
    refusal: 'import-projection-mismatch',
    patches: [
      [
        'src/crdt/legacyImportPlan.ts',
        'applyImportAction(doc, plan.actions[cursor]!, intent, createdAt);',
        "applyImportAction(doc, plan.actions[cursor]!, intent, createdAt); if (plan.actions[cursor].kind === 'text') applyImportAction(doc, plan.actions[cursor]!, intent, createdAt);",
      ],
    ],
  },
  {
    id: 'trust-completion',
    scenario: 'missing',
    assertion: 'missing-slice-refuses',
    patches: [
      [
        'src/crdt/legacyImport.ts',
        'const doc = new Y.Doc({ gc: false });',
        "const doc = new Y.Doc({ gc: false }); if (claim.stage === 'imported') { rows.forEach(r => r.bytes.fill(0)); doc.destroy(); return plan.actions.length; }",
      ],
    ],
  },
  {
    id: 'ordinary-access',
    scenario: 'guards',
    assertion: 'ordinary-custody-refuses',
    patches: [
      [
        'src/crdt/legacyImportState.ts',
        "if (found) stopStartup('migration-required', 'pre-active-import-needs-owner');",
        'void found;',
      ],
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
  scope: 'pre-active-legacy-import',
  started: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  files: Object.fromEntries(Object.entries(originals).map(([p, b]) => [p, hash(b)])),
  checks: [],
  mutations: [],
  properties: null,
  rendererCrashes: 0,
  browser: null,
  limits: [
    'Seeded controller-owned Chromium exclusion only; source bytes retained. No production exclusion, selection or cleanup.',
    'Explicit Markdown/system adapter, no real cutover carrier selection or fidelity archive.',
    'Input-string oracle independent of importer/receipts; Yjs and serializer shared for CRDT mechanics. No general CRDT or performance proof.',
  ],
};
let browser, server;
const call = (page, method, ...args) =>
  page.evaluate(({ method, args }) => window.importFixture[method](...args), { method, args });
const ok = (r, message = 'import-progress-accepted') => {
  assert.equal(r.status, 'ok', `${message}: ${r.reason ?? ''}`);
  return r.value;
};
const arbitrary = fc.record({
  source: sourceArbitrary,
  schedule: fc.array(
    fc.record({ size: fc.integer({ min: 1, max: 32 }), abort: fc.boolean(), reopen: fc.boolean() }),
    { minLength: 1, maxLength: 6 },
  ),
});
const spec = () => ({
  source: { input: example(), disk: [0], wal: [1, 2] },
  schedule: [
    { size: 1, abort: true, reopen: true },
    { size: 7, abort: false, reopen: true },
  ],
});
async function variantRun(variant) {
  const name = variant?.id ?? 'baseline',
    folder = join(output, name);
  mkdirSync(folder);
  const tested = { ...originals };
  for (const [p, from, to] of variant?.patches ?? []) {
    const text = tested[p].toString();
    if (text.split(from).length !== 2) throw Error('Nonunique mutation anchor: ' + variant.id);
    tested[p] = Buffer.from(text.replace(from, to));
  }
  for (const [p, b] of Object.entries(tested)) {
    mkdirSync(resolve(folder, p, '..'), { recursive: true });
    writeFileSync(join(folder, p), b);
  }
  server = await createServer({
    configFile: false,
    root: folder,
    logLevel: 'error',
    cacheDir: join(folder, 'vite-cache'),
    optimizeDeps: { noDiscovery: true },
    server: { host: '127.0.0.1', port: 5196, strictPort: true, fs: { allow: [root] } },
  });
  await server.listen();
  const url = 'http://127.0.0.1:5196/test/legacy-import/index.html';
  let context, controller, handle, input, code, progress, sourceBefore, sourceInventory;
  const close = async () => {
    await controller?.close();
    controller = null;
  };
  const fresh = async (source = spec().source, size = 1) => {
    await close();
    context = await browser.newContext({ serviceWorkers: 'block' });
    controller = new SeededExclusion(context, url);
    await controller.installRoutes();
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => window.importFixture);
    input = await call(page, 'prepare', source);
    sourceBefore = input.sourceDigest;
    sourceInventory = await call(page, 'dump');
    handle = await controller.establish();
    handle.assert();
    code = await call(handle.page, 'enroll', input, size);
    progress = null;
  };
  const restart = async () => {
    const previous = handle;
    handle = await controller.establish();
    assert.throws(() => previous.assert());
    handle.assert();
  };
  const verifySource = async () => {
    handle.assert();
    assert.equal(await call(handle.page, 'sourceDigest'), sourceBefore, 'source-preserved');
    const now = await call(handle.page, 'dump');
    assert.deepEqual(
      JSON.parse(now.databases).done,
      JSON.parse(sourceInventory.databases).done,
      'source-native-bytes-preserved',
    );
    assert.deepEqual(now.local, sourceInventory.local, 'source-local-values-preserved');
  };
  const accept = async (method, ...args) => {
    const result = await call(handle.page, method, ...args);
    if (variant?.refusal && result.status === 'refused' && result.reason === variant.refusal) {
      const e = new assert.AssertionError({ message: variant.assertion });
      throw e;
    }
    return ok(result);
  };
  const complete = async (source = spec().source) => {
    if (!progress) progress = await accept('confirm', code);
    let rounds = 0;
    while (progress.stage !== 'imported') {
      const before = progress.committedSlices;
      progress = await accept('resume', code, input, 32);
      assert(
        progress.committedSlices > before && progress.committedSlices <= before + 32,
        'bounded-monotone-slices',
      );
      if (++rounds > 5000) throw Error('Nonterminating import');
    }
    await restart();
    const before = ok(await call(handle.page, 'state', code));
    assert.deepEqual(
      before.entries,
      expected(source.input).filter((e) => e.path !== 'unfiled.md'),
      'all-master-days-recovered',
    );
    assert.deepEqual(before.unfiled, [source.input.orphan], 'unfiled-recovered');
    assert(
      before.cards.every(
        (c) => c.author === 'system' && c.origin === null && c.createdAt === before.claim.createdAt,
      ),
      'system-attribution',
    );
    assert(
      before.rows.every((r) => r.length <= 16384),
      'bounded-record-size',
    );
    assert.equal(before.rows.length, progress.totalSlices, 'one-record-per-slice');
    const repeated = await accept('resume', code, input, 1);
    assert.deepEqual(repeated, progress, 'completed-resume-idempotent');
    assert.deepEqual(
      ok(await call(handle.page, 'state', code)),
      before,
      'no-repeated-native-writes',
    );
    await verifySource();
    const dump = await call(handle.page, 'dump');
    const dbs = JSON.parse(dump.databases),
      destination = JSON.stringify(
        Object.fromEntries(Object.entries(dbs).filter(([n]) => n !== 'done')),
      );
    assert(
      !destination.includes('journal-only') &&
        !destination.includes('Original text.') &&
        !destination.includes(code),
      'no-destination-plaintext-canaries',
    );
    assert(!dbs['done.slots']?.some((r) => r[2]?.stores?.length), 'destination-unselected');
    return before;
  };
  const check = async (id, fn) => {
    await fn();
    report.checks.push({ id, passed: true });
    process.stdout.write(`PASS ${id}\n`);
  };
  const kills = async (fault) => {
    await fresh(spec().source, 32);
    await call(handle.page, 'fault', fault);
    const pending = call(handle.page, 'complete', code, input).catch(() => {});
    await handle.page.waitForFunction(() => window.importFixture.gated(), null, { timeout: 20000 });
    const page = handle.page,
      cdp = await context.newCDPSession(page),
      died = page.waitForEvent('crash');
    void cdp.send('Page.crash').catch(() => {});
    await died;
    await page.close();
    await pending;
    report.rendererCrashes++;
    assert.throws(() => handle.assert());
    await restart();
    progress = await accept('resume', code, input, 1);
    const state = await complete();
    if (fault === 'kill-reservation')
      assert(state.rows[0].seq > 1, 'abandoned-reservation-stays-spent');
  };
  const history = async (value) => {
    await fresh(value.source, 1);
    progress = await accept('confirm', code);
    for (const step of value.schedule) {
      if (step.reopen) await restart();
      if (progress.stage === 'imported') break;
      const before = ok(await call(handle.page, 'state', code));
      if (step.abort) await call(handle.page, 'fault', 'abort-slice');
      const result = await call(handle.page, 'resume', code, input, step.size);
      if (step.abort) {
        assert.equal(result.status, 'refused', 'aborted-slice-refused');
        const after = ok(await call(handle.page, 'state', code));
        assert.deepEqual(after.rows, before.rows, 'aborted-slice-not-counted');
        assert.deepEqual(after.entries, before.entries, 'aborted-slice-not-visible');
      } else {
        progress = ok(result);
        assert(
          progress.committedSlices <= before.rows.length + step.size,
          'generated-slice-budget',
        );
      }
    }
    await complete(value.source);
  };
  try {
    if (variant?.id === 'repeat-slice') {
      const small = fc.record({
        source: fc.record({
          input: fc.record({
            master: fc
              .array(fc.constantFrom('a', 'b', '🔒'), { maxLength: 5 })
              .map((v) => v.join('')),
            suffix: fc.constant('!'),
            orphan: fc.constant(''),
            days: fc.constant([]),
          }),
          disk: fc.constant([0]),
          wal: fc.constant([1, 2]),
        }),
        schedule: fc.array(
          fc.record({
            size: fc.integer({ min: 1, max: 4 }),
            abort: fc.boolean(),
            reopen: fc.boolean(),
          }),
          { maxLength: 3 },
        ),
      });
      const result = await fc.check(fc.asyncProperty(small, history), { seed, numRuns: 20 });
      if (
        !result.failed ||
        !(result.errorInstance instanceof assert.AssertionError) ||
        !result.errorInstance.message.includes(variant.assertion)
      )
        throw result.errorInstance ?? Error('Generated control survived');
      writeFileSync(
        join(output, 'repeat-slice-counterexample.json'),
        JSON.stringify(result.counterexample[0], null, 2) + '\n',
      );
      report.mutations.push({
        id: variant.id,
        detected: true,
        assertion: variant.assertion,
        property: {
          seed,
          runs: result.numRuns,
          shrinks: result.numShrinks,
          path: result.counterexamplePath,
        },
        counterexample: 'repeat-slice-counterexample.json',
      });
      process.stdout.write(`DETECTED generated repeat-slice (${result.numShrinks} shrinks)\n`);
      return;
    }
    if (variant) {
      await fresh(spec().source, variant.scenario === 'repeat' ? 2 : 1);
      if (variant.scenario === 'receipt') {
        const result = await call(handle.page, 'receiptStress');
        if (result.status === 'refused' && result.reason === 'import-update-limit')
          assert.fail('receipt-output-bound');
        assert.equal(ok(result).slices, 2601);
      } else if (variant.scenario === 'missing') {
        await complete();
        await call(handle.page, 'mutate', 'slice');
        const r = await call(handle.page, 'resume', code, input, 32);
        assert.equal(r.status, 'refused', 'missing-slice-refuses');
      } else if (variant.scenario === 'guards') {
        progress = await accept('confirm', code);
        const guards = ok(await call(handle.page, 'guards', code));
        assert.equal(guards.raw.status, 'refused', 'ordinary-custody-refuses');
      } else await complete();
      throw Error('Mutant survived: ' + variant.id);
    }
    await check('receipt-history-output-bound', async () => {
      await fresh();
      const result = ok(await call(handle.page, 'receiptStress'));
      assert.equal(result.slices, 2601);
      assert(result.maximum <= 16384, 'receipt-output-bound');
      report.receiptStress = result;
    });
    await check('complete-ten-days', async () => {
      await fresh();
      await complete();
    });
    await check('confirmation-and-guards', async () => {
      await fresh();
      assert.equal((await call(handle.page, 'confirm', 'bad')).reason, 'confirmation-required');
      assert.equal(await call(handle.page, 'claim'), null, 'no-claim-before-confirmation');
      progress = await accept('confirm', code);
      const guards = ok(await call(handle.page, 'guards', code));
      assert.equal(guards.startup.kind, 'migration-required');
      assert.equal(guards.raw.status, 'refused', 'ordinary-custody-refuses');
      assert.equal(guards.indexResult.status, 'refused');
      assert.equal(guards.fresh.reason, 'unassigned-legacy-carrier');
      await verifySource();
    });
    await check('competing-intents-and-source-binding', async () => {
      await fresh();
      progress = await accept('confirm', code);
      const before = await call(handle.page, 'dump');
      const wrong = await call(handle.page, 'enroll', input, 1);
      assert.equal(
        (await call(handle.page, 'confirm', wrong)).reason,
        'import-destination-retains-material',
      );
      assert.equal(
        (await call(handle.page, 'resume', wrong, input)).reason,
        'import-unlock-failed',
      );
      assert.equal(
        (await call(handle.page, 'resume', code, { ...input, sourceDigest: '0'.repeat(64) }))
          .reason,
        'import-source-binding-mismatch',
      );
      assert.deepEqual(await call(handle.page, 'dump'), before, 'loser-does-not-remint');
    });
    await check('concurrent-creators-and-resumers', async () => {
      await fresh();
      const race = ok(await call(handle.page, 'raceEnroll', input));
      const winner = race.results.findIndex((r) => r.status === 'ok');
      assert(winner >= 0, 'one-enrollment-wins');
      assert.equal(race.results.filter((r) => r.status === 'ok').length, 1, 'one-enrollment-only');
      code = race.codes[winner];
      progress = race.results[winner].value;
      const resumed = (await call(handle.page, 'raceResume', code, input)).map((r) => ok(r));
      assert.deepEqual(
        resumed.map((r) => r.committedSlices).sort((a, b) => a - b),
        [2, 3],
        'resumers-serialize-without-duplicate-slice',
      );
      progress = resumed.find((r) => r.committedSlices === 3);
      await complete();
    });
    await check('claim-request-success-abort', async () => {
      await fresh();
      await call(handle.page, 'fault', 'abort-claim');
      assert.equal((await call(handle.page, 'confirm', code)).status, 'refused');
      assert.equal(await call(handle.page, 'claim'), null, 'claim-and-custody-atomic');
      const dump = JSON.parse((await call(handle.page, 'dump')).databases);
      assert.deepEqual(dump['done.custody'], []);
      code = await call(handle.page, 'enroll', input, 1);
      await complete();
    });
    await check('slice-request-success-abort', async () => {
      await fresh();
      await call(handle.page, 'fault', 'abort-slice');
      assert.equal((await call(handle.page, 'confirm', code)).status, 'refused');
      const state = ok(await call(handle.page, 'state', code));
      assert.equal(state.rows.length, 0, 'no-provisional-receipt');
      progress = await accept('resume', code, input, 1);
      assert(
        ok(await call(handle.page, 'state', code)).rows[0].seq > 1,
        'aborted-reservation-not-reused',
      );
      await complete();
    });
    for (const boundary of [
      'claim',
      'custody-complete',
      'progress-content',
      'content-witness',
      'content-counter',
      'witness-ready',
      'progress-importing',
      'reservation',
      'slice',
      'progress-imported',
    ])
      await check('renderer-death-after-' + boundary, () => kills('kill-' + boundary));
    for (const kind of ['counter', 'custody', 'slice', 'claim'])
      await check('damaged-' + kind, async () => {
        await fresh();
        await complete();
        await call(handle.page, 'mutate', kind);
        const r = await call(handle.page, 'resume', code, input);
        assert.equal(r.status, 'refused', 'damaged-import-refuses');
        await verifySource();
      });
    await check('long-utf16-boundaries', async () => {
      const source = spec().source;
      source.input.master = 'a'.repeat(1023) + '🔒' + 'é\n'.repeat(20000);
      source.input.orphan = 'Z'.repeat(40000);
      await fresh(source, 32);
      await complete(source);
    });
    let details;
    if (options.replay) {
      const input = JSON.parse(readFileSync(resolve(root, options.replay), 'utf8'));
      await history(input);
      details = { failed: false, numRuns: 1, replay: options.replay };
    } else {
      details = await fc.check(fc.asyncProperty(arbitrary, history), {
        seed,
        numRuns: runs,
        ...(options.path ? { path: options.path } : {}),
        endOnFailure: false,
      });
      if (details.failed)
        writeFileSync(
          join(output, 'counterexample.json'),
          JSON.stringify(details.counterexample[0], null, 2) + '\n',
        );
    }
    report.properties = {
      seed,
      runs: details.numRuns,
      failed: details.failed,
      shrinks: details.numShrinks ?? 0,
      path: details.counterexamplePath ?? null,
      error: details.errorInstance?.stack ?? null,
    };
    if (details.failed) throw details.errorInstance ?? Error('Property failure');
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
