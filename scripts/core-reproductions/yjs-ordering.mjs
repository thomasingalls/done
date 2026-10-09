/** Reproduction campaign. Expected protocol violations are recorded, never called conformance passes. */
import * as Y from 'yjs';
import * as fc from 'fast-check';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  corpusEdits,
  corpusOrder,
  makeSource,
  state,
  replay,
  complete,
  senderFIFO,
  orderedByKeys,
} from './source.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
for (let i = 0; i < argv.length; i++) {
  if (!['--output', '--runs', '--seed', '--replay'].includes(argv[i]) || !argv[++i])
    throw Error('Invalid arguments');
}
const seed = Number(option('--seed', '8941')),
  runs = Number(option('--runs', '50000'));
assert(Number.isSafeInteger(seed) && Number.isSafeInteger(runs) && runs > 0);
const output = resolve(option('--output', 'test-results/core-reproductions/yjs-' + Date.now()));
assert(!existsSync(output), 'Refusing existing output');
mkdirSync(output, { recursive: true });
const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const paths = [
  'scripts/core-reproductions/source.mjs',
  'scripts/core-reproductions/yjs-ordering.mjs',
  'pnpm-lock.yaml',
  'node_modules/yjs/dist/yjs.mjs',
];
const files = Object.fromEntries(paths.map((p) => [p, hash(p)]));
const report = {
  schema: 1,
  scope: 'bare-pinned-yjs-ordering-reproduction',
  started: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  node: process.version,
  yjs: JSON.parse(readFileSync('node_modules/yjs/package.json')).version,
  fastCheck: fc.__version,
  seed,
  requestedPerArm: runs,
  files,
  corpus: null,
  arms: {},
  limits: [
    'Three fully synchronized source authors, three plaintext roots, original per-transaction updates. Independent sequential string oracle; no independent CRDT encoder.',
    'Arbitrary delivery permutations can violate per-sender FIFO; FIFO and one delayed complete join snapshot are counted separately.',
    'Observed frequencies describe this generator and fixed seed only, not production probability or a reliability bound.',
    'Pure Node Yjs; no storage, editor, browser transport, concurrent source editing or production migration claim.',
  ],
};
const save = () =>
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const corpus = makeSource(corpusEdits);
const original = new Y.Doc({ gc: false }),
  clone = new Y.Doc({ gc: false });
try {
  for (const i of corpusOrder.slice(0, 3))
    Y.applyUpdate(original, Uint8Array.from(corpus.updates[i]));
  Y.applyUpdate(clone, Y.encodeStateAsUpdate(original));
  const before = { original: state(original, corpus.names), clone: state(clone, corpus.names) };
  for (const i of corpusOrder.slice(3)) {
    Y.applyUpdate(original, Uint8Array.from(corpus.updates[i]));
    Y.applyUpdate(clone, Uint8Array.from(corpus.updates[i]));
  }
  const after = { original: state(original, corpus.names), clone: state(clone, corpus.names) };
  assert(complete(after.original, corpus));
  assert(!complete(after.clone, corpus));
  assert.deepEqual(before.original.text, before.clone.text);
  report.corpus = { edits: corpusEdits, order: corpusOrder, source: corpus, before, after };
} finally {
  original.destroy();
  clone.destroy();
}

const edit = fc.record({
  lane: fc.nat(2),
  actor: fc.nat(2),
  at: fc.nat(40),
  remove: fc.nat(8),
  text: fc
    .array(fc.constantFrom('a', 'b', 'c', ' ', '\n', 'é'), { maxLength: 5 })
    .map((v) => v.join('')),
});
const arbitrary = fc.record({
  edits: fc.array(edit, { minLength: 4, maxLength: 22 }),
  keys: fc.array(fc.nat(1000000), { minLength: 30, maxLength: 30 }),
  split: fc.nat(40),
  early: fc.nat(40),
});

