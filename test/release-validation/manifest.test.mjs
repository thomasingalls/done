import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as fc from 'fast-check';
import { catalogueCensus, directNodeCensus } from '../../scripts/release-validation/census.mjs';
import {
  compileManifest,
  selectStages,
  assertManifestCoverage,
  boundedStage,
} from '../../scripts/release-validation/manifest.mjs';
import { packageGraph } from '../../scripts/release-validation/inventory.mjs';
import { digest } from '../../scripts/release-validation/identity.mjs';
import {
  preparationCampaign,
  preparationCommand,
  preparationTestStage,
} from '../../scripts/release-validation/command-wrappers.mjs';

test('preparation wrappers retain grouped Node execution and vector aliases share only exact invocations', () => {
  const inventory = JSON.parse(readFileSync('docs/release-validation-graph.json'));
  const plan = compileManifest(process.cwd(), inventory);
  const selected = selectStages(plan, 'wrapper-preparation');
  assert.equal(selected.length, 31);
  assert.equal(selected.filter((s) => s.id.startsWith('vector:')).length, 29);
  assert.equal(new Set(selected.map((s) => digest(s.argv))).size, selected.length);
  const tests = selected.find((s) => s.variant === 'crypto-preparation-tests-v1');
  assert.equal(tests.expect.cases.length, 6);
  assert.equal(tests.argv.includes('--test-concurrency=1'), false);
  assert.deepEqual(tests.dependsOn, ['campaign:' + preparationCampaign]);
  assert.throws(() => selectStages(plan, 'release'), /Unresolved/);
  const changed = structuredClone(inventory);
  changed.extraRoots.push(
    { id: 'vector-variant', argv: [...inventory.vectors[0].argv, '--changed'] },
    { id: 'prep-record', argv: ['node', preparationCampaign, '--record'] },
  );
  const variants = compileManifest(process.cwd(), changed);
  for (const id of ['command:vector-variant:0', 'command:prep-record:0'])
    assert(variants.rows.find((r) => r.id === id).blocked, id);
});

test('160 generated wrapper argument and environment variants cannot borrow a check receipt', () => {
  const command = { argv: ['node', preparationCampaign], env: {} };
  assert.deepEqual(preparationCommand(process.cwd(), command, 'check'), {
    requires: ['campaign:' + preparationCampaign],
  });
  fc.assert(
    fc.property(fc.string({ maxLength: 60 }), (value) => {
      for (const changed of [
        { ...command, env: { MODE: value } },
        { ...command, argv: [...command.argv, value] },
        { ...command, argv: [command.argv.join(' ')] },
      ])
        assert.equal(preparationCommand(process.cwd(), changed, 'check'), null);
    }),
    { seed: 150931, numRuns: 160 },
  );
});

test('report-writing preparation remains a separate variant with required retained output', () => {
  const inventory = JSON.parse(readFileSync('docs/release-validation-graph.json'));
  const plan = compileManifest(process.cwd(), inventory);
  const stages = selectStages(plan, 'wrapper-file-output');
  assert.equal(stages.length, 2);
  const report = stages.find((s) => s.id === 'variant:preparation-reports');
  assert.equal(report.expect.cases.length, 1);
  assert.deepEqual(report.fileOutputs.required, ['contract-probes.json']);
  const ordinary = selectStages(plan, 'wrapper-preparation');
  assert(
    ordinary.every((s) => !s.fileOutputs),
    'Do not silently add an environment variant to the package command',
  );
  assert(plan.rows.find((r) => r.id === 'campaign:scripts/account-core/run.mjs').blocked);
});

test('a changed preparation shell glob refuses before losing or inventing a test file', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'done-wrapper-glob-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'test/account-crypto-prep');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'census.test.mjs'), '');
  assert.throws(
    () => preparationTestStage(root, 'prep'),
    /changed crypto preparation command glob/,
  );
  writeFileSync(join(dir, 'contracts.test.mjs'), '');
  writeFileSync(join(dir, 'new.test.mjs'), '');
  assert.throws(
    () => preparationTestStage(root, 'prep'),
    /changed crypto preparation command glob/,
  );
});

test('finite catalogue evaluation expands real crash boundaries and keeps discriminating mutations', () => {
  const genesis = catalogueCensus(readFileSync('scripts/local-genesis/catalog.mjs', 'utf8'));
  assert.equal(genesis.cases.length, 17);
  assert.equal(genesis.mutants.length, 4);
  assert(genesis.cases.some((c) => c.id === 'G03.kill-claim'));
  assert(genesis.cases.some((c) => c.id === 'G11.kill-index'));
  assert.equal(
    genesis.mutants.find((m) => m.id === 'forget-completed-stage').assertion,
    'missing-complete-refuses',
  );
  const clear = catalogueCensus(readFileSync('scripts/local-clear/catalog.mjs', 'utf8'));
  assert.equal(clear.cases.length, 17);
  assert.equal(clear.cases.filter((c) => c.id.includes('.kill-')).length, 7);
});

test('catalogue code, unknown expressions and unbound mutations refuse without executing', () => {
  const valid =
    "export const cases = [{id: 'C01.a'}]; export const mutants = [{id: 'omit', case: 'C01.a', assertion: 'specific-refusal'}];";
  for (const text of [
    "throw Error('must never execute');" + valid,
    "import './side-effect.mjs';" + valid,
    valid.replace("[{id: 'C01.a'}]", 'unknown()'),
    valid.replace("case: 'C01.a'", "case: 'C01.absent'"),
  ])
    assert.throws(() => catalogueCensus(text), /Unresolved|Unbound/);
});

