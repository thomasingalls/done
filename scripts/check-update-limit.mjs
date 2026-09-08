/**
 * `MAX_UPDATE` is derived, and this recomputes the derivation (TRD §12, §6.1,
 * `S0-3`, `P-3`).
 *
 * **The seal's 64 KiB buffer looked like the constraint and was not.** §12
 * requires the whole synchronous journal write — seal, base64 and `setItem` — to
 * complete in under 1 ms p95 on a low-end device, and calls that *a correctness
 * budget in disguise*. The measured Pixel 9a numbers put the exhaustion point at
 * about 20 kB, so the module's guard sits roughly three times past a budget the
 * design treats as correctness (`f-9b49b74-journal-seal-64k-gap`).
 *
 * So the limit follows the budget rather than the buffer — and a *derived*
 * constant needs its derivation checked, or it is a chosen one with a story
 * attached. This reads the measurements from `docs/performance.md`, the budget
 * from TRD §12, and recomputes every row of §12's own extrapolation table.
 *
 * **Three things it will not do.** It does not decide the constant: the interim
 * 16 kB waits on the declared support population
 * (`f-bd87655-baseline-not-performance-floor`, `L-4`), and what is checked is
 * that it stays under what the budget permits. It does not claim the
 * extrapolation is a measurement — three points on one device establish *about
 * 20 kB, not 64 kB*, which is the load-bearing part. And it does not check the
 * slicing that keeps ordinary operations under the limit; that is
 * `test/writeAdmission.test.ts`.
 *
 * falsifies: f-9b49b74-journal-seal-64k-gap -> L-1
 */

import { readFileSync } from 'node:fs';
import { installReceipt } from './lib/receipts.mjs';

installReceipt(import.meta.url);

const TRD = new URL('../docs/TRD.md', import.meta.url);
const PERF = new URL('../docs/performance.md', import.meta.url);
const RUST = new URL('../wasm/journal-seal/src/lib.rs', import.meta.url);

/** The interim floor to build against, until the population is declared. */
const INTERIM_BYTES = 16 * 1024;
/** How far the recomputed table may sit from what §12 prints, in µs. */
const TOLERANCE_US = 2;

const trd = readFileSync(TRD, 'utf8');
const perf = readFileSync(PERF, 'utf8');
const failures = [];

const slice = (text, from, to) => {
  const start = text.indexOf(from);
  if (start === -1) return null;
  const end = text.indexOf(to, start + from.length);
  return text.slice(start, end === -1 ? undefined : end);
};

const bytesOf = (label) => {
  const m = /^(\d+(?:\.\d+)?)\s*(B|kB)$/u.exec(label.replaceAll('*', '').replace('~', '').trim());
  if (m === null) return null;
  return m[2] === 'kB' ? Number(m[1]) * 1024 : Number(m[1]);
};

// --- 1. the measurements, from the run that took them --------------------------

const budgetRow = slice(perf, '#### The budget row', '####');
if (budgetRow === null)
  throw new Error('performance.md has no budget row; the derivation cannot run.');

const measured = [];
for (const row of budgetRow.matchAll(/^\|([^|]+)\|([^|]+)\|([^|]+)\|/gmu)) {
  const bytes = bytesOf(row[1]);
  const us = /([\d\s]+(?:\.\d+)?)\s*µs/u.exec(row[3].replaceAll('*', ''));
  if (bytes === null || us === null) continue;
  measured.push({ bytes, us: Number(us[1].replaceAll(/\s/gu, '')) });
}
measured.sort((a, b) => a.bytes - b.bytes);

if (measured.length < 2) {
  throw new Error(
    `performance.md's budget row yielded ${measured.length} usable measurements; at least two are needed ` +
      'to fit a slope, and a derivation over one point is not one.',
  );
}

// The two largest points. The smallest carries fixed per-call cost that has
// amortized away by 4 kB, so including it would understate the per-byte term.
const [a, b] = measured.slice(-2);
const slope = (b.us - a.us) / (b.bytes - a.bytes);
const at = (bytes) => b.us + (bytes - b.bytes) * slope;

