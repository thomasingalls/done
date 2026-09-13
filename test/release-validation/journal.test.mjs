import test from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import {
  journalSelection,
  journalStage,
  reconcileJournal,
} from '../../scripts/release-validation/journal-adapter.mjs';
import { carrierSelection } from '../../scripts/release-validation/carrier-adapter.mjs';
import { contentStage } from '../../scripts/release-validation/content-adapter.mjs';
import { digest } from '../../scripts/release-validation/identity.mjs';
import { validateStage } from '../../scripts/release-validation/stage.mjs';
import { carrierEvidence } from './carrier-fixture.mjs';

// Reviewed independently against the journal's scenario switches and patch targets.
const expectedCases = [
  'C01.synchronous-crash',
  'C01.remote-basis',
  'C03.refusals',
  'C03.watermark',
  'C03.actual-quota',
  'C09.unreadable',
  'C09.enumeration-change',
  'C11.abort-flush',
  'C11.crash-before-cleanup',
  'C11.changed-entry',
  'C11.cleanup-refused',
  'C01.handoff-race',
  'C04.close-and-keys',
  'C04.frozen-writer',
  'C04.concurrent-writers',
  'C11.chunked-flush',
  'C03.host-smoke',
];
const expectedMutations = [
  [
    'skip-storage-append',
    'C01.synchronous-crash',
    'receipt-already-has-carrier',
    'journalStore.ts',
  ],
  ['acknowledge-refusal', 'C03.refusals', 'unavailable-does-not-acknowledge', 'journalStore.ts'],
  ['remove-changed-entry', 'C11.changed-entry', 'changed-entry-retained', 'journalStore.ts'],
  ['cleanup-before-commit', 'C11.abort-flush', 'aborted-flush-retains-journal', 'journalStore.ts'],
  [
    'reread-journal-after-content',
    'C01.handoff-race',
    'handoff-cannot-fall-between-reads',
    'custody.ts',
  ],
  ['skip-wasm-disposal', 'C04.close-and-keys', 'close-erases-wasm-instance', 'journalCodec.ts'],
];

test('journal binds all 17 cases and six mutations while selected and baseline-only variants remain distinct', () => {
  const full = journalStage(process.cwd());
  assert.deepEqual(
    full.expect.selection.cases.map((c) => c.id),
    expectedCases,
  );
  assert.deepEqual(
    full.expect.selection.mutants.map((m) => [m.id, m.case, m.assertion, m.patch.file]),
    expectedMutations,
  );
  const selection = ['--case', 'C01.handoff-race,C11.abort-flush'];
  const control = journalStage(process.cwd(), selection);
  assert.deepEqual(
    control.expect.selection.cases.map((c) => c.id),
    ['C11.abort-flush', 'C01.handoff-race'],
  );
  assert.deepEqual(
    control.expect.selection.mutants.map((m) => m.id),
    ['cleanup-before-commit', 'reread-journal-after-content'],
  );
  const baseline = journalStage(process.cwd(), [...selection, '--no-mutants']);
  assert.equal(baseline.expect.selection.mutants.length, 0);
  assert.equal(new Set([full, control, baseline, contentStage(process.cwd())].map(digest)).size, 4);
  for (const stage of [full, control, baseline]) validateStage(stage);
  assert.throws(
    () => validateStage({ ...full, argv: ['node', 'scripts/content/worker.mjs'] }),
    /Unreviewed carrier worker/,
  );
  assert.throws(
    () => carrierSelection('unreviewed-family', process.cwd()),
    /Unreviewed carrier family/,
  );
  for (const args of [
    ['--case', 'C09.unreadable,C09.unreadable'],
    ['--case', 'unknown'],
    ['--case'],
    ['--unknown'],
    ['--output'],
    ['--no-mutants', '--no-mutants'],
  ])
    assert.throws(() => journalSelection(process.cwd(), args));
  assert.equal(journalSelection(process.cwd(), ['--output', 'chosen']).output, 'chosen');
});

test('journal reconciliation refuses unrelated failure, cross-family reports and incomplete handoff evidence', (t) => {
  const f = carrierEvidence(t, 'journal');
  assert.equal(reconcileJournal(f.selection, f.actual, f.context).length, 23);
  const handoff = 4;
  const changes = [
    (x) => {
      x.scope = 'content-carrier-browser';
    },
    (x) => {
      x.requestedCandidates = ['content'];
    },
    (x) => {
      x.releaseNonce = 'previous';
    },
    (x) => {
      x.mutations.splice(handoff, 1);
    },
    (x) => {
      x.mutations[handoff].result.cases[0].assertions[0].id = 'unrelated-refusal';
    },
    (x) => {
      x.candidates[0].cases.find((c) => c.id === 'C01.handoff-race').assertions.pop();
    },
    (x) => {
      x.mutations[handoff].result.source.files = x.candidates[0].source.files;
    },
    (x) => {
      x.mutations[handoff].result.mutation.to = 'wrong repair';
    },
    (x) => {
      x.servers.pop();
    },
    (x) => {
      x.servers[0].closed = false;
    },
    (x) => {
      x.candidates[0].cases.pop();
    },
    (x) => {
      x.exitCode = 1;
    },
  ];
  for (const change of changes) {
    const actual = structuredClone(f.actual);
    change(actual);
    assert.throws(() => reconcileJournal(f.selection, actual, f.context));
  }
});

test('claimed journal mutations require a pinned source target and a real byte change', (t) => {
  const f = carrierEvidence(t, 'journal');
  const missing = 'src/crdt/journalCodec.ts';
  const actual = structuredClone(f.actual);
  for (const r of [actual.candidates[0], ...actual.mutations.map((m) => m.result)])
    delete r.source.files[missing];
  assert.throws(
    () =>
      reconcileJournal(f.selection, actual, {
        ...f.context,
        sources: f.context.sources.filter((p) => p.path !== missing),
      }),
    /Mutation source missing/,
  );
  const selection = structuredClone(f.selection);
  selection.mutants[0].patch.to = selection.mutants[0].patch.from;
  assert.throws(() => reconcileJournal(selection, f.actual, f.context), /Mutation must change/);
});

test('160 generated journal selections preserve their exact denominator and reject omitted or falsely detected work', (t) => {
  const f = carrierEvidence(t, 'journal');
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 16 }), { minLength: 1, maxLength: 17 }),
      fc.boolean(),
      (indices, mutations) => {
        const cases = f.selection.cases.filter((_, i) => indices.includes(i));
        const ids = cases.map((c) => c.id);
        const mutants = mutations ? f.selection.mutants.filter((m) => ids.includes(m.case)) : [];
        const selection = { cases, mutants };
        const actual = structuredClone(f.actual);
        actual.requestedCases = ids;
        actual.candidates[0].cases = actual.candidates[0].cases.filter((c) => ids.includes(c.id));
        actual.mutations = actual.mutations.filter((m) => mutants.some((s) => s.id === m.id));
        actual.servers = actual.servers.filter(
          (s) => s.variant === 'journal' || mutants.some((m) => m.id === s.variant),
        );
        assert.equal(
          reconcileJournal(selection, actual, f.context).length,
          cases.length + mutants.length,
        );
        if (actual.mutations.length)
          actual.mutations[0].result.cases[0].assertions[0].id = 'failed-before-journal-oracle';
        else actual.candidates[0].cases.pop();
        assert.throws(() => reconcileJournal(selection, actual, f.context));
      },
    ),
    { seed: 130905, numRuns: 160 },
  );
});
