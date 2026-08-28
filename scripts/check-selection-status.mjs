/**
 * Current selection status has one authority, and both documents agree with it
 * (TRD §15, `S0-1`, `P-5`'s `RC-8C`).
 *
 * **TRD §15 is the register.** `scripts/generate-suite-vectors.mjs` already reads
 * §15.1 rather than trusting an owner string, and that habit has caught three
 * roles published as unfilled after they were filled. What has never existed is
 * the other direction — and that is exactly how
 * `f-tip-prd-stale-selection-status` survived to the reviewed tip. The TRD closed
 * rows 5, 11 and part of 14; three PRD subsections went on calling them open;
 * every check was green the whole time, because no check read the PRD.
 *
 * **This lives in neither document.** That is `RC-8C`'s third clause and it is
 * not a formality: a one-directional check hosted in one of the two artifacts
 * cannot fail when that artifact is the one that is wrong. Here either can be.
 *
 * What it does:
 *
 * 1. **The register's membership is coherent.** A row is selected or
 *    unselected, never both, and §15.1's count matches what §15 claims in
 *    words.
 * 2. **Every `TRD §15 row N` the PRD names exists**, so a reference cannot
 *    outlive the row it points at.
 * 3. **A PRD sentence claiming a row is settled names a row §15.1 lists**, and a
 *    sentence claiming one is open names a row §15.2 lists. That is the check
 *    the finding asked for, in both directions.
 *
 * **What it cannot do**, stated rather than discovered: it reads claims that
 * name a row. A PRD paragraph describing a selected construction as open
 * *without* citing `TRD §15 row N` is invisible here — which is why the repair
 * added the citations rather than only the words. And it reads membership, not
 * cells: a register row's construction cell describing a selected construction
 * as still open (`S0-9` `E3`/`E4`, TRD §15 row 3 against §6.1) is a
 * register-internal contradiction this scan cannot see — that home rides its
 * owning return (`FU-13`, `S0-3`). The printed conclusion says exactly this
 * much, because a checker's printed claim wider than its scan is this action's
 * founding defect (`P-5` falsifier 21).
 *
 * falsifies: f-tip-prd-stale-selection-status
 */

import { readFileSync } from 'node:fs';

const PRD = new URL('../docs/PRD.md', import.meta.url);
const TRD = new URL('../docs/TRD.md', import.meta.url);

const prd = readFileSync(PRD, 'utf8');
const trd = readFileSync(TRD, 'utf8');
const failures = [];

const slice = (text, from, to) => {
  const start = text.indexOf(from);
  if (start === -1) return null;
  const end = text.indexOf(to, start + from.length);
  return text.slice(start, end === -1 ? undefined : end);
};

// --- 1. the register is coherent ---------------------------------------------

const selectedBlock = slice(trd, '### 15.1 Selected', '### 15.2 Unselected');
const unselectedBlock = slice(trd, '### 15.2 Unselected', '## 16.');
if (selectedBlock === null) throw new Error('TRD §15.1 not found; the register cannot be read.');
if (unselectedBlock === null) throw new Error('TRD §15.2 not found; the register cannot be read.');

const rowsIn = (block) => new Set([...block.matchAll(/^\| (\d+) \|/gmu)].map((m) => m[1]));
const selected = rowsIn(selectedBlock);
const unselected = rowsIn(unselectedBlock);

if (selected.size === 0) throw new Error('§15.1 lists no rows; the register cannot be read.');
if (unselected.size === 0) throw new Error('§15.2 lists no rows; the register cannot be read.');

for (const row of selected) {
  if (unselected.has(row)) {
    failures.push(
      `TRD §15: row ${row} is listed in both §15.1 and §15.2. A row has one status, and a register ` +
        'that carries two is the contradiction every consumer inherits.',
    );
  }
}

/**
 * The count §15 states in words, against the table it is describing.
 *
 * **This found the register's own arithmetic wrong.** §15 said *eighteen rows
 * are selected* three times while §15.1 listed seventeen, because the prose
 * counted row 20's closed half as a selected row and the table did not. The row
 * 20 cell inherited it — *sixteen carry a generated vector file* where fifteen
 * do, since rows 16 and 17 are the two the same sentence excludes. Wrong once,
 * propagated twice, and green throughout: a count in prose is a second copy of
 * a fact the table already holds.
 */
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
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};
const register = slice(trd, '## 15. The selection register', '## 16.');
if (register === null) throw new Error('TRD §15 not found.');

const claimed = /\*\*(\w+) rows are\s+selected and (\w+) are open\*\*/u.exec(
  register.replace(/\n/gu, ' '),
);
if (claimed === null) {
  failures.push('TRD §15 no longer states its own counts; the count cross-check cannot run.');
} else {
  const [, selectedWord, openWord] = claimed;
  for (const word of [selectedWord, openWord]) {
    if (WORDS[word.toLowerCase()] === undefined) {
      failures.push(
        `TRD §15 states a count as "${word}", which this check cannot read as a number — and a ` +
          'count it cannot read is a count it is not checking.',
      );
    }
  }
  if (WORDS[selectedWord.toLowerCase()] !== selected.size) {
    failures.push(
      `TRD §15 says "${selectedWord} rows are selected" and §15.1 lists ${selected.size}.`,
    );
  }
  if (WORDS[openWord.toLowerCase()] !== unselected.size) {
    failures.push(`TRD §15 says "${openWord} are open" and §15.2 lists ${unselected.size}.`);
  }
}

