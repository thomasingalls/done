/**
 * Every repaired finding, and the falsifier that refuses it (`S0-8`, `P-5`).
 *
 * The plan asks for a matrix from each repaired finding to the executable
 * counterexample that proves the repair. The obvious way to produce one is to
 * write the table — and that is Branch B, which `P-5` rejected: a written table
 * is a second copy of every mapping, and this repository has already shipped an
 * inventory whose second copy went stale under a green check.
 * `f-992bc91-network-carrier-registry-stale` is the type specimen: a registry
 * calling a selected carrier unselected, passing everything, for four commits.
 *
 * `RC-8C` is the rule this obeys — **one home per fact; every consumer reads the
 * home; where two artifacts must agree, the agreement is checked in both
 * directions by something that is neither of them.** So the claim lives at the
 * evidence, docs/review/remediation/traceability.md is generated from it, and
 * this file, which is neither the claim nor the matrix, checks both.
 *
 * ## The four carriers, and what keeps each claim live
 *
 * A claim is worth nothing unless something other than this script vouches for
 * the artifact carrying it. Three carriers have an oracle that executes; the
 * fourth has only reachability, and saying so is the point (`S0-9` `E5`):
 *
 *   - **a published negative** carries `must_fail[].falsifies`. The claim and
 *     the evidence are one object and cannot disagree, and each generator's own
 *     published-versus-asserted comparison already refuses a negative published
 *     and never run, or run and never published.
 *   - **a guard inside a generator** registers through `falsifies()` from
 *     scripts/lib/traceability.mjs and is published by `claims()`, which emits
 *     only what registered during that run. `pnpm vectors:check` regenerates and
 *     compares, so a guard that stops being called writes a file missing its
 *     claim. (The call sits inside the guard body for a reader's benefit; a
 *     mutation showed that moving it to the call site changes no result.)
 *   - **a test** carries `// falsifies:` above a `describe` or `it`, reconciled
 *     against the tests `vitest list` actually collects — not against the source
 *     text, which is the half that would agree with itself.
 *   - **a check script** carries `falsifies:` in its module docblock, and must
 *     be named in the command text reachable from `pnpm check` or `pnpm build`.
 *     **Reachability is not execution**: the expansion below does not model
 *     `&&` failure, so a script after an earlier exit is "reachable" without
 *     having run — which is exactly how the challenged tip's gate stopped at
 *     lint while this matrix said everything ran (`FU-14`). The claim here is
 *     narrowed to what the scan proves; the execution receipt is `S0-8`'s
 *     design to own.
 *
 * ## The population is not this file's to declare
 *
 * `S0-8`'s acceptance says **no shared producer inventory is the sole
 * completeness oracle**, which is the whole difficulty: a matrix that decides
 * which findings it is required to cover is always complete. So the population
 * is read three ways — the findings directory's own frontmatter,
 * `end-state-materiality.md`'s four class tables, and the seven action READMEs
 * plus `action-tree.md`'s repairs table — and all three must agree before
 * anything else is checked. Two of those are documents this remediation wrote;
 * the first is the review's record and predates it.
 *
 * ## What it cannot do
 *
 * It proves a falsifier exists, names the finding it refuses, and — for three
 * of the four carriers — that its liveness oracle holds; for a check script it
 * proves reachability only, as above. **It does not prove the falsifier
 * isolates.** A negative that refuses for a
 * second reason satisfies everything here and demonstrates nothing — which is
 * this project's recurring defect. `pnpm vectors:coverage` proves isolation for
 * AAD fields by eliding each one and requiring a negative to stop failing, and
 * the mutation batteries recorded in each action's Stage D cover the rest.
 * Those are different oracles on purpose; this one would pass if it were its
 * own.
 *
 * Usage: node scripts/check-traceability.mjs [--check]
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const at = (p) => ROOT + p;
const read = (p) => readFileSync(at(p), 'utf8');

const REMEDIATION = 'docs/review/remediation/';
const FINDINGS = 'docs/review/findings/';
const OUT = REMEDIATION + 'traceability.md';
const ACTIONS = ['S0-1', 'S0-2', 'S0-3', 'S0-4', 'S0-5', 'S0-6', 'S0-7'];

const failures = [];

/**
 * Findings with no executable falsifier, and who owes one.
 *
 * This is a declaration of debt, not a coverage claim, and it is the only place
 * the fact lives. An entry appears in the matrix as owed rather than as covered,
 * so a partial repair can be recorded honestly instead of having to be published
 * as a whole one to appear at all — which is what would happen if the only
 * expressible state were "has a falsifier".
 *
 * The list can only shrink. An entry that turns out to have a claim is a failure
 * below rather than a duplicate: it means the debt was paid and not struck.
 */
