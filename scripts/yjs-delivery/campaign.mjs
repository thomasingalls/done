/** Reproducible original-wire and pending-handoff campaign against a frozen Yjs runtime. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as fc from 'fast-check';
import { makeSource } from '../core-reproductions/source.mjs';
import { exercise, concurrentSource, check, scalarEdits } from '../../test/yjs-delivery/model.mjs';
const args = process.argv.slice(2),
  option = (key, fallback) => (args.includes(key) ? args[args.indexOf(key) + 1] : fallback);
for (let i = 0; i < args.length; i++)
  if (!['--output', '--runs', '--seed', '--mutant', '--replay'].includes(args[i]) || !args[++i])
    throw Error('Invalid arguments');
const output = resolve(option('--output', 'test-results/yjs-delivery/campaign-' + Date.now())),
  runs = Number(option('--runs', '10000')),
  seed = Number(option('--seed', '8941'));
assert(!existsSync(output));
assert(Number.isSafeInteger(runs) && runs > 0);
mkdirSync(output, { recursive: true });
const mutant = option('--mutant', null);
assert(!mutant || mutant === 'missed-wakeup');
const paths = [
  'scripts/yjs-delivery/campaign.mjs',
  'scripts/core-reproductions/source.mjs',
  'test/yjs-delivery/model.mjs',
  'test/yjsDelivery.test.ts',
  'test/core-reproductions/original-order.json',
  'vendor-patches/yjs@13.6.31.patch',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'node_modules/yjs/package.json',
  'node_modules/yjs/src/utils/encoding.js',
  'node_modules/yjs/dist/yjs.mjs',
  'node_modules/yjs/dist/yjs.cjs',
];
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const files = Object.fromEntries(paths.map((p) => [p, hash(p)]));
const runtime = join(output, 'yjs.mjs');
cpSync('node_modules/yjs/dist/yjs.mjs', runtime);
if (mutant) {
  const source = readFileSync(runtime, 'utf8');
  const from =
    '          // Retain this wake-up even when the available reader starts after the dependency.\n          updateMissingSv(/** @type {number} */ (missing), getState(store, missing));\n          if (structRefs.refs.length === structRefs.i) {';
  const to =
    '          if (structRefs.refs.length === structRefs.i) {\n            updateMissingSv(/** @type {number} */ (missing), getState(store, missing));';
  assert.equal(source.split(from).length, 2);
  writeFileSync(runtime, source.replace(from, to));
}
const Y = await import(pathToFileURL(runtime));
const report = {
  schema: 1,
  scope: 'yjs-delivery',
  started: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  node: process.version,
  files,
  runtimeHash: hash(runtime),
  mutant,
  runs,
  seed,
  arms: [],
};
const save = () =>
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const arbitrary = fc.record({
  edits: fc.array(
    fc.record({
      lane: fc.nat(2),
      actor: fc.nat(2),
      at: fc.nat(40),
      remove: fc.nat(8),
      text: fc
        .array(fc.constantFrom('a', 'b', 'c', ' ', '\n', 'é', '😀'), { maxLength: 5 })
        .map((v) => v.join('')),
    }),
    { minLength: 1, maxLength: 22 },
  ),
  keys: fc.array(fc.nat(1000000), { minLength: 70, maxLength: 70 }),
  split: fc.nat(80),
  early: fc.nat(80),
  hops: fc.nat(3),
  duplicate: fc.boolean(),
});
const evaluate = (history, arm) =>
  exercise(
    Y,
    arm === 'concurrent-handoff'
      ? concurrentSource(Y, history)
      : makeSource(scalarEdits(history.edits)),
    history,
    arm === 'originals' ? arm : 'handoff',
  );
function* permutations(ids) {
  if (!ids.length) {
    yield [];
    return;
  }
  for (let i = 0; i < ids.length; i++)
    for (const tail of permutations(ids.filter((_, j) => i !== j))) yield [ids[i], ...tail];
}
try {
  const saved = JSON.parse(readFileSync('test/core-reproductions/original-order.json')).outcome;
  let failures = 0,
    orders = 0;
  for (const order of permutations(saved.order)) {
    const doc = new Y.Doc();
    try {
      for (const id of order) Y.applyUpdate(doc, Uint8Array.from(saved.source.updates[id]));
      check(Y, doc, saved.source);
    } catch (error) {
      if (error.name !== 'InvariantFailure') throw error;
      failures++;
    } finally {
      doc.destroy();
      orders++;
    }
  }
  report.exhaustive = { orders, failures };
  if (mutant) {
    assert.equal(failures, 78);
    report.status = 'detected';
  } else {
    assert.equal(failures, 0);
    const replayPath = option('--replay', null);
    if (replayPath) {
      const saved = JSON.parse(readFileSync(replayPath, 'utf8'));
      report.replay = { ...saved, result: evaluate(saved.history, saved.arm) };
    } else
      for (const arm of ['originals', 'handoff', 'concurrent-handoff']) {
        let histories = 0,
          pendingDonors = 0,
          pendingDeletionDonors = 0;
        const details = fc.check(
          fc.property(arbitrary, (history) => {
            const result = evaluate(history, arm);
            histories++;
            pendingDonors += Number(result.pendingDonor);
            pendingDeletionDonors += Number(result.pendingDeletionDonor);
            if (histories % 5000 === 0) console.log(arm, histories);
            return true;
          }),
          { seed, numRuns: runs },
        );
        const row = {
          arm,
          histories,
          pendingDonors,
          pendingDeletionDonors,
          failed: details.failed,
          seed: details.seed,
          path: details.counterexamplePath,
          shrinks: details.numShrinks,
        };
        report.arms.push(row);
        if (details.failed) {
          const history = details.counterexample[0];
          writeFileSync(
            join(output, 'counterexample.json'),
            JSON.stringify({ arm, history, ...row }, null, 2) + '\n',
          );
          throw details.errorInstance;
        }
        save();
      }
    report.status = 'passed';
  }
  for (const path of paths) assert.equal(hash(path), files[path]);
  assert.equal(hash(runtime), report.runtimeHash);
} catch (error) {
  report.status = 'failed';
  report.error = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    actual: error.actual,
    expected: error.expected,
  };
  process.exitCode = 1;
} finally {
  report.finished = new Date().toISOString();
  save();
  console.log(report.status, report.exhaustive);
}
