import test from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import {
  workspaceAdmissionSelection,
  workspaceAdmissionStage,
  reconcileWorkspaceAdmission,
} from '../../scripts/release-validation/workspace-admission-adapter.mjs';
import { editorAdmissionStage } from '../../scripts/release-validation/editor-admission-adapter.mjs';
import { digest } from '../../scripts/release-validation/identity.mjs';
import { validateStage } from '../../scripts/release-validation/stage.mjs';
import {
  encodeCatalogueEvidence,
  encodeEvidence,
} from '../../scripts/release-validation/assertion-evidence.mjs';
import { carrierEvidence } from './carrier-fixture.mjs';

// Reviewed separately against the workspace scenario switch and original patch locations.
const cases = [
  'W10.repair',
  'W01.surfaces',
  'W02.pressure',
  'W03.undo-death',
  'W04.cross-tab',
  'W05.system',
  'W06.remote',
  'W07.history',
  'W08.rules',
  'W09.initialize',
];
const mutations = [
  [
    'pending-history-visible',
    'W02.pressure',
    'pending-history-private',
    'src/crdt/admittedWorkspace.ts',
  ],
  [
    'system-bulk-in-human-history',
    'W05.system',
    'bulk-outside-human-history',
    'src/crdt/workspaceCommands.ts',
  ],
  [
    'received-work-in-human-history',
    'W06.remote',
    'undo-preserves-remote',
    'src/crdt/admittedWorkspace.ts',
  ],
  ['lost-redone-links', 'W07.history', 'undo-edit-in-restored-card', 'src/crdt/yjs.ts'],
];
const evidence = (t) => {
  const f = carrierEvidence(t, 'workspace-admission', 'workspace-admission-browser', {
    candidate: 'workspace',
    patchPrefix: '',
  });
  return { ...f, actual: JSON.parse(JSON.stringify(encodeCatalogueEvidence(f.actual))) };
};

test('workspace binds ten cases and four full-path mutations with distinct history and initialization selections', () => {
  const full = workspaceAdmissionStage(process.cwd());
  assert.deepEqual(
    full.expect.selection.cases.map((c) => c.id),
    cases,
  );
  assert.deepEqual(
    full.expect.selection.mutants.map((m) => [m.id, m.case, m.assertion, m.patch.file]),
    mutations,
  );
  const history = workspaceAdmissionStage(process.cwd(), [
    '--case',
    'W05.system,W06.remote,W07.history',
  ]);
  assert.deepEqual(
    history.expect.selection.mutants.map((m) => m.id),
    mutations.slice(1).map((m) => m[0]),
  );
  const baseline = workspaceAdmissionStage(process.cwd(), [
    '--case',
    'W07.history',
    '--no-mutants',
  ]);
  const initialize = workspaceAdmissionStage(process.cwd(), ['--case', 'W09.initialize']);
  assert.equal(baseline.expect.selection.mutants.length, 0);
  assert.equal(initialize.expect.selection.mutants.length, 0);
  assert.equal(
    new Set([full, history, baseline, initialize, editorAdmissionStage(process.cwd())].map(digest))
      .size,
    5,
  );
  for (const stage of [full, history, baseline, initialize]) validateStage(stage);
  assert.throws(
    () => validateStage({ ...full, argv: ['node', 'scripts/editor-admission/worker.mjs'] }),
    /Unreviewed carrier worker/,
  );
  assert.throws(() =>
    workspaceAdmissionSelection(process.cwd(), ['--case', 'W07.history,W07.history']),
  );
});

