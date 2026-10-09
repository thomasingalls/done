import test from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import {
  writeSessionSelection,
  writeSessionStage,
  reconcileWriteSession,
} from '../../scripts/release-validation/write-session-adapter.mjs';
import { localClearStage } from '../../scripts/release-validation/local-clear-adapter.mjs';
import { digest } from '../../scripts/release-validation/identity.mjs';
import { validateStage } from '../../scripts/release-validation/stage.mjs';
import {
  encodeCatalogueEvidence,
  encodeEvidence,
} from '../../scripts/release-validation/assertion-evidence.mjs';
import { readFileSync } from 'node:fs';
import { catalogueCensus } from '../../scripts/release-validation/census.mjs';
import { carrierEvidence } from './carrier-fixture.mjs';
// Literal expectations reviewed against scenario dispatch and source fault sites.
const cases = [
  'C04.shared-scope',
  'C04.freeze-barrier',
  'C04.drain-cleanup',
  'C04.detached-work',
  'C04.stale-task',
  'C04.cancel-queued',
  'C04.cancel-initialize',
  'C04.initialize-error',
  'C04.cleanup-error',
  'C04.renderer-death',
  'C04.worker-lifetime',
  'C04.exclusive-error',
  'C04.navigation',
];
const mutations = [
  [
    'split-coordination-domain',
    'C04.freeze-barrier',
    'frozen-writer-blocks-exclusive',
    'src/crdt/writeSession.ts',
  ],
  [
    'ignore-session-invalidation',
    'C04.drain-cleanup',
    'closing-callback-cannot-write',
    'src/crdt/writeSession.ts',
  ],
  [
    'release-before-drain',
    'C04.detached-work',
    'detached-work-precedes-disposal',
    'src/crdt/writeSession.ts',
  ],
  [
    'skip-cache-cleanup',
    'C04.drain-cleanup',
    'cache-cleared-before-exclusive',
    'src/crdt/writeSession.ts',
  ],
  [
    'reuse-finished-task',
    'C04.stale-task',
    'finished-task-cannot-write',
    'src/crdt/writeSession.ts',
  ],
];
const selectedIds = [
  'C04.freeze-barrier',
  'C04.drain-cleanup',
  'C04.detached-work',
  'C04.stale-task',
];
const evidence = (t) => {
  const f = carrierEvidence(t, 'write-session', 'C04-component-browser', {
    candidate: 'write-session',
    patchPrefix: '',
    patchFile: 'src/crdt/writeSession.ts',
  });
  for (const report of [f.actual.candidates[0], ...f.actual.mutations.map((m) => m.result)]) {
    report.source.path = 'src/crdt/writeSession.ts';
    report.source.original = f.actual.candidates[0].source.files['src/crdt/writeSession.ts'];
    report.source.sha256 = report.source.files['src/crdt/writeSession.ts'];
    for (const row of report.cases)
      row.artifacts = [{ point: 'unexpected-page-errors', errors: [] }];
  }
  return { ...f, actual: JSON.parse(JSON.stringify(encodeCatalogueEvidence(f.actual))) };
};
test('Write-session independently resolves the full catalogue, selected mutation subset and baseline-only variants', () => {
  const full = writeSessionStage(process.cwd());
  assert.deepEqual(
    full.expect.selection.cases.map((c) => c.id),
    cases,
  );
  assert.deepEqual(
    full.expect.selection.mutants.map((m) => [m.id, m.case, m.assertion, m.patch.file]),
    mutations,
  );
  const selected = writeSessionStage(process.cwd(), ['--case', selectedIds.join(',')]);
  assert.deepEqual(
    selected.expect.selection.cases.map((c) => c.id),
    selectedIds,
  );
  assert.deepEqual(
    selected.expect.selection.mutants.map((m) => m.id),
    mutations.filter((m) => selectedIds.includes(m[1])).map((m) => m[0]),
  );
  const baseline = writeSessionStage(process.cwd(), [
    '--case',
    'C04.worker-lifetime',
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
  assert.throws(() => writeSessionSelection(process.cwd(), ['--case', cases[0] + ',' + cases[0]]));
  assert.throws(() => writeSessionSelection(process.cwd(), ['--case', 'unreviewed-case']));
  const source = readFileSync('scripts/write-session/catalog.mjs', 'utf8');
  assert.throws(() => catalogueCensus(source, { patches: true }), /Missing catalogue patch/);
  assert.throws(
    () =>
      catalogueCensus(
        source.replace(
          "id: 'split-coordination-domain',",
          "id: 'split-coordination-domain', file: 'another.ts',",
        ),
        { patches: true, patchFile: 'src/crdt/writeSession.ts' },
      ),
    /conflicts with fixed mutation source/,
  );
});
test('Write-session requires every exact source mutation and its own discriminating assertion', (t) => {
  const f = evidence(t);
  assert.equal(
    reconcileWriteSession(f.selection, f.actual, f.context).length,
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
      assert.throws(() => reconcileWriteSession(f.selection, actual, f.context));
    }
  }
  assert.throws(() =>
    reconcileWriteSession(f.selection, f.actual, {
      ...f.context,
      sources: f.context.sources.filter((p) => p.path !== '' + mutations[0][3]),
    }),
  );
});
test('Write-session binds report identity, all runtime sources and unavailable receipt values', (t) => {
  const f = evidence(t);
  f.actual.candidates[0].cases[0].assertions.push({
    id: 'nested-receipt-value',
    actual: encodeEvidence({ status: undefined, removed: [], count: 0 }),
    expected: encodeEvidence({ status: undefined, removed: [], count: 0 }),
    passed: true,
  });
  assert.equal(
    reconcileWriteSession(f.selection, f.actual, f.context).length,
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
      x.candidates[0].source.sha256 = 'stale';
    },
    (x) => {
      x.candidates[0].cases[0].artifacts = [];
    },
    (x) => {
      x.candidates[0].cases[0].artifacts[0].errors = ['unexpected browser error'];
    },
    (x) => {
      x.fatal = { message: 'cancelled' };
    },
  ]) {
    const actual = structuredClone(f.actual);
    change(actual);
    assert.throws(() => reconcileWriteSession(f.selection, actual, f.context));
  }
});
test('160 generated Write-session selections reject omitted cases and substituted mutation evidence', (t) => {
  const f = evidence(t);
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 12 }), { minLength: 1, maxLength: 13 }),
      fc.boolean(),
      fc.integer({ min: 0, max: 3 }),
      (indices, withMutations, fault) => {
        const ids = cases.filter((_, i) => indices.includes(i));
        const expected = withMutations ? mutations.filter((m) => ids.includes(m[1])) : [];
        const selection = writeSessionSelection(process.cwd(), [
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
          (s) => s.variant === 'write-session' || expected.some((m) => m[0] === s.variant),
        );
        assert.equal(
          reconcileWriteSession(selection, actual, f.context).length,
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
        assert.throws(() => reconcileWriteSession(selection, actual, f.context));
      },
    ),
    { seed: 130915, numRuns: 160 },
  );
});
