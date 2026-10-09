import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import * as fc from 'fast-check';
import {
  packageGraph,
  flattenPackages,
  sourceFacts,
  buildInventory,
  assertSnapshot,
} from '../../scripts/release-validation/inventory.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'done-validation-graph-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, data) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof data === 'string' ? data : JSON.stringify(data));
  };
  const policy = {
    schema: 1,
    scope: 'Fixture only',
    limits: [],
    packages: {
      required: ['check'],
      alias: ['vectors:check'],
      'optional-check': [],
      development: [],
      generator: [],
    },
    extraRoots: [],
    campaignExceptions: {},
    campaignParents: {},
    testExclusions: {},
    playwright: {},
    vectorGenerators: { 'test/vectors/example.json': 'scripts/example/vectors.mjs' },
    vectorExclusions: {},
  };
  const pkg = {
    scripts: {
      check: 'pnpm vectors:check && node scripts/example/run.mjs',
      'vectors:check': 'node scripts/example/vectors.mjs --check',
    },
  };
  const registry = {
    vectorFile: 'test/vectors/example.json',
    additionalCorpora: [],
    constructions: [
      {
        id: 'example',
        phase: 'A',
        status: 'specified',
        tests: ['test/example/properties.test.mjs'],
        vectorCases: ['example'],
        requirements: ['input-mutations'],
      },
    ],
  };
  write('package.json', pkg);
  write('.oxfmtrc.json', { printWidth: 100 });
  for (const path of ['pnpm-lock.yaml', 'pnpm-workspace.yaml', 'vite.config.ts']) write(path, '');
  write('vite/fixture.ts', 'export const fixture = true;');
  write(
    'scripts/example/run.mjs',
    "const stages = ['properties', 'controls']; stages.map(n => `test/example/${n}.test.mjs`); run('native', ['--test', paths], 60000);",
  );
  write('scripts/example/vectors.mjs', '// no execution during inventory');
  write('scripts/example/catalog.mjs', "export const cases = [['C01.example', 'case']];");
  write(
    'test/example/properties.test.mjs',
    "import fc from 'fast-check'; test('family', async () => { await fc.assert(fc.asyncProperty(fc.integer(), async () => {})); });",
  );
  write('test/example/helper.mjs', '// helper version one');
  write('test/vectors/example.json', { vectors: [{ id: 'example' }] });
  write('docs/account-crypto/constructions.json', registry);
  write('scripts/release-validation/policy.json', policy);
  return { root, write, policy, pkg, registry, build: () => buildInventory(root, policy) };
}

