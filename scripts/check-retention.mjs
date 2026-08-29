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
 * **4. One gate, one domain, and 5. the boundary's homes agree** (the `S0-7`
 * return; `P-4` falsifiers 17 and 19). The deletion gate publishes its
 * six-class domain and boundary semantics with the package vectors, and this
 * reads them back against §14.7's table and the executable model — the
 * five-entry `DELETION_CLASSES` copy that let the gate and the model pass over
 * different domains died at the return. And every home of the ratified
 * destructive-boundary rule must state it while the superseded sentences stay
 * dead — byte rules against named sentences, the `FU-07`/`FU-13` shape refused
 * before it recurs. What these scans do not prove is execution: the boundary's
 * behaviour is `test/hostedRetention.test.ts`'s to demonstrate.
 *
 * **3. The lapse carrier and the transition grammar stay disjoint** (`S0-7`).
 * `RC-7`'s diagnosis of `f-4259822-lapse-transition-kind-missing` is that two
 * independent checkers each passed because *neither cross-checked the policy
 * state against a durable transition*. Row 15's grammar and row 16's clock were
 * jointly credited with covering a lapse and neither carried it. §14.7 carries
 * it now, on a second axis, and the invariant that keeps the two apart is a
 * vocabulary rule: **no transition kind may name a retention state, and no
 * retention state may be spelled with a lineage word.** A future `lapse` kind,
 * or a retention state renamed to `retired`, fails here rather than reaching a
 * reviewer — which is the check that did not exist when the finding was made.
 *
 * **The honest limit of the scan**, stated rather than discovered: it catches a
 * *different* number, in digits or in the spellings below. A duration phrased in
 * a form it does not recognize is not matched and not rejected. What catches a
 * number that has been deleted rather than changed is the anchor list, which
 * requires the statement to be present in each place that must carry it.
 *
 * falsifies: f-4259822-lapse-transition-kind-missing
 */

import { readFileSync } from 'node:fs';
import { installReceipt } from './lib/receipts.mjs';

installReceipt(import.meta.url);

const PRD = new URL('../docs/PRD.md', import.meta.url);
const TRD = new URL('../docs/TRD.md', import.meta.url);
/** The generator's own output, so the grammar is read rather than restated. */
const TRANSITION = new URL('../test/vectors/transition.json', import.meta.url);
/** The executable model, for the same reason: read it, do not restate it. */
const MODEL = new URL('../test/hostedRetention.test.ts', import.meta.url);

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
  { file: 'TRD', from: '### 14.7', to: '## 15.', why: 'the machine that runs the clock' },
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

// --- 3. the lapse carrier is not, and may not become, a transition kind -------

const machine = slice('TRD', '### 14.7', '## 15.');
if (machine === null) throw new Error('TRD §14.7 not found; the retention machine cannot be read.');

const grammar = slice('TRD', '### 13.7', '### 13.8');
if (grammar === null)
  throw new Error('TRD §13.7 not found; the transition grammar cannot be read.');

const published = JSON.parse(readFileSync(TRANSITION, 'utf8'));
const kinds = published.construction?.kinds;
if (!Array.isArray(kinds) || kinds.length === 0) {
  throw new Error('transition.json publishes no construction.kinds; regenerate it.');
}

/**
 * §14.7's state table. Its rows begin with a backticked identifier; the class
 * table's begin with a number, which is what separates them.
 */
const states = [...machine.matchAll(/^\| `([a-z][a-z-]*)` \| /gmu)].map((m) => m[1]);
const classes = [...machine.matchAll(/^\| (\d) \| `([a-z][a-z-]*)` \|(.*)$/gmu)].map((m) => ({
  n: Number(m[1]),
  name: m[2],
  cells: m[3].split('|').map((c) => c.trim()),
}));