const OWED = [
  {
    finding: 'f-bd87655-x25519-support-floor-omitted',
    gate: 'S0-10',
    reason:
      'TRD §10.11 gained the fourth capability statement, its four exact `SubtleCrypto` operations and the absence behaviour, and the rule it states is a floor **with evidence and a date**. The dated table is deliberately empty: an asserted version row would be worse than the omission, and the source it needs is external to this repository. §10.11 makes the dated readback of the four operations a prerequisite of Stage 0 closure, so the debt blocks `S0-10` — this entry briefly said `L-4`, which `S0-9` recorded as the gate-assignment contradiction `FU-15`/`A-08`, resolved here in favour of the TRD.',
  },
  {
    finding: 'f-66a7c6a-journal-benchmark-overwrites-one-slot',
    gate: 'L-4',
    reason:
      'A later gate rather than a current defect, and repaired past what the gate asked: each benchmark write takes its own slot at a production-shaped occupancy, and the probe then found no material difference from the hot-key measurement it replaced. The append burst on a **declared device population** is what remains. `test/latency/journal-bench.ts` is a Playwright bench that no gate below `test:latency` runs, so a claim carried there would have no liveness oracle.',
  },
];

// --- 1. the population, read three ways --------------------------------------

/** @type {Map<string, {severity: string, status: string}>} */
const declared = new Map();
for (const file of readdirSync(at(FINDINGS))) {
  if (!file.startsWith('f-') || !file.endsWith('.md')) continue;
  const text = read(FINDINGS + file);
  const head = text.slice(0, text.indexOf('\n---', 4));
  const field = (k) => (new RegExp(`^${k}: (.*)$`, 'mu').exec(head) ?? [])[1];
  const id = field('id');
  if (id !== file.slice(0, -3)) {
    failures.push(`${FINDINGS}${file} declares id "${id}"; a finding's file name is its id.`);
    continue;
  }
  declared.set(id, { severity: field('severity'), status: field('status') });
}
if (declared.size === 0) {
  throw new Error('No findings were read; the population cannot be checked.');
}

const CLASSES = [
  ['design', '## Current design defects', '## Current closure/evidence defects'],
  ['closure', '## Current closure/evidence defects', '## Explicit later'],
  ['gate', '## Explicit later', '## Historical-only'],
  ['historical', '## Historical-only', '## Unresolved product choice'],
];
const materiality = read(REMEDIATION + 'end-state-materiality.md');
/** @type {Map<string, string>} */
const classOf = new Map();
for (const [name, from, to] of CLASSES) {
  const start = materiality.indexOf(from);
  const end = materiality.indexOf(to);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`end-state-materiality.md has no ${name} section; the classes cannot be read.`);
  }
  for (const m of materiality.slice(start, end).matchAll(/^\| `(f-[a-z0-9-]+)`/gmu)) {
    if (classOf.has(m[1])) failures.push(`${m[1]} is listed in two materiality classes.`);
    classOf.set(m[1], name);
  }
}

for (const id of declared.keys()) {
  if (!classOf.has(id)) failures.push(`${id} has a finding record and no materiality class.`);
}
for (const id of classOf.keys()) {
  if (!declared.has(id)) {
    failures.push(`${id} is classified in end-state-materiality.md and has no finding record.`);
  }
}

const idsIn = (text) => new Set([...text.matchAll(/`(f-[a-z0-9-]+)`/gu)].map((m) => m[1]));
const section = (text, heading) => {
  const start = text.indexOf(heading);
  if (start === -1) return null;
  const end = text.indexOf('\n## ', start + heading.length);
  return text.slice(start, end === -1 ? undefined : end);
};

