/** Controlled seeded export capture and cold artifact verification. Never touches a real installation. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import * as fc from 'fast-check';
import { arbitrary } from './arbitrary.mjs';
import { checkEntries, example, dayText } from './oracle.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url));
const argv = process.argv.slice(2),
  options = {};
for (let i = 0; i < argv.length; i += 2) {
  const key = argv[i].slice(2);
  if (
    !argv[i].startsWith('--') ||
    !['output', 'seed', 'runs', 'path', 'replay'].includes(key) ||
    !argv[i + 1] ||
    options[key]
  )
    throw Error(
      'Options: --output dir --seed integer --runs positive --path fc-path --replay json',
    );
  options[key] = argv[i + 1];
}
const seed = Number(options.seed ?? 8941),
  runs = Number(options.runs ?? 60);
if (
  !Number.isSafeInteger(seed) ||
  !Number.isSafeInteger(runs) ||
  runs < 1 ||
  (options.path && !options.seed) ||
  (options.replay && options.path)
)
  throw Error('Invalid property options');
const replay = options.replay
  ? JSON.parse(readFileSync(resolve(root, options.replay), 'utf8'))
  : null;
const output = resolve(
  root,
  options.output ?? `test-results/legacy-export/${new Date().toISOString().replaceAll(':', '-')}`,
);
if (existsSync(output)) throw Error('Output exists');
mkdirSync(output, { recursive: true });
const hash = (b) => createHash('sha256').update(b).digest('hex');
const walk = (dir) =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
  );
const paths = [
  ...walk('src'),
  ...walk('test/legacy-export'),
  ...walk('scripts/legacy-export'),
  ...walk('test/legacy-source'),
  'test/storage-properties/oracle.ts',
  'test/legacyExport.test.ts',
  'wasm/journal-seal/seal.generated.ts',
  'package.json',
  'pnpm-lock.yaml',
  'docs/legacy-export-capture.md',
  'docs/storage-contract.md',
];
const hashes = () => Object.fromEntries(paths.map((p) => [p, hash(readFileSync(join(root, p)))]));
const report = {
  schema: 1,
  scope: 'seeded-legacy-export-capture',
  started: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: true,
  files: hashes(),
  browser: {},
  checks: [],
  artifacts: [],
  properties: null,
  mutations: [],
  rendererCrashes: 0,
  limits: [
    'Controller-owned disposable Chromium contexts, service workers blocked and only pinned fixtures admitted. Not production supported-version exclusion.',
    'Plaintext diagnostic source recovery plus an explicit Markdown preview; neither a fidelity archive nor a selected migration carrier.',
    'No destination custody/import/selection/deletion or full cutover kill matrix. Original source remains intact.',
    'External string/wire ledger and Python zipfile readback; Yjs shared for fixture production and CRDT replay. No independent CRDT correctness or performance claim.',
  ],
};
const originals = Object.fromEntries(paths.map((p) => [p, readFileSync(join(root, p))]));
const variants = [
  {
    id: 'ignore-text-item-kind',
    case: 'text-array',
    patches: [['src/crdt/legacyExport.ts', 'hasNonTextContent(text) ||', 'false ||']],
  },
  {
    id: 'omit-journal',
    case: 'positive',
    patches: [
      ['src/crdt/legacyExport.ts', '...source.journal.map(', '...source.journal.slice(0, 0).map('],
    ],
  },
  {
    id: 'last-three-days',
    case: 'positive',
    patches: [
      [
        'src/crdt/export.ts',
        'for (const date of listDays(doc))',
        'for (const date of listDays(doc).slice(-3))',
      ],
    ],
  },
  {
    id: 'ignore-pending',
    case: 'pending',
    patches: [
      [
        'src/crdt/legacyExport.ts',
        "if (source.dependencies !== 'complete') refuse('legacy-dependencies-missing');",
        'void source.dependencies;',
      ],
      [
        'src/crdt/legacyExport.ts',
        "if (hasPendingUpdates(doc)) refuse('legacy-dependencies-missing');",
        'void doc;',
      ],
    ],
  },
  {
    id: 'ignore-membership',
    case: 'membership',
    patches: [
      [
        'src/crdt/legacyExport.ts',
        "if (represented.size !== cards.size) refuse('legacy-membership-needs-repair');",
        'void represented;',
      ],
    ],
  },
  {
    id: 'ignore-digest',
    case: 'digest',
    patches: [
      [
        'src/crdt/legacyExport.ts',
        '!DIGEST.test(expectedDigest) || (await sha256(bytes)) !== expectedDigest',
        '!DIGEST.test(expectedDigest)',
      ],
    ],
  },
  {
    id: 'ignore-exclusion-loss',
    case: 'exclusion',
    patches: [['scripts/legacy-export/exclusion.mjs', 'this.#reason ||', 'false ||']],
  },
];
let browser, server;
const call = (page, method, ...args) =>
  page.evaluate(({ method, args }) => window.captureFixture[method](...args), { method, args });
const crash = async (context, page) => {
  const cdp = await context.newCDPSession(page),
    died = page.waitForEvent('crash');
  void cdp.send('Page.crash').catch(() => {});
  await died;
  await page.close();
  report.rendererCrashes++;
};
async function run(variant = null) {
  const label = variant?.id ?? 'baseline',
    folder = join(output, label);
  mkdirSync(folder);
  const tested = { ...originals };
  for (const [file, from, to] of variant?.patches ?? []) {
    const text = tested[file].toString();
    if (text.split(from).length !== 2) throw Error('Nonunique mutation anchor: ' + variant.id);
    tested[file] = Buffer.from(text.replace(from, to));
  }
  for (const [p, bytes] of Object.entries(tested)) {
    const target = join(folder, p);
    mkdirSync(resolve(target, '..'), { recursive: true });
    writeFileSync(target, bytes);
  }
  const { SeededExclusion, ExclusionLost } = await import(
    pathToFileURL(join(folder, 'scripts/legacy-export/exclusion.mjs')).href
  );
  server = await createServer({
    configFile: false,
    root: folder,
    logLevel: 'error',
    cacheDir: join(folder, 'vite-cache'),
    optimizeDeps: { noDiscovery: true },
    server: { host: '127.0.0.1', port: 5188, strictPort: true, fs: { allow: [root] } },
  });
  await server.listen();
  const url = 'http://127.0.0.1:5188/test/legacy-export/index.html';
  const context = await browser.newContext({ serviceWorkers: 'block' }),
    controller = new SeededExclusion(context, url);
  await controller.installRoutes();
  let handle,
    wire,
    input,
    disk,
    wal,
    count = 0;
  const seeded = async (
    spec = { input: example(), disk: [0], wal: [1, 2] },
    worker = false,
    mutation = null,
  ) => {
    controller.pause();
    const old = await context.newPage();
    old.setDefaultTimeout(15000);
    await old.goto(url.replace('index.html', 'old.html'));
    await old.waitForFunction(() => window.captureFixture);
    ({ input, disk, wal } = spec);
    wire = await call(old, 'prepare', input, disk, wal);
    if (mutation) await call(old, 'mutate', mutation);
    if (worker) await call(old, 'oldWorker');
    handle = await controller.establish();
    handle.assert();
  };
  const persistAndVerify = async (bundle) => {
    handle.assert();
    assert.equal(bundle.status, 'candidate', 'capture-candidate-required');
    assert.equal(bundle.preview, 'markdown-v1', 'preview-policy-explicit');
    const raw = Buffer.from(bundle.recovery),
      markdown = Buffer.from(bundle.markdown);
    assert.equal(hash(raw), bundle.recoveryDigest, 'recovery-bytes-match-record');
    assert.equal(hash(markdown), bundle.markdownDigest, 'markdown-bytes-match-record');
    const packet = JSON.parse(raw);
    const expectedRecords = [
      ...wal
        .map((id, i) => ({
          carrier: 'journal',
          id: `done.pending-update.done.fixture.${i}`,
          update: Buffer.from(wire[id]).toString('base64'),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      ...disk.map((id, i) => ({
        carrier: 'disk',
        id: 1 + i * 2,
        update: Buffer.from(wire[id]).toString('base64'),
      })),
    ];
    assert.deepEqual(packet.records, expectedRecords, 'original-wire-inventory-preserved');
    assert.ok(!raw.includes(Buffer.from('private-token')), 'ancillary-credentials-not-exported');
    const artifact = join(folder, 'artifacts', String(count++));
    mkdirSync(artifact, { recursive: true });
    writeFileSync(join(artifact, 'source.json.part'), raw);
    renameSync(join(artifact, 'source.json.part'), join(artifact, 'source.json'));
    writeFileSync(join(artifact, 'preview.zip'), markdown);
    writeFileSync(
      join(artifact, 'digests.json'),
      JSON.stringify({
        sourceDigest: bundle.sourceDigest,
        recoveryDigest: hash(raw),
        markdownDigest: hash(markdown),
      }) + '\n',
    );
    const before = await call(handle.page, 'inventory');
    const previous = handle;
    handle = await controller.establish();
    assert.throws(() => previous.assert(), ExclusionLost, 'old-exclusion-handle-expires');
    const fromDisk = readFileSync(join(artifact, 'source.json'));
    handle.assert();
    const recovered = await call(handle.page, 'replay', [...fromDisk], bundle.recoveryDigest);
    assert.equal(recovered.status, 'replayed', 'cold-file-replay');
    checkEntries(recovered.entries, input);
    const unzip = JSON.parse(
      execFileSync(
        process.env.PYTHON_PATH ?? 'python3',
        [join(folder, 'scripts/legacy-export/unzip.py'), join(artifact, 'preview.zip')],
        { encoding: 'utf8', timeout: 15000 },
      ),
    );
    checkEntries(unzip, input);
    assert.deepEqual(
      await call(handle.page, 'inventory'),
      before,
      'cold-replay-does-not-change-origin',
    );
    assert.equal(
      (await call(handle.page, 'inspect')).digest,
      bundle.sourceDigest,
      'source-still-matches-after-cold-replay',
    );
    handle.assert();
    if (!variant)
      report.artifacts.push({
        path: `${label}/artifacts/${count - 1}`,
        recoveryDigest: hash(raw),
        markdownDigest: hash(markdown),
        dayFiles: unzip.filter((e) => e.path.startsWith('days/')).length,
      });
    return bundle;
  };
  const positive = async () => {
    await seeded(undefined, true);
    assert.ok(
      controller.events.some((e) => e.closedWorkers === 1),
      'old-worker-closed',
    );
    const before = await call(handle.page, 'inventory');
    const bundle = await call(handle.page, 'capture');
    assert.deepEqual(
      await call(handle.page, 'inventory'),
      before,
      'capture-does-not-change-origin',
    );
    return persistAndVerify(bundle);
  };
  const negative = async (name) => {
    await seeded(undefined, false, name);
    const before = await call(handle.page, 'inventory');
    const result = await call(handle.page, 'capture');
    assert.equal(result.status, 'refused', `${name}-refuses-candidate`);
    assert.deepEqual(await call(handle.page, 'inventory'), before, `${name}-source-preserved`);
  };
  const digest = async () => {
    await seeded();
    const bundle = await call(handle.page, 'capture');
    assert.equal(bundle.status, 'candidate');
    const wrong = await call(handle.page, 'replay', bundle.recovery, '0'.repeat(64));
    assert.equal(wrong.reason, 'recovery-digest-mismatch', 'separate-digest-required');
    const partial = await call(
      handle.page,
      'replay',
      bundle.recovery.slice(0, -4),
      bundle.recoveryDigest,
    );
    assert.equal(partial.reason, 'recovery-digest-mismatch', 'partial-file-not-verified');
  };
  const exclusion = async () => {
    await seeded();
    const bundle = await call(handle.page, 'capture');
    assert.equal(bundle.status, 'candidate');
    await call(handle.page, 'forbiddenFetch');
    assert.throws(() => handle.assert(), ExclusionLost, 'exclusion-loss-refuses-verification');
  };
  const fixed = async (name, fn) => {
    await fn();
    if (!variant) report.checks.push({ id: name, passed: true });
  };
  try {
    if (variant) {
      try {
        await {
          positive,
          pending: () => negative('pending'),
          'text-array': () => negative('text-array'),
          membership: () => negative('membership'),
          digest,
          exclusion,
        }[variant.case]();
        return { id: label, detected: false };
      } catch (error) {
        if (!(error instanceof assert.AssertionError)) throw error;
        return {
          id: label,
          detected: true,
          assertion: error.message,
          patches: variant.patches,
          hashes: Object.fromEntries(variant.patches.map(([file]) => [file, hash(tested[file])])),
        };
      }
    }
    await fixed('ten-days-journal-unfiled-worker', positive);
    for (const name of [
      'pending',
      'unreadable',
      'schema',
      'membership',
      'path',
      'unknown-root',
      'text-array',
    ])
      await fixed(name, () => negative(name));
    await fixed('digest-and-partial-file', digest);
    await fixed('exclusion-route-loss', exclusion);
    await fixed('exclusion-new-page', async () => {
      await seeded();
      const bundle = await call(handle.page, 'capture');
      assert.equal(bundle.status, 'candidate');
      const unexpected = await context.newPage();
      assert.throws(() => handle.assert(), ExclusionLost, 'new-page-invalidates-capture');
      await unexpected.close();
      assert.throws(
        () => handle.assert(),
        ExclusionLost,
        'closing-page-does-not-restore-exclusion',
      );
    });
    await fixed('late-source-drift', async () => {
      await seeded();
      await call(handle.page, 'fault', 'late-source');
      const result = await call(handle.page, 'capture');
      assert.equal(result.reason, 'source-changed', 'late-source-invalidates-candidate');
    });
    await fixed('legacy-archive', async () => {
      const config = example();
      config.days[0].archive = dayText(config.days[0]);
      await seeded({ input: config, disk: [0], wal: [1, 2] });
      await persistAndVerify(await call(handle.page, 'capture'));
    });
    for (const boundary of [1, 2])
      await fixed('renderer-death-digest-' + boundary, async () => {
        await seeded();
        const before = await call(handle.page, 'inventory');
        await call(handle.page, 'startCapture', boundary);
        await handle.page.waitForFunction(() => window.captureFixture.gated());
        await crash(context, handle.page);
        handle = await controller.establish();
        assert.deepEqual(
          await call(handle.page, 'inventory'),
          before,
          'interrupted-capture-source-preserved',
        );
        await persistAndVerify(await call(handle.page, 'capture'));
      });
    await fixed('renderer-death-after-file-save', async () => {
      await seeded();
      const candidate = await call(handle.page, 'capture');
      const file = join(folder, 'prekill-source.json');
      writeFileSync(file, Buffer.from(candidate.recovery));
      await crash(context, handle.page);
      handle = await controller.establish();
      const result = await call(
        handle.page,
        'replay',
        [...readFileSync(file)],
        candidate.recoveryDigest,
      );
      assert.equal(result.status, 'replayed');
      checkEntries(result.entries, input);
      assert.equal((await call(handle.page, 'inspect')).digest, candidate.sourceDigest);
    });
    let comparisons = 0;
    const history = async (spec) => {
      await seeded(spec);
      await persistAndVerify(await call(handle.page, 'capture'));
      comparisons += 4;
    };
    if (replay) {
      await history(replay);
      report.properties = { replay, comparisons, failed: false };
    } else {
      const detail = await fc.check(fc.asyncProperty(arbitrary, history), {
        seed,
        numRuns: runs,
        ...(options.path ? { path: options.path } : {}),
      });
      report.properties = {
        seed: detail.seed,
        numRuns: detail.numRuns,
        numShrinks: detail.numShrinks,
        path: detail.counterexamplePath,
        failed: detail.failed,
        comparisons,
        counterexample: detail.counterexample,
        error: detail.errorInstance?.message ?? null,
      };
      if (detail.failed) {
        writeFileSync(
          join(output, 'counterexample.json'),
          JSON.stringify(detail.counterexample[0], null, 2) + '\n',
        );
        throw detail.errorInstance ?? Error('Property failed');
      }
    }
    console.log(
      `baseline: ${report.checks.length} named checks, ${replay ? 'replay' : runs + ' generated histories'} passed`,
    );
    report.exclusion = controller.events;
    for (const [p, b] of Object.entries(tested))
      assert.equal(hash(readFileSync(join(folder, p))), hash(b), 'tested-snapshot-changed');
    return null;
  } finally {
    await controller.close();
    await server.close();
    server = null;
  }
}
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH ?? chromium.executablePath(),
  });
  report.browser = {
    version: browser.version(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  };
  await run();
  for (const variant of variants) {
    const result = await run(variant);
    report.mutations.push(result);
    console.log(`${variant.id}: ${result.detected ? 'detected' : 'survived'}`);
  }
  assert.ok(
    report.mutations.every((m) => m.detected),
    'every-mutation-detected',
  );
  assert.deepEqual(hashes(), report.files, 'recorded-input-changed');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = { name: error.name, message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await server?.close();
  await browser?.close();
  report.finished = new Date().toISOString();
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.status}: ${join(output, 'report.json')}`);
}
