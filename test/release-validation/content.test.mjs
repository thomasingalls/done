import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import * as fc from 'fast-check';
import {
  contentSelection,
  contentStage,
  reconcileContent,
} from '../../scripts/release-validation/content-adapter.mjs';
import { catalogueCensus } from '../../scripts/release-validation/census.mjs';
import { hash, digest } from '../../scripts/release-validation/identity.mjs';
import { validateStage } from '../../scripts/release-validation/stage.mjs';

function evidence(t) {
  const root = mkdtempSync(join(tmpdir(), 'done-content-census-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const catalogue = readFileSync('scripts/content/catalog.mjs', 'utf8');
  const selection = catalogueCensus(catalogue, { patches: true });
  const contents = new Map([
    ['account-protocol/fixture.ts', 'protocol'],
    ['wasm/journal-seal/seal.generated.ts', 'seal'],
  ]);
  for (const m of selection.mutants) {
    const path = 'src/crdt/' + m.patch.file;
    contents.set(path, (contents.get(path) ?? '') + m.patch.from + '\n');
  }
  const sources = [];
  for (const [path, text] of contents) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
    sources.push({ path, sha256: hash(text) });
  }
  const pins = Object.fromEntries(sources.map((p) => [p.path, p.sha256]));
  const assertion = (id, passed) => ({ id, actual: true, expected: passed, passed });
  const row = (id) => ({
    id,
    status: 'pass',
    assertions: [
      assertion('baseline', true),
      ...selection.mutants.filter((m) => m.case === id).map((m) => assertion(m.assertion, true)),
    ],
  });
  const actual = {
    schema: 1,
    releaseNonce: 'fresh',
    scope: 'content-carrier-browser',
    finished: 'now',
    exitCode: 0,
    requestedCandidates: ['content'],
    requestedCases: selection.cases.map((c) => c.id),
    candidates: [
      {
        id: 'content',
        mutation: null,
        source: { files: pins },
        cases: selection.cases.map((c) => row(c.id)),
      },
    ],
    mutations: selection.mutants.map((m) => ({
      id: m.id,
      assertion: m.assertion,
      status: 'detected',
      result: {
        id: m.id,
        mutation: m.patch,
        source: {
          files: {
            ...pins,
            ['src/crdt/' + m.patch.file]: hash(
              contents.get('src/crdt/' + m.patch.file).replace(m.patch.from, m.patch.to),
            ),
          },
        },
        cases: [{ id: m.case, status: 'fail', assertions: [assertion(m.assertion, false)] }],
      },
    })),
    servers: ['content', ...selection.mutants.map((m) => m.id)].map((variant) => ({
      variant,
      origin: 'http://127.0.0.1:12345',
      closed: true,
    })),
  };
  return { selection, actual, context: { nonce: 'fresh', root, sources } };
}

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
  const f = evidence(t);
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
  const f = evidence(t);
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