// Both shapes the register uses for the same number: "closed for these
// seventeen" in the prose, and "for the seventeen selected above" in row 20's
// cell. A mutation found the second pattern alone missed the first.
for (const phrase of [
  ...register.matchAll(/for (?:these|the) (\w+)(?= selected| and open| carry| rows)/giu),
]) {
  const n = WORDS[phrase[1].toLowerCase()];
  if (n !== undefined && n !== selected.size) {
    failures.push(
      `TRD §15 refers to "${phrase[1]} selected" rows and §15.1 lists ${selected.size}.`,
    );
  }
}

// --- 2 and 3. the PRD's claims about rows -------------------------------------

/**
 * A claim is read from the sentence that names the row, not the paragraph: a
 * paragraph often contrasts what is settled with what is not, and reading both
 * words out of it would classify every careful sentence as a contradiction.
 */
const SETTLED = /\bselected\b|\banswered\b|\bclosed\b|\bis the selection\b/iu;
const OPEN =
  /\bstill open\b|\bremains open\b|\bis open\b|\bunselected\b|\bnot (?:yet )?selected\b/iu;

/**
 * Emphasis is removed before a claim is read, because this document bolds the
 * status word and half these patterns are phrases (`S0-9`).
 *
 * `is **open**` matched nothing. Neither did `still **open**` or
 * `remains **open**`. The single-word patterns survived — `**selected**` has
 * the markers outside the word, so `\bselected\b` still finds it — which made
 * the check work in the settled direction and fail in the open one, the
 * direction `f-tip-prd-stale-selection-status` is actually about. The PRD's own
 * house style therefore defeated the check written to police it, and every real
 * sentence is emphasised, so the natural way to write the stale claim was the
 * one form invisible here.
 *
 * Stripping the markers deletes the whole class rather than adding the three
 * spellings someone happened to think of — the same move the origin scanner
 * made when inverting its default beat extending its list. Only runs at a
 * word's outer edge go, so `rotation_owed` and `K_g` are untouched.
 */
const unemphasise = (text) => text.replace(/(^|[\s([])[*_`]+|[*_`]+(?=[\s.,;:)\]!?]|$)/gu, '$1');

const sentences = prd
  .replace(/\n+/gu, ' ')
  .split(/(?<=[.!?])\s+(?=[A-Z*_~(])/u)
  .filter((s) => /§15 row/u.test(s));

if (sentences.length === 0) {
  failures.push(
    'The PRD names no TRD §15 row at all. Either the citations were removed, or this scan has ' +
      'stopped matching them — and a status check that reads nothing passes without meaning anything.',
  );
}

for (const sentence of sentences) {
  const rows = [...sentence.matchAll(/§15 row (\d+)/gu)].map((m) => m[1]);
  const plain = unemphasise(sentence);
  const settled = SETTLED.test(plain);
  const open = OPEN.test(plain);
  const short = sentence.trim().slice(0, 150);

  for (const row of rows) {
    if (!selected.has(row) && !unselected.has(row)) {
      failures.push(
        `PRD names TRD §15 row ${row}, which the register does not list.\n      ${short}`,
      );
      continue;
    }
    if (settled && !open && !selected.has(row)) {
      failures.push(
        `PRD describes §15 row ${row} as settled; §15.2 lists it as unselected.\n      ${short}`,
      );
    }
    if (open && !settled && !unselected.has(row)) {
      failures.push(
        `PRD describes §15 row ${row} as open; §15.1 lists it as selected.\n      ${short}\n` +
          '      This is f-tip-prd-stale-selection-status: the register closed the row and the ' +
          'product document kept publishing it as a choice nobody had made.',
      );
    }
  }
}

// --- report -------------------------------------------------------------------

if (failures.length > 0) {
  console.error(
    `selection status: ${failures.length} problem${failures.length === 1 ? '' : 's'}.\n`,
  );
  for (const f of failures) console.error(`  - ${f}`);
  console.error('\nTRD §15 is the register. See docs/review/remediation/S0-1/A-policies.md §5.');
  process.exit(1);
}

// The conclusion is the scope (P-5 falsifier 21, S0-9 E4): membership, stated
// counts, and row-citing sentences — never the construction cells, whose
// agreement with the normative sections is a different oracle's job.
console.log(
  `selection status: ${selected.size} selected and ${unselected.size} unselected rows, disjoint, and the ` +
    `stated counts match; ${sentences.length} PRD sentences cite a row and none disagrees with its membership.`,
);
console.log(
  '  Membership and counts only: a construction cell describing a selected row as open is outside this scan ' +
    '(S0-9 E3/E4; that home rides the S0-3 return).',
);
