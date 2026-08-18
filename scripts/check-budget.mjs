/**
 * Performance budget enforcement (TRD §12).
 *
 * "Build-failing thresholds, not aspirations" — so this runs as part of
 * `npm run build` and exits non-zero.
 *
 * The budget is on the *initial* JS bundle: the entry module plus everything
 * the HTML tells the browser to preload. Lazily-loaded chunks are outside it by
 * design, which is also why the SQLite wasm binary (Phase 4) will not count.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const DIST = 'dist';
const BUDGET_BYTES = 350 * 1024;

const html = readFileSync(join(DIST, 'index.html'), 'utf8');

const initial = new Set();
for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) initial.add(match[1]);
for (const match of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)) {
  initial.add(match[1]);
}

const toPath = (url) => join(DIST, url.replace(/^\/+/, ''));

const scripts = [...initial].filter((url) => url.endsWith('.js'));
if (scripts.length === 0) {
  console.error('budget: found no entry scripts in dist/index.html — has the build run?');
  process.exit(1);
}

const gzipped = (path) => gzipSync(readFileSync(path), { level: 9 }).length;

let total = 0;
const rows = [];
for (const url of scripts.sort()) {
  const size = gzipped(toPath(url));
  total += size;
  rows.push([url, size]);
}

const css = readdirSync(join(DIST, 'assets'))
  .filter((name) => name.endsWith('.css'))
  .reduce((sum, name) => sum + gzipped(join(DIST, 'assets', name)), 0);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

for (const [url, size] of rows) console.log(`  ${kb(size).padStart(9)}  ${url}`);
console.log(`  ${kb(css).padStart(9)}  (css, informational — the budget is on JS)`);
console.log(
  `\ninitial JS, gzipped: ${kb(total)} of ${kb(BUDGET_BYTES)} budget ` +
    `(${((total / BUDGET_BYTES) * 100).toFixed(0)}%)`,
);

const wasm = readdirSync(DIST, { recursive: true }).filter((name) =>
  String(name).endsWith('.wasm'),
);
if (wasm.length > 0) console.log(`excluded from the budget: ${wasm.join(', ')}`);

// `--record` prints a row ready to paste into docs/performance.md. Recording is
// manual on purpose: appending on every build would write a row per local rebuild.
if (process.argv.includes('--record')) {
  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // Not a git checkout, or git is unavailable. The row still records the number.
  }
  const date = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD, not UTC
  const used = ((total / BUDGET_BYTES) * 100).toFixed(0);
  console.log(
    `\nappend to docs/performance.md:\n` +
      `| ${date} | \`${commit}\` | ${kb(total)} | ${kb(BUDGET_BYTES)} | ` +
      `${kb(BUDGET_BYTES - total)} (${used}% used) | plaintext |  |`,
  );
}

if (total > BUDGET_BYTES) {
  console.error(`\nbudget exceeded by ${kb(total - BUDGET_BYTES)} (TRD §12).`);
  process.exit(1);
}

statSync(DIST); // fail loudly if dist vanished mid-run
