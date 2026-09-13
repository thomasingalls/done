import test from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import {
  contentTrimSelection,
  contentTrimStage,
  reconcileContentTrim,
} from '../../scripts/release-validation/content-trim-adapter.mjs';
import { localClearStage } from '../../scripts/release-validation/local-clear-adapter.mjs';
import { digest } from '../../scripts/release-validation/identity.mjs';
import { validateStage } from '../../scripts/release-validation/stage.mjs';
import {
  encodeCatalogueEvidence,
  encodeEvidence,
} from '../../scripts/release-validation/assertion-evidence.mjs';
import { carrierEvidence } from './carrier-fixture.mjs';
// Literal expectations reviewed against scenario dispatch and source fault sites.
const cases = [
  'T01.union',
  'T02.late',
  'T03.concurrent',
  'T04.dependencies',
  'T05.unreadable',
  'T06.changed',
  'T07.recheck',
  'T08.new-damage',
  'T09.journal',
  'T10.publish-abort',
  'T11.delete-abort',
  'T12.kill-reservation',
  'T13.kill-publication',
  'T14.kill-deletion',
  'T15.close',
  'T16.generation',
  'T17.single-state',
  'T18.replacement',
  'T19.missing',
  'T20.journal-tag',
  'T21.journal-recheck',
];
const mutations = [
  ['range-delete', 'T02.late', 'late-record-survives', 'contentCompaction.ts'],
  ['partial-disk-union', 'T01.union', 'cold-replay-keeps-disk-union', 'contentCompaction.ts'],
  ['ignore-record-bytes', 'T06.changed', 'changed-record-refuses', 'contentCompaction.ts'],
  ['skip-delete-census', 'T07.recheck', 'changed-after-audit-refuses', 'contentCompaction.ts'],
  ['skip-journal-check', 'T09.journal', 'post-publication-journal-refuses', 'custody.ts'],
  ['merge-incomplete-content', 'T04.dependencies', 'struct-retained', 'contentCompaction.ts'],
  [
    'early-delete-receipt',
    'T11.delete-abort',
    'delete-abort-has-no-success-receipt',
    'contentDatabase.ts',
  ],
  [
    'skip-final-journal-census',
    'T21.journal-recheck',
    'post-publication-journal-refuses',
    'contentCompaction.ts',
  ],
];
const selectedIds = ['T02.late', 'T04.dependencies', 'T09.journal', 'T21.journal-recheck'];
const evidence = (t) => {
  const f = carrierEvidence(t, 'content-trim', 'content-trim-browser', {
    candidate: 'trim',
    patchPrefix: 'src/crdt/',
  });
  return { ...f, actual: JSON.parse(JSON.stringify(encodeCatalogueEvidence(f.actual))) };
};
test('Content trim independently resolves the full catalogue, selected mutation subset and baseline-only variants', () => {
  const full = contentTrimStage(process.cwd());
  assert.deepEqual(
    full.expect.selection.cases.map((c) => c.id),
    cases,
  );
  assert.deepEqual(
    full.expect.selection.mutants.map((m) => [m.id, m.case, m.assertion, m.patch.file]),
    mutations,
  );
  const selected = contentTrimStage(process.cwd(), ['--case', selectedIds.join(',')]);
  assert.deepEqual(
    selected.expect.selection.cases.map((c) => c.id),
    selectedIds,
  );
  assert.deepEqual(
    selected.expect.selection.mutants.map((m) => m.id),
    mutations.filter((m) => selectedIds.includes(m[1])).map((m) => m[0]),
  );
  const baseline = contentTrimStage(process.cwd(), [
    '--case',
    'T13.kill-publication',
    '--no-mutants',
  ]);
  assert.equal(baseline.expect.selection.mutants.length, 0);
  assert.equal(
    new Set([full, selected, baseline, localClearStage(process.cwd())].map(digest)).size,
    4,
  );
  for (const stage of [full, selected, baseline]) validateStage(stage);
  assert.throws(
    () => validateStage({ ...full, argv: ['node', 'scripts/local-clear/worker.mjs'] }),
    /Unreviewed carrier worker/,
  );
  assert.throws(() => contentTrimSelection(process.cwd(), ['--case', cases[0] + ',' + cases[0]]));
  assert.throws(() => contentTrimSelection(process.cwd(), ['--case', 'unreviewed-case']));
});
test('Content trim requires every exact source mutation and its own discriminating assertion', (t) => {
  const f = evidence(t);
  assert.equal(
    reconcileContentTrim(f.selection, f.actual, f.context).length,
    cases.length + mutations.length,
  );
  for (let i = 0; i < mutations.length; i++) {
    for (const change of [
      (x) => x.mutations.splice(i, 1),
      (x) => {
        x.mutations[i] = x.mutations[(i + 1) % mutations.length];
      },
      (x) => {
        x.mutations[i].result.cases[0].assertions[0].id = 'unrelated-refusal';
      },
      (x) => {
        x.mutations[i].result.source.files = x.candidates[0].source.files;
      },
      (x) => {
        x.mutations[i].result.mutation.to += '// unreviewed patch';
      },
      (x) => {
        x.candidates[0].cases.find((c) => c.id === mutations[i][1]).assertions = [];
      },
    ]) {
      const actual = structuredClone(f.actual);
      change(actual);
      assert.throws(() => reconcileContentTrim(f.selection, actual, f.context));
    }
  }
  assert.throws(() =>
    reconcileContentTrim(f.selection, f.actual, {
      ...f.context,
      sources: f.context.sources.filter((p) => p.path !== 'src/crdt/' + mutations[0][3]),
    }),
  );
});
test('Content trim binds report identity, all runtime sources and unavailable receipt values', (t) => {
  const f = evidence(t);
  f.actual.candidates[0].cases[0].assertions.push({
    id: 'nested-receipt-value',
    actual: encodeEvidence({ status: undefined, removed: [], count: 0 }),
    expected: encodeEvidence({ status: undefined, removed: [], count: 0 }),
    passed: true,
  });
  assert.equal(
    reconcileContentTrim(f.selection, f.actual, f.context).length,
    cases.length + mutations.length,
  );
  for (const change of [
    (x) => {
      x.requestedCandidates = ['wrong'];
    },
    (x) => {
      x.candidates[0].id = 'wrong';
    },
    (x) => {
      x.scope = 'local-clear-browser';
    },
    (x) => {
      delete x.evidenceEncoding;
    },
    (x) => {
      x.releaseNonce = 'previous';
    },
    (x) => {
      x.servers[0].variant = 'unreviewed';
    },
    (x) => {
      x.servers[0].closed = false;
    },
    (x) => {
      delete x.candidates[0].source.files['account-protocol/fixture.ts'];
    },
    (x) => {
      x.candidates[0].cases[0].assertions.at(-1).actual = encodeEvidence({
        status: null,
        removed: [],
        count: 0,
      });
    },
    (x) => {
      delete x.candidates[0].cases[0].assertions.at(-1).actual;
    },
    (x) => {
      x.exitCode = 1;
    },
    (x) => {
      x.fatal = { message: 'cancelled' };
    },
  ]) {
    const actual = structuredClone(f.actual);
    change(actual);
    assert.throws(() => reconcileContentTrim(f.selection, actual, f.context));
  }
});
test('160 generated Content trim selections reject omitted cases and substituted mutation evidence', (t) => {
  const f = evidence(t);
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 20 }), { minLength: 1, maxLength: 21 }),
      fc.boolean(),
      fc.integer({ min: 0, max: 3 }),
      (indices, withMutations, fault) => {
        const ids = cases.filter((_, i) => indices.includes(i));
        const expected = withMutations ? mutations.filter((m) => ids.includes(m[1])) : [];
        const selection = contentTrimSelection(process.cwd(), [
          '--case',
          ids.join(','),
          ...(withMutations ? [] : ['--no-mutants']),
        ]).selection;
        assert.deepEqual(
          selection.mutants.map((m) => m.id),
          expected.map((m) => m[0]),
        );
        const actual = structuredClone(f.actual);
        actual.requestedCases = ids;
        actual.candidates[0].cases = actual.candidates[0].cases.filter((c) => ids.includes(c.id));
        actual.mutations = actual.mutations.filter((m) => expected.some((e) => e[0] === m.id));
        actual.servers = actual.servers.filter(
          (s) => s.variant === 'trim' || expected.some((m) => m[0] === s.variant),
        );
        assert.equal(
          reconcileContentTrim(selection, actual, f.context).length,
          ids.length + expected.length,
        );
        if (!expected.length || fault === 0) actual.candidates[0].cases.pop();
        else {
          const at = fault % expected.length;
          if (fault === 1) actual.mutations.splice(at, 1);
          else if (fault === 2)
            actual.mutations[at].result.cases[0].assertions[0].id = 'unrelated-refusal';
          else actual.mutations[at].result.source.files = actual.candidates[0].source.files;
        }
        assert.throws(() => reconcileContentTrim(selection, actual, f.context));
      },
    ),
    { seed: 130913, numRuns: 160 },
  );
});