// A disjointness check over an empty set proves nothing, so a table that stops
// parsing is a failure rather than a pass.
if (states.length < 3 || classes.length < 3) {
  failures.push(
    `TRD §14.7: parsed ${states.length} states and ${classes.length} deletion classes. ` +
      `The tables did not read — and a vocabulary check over an empty set passes without meaning anything.`,
  );
}

/**
 * **The model and the document must agree, and nothing else was checking that.**
 * `pnpm vectors:check` compares a generator to its vector and never a document
 * to either — which is the exact shape of `f-992bc91-network-carrier-registry-
 * stale`, and the shape of this finding too. §14.7 is normative and
 * `test/hostedRetention.test.ts` is what proves it holds; a state or a deletion
 * class in one and not the other means one of them is describing a machine that
 * does not exist.
 */
const model = readFileSync(MODEL, 'utf8');
const union = (name) => {
  const m = new RegExp(`type ${name} =([^;]+);`, 'u').exec(model);
  return m === null ? null : [...m[1].matchAll(/'([a-z][a-z-]*)'/gu)].map((x) => x[1]);
};
const array = (name) => {
  const m = new RegExp(`const ${name} = \\[([^\\]]+)\\]`, 'u').exec(model);
  return m === null ? null : [...m[1].matchAll(/'([a-z][a-z-]*)'/gu)].map((x) => x[1]);
};

const agree = (what, fromDoc, fromModel) => {
  if (fromModel === null) {
    failures.push(
      `${MODEL.pathname.split('/').pop()}: could not read the ${what}; the model cross-check is not running.`,
    );
    return;
  }
  const only = (a, b) => a.filter((x) => !b.includes(x));
  const missing = only(fromDoc, fromModel);
  const extra = only(fromModel, fromDoc);
  if (missing.length > 0 || extra.length > 0) {
    const sides = [];
    if (missing.length > 0) sides.push(`document-only [${missing.join(', ')}]`);
    if (extra.length > 0) sides.push(`model-only [${extra.join(', ')}]`);
    failures.push(
      `TRD §14.7 and the executable model disagree on the ${what}: ${sides.join(' ')}. ` +
        `One of them describes a machine that does not exist.`,
    );
  }
};

agree('retention states', states, union('Retention'));
agree(
  'deletion classes',
  classes.map((c) => c.name),
  array('CLASSES'),
);

/** The rule from `S0-7` Stage A §0: the two axes may not share words. */
const LINEAGE_WORDS = new Set(['live', 'retired']);
for (const state of states) {
  if (kinds.includes(state)) {
    failures.push(
      `TRD §14.7: retention state \`${state}\` is also a transition kind. The whole of ` +
        `f-4259822-lapse-transition-kind-missing is these two axes being read as one.`,
    );
  }
  if (LINEAGE_WORDS.has(state)) {
    failures.push(
      `TRD §14.7: retention state \`${state}\` is a §13.5 lineage word. A lapsed workspace is ` +
        `\`live\` on that axis, and a shared vocabulary is how the confusion gets made.`,
    );
  }
}

for (const kind of kinds) {
  if (/lapse|downgrade|suspend|expir/iu.test(kind)) {
    failures.push(
      `transition.json publishes kind \`${kind}\`. P-4 selected the opposite: lapse is a billing fact ` +
        `carried by §14.7 and not a fourth kind. Reversing that decision means revisiting rows 15 and 16, ` +
        `§13.7 and §14.7 together — not adding a kind.`,
    );
  }
  if (!grammar.includes(`\`${kind}\``)) {
    failures.push(`TRD §13.7 does not name the published transition kind \`${kind}\`.`);
  }
}

const counted = /one protocol at (\w+) kinds/iu.exec(grammar);
if (counted === null) {
  failures.push(
    'TRD §13.7 no longer says how many kinds the protocol has; the count cannot be checked.',
  );
} else if (WORDS[counted[1].toLowerCase()] !== kinds.length) {
  failures.push(
    `TRD §13.7 says "${counted[1]} kinds" and transition.json publishes ${kinds.length}. ` +
      `A grammar that grows without the document saying so is how a lapse kind arrives unreviewed.`,
  );
}

