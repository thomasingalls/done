import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import * as fc from 'fast-check';
import { readFileSync } from 'node:fs';
import {
  localGenesisSelection,
  localGenesisStage,
  reconcileLocalGenesis,
} from '../../scripts/release-validation/local-genesis-adapter.mjs';
import { ownedStartupStage } from '../../scripts/release-validation/owned-startup-adapter.mjs';
import { digest } from '../../scripts/release-validation/identity.mjs';
import { catalogueCensus } from '../../scripts/release-validation/census.mjs';
import { validateStage } from '../../scripts/release-validation/stage.mjs';
import {
  encodeCatalogueEvidence,
  encodeEvidence,
  validateEvidence,
} from '../../scripts/release-validation/assertion-evidence.mjs';
import { carrierEvidence } from './carrier-fixture.mjs';

// Literal expectations reviewed against the nine fixture commit hooks and scenario branch.
const boundaries = [
  ['G03.kill-claim', 'claim'],
  ['G04.kill-reservation', 'reservation'],
  ['G05.kill-custody', 'custody'],
  ['G06.kill-progress-content', 'progress-content'],
  ['G07.kill-witness', 'witness'],
  ['G08.kill-counter', 'counter'],
  ['G09.kill-witness-ready', 'witness-ready'],
  ['G10.kill-progress-ready', 'progress-ready'],
  ['G11.kill-index', 'index'],
];
const cases = [
  'G01.confirm',
  'G02.race',
  ...boundaries.map(([id]) => id),
  'G12.abort',
  'G13.cancel',
  'G14.missing',
  'G15.auth',
  'G16.index',
  'G17.scope',
];
const mutations = [
  [
    'skip-factor-confirmation',
    'G01.confirm',
    'mismatched-confirmation-refused',
    'src/crdt/localGenesis.ts',
  ],
  [
    'forget-completed-stage',
    'G14.missing',
    'missing-complete-refuses',
    'src/crdt/localGenesisStorage.ts',
  ],
  [
    'skip-progress-authentication',
    'G15.auth',
    'damaged-progress-refuses',
    'src/crdt/localGenesisRecord.ts',
  ],
  ['legacy-overwrites-local', 'G16.index', 'legacy-cannot-close-local', 'src/crdt/slotIndex.ts'],
];
const provenance = [
  'G03.kill-claim',
  'G06.kill-progress-content',
  'G10.kill-progress-ready',
  'G11.kill-index',
  'G12.abort',
  'G14.missing',
  'G15.auth',
];
const evidence = (t) => {
  const f = carrierEvidence(t, 'local-genesis', 'local-genesis-browser', {
    candidate: 'genesis',
    patchPrefix: '',
  });
  for (const [id, boundary] of boundaries)
    f.actual.candidates[0].cases.find((c) => c.id === id).boundary = boundary;
  return { ...f, actual: JSON.parse(JSON.stringify(encodeCatalogueEvidence(f.actual))) };
};

test('Local genesis independently resolves nine generated crash boundaries and the provenance selection', () => {
  const full = localGenesisStage(process.cwd());
  assert.deepEqual(
    full.expect.selection.cases.map((c) => c.id),
    cases,
  );
  assert.deepEqual(
    full.expect.selection.mutants.map((m) => [m.id, m.case, m.assertion, m.patch.file]),
    mutations,
  );
  const selected = localGenesisStage(process.cwd(), ['--case', provenance.join(',')]);
  assert.deepEqual(
    selected.expect.selection.cases.map((c) => c.id),
    provenance,
  );
  assert.deepEqual(
    selected.expect.selection.mutants.map((m) => m.id),
    mutations.slice(1, 3).map((m) => m[0]),
  );
  const crash = localGenesisStage(process.cwd(), ['--case', 'G08.kill-counter', '--no-mutants']);
  const baseline = localGenesisStage(process.cwd(), ['--case', 'G01.confirm', '--no-mutants']);
  assert.equal(crash.expect.selection.mutants.length, 0);
  assert.equal(baseline.expect.selection.mutants.length, 0);
  assert.equal(
    new Set([full, selected, crash, baseline, ownedStartupStage(process.cwd())].map(digest)).size,
    5,
  );
  for (const stage of [full, selected, crash, baseline]) validateStage(stage);
  assert.throws(
    () => validateStage({ ...full, argv: ['node', 'scripts/owned-startup/worker.mjs'] }),
    /Unreviewed carrier worker/,
  );
  assert.throws(() =>
    localGenesisSelection(process.cwd(), ['--case', 'G08.kill-counter,G08.kill-counter']),
  );
  // A shortened generator changes the independent census, even if its remaining cases pass.
  const text = readFileSync('scripts/local-genesis/catalog.mjs', 'utf8');
  assert.equal(text.split("  'counter',").length, 2);
  const shortened = catalogueCensus(text.replace("  'counter',", ''));
  assert.notDeepEqual(
    shortened.cases.map((c) => c.id),
    cases,
  );
  assert.equal(shortened.cases.length, 16);
});