// --- 2. the budget, from §12's own table ---------------------------------------

const budgets = slice(trd, '## 12. Performance budgets', '## 13.');
if (budgets === null) throw new Error('TRD §12 not found.');
const stated =
  /\|\s*\*\*Journal AEAD write, low-end device\*\*\s*\|\s*\*\*<\s*(\d+)\s*ms p95\*\*/u.exec(
    budgets,
  );
if (stated === null) {
  failures.push('TRD §12 no longer states the journal budget in a form this can read.');
}
const budgetUs = stated === null ? 1000 : Number(stated[1]) * 1000;
const exhausted = Math.round(b.bytes + (budgetUs - b.us) / slope);

// --- 3. §12's extrapolation table, every row of it ------------------------------

let rows = 0;
for (const row of budgets.matchAll(
  /^\|\s*(~?\**[\d.]+\s*kB)\**\s*\|\s*≈?\s*([\d\s]+)\s*µs\s*\|/gmu,
)) {
  const bytes = bytesOf(row[1]);
  if (bytes === null) continue;
  rows += 1;
  const printed = Number(row[2].replaceAll(/\s/gu, ''));
  const computed = at(bytes);
  if (Math.abs(printed - computed) > TOLERANCE_US) {
    failures.push(
      `TRD §12 prints ${printed} µs at ${row[1].trim()} and the measurements give ` +
        `${computed.toFixed(0)} µs. The table is a derivation, so it is recomputed rather than trusted.`,
    );
  }
}
if (rows < 3) {
  failures.push(
    `TRD §12's extrapolation table yielded ${rows} rows. A derivation check over an empty table passes ` +
      'without meaning anything.',
  );
}

const ceilingClaim = /exhausted at about \*\*?(\d+)\s*kB/u.exec(budgets.replaceAll('\n', ' '));
if (ceilingClaim === null) {
  failures.push(
    'TRD §12 no longer states where the budget is exhausted, so the prose and the table can drift apart.',
  );
} else {
  const claimed = Number(ceilingClaim[1]) * 1024;
  if (Math.abs(claimed - exhausted) > 1024) {
    failures.push(
      `TRD §12 says the budget is exhausted at about ${ceilingClaim[1]} kB and the measurements give ` +
        `${(exhausted / 1024).toFixed(1)} kB.`,
    );
  }
}

// --- 4. the interim limit, against the budget and against the module ------------

if (INTERIM_BYTES >= exhausted) {
  failures.push(
    `The interim MAX_UPDATE of ${INTERIM_BYTES} B is at or above the ${exhausted} B the budget permits. ` +
      'The limit follows the budget; it does not get to exceed it while waiting for a population.',
  );
}

const rust = readFileSync(RUST, 'utf8');
const maxPlaintext = /const MAX_PLAINTEXT: usize = (\d+);/u.exec(rust);
if (maxPlaintext === null) {
  failures.push('wasm/journal-seal/src/lib.rs no longer declares MAX_PLAINTEXT.');
} else if (INTERIM_BYTES >= Number(maxPlaintext[1])) {
  failures.push(
    `MAX_UPDATE (${INTERIM_BYTES} B) is at or above the module's MAX_PLAINTEXT ` +
      `(${maxPlaintext[1]} B). The seal's guard is meant to be a backstop admission never reaches; ` +
      'at or above it, the guard is the limit again and §6.1 is describing a machine that does not exist.',
  );
}

// --- report ---------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`update limit: ${failures.length} problem${failures.length === 1 ? '' : 's'}.\n`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error('\nSee docs/review/remediation/S0-3/A-schemas.md §1.');
  process.exit(1);
}

console.log(
  `update limit: ${slope.toFixed(4)} µs/byte from ${measured.length} measurements; the budget is ` +
    `exhausted at ${(exhausted / 1024).toFixed(1)} kB and §12's ${rows} extrapolated rows agree; ` +
    `the interim ${INTERIM_BYTES / 1024} kB is under it and under the module's guard.`,
);