/**
 * Class 6 is the entire difference between the two causes, and PRD §6.10's
 * re-seed *without creating or confirming a new code* is only true while it is.
 */
const kept = classes.filter((c) => /keep/iu.test(c.cells[1] ?? ''));
if (kept.length !== 1 || kept[0].name !== 'recovery-anchor') {
  failures.push(
    `TRD §14.7: expiry must keep exactly one deletion class and it must be \`recovery-anchor\` — ` +
      `found [${kept.map((c) => c.name).join(', ') || 'none'}]. Deleting the anchor at expiry makes ` +
      `PRD §6.10's re-seed without a new recovery code impossible.`,
  );
}
if (classes.some((c) => /keep/iu.test(c.cells[2] ?? ''))) {
  failures.push('TRD §14.7: retirement keeps a deletion class. Retirement reaches all six.');
}

// --- 4. one gate, one domain (P-4 falsifier 17, the S0-7 return) ---------------

/**
 * The two artifacts credited with `f-4259822-retirement-safe-survivor-gate-
 * undefined` — the deletion gate in `generate-package-vectors.mjs` and the
 * retention model — must state **the same predicate over the same six
 * classes**. Before the return the generator held a five-entry copy that
 * omitted `recovery-anchor`, so each artifact passed over a different domain
 * and nothing failed. The generator now publishes its domain with the vectors;
 * this reads it back against §14.7's table and the model's own declaration —
 * order included, because a reordered copy is still a copy — and checks the
 * published time semantics against the section that owns them.
 */
const PACKAGE = new URL('../test/vectors/package.json', import.meta.url);
const domain = JSON.parse(readFileSync(PACKAGE, 'utf8')).construction?.terminal_handoff
  ?.deletion_authority;
if (domain?.classes === undefined) {
  failures.push(
    'test/vectors/package.json publishes no construction.terminal_handoff.deletion_authority.classes; ' +
      'the one-domain cross-check (P-4 falsifier 17) is not running. Regenerate the package vectors.',
  );
} else {
  const docOrder = classes.map((c) => c.name).join(' · ');
  const gateOrder = domain.classes.join(' · ');
  const modelOrder = (array('CLASSES') ?? []).join(' · ');
  if (gateOrder !== docOrder || modelOrder !== docOrder) {
    failures.push(
      `the deletion-authority domain has drifted (P-4 falsifier 17): §14.7 [${docOrder}] · ` +
        `published gate [${gateOrder}] · model [${modelOrder}]. One domain, one order, all six classes — ` +
        `the five-entry copy died at the S0-7 return and stays dead.`,
    );
  }
  // These documents hard-wrap at ~110 columns, so tokens are matched against a
  // whitespace-flattened copy; backticks are stripped because the JSON cannot
  // carry them.
  const unticked = machine.replace(/`/gu, '').replace(/\s+/gu, ' ');
  for (const [field, token] of [
    ['destructive_boundary', 'retired_at + RETENTION'],
    ['destructive_boundary', 'written exactly once at the cause overwrite'],
    ['at_the_boundary', 'deleted-without-receipt'],
  ]) {
    const published = domain[field];
    if (typeof published !== 'string' || !published.includes(token)) {
      failures.push(
        `the published deletion authority's ${field} no longer states "${token}"; ` +
          `the gate's time semantics have drifted from §14.7's (P-4 falsifier 17).`,
      );
    } else if (!unticked.includes(token)) {
      failures.push(
        `TRD §14.7 no longer states "${token}", which the published deletion authority still claims; ` +
          `the section and the gate disagree about the time semantics (P-4 falsifier 17).`,
      );
    }
  }
}

// --- 5. the destructive boundary's homes agree (P-4 falsifier 19) --------------

