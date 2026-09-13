import test from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import {
  admissionSelection,
  admissionStage,
  reconcileAdmission,
} from '../../scripts/release-validation/admission-adapter.mjs';
import { carrierSelection } from '../../scripts/release-validation/carrier-adapter.mjs';
import { journalStage } from '../../scripts/release-validation/journal-adapter.mjs';
import { digest } from '../../scripts/release-validation/identity.mjs';
import { validateStage } from '../../scripts/release-validation/stage.mjs';
import { carrierEvidence } from './carrier-fixture.mjs';

// Reviewed against admission's native scenario switches and distinct assertion targets.
const expectedCases = [
  'C01.pending-struct',
  'C03.synchronous',
  'C03.ordered-refusal',
  'C03.retry',
  'C01.remote-basis',
  'C02.pending-delete',
  'C03.slicing',
  'C03.capacity',
  'C03.barrier',
  'C03.timer',
  'C04.close',
  'C09.persisted-yjs',
  'C09.runtime-repair',
  'C03.validation',
  'C04.cross-tab',
];
const expectedMutations = [
  ['publish-before-forced-commit', 'C03.ordered-refusal', 'refused-prefix-is-private'],
  ['prepare-queued-input-early', 'C03.ordered-refusal', 'only-head-prepared'],
  ['publish-receive-before-commit', 'C01.remote-basis', 'remote-is-private-until-commit'],
  ['retry-via-journal', 'C03.retry', 'retry-forces-second-content-invocation'],
  ['early-durability-return', 'C03.barrier', 'barrier-waits-for-prior-input'],
  ['ignore-byte-capacity', 'C03.capacity', 'byte-capacity-refuses'],
];

test('admission binds 15 cases and six distinct mutations including both refusal-order targets', () => {
  const full = admissionStage(process.cwd());
  assert.deepEqual(
    full.expect.selection.cases.map((c) => c.id),
    expectedCases,
  );
  assert.deepEqual(
    full.expect.selection.mutants.map((m) => [m.id, m.case, m.assertion]),
    expectedMutations,
  );
  assert(full.expect.selection.mutants.every((m) => m.patch.file === 'admissionQueue.ts'));
  const selected = admissionStage(process.cwd(), ['--case', 'C03.ordered-refusal']);
  assert.equal(selected.expect.selection.cases.length, 1);
  assert.deepEqual(
    selected.expect.selection.mutants.map((m) => m.id),
    expectedMutations.slice(0, 2).map((m) => m[0]),
  );
  const baseline = admissionStage(process.cwd(), ['--case', 'C03.ordered-refusal', '--no-mutants']);
  assert.equal(baseline.expect.selection.mutants.length, 0);
  assert.equal(
    new Set([full, selected, baseline, journalStage(process.cwd())].map(digest)).size,
    4,
  );
  for (const stage of [full, selected, baseline]) validateStage(stage);
  assert.throws(
    () => validateStage({ ...full, argv: ['node', 'scripts/journal/worker.mjs'] }),
    /Unreviewed carrier worker/,
  );
  for (const family of ['custody', 'constructor', '__proto__'])
    assert.throws(() => carrierSelection(family, process.cwd()), /Unreviewed carrier family/);
  assert.throws(() =>
    admissionSelection(process.cwd(), ['--case', 'C03.ordered-refusal,C03.ordered-refusal']),
  );
});

test('one detected admission mutation cannot stand in for the other mutation of the same case', (t) => {
  const f = carrierEvidence(t, 'admission', 'ordered-admission-browser');
  assert.equal(reconcileAdmission(f.selection, f.actual, f.context).length, 21);
  for (const mutate of [
    (x) => x.mutations.splice(1, 1),
    (x) => {
      x.mutations[1] = x.mutations[0];
    },
    (x) => {
      x.mutations[1].result.cases[0].assertions[0].id = 'refused-prefix-is-private';
    },
    (x) => {
      x.candidates[0].cases.find((c) => c.id === 'C03.ordered-refusal').assertions.pop();
    },
    (x) => {
      x.mutations[1].result.source.files = x.mutations[0].result.source.files;
    },
  ]) {
    const actual = structuredClone(f.actual);
    mutate(actual);
    assert.throws(() => reconcileAdmission(f.selection, actual, f.context));
  }
});

test('admission retains its ordered report scope and refuses incomplete or relabelled results', (t) => {
  const f = carrierEvidence(t, 'admission', 'ordered-admission-browser');
  for (const mutate of [
    (x) => {
      x.scope = 'admission-carrier-browser';
    },
    (x) => {
      x.scope = 'journal-carrier-browser';
    },
    (x) => {
      x.requestedCandidates = ['journal'];
    },
    (x) => {
      x.releaseNonce = 'old';
    },
    (x) => {
      x.candidates[0].cases.pop();
    },
    (x) => {
      x.servers[0].variant = 'journal';
    },
    (x) => {
      x.servers[0].closed = false;
    },
    (x) => {
      x.exitCode = 1;
    },
    (x) => {
      x.fatal = { message: 'interrupted during admission' };
    },
  ]) {
    const actual = structuredClone(f.actual);
    mutate(actual);
    assert.throws(() => reconcileAdmission(f.selection, actual, f.context));
  }
});

test('160 generated admission subsets require both same-case mutations or the explicit baseline-only variant', (t) => {
  const f = carrierEvidence(t, 'admission', 'ordered-admission-browser');
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 14 }), { maxLength: 15 }),
      fc.boolean(),
      fc.boolean(),
      (indices, mutations, omit) => {
        const ids = expectedCases.filter((_, i) => i === 2 || indices.includes(i));
        const selection = admissionSelection(process.cwd(), [
          '--case',
          ids.join(','),
          ...(mutations ? [] : ['--no-mutants']),
        ]).selection;
        const expected = mutations ? expectedMutations.filter((m) => ids.includes(m[1])) : [];
        assert.deepEqual(
          selection.mutants.map((m) => m.id),
          expected.map((m) => m[0]),
        );
        const actual = structuredClone(f.actual);
        actual.requestedCases = ids;
        actual.candidates[0].cases = actual.candidates[0].cases.filter((c) => ids.includes(c.id));
        actual.mutations = actual.mutations.filter((m) => expected.some((e) => e[0] === m.id));
        actual.servers = actual.servers.filter(
          (s) => s.variant === 'admission' || expected.some((m) => m[0] === s.variant),
        );
        assert.equal(
          reconcileAdmission(selection, actual, f.context).length,
          ids.length + expected.length,
        );
        if (!mutations) actual.candidates[0].cases.pop();
        else if (omit) actual.mutations.splice(1, 1);
        else actual.mutations[1].result.cases[0].assertions[0].id = 'refused-prefix-is-private';
        assert.throws(() => reconcileAdmission(selection, actual, f.context));
      },
    ),
    { seed: 130906, numRuns: 160 },
  );
});
