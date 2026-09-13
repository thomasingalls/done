import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as fc from 'fast-check';
import {
  generalTestPolicy,
  assertGeneralTestPopulation,
  nodeProtocolStage,
} from '../../scripts/release-validation/general-tests.mjs';
import {
  propertyFiles,
  vitestArgv,
  vitestStage,
} from '../../scripts/release-validation/vitest-adapter.mjs';
import { buildInventory } from '../../scripts/release-validation/inventory.mjs';
import { compileManifest, selectStages } from '../../scripts/release-validation/manifest.mjs';
import { validateStage } from '../../scripts/release-validation/stage.mjs';

const inventory = () =>
  buildInventory(process.cwd(), JSON.parse(readFileSync('scripts/release-validation/policy.json')));

test('reviewed Vitest and Node selections preserve the 1281-case file denominator and separate wrapper obligations', () => {
  const p = generalTestPolicy(process.cwd()),
    m = compileManifest(process.cwd(), inventory());
  assert.equal(p.vitest.length, 77);
  assert.equal(p.node.length, 10);
  const general = selectStages(m, 'general-tests');
  assert.equal(general.length, 141);
  assert.equal(
    general.reduce((n, s) => n + s.expect.cases.length, 0),
    1281,
  );
  assert.equal(selectStages(m, 'vitest-reviewed').length, 96);
  assert.equal(
    selectStages(m, 'node-protocol').reduce((n, s) => n + s.expect.cases.length, 0),
    66,
  );
  assert.equal(
    selectStages(m, 'vitest-properties').reduce((n, s) => n + s.expect.cases.length, 0),
    62,
  );
  for (const s of general) {
    validateStage(s);
    assert.equal(s.deadlineMs, 180000);
  }
  assert(
    m.rows.filter((r) => r.kind === 'command' && r.argv[0] === 'vitest').every((r) => r.blocked),
  );
  assert(m.rows.find((r) => r.id === 'campaign:scripts/account-counter-contract/run.mjs').blocked);
  assert.throws(() => selectStages(m, 'release'), /Unresolved/);
});

test('new literal test files remain blocked until their fixture/process ownership is explicitly reviewed', () => {
  const i = inventory();
  i.tests.push({
    path: 'test/unreviewed.test.ts',
    status: 'required',
    invocation: {
      argv: ['node', 'node_modules/vitest/vitest.mjs', 'run', 'test/unreviewed.test.ts'],
    },
  });
  const m = compileManifest(process.cwd(), i);
  assert(m.rows.find((r) => r.id === 'test:test/unreviewed.test.ts').blocked);
  assert(!m.selections['general-tests'].includes('test:test/unreviewed.test.ts'));
});

test('reviewed filenames include dotted names and vite tests but never options or directory traversal', () => {
  for (const file of [
    'test/membership.property.test.ts',
    'vite/precacheBuild.test.ts',
    'test/useYjs.test.tsx',
  ])
    assert.equal(vitestStage(process.cwd(), file).argv.at(-1), file);
  for (const file of [
    'test/../private.test.ts',
    'test//name.test.ts',
    '--testNamePattern=one',
    '/test/foo.test.ts',
    'test/..name.test.ts',
  ])
    assert.throws(() => vitestArgv(file), /Unsupported/);
  assert.throws(
    () => nodeProtocolStage(process.cwd(), 'test/account-core/native.test.mjs'),
    /Unreviewed/,
  );
});

test('malformed, duplicate and overlapping general policies refuse before execution', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'done-general-policy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts/release-validation'), { recursive: true });
  const p = generalTestPolicy(process.cwd());
  for (const change of [
    (x) => x.vitest.push(x.vitest[0]),
    (x) => x.vitest.push(propertyFiles[0]),
    (x) => {
      x.node = [];
    },
    (x) => {
      x.schema = 2;
    },
    (x) => {
      x.native = [];
    },
    (x) => x.node.push('test/account-core/native.test.mjs'),
  ]) {
    const changed = structuredClone(p);
    change(changed);
    writeFileSync(
      join(root, 'scripts/release-validation/general-tests.json'),
      JSON.stringify(changed),
    );
    assert.throws(() => generalTestPolicy(root));
  }
});

test('160 generated removed, excluded and changed-runner obligations cannot retain general execution credit', () => {
  const p = generalTestPolicy(process.cwd());
  const tests = [
    ...p.vitest.map((path) => ({
      path,
      status: 'required',
      invocation: { argv: ['node', 'node_modules/vitest/vitest.mjs', 'run', path] },
    })),
    ...p.node.map((path) => ({
      path,
      status: 'required',
      invocation: { argv: ['node', '--test', '--test-concurrency=1', path] },
    })),
  ];
  assertGeneralTestPopulation(p, { tests });
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: tests.length - 1 }),
      fc.integer({ min: 0, max: 2 }),
      (index, mode) => {
        const changed = structuredClone(tests);
        if (mode === 0) changed.splice(index, 1);
        else if (mode === 1) changed[index].status = 'excluded';
        else changed[index].invocation.argv.push('--test-name-pattern=only-one');
        assert.throws(
          () => assertGeneralTestPopulation(p, { tests: changed }),
          /removed|excluded|changed runner/,
        );
      },
    ),
    { seed: 130920, numRuns: 160 },
  );
});
