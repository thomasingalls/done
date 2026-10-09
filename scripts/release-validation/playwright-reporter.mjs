import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { relative } from 'node:path';
const errorText = (e) => [e.message, e.stack].filter(Boolean).join('\n') || String(e);
function attachment(item) {
  let bytes = item.body;
  if (!bytes) {
    const part = relative(
      realpathSync(process.env.RELEASE_PLAYWRIGHT_ARTIFACTS),
      realpathSync(item.path),
    );
    assert(
      part && !part.startsWith('..') && !part.startsWith('/'),
      'Attachment escaped owned output',
    );
    assert(statSync(item.path).size <= 262144, 'Playwright attachment byte bound exceeded');
    bytes = readFileSync(item.path);
  }
  assert(bytes.length <= 262144, 'Playwright attachment byte bound exceeded');
  return {
    name: item.name,
    contentType: item.contentType,
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    base64: bytes.toString('base64'),
  };
}
function id(test) {
  const names = [test.title];
  for (let p = test.parent; p.type === 'describe'; p = p.parent) names.unshift(p.title);
  return (
    relative(process.cwd(), test.location.file) +
    '::' +
    JSON.stringify([test.parent.project().name, ...names])
  );
}
export default class OwnedPlaywrightReporter {
  report = {
    schema: 1,
    adapter: 'playwright-v1',
    nonce: process.env.RELEASE_RUN_NONCE,
    phase: 'running',
    status: 'running',
    collected: [],
    cases: [],
    errors: [],
  };
  save() {
    writeFileSync(process.env.RELEASE_CASE_REPORT, JSON.stringify(this.report) + '\n');
  }
  onBegin(config, suite) {
    this.report.configuration = {
      workers: config.workers,
      fullyParallel: config.fullyParallel,
      projects: config.projects.map((p) => ({
        name: p.name,
        retries: p.retries,
        repeatEach: p.repeatEach,
      })),
    };
    this.report.collected = suite.allTests().map(id);
    this.save();
  }
  onTestBegin(test) {
    console.log('Starting ' + id(test));
  }
  onStdOut(chunk) {
    process.stdout.write(chunk);
  }
  onStdErr(chunk) {
    process.stderr.write(chunk);
  }
  onError(error) {
    this.report.errors.push(errorText(error));
    console.error(errorText(error));
    this.save();
  }
  onTestEnd(test, result) {
    this.report.cases.push({
      id: id(test),
      status: result.status,
      expectedStatus: test.expectedStatus,
      retry: result.retry,
      repeatEachIndex: test.repeatEachIndex,
      durationMs: result.duration,
      errors: result.errors.map(errorText),
      attachments: result.attachments.map(attachment),
      annotations: result.annotations.map(({ type, description }) => ({
        type,
        ...(description === undefined ? {} : { description }),
      })),
    });
    console.log(result.status + ' ' + id(test) + ' ' + result.duration + 'ms');
    for (const error of result.errors) console.error(errorText(error));
    this.save();
  }
  onEnd(result) {
    this.report.phase = 'complete';
    this.report.status = result.status;
    this.save();
  }
}
