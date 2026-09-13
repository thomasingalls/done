import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateReport, mutationStatus } from '../storage-conformance/report.mjs';
import { catalogueCensus } from './census.mjs';
import { hash, digest } from './identity.mjs';

export function contentSelection(root, args = []) {
  let caseIds,
    mutations = true,
    output;
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    assert(!seen.has(option), 'Duplicate content option');
    seen.add(option);
    if (option === '--no-mutants') mutations = false;
    else {
      assert(['--case', '--output'].includes(option), 'Unknown content option');
      const value = args[++i];
      assert(value && !value.startsWith('--'), 'Missing content option value');
      if (option === '--case') caseIds = value.split(',');
      else output = value;
    }
  }
  const census = catalogueCensus(readFileSync(join(root, 'scripts/content/catalog.mjs'), 'utf8'), {
    patches: true,
  });
  if (caseIds)
    assert(
      caseIds.length === new Set(caseIds).size &&
        caseIds.every((id) => census.cases.some((c) => c.id === id)),
      'Unknown or duplicate content case',
    );
  const selected = caseIds ? census.cases.filter((c) => caseIds.includes(c.id)) : census.cases;
  assert(selected.length, 'Empty content selection');
  return {
    output,
    selection: {
      cases: selected,
      mutants: mutations ? census.mutants.filter((m) => selected.some((c) => c.id === m.case)) : [],
    },
  };
}

export function contentStage(root, args = [], id = 'content:full') {
  const { selection } = contentSelection(root, args);
  const selected = selection.cases.map((c) => c.id);
  return {
    id,
    argv: [
      'node',
      'scripts/content/worker.mjs',
      '--case',
      selected.join(','),
      ...(args.includes('--no-mutants') ? ['--no-mutants'] : []),
    ],
    env: {},
    variant: 'content-' + digest(selection),
    expect: { kind: 'content', selection },
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    deadlineMs: selected.length === 1 ? 90000 : 120000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 4 * 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
  };
}

export function reconcileContent(selection, actual, { nonce, sources, root }) {
  assert.equal(actual.schema, 1);
  assert.equal(actual.releaseNonce, nonce, 'Stale content report');
  assert.equal(actual.scope, 'content-carrier-browser');
  assert(!actual.fatal, 'Content campaign reported a fatal failure');
  assert.equal(actual.exitCode, 0, 'Content campaign did not finish successfully');
  assert(typeof actual.finished === 'string', 'Content campaign did not finish');
  assert.deepEqual(actual.requestedCandidates, ['content']);
  const caseIds = selection.cases.map((c) => c.id);
  assert.deepEqual(actual.requestedCases, caseIds, 'Content selection changed');
  assert.equal(actual.candidates.length, 1, 'Missing or extra content baseline');
  const baseline = actual.candidates[0];
  assert.equal(baseline.id, 'content');
  const pins = new Map(sources.filter((p) => p.sha256).map((p) => [p.path, p.sha256]));
  const sourcePaths = [...pins.keys()]
    .filter(
      (p) =>
        p.startsWith('src/') ||
        p.startsWith('account-protocol/') ||
        p === 'wasm/journal-seal/seal.generated.ts',
    )
    .sort();
  assert(sourcePaths.length, 'Missing independent content source pins');
  const check = (report, ids, mutation = null) => {
    validateReport(report, ids);
    for (const row of report.cases)
      assert.equal(
        new Set(row.assertions.map((a) => a.id)).size,
        row.assertions.length,
        'Duplicate content assertion',
      );
    assert.deepEqual(
      Object.keys(report.source.files).sort(),
      sourcePaths,
      'Incomplete tested content source population',
    );
    for (const path of sourcePaths) {
      let expected = pins.get(path);
      if (mutation && path === 'src/crdt/' + mutation.patch.file) {
        const text = readFileSync(join(root, path), 'utf8');
        assert.equal(text.split(mutation.patch.from).length, 2, 'Mutation anchor is not unique');
        expected = hash(text.replace(mutation.patch.from, mutation.patch.to));
      }
      assert.equal(report.source.files[path], expected, 'Tested content bytes differ: ' + path);
    }
  };
  check(baseline, caseIds);
  assert(
    baseline.cases.every((c) => c.status === 'pass'),
    'Non-passing content baseline',
  );
  assert.equal(baseline.mutation, null);
  assert.deepEqual(
    actual.mutations.map((m) => m.id),
    selection.mutants.map((m) => m.id),
    'Missing, duplicate or extra content mutation',
  );
  const outcomes = caseIds.map((id) => ({ id, outcome: 'pass' }));
  for (const [i, spec] of selection.mutants.entries()) {
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
    ['content', ...selection.mutants.map((m) => m.id)],
    'Server variants differ from the executed selection',
  );
  for (const server of actual.servers)
    assert(
      server.closed === true && /^http:\/\/127\.0\.0\.1:\d+$/.test(server.origin),
      'Unclosed or unowned content server',
    );
  return outcomes;
}
