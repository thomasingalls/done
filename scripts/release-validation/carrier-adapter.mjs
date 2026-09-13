import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateReport, mutationStatus } from '../storage-conformance/report.mjs';
import { catalogueCensus } from './census.mjs';
import { evidenceEncoding, validateEvidence } from './assertion-evidence.mjs';
import { hash, digest } from './identity.mjs';

// Candidate names and patch paths are protocol-specific, not derived from report labels.
const bindings = Object.freeze({
  'content-trim': { scope: 'content-trim-browser', candidate: 'trim', patchPrefix: 'src/crdt/' },
  'local-clear': {
    scope: 'local-clear-browser',
    candidate: 'clear',
    patchPrefix: '',
    boundaryByCase: {
      'L04.kill-intent': 'intent',
      'L05.kill-content-delete': 'content-delete',
      'L06.kill-stage-journal': 'stage-journal',
      'L07.kill-stage-custody': 'stage-custody',
      'L08.kill-stage-index': 'stage-index',
      'L09.kill-index-delete': 'index-delete',
      'L10.kill-stage-cleared': 'stage-cleared',
    },
  },
  'local-genesis': {
    scope: 'local-genesis-browser',
    candidate: 'genesis',
    patchPrefix: '',
    boundaryByCase: {
      'G03.kill-claim': 'claim',
      'G04.kill-reservation': 'reservation',
      'G05.kill-custody': 'custody',
      'G06.kill-progress-content': 'progress-content',
      'G07.kill-witness': 'witness',
      'G08.kill-counter': 'counter',
      'G09.kill-witness-ready': 'witness-ready',
      'G10.kill-progress-ready': 'progress-ready',
      'G11.kill-index': 'index',
    },
  },
  'owned-startup': { scope: 'owned-startup-browser', candidate: 'startup', patchPrefix: '' },
  content: { scope: 'content-carrier-browser', candidate: 'content', patchPrefix: 'src/crdt/' },
  journal: { scope: 'journal-carrier-browser', candidate: 'journal', patchPrefix: 'src/crdt/' },
  admission: {
    scope: 'ordered-admission-browser',
    candidate: 'admission',
    patchPrefix: 'src/crdt/',
  },
  'editor-admission': { scope: 'editor-admission-browser', candidate: 'editor', patchPrefix: '' },
  'workspace-admission': {
    scope: 'workspace-admission-browser',
    candidate: 'workspace',
    patchPrefix: '',
  },
});
const requireFamily = (family) =>
  assert(Object.hasOwn(bindings, family), 'Unreviewed carrier family');

export function carrierSelection(family, root, args = []) {
  requireFamily(family);
  let caseIds,
    mutations = true,
    output;
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    assert(!seen.has(option), 'Duplicate carrier option');
    seen.add(option);
    if (option === '--no-mutants') mutations = false;
    else {
      assert(['--case', '--output'].includes(option), 'Unknown carrier option');
      const value = args[++i];
      assert(value && !value.startsWith('--'), 'Missing carrier option value');
      if (option === '--case') caseIds = value.split(',');
      else output = value;
    }
  }
  const census = catalogueCensus(
    readFileSync(join(root, `scripts/${family}/catalog.mjs`), 'utf8'),
    {
      patches: true,
    },
  );
  if (caseIds)
    assert(
      caseIds.length === new Set(caseIds).size &&
        caseIds.every((id) => census.cases.some((c) => c.id === id)),
      'Unknown or duplicate carrier case',
    );
  const selected = caseIds ? census.cases.filter((c) => caseIds.includes(c.id)) : census.cases;
  assert(selected.length, 'Empty carrier selection');
  return {
    output,
    selection: {
      cases: selected,
      mutants: mutations ? census.mutants.filter((m) => selected.some((c) => c.id === m.case)) : [],
    },
  };
}

export function carrierStage(family, root, args = [], id = family + ':full') {
  const { selection } = carrierSelection(family, root, args);
  const selected = selection.cases.map((c) => c.id);
  return {
    id,
    argv: [
      'node',
      `scripts/${family}/worker.mjs`,
      '--case',
      selected.join(','),
      ...(args.includes('--no-mutants') ? ['--no-mutants'] : []),
    ],
    env: {},
    variant: family + '-' + digest(selection),
    expect: { kind: family, selection },
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    deadlineMs: selected.length === 1 ? 90000 : 120000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 4 * 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
  };
}

