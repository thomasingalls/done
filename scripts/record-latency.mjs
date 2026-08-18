/**
 * Turns a latency run into rows ready to paste into docs/performance.md.
 *
 * Recording is manual, for the reason `check-budget.mjs` already gives: a file
 * that appends on every run is a file nobody reads. What is worth recording is
 * a measurement someone chose to take, against a commit that says what was
 * measured.
 *
 * Reads `test-results/latency.jsonl`, which `pnpm latency` writes.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RESULTS = join('test-results', 'latency.jsonl');

/** TRD §12, by the metric names the suite records. Null where §12 has no row. */
const BUDGETS = {
  'first run → Today editable': null,
  'cold start → Today editable': '< 2.5 s',
  'warm start → Today editable': '< 1.0 s',
  'content-root load (encoded state)': '< 500 ms',
  'boot: module graph evaluated': null,
  'keystroke → paint, compose field': '< 16 ms p95',
  'keystroke → paint, card editor': '< 16 ms p95',
  'card focus → editable': '< 50 ms',
  'day-to-day navigation, goTo (response)': '< 100 ms',
  'day-to-day navigation, goTo (settled)': '< 100 ms',
  'day-to-day navigation, step (response)': '< 100 ms',
  'day-to-day navigation, step (settled)': 'n/a — 220 ms snap',
};

let lines;
try {
  lines = readFileSync(RESULTS, 'utf8').trim().split('\n').filter(Boolean);
} catch {
  console.error(`latency: no results at ${RESULTS} — run \`pnpm latency\` first.`);
  process.exit(1);
}

const samples = lines.map((line) => JSON.parse(line));
const projects = [...new Set(samples.map((sample) => sample.project))].toSorted();
const metrics = [...new Set(samples.map((sample) => sample.metric))];

const value = (metric, project) =>
  samples.find((sample) => sample.metric === metric && sample.project === project);

const format = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(1)} ms`);

let commit = 'unknown';
try {
  commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch {
  // Not a git checkout. The numbers still stand; their attribution does not.
}
// Local YYYY-MM-DD, not UTC.
const date = new Date().toLocaleDateString('en-CA');

const header = ['Date', 'Commit', 'Metric', ...projects, 'Budget', 'Store'];
console.log(`\nappend to docs/performance.md:\n`);
console.log(`| ${header.join(' | ')} |`);
console.log(`| ${header.map(() => '---').join(' | ')} |`);

for (const metric of metrics) {
  const cells = projects.map((project) => {
    const found = value(metric, project);
    return found ? format(found.value) : '—';
  });
  const budget = BUDGETS[metric] ?? '—';
  console.log(
    `| ${date} | \`${commit}\` | ${metric} | ${cells.join(' | ')} | ${budget} | plaintext |`,
  );
}

console.log(`\nnotes recorded by the run:`);
for (const metric of metrics) {
  const note = samples.find((sample) => sample.metric === metric && sample.note)?.note;
  const count = samples.find((sample) => sample.metric === metric && sample.samples)?.samples;
  if (note || count) {
    console.log(`  ${metric}: ${note ?? ''}${count ? ` (${count} samples)` : ''}`);
  }
}
