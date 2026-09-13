import test from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import { readFileSync } from 'node:fs';
import {
  localClearSelection,
  localClearStage,
  reconcileLocalClear,
} from '../../scripts/release-validation/local-clear-adapter.mjs';
import { localGenesisStage } from '../../scripts/release-validation/local-genesis-adapter.mjs';
import { digest } from '../../scripts/release-validation/identity.mjs';
import { catalogueCensus } from '../../scripts/release-validation/census.mjs';
import { validateStage } from '../../scripts/release-validation/stage.mjs';
import {
  encodeCatalogueEvidence,
  encodeEvidence,
} from '../../scripts/release-validation/assertion-evidence.mjs';
import { carrierEvidence } from './carrier-fixture.mjs';

// Reviewed against native completion hooks and the clear scenario dispatch, not report output.
const boundaries = [
  ['L04.kill-intent', 'intent'],
  ['L05.kill-content-delete', 'content-delete'],
  ['L06.kill-stage-journal', 'stage-journal'],
  ['L07.kill-stage-custody', 'stage-custody'],
  ['L08.kill-stage-index', 'stage-index'],
  ['L09.kill-index-delete', 'index-delete'],
  ['L10.kill-stage-cleared', 'stage-cleared'],
];
const cases = [
  'L01.success',
  'L02.blocked',
  'L03.refused',
  ...boundaries.map(([id]) => id),
  'L11.journal',
  'L12.aborts',
  'L13.factor',
  'L14.guards',
  'L15.lifetime',
  'L16.recheck',
  'L17.cancel',
];
const mutations = [
  [
    'blocked-as-success',
    'L02.blocked',
    'blocked-delete-not-complete',
    'src/crdt/localClearStorage.ts',
  ],
  [
    'journal-before-content',
    'L03.refused',
    'delete-refusal-keeps-journal',
    'src/crdt/localClear.ts',
  ],
  [
    'retain-genesis-opener',
    'L01.success',
    'terminal-has-no-content-openers',
    'src/crdt/localClearStorage.ts',
  ],
  [
    'skip-resume-authentication',
    'L13.factor',
    'wrong-factor-cannot-finish-keyless-clear',
    'src/crdt/localClear.ts',
  ],
  [
    'allow-component-open',
    'L14.guards',
    'component-refuses-before-key-access',
    'src/crdt/custody.ts',
  ],
];
const selectedIds = ['L02.blocked', 'L03.refused', 'L13.factor', 'L14.guards'];
const evidence = (t) => {
  const f = carrierEvidence(t, 'local-clear', 'local-clear-browser', {
    candidate: 'clear',
    patchPrefix: '',
  });
  for (const [id, boundary] of boundaries)
    f.actual.candidates[0].cases.find((c) => c.id === id).boundary = boundary;
  return { ...f, actual: JSON.parse(JSON.stringify(encodeCatalogueEvidence(f.actual))) };
};
test('Local clear resolves seven deletion boundaries and exact blocked, ordering, factor and guard selections', () => {
  const full = localClearStage(process.cwd());
  assert.deepEqual(
    full.expect.selection.cases.map((c) => c.id),
    cases,
  );
  assert.deepEqual(
    full.expect.selection.mutants.map((m) => [m.id, m.case, m.assertion, m.patch.file]),
    mutations,
  );
  const selected = localClearStage(process.cwd(), ['--case', selectedIds.join(',')]);
  assert.deepEqual(
    selected.expect.selection.cases.map((c) => c.id),
    selectedIds,
  );
  assert.deepEqual(
    selected.expect.selection.mutants.map((m) => m.id),
    mutations.filter((m) => selectedIds.includes(m[1])).map((m) => m[0]),
  );
  const crash = localClearStage(process.cwd(), ['--case', 'L08.kill-stage-index', '--no-mutants']);
  const baseline = localClearStage(process.cwd(), ['--case', 'L01.success', '--no-mutants']);
  assert.equal(crash.expect.selection.mutants.length, 0);
  assert.equal(baseline.expect.selection.mutants.length, 0);
  assert.equal(
    new Set([full, selected, crash, baseline, localGenesisStage(process.cwd())].map(digest)).size,
    5,
  );
  for (const stage of [full, selected, crash, baseline]) validateStage(stage);
  assert.throws(
    () => validateStage({ ...full, argv: ['node', 'scripts/local-genesis/worker.mjs'] }),
    /Unreviewed carrier worker/,
  );
  assert.throws(() => localClearSelection(process.cwd(), ['--case', 'L01.success,L01.success']));
  const source = readFileSync('scripts/local-clear/catalog.mjs', 'utf8');
  assert.equal(source.split("    'stage-index',").length, 2);
  const shortened = catalogueCensus(source.replace("    'stage-index',", ''));
  assert.equal(shortened.cases.length, 16);
  assert.notDeepEqual(
    shortened.cases.map((c) => c.id),
    cases,
  );
});
test('clear requires exact deletion and authentication mutation evidence and native crash labels', (t) => {
  const f = evidence(t);
  assert.equal(reconcileLocalClear(f.selection, f.actual, f.context).length, 22);
  for (const change of [
    (x) => x.mutations.pop(),
    (x) => {
      x.mutations[3] = x.mutations[1];
    },
    (x) => {
      x.mutations[3].result.source.files = x.mutations[1].result.source.files;
    },
    (x) => {
      x.mutations[0].result.cases[0].assertions[0].id = 'journal-retained';
    },
    (x) => {
      x.mutations[4].result.cases[0].assertions[0].id = 'wrong-factor';
    },
    (x) => {
      x.mutations[2].result.source.files['src/crdt/localClearStorage.ts'] =
        x.candidates[0].source.files['src/crdt/localClearStorage.ts'];
    },
    (x) => {
      x.mutations[1].result.mutation.file = 'localClear.ts';
    },
    (x) => {
      x.candidates[0].cases.find((c) => c.id === 'L13.factor').assertions.pop();
    },
    (x) => {
      x.candidates[0].cases.find((c) => c.id === 'L04.kill-intent').boundary = 'stage-cleared';
    },
    (x) => {
      delete x.candidates[0].cases.find((c) => c.id === 'L08.kill-stage-index').boundary;
    },
    (x) => {
      x.candidates[0].cases.find((c) => c.id === 'L12.aborts').boundary = 'intent';
    },
  ]) {
    const actual = structuredClone(f.actual);
    change(actual);
    assert.throws(() => reconcileLocalClear(f.selection, actual, f.context));
  }
  assert.throws(() =>
    reconcileLocalClear(f.selection, f.actual, {
      ...f.context,
      sources: f.context.sources.filter((p) => p.path !== 'src/crdt/custody.ts'),
    }),
  );
});
test('clear report identity preserves unavailable component errors and nested retained inventories', (t) => {
  const f = evidence(t);
  f.actual.candidates[0].cases
    .find((c) => c.id === 'L14.guards')
    .assertions.push({
      id: 'component-error-inventory',
      actual: encodeEvidence([['component', undefined], { decrypts: 0, openers: [] }]),
      expected: encodeEvidence([['component', undefined], { decrypts: 0, openers: [] }]),
      passed: true,
    });
  assert.equal(reconcileLocalClear(f.selection, f.actual, f.context).length, 22);
  for (const change of [
    (x) => {
      x.requestedCandidates = ['local-clear'];
    },
    (x) => {
      x.candidates[0].id = 'genesis';
    },
    (x) => {
      x.scope = 'local-genesis-browser';
    },
    (x) => {
      delete x.evidenceEncoding;
    },
    (x) => {
      x.releaseNonce = 'previous';
    },
    (x) => {
      x.servers[0].variant = 'local-clear';
    },
    (x) => {
      x.servers[0].closed = false;
    },
    (x) => {
      delete x.candidates[0].source.files['account-protocol/fixture.ts'];
    },
    (x) => {
      x.candidates[0].cases.find((c) => c.id === 'L14.guards').assertions.at(-1).actual =
        encodeEvidence([['component', null], { decrypts: 0, openers: [] }]);
    },
    (x) => {
      delete x.candidates[0].cases.find((c) => c.id === 'L14.guards').assertions.at(-1).actual;
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
    assert.throws(() => reconcileLocalClear(f.selection, actual, f.context));
  }
});
test('160 generated clear selections reject omitted work, substituted mutations and mislabeled deletion boundaries', (t) => {
  const f = evidence(t);
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 16 }), { minLength: 1, maxLength: 17 }),
      fc.boolean(),
      fc.integer({ min: 0, max: 4 }),
      (indices, withMutations, fault) => {
        const ids = cases.filter((_, i) => indices.includes(i));
        const expected = withMutations ? mutations.filter((m) => ids.includes(m[1])) : [];
        const selection = localClearSelection(process.cwd(), [
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
          (s) => s.variant === 'clear' || expected.some((m) => m[0] === s.variant),
        );
        assert.equal(
          reconcileLocalClear(selection, actual, f.context).length,
          ids.length + expected.length,
        );
        const crash = actual.candidates[0].cases.find((c) => c.boundary);
        if (fault === 4 && crash) crash.boundary = 'unexecuted-boundary';
        else if (!expected.length || fault === 0) actual.candidates[0].cases.pop();
        else {
          const at = fault % expected.length;
          if (fault === 1) actual.mutations.splice(at, 1);
          else if (fault === 2)
            actual.mutations[at].result.cases[0].assertions[0].id = 'unrelated-clear-refusal';
          else actual.mutations[at].result.source.files = actual.candidates[0].source.files;
        }
        assert.throws(() => reconcileLocalClear(selection, actual, f.context));
      },
    ),
    { seed: 130912, numRuns: 160 },
  );
});