/** Which action or direct repair owns each finding, from the plan's own tables. */
/** @type {Map<string, string[]>} */
const owners = new Map();
const own = (id, by) => owners.set(id, [...(owners.get(id) ?? []), by]);
for (const action of ACTIONS) {
  const block = section(
    read(`${REMEDIATION}${action}/README.md`),
    '## Findings this action must close',
  );
  if (block === null) {
    failures.push(`${action}/README.md has no "Findings this action must close" table.`);
    continue;
  }
  for (const id of idsIn(block)) own(id, action);
}
const tree = read(REMEDIATION + 'action-tree.md');
const repairs = section(tree, '## Repairs already applied on this branch');
if (repairs === null) {
  throw new Error('action-tree.md has no repairs table; ownership cannot be read.');
}
for (const id of idsIn(repairs)) own(id, 'direct');

const required = [...classOf].filter(([, c]) => c === 'design' || c === 'closure').map(([id]) => id);
for (const id of required) {
  if (!owners.has(id)) {
    failures.push(
      `${id} is a current ${classOf.get(id)} defect that no action README and no repairs row claims. ` +
        'Stage 0 cannot close over a finding nothing owns.',
    );
  }
}
for (const id of owners.keys()) {
  if (!declared.has(id)) failures.push(`The plan assigns an owner to ${id}, which is not a finding.`);
}

// --- 2. the claims, collected from the evidence -------------------------------

/**
 * @typedef {object} Claim
 * @property {string} finding
 * @property {string|null} gate The remainder's owner, when the claim is partial.
 * @property {'negative'|'guard'|'test'|'script'} kind
 * @property {string} what The falsifier, named as a reader would look for it.
 * @property {string} where The file it lives in.
 */
/** @type {Claim[]} */
const claims = [];
const parse = (raw) => {
  const [finding, gate] = raw.split(' -> ');
  return { finding, gate: gate ?? null };
};

const VECTORS = 'test/vectors/';
for (const file of readdirSync(at(VECTORS)).filter((f) => f.endsWith('.json'))) {
  const doc = JSON.parse(read(VECTORS + file));
  const source = doc.generated_by ?? VECTORS + file;
  for (const negative of doc.must_fail ?? []) {
    for (const raw of negative.falsifies ?? []) {
      claims.push({ ...parse(raw), kind: 'negative', what: negative.name, where: source });
    }
  }
  for (const [guard, held] of Object.entries(doc.falsifies ?? {})) {
    for (const raw of held) {
      claims.push({ ...parse(raw), kind: 'guard', what: guard, where: source });
    }
  }
}