test('genesis refuses substituted crash boundaries and requires exact factor, progress and index mutation evidence', (t) => {
  const f = evidence(t);
  assert.equal(reconcileLocalGenesis(f.selection, f.actual, f.context).length, 21);
  for (const change of [
    (x) => x.mutations.pop(),
    (x) => {
      x.mutations[2] = x.mutations[1];
    },
    (x) => {
      x.mutations[2].result.source.files = x.mutations[1].result.source.files;
    },
    (x) => {
      x.mutations[0].result.cases[0].assertions[0].id = 'wrong-confirmation-no-writes';
    },
    (x) => {
      x.mutations[3].result.cases[0].assertions[0].id = 'legacy-cannot-delete-local';
    },
    (x) => {
      x.mutations[1].result.source.files['src/crdt/localGenesisStorage.ts'] =
        x.candidates[0].source.files['src/crdt/localGenesisStorage.ts'];
    },
    (x) => {
      x.mutations[0].result.mutation.file = 'localGenesis.ts';
    },
    (x) => {
      x.candidates[0].cases.find((c) => c.id === 'G15.auth').assertions.pop();
    },
    (x) => {
      x.candidates[0].cases.find((c) => c.id === 'G03.kill-claim').boundary = 'index';
    },
    (x) => {
      delete x.candidates[0].cases.find((c) => c.id === 'G08.kill-counter').boundary;
    },
    (x) => {
      x.candidates[0].cases.find((c) => c.id === 'G12.abort').boundary = 'claim';
    },
  ]) {
    const actual = structuredClone(f.actual);
    change(actual);
    assert.throws(() => reconcileLocalGenesis(f.selection, actual, f.context));
  }
  assert.throws(() =>
    reconcileLocalGenesis(f.selection, f.actual, {
      ...f.context,
      sources: f.context.sources.filter((p) => p.path !== 'src/crdt/localGenesisRecord.ts'),
    }),
  );
});