function evaluate(history, arm) {
  const source = makeSource(history.edits),
    ids = source.updates.map((_, i) => i);
  assert(complete(replay(source, ids), source), 'In-order source control must pass');
  let order, actual;
  if (arm === 'permutation') {
    order = orderedByKeys(ids.length, history.keys);
    actual = replay(source, order);
  } else if (arm === 'sender-fifo') {
    const remaining = [0, 1, 2].map((actor) => ids.filter((id) => source.authors[id] === actor));
    order = [];
    for (let i = 0; order.length < ids.length; i++) {
      const actor = history.keys[i % history.keys.length] % 3;
      const lane = remaining[actor].length ? remaining[actor] : remaining.find((v) => v.length);
      order.push(lane.shift());
    }
    assert(senderFIFO(source, order));
    actual = replay(source, order);
  } else {
    const split = history.split % (ids.length + 1),
      tail = ids.slice(split);
    const early = history.early % (tail.length + 1);
    const donor = new Y.Doc({ gc: false }),
      receiver = new Y.Doc({ gc: false });
    try {
      for (const id of ids.slice(0, split))
        Y.applyUpdate(donor, Uint8Array.from(source.updates[id]));
      assert(!donor.store.pendingStructs && !donor.store.pendingDs, 'Join donor is complete');
      for (const id of tail.slice(0, early))
        Y.applyUpdate(receiver, Uint8Array.from(source.updates[id]));
      Y.applyUpdate(receiver, Y.encodeStateAsUpdate(donor));
      for (const id of tail.slice(early))
        Y.applyUpdate(receiver, Uint8Array.from(source.updates[id]));
      actual = state(receiver, source.names);
      order = { prefixInSnapshot: split, earlyTail: early, originalTail: tail };
    } finally {
      donor.destroy();
      receiver.destroy();
    }
  }
  return {
    failed: !complete(actual, source),
    source,
    order,
    actual,
    senderFIFO: Array.isArray(order) ? senderFIFO(source, order) : null,
  };
}

try {
  const replayPath = option('--replay', null);
  if (replayPath) {
    const saved = JSON.parse(readFileSync(replayPath, 'utf8'));
    const result = evaluate(saved.history, saved.arm);
    assert(result.failed, 'Saved counterexample must reproduce');
    assert.deepEqual(result, saved.outcome, 'Replay must repeat exact wire and semantic outcome');
    report.replay = { path: replayPath, reproduced: true, ...saved };
  } else {
    for (const arm of ['permutation', 'sender-fifo', 'complete-join']) {
      const counts = {
        histories: 0,
        violations: 0,
        pendingStructs: 0,
        pendingDs: 0,
        textMismatch: 0,
        fifoViolations: 0,
        first: null,
        minimized: null,
      };
      report.arms[arm] = counts;
      let firstHistory;
      fc.assert(
        fc.property(arbitrary, (history) => {
          const outcome = evaluate(history, arm);
          counts.histories++;
          if (outcome.failed) {
            counts.violations++;
            counts.pendingStructs += Number(outcome.actual.pendingStructs);
            counts.pendingDs += Number(outcome.actual.pendingDs);
            counts.textMismatch += Number(
              JSON.stringify(outcome.actual.text) !== JSON.stringify(outcome.source.expected),
            );
            counts.fifoViolations += Number(outcome.senderFIFO === true);
            if (!firstHistory) {
              firstHistory = history;
              counts.first = { arm, history, outcome, generatedIndex: counts.histories - 1 };
              writeFileSync(
                resolve(output, arm + '-first.json'),
                JSON.stringify(counts.first, null, 2) + '\n',
              );
            }
          }
          if (counts.histories % 5000 === 0) {
            save();
            console.log(arm, counts.histories, 'violations', counts.violations);
          }
        }),
        { seed, numRuns: runs },
      );
      if (firstHistory) {
        const shrunk = fc.check(
          fc.property(arbitrary, (history) => !evaluate(history, arm).failed),
          { seed, numRuns: runs },
        );
        assert(shrunk.failed && shrunk.counterexample);
        const history = shrunk.counterexample[0],
          outcome = evaluate(history, arm);
        assert(outcome.failed);
        const item = {
          arm,
          history,
          outcome,
          seed: shrunk.seed,
          path: shrunk.counterexamplePath,
          shrinks: shrunk.numShrinks,
        };
        counts.minimized = item;
        writeFileSync(
          resolve(output, arm + '-minimized.json'),
          JSON.stringify(item, null, 2) + '\n',
        );
      }
      save();
    }
  }
  for (const p of paths) assert.equal(hash(p), files[p], 'Campaign input changed: ' + p);
  report.status = 'completed-reproduction';
} catch (error) {
  report.status = 'harness-error';
  report.error = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  report.finished = new Date().toISOString();
  save();
}