const TESTS = 'test/';
const TAG = /^[ \t]*\/\/ falsifies: (.+)$\n[ \t]*(describe|it)(\.\w+)?\(\s*(['"`])(.*?)\4/gmu;
/** Any line offering itself as a claim, so one this scanner cannot attach is a failure. */
const ANY_TAG = /^[ \t]*(?:\/\/|\*) falsifies:/gmu;
/** @type {Map<string, Set<string>>} Test file to the titles it tags. */
const tagged = new Map();
for (const file of readdirSync(at(TESTS)).filter((f) => /\.test\.tsx?$/u.test(f))) {
  const src = read(TESTS + file);

  // A tag the pattern cannot attach must fail rather than disappear. `S0-1`
  // repaired this exact shape three times — a check that classifies by matching
  // a list silently passes whatever the list does not name — and a scanner that
  // skipped a detached `// falsifies:` would be the fourth, in the file whose
  // whole job is to notice that a claim has no evidence behind it.
  const offered = [...src.matchAll(ANY_TAG)].length;
  const attached = [...src.matchAll(TAG)].length;
  if (offered !== attached) {
    failures.push(
      `${TESTS}${file}: ${offered} line(s) offer a falsifier claim and ${attached} attach to a ` +
        '`describe` or `it` on the next line. A claim this scanner cannot attach is not a claim.',
    );
  }

  for (const m of src.matchAll(TAG)) {
    const [, raw, , modifier, , title] = m;
    // A claim on a skipped block is a claim about a test that does not run.
    // `vitest list` collects those anyway, so the source is the only place it
    // is visible.
    if (modifier !== undefined && /^\.(?:skip|todo|fails)$/u.test(modifier)) {
      failures.push(`${TESTS}${file}: "${title}" carries a claim and is ${modifier.slice(1)}.`);
    }
    tagged.set(TESTS + file, (tagged.get(TESTS + file) ?? new Set()).add(title));
    for (const one of raw.split(',')) {
      claims.push({ ...parse(one.trim()), kind: 'test', what: title, where: TESTS + file });
    }
  }
}

const SCRIPTS = 'scripts/';
for (const file of readdirSync(at(SCRIPTS)).filter((f) => f.endsWith('.mjs'))) {
  const src = read(SCRIPTS + file);
  const head = src.slice(0, src.indexOf('\n */\n'));
  const line = /^ \* falsifies: (.+)$/mu.exec(head);

  // Same rule as the tests, one carrier over: every offered claim is either
  // read or refused. A `falsifies:` docblock line in a generator is a claim
  // written in the wrong carrier — generators register through `falsifies()` so
  // the claim is published only if the guard ran — and one below the leading
  // docblock is out of the scanner's reach either way.
  const offered = [...src.matchAll(/^ \* falsifies:/gmu)].length;
  if (offered > 0 && !/^check-.*\.mjs$/u.test(file)) {
    failures.push(
      `${SCRIPTS}${file} carries a \`falsifies:\` docblock line, which is only read from a ` +
        '`check-*.mjs`. A generator registers claims through `falsifies()` instead, so the claim ' +
        'is published only if the guard ran.',
    );
    continue;
  }
  if (offered > (line === null ? 0 : 1)) {
    failures.push(
      `${SCRIPTS}${file}: ${offered} \`falsifies:\` line(s), and only one in the leading docblock ` +
        'is read. A claim below it is not a claim.',
    );
  }
  if (line === null) continue;
  for (const one of line[1].split(',')) {
    claims.push({ ...parse(one.trim()), kind: 'script', what: file, where: SCRIPTS + file });
  }
}

if (claims.length === 0) {
  throw new Error('No falsifier claims were found anywhere. The scan is broken, not the evidence.');
}

// --- 3. every claim names a finding, and is allowed to ------------------------

const definesGate = (name) => new RegExp(`^#+ .*\`${name}\``, 'mu').test(tree);

for (const claim of claims) {
  if (!declared.has(claim.finding)) {
    failures.push(`${claim.where} claims to falsify "${claim.finding}", which is not a finding.`);
    continue;
  }
  if (classOf.get(claim.finding) === 'historical') {
    failures.push(
      `${claim.where} claims to falsify ${claim.finding}, which end-state-materiality.md classifies ` +
        'as historical-only. Those are `H-1` ledger corrections with no surviving defect, and a ' +
        'falsifier for one asserts a repair the plan does not claim.',
    );
  }
  if (claim.gate !== null && !definesGate(claim.gate)) {
    failures.push(
      `${claim.where} owes ${claim.finding}'s remainder to "${claim.gate}", which action-tree.md ` +
        'does not define.',
    );
  }
}

// --- 4. every claimed artifact is wired into a gate that runs it --------------

const pkg = JSON.parse(read('package.json'));
const scripts = pkg.scripts ?? {};

/**
 * The transitive closure of what `pnpm check` and `pnpm build` name.
 *
 * Both are gates: `check` is the one this repository's own instructions call
 * before a commit, and `build` carries the two checks that only make sense
 * against built output. An artifact reachable from neither is evidence nobody
 * runs, which is the failure this whole file exists to make visible.
 *
 * The direction matters (`E5`): unreachable proves dead, but reachable does
 * not prove alive — this concatenation does not model `&&` failure, so a
 * command after an earlier non-zero exit is in the text and out of the run.
 * That is why every claim resting on this closure is published as
 * reachability, never as execution (`FU-14`; receipts at `S0-8`).
 */
const gated = (() => {
  const seen = new Set();
  const text = [];
  const expand = (name) => {
    if (seen.has(name) || scripts[name] === undefined) return;
    seen.add(name);
    text.push(scripts[name]);
    for (const m of scripts[name].matchAll(/(?:pnpm|npm run) ([\w:-]+)/gu)) expand(m[1]);
  };
  expand('check');
  expand('build');
  return text.join(' && ');
})();
if (!gated.includes('vitest') || !gated.includes('generate-suite-vectors.mjs')) {
  throw new Error('The gate expansion found neither the test run nor the generators; it is broken.');
}

const unique = new Map(claims.map((c) => [`${c.kind}::${c.where}::${c.what}`, c]));
for (const claim of unique.values()) {
  if (claim.kind === 'test') continue; // covered by the collection check below
  if (gated.includes(claim.where)) continue;
  failures.push(
    `${claim.where} carries a falsifier claim and neither \`pnpm check\` nor \`pnpm build\` reaches ` +
      'it. Evidence nothing runs proves nothing.',
  );
}

/** The tests the default run collects — neither the comment nor this file's reading of it. */
const collected = JSON.parse(
  execFileSync(at('node_modules/.bin/vitest'), ['list', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  }),
);
if (collected.length === 0) throw new Error('vitest collected no tests; liveness cannot be checked.');

/** @type {Map<string, Set<string>>} Test file to every `>`-separated title segment in it. */
const live = new Map();
for (const { name, file } of collected) {
  const rel = file.startsWith(ROOT) ? file.slice(ROOT.length) : file;
  const segments = live.get(rel) ?? new Set();
  for (const part of name.split(' > ')) segments.add(part);
  live.set(rel, segments);
}
for (const [file, titles] of tagged) {
  const segments = live.get(file);
  if (segments === undefined) {
    failures.push(`${file} carries falsifier claims and vitest collects nothing from it.`);
    continue;
  }
  for (const title of titles) {
    if (!segments.has(title)) {
      failures.push(
        `${file}: a claim is attached to "${title}", which vitest does not collect. The block was ` +
          'renamed, moved or filtered out, and the claim outlived it.',
      );
    }
  }
}

// --- 5. every required finding is covered, or declared owed -------------------

/** @type {Map<string, Claim[]>} */
const byFinding = new Map();
for (const claim of claims) {
  byFinding.set(claim.finding, [...(byFinding.get(claim.finding) ?? []), claim]);
}

const owed = new Map(OWED.map((o) => [o.finding, o]));
for (const entry of OWED) {
  if (!declared.has(entry.finding)) {
    failures.push(`The owed list names ${entry.finding}, which is not a finding.`);
  }
  const held = byFinding.get(entry.finding);
  if (held !== undefined) {
    failures.push(
      `${entry.finding} is declared owed to ${entry.gate} and carries ${held.length} falsifier ` +
        'claim(s). The debt was paid and the declaration was not struck.',
    );
  }
  if (!definesGate(entry.gate)) {
    failures.push(`${entry.finding} is owed to "${entry.gate}", which action-tree.md does not define.`);
  }
}
for (const id of required) {
  if (byFinding.has(id) || owed.has(id)) continue;
  failures.push(
    `${id} is a current ${classOf.get(id)} defect with no falsifier and no declared debt. Either an ` +
      'artifact claims it or the owed list says who owes one.',
  );
}

// --- 6. report, before anything is rendered ----------------------------------

if (failures.length > 0) {
  console.error(`traceability: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

// --- 7. the matrix -----------------------------------------------------------

const esc = (s) => s.replace(/\|/gu, '\\|');
const cite = (claim) => {
  const note = [
    claim.kind === 'script' ? null : claim.kind,
    claim.gate === null ? null : `remainder at \`${claim.gate}\``,
  ]
    .filter((n) => n !== null)
    .join(', ');
  return note === '' ? `\`${esc(claim.what)}\`` : `\`${esc(claim.what)}\` (${note})`;
};

const rowsFor = (ids) =>
  ids
    .map((id) => {
      const held = [...(byFinding.get(id) ?? [])].sort((a, b) => (a.what < b.what ? -1 : 1));
      const debt = owed.get(id);
      const where = [...new Set(held.map((c) => c.where))].sort();
      const evidence = debt
        ? `**Owed to \`${debt.gate}\`.** ${debt.reason}`
        : held.map(cite).join(' · ');
      const by = (owners.get(id) ?? ['—']).join(', ');
      const files = where.length === 0 ? '—' : where.map((w) => `\`${w}\``).join('<br>');
      return `| \`${id}\` | ${declared.get(id).severity} | ${by} | ${evidence} | ${files} |`;
    })
    .join('\n');

const HEAD =
  '| Finding | Severity | Repaired by | Falsifier | Where it lives |\n| --- | --- | --- | --- | --- |';
const inClass = (name) => required.filter((id) => classOf.get(id) === name);
const design = inClass('design');
const closure = inClass('closure');
const covered = (ids) => ids.filter((id) => byFinding.has(id)).length;
const extra = [...byFinding.keys()].filter((id) => !required.includes(id)).sort();
const outside = [...classOf]
  .filter(([, c]) => c === 'gate' || c === 'historical')
  .map(([id]) => id)
  .sort();
const gates = outside.filter((id) => classOf.get(id) === 'gate').length;

const counts = new Map();
for (const claim of claims) counts.set(claim.kind, (counts.get(claim.kind) ?? 0) + 1);

/**
 * The findings that rest on one named falsifier.
 *
 * Derived rather than judged, and reported because it is what a challenger
 * wants first. A single claim is not by itself thin — `check-wasm-seal.mjs` is
 * one claim over fifteen checks — but it is the shortest list of places where
 * losing one artifact loses the whole demonstration.
 */
const thin = required
  .filter((id) => (byFinding.get(id) ?? []).length === 1)
  .sort((a, b) => (a < b ? -1 : 1));

const beyond =
  extra.length === 0
    ? ''
    : `
## Repaired beyond the required population — ${extra.length}

Not current defects. They carry a falsifier because the repair that closed a neighbouring finding reached them,
and that is recorded rather than discarded.

${HEAD}
${rowsFor(extra)}
`;

const matrix = `# Traceability — every repaired finding to the falsifier that refuses it

**Standing:** projection — generated by \`scripts/check-traceability.mjs\`; \`pnpm trace:check\` regenerates and
compares, and a hand edit fails it.

<!-- Generated by scripts/check-traceability.mjs. Do not edit: \`pnpm trace:check\` regenerates this
     file and fails on any difference. Every claim lives at the evidence. -->

**Generated** by [\`check-traceability.mjs\`](../../../scripts/check-traceability.mjs) from claims carried by the
evidence itself. Editing it by hand will be overwritten and will fail \`pnpm trace:check\`.

\`P-5\`'s \`RC-8C\` is why it is generated rather than written: **one home per fact; every consumer reads the
home; where two artifacts must agree, the agreement is checked in both directions by something that is neither
of them.** A written matrix is a second copy of every mapping, and this repository has already shipped an
inventory that went stale under a green check — \`f-992bc91-network-carrier-registry-stale\`. So a falsifier
names the finding it refuses, in the file that runs, and this table is read back out.

**What it proves, per carrier.** Every finding below has at least one artifact that names it. For a published
negative or a generator guard, the claim is live under the generator's own published-versus-asserted comparison
and the regeneration diff \`pnpm vectors:check\` performs; for a test, under the test list \`vitest list\`
actually collects. **For a check script it proves strictly less: the script is named in command text reachable
from \`pnpm check\` or \`pnpm build\` — reachability, not execution** (\`FU-14\`/\`E5\`: at the challenged tip
the gate exited at lint while this paragraph said everything still ran; the execution receipt is \`S0-8\`'s
design, and until it lands this claim is exactly this small).

**What it does not prove is that a falsifier isolates.** A negative that refuses for a second reason satisfies
everything here and demonstrates nothing — this project's recurring defect. \`pnpm vectors:coverage\` proves
isolation for AAD fields by eliding each one and requiring a negative to stop failing; the mutation batteries
recorded in each action's Stage D cover the rest. Those are deliberately different oracles.

> ### Five more limits, found by \`S0-9\`'s independent challengers and not yet repaired
>
> Read every row below with these in mind. They are recorded here rather than in a report because this is the
> document a reader reaches for, and it was overclaiming.
>
> 1. **Relation is not checked.** A claim naming an unrelated negative passes — tagging \`flipped-tag-bit\` as the
>    sequence allocator's falsifier is accepted.
> 2. **Recency is not checked.** Six of the claims below name negatives that ran unchanged at the reviewed tip,
>    passing *while the defect existed*. Their only diff on this branch is the tag itself.
> 3. **A check-script claim survives the script being gutted.** Reachability from a gate is not liveness, and
>    three of the single-falsifier findings rest wholly on that carrier.
> 4. **The scan is not recursive.** A claim under \`test/geometry/\` or \`scripts/lib/\` is invisible, at exit 0.
> 5. **Nothing pins the population.** Deleting a finding from all four sources regenerates green with a smaller
>    denominator.
>
> Disposition: [\`S0-9/DISPOSITION.md\`](./S0-9/DISPOSITION.md). Until these are repaired, a row here means *an
> artifact names this finding and its liveness oracle holds — reachability only, for a check script* — not that
> the finding is closed.

## The population is read, not declared

| Source | What it states | Count |
| --- | --- | --- |
| \`docs/review/findings/*.md\` | the review's own records, one file per finding | ${declared.size} |
| [\`end-state-materiality.md\`](./end-state-materiality.md) | four closure-effect classes | ${classOf.size} — ${design.length} design · ${closure.length} closure · ${gates} gates · ${outside.length - gates} historical |
| the seven \`S0-*/README.md\` tables and [\`action-tree.md\`](./action-tree.md)'s repairs row | who owns each repair | ${owners.size} |

All three must agree before anything below is checked, because a matrix that decides its own population is
always complete. **${design.length + closure.length} findings are current design or closure defects and therefore require a falsifier.**
${covered(design) + covered(closure)} carry one; ${OWED.filter((o) => required.includes(o.finding)).length} is declared owed.

## Current design defects — ${covered(design)} of ${design.length} carry a falsifier

${HEAD}
${rowsFor(design)}

## Current closure and evidence defects — ${covered(closure)} of ${closure.length} carry a falsifier

${HEAD}
${rowsFor(closure)}
${beyond}
## Outside the required population — ${outside.length}

Neither owed a falsifier nor silently dropped. Later gates are repaired when their gate arrives; historical-only
corrections have no surviving defect to falsify and belong to \`H-1\`'s append-only ledger — which is why a claim
naming one of them is a failure here rather than a bonus.

| Finding | Class | State |
| --- | --- | --- |
${outside
  .map((id) => {
    const debt = owed.get(id);
    const state =
      debt !== undefined
        ? `Owed to \`${debt.gate}\`.`
        : classOf.get(id) === 'gate'
          ? 'Waiting at its gate.'
          : '`H-1` ledger correction.';
    return `| \`${id}\` | ${classOf.get(id)} | ${state} |`;
  })
  .join('\n')}

