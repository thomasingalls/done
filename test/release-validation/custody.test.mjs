import test from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import {
  custodySelection,
  custodyStage,
  reconcileCustody,
} from '../../scripts/release-validation/custody-adapter.mjs';
import { localClearStage } from '../../scripts/release-validation/local-clear-adapter.mjs';
import { digest } from '../../scripts/release-validation/identity.mjs';
import { validateStage } from '../../scripts/release-validation/stage.mjs';
import {
  encodeCatalogueEvidence,
  encodeEvidence,
} from '../../scripts/release-validation/assertion-evidence.mjs';
import { join } from 'node:path';
import { carrierEvidence } from './carrier-fixture.mjs';
// Literal expectations reviewed against scenario dispatch and source fault sites.
const cases = [
  'C12.genesis',
  'C10.concurrent-creation',
  'C12.reservation-abort',
  'C12.interrupted-creation',
  'C12.completion-abort',
  'C12.metadata-authentication',
  'C10.partial-and-legacy',
  'C12.scope-and-authority',
  'C12.seal-ceiling',
  'C12.session-lifetime',
  'C12.cancel-crypto',
  'C12.cancel-initialize',
  'C13.profile-copy',
];
const mutations = [
  [
    'skip-nested-crypto-guard',
    'C12.cancel-crypto',
    'cancel-prevents-private-export',
    'custodyCrypto.ts',
  ],
  ['accept-unconfirmed-code', 'C12.genesis', 'wrong-confirmation-refused', 'custody.ts'],
  [
    'skip-reservation-commit',
    'C12.interrupted-creation',
    'durable-reservation-before-encrypt',
    'custody.ts',
  ],
  [
    'trust-unverified-metadata',
    'C12.metadata-authentication',
    'modified-count-refuses',
    'custody.ts',
  ],
  [
    'request-success-as-commit',
    'C12.reservation-abort',
    'no-encryption-before-reservation-completes',
    'custodyRecord.ts',
  ],
];
const selectedIds = [
  'C12.genesis',
  'C12.reservation-abort',
  'C12.interrupted-creation',
  'C12.metadata-authentication',
  'C12.cancel-crypto',
];
const evidence = (t) => {
  const f = carrierEvidence(t, 'custody', 'custody-component-browser', {
    candidate: 'custody',
    patchPrefix: 'src/crdt/',
  });
  const profileCase = f.actual.candidates[0].cases.find((c) => c.id === 'C13.profile-copy');
  for (const [id, value] of [
    ['copied-profile-has-no-content-opener', false],
    ['copied-profile-has-no-future-opener', false],
    ['positive-control-opens-content', true],
    ['positive-control-opens-future', true],
    ['no-factor-refuses-false', 'confirmation-required'],
    ['no-factor-refuses-true', 'confirmation-required'],
    ['external-factor-opens-copied-content-false', 'custody content probe: survives cold unlock'],
    ['external-factor-opens-copied-content-true', 'custody content probe: survives cold unlock'],
  ])
    profileCase.assertions.push({ id, actual: value, expected: value, passed: true });
  f.context.workerPid = 100;
  f.context.browserExecutable = '/pinned/chromium';
  f.context.custodyOutput = join(f.context.root, 'owned-custody');
  f.actual.profiles = ['source-false', 'copy-false', 'source-true', 'copy-true'].map((name, i) => {
    const profile = join(f.context.custodyOutput, 'custody', 'profiles', name);
    return {
      name,
      profile,
      pid: 101 + i,
      workerPid: 100,
      ownership: 'inherited-worker-group',
      executable: '/pinned/chromium',
      closed: true,
      exit: 0,
      signal: null,
      argv: [
        '--use-mock-keychain',
        '--password-store=basic',
        '--remote-debugging-port=0',
        '--user-data-dir=' + profile,
      ],
      endpoint: 'ws://127.0.0.1:12345/devtools/browser/abcd',
      ...(name.startsWith('copy-')
        ? {
            copy: {
              source: name.replace('copy-', 'source-'),
              sourceClosed: true,
              sourceDigest: 'a'.repeat(64),
              destinationDigest: 'a'.repeat(64),
            },
          }
        : {}),
    };
  });
  return { ...f, actual: JSON.parse(JSON.stringify(encodeCatalogueEvidence(f.actual))) };
};
test('Custody independently resolves the full catalogue, selected mutation subset and baseline-only variants', () => {
  const full = custodyStage(process.cwd());
  assert.deepEqual(
    full.expect.selection.cases.map((c) => c.id),
    cases,
  );
  assert.deepEqual(
    full.expect.selection.mutants.map((m) => [m.id, m.case, m.assertion, m.patch.file]),
    mutations,
  );
  const selected = custodyStage(process.cwd(), ['--case', selectedIds.join(',')]);
  assert.deepEqual(
    selected.expect.selection.cases.map((c) => c.id),
    selectedIds,
  );
  assert.deepEqual(
    selected.expect.selection.mutants.map((m) => m.id),
    mutations.filter((m) => selectedIds.includes(m[1])).map((m) => m[0]),
  );
  const baseline = custodyStage(process.cwd(), ['--case', 'C13.profile-copy', '--no-mutants']);
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
  assert.throws(() => custodySelection(process.cwd(), ['--case', cases[0] + ',' + cases[0]]));
  assert.throws(() => custodySelection(process.cwd(), ['--case', 'unreviewed-case']));
});
test('Custody requires every exact source mutation and its own discriminating assertion', (t) => {
  const f = evidence(t);
  assert.equal(
    reconcileCustody(f.selection, f.actual, f.context).length,
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
      assert.throws(() => reconcileCustody(f.selection, actual, f.context));
    }
  }
  assert.throws(() =>
    reconcileCustody(f.selection, f.actual, {
      ...f.context,
      sources: f.context.sources.filter((p) => p.path !== 'src/crdt/' + mutations[0][3]),
    }),
  );
});
test('Custody binds report identity, all runtime sources and unavailable receipt values', (t) => {
  const f = evidence(t);
  f.actual.candidates[0].cases[0].assertions.push({
    id: 'nested-receipt-value',
    actual: encodeEvidence({ status: undefined, removed: [], count: 0 }),
    expected: encodeEvidence({ status: undefined, removed: [], count: 0 }),
    passed: true,
  });
  assert.equal(
    reconcileCustody(f.selection, f.actual, f.context).length,
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
    assert.throws(() => reconcileCustody(f.selection, actual, f.context));
  }
});
test('160 generated Custody selections reject omitted cases and substituted mutation evidence', (t) => {
  const f = evidence(t);
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 12 }), { minLength: 1, maxLength: 13 }),
      fc.boolean(),
      fc.integer({ min: 0, max: 3 }),
      (indices, withMutations, fault) => {
        const ids = cases.filter((_, i) => indices.includes(i));
        const expected = withMutations ? mutations.filter((m) => ids.includes(m[1])) : [];
        const selection = custodySelection(process.cwd(), [
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
        if (!ids.includes('C13.profile-copy')) actual.profiles = [];
        actual.candidates[0].cases = actual.candidates[0].cases.filter((c) => ids.includes(c.id));
        actual.mutations = actual.mutations.filter((m) => expected.some((e) => e[0] === m.id));
        actual.servers = actual.servers.filter(
          (s) => s.variant === 'custody' || expected.some((m) => m[0] === s.variant),
        );
        assert.equal(
          reconcileCustody(selection, actual, f.context).length,
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
        assert.throws(() => reconcileCustody(selection, actual, f.context));
      },
    ),
    { seed: 130914, numRuns: 160 },
  );
});

