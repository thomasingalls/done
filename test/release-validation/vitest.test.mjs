import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as fc from 'fast-check';
import { vitestCensus } from '../../scripts/release-validation/vitest-census.mjs';
import {
  propertyFiles,
  reconcileVitest,
  vitestStage,
} from '../../scripts/release-validation/vitest-adapter.mjs';
import { validateStage } from '../../scripts/release-validation/stage.mjs';
import { buildInventory } from '../../scripts/release-validation/inventory.mjs';
import { compileManifest, selectStages } from '../../scripts/release-validation/manifest.mjs';

const source = (body) => "import { it, describe } from 'vitest';" + body;
const report = (cases) => ({
  schema: 1,
  adapter: 'vitest-v1',
  nonce: 'fresh',
  reason: 'passed',
  errors: [],
  modules: [{ file: 'test/x.test.ts', state: 'passed' }],
  cases: cases.map((c) => ({
    ...c,
    durationMs: 1,
    retryCount: 0,
    repeatCount: 0,
    expectedFailure: false,
    mode: 'run',
    errors: [],
  })),
});

test('Vitest census expands literal nested suites and scalar tables without importing test code', () => {
  const cases = vitestCensus(
    'test/x.test.ts',
    source(`
    throw Error('must not execute');
    describe('outer', () => {
      describe('inner', () => { it.each(['a', false, 2] as const)('case %s', () => {}); });
      it('literal', async () => {}, 60_000);
    });
  `),
  );
  assert.deepEqual(
    cases.map((c) => JSON.parse(c.id.split('::')[1])),
    [
      ['outer', 'inner', 'case a'],
      ['outer', 'inner', 'case false'],
      ['outer', 'inner', 'case 2'],
      ['outer', 'literal'],
    ],
  );
  assert.equal(
    vitestCensus('test/x.test.ts', "import {test as check} from 'vitest';check('x',()=>{});")
      .length,
    1,
  );
});

test('Vitest census refuses conditional, aliased, modified, nested and unknown generated registration', () => {
  for (const body of [
    "if (true) it('a', () => {});",
    'for (const x of getTable()) it(x, () => {});',
    "it.skip('a', () => {});",
    "it.only('a', () => {});",
    "it.fails('a', () => {});",
    "const register = it; register('a', () => {});",
    "it('a', () => { it('b', () => {}); });",
    "it.each(getTable())('case %s', () => {});",
    "it.each(['a','a'])('case %s', () => {});",
    "describe('a', async () => { it('x', () => {}); });",
    "it('a', {retry: 1}, () => {});",
    "it('a', function* () {});",
  ])
    assert.throws(
      () => vitestCensus('test/x.test.ts', source(body)),
      /Unresolved|certified|duplicate/,
    );
});

test('the five reviewed property suites have 63 exact cases; other test-file and wrapper credit stays separate', () => {
  const counts = propertyFiles.map((file) => {
    const stage = vitestStage(process.cwd(), file);
    validateStage(stage);
    assert.equal(stage.deadlineMs, 180000);
    assert.equal(stage.graceMs, 5000);
    return stage.expect.cases.length;
  });
  assert.deepEqual(counts, [4, 25, 13, 10, 11]);
  const batch = readFileSync('test/spoolBatch.test.ts', 'utf8');
  assert(batch.includes('{ seed: 1209032, numRuns: 120 }'));
  assert(batch.includes('}, 60_000);'));
});

test('Vitest stage cannot bypass its exact reporter, one-file selection or environment contract', () => {
  const stage = vitestStage(process.cwd(), propertyFiles[0]);
  for (const alter of [
    (s) => s.argv.push('--testNamePattern=one'),
    (s) => {
      s.argv[2] = 'list';
    },
    (s) => {
      s.expect.kind = 'exit';
      s.expect.exitCodes = [0];
    },
    (s) => {
      s.env = { MODE: 'before' };
    },
    (s) => {
      s.expect.files[0] = '--testNamePattern=one';
      s.argv[s.argv.length - 1] = s.expect.files[0];
    },
    (s) => {
      s.fixture = { kind: 'chromium-cdp', startupMs: 1000 };
    },
  ]) {
    const changed = structuredClone(stage);
    alter(changed);
    assert.throws(() => validateStage(changed));
  }
});

test('manifest selects all five properties and refuses a lost file without crediting their wrappers', () => {
  const inventory = buildInventory(
    process.cwd(),
    JSON.parse(readFileSync('scripts/release-validation/policy.json')),
  );
  const plan = compileManifest(process.cwd(), inventory);
  const stages = selectStages(plan, 'vitest-properties');
  assert.deepEqual(stages.map((s) => s.id).sort(), propertyFiles.map((f) => 'test:' + f).sort());
  assert.equal(
    stages.reduce((n, s) => n + s.expect.cases.length, 0),
    63,
  );
  const wholeVitest = plan.rows.filter((r) => r.kind === 'command' && r.argv[0] === 'vitest');
  assert(wholeVitest.length > 0 && wholeVitest.every((r) => r.blocked));
  assert(plan.rows.find((r) => r.id === 'campaign:scripts/legacy-cleanup/run.mjs').blocked);
  assert.throws(() => selectStages(plan, 'release'), /Unresolved/);
  inventory.tests = inventory.tests.filter((t) => t.path !== propertyFiles[0]);
  assert.throws(() => compileManifest(process.cwd(), inventory), /lost a test file/);
});

test('160 generated Vitest populations reject omissions, skips, stale reports and false completion', () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 100 }), { minLength: 2, maxLength: 18 }),
      (ids) => {
        const cases = vitestCensus(
          'test/x.test.ts',
          source(
            `describe('suite', () => {it.each(${JSON.stringify(ids)})('case %s', () => {});});`,
          ),
        );
        assert.deepEqual(
          cases.map((c) => JSON.parse(c.id.split('::')[1]).at(-1)),
          ids.map((id) => 'case ' + id),
        );
        const expected = { files: ['test/x.test.ts'], cases };
        reconcileVitest(expected, report(cases), 'fresh');
        for (const change of [
          (r) => r.cases.pop(),
          (r) => {
            r.cases = [];
          },
          (r) => r.cases.push(r.cases[0]),
          (r) => {
            r.cases[0].outcome = 'skipped';
          },
          (r) => {
            r.reason = 'running';
          },
          (r) => {
            r.nonce = 'old';
          },
          (r) => {
            r.modules[0].state = 'failed';
          },
          (r) => {
            r.modules = [];
          },
          (r) => r.modules.push(r.modules[0]),
          (r) => r.errors.push('unhandled'),
          (r) => {
            r.cases[0].retryCount = 1;
          },
          (r) => {
            r.cases[0].repeatCount = 1;
          },
          (r) => {
            r.cases[0].expectedFailure = true;
          },
          (r) => {
            r.cases[0].mode = 'only';
          },
          (r) => {
            r.cases[0].durationMs = null;
          },
          (r) => r.cases[0].errors.push('hidden failure'),
        ]) {
          const r = report(cases);
          change(r);
          assert.throws(() => reconcileVitest(expected, r, 'fresh'));
        }
      },
    ),
    { seed: 130918, numRuns: 160 },
  );
});