/**
 * The ratified rule has homes, and a home still publishing the superseded
 * sentence is the `FU-07`/`FU-13` shape — one fact, two homes, disagreeing
 * under a green gate. Byte rules against named sentences, per home; the
 * decision record itself is not scanned for the superseded forms, because it
 * quotes them as the convicted history.
 */
const readDoc = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const HOMES = [
  {
    name: 'TRD §14.4',
    text: slice('TRD', '### 14.4', '### 14.5'),
    must: ['retired_at + RETENTION', 'deleted-without-receipt'],
    refuse: ['bounded by the same deadline as everything else'],
  },
  {
    name: 'TRD §14.7',
    text: machine,
    must: ['retired_at + RETENTION', 'deleted-without-receipt', 'erasure acceptance'],
    refuse: ['keeps the bytes until the ceiling and no longer', 'do not move, because it is the same stop'],
  },
  {
    name: 'row 16 §9',
    text: (() => {
      const row16 = readDoc('../docs/selections/row-16-hosted-retention.md');
      const at = row16.indexOf('## 9.');
      return at === -1 ? null : row16.slice(at);
    })(),
    must: ['deleted-without-receipt', 'written exactly once at the `cause` overwrite'],
    refuse: ['the ceiling binding whatever the cause'],
  },
  {
    name: 'PRD §6.9',
    text: slice('PRD', '### 6.9', '### 6.10'),
    must: ['Asking for deletion is accepting deletion', 'deleted-without-receipt'],
    refuse: ['whatever happened to the handoff'],
  },
  {
    name: 'PRD §6.10',
    text: slice('PRD', '### 6.10', '### 6.11'),
    must: ['boundary measured from the request'],
    refuse: [],
  },
  {
    name: 'S0-6/A-schemas.md §4',
    text: readDoc('../docs/review/remediation/S0-6/A-schemas.md'),
    must: ['until the destructive boundary', 'deleted-without-receipt'],
    refuse: ['A lost acknowledgement retains bytes.**'],
  },
  {
    name: 'S0-7/A-schemas.md §3',
    text: readDoc('../docs/review/remediation/S0-7/A-schemas.md'),
    must: ['retired_at + RETENTION', 'deleted-without-receipt'],
    refuse: ['retains the bytes until the ceiling and no longer'],
  },
  {
    name: 'decisions/P-4',
    text: readDoc('../docs/review/remediation/decisions/P-4-lapse-authority.md'),
    must: ['deleted-without-receipt', 'retired_at + RETENTION'],
    refuse: [],
  },
];
for (const home of HOMES) {
  if (home.text === null) {
    failures.push(`${home.name}: section not found — the homes-agree readback cannot scan it.`);
    continue;
  }
  // Flattened for the same hard-wrap reason as the domain tokens above.
  const flat = home.text.replace(/\s+/gu, ' ');
  for (const token of home.must) {
    if (!flat.includes(token)) {
      failures.push(
        `${home.name} no longer states "${token}" — a home has dropped the ratified rule ` +
          `(P-4 falsifier 19; the S0-7 return).`,
      );
    }
  }
  for (const phrase of home.refuse) {
    if (flat.includes(phrase)) {
      failures.push(
        `${home.name} publishes "${phrase}" again — the superseded sentence the S0-7 return retired ` +
          `(P-4 falsifier 19). Elapsed time is never an authority; restate the home, not the rule.`,
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
    `every §16 unselected cell is bounded and open; ` +
    `§14.7's ${states.length} states and ${classes.length} deletion classes match the executable model ` +
    `and stay disjoint from §13.7's ${kinds.length} kinds and from §13.5's lineage words; ` +
    `the published deletion-authority domain, §14.7's table and the model agree on one six-class order ` +
    `with the boundary tokens stated in both; and ${HOMES.length} destructive-boundary homes carry the ` +
    `ratified sentences with the superseded ones refused (P-4 falsifiers 17 and 19 — byte rules; the ` +
    `boundary's execution semantics are the model tests' to prove).`,
);
