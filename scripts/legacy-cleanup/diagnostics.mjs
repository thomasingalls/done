import { appendFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describeError } from '../../test/legacy-import/error.mjs';
export { describeError };
export class HarnessTimeout extends Error {
  constructor(label, ms) {
    super(`${label} exceeded ${ms} ms`);
    this.name = 'HarnessTimeout';
    this.code = 'HARNESS_TIMEOUT';
  }
}
export const atomicJSON = (path, value) => {
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  renameSync(temp, path);
};
export const fingerprint = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const within = async (label, ms, operation) => {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new HarnessTimeout(label, ms)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
/** No unlock arguments or recovery packets are logged. Histories are synthetic source inputs. */
export class Diagnostics {
  constructor(output, report, limits, print = (text) => process.stdout.write(text)) {
    this.output = output;
    this.report = report;
    this.limits = limits;
    this.print = print;
    this.active = new Map();
    this.next = 0;
    this.fatal = null;
    this.trial = null;
    this.heartbeat = setInterval(
      () => this.event('heartbeat', { active: [...this.active.values()], trial: this.trial }, true),
      15000,
    );
    this.checkpoint();
  }
  checkpoint() {
    this.report.active = [...this.active.values()];
    this.report.trial = this.trial;
    atomicJSON(join(this.output, 'report.json'), this.report);
  }
  event(type, data = {}, visible = false) {
    const row = { time: new Date().toISOString(), type, ...data };
    appendFileSync(join(this.output, 'events.jsonl'), JSON.stringify(row) + '\n');
    if (visible) this.print(`${type.toUpperCase()} ${JSON.stringify(data)}\n`);
  }
  guard() {
    if (this.fatal) throw this.fatal;
  }
  async watch(label, operation, ms = this.limits['call-ms'], cleanup = false) {
    if (!cleanup) this.guard();
    const id = ++this.next,
      started = Date.now();
    this.active.set(id, { label, started });
    this.report.operation = label;
    this.event('operation-start', { label });
    this.checkpoint();
    try {
      return await within(label, ms, operation);
    } catch (error) {
      this.event('operation-error', { label, error: describeError(error) }, true);
      if (error instanceof HarnessTimeout) {
        this.fatal ??= error;
        this.report.passed = false;
        this.report.timeout = { label, ms, error: describeError(error), trial: this.trial };
      }
      this.checkpoint();
      throw error;
    } finally {
      this.active.delete(id);
      this.event('operation-end', { label, elapsedMs: Date.now() - started });
      this.checkpoint();
    }
  }
  /** Preserve before control returns to fast-check, which may start shrinking immediately. */
  failure(campaign, input, error) {
    const prefix = join(this.output, `${campaign}-first-failure`);
    const detail = {
      campaign,
      trial: this.trial,
      inputHash: fingerprint(input),
      error: describeError(error),
      lastBrowserOperation: this.report.lastBrowserOperation ?? null,
    };
    if (!existsSync(prefix + '.json')) {
      atomicJSON(prefix + '-input.json', input);
      atomicJSON(prefix + '.json', detail);
    }
    this.report.firstFailures ??= {};
    this.report.firstFailures[campaign] ??= detail;
    this.event('trial-failed', detail, true);
    this.checkpoint();
  }
  recordFailure(error) {
    this.report.failure ??=
      this.report.firstFailures?.[this.report.phase]?.error ?? describeError(error);
    this.report.terminalError = describeError(error);
    this.report.passed = false;
    this.checkpoint();
  }
  async closeResources(resources) {
    const errors = [];
    this.report.status = 'teardown';
    this.checkpoint();
    for (const [label, close] of resources) {
      try {
        await this.watch(`close:${label}`, close, this.limits['teardown-ms'], true);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      this.report.teardownErrors ??= [];
      this.report.teardownErrors.push(...errors.map((e) => describeError(e)));
      this.report.passed = false;
      this.checkpoint();
      throw new AggregateError(errors, 'Harness teardown failed');
    }
  }
  dispose() {
    clearInterval(this.heartbeat);
  }
}
export const requireOK = (r) => {
  if (r.status !== 'ok') {
    const e = new Error(
      `operation-accepted: ${r.reason ?? 'refused'}${r.error?.message ? ': ' + r.error.message : ''}`,
      { cause: r.error },
    );
    e.name = 'FixtureOperationError';
    throw e;
  }
  return r.value;
};

export const requireInjectedAbort = (result, expectedBoundary, observedBoundary) => {
  if (
    result.status !== 'refused' ||
    result.reason !== 'storage-failed' ||
    observedBoundary !== expectedBoundary
  ) {
    throw new Error(
      `injected-abort-not-observed: expected ${expectedBoundary}, observed ${observedBoundary}, result ${result.reason ?? result.status}`,
      { cause: result.error },
    );
  }
};