test('genesis report identity preserves nested inventories and unavailable error values', (t) => {
  const f = evidence(t);
  const row = f.actual.candidates[0].cases.find((c) => c.id === 'G12.abort');
  row.assertions.push({
    id: 'nested-abort-inventory',
    actual: encodeEvidence({ entries: [], error: undefined, mounts: 0 }),
    expected: encodeEvidence({ entries: [], error: undefined, mounts: 0 }),
    passed: true,
  });
  assert.equal(reconcileLocalGenesis(f.selection, f.actual, f.context).length, 21);
  for (const change of [
    (x) => {
      x.requestedCandidates = ['local-genesis'];
    },
    (x) => {
      x.candidates[0].id = 'startup';
    },
    (x) => {
      x.scope = 'owned-startup-browser';
    },
    (x) => {
      delete x.evidenceEncoding;
    },
    (x) => {
      x.releaseNonce = 'previous';
    },
    (x) => {
      x.servers[0].variant = 'local-genesis';
    },
    (x) => {
      x.servers[0].closed = false;
    },
    (x) => {
      delete x.candidates[0].source.files['account-protocol/fixture.ts'];
    },
    (x) => {
      x.candidates[0].cases.find((c) => c.id === 'G12.abort').assertions.at(-1).actual =
        encodeEvidence({ entries: [], error: null, mounts: 0 });
    },
    (x) => {
      x.candidates[0].cases.find((c) => c.id === 'G12.abort').assertions.at(-1).actual =
        encodeEvidence({ entries: [], error: undefined, mounts: false });
    },
    (x) => {
      delete x.candidates[0].cases.find((c) => c.id === 'G12.abort').assertions.at(-1).actual;
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
    assert.throws(() => reconcileLocalGenesis(f.selection, actual, f.context));
  }
});

test('160 generated genesis selections reject omitted work, substituted mutations and mislabeled crash points', (t) => {
  const f = evidence(t);
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 16 }), { minLength: 1, maxLength: 17 }),
      fc.boolean(),
      fc.integer({ min: 0, max: 4 }),
      (indices, withMutations, fault) => {
        const ids = cases.filter((_, i) => indices.includes(i));
        const expected = withMutations ? mutations.filter((m) => ids.includes(m[1])) : [];
        const selection = localGenesisSelection(process.cwd(), [
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
          (s) => s.variant === 'genesis' || expected.some((m) => m[0] === s.variant),
        );
        assert.equal(
          reconcileLocalGenesis(selection, actual, f.context).length,
          ids.length + expected.length,
        );
        const crash = actual.candidates[0].cases.find((c) => c.boundary);
        if (fault === 4 && crash) crash.boundary = 'unexecuted-boundary';
        else if (!expected.length || fault === 0) actual.candidates[0].cases.pop();
        else {
          const at = fault % expected.length;
          if (fault === 1) actual.mutations.splice(at, 1);
          else if (fault === 2)
            actual.mutations[at].result.cases[0].assertions[0].id = 'unrelated-genesis-refusal';
          else actual.mutations[at].result.source.files = actual.candidates[0].source.files;
        }
        assert.throws(() => reconcileLocalGenesis(selection, actual, f.context));
      },
    ),
    { seed: 130910, numRuns: 160 },
  );
});

test('byte-array evidence matches native equality across 160 generated nested claims and rejects type loss', () => {
  const encode = (v) => JSON.parse(JSON.stringify(encodeEvidence(v)));
  const initial = { mac: new Uint8Array([0, 128, 255]), seals: [{ ct: new Uint8Array([7, 8]) }] };
  assert.deepEqual(encode(initial), encode(structuredClone(initial)));
  for (const invalid of [
    ['uint8array', [256]],
    ['uint8array', [-1]],
    ['uint8array', [1.5]],
    ['uint8array', [null]],
    ['uint8array', [-0]],
    ['uint8array', Array(1)],
    ['uint8array', '00'],
  ])
    assert.throws(() => validateEvidence(invalid));
  for (const unsupported of [
    new Uint16Array([1]),
    new DataView(new ArrayBuffer(1)),
    Buffer.from([1]),
    Object.assign(new Uint8Array([1]), { extra: 2 }),
  ])
    assert.throws(() => encodeEvidence(unsupported));
  fc.assert(
    fc.property(
      fc.uint8Array({ maxLength: 256 }),
      fc.integer({ min: 0, max: 8 }),
      (bytes, offset) => {
        const backing = new Uint8Array(bytes.length + offset + 3);
        backing.set(bytes, offset);
        const view = backing.subarray(offset, offset + bytes.length);
        const altered = bytes.length ? bytes.slice() : new Uint8Array([0]);
        if (bytes.length) altered[bytes.length - 1] ^= 1;
        const variants = [bytes.slice(), view, altered, Array.from(bytes), { ...bytes }];
        for (const other of variants) {
          const left = { initial: { mac: bytes, absent: undefined } };
          const right = { initial: { mac: other, absent: undefined } };
          const encodedLeft = encode(left),
            encodedRight = encode(right);
          validateEvidence(encodedLeft);
          validateEvidence(encodedRight);
          assert.equal(
            isDeepStrictEqual(encodedLeft, encodedRight),
            isDeepStrictEqual(left, right),
          );
        }
      },
    ),
    { seed: 130911, numRuns: 160 },
  );
});