test('160 generated package DAGs preserve exact ordered leaves and duplicate prerequisites', () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 9 }),
      (widths) => {
        const scripts = {},
          expected = [];
        for (let i = 0; i < widths.length; i++) {
          const dependencies = Array.from({ length: i ? widths[i] : 0 }, () => 'pnpm p' + (i - 1));
          scripts['p' + i] = [...dependencies, 'node scripts/check-' + i + '.mjs'].join(' && ');
          const prior = i ? expected[i - 1] : [];
          expected.push([
            ...Array.from({ length: dependencies.length }, () => prior).flat(),
            ['node', 'scripts/check-' + i + '.mjs'],
          ]);
        }
        const graph = packageGraph(scripts);
        assert.deepEqual(
          flattenPackages(graph, 'p' + (widths.length - 1)).map((x) => x.argv),
          expected.at(-1),
        );
      },
    ),
    { seed: 130901, numRuns: 160 },
  );
});
test('cycles, missing package references and unsupported shell syntax are refused', () => {
  assert.throws(() => packageGraph({ a: 'pnpm b', b: 'pnpm a' }), /cycle/);
  assert.throws(() => packageGraph({ a: 'pnpm absent' }), /Missing package/);
  for (const body of [
    'node x; node y',
    'node x | node y',
    'node `x`',
    'node $(x)',
    'node x > output',
  ])
    assert.throws(() => packageGraph({ a: body }), /Unsupported/);
});
test('environment, argument variants and paths stay distinct across package expansion', () => {
  const graph = packageGraph({
    all: 'MODE=outer pnpm check && node x --case a && node x --case b',
    check: 'MODE=inner node x',
  });
  const rows = flattenPackages(graph, 'all');
  assert.deepEqual(rows[0], { argv: ['node', 'x'], env: { MODE: 'inner' }, via: ['all', 'check'] });
  assert.notDeepEqual(rows[1].argv, rows[2].argv);
});
test('AST facts exclude comments/strings and preserve dynamic call-site uncertainty', () => {
  const facts = sourceFacts(
    'x.ts',
    `// test('fake', () => {})\nconst s = "fc.property(fake)";\nfor (const n of names) test(n, async () => fc.asyncProperty(x, f));\nrun(name, args, deadline);`,
  );
  assert.equal(facts.tests.length, 1);
  assert.equal(facts.tests[0].title, 'n');
  assert.equal(facts.properties.length, 1);
  assert.deepEqual(facts.runCalls[0].arguments, ['name', 'args', 'deadline']);
});
test('the inventory includes direct coverage, dynamic properties, catalogs and registered corpus bindings', (t) => {
  const f = fixture(t),
    graph = f.build();
  assert.equal(graph.counts.requiredTestFiles, 1);
  assert.equal(graph.tests[0].propertyFamilies.length, 1);
  assert.deepEqual(graph.tests[0].invocation.argv, [
    'node',
    '--test',
    '--test-concurrency=1',
    'test/example/properties.test.mjs',
  ]);
  assert.equal(graph.catalogues[0].runner, 'scripts/example/run.mjs');
  assert.equal(graph.constructions[0].vectorFile, 'test/vectors/example.json');
  assert.deepEqual(graph.constructions[0].requirements, ['input-mutations']);
});
test('real added test, changed helper and lost package wiring invalidate a retained snapshot', (t) => {
  const f = fixture(t),
    before = JSON.stringify(f.build(), null, 2) + '\n';
  assertSnapshot(f.build(), before);
  f.write('test/example/later.test.mjs', "test('new case', () => {});");
  assert.throws(() => assertSnapshot(f.build(), before), /drifted/);
  rmSync(join(f.root, 'test/example/later.test.mjs'));
  f.write('test/example/helper.mjs', '// helper version two');
  assert.throws(() => assertSnapshot(f.build(), before), /drifted/);
  f.write('test/example/helper.mjs', '// helper version one');
  f.pkg.scripts.check = 'pnpm vectors:check';
  f.write('package.json', f.pkg);
  assert.throws(() => f.build(), /Unclassified campaign/);
});
test('missing or excluded registered tests and removed vector cases fail before snapshotting', (t) => {
  const f = fixture(t);
  f.policy.testExclusions['test/example/properties.test.mjs'] =
    'Deliberately invalid proposed exclusion of an active construction test.';
  assert.throws(() => f.build(), /Uncovered registered test/);
  delete f.policy.testExclusions['test/example/properties.test.mjs'];
  f.write('test/vectors/example.json', { vectors: [] });
  assert.throws(() => f.build(), /Uncovered registered vector/);
  f.write('test/vectors/example.json', { vectors: [{ id: 'example' }] });
  rmSync(join(f.root, 'test/example/properties.test.mjs'));
  assert.throws(() => f.build(), /Uncovered registered test/);
});
test('new nested corpus, orphan catalogue and new package require explicit review', (t) => {
  const f = fixture(t);
  f.write('test/example/new.test.cjs', 'throw Error("unknown family");');
  assert.throws(() => f.build(), /Unrecognized test file kind/);
  rmSync(join(f.root, 'test/example/new.test.cjs'));
  f.write('test/vectors/nested/new.json', {});
  assert.throws(() => f.build(), /nested vector corpus/);
  rmSync(join(f.root, 'test/vectors/nested/new.json'));
  f.write('scripts/unknown/catalog.mjs', 'export const cases=[];');
  assert.throws(() => f.build(), /Unmapped catalogue/);
  rmSync(join(f.root, 'scripts/unknown/catalog.mjs'));
  f.pkg.scripts.unclassified = 'node new.mjs';
  f.write('package.json', f.pkg);
  assert.throws(() => f.build(), /one disposition/);
});
test('generator prerequisite omission and stale/duplicate policy entries are refused', (t) => {
  const f = fixture(t);
  f.pkg.scripts['vectors:check'] = 'node scripts/other.mjs';
  f.write('package.json', f.pkg);
  assert.throws(() => f.build(), /Generator missing/);
  f.pkg.scripts['vectors:check'] = 'node scripts/example/vectors.mjs --check';
  f.write('package.json', f.pkg);
  f.policy.packages.alias.push('check');
  assert.throws(() => f.build(), /Duplicate package/);
  f.policy.packages.alias.pop();
  f.policy.testExclusions['test/absent.test.mjs'] =
    'Nonexistent test cannot be silently excluded from inventory.';
  assert.throws(() => f.build(), /Stale exclusion/);
});
test('the checker imports no test bodies or runner modules', (t) => {
  const f = fixture(t);
  f.write(
    'test/example/properties.test.mjs',
    "throw Error('must never execute'); test('case', () => {});",
  );
  f.write('scripts/example/run.mjs', "throw Error('must never execute runner');");
  assert.equal(f.build().counts.requiredTestFiles, 1);
});