## The claims themselves

${claims.length} claims across ${new Set(claims.map((c) => c.where)).size} files — ${[...counts]
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([k, n]) => `${n} ${k}`)
  .join(' · ')}.

| Carrier | Where the claim is written | What keeps the claim live |
| --- | --- | --- |
| a published negative | \`must_fail[].falsifies\` in the vector file, so the claim and the evidence are one object | the generator's published-versus-asserted comparison, in both directions |
| a guard inside a generator | \`falsifies()\`, published by \`claims()\`, which emits only what registered during that run | \`pnpm vectors:check\` regenerates and compares, so a guard that stops being called writes a file missing its claim |
| a test | \`// falsifies:\` above a \`describe\` or \`it\` | \`vitest list\` — the tests the default run collects, not the source text |
| a check script | \`falsifies:\` in the module docblock | the script is named in command text reachable from \`pnpm check\` or \`pnpm build\` — reachability, not an execution receipt (\`FU-14\`, \`S0-8\`) |

### Where one artifact carries the whole demonstration

${thin.length} of the ${design.length + closure.length} current defects resolve to a single named falsifier. That is not the same as thin evidence — one
check script can hold fifteen assertions — but it is the shortest list of places where losing one artifact
loses the finding, so it is where a challenge gets the most leverage.

${thin.map((id) => `- \`${id}\` (${declared.get(id).severity}) — ${cite(byFinding.get(id)[0])} in \`${byFinding.get(id)[0].where}\``).join('\n')}
`;

const settled = covered(design) + covered(closure);
const total = design.length + closure.length;

if (process.argv.includes('--check')) {
  let existing = null;
  try {
    existing = read(OUT);
  } catch {
    existing = null;
  }
  if (existing !== matrix) {
    console.error(`${OUT} is stale. Run: node scripts/check-traceability.mjs`);
    process.exit(1);
  }
  console.log(
    `traceability: ${claims.length} claims, ${settled} of ${total} current defects carry a named falsifier, ` +
      `${OWED.length} declared owed. ${OUT} is current.`,
  );
} else {
  writeFileSync(at(OUT), matrix);
  console.log(
    `Wrote ${OUT}: ${claims.length} claims over ${byFinding.size} findings, ` +
      `${settled} of ${total} current defects carry a named falsifier.`,
  );
}