test('direct Node census refuses dynamic, nested, conditional and filtered declarations', () => {
  const prefix = "import test from 'node:test';";
  assert.deepEqual(directNodeCensus('test/x.mjs', prefix + "test('a', () => {});"), [
    { id: 'test/x.mjs::a', outcome: 'pass' },
  ]);
  for (const text of [
    "for (const x of ['a']) test(x, () => {});",
    "if (true) test('a', () => {});",
    "test.skip('a', () => {});",
    "test('a', t => t.test('nested', () => {}));",
    "const register = test; register('a', () => {});",
    "test('a', () => {}); test('a', () => {});",
  ])
    assert.throws(
      () => directNodeCensus('test/x.mjs', prefix + text),
      /Unresolved|Dynamic|duplicate/,
    );
});

test('manifest keeps full file, catalogue, construction and wrapper-variant obligations separate', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'done-manifest-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(
    'scripts/x/catalog.mjs',
    "export const cases = [{id: 'C01.a'}]; export const mutants = [{id: 'omit', case: 'C01.a', assertion: 'specific-refusal'}];",
  );
  const inventory = {
    tests: [
      {
        path: 'test/x.test.mjs',
        status: 'required',
        invocation: { argv: ['node', '--test', 'test/x.test.mjs'] },
      },
    ],
    catalogues: [
      { path: 'scripts/x/catalog.mjs', runner: 'scripts/x/run.mjs', disposition: 'required' },
    ],
    vectors: [{ path: 'test/vectors/x.json', argv: ['node', 'scripts/x/vectors.mjs', '--check'] }],
    packageDispositions: { required: ['check'] },
    packageGraph: packageGraph({
      check:
        'MODE=a node scripts/x/run.mjs && MODE=b node scripts/x/run.mjs && node scripts/check-traceability.mjs --check',
    }),
    extraRoots: [{ id: 'before', argv: ['node', 'scripts/profile.mjs', '063cd72'] }],
    campaigns: [
      { path: 'scripts/x/run.mjs', disposition: 'required-or-transitive', runCallSites: [] },
    ],
    constructions: [
      {
        id: 'contract',
        tests: ['test/x.test.mjs'],
        vectorCases: ['x'],
        vectorFile: 'test/vectors/x.json',
        requirements: ['binding'],
      },
    ],
  };
  const plan = compileManifest(root, inventory);
  assert.equal(plan.rows.find((r) => r.id === 'command:check:0').env.MODE, 'a');
  assert.equal(plan.rows.find((r) => r.id === 'command:check:1').env.MODE, 'b');
  assert.deepEqual(plan.rows.find((r) => r.id === 'command:check:2').orderedAfter, [
    'command:check:1',
  ]);
  assert.equal(plan.rows.find((r) => r.id === 'command:before:0').argv.at(-1), '063cd72');
  assert.deepEqual(plan.rows.find((r) => r.id === 'construction:contract').requires, [
    'test:test/x.test.mjs',
    'vector:test/vectors/x.json',
  ]);
  assert.equal(selectStages(plan, 'vectors').length, 1);
  assert.throws(() => selectStages(plan, 'release'), /Unresolved/);
  const changed = structuredClone(inventory);
  changed.extraRoots.pop();
  assert.notEqual(digest(compileManifest(root, changed)), digest(plan));
  const lost = structuredClone(plan);
  lost.rows = lost.rows.filter((r) => r.id !== 'test:test/x.test.mjs');
  lost.selections.release = lost.selections.release.filter((id) => id !== 'test:test/x.test.mjs');
  assert.throws(() => assertManifestCoverage(lost, inventory), /independently required/);
});

test('resolved receipt dependencies survive transitive aliases and cannot be reordered or cycled', () => {
  const stage = (id) =>
    boundedStage(id, ['node', 'scripts/' + id + '.mjs'], { kind: 'exit', exitCodes: [0] });
  const plan = {
    selections: { release: ['trace', 'vectors'] },
    rows: [
      { id: 'vectors', stage: stage('vectors') },
      { id: 'alias', requires: ['vectors'] },
      { id: 'trace', stage: stage('trace'), orderedAfter: ['alias'] },
    ],
  };
  const selected = selectStages(plan, 'release');
  assert.deepEqual(
    selected.map((s) => s.id),
    ['vectors', 'trace'],
  );
  assert.deepEqual(selected[1].dependsOn, ['vectors']);
  plan.rows[0].orderedAfter = ['trace'];
  assert.throws(() => selectStages(plan, 'release'), /cycle/);
});

test('160 generated catalogue case omissions change the exact denominator independently of outcomes', () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 40 }), { minLength: 2, maxLength: 15 }),
      (ids) => {
        const source = (values) =>
          `export const cases = ${JSON.stringify(values.map((id) => ({ id: 'C01.' + id })))}; export const mutants = [{id: 'omit', case: 'C01.${ids[0]}', assertion: 'expected-assertion'}];`;
        const all = catalogueCensus(source(ids)),
          missing = catalogueCensus(source(ids.slice(0, -1)));
        assert.deepEqual(
          all.cases.map((c) => c.id),
          ids.map((id) => 'C01.' + id),
        );
        assert.notEqual(digest(all), digest(missing));
      },
    ),
    { seed: 130902, numRuns: 160 },
  );
});
