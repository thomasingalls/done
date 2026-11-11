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

import {
  otherNodeGroups,
  otherNodeStage,
} from '../../scripts/release-validation/other-node-tests.mjs';

const inventory = () =>
  buildInventory(process.cwd(), JSON.parse(readFileSync('scripts/release-validation/policy.json')));

test('reviewed Vitest and Node selections preserve the 2621-case file denominator and separate wrapper obligations', () => {
  const p = generalTestPolicy(process.cwd()),
    m = compileManifest(process.cwd(), inventory());
  assert.equal(p.vitest.length, 99);
  assert.equal(p.node.length, 11);
  const general = selectStages(m, 'general-tests');
  assert.equal(general.length, 284);
  assert.equal(
    general.reduce((n, s) => n + s.expect.cases.length, 0),
    2621,
  );
  assert.equal(selectStages(m, 'vitest-reviewed').length, 118);
  assert.equal(
    selectStages(m, 'node-protocol').reduce((n, s) => n + s.expect.cases.length, 0),
    96,
  );
  assert.equal(
    selectStages(m, 'vitest-properties').reduce((n, s) => n + s.expect.cases.length, 0),
    63,
  );
  const other = selectStages(m, 'other-node-controls');
  assert.deepEqual(
    other.map((s) => s.argv.at(-1)),
    [...otherNodeGroups['other-node-controls']].sort(),
  );
  assert.deepEqual(
    other.map((s) => s.expect.cases.length),
    [7, 7, 3, 1],
  );
  for (const file of ['test/release-validation/unknown.test.mjs', 'test/../hidden.mjs', '--test'])
    assert.throws(() => otherNodeStage(process.cwd(), file), /Unreviewed/);
  assert(m.rows.find((r) => r.id === 'campaign:scripts/legacy-cleanup/run.mjs').blocked);
  const native = selectStages(m, 'other-native-fixtures');
  assert.deepEqual(
    native.map((s) => s.argv.at(-1)),
    [...otherNodeGroups['other-native-fixtures']].sort(),
  );
  assert.deepEqual(
    native.map((s) => s.expect.cases.length),
    [1, 1, 1],
  );
  assert.equal(selectStages(m, 'other-native-regression').length, 4);
  for (const s of native) {
    const profiles = s.argv.at(-1) !== 'test/storage-capacity/marker-native.test.mjs';
    assert.deepEqual(s.fixture, {
      kind: profiles ? 'chromium-inherited-profiles' : 'chromium-cdp',
      startupMs: 15000,
    });
  }
  const harnesses = selectStages(m, 'other-harness-fixtures');
  assert.deepEqual(
    harnesses.map((s) => s.expect.cases.length),
    [14, 4],
  );
  for (const s of harnesses) {
    assert.equal(s.processPolicy, 'registered-groups-v1');
    assert.equal(s.variant, 'node-registered-groups-v1');
    assert.deepEqual(
      s.fixture,
      s.argv.at(-1).includes('storage-harness')
        ? { kind: 'chromium-cdp', startupMs: 15000 }
        : undefined,
    );
    assert.throws(() => validateStage({ ...s, processPolicy: 'inherited-group-v1' }));
    assert.throws(() => validateStage({ ...s, variant: 'current' }));
  }
  assert.equal(selectStages(m, 'runner-self-regression').length, 7);
  const runners = selectStages(m, 'runner-self-tests');
  assert.deepEqual(
    runners.map((s) => s.expect.cases.length),
    [8, 6, 7, 38, 5],
  );
  for (const s of runners) {
    assert.equal(s.processPolicy, 'registered-groups-v1');
    assert.equal(s.variant, 'node-registered-groups-v1');
    assert.deepEqual(
      s.fixture,
      s.argv.at(-1).endsWith('-native.test.mjs')
        ? { kind: 'chromium-registered-groups', startupMs: 15000 }
        : undefined,
    );
    assert.throws(() => validateStage({ ...s, processPolicy: 'inherited-group-v1' }));
    assert.throws(() => validateStage({ ...s, variant: 'node-inherited-chromium-v1' }));
  }
  for (const s of general) {
    validateStage(s);
    assert.equal(
      s.deadlineMs,
      {
        'test/release-validation/playwright-native.test.mjs': 120000,
        'test/app-upgrades/upgrades.spec.ts': 240000,
        'test/latency/journal.spec.ts': 720000,
        'test/latency/latency.spec.ts': 900000,
        'test/latency/diagnosis.spec.ts': 900000,
        'test/geometry/reorder.spec.ts': 180000,
        'test/geometry/sync.spec.ts': 180000,
        'test/geometry/wheel.spec.ts': 180000,
        'test/geometry/workflow.spec.ts': 360000,

        'test/geometry/breadcrumbs.spec.ts': 240000,
        'test/geometry/cards.spec.ts': 240000,
        'test/geometry/layout.spec.ts': 360000,
        'test/geometry/lineHeight.spec.ts': 240000,

        'test/local-app/packaged.spec.ts': 180000,
        'test/storage-compatibility/compatibility.spec.ts': 270000,
        'test/private-migration/rehearsal.spec.ts': 540000,
        'test/local-app/startup.spec.ts': 300000,
        'test/local-app/editor.spec.ts': 300000,
        'test/release-validation/stage.test.mjs': 120000,
        'test/release-validation/file-outputs.test.mjs': 120000,
        'test/release-validation/vitest-process.test.mjs': 120000,
        'test/release-validation/content-native.test.mjs': 120000,
        'test/release-validation/custody-native.test.mjs': 120000,
        'test/legacy-cleanup/harness.node.mjs': 120000,
        'test/storage-harness/lifecycle.node.mjs': 120000,
        'test/storage-capacity/marker-native.test.mjs': 120000,
        'test/storage-capacity/maintenance.test.mjs': 120000,
        'test/local-recovery/native.test.mjs': 120000,
        'test/storage-capacity/marker.test.mjs': 60000,
        'test/validation-controls/origin.test.mjs': 60000,
        'test/legacy-host/harness.node.mjs': 60000,
        'test/legacy-host-cold/harness.node.mjs': 60000,
        'test/account-admission-evidence/receipt.test.mjs': 360000,
        'test/account-admission-evidence/size.test.mjs': 360000,
        'test/account-receive-transport/controls.test.mjs': 90000,
        'test/account-receive-transport/generated.test.mjs': 330000,
        'test/account-receive-transport/native.test.mjs': 120000,
        'test/account-decisions/native.test.mjs': 120000,
        'test/account-editing/native.test.mjs': 300000,
        'test/account-handoff/native.test.mjs': 180000,
        'test/account-admission/native.test.mjs': 180000,
        'test/account-genesis/native.test.mjs': 180000,
        'test/account-promotion/native.test.mjs': 120000,
        'test/account-authority/native.test.mjs': 120000,
        'test/account-recovery/native.test.mjs': 120000,
        'test/account-core/native.test.mjs': 120000,
        'test/account-service-inbound/native.test.mjs': 90000,
        'test/account-delivery-oracle/native.test.mjs': 120000,
        'test/account-parser-conformance/native.test.mjs': 120000,
        'test/account-checkpoint-contract/native.test.mjs': 300000,
        'test/account-counter-contract/native.test.mjs': 300000,
        'test/account-store-contract/native.test.mjs': 300000,
        'test/account-local-provenance/native.test.mjs': 300000,
        'test/account-local-custody/native.test.mjs': 300000,
        'test/account-admission-bounds/native.test.mjs': 180000,
        'test/account-outbound/native.test.mjs': 60000,
        'test/account-decision-composition/controls.test.mjs': 300000,
        'test/account-decision-composition/native.test.mjs': 300000,
        'test/account-decision-composition/restart.test.mjs': 300000,
        'test/account-failures/http.test.mjs': 120000,
        'test/account-failures/native.test.mjs': 120000,
        'test/account-failures/service.test.mjs': 120000,
        'test/account-liveness/instrument.test.mjs': 60000,
        'test/account-liveness/service-cache.test.mjs': 60000,
        'test/account-liveness/controlled.test.mjs': 200000,
        'test/account-liveness/view.test.mjs': 180000,
        'test/account-liveness/native.test.mjs': 930000,
        'test/account-residue/extended.test.mjs': 60000,
        'test/account-residue/packaged.test.mjs': 240000,
        'test/account-residue/generated.test.mjs': 330000,
        'test/account-residue/lifecycle.test.mjs': 240000,
        'test/account-residue/service-files.test.mjs': 240000,
        'test/account-residue/calibration.test.mjs': 150000,
        'test/account-residue/matcher.test.mjs': 60000,
        'test/account-liveness/workload.test.mjs': 750000,
        'test/account-decision-composition/order.test.mjs': 300000,
        'test/account-decision-composition/generated.test.mjs': 300000,
        'test/account-reservation-durability/model.test.mjs': 300000,
        'test/account-reservation-durability/native.test.mjs': 300000,
        'test/account-reservation-durability/network.test.mjs': 300000,
        'test/account-delivery/native.test.mjs': 480000,
        'test/account-spool/native.test.mjs': 240000,
        'test/account-receive/native.test.mjs': 300000,
        'test/account-receive-editor/native.test.mjs': 480000,
        'test/account-sync/batch.test.mjs': 300000,
        'test/account-sync/controls.test.mjs': 90000,
        'test/account-sync/generated.test.mjs': 450000,
        'test/account-sync/native-controls.test.mjs': 150000,
        'test/account-sync/native.test.mjs': 600000,
        'test/account-receive-driver/controls.test.mjs': 90000,
        'test/account-receive-driver/generated.test.mjs': 270000,
        'test/account-receive-driver/native-controls.test.mjs': 90000,
        'test/account-receive-driver/native.test.mjs': 180000,
      }[s.argv.at(-1)] ?? 180000,
    );
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