export function reconcileCarrier(family, selection, actual, { nonce, sources, root }) {
  requireFamily(family);
  const { scope, candidate, patchPrefix, boundaryByCase } = bindings[family];
  assert.equal(actual.schema, 1);
  assert.equal(actual.releaseNonce, nonce, 'Stale carrier report');
  assert.equal(actual.scope, scope);
  assert(!actual.fatal, 'Carrier campaign reported a fatal failure');
  assert.equal(actual.exitCode, 0, 'Carrier campaign did not finish successfully');
  assert(typeof actual.finished === 'string', 'Carrier campaign did not finish');
  assert.deepEqual(actual.requestedCandidates, [candidate]);
  const caseIds = selection.cases.map((c) => c.id);
  assert.deepEqual(actual.requestedCases, caseIds, 'Carrier selection changed');
  assert.equal(actual.candidates.length, 1, 'Missing or extra carrier baseline');
  const baseline = actual.candidates[0];
  assert.equal(baseline.id, candidate);
  const pins = new Map(sources.filter((p) => p.sha256).map((p) => [p.path, p.sha256]));
  const sourcePaths = [...pins.keys()]
    .filter(
      (p) =>
        p.startsWith('src/') ||
        p.startsWith('account-protocol/') ||
        p === 'wasm/journal-seal/seal.generated.ts',
    )
    .sort();
  assert(sourcePaths.length, 'Missing independent carrier source pins');
  if (
    [
      'editor-admission',
      'workspace-admission',
      'owned-startup',
      'local-genesis',
      'local-clear',
      'content-trim',
    ].includes(family)
  )
    assert.equal(actual.evidenceEncoding, evidenceEncoding, 'Missing assertion encoding');
  const check = (report, ids, mutation = null) => {
    if (
      [
        'editor-admission',
        'workspace-admission',
        'owned-startup',
        'local-genesis',
        'local-clear',
        'content-trim',
      ].includes(family)
    )
      for (const row of report.cases)
        for (const a of row.assertions) {
          validateEvidence(a.actual);
          validateEvidence(a.expected);
        }
    validateReport(report, ids);
    if (boundaryByCase)
      for (const row of report.cases)
        assert.equal(row.boundary, boundaryByCase[row.id], 'Catalogue crash boundary changed');
    for (const row of report.cases)
      assert.equal(
        new Set(row.assertions.map((a) => a.id)).size,
        row.assertions.length,
        'Duplicate carrier assertion',
      );
    assert.deepEqual(
      Object.keys(report.source.files).sort(),
      sourcePaths,
      'Incomplete tested carrier source population',
    );
    for (const path of sourcePaths) {
      let expected = pins.get(path);
      if (mutation && path === patchPrefix + mutation.patch.file) {
        const text = readFileSync(join(root, path), 'utf8');
        assert.equal(text.split(mutation.patch.from).length, 2, 'Mutation anchor is not unique');
        expected = hash(text.replace(mutation.patch.from, mutation.patch.to));
      }
      assert.equal(report.source.files[path], expected, 'Tested carrier bytes differ: ' + path);
    }
  };
  check(baseline, caseIds);
  assert(
    baseline.cases.every((c) => c.status === 'pass'),
    'Non-passing carrier baseline',
  );
  assert.equal(baseline.mutation, null);
  assert.deepEqual(
    actual.mutations.map((m) => m.id),
    selection.mutants.map((m) => m.id),
    'Missing, duplicate or extra carrier mutation',
  );
  const outcomes = caseIds.map((id) => ({ id, outcome: 'pass' }));
  for (const [i, spec] of selection.mutants.entries()) {
    assert(
      pins.has(patchPrefix + spec.patch.file),
      'Mutation source missing from independent pins',
    );
    assert.notEqual(spec.patch.from, spec.patch.to, 'Mutation must change source bytes');
    const row = actual.mutations[i];
    const baselineCase = baseline.cases.find((c) => c.id === spec.case);
    assert.equal(
      baselineCase.assertions.find((a) => a.id === spec.assertion)?.passed,
      true,
      'Baseline omitted the discriminating mutation assertion',
    );
    assert.equal(row.assertion, spec.assertion, 'Mutation assertion changed');
    assert.equal(row.result.id, spec.id);
    assert.deepEqual(row.result.mutation, spec.patch, 'Mutation patch changed');
    check(row.result, [spec.case], spec);
    assert.equal(
      mutationStatus(baselineCase, row.result.cases[0], spec.assertion),
      'detected',
      'Mutation survived or failed for the wrong assertion',
    );
    assert.equal(row.status, 'detected');
    outcomes.push({ id: spec.id, outcome: 'detected', assertion: spec.assertion });
  }
  assert.equal(actual.servers?.length, 1 + selection.mutants.length, 'Incomplete server lifecycle');
  assert.deepEqual(
    actual.servers.map((s) => s.variant),
    [candidate, ...selection.mutants.map((m) => m.id)],
    'Server variants differ from the executed selection',
  );
  for (const server of actual.servers)
    assert(
      server.closed === true && /^http:\/\/127\.0\.0\.1:\d+$/.test(server.origin),
      'Unclosed or unowned carrier server',
    );
  return outcomes;
}
