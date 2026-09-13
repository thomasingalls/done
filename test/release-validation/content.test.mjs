import test from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import {
  contentSelection,
  contentStage,
  reconcileContent,
} from '../../scripts/release-validation/content-adapter.mjs';
import { digest } from '../../scripts/release-validation/identity.mjs';
import { carrierEvidence } from './carrier-fixture.mjs';
import { validateStage } from '../../scripts/release-validation/stage.mjs';

test('full and selected content stages preserve exact case/mutation denominators and separate variants', () => {
  const full = contentStage(process.cwd()),
    control = contentStage(process.cwd(), ['--case', 'C09.unreadable-load']);
  assert.equal(full.expect.selection.cases.length, 13);
  assert.equal(full.expect.selection.mutants.length, 5);
  assert.equal(control.expect.selection.cases.length, 1);
  assert.deepEqual(
    control.expect.selection.mutants.map((m) => m.id),
    ['swallow-unreadable-record'],
  );
  const baseline = contentStage(process.cwd(), ['--case', 'C09.unreadable-load', '--no-mutants']);
  assert.equal(baseline.expect.selection.mutants.length, 0);
  assert.equal(new Set([full, control, baseline].map(digest)).size, 3);
  for (const stage of [full, control, baseline]) validateStage(stage);
  for (const args of [
    ['--case', 'missing'],
    ['--case', 'C09.unreadable-load,C09.unreadable-load'],
    ['--case'],
    ['--no-mutants', '--no-mutants'],
    ['--unknown'],
  ])
    assert.throws(() => contentSelection(process.cwd(), args));
});

test('content adapter recomputes specific mutation detection and served-source hashes', (t) => {
  const f = carrierEvidence(t, 'content');
  assert.equal(reconcileContent(f.selection, f.actual, f.context).length, 18);
  const changes = [
    (x) => x.candidates[0].cases.pop(),
    (x) => x.mutations.pop(),
    (x) => {
      const m = f.selection.mutants[0];
      const c = x.candidates[0].cases.find((c) => c.id === m.case);
      c.assertions = c.assertions.filter((a) => a.id !== m.assertion);
    },
    (x) => {
      x.servers[0].variant = x.servers[1].variant;
    },
    (x) => {
      x.mutations[0].result.cases[0].status = 'pass';
      x.mutations[0].result.cases[0].assertions[0] = {
        id: f.selection.mutants[0].assertion,
        actual: true,
        expected: true,
        passed: true,
      };
    },
    (x) => {
      x.mutations[0].result.cases[0].assertions[0].id = 'unrelated-refusal';
    },
    (x) => {
      x.mutations[0].result.source.files = x.candidates[0].source.files;
    },
    (x) => {
      x.mutations[0].result.mutation.to = 'different patch';
    },
    (x) => {
      delete x.candidates[0].source.files['account-protocol/fixture.ts'];
    },
    (x) => {
      x.candidates[0].cases[0].assertions.push(x.candidates[0].cases[0].assertions[0]);
    },
    (x) => {
      x.servers[0].closed = false;
    },
    (x) => {
      x.releaseNonce = 'old';
    },
    (x) => {
      x.exitCode = 1;
    },
    (x) => {
      x.fatal = { message: 'cancelled' };
    },
  ];
  for (const change of changes) {
    const actual = structuredClone(f.actual);
    change(actual);
    assert.throws(() => reconcileContent(f.selection, actual, f.context));
  }
});

test('160 generated catalogue omissions and claimed detections fail against the independent expected set', (t) => {
  const f = carrierEvidence(t, 'content');
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 12 }),
      fc.integer({ min: 0, max: 4 }),
      fc.boolean(),
      (caseIndex, mutantIndex, remove) => {
        const actual = structuredClone(f.actual);
        if (remove) actual.candidates[0].cases.splice(caseIndex, 1);
        else actual.mutations[mutantIndex].result.cases[0].assertions[0].id = 'wrong-' + caseIndex;
        assert.throws(() => reconcileContent(f.selection, actual, f.context));
      },
    ),
    { seed: 130904, numRuns: 160 },
  );
});