test('workspace history mutations require their own source bytes and discriminating assertions', (t) => {
  const f = evidence(t);
  assert.equal(reconcileWorkspaceAdmission(f.selection, f.actual, f.context).length, 14);
  for (const change of [
    (x) => x.mutations.splice(3, 1),
    (x) => {
      x.mutations[2] = x.mutations[0];
    },
    (x) => {
      x.mutations[2].result.source.files = x.mutations[0].result.source.files;
    },
    (x) => {
      x.mutations[3].result.cases[0].assertions[0].id = 'nested-card-restored';
    },
    (x) => {
      x.mutations[3].result.source.files['src/crdt/yjs.ts'] =
        x.candidates[0].source.files['src/crdt/yjs.ts'];
    },
    (x) => {
      x.mutations[0].result.mutation.file = 'admittedWorkspace.ts';
    },
    (x) => {
      x.candidates[0].cases.find((c) => c.id === 'W05.system').assertions.pop();
    },
  ]) {
    const actual = structuredClone(f.actual);
    change(actual);
    assert.throws(() => reconcileWorkspaceAdmission(f.selection, actual, f.context));
  }
  assert.throws(() =>
    reconcileWorkspaceAdmission(f.selection, f.actual, {
      ...f.context,
      sources: f.context.sources.filter((p) => p.path !== 'src/crdt/yjs.ts'),
    }),
  );
});

test('workspace report identity and nested unavailable values remain distinct from business refusals', (t) => {
  const f = evidence(t);
  const init = f.actual.candidates[0].cases.find((c) => c.id === 'W09.initialize');
  init.assertions.push({
    id: 'no-editor-before-initialization-commit',
    actual: encodeEvidence(['pending', {}, undefined]),
    expected: encodeEvidence(['pending', {}, undefined]),
    passed: true,
  });
  const rules = f.actual.candidates[0].cases.find((c) => c.id === 'W08.rules');
  rules.assertions.push({
    id: 'business-results',
    actual: encodeEvidence([false, null, 0]),
    expected: encodeEvidence([false, null, 0]),
    passed: true,
  });
  assert.equal(reconcileWorkspaceAdmission(f.selection, f.actual, f.context).length, 14);
  for (const change of [
    (x) => {
      x.requestedCandidates = ['workspace-admission'];
    },
    (x) => {
      x.candidates[0].id = 'editor';
    },
    (x) => {
      x.scope = 'editor-admission-browser';
    },
    (x) => {
      delete x.evidenceEncoding;
    },
    (x) => {
      x.releaseNonce = 'previous';
    },
    (x) => {
      x.servers[0].variant = 'workspace-admission';
    },
    (x) => {
      x.servers[0].closed = false;
    },
    (x) => {
      delete x.candidates[0].source.files['account-protocol/fixture.ts'];
    },
    (x) => {
      x.candidates[0].cases.find((c) => c.id === 'W09.initialize').assertions.at(-1).actual =
        encodeEvidence(['pending', {}, null]);
    },
    (x) => {
      x.candidates[0].cases.find((c) => c.id === 'W08.rules').assertions.at(-1).actual =
        encodeEvidence([0, null, 0]);
    },
    (x) => {
      delete x.candidates[0].cases.find((c) => c.id === 'W09.initialize').assertions.at(-1).actual;
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
    assert.throws(() => reconcileWorkspaceAdmission(f.selection, actual, f.context));
  }
});

test('160 generated workspace selections reject omitted work and substituted history evidence', (t) => {
  const f = evidence(t);
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 10 }),
      fc.boolean(),
      fc.integer({ min: 0, max: 3 }),
      (indices, withMutations, fault) => {
        const ids = cases.filter((_, i) => indices.includes(i));
        const expected = withMutations ? mutations.filter((m) => ids.includes(m[1])) : [];
        const selection = workspaceAdmissionSelection(process.cwd(), [
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
          (s) => s.variant === 'workspace' || expected.some((m) => m[0] === s.variant),
        );
        assert.equal(
          reconcileWorkspaceAdmission(selection, actual, f.context).length,
          ids.length + expected.length,
        );
        if (!expected.length || fault === 0) actual.candidates[0].cases.pop();
        else {
          const at = fault % expected.length;
          if (fault === 1) actual.mutations.splice(at, 1);
          else if (fault === 2)
            actual.mutations[at].result.cases[0].assertions[0].id = 'unrelated-history-check';
          else actual.mutations[at].result.source.files = actual.candidates[0].source.files;
        }
        assert.throws(() => reconcileWorkspaceAdmission(selection, actual, f.context));
      },
    ),
    { seed: 130908, numRuns: 160 },
  );
});
