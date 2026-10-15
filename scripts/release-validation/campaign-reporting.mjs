/** Cooperative trace and distinct child reports for reviewed serial campaign wrappers. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { reconcileVitest } from './vitest-adapter.mjs';
import { vitestDisposition } from './vitest-dispositions.mjs';

export const campaignReportFile = (name) => `case-reports/${name}.json`;
export function createCampaignReporting(directory) {
  if (!process.env.RELEASE_PROCESS_GUARD) return undefined;
  assert.equal(resolve(directory), resolve(process.env.ACCOUNT_REPORT_DIR));
  const path = process.env.RELEASE_CASE_REPORT,
    nonce = process.env.RELEASE_RUN_NONCE;
  assert(path && nonce, 'Owned campaign requires trace and nonce');
  mkdirSync(join(directory, 'case-reports'));
  const trace = { schema: 1, adapter: 'campaign-v1', nonce, phase: 'running', steps: [] };
  const save = () => writeFileSync(path, JSON.stringify(trace) + '\n');
  let active;
  save();
  return {
    begin(name, args, deadlineMs) {
      assert.equal(trace.phase, 'running', 'Campaign already finished');
      assert(!active && /^[a-z][a-z0-9-]*$/.test(name), 'Concurrent or invalid campaign step');
      assert(!trace.steps.some((s) => s.name === name), 'Repeated campaign step');
      const kind = args.includes('--test')
        ? 'node'
        : args[0] === 'node_modules/vitest/vitest.mjs'
          ? 'vitest'
          : 'exit';
      const normalize = (value) => value.replaceAll(resolve(directory), '$REPORT');
      active = { name, kind, argv: ['node', ...args].map(normalize), deadlineMs, phase: 'running' };
      trace.steps.push(active);
      save();
      const added = [];
      if (kind === 'node') {
        const reporters = args.filter((a) => a.startsWith('--test-reporter='));
        const destinations = args.filter((a) => a.startsWith('--test-reporter-destination='));
        assert(
          reporters.length > 0 &&
            (destinations.length === 0 || destinations.length === reporters.length),
        );
        if (!destinations.length)
          added.push(...reporters.map(() => '--test-reporter-destination=stdout'));
        added.push(
          '--test-reporter=./scripts/release-validation/node-reporter.mjs',
          '--test-reporter-destination=stdout',
        );
      } else if (kind === 'vitest')
        added.push('--reporter=./scripts/release-validation/vitest-reporter.mjs');
      return {
        args: kind === 'node' ? [args[0], ...added, ...args.slice(1)] : [...args, ...added],
        env: {
          RELEASE_CASE_REPORT: join(directory, campaignReportFile(name)),
          RELEASE_RUN_NONCE: nonce + ':' + name,
        },
      };
    },
    end(result) {
      assert(active && result.name === active.name, 'Campaign completion has no matching start');
      Object.assign(active, result, { phase: 'complete' });
      active = undefined;
      save();
    },
    finish() {
      assert.equal(trace.phase, 'running', 'Campaign already finished');
      assert(!active, 'Unfinished campaign step');
      trace.phase = 'complete';
      save();
    },
  };
}

/** Called after bounded inventory and all producers drain. Wrapper trace is not a test oracle. */
export function reconcileCampaignTrace(expected, trace, nonce, directory, reconcileNode) {
  assert.equal(trace.schema, 1);
  assert.equal(trace.adapter, 'campaign-v1');
  assert.equal(trace.nonce, nonce, 'Stale campaign trace');
  assert.equal(trace.phase, 'complete', 'Incomplete campaign trace');
  assert.deepEqual(
    trace.steps.map((s) => s.name),
    expected.map((s) => s.name),
    'Campaign step order differs',
  );
  const cases = [];
  for (const [index, step] of expected.entries()) {
    const actual = trace.steps[index];
    assert.deepEqual(Object.keys(actual).sort(), [
      'argv',
      'code',
      'deadlineMs',
      'kind',
      'name',
      'phase',
      'timedOut',
    ]);
    assert.equal(actual.kind, step.kind);
    assert.deepEqual(actual.argv, step.argv, 'Campaign invocation differs');
    assert.equal(actual.deadlineMs, step.deadlineMs, 'Campaign child bound differs');
    assert.equal(actual.phase, 'complete', 'Incomplete campaign child');
    assert.equal(actual.code, 0, 'Campaign child failed');
    assert.equal(actual.timedOut, false, 'Campaign child timed out');
    if (step.kind === 'exit') continue;
    const report = JSON.parse(readFileSync(join(directory, campaignReportFile(step.name)), 'utf8'));
    const childNonce = nonce + ':' + step.name;
    if (step.kind === 'node') {
      assert.equal(report.phase, 'complete', 'Missing terminal campaign Node report');
      assert(report.summary, 'Missing terminal campaign Node summary');
      reconcileNode(step.expect.cases, report, childNonce);
    } else {
      assert.equal(step.kind, 'vitest');
      reconcileVitest(step.expect, report, childNonce);
    }
    // A named framework skip remains not-applicable in the aggregate only
    // after the child adapter has verified its exact identity and skip state.
    cases.push(
      ...report.cases.map(({ id, outcome }) =>
        step.kind === 'vitest' && outcome === 'skipped'
          ? { ...vitestDisposition(id) }
          : { id, outcome },
      ),
    );
  }
  return { cases };
}
