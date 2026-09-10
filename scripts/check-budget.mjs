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
import { installReceipt } from './lib/receipts.mjs';

installReceipt(import.meta.url);

const DIST = 'dist';
const BUDGET_BYTES = 350 * 1024;

const gzipped = (path) => gzipSync(readFileSync(path), { level: 9 }).length;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
const toPath = (url) => join(DIST, url.replace(/^\/+/, ''));

// Each built HTML entry has its own initial load budget, including shared preloads.
const entries = readdirSync(DIST)
  .filter((name) => name.endsWith('.html'))
  .sort();
if (!entries.includes('index.html'))
  throw Error('budget: dist/index.html is missing — has the build run?');
let total = 0; // The ordinary app's existing --record row.
let exceeded = false;
for (const entry of entries) {
  const html = readFileSync(join(DIST, entry), 'utf8');
  const initial = new Set();
  for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) initial.add(match[1]);
  for (const match of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)) {
    initial.add(match[1]);
  }
  const scripts = [...initial].filter((url) => url.endsWith('.js'));
  if (scripts.length === 0) throw Error(`budget: found no entry scripts in dist/${entry}`);
  let entryTotal = 0;
  console.log(entry);
  for (const url of scripts.sort()) {
    const size = gzipped(toPath(url));
    entryTotal += size;
    console.log(`  ${kb(size).padStart(9)}  ${url}`);
  }
  console.log(`initial JS, gzipped: ${kb(entryTotal)} of ${kb(BUDGET_BYTES)} budget`);
  if (entry === 'index.html') total = entryTotal;
  if (entryTotal > BUDGET_BYTES) {
    console.error(`${entry}: budget exceeded by ${kb(entryTotal - BUDGET_BYTES)} (TRD §12).`);
    exceeded = true;
  }
}
const css = readdirSync(join(DIST, 'assets'))
  .filter((name) => name.endsWith('.css'))
  .reduce((sum, name) => sum + gzipped(join(DIST, 'assets', name)), 0);
console.log(`  ${kb(css).padStart(9)}  (css, informational — the budget is on JS)`);

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

if (exceeded) process.exit(1);

statSync(DIST); // fail loudly if dist vanished mid-run
