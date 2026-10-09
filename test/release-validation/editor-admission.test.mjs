import test from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import {
  editorAdmissionSelection,
  editorAdmissionStage,
  reconcileEditorAdmission,
} from '../../scripts/release-validation/editor-admission-adapter.mjs';
import { admissionStage } from '../../scripts/release-validation/admission-adapter.mjs';
import { digest } from '../../scripts/release-validation/identity.mjs';
import { validateStage } from '../../scripts/release-validation/stage.mjs';
import {
  encodeCatalogueEvidence,
  encodeEvidence,
  validateEvidence,
} from '../../scripts/release-validation/assertion-evidence.mjs';
import { carrierEvidence } from './carrier-fixture.mjs';

// Independently reviewed against the native CodeMirror scenarios and source targets.
const cases = [
  'E11.repair',
  'E12.multicaret',
  'E09.pending-death',
  'E10.checkbox',
  'E01.typing',
  'E02.pressure',
  'E03.remote',
  'E04.cross-tab',
  'E05.paste',
  'E06.composition',
  'E07.close',
  'E08.profile',
];
const mutations = [
  [
    'history-before-receipt',
    'E02.pressure',
    'pending-not-in-history',
    'src/editor/admittedText.ts',
  ],
  [
    'ordinary-view-before-receipt',
    'E02.pressure',
    'pending-not-in-editor',
    'src/editor/admittedEditor.ts',
  ],
  ['remote-in-undo', 'E03.remote', 'undo-preserves-remote', 'src/editor/admittedText.ts'],
];
const evidence = (t) => {
  const f = carrierEvidence(t, 'editor-admission', 'editor-admission-browser', {
    candidate: 'editor',
    patchPrefix: '',
  });
  return { ...f, actual: JSON.parse(JSON.stringify(encodeCatalogueEvidence(f.actual))) };
};

test('editor-admission binds all 12 cases, three full-path patches and distinct selected variants', () => {
  const full = editorAdmissionStage(process.cwd());
  assert.deepEqual(
    full.expect.selection.cases.map((c) => c.id),
    cases,
  );
  assert.deepEqual(
    full.expect.selection.mutants.map((m) => [m.id, m.case, m.assertion, m.patch.file]),
    mutations,
  );
  const selected = editorAdmissionStage(process.cwd(), ['--case', 'E02.pressure']);
  assert.deepEqual(
    selected.expect.selection.mutants.map((m) => m.id),
    mutations.slice(0, 2).map((m) => m[0]),
  );
  const baseline = editorAdmissionStage(process.cwd(), ['--case', 'E02.pressure', '--no-mutants']);
  assert.equal(baseline.expect.selection.mutants.length, 0);
  const profile = editorAdmissionStage(process.cwd(), ['--case', 'E08.profile']);
  assert.equal(profile.expect.selection.mutants.length, 0);
  assert.equal(
    new Set([full, selected, baseline, profile, admissionStage(process.cwd())].map(digest)).size,
    5,
  );
  for (const stage of [full, selected, baseline, profile]) validateStage(stage);
  assert.throws(
    () => validateStage({ ...full, argv: ['node', 'scripts/admission/worker.mjs'] }),
    /Unreviewed carrier worker/,
  );
  assert.throws(() =>
    editorAdmissionSelection(process.cwd(), ['--case', 'E02.pressure,E02.pressure']),
  );
});

test('editor mutation evidence needs each exact full-path target and both independent pressure assertions', (t) => {
  const f = evidence(t);
  assert.equal(reconcileEditorAdmission(f.selection, f.actual, f.context).length, 15);
  for (const change of [
    (x) => x.mutations.splice(1, 1),
    (x) => {
      x.mutations[1] = x.mutations[0];
    },
    (x) => {
      x.mutations[1].result.cases[0].assertions[0].id = 'pending-not-in-history';
    },
    (x) => {
      x.mutations[1].result.source.files = x.mutations[0].result.source.files;
    },
    (x) => {
      x.mutations[0].result.mutation.file = 'admittedText.ts';
    },
    (x) => {
      x.candidates[0].cases.find((c) => c.id === 'E02.pressure').assertions.pop();
    },
    (x) => {
      x.mutations[2].result.source.files['src/editor/admittedText.ts'] =
        x.candidates[0].source.files['src/editor/admittedText.ts'];
    },
  ]) {
    const actual = structuredClone(f.actual);
    change(actual);
    assert.throws(() => reconcileEditorAdmission(f.selection, actual, f.context));
  }
  const missing = {
    ...f.context,
    sources: f.context.sources.filter((p) => p.path !== 'src/editor/admittedEditor.ts'),
  };
  assert.throws(() => reconcileEditorAdmission(f.selection, f.actual, missing));
  const wrongRoot = structuredClone(f.selection);
  wrongRoot.mutants[0].patch.file = 'src/crdt/src/editor/admittedText.ts';
  assert.throws(() => reconcileEditorAdmission(wrongRoot, f.actual, f.context));
});

