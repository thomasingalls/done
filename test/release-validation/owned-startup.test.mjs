import test from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import {
  ownedStartupSelection,
  ownedStartupStage,
  reconcileOwnedStartup,
} from '../../scripts/release-validation/owned-startup-adapter.mjs';
import { workspaceAdmissionStage } from '../../scripts/release-validation/workspace-admission-adapter.mjs';
import { digest } from '../../scripts/release-validation/identity.mjs';
import { validateStage } from '../../scripts/release-validation/stage.mjs';
import {
  encodeCatalogueEvidence,
  encodeEvidence,
} from '../../scripts/release-validation/assertion-evidence.mjs';
import { carrierEvidence } from './carrier-fixture.mjs';

// Independently reviewed against the startup switch, fixture and three production patch sites.
const cases = [
  'O01.absence',
  'O02.orphan',
  'O03.missing-content',
  'O04.missing-custody',
  'O05.routing',
  'O06.legacy',
  'O07.creation',
  'O08.clear',
  'O09.corrupt',
  'O10.factor',
  'O11.recheck',
  'O12.replay',
  'O13.init-death',
  'O14.future',
  'O15.scope',
];
const mutations = [
  [
    'probe-creates-database',
    'O01.absence',
    'preflight-no-database-side-effects',
    'src/crdt/startupStorage.ts',
  ],
  ['orphan-is-fresh', 'O02.orphan', 'orphan-not-fresh', 'src/crdt/startupClassification.ts'],
  [
    'skip-open-classification',
    'O11.recheck',
    'open-rechecks-after-grant',
    'src/crdt/ownedStartup.ts',
  ],
];
const evidence = (t) => {
  const f = carrierEvidence(t, 'owned-startup', 'owned-startup-browser', {
    candidate: 'startup',
    patchPrefix: '',
  });
  return { ...f, actual: JSON.parse(JSON.stringify(encodeCatalogueEvidence(f.actual))) };
};

test('owned startup binds fifteen cases and three full-path mutations with distinct census and replay selections', () => {
  const full = ownedStartupStage(process.cwd());
  assert.deepEqual(
    full.expect.selection.cases.map((c) => c.id),
    cases,
  );
  assert.deepEqual(
    full.expect.selection.mutants.map((m) => [m.id, m.case, m.assertion, m.patch.file]),
    mutations,
  );
  const census = ownedStartupStage(process.cwd(), ['--case', 'O01.absence,O02.orphan,O11.recheck']);
  assert.deepEqual(
    census.expect.selection.mutants.map((m) => m.id),
    mutations.map((m) => m[0]),
  );
  const baseline = ownedStartupStage(process.cwd(), ['--case', 'O01.absence', '--no-mutants']);
  const replay = ownedStartupStage(process.cwd(), ['--case', 'O12.replay,O13.init-death']);
  assert.equal(baseline.expect.selection.mutants.length, 0);
  assert.equal(replay.expect.selection.mutants.length, 0);
  assert.equal(
    new Set([full, census, baseline, replay, workspaceAdmissionStage(process.cwd())].map(digest))
      .size,
    5,
  );
  for (const stage of [full, census, baseline, replay]) validateStage(stage);
  assert.throws(
    () => validateStage({ ...full, argv: ['node', 'scripts/workspace-admission/worker.mjs'] }),
    /Unreviewed carrier worker/,
  );
  assert.throws(() => ownedStartupSelection(process.cwd(), ['--case', 'O01.absence,O01.absence']));
});

