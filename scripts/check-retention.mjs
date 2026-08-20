/**
 * The retention story's consistency check (TRD §15 row 16, §16.6).
 *
 * Row 16 selects a number — twelve months of hosted-content retention after a
 * lapse — and a number has no vectors. There is no construction to reproduce,
 * no negative to fail, and nothing for `pnpm vectors:coverage` to elide. What a
 * number has instead is **copies**, and this project has been bitten twice by a
 * fact stated in two places: row 1's suite file published a superseded library,
 * and its deferral entries named §15 rows that had since been answered. The
 * recorded tell is *a generator holding a string that describes a state
 * somewhere else*, and the recorded fix is always to read the somewhere else.
 *
 * So this reads the requirements rather than restating them, and fails the
 * build on two things.
 *
 * **1. The duration is agreed.** Every place the PRD or the TRD states a
 * hosted-content retention duration must state this one. An edit that changes
 * §6.10 to six months and leaves §16 at twelve fails here rather than reaching
 * a reviewer.
 *
 * **2. Every `unselected` cell in §16 is bounded, and none points at a closed
 * row.** §16.6 and sequencing §3.7 both already require this and nothing was
 * enforcing it. Two kinds of `unselected` exist and a cell must declare which:
 * one is waiting on a §15 row, and that row must still be open; the other is
 * waiting on a deployment choice, which no selection closes. The rule as
 * originally written recognized only the first and was therefore false of four
 * cells in its own table.
 *
 * **The honest limit of the scan**, stated rather than discovered: it catches a
 * *different* number, in digits or in the spellings below. A duration phrased in
 * a form it does not recognize is not matched and not rejected. What catches a
 * number that has been deleted rather than changed is the anchor list, which
 * requires the statement to be present in each place that must carry it.
 */

import { readFileSync } from 'node:fs';

const PRD = new URL('../docs/PRD.md', import.meta.url);
const TRD = new URL('../docs/TRD.md', import.meta.url);

/**
 * The selection (docs/selections/row-16-hosted-retention.md).
 *
 * Twelve months, and it is both a floor on the promise and a ceiling on the
 * data: a plan may offer longer retention and none may offer shorter, and at
 * expiry the ciphertext and its wraps are deleted rather than merely eligible
 * for deletion. A floor alone would leave §16's row unbounded above, which
 * §16.6 calls a defect.
 */
const MONTHS = 12;

/** Accepted spellings of the same duration. Prose spells numbers out; tables do not. */
const EQUIVALENT = new Set(['12 months', 'twelve months', '1 year', 'one year', 'a year']);

/**
 * Where the number must appear. A heading that cannot be found fails: a renamed
 * section is exactly how an anchor stops anchoring anything.
 */
const ANCHORS = [
  {
    file: 'PRD',
    from: '### 6.10',
    to: '### 6.11',
    why: 'the lapse invariant that owes the number',
  },
  { file: 'PRD', from: '## 11.', to: '## 12.', why: 'question 5, which the selection answers' },
  { file: 'TRD', from: '### 13.8', to: '### 13.9', why: 'the recovery path the number bounds' },
  { file: 'TRD', from: '### 15.1', to: '### 15.2', why: "the register's own statement of row 16" },
  { file: 'TRD', from: '## 16.', to: '## Sources', why: 'the inventory rows that carry it' },
];

const WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  eighteen: 18,
  twenty: 20,
  thirty: 30,
  sixty: 60,
  ninety: 90,
  a: 1,
};

/** A duration, in digits or in a spelling above. */
const DURATION =
  /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen|twenty|thirty|sixty|ninety|a)\s+(day|week|month|year)s?\b/giu;

/** Sentences about *this* retention, rather than about row 6's and row 7's positional ones. */
const HOSTED =
  /hosted[- ]content retention|hosted retention|retention (?:duration|window|expiry)|retained (?:copy|history)|retention after a lapse/iu;

const files = { PRD: readFileSync(PRD, 'utf8'), TRD: readFileSync(TRD, 'utf8') };
const failures = [];

