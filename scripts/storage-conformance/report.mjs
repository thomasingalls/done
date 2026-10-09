import { isDeepStrictEqual } from 'node:util';
export const statuses = ['pass', 'fail', 'error', 'not-implemented'];
export function validateReport(report, expectedIds) {
  const expected = new Set(expectedIds);
  if (!expected.size) throw Error('Empty scenario inventory');
  if (expected.size !== expectedIds.length) throw Error('Duplicate expected scenario');
  const seen = new Set();
  for (const row of report.cases) {
    if (!expected.has(row.id) || seen.has(row.id))
      throw Error(`Unexpected/duplicate scenario: ${row.id}`);
    seen.add(row.id);
    for (const assertion of row.assertions ?? []) {
      if (
        !Object.hasOwn(assertion, 'actual') ||
        !Object.hasOwn(assertion, 'expected') ||
        assertion.passed !== isDeepStrictEqual(assertion.actual, assertion.expected)
      )
        throw Error(`Assertion outcome disagrees with its evidence: ${row.id}/${assertion.id}`);
    }
    if (!statuses.includes(row.status)) throw Error(`Unknown status: ${row.status}`);
    if (
      row.status === 'pass' &&
      (!row.assertions?.length || row.assertions.some((a) => a.passed !== true))
    )
      throw Error(`Pass without successful assertions: ${row.id}`);
    if (row.status === 'not-implemented' && !row.reason)
      throw Error(`Missing capability reason: ${row.id}`);
    if (row.status === 'fail' && !row.assertions?.some((a) => a.passed === false))
      throw Error(`Failure without an oracle: ${row.id}`);
    if (row.status === 'error' && !row.error) throw Error(`Error without diagnosis: ${row.id}`);
  }
  if (seen.size !== expected.size) throw Error('Scenario inventory is incomplete');
  return report;
}
export function mutationStatus(baseline, mutant, assertion) {
  if (!baseline || baseline.status !== 'pass') return 'baseline-not-passing';
  if (mutant.status === 'error') return 'error';
  return mutant.status === 'fail' &&
    mutant.assertions.some((a) => a.id === assertion && a.passed === false)
    ? 'detected'
    : 'survived';
}
export function exitCode(reports, controls = []) {
  if (!reports.length || reports.some((r) => !r.cases.length)) return 2;
  if (
    reports.some((r) => r.cases.some((c) => c.status === 'error')) ||
    controls.some((c) => c.status === 'error')
  )
    return 2;
  if (
    reports.some((r) => r.cases.some((c) => c.status !== 'pass')) ||
    controls.some((c) => c.status !== 'detected')
  )
    return 1;
  return 0;
}
export function render(result) {
  const ids = [...new Set(result.candidates.flatMap((c) => c.cases.map((t) => t.id)))];
  const lines = [
    '# Encrypted-store conformance execution',
    '',
    `Scope: ${result.scope}; candidates: ${result.requestedCandidates.join(', ')}. Exit: ${result.exitCode ?? 'running'}.`,
    ...(result.fatal ? [`HARNESS ERROR: ${result.fatal.message}`] : []),
    '',
    `Run: ${result.started} · harness ${result.harness.commit} (${result.harness.dirty ? 'working-tree changes' : 'clean'})`,
    '',
    'Subcase passes establish only the named oracle. Remaining obligations prevent a whole-contract pass.',
    '',
    '| Scenario | ' + result.candidates.map((c) => c.id).join(' | ') + ' |',
    '| --- | ' + result.candidates.map(() => '---').join(' | ') + ' |',
  ];
  for (const id of ids)
    lines.push(
      `| ${id} | ${result.candidates.map((c) => c.cases.find((t) => t.id === id)?.status ?? 'not-run').join(' | ')} |`,
    );
  lines.push('', 'Mutation controls:');
  for (const control of result.mutations)
    lines.push(`- ${control.id}: ${control.status} (${control.assertion})`);
  lines.push(
    '',
    'Detailed assertions, fault schedules, source/adapter hashes, browser version and storage inventories are in report.json and the per-case artifacts.',
    '',
  );
  return lines.join('\n');
}