test('editor report identity and complete source population cannot be inferred from the family name', (t) => {
  const f = evidence(t);
  for (const change of [
    (x) => {
      x.requestedCandidates = ['editor-admission'];
    },
    (x) => {
      x.candidates[0].id = 'editor-admission';
    },
    (x) => {
      x.scope = 'ordered-admission-browser';
    },
    (x) => {
      x.servers[0].variant = 'editor-admission';
    },
    (x) => {
      delete x.candidates[0].source.files['account-protocol/fixture.ts'];
    },
    (x) => {
      x.releaseNonce = 'previous';
    },
    (x) => {
      x.candidates[0].cases.pop();
    },
    (x) => {
      x.servers[0].closed = false;
    },
    (x) => {
      x.exitCode = 1;
    },
    (x) => {
      x.fatal = { message: 'interrupted' };
    },
  ]) {
    const actual = structuredClone(f.actual);
    change(actual);
    assert.throws(() => reconcileEditorAdmission(f.selection, actual, f.context));
  }
});

test('160 generated editor selections require exact source-target and assertion evidence or explicit baseline-only coverage', (t) => {
  const f = evidence(t);
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 11 }), { maxLength: 12 }),
      fc.boolean(),
      fc.integer({ min: 0, max: 2 }),
      (indices, withMutations, fault) => {
        const ids = cases.filter((_, i) => i === 5 || indices.includes(i));
        const selection = editorAdmissionSelection(process.cwd(), [
          '--case',
          ids.join(','),
          ...(withMutations ? [] : ['--no-mutants']),
        ]).selection;
        const expected = withMutations ? mutations.filter((m) => ids.includes(m[1])) : [];
        assert.deepEqual(
          selection.mutants.map((m) => m.id),
          expected.map((m) => m[0]),
        );
        const actual = structuredClone(f.actual);
        actual.requestedCases = ids;
        actual.candidates[0].cases = actual.candidates[0].cases.filter((c) => ids.includes(c.id));
        actual.mutations = actual.mutations.filter((m) => expected.some((e) => e[0] === m.id));
        actual.servers = actual.servers.filter(
          (s) => s.variant === 'editor' || expected.some((m) => m[0] === s.variant),
        );
        assert.equal(
          reconcileEditorAdmission(selection, actual, f.context).length,
          ids.length + expected.length,
        );
        if (!withMutations) actual.candidates[0].cases.pop();
        else if (fault === 0) actual.mutations.splice(1, 1);
        else if (fault === 1)
          actual.mutations[1].result.cases[0].assertions[0].id = 'pending-not-in-history';
        else actual.mutations[1].result.source.files = actual.mutations[0].result.source.files;
        assert.throws(() => reconcileEditorAdmission(selection, actual, f.context));
      },
    ),
    { seed: 130907, numRuns: 160 },
  );
});

test('tagged evidence retains undefined and null distinctly through JSON without accepting malformed or missing evidence', (t) => {
  const values = [
    undefined,
    null,
    false,
    0,
    -0,
    'undefined',
    ['undefined'],
    { value: undefined },
    {},
    [undefined],
    [null],
    Object.assign(Object.create(null), { x: 1 }),
  ];
  const encoded = values.map((v) => JSON.parse(JSON.stringify(encodeEvidence(v))));
  assert.equal(new Set(encoded.map(JSON.stringify)).size, values.length);
  encoded.forEach(validateEvidence);
  for (const bad of [
    [],
    ['undefined', null],
    ['wat'],
    ['number', 'NaN'],
    ['number', ''],
    [
      'object',
      [
        ['x', ['null']],
        ['x', ['null']],
      ],
    ],
  ])
    assert.throws(() => validateEvidence(bad));
  for (const unsupported of [NaN, new Date(), Symbol(), Object.assign([], { length: 1 })])
    assert.throws(() => encodeEvidence(unsupported));
  const f = evidence(t),
    row = f.actual.candidates[0].cases[0];
  row.assertions.push({
    id: 'export-unavailable',
    actual: encodeEvidence(undefined),
    expected: encodeEvidence(undefined),
    passed: true,
  });
  assert.equal(reconcileEditorAdmission(f.selection, f.actual, f.context).length, 15);
  row.assertions.at(-1).actual = encodeEvidence(null);
  assert.throws(() => reconcileEditorAdmission(f.selection, f.actual, f.context));
  delete row.assertions.at(-1).actual;
  assert.throws(() => reconcileEditorAdmission(f.selection, f.actual, f.context));
});
