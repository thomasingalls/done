/** Exhaust the seven-record minimized corpus; probe recovery without altering any production code. */
import * as Y from 'yjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { makeSource, state, replay, complete, senderFIFO } from './source.mjs';

const output = resolve(process.argv[2] ?? 'test-results/core-reproductions/corpus-' + Date.now());
assert(!existsSync(output), 'Refusing existing output');
mkdirSync(output, { recursive: true });
const fixture = JSON.parse(readFileSync('test/core-reproductions/original-order.json', 'utf8'));
const edits = fixture.history.edits.filter((edit) => edit.text || edit.remove);
const source = makeSource(edits),
  order = fixture.outcome.order;
assert.deepEqual(
  source,
  fixture.outcome.source,
  'Pruning no-op input must preserve every original wire record',
);
assert.equal(edits.length, 4);
assert.equal(source.updates.length, 7);
assert.deepEqual(replay(source, order), fixture.outcome.actual);
const report = {
  schema: 1,
  scope: 'seven-record-original-framing-corpus',
  started: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  edits,
  source,
  failingOrder: order,
  before: replay(source, order),
  permutations: 0,
  violations: 0,
  senderFIFO: 0,
  senderFIFOViolations: 0,
  examples: [],
  recoveryProbes: {},
  files: {},
};
const paths = [
  'scripts/core-reproductions/source.mjs',
  'scripts/core-reproductions/yjs-corpus.mjs',
  'test/core-reproductions/original-order.json',
  'pnpm-lock.yaml',
  'node_modules/yjs/dist/yjs.mjs',
];
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
report.files = Object.fromEntries(paths.map((path) => [path, hash(path)]));
function* permutations(prefix, rest) {
  if (!rest.length) {
    yield prefix;
    return;
  }
  for (const [i, value] of rest.entries())
    yield* permutations(
      [...prefix, value],
      rest.filter((_, j) => j !== i),
    );
}
const ids = source.updates.map((_, i) => i);
for (const candidate of permutations([], ids)) {
  const actual = replay(source, candidate),
    fifo = senderFIFO(source, candidate),
    failed = !complete(actual, source);
  report.permutations++;
  report.violations += Number(failed);
  report.senderFIFO += Number(fifo);
  report.senderFIFOViolations += Number(failed && fifo);
  if (failed && report.examples.length < 5) report.examples.push({ order: candidate, actual });
}
assert.equal(report.permutations, 5040);
assert(report.violations > 0);
for (const mode of [
  'empty-update',
  'originals-in-order-again',
  'self-snapshot',
  'fresh-complete-snapshot',
]) {
  const doc = new Y.Doc({ gc: false });
  try {
    for (const id of order) Y.applyUpdate(doc, Uint8Array.from(source.updates[id]));
    if (mode === 'empty-update') Y.applyUpdate(doc, Uint8Array.from([0, 0]));
    if (mode === 'originals-in-order-again')
      for (const id of ids) Y.applyUpdate(doc, Uint8Array.from(source.updates[id]));
    if (mode === 'self-snapshot') {
      const fresh = new Y.Doc({ gc: false });
      try {
        Y.applyUpdate(fresh, Y.encodeStateAsUpdate(doc));
        report.recoveryProbes[mode] = state(fresh, source.names);
      } finally {
        fresh.destroy();
      }
      continue;
    }
    if (mode === 'fresh-complete-snapshot') {
      const donor = new Y.Doc({ gc: false });
      try {
        for (const id of ids) Y.applyUpdate(donor, Uint8Array.from(source.updates[id]));
        Y.applyUpdate(doc, Y.encodeStateAsUpdate(donor));
      } finally {
        donor.destroy();
      }
    }
    report.recoveryProbes[mode] = state(doc, source.names);
  } finally {
    doc.destroy();
  }
}
for (const path of paths) assert.equal(hash(path), report.files[path]);
report.status = 'completed-reproduction';
report.finished = new Date().toISOString();
writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({
    permutations: report.permutations,
    violations: report.violations,
    senderFIFO: report.senderFIFO,
    senderFIFOViolations: report.senderFIFOViolations,
    recoveryProbes: report.recoveryProbes,
  }),
);