const slice = (file, from, to) => {
  const text = files[file];
  const start = text.indexOf(from);
  if (start === -1) return null;
  const end = text.indexOf(to, start + from.length);
  return text.slice(start, end === -1 ? undefined : end);
};

const asMonths = (count, unit) => {
  const n = /^\d+$/u.test(count) ? Number(count) : WORDS[count.toLowerCase()];
  if (n === undefined) return null;
  return unit === 'month' ? n : unit === 'year' ? n * 12 : null;
};

// --- 1. the duration is stated, and agreed ------------------------------------

for (const anchor of ANCHORS) {
  const section = slice(anchor.file, anchor.from, anchor.to);
  if (section === null) {
    failures.push(
      `${anchor.file} ${anchor.from}: section not found — a renamed heading is how an anchor stops anchoring.`,
    );
    continue;
  }
  const stated = [...EQUIVALENT].some((form) => section.toLowerCase().includes(form));
  if (!stated) {
    failures.push(
      `${anchor.file} ${anchor.from} states no hosted-retention duration (${anchor.why}). ` +
        `Row 16 selected ${MONTHS} months and every anchor must carry it.`,
    );
  }
}

for (const [name, text] of Object.entries(files)) {
  for (const line of text.split('\n')) {
    if (!HOSTED.test(line)) continue;
    for (const [whole, count, unit] of line.matchAll(DURATION)) {
      const months = asMonths(count, unit);
      if (months === null || months === MONTHS) continue;
      failures.push(
        `${name}: "${whole.trim()}" in a hosted-retention sentence disagrees with row 16's ${MONTHS} months.\n` +
          `      ${line.trim().slice(0, 140)}`,
      );
    }
  }
}

// --- 2. §16's unselected cells are bounded, and point at open rows -------------

const inventory = slice('TRD', '## 16.', '## Sources');
if (inventory === null) throw new Error('TRD §16 not found; the inventory cannot be read.');

const register = slice('TRD', '### 15.1', '### 15.2');
if (register === null) throw new Error('TRD §15.1 not found; the register cannot be read.');
const selected = new Set([...register.matchAll(/^\| (\d+) \|/gmu)].map((m) => m[1]));
if (selected.size === 0) throw new Error('§15.1 has no rows; the register cannot be read.');

/** A cell must say which kind of unselected it is. Neither form is a default. */
const PENDING_ROW = /§15 rows? ([\d, and]+)/u;
const PENDING_DEPLOYMENT = /pending deployment/iu;

for (const line of inventory.split('\n')) {
  if (!/unselected/iu.test(line)) continue;
  // The preamble and §16.6 talk *about* the placeholder rather than using it.
  const isCell = line.startsWith('|');
  const rows = PENDING_ROW.exec(line);
  const deployment = PENDING_DEPLOYMENT.test(line);

  if (isCell && rows === null && !deployment) {
    failures.push(
      `TRD §16: an unselected cell declares neither kind — it must name the §15 row that closes it, or say "pending deployment".\n` +
        `      ${line.trim().slice(0, 140)}`,
    );
  }
  if (rows === null) continue;

  for (const row of rows[1]
    .split(/[,\s]+and\s+|,\s*/u)
    .map((r) => r.trim())
    .filter(Boolean)) {
    if (selected.has(row)) {
      failures.push(
        `TRD §16: points at §15 row ${row}, which §15.1 lists as selected. An unselected cell outliving its row publishes a decision as open after it was taken.\n` +
          `      ${line.trim().slice(0, 140)}`,
      );
    }
  }
}

// --- report -------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`retention: ${failures.length} problem${failures.length === 1 ? '' : 's'}.\n`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error('\nSee docs/selections/row-16-hosted-retention.md §7.');
  process.exit(1);
}

console.log(
  `retention: ${MONTHS} months stated consistently across ${ANCHORS.length} anchors; ` +
    `every §16 unselected cell is bounded and open.`,
);
