/** Independent measurement census and bounded retained bytes; test success alone is insufficient. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { dirname, join, isAbsolute } from 'node:path';
export function measurementPath(reportPath) {
  assert(isAbsolute(reportPath), 'Measurement output requires the owned report path');
  return join(dirname(reportPath), 'measurements.jsonl');
}

export const MEASUREMENT_LIMIT = 65536;
export function measurementContract(file) {
  if (file !== 'test/latency/journal.spec.ts') return undefined;
  return {
    kind: 'journal-latency-v1',
    unit: 'ms',
    projects: ['desktop', 'android'],
    metrics: [
      ...[18, 419, 4096].flatMap((bytes) =>
        [
          'plaintext write (today)',
          'seal only',
          'seal + base64',
          'seal + base64 + setItem',
          'wasm seal only',
          'wasm seal + base64',
          'wasm seal + base64 + setItem',
        ].map((label) => `journal write, ${label}, ${bytes} B`),
      ),
      'journal write, encryption overhead, 18 B',
    ],
  };
}
export function measurementArtifact(bytes) {
  assert(bytes.length > 0 && bytes.length <= MEASUREMENT_LIMIT, 'Measurement byte bound');
  return {
    name: 'latency.jsonl',
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    base64: bytes.toString('base64'),
  };
}
export function reconcileMeasurements(expected, artifact) {
  if (!expected) {
    assert.equal(artifact, undefined, 'Unreviewed measurement output');
    return;
  }
  assert(artifact && typeof artifact.base64 === 'string', 'Missing measurement artifact');
  const bytes = Buffer.from(artifact.base64, 'base64');
  assert.deepEqual(artifact, measurementArtifact(bytes), 'Measurement bytes or metadata changed');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  assert(text.endsWith('\n'), 'Truncated measurement output');
  const rows = text
    .slice(0, -1)
    .split('\n')
    .map((line) => JSON.parse(line));
  const key = (r) => JSON.stringify([r.project, r.metric]);
  assert.deepEqual(
    rows.map(key).sort(),
    expected.projects
      .flatMap((project) => expected.metrics.map((metric) => key({ project, metric })))
      .sort(),
    'Missing, repeated or unexpected measurement',
  );
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), ['metric', 'note', 'project', 'samples', 'value']);
    assert(Number.isFinite(row.value), 'Non-finite measurement');
    assert(
      row.value >= 0 || row.metric === 'journal write, encryption overhead, 18 B',
      'Negative latency',
    );
    assert(
      Number.isSafeInteger(row.samples) && row.samples > 0,
      'Invalid measurement sample count',
    );
    assert(
      typeof row.note === 'string' && row.note.length > 0,
      'Missing measurement interpretation',
    );
  }
}
