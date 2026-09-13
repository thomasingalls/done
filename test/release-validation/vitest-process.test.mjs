import test from 'node:test';
import assert from 'node:assert/strict';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { createStageRunner } from '../../scripts/release-validation/stage.mjs';
import { vitestStage } from '../../scripts/release-validation/vitest-adapter.mjs';
import { digest, filePins } from '../../scripts/release-validation/identity.mjs';

const ordinary = `import {it, describe, expect} from 'vitest';
describe('suite', () => { it.each(['one', 'two'])('case %s', () => {expect(1).toBe(1);}); });`;
function fixture(t, text = ordinary) {
  const root = mkdtempSync(join(tmpdir(), 'done-vitest-owner-'));
  mkdirSync(join(root, 'scripts/release-validation'), { recursive: true });
  mkdirSync(join(root, 'test'));
  symlinkSync(resolve('node_modules'), join(root, 'node_modules'));
  const files = [
    'test/subject.test.ts',
    'vite.config.ts',
    'package.json',
    'scripts/release-validation/process-guard.mjs',
    'scripts/release-validation/vitest-reporter.mjs',
  ];
  for (const name of ['process-guard.mjs', 'vitest-reporter.mjs'])
    copyFileSync(
      'scripts/release-validation/' + name,
      join(root, 'scripts/release-validation', name),
    );
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  writeFileSync(
    join(root, 'vite.config.ts'),
    `export default {test:{environment:'node',include:['test/**/*.test.ts']}};`,
  );
  const write = (value) => writeFileSync(join(root, files[0]), value);
  write(text);
  t.after(() => {
    try {
      if (process.env.VITEST_CONTROL_OUTPUT && existsSync(join(root, 'receipts'))) {
        const dest = join(process.env.VITEST_CONTROL_OUTPUT, basename(root));
        mkdirSync(dest, { recursive: true });
        for (const key of readdirSync(join(root, 'receipts'))) {
          mkdirSync(join(dest, key));
          for (const file of ['receipt.json', 'output.log', 'ownership.jsonl', 'cases.json']) {
            const from = join(root, 'receipts', key, file);
            if (existsSync(from)) copyFileSync(from, join(dest, key, file));
          }
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  const run = createStageRunner({
    root,
    output: join(root, 'receipts'),
    fingerprint: () => ({
      revision: 'synthetic-control',
      sourceDigest: digest(filePins(root, files)),
      dependencyDigest: 'installed-vitest-control-only',
      runtime: { node: process.version },
    }),
  });
  const stage = { ...vitestStage(root, files[0]), deadlineMs: 15000, graceMs: 1000 };
  const artifact = (receipt, path) =>
    readFileSync(join(root, 'receipts', receipt.key, path), 'utf8');
  return { root, write, run, stage, artifact };
}
const passed = (r) => {
  assert.equal(r.status, 'passed', r.result.reason);
  assert.equal(r.result.groupDrained, true);
};
const failed = (r) => {
  assert.equal(r.status, 'failed');
  assert.equal(r.result.groupDrained, true);
};

test('actual Vitest table cases pass, missing registrations and real skips cannot borrow that receipt', async (t) => {
  const f = fixture(t);
  passed(await f.run(f.stage));
  f.write(ordinary.replace("['one', 'two']", "['one']"));
  const omitted = await f.run(f.stage);
  failed(omitted);
  assert.match(omitted.result.reason, /census/);
  // Skip a real registered case through Vitest's runtime context.
  f.write(`import {it,describe} from 'vitest';describe('suite',()=>{
    it('case one',ctx=>ctx.skip());it('case two',()=>{});
  });`);
  const skipped = await f.run(f.stage);
  failed(skipped);
  assert.match(f.artifact(skipped, 'cases.json'), /skipped/);
  f.write("import 'vitest';");
  failed(await f.run(f.stage));
});

test('actual property counterexample and inner deadline retain seed, failure and duration evidence', async (t) => {
  const text = `import {it} from 'vitest';import fc from 'fast-check';
    it('property', async()=>{await fc.assert(fc.asyncProperty(fc.nat(10), async n=>n<0),{seed:130918,numRuns:120});},60000);`;
  const f = fixture(t, text);
  const counterexample = await f.run(f.stage);
  failed(counterexample);
  assert.match(f.artifact(counterexample, 'cases.json'), /seed: 130918/);
  assert.match(f.artifact(counterexample, 'cases.json'), /Counterexample/);
  f.write(
    `import {it} from 'vitest';it('property',async()=>{await new Promise(r=>setTimeout(r,250));},20);`,
  );
  const timeout = await f.run(f.stage);
  failed(timeout);
  assert.notEqual(timeout.result.reason, 'timeout');
  assert.match(f.artifact(timeout, 'cases.json'), /timed out in 20ms/);
});

test('outer deadline drains a stuck Vitest fork and its child while retaining partial progress', async (t) => {
  const f = fixture(
    t,
    `import {it} from 'vitest';import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';
    it('completed',()=>{});
    it('stuck',async()=>{const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)']);writeFileSync('child.pid',String(child.pid));await new Promise(()=>{});},60000);`,
  );
  const result = await f.run({ ...f.stage, deadlineMs: 6000 });
  failed(result);
  assert.equal(result.result.reason, 'timeout');
  assert.match(f.artifact(result, 'cases.json'), /completed/);
  assert.equal(JSON.parse(f.artifact(result, 'cases.json')).reason, 'running');
  const pid = Number(readFileSync(join(f.root, 'child.pid'), 'utf8'));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('cancellation and a caught detached-child refusal cannot become successful Vitest results', async (t) => {
  const f = fixture(
    t,
    `import {it} from 'vitest';import {writeFileSync} from 'node:fs';
    it('stuck',async()=>{writeFileSync('ready','yes');await new Promise(()=>{});},60000);`,
  );
  const controller = new AbortController();
  const poll = setInterval(() => {
    if (existsSync(join(f.root, 'ready'))) controller.abort();
  }, 20);
  let result;
  try {
    result = await f.run(f.stage, { signal: controller.signal });
  } finally {
    clearInterval(poll);
  }
  failed(result);
  assert.equal(result.result.reason, 'cancelled');
  f.write(`import {it} from 'vitest';import {spawn} from 'node:child_process';
    it('stuck',()=>{try{spawn(process.execPath,['-e','process.exit(0)'],{detached:true});}catch{}});`);
  const violation = await f.run(f.stage);
  failed(violation);
  assert.match(violation.result.reason, /ownership violation/);
});
