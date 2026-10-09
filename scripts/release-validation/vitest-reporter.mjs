import { writeFileSync } from 'node:fs';
import { relative } from 'node:path';

// Timeout errors can carry STACK_TRACE_ERROR in stack with the real diagnosis only
// in message. Keeping just stack loses the useful failure (and can lose a seed).
const errorText = (e) => [e.message, e.stack].filter(Boolean).join('\n') || String(e);
const row = (test) => {
  const names = [test.name];
  for (let p = test.parent; p.type === 'suite'; p = p.parent) names.unshift(p.name);
  const result = test.result(),
    diagnostic = test.diagnostic();
  return {
    id: relative(process.cwd(), test.module.moduleId) + '::' + JSON.stringify(names),
    outcome: result.state === 'passed' ? 'pass' : result.state,
    durationMs: diagnostic?.duration ?? null,
    retryCount: diagnostic?.retryCount ?? null,
    repeatCount: diagnostic?.repeatCount ?? null,
    expectedFailure: test.options.fails === true,
    mode: test.options.mode,
    errors: (result.errors ?? []).map(errorText),
  };
};

/** Partial reports are retained on deadline/cancellation; only onTestRunEnd can pass.
 * Uses the installed Vitest public reported-task API. Its bytes join runtime identity.
 */
export default class OwnedVitestReporter {
  report = {
    schema: 1,
    adapter: 'vitest-v1',
    nonce: process.env.RELEASE_RUN_NONCE,
    reason: 'running',
    modules: [],
    cases: [],
    errors: [],
  };
  save() {
    writeFileSync(process.env.RELEASE_CASE_REPORT, JSON.stringify(this.report) + '\n');
  }
  onTestRunStart() {
    this.save();
  }
  onUserConsoleLog(log) {
    (log.type === 'stderr' ? process.stderr : process.stdout).write(log.content);
  }
  onTestCaseReady(test) {
    console.log('Starting ' + test.fullName);
  }
  onTestCaseResult(test) {
    const result = row(test);
    this.report.cases.push(result);
    console.log(result.outcome + ' ' + test.fullName + ' ' + result.durationMs + 'ms');
    for (const error of result.errors) console.error(error);
    this.save();
  }
  onTestRunEnd(modules, errors, reason) {
    this.report.reason = reason;
    // Re-enumerate the collected tree, retaining skipped/pending cases and suite failures.
    // The independent static census is reconciled by the parent, never by this reporter.
    this.report.cases = modules.flatMap((m) => [...m.children.allTests()].map(row));
    this.report.modules = modules.map((m) => ({
      file: relative(process.cwd(), m.moduleId),
      state: m.state(),
      diagnostic: m.diagnostic(),
    }));
    this.report.errors = [
      ...errors,
      ...modules.flatMap((m) => [
        ...m.errors(),
        ...[...m.children.allSuites()].flatMap((s) => s.errors()),
      ]),
    ].map(errorText);
    for (const error of this.report.errors) console.error(error);
    this.save();
  }
}