test('startup probes and post-grant classification need their own changed source and specific failing assertion', (t) => {
  const f = evidence(t);
  assert.equal(reconcileOwnedStartup(f.selection, f.actual, f.context).length, 18);
  for (const change of [
    (x) => x.mutations.pop(),
    (x) => {
      x.mutations[2] = x.mutations[0];
    },
    (x) => {
      x.mutations[2].result.source.files = x.mutations[0].result.source.files;
    },
    (x) => {
      x.mutations[0].result.cases[0].assertions[0].id = 'open-no-database-side-effects';
    },
    (x) => {
      x.mutations[2].result.cases[0].assertions[0].id = 'queued-open-not-exposed';
    },
    (x) => {
      x.mutations[1].result.source.files['src/crdt/startupClassification.ts'] =
        x.candidates[0].source.files['src/crdt/startupClassification.ts'];
    },
    (x) => {
      x.mutations[0].result.mutation.file = 'startupStorage.ts';
    },
    (x) => {
      x.candidates[0].cases.find((c) => c.id === 'O11.recheck').assertions.pop();
    },
  ]) {
    const actual = structuredClone(f.actual);
    change(actual);
    assert.throws(() => reconcileOwnedStartup(f.selection, actual, f.context));
  }
  assert.throws(() =>
    reconcileOwnedStartup(f.selection, f.actual, {
      ...f.context,
      sources: f.context.sources.filter((p) => p.path !== 'src/crdt/startupStorage.ts'),
    }),
  );
});

test('startup refuses unbound reports and preserves no-exposure evidence through serialization', (t) => {
  const f = evidence(t);
  f.actual.candidates[0].cases
    .find((c) => c.id === 'O12.replay')
    .assertions.push({
      id: 'replay-not-exposed',
      actual: encodeEvidence([0, 0, undefined, undefined, undefined]),
      expected: encodeEvidence([0, 0, undefined, undefined, undefined]),
      passed: true,
    });
  assert.equal(reconcileOwnedStartup(f.selection, f.actual, f.context).length, 18);
  for (const change of [
    (x) => {
      x.requestedCandidates = ['owned-startup'];
    },
    (x) => {
      x.candidates[0].id = 'workspace';
    },
    (x) => {
      x.scope = 'workspace-admission-browser';
    },
    (x) => {
      delete x.evidenceEncoding;
    },
    (x) => {
      x.releaseNonce = 'previous';
    },
    (x) => {
      x.servers[0].variant = 'owned-startup';
    },
    (x) => {
      x.servers[0].closed = false;
    },
    (x) => {
      delete x.candidates[0].source.files['account-protocol/fixture.ts'];
    },
    (x) => {
      x.candidates[0].cases.find((c) => c.id === 'O12.replay').assertions.at(-1).actual =
        encodeEvidence([0, 0, null, null, null]);
    },
    (x) => {
      x.candidates[0].cases.find((c) => c.id === 'O12.replay').assertions.at(-1).actual =
        encodeEvidence([false, false, undefined, undefined, undefined]);
    },
    (x) => {
      delete x.candidates[0].cases.find((c) => c.id === 'O12.replay').assertions.at(-1).actual;
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
    assert.throws(() => reconcileOwnedStartup(f.selection, actual, f.context));
  }
});

test('160 generated startup selections reject omitted probes and substituted refusal evidence', (t) => {
  const f = evidence(t);
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 14 }), { minLength: 1, maxLength: 15 }),
      fc.boolean(),
      fc.integer({ min: 0, max: 3 }),
      (indices, withMutations, fault) => {
        const ids = cases.filter((_, i) => indices.includes(i));
        const expected = withMutations ? mutations.filter((m) => ids.includes(m[1])) : [];
        const selection = ownedStartupSelection(process.cwd(), [
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
          (s) => s.variant === 'startup' || expected.some((m) => m[0] === s.variant),
        );
        assert.equal(
          reconcileOwnedStartup(selection, actual, f.context).length,
          ids.length + expected.length,
        );
        if (!expected.length || fault === 0) actual.candidates[0].cases.pop();
        else {
          const at = fault % expected.length;
          if (fault === 1) actual.mutations.splice(at, 1);
          else if (fault === 2)
            actual.mutations[at].result.cases[0].assertions[0].id = 'unrelated-startup-refusal';
          else actual.mutations[at].result.source.files = actual.candidates[0].source.files;
        }
        assert.throws(() => reconcileOwnedStartup(selection, actual, f.context));
      },
    ),
    { seed: 130909, numRuns: 160 },
  );
});
