/** Instrumentation tests only: no native cleanup campaign, historical replay, or real browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as fc from 'fast-check';
import {
  Diagnostics,
  describeError,
  requireOK,
  requireInjectedAbort,
  HarnessTimeout,
  atomicJSON,
} from '../../scripts/legacy-cleanup/diagnostics.mjs';
import { readOptions, defaultLimits } from '../../scripts/legacy-cleanup/config.mjs';
import { checkHistories } from '../../scripts/legacy-cleanup/properties.mjs';
import { supervise } from '../../scripts/legacy-cleanup/supervisor.mjs';
const never = () => new Promise(() => {});
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const temporary = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'cleanup-harness-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const diagnostic = (t, overrides = {}) => {
  const output = temporary(t),
    report = { status: 'running', passed: false, checks: [] };
  const limits = {
    ...defaultLimits,
    'call-ms': 1000,
    'case-ms': 2000,
    'campaign-ms': 5000,
    ...overrides,
  };
  const diag = new Diagnostics(output, report, limits, () => {});
  t.after(() => diag.dispose());
  return diag;
};
const events = (diag) =>
  readFileSync(join(diag.output, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);

test('historical evidence retains its exact archived bytes and unresolved status', () => {
  const dir = fileURLToPath(new URL('./regressions/captured-4c3c3ab/', import.meta.url));
  const provenance = read(join(dir, 'provenance.json'));
  for (const [name, detail] of Object.entries(provenance.files))
    assert.equal(
      createHash('sha256')
        .update(readFileSync(join(dir, name)))
        .digest('hex'),
      detail.sha256,
    );
  assert.match(provenance.status, /not replayed or proven minimal/);
});

test('browser error diagnostics retain original stack, cause, code and disposition', () => {
  const cause = new DOMException('transaction failed', 'AbortError');
  const original = Object.assign(new Error('cleanup failed', { cause }), {
    code: 'fixture-code',
    disposition: { kind: 'refused', reason: 'fixture-reason' },
  });
  const encoded = JSON.parse(JSON.stringify(describeError(original)));
  assert.equal(encoded.stack, original.stack);
  assert.equal(encoded.code, 'fixture-code');
  assert.equal(encoded.cause.stack, cause.stack);
  assert.equal(encoded.cause.name, 'AbortError');
  assert.equal(encoded.disposition.reason, 'fixture-reason');
  assert.throws(
    () => requireOK({ status: 'refused', reason: 'Error', error: encoded }),
    (error) => {
      assert.equal(error.name, 'FixtureOperationError');
      assert.equal(error.cause.stack, original.stack);
      assert.match(error.message, /cleanup failed/);
      return true;
    },
  );
  assert.equal(requireOK({ status: 'ok', value: 3 }), 3);
  assert.equal(describeError('thrown string').message, 'thrown string');
  const cycle = new Error('cyclic');
  cycle.cause = cycle;
  assert.equal(describeError(cycle).cause.name, 'CircularCause');
  assert.equal(
    describeError(new AggregateError([original], 'aggregate')).errors[0].stack,
    original.stack,
  );
});

test('first failing input and stack are durable before fast-check starts shrinking', async (t) => {
  const diag = diagnostic(t);
  let first,
    attempts = 0;
  const details = await checkHistories(
    diag,
    'synthetic',
    fc.integer({ min: 1, max: 1000 }),
    async (value) => {
      attempts++;
      if (first === undefined) first = value;
      else {
        assert.equal(read(join(diag.output, 'synthetic-first-failure-input.json')), first);
        assert.match(
          read(join(diag.output, 'synthetic-first-failure.json')).error.stack,
          /original synthetic failure/,
        );
      }
      throw new Error('original synthetic failure');
    },
    { seed: 8941, numRuns: 60 },
  );
  assert.equal(details.failed, true);
  assert.ok(attempts > 1);
  assert.equal(read(join(diag.output, 'synthetic-first-failure-input.json')), first);
  assert.ok(events(diag).some((e) => e.type === 'trial-start' && e.stage === 'shrinking'));
  assert.ok(
    events(diag).some((e) => e.type === 'campaign-end' && e.path === details.counterexamplePath),
  );
});

test('a stuck browser call records the trial and stops further generation or shrinking', async (t) => {
  const diag = diagnostic(t, { 'call-ms': 25 });
  let attempts = 0;
  await assert.rejects(
    checkHistories(
      diag,
      'stuck',
      fc.integer(),
      async () => {
        attempts++;
        await diag.watch('browser:clean', never);
      },
      { seed: 8941, numRuns: 60 },
    ),
    HarnessTimeout,
  );
  assert.equal(attempts, 1);
  const report = read(join(diag.output, 'report.json'));
  assert.equal(report.timeout.error.code, 'HARNESS_TIMEOUT');
  assert.equal(report.passed, false);
  assert.equal(report.trial.attempt, 1);
  assert.equal(read(join(diag.output, 'stuck-first-failure.json')).error.name, 'HarnessTimeout');
  assert.ok(events(diag).some((e) => e.label === 'browser:clean' && e.type === 'operation-error'));
});

test('shrinking has its own budget and retains the original failure when a shrink wedges', async (t) => {
  const diag = diagnostic(t, { 'shrink-ms': 30 });
  let attempts = 0;
  await assert.rejects(
    checkHistories(
      diag,
      'shrink',
      fc.integer({ min: 1, max: 1000 }),
      async () => {
        if (++attempts === 1) throw new Error('initial assertion');
        await never();
      },
      { seed: 8941, numRuns: 60 },
    ),
    HarnessTimeout,
  );
  assert.equal(attempts, 2);
  diag.recordFailure(diag.fatal);
  const report = read(join(diag.output, 'report.json'));
  assert.equal(report.failure.message, 'initial assertion');
  assert.equal(report.terminalError.name, 'HarnessTimeout');
  assert.equal(report.firstFailures.shrink.trial.attempt, 1);
  assert.match(
    read(join(diag.output, 'shrink-first-failure.json')).error.message,
    /initial assertion/,
  );
  assert.ok(events(diag).some((e) => e.type === 'trial-start' && e.stage === 'shrinking'));
});

test('campaign budget bounds a sequence of individually successful trials', async (t) => {
  const diag = diagnostic(t, { 'campaign-ms': 40 });
  await assert.rejects(
    checkHistories(
      diag,
      'campaign-budget',
      fc.integer(),
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
      },
      { seed: 8941, numRuns: 100 },
    ),
    HarnessTimeout,
  );
  assert.equal(diag.fatal.code, 'HARNESS_TIMEOUT');
  // Let the single in-flight trial settle; the fatal guard prevents new trials.
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(diag.report.passed, false);
});

test('teardown tries all resources, preserves partial checks, and cannot turn timeout into success', async (t) => {
  const diag = diagnostic(t, { 'teardown-ms': 25 });
  let closed = false;
  diag.report.checks.push({ id: 'earlier-case', passed: true });
  diag.report.failure = { name: 'Error', message: 'original failure' };
  await assert.rejects(
    diag.closeResources([
      ['context', never],
      [
        'server',
        async () => {
          closed = true;
        },
      ],
    ]),
    AggregateError,
  );
  const report = read(join(diag.output, 'report.json'));
  assert.equal(closed, true);
  assert.equal(report.checks[0].passed, true);
  assert.equal(report.failure.message, 'original failure');
  assert.equal(report.teardownErrors[0].name, 'HarnessTimeout');
  assert.equal(report.passed, false);
});

test('deadline options reject unsafe timers and preserve existing seed/replay arguments', () => {
  const result = readOptions(['--seed', '-3', '--call-ms', '25', '--replay', 'input.json'], '/tmp');
  assert.equal(result.seed, -3);
  assert.equal(result.limits['call-ms'], 25);
  assert.equal(result.options.replay, 'input.json');
  for (const value of ['0', '-1', 'NaN', '1.5', '2147483648'])
    assert.throws(() => readOptions(['--call-ms', value], '/tmp'));
  assert.throws(() => readOptions(['--runs', '1', '--runs', '2'], '/tmp'));
});

const worker = fileURLToPath(new URL('./supervisor-fixture.mjs', import.meta.url));
const superviseFixture = (output, mode, limits = {}) =>
  supervise({
    worker,
    args: [mode, output],
    output,
    stdio: 'ignore',
    limits: { ...defaultLimits, 'run-ms': 1500, 'teardown-ms': 50, ...limits },
  });

test(
  'external watchdog terminates a wedged worker and its registered disposable process',
  { timeout: 6000 },
  async (t) => {
    const output = temporary(t);
    assert.equal(await superviseFixture(output, 'wedged'), 1);
    const report = read(join(output, 'report.json'));
    assert.equal(report.passed, false);
    assert.equal(report.checks[0].passed, true);
    assert.match(report.supervisor.reason, /run exceeded/);
    assert.ok(report.browserPid > 1);
    // Delivery of SIGKILL and reaping are asynchronous. Probe only this fixture's recorded PID.
    let alive = true;
    for (let i = 0; i < 100 && alive; i++) {
      try {
        process.kill(report.browserPid, 0);
        await new Promise((resolve) => setTimeout(resolve, 10));
      } catch (error) {
        assert.equal(error.code, 'ESRCH');
        alive = false;
      }
    }
    assert.equal(alive, false, 'registered process survived supervisor termination');
  },
);

test(
  'completed assertions with a leaked handle fail the exit deadline',
  { timeout: 6000 },
  async (t) => {
    const output = temporary(t);
    assert.equal(await superviseFixture(output, 'leaked-handle'), 1);
    const report = read(join(output, 'report.json'));
    assert.equal(report.passed, false);
    assert.match(report.supervisor.reason, /did not exit/);
  },
);

test(
  'only a successful report AND clean worker exit pass supervision',
  { timeout: 6000 },
  async (t) => {
    const success = temporary(t),
      failed = temporary(t);
    assert.equal(await superviseFixture(success, 'success'), 0);
    assert.equal(read(join(success, 'report.json')).passed, true);
    assert.equal(await superviseFixture(failed, 'nonzero'), 1);
    assert.equal(read(join(failed, 'report.json')).passed, false);
    const expectedFailure = temporary(t);
    assert.equal(await superviseFixture(expectedFailure, 'reported-failure'), 1);
    assert.equal(read(join(expectedFailure, 'report.json')).status, 'finished');
  },
);

test(
  'worker import failure is bounded and writes a failed report',
  { timeout: 6000 },
  async (t) => {
    const output = temporary(t);
    atomicJSON(join(output, 'report.json'), { passed: false, status: 'starting' });
    assert.equal(
      await supervise({
        worker: join(output, 'missing.mjs'),
        args: [],
        output,
        limits: { ...defaultLimits, 'run-ms': 1500 },
        stdio: 'ignore',
      }),
      1,
    );
    assert.equal(read(join(output, 'report.json')).status, 'supervisor-failed');
  },
);

test(
  'a worker that exits successfully but leaves its browser is still rejected',
  { timeout: 6000 },
  async (t) => {
    const output = temporary(t);
    assert.equal(await superviseFixture(output, 'orphaned-browser'), 1);
    const report = read(join(output, 'report.json'));
    assert.equal(report.passed, false);
    assert.match(report.supervisor.reason, /left registered browser/);
  },
);

test('an unrelated refusal cannot masquerade as an injected progress abort', () => {
  const aborted = { status: 'refused', reason: 'storage-failed' };
  requireInjectedAbort(aborted, 3, 3);
  assert.throws(() => requireInjectedAbort(aborted, 3, null), /injected-abort-not-observed/);
  assert.throws(() => requireInjectedAbort(aborted, 3, 2), /injected-abort-not-observed/);
  assert.throws(
    () =>
      requireInjectedAbort(
        { status: 'refused', reason: 'Error', error: { message: 'Field too long' } },
        3,
        null,
      ),
    (error) => error.cause.message === 'Field too long',
  );
});