test('custody refuses missing, live, substituted or incomplete copied-profile evidence', (t) => {
  const f = evidence(t);
  for (const change of [
    (x) => x.profiles.pop(),
    (x) => {
      x.candidates[0].cases.find((c) => c.id === 'C13.profile-copy').assertions = [];
    },
    (x) => {
      const a = x.candidates[0].cases
        .find((c) => c.id === 'C13.profile-copy')
        .assertions.find((a) => a.id === 'positive-control-opens-content');
      a.actual = a.expected = encodeEvidence(false);
    },
    (x) => {
      x.profiles[1].copy.sourceClosed = false;
    },
    (x) => {
      x.profiles[1].copy.destinationDigest = 'b'.repeat(64);
    },
    (x) => {
      x.profiles[3].copy.source = 'source-false';
    },
    (x) => {
      x.profiles[0].closed = false;
    },
    (x) => {
      x.profiles[0].exit = null;
    },
    (x) => {
      x.profiles[0].signal = 'SIGKILL';
    },
    (x) => {
      x.profiles[0].ownership = 'detached';
    },
    (x) => {
      x.profiles[1].pid = x.profiles[0].pid;
    },
    (x) => {
      x.profiles[0].workerPid = 999;
    },
    (x) => {
      x.profiles[0].executable = '/unreviewed/chromium';
    },
    (x) => {
      x.profiles[0].profile = '/another/profile';
    },
    (x) => {
      x.profiles[0].argv = [];
    },
  ]) {
    const actual = structuredClone(f.actual);
    change(actual);
    assert.throws(() => reconcileCustody(f.selection, actual, f.context));
  }
});
