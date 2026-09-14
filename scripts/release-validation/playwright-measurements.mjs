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
  if (file === 'test/latency/diagnosis.spec.ts')
    return {
      kind: 'latency-diagnosis-v1',
      unit: 'ms',
      projects: ['desktop', 'android'],
      metrics: [1, 2].flatMap((block) =>
        ['textarea', 'codemirror', 'card'].map((surface) => surface + ' block ' + block),
      ),
    };
  if (file === 'test/latency/latency.spec.ts')
    return {
      kind: 'local-latency-v1',
      unit: 'ms',
      projects: ['desktop', 'android'],
      metrics: [
        'fresh launch → create prompt',
        'confirm creation → Today editable',
        'cold launch → unlock prompt',
        'cold factor submit → Today editable',
        'encrypted content load and replay',
        'boot: module graph evaluated',
        'warm launch → unlock prompt',
        'warm factor submit → Today editable',
        'keystroke → paint, compose field',
        'keystroke → paint, card editor',
        'card focus → editable',
        'day-to-day navigation, goTo (response)',
        'day-to-day navigation, goTo (settled)',
        'day-to-day navigation, step (response)',
        'day-to-day navigation, step (settled)',
      ],
    };
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
  if (expected.kind === 'local-latency-v1')
    for (const project of expected.projects) {
      const value = (metric) =>
        rows.find((r) => r.project === project && r.metric === metric).value;
      const budgets = [
        [
          'cold application work',
          value('cold launch → unlock prompt') + value('cold factor submit → Today editable'),
          2500,
        ],
        [
          'warm application work',
          value('warm launch → unlock prompt') + value('warm factor submit → Today editable'),
          1000,
        ],
        ...[
          ['encrypted content load and replay', 500],
          ['keystroke → paint, compose field', 16],
          ['keystroke → paint, card editor', 16],
          ['card focus → editable', 50],
          ['day-to-day navigation, goTo (response)', 100],
          ['day-to-day navigation, goTo (settled)', 100],
          ['day-to-day navigation, step (response)', 100],
        ].map(([metric, limit]) => [metric, value(metric), limit]),
      ];
      for (const [metric, observed, limit] of budgets)
        assert(
          observed < limit,
          project + ' ' + metric + ': ' + observed + ' ms exceeds <' + limit + ' ms',
        );
    }
}
