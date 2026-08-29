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
 * the artifact carrying it. Since the `S0-8` regeneration, all four carriers
 * have an oracle that executes:
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
 *   - **a check script** carries `falsifies:` in its module docblock, is named
 *     in the command text reachable from `pnpm check` or `pnpm build` (the
 *     wiring), and is credited only by its **execution receipt**
 *     (scripts/lib/receipts.mjs): present, passing, written by the script's
 *     current bytes, against the current tree. Reachability was the whole
 *     credit once, and the gate exiting at lint while this matrix said
 *     everything ran is how that was convicted (`FU-14`/`E5`; `P-5` falsifier
 *     20 made execution the floor). A receipt from an edited script, or from
 *     yesterday's tree, fails rather than crediting.
 *
 * ## The population is not this file's to declare — and it is pinned
 *
 * `S0-8`'s acceptance says **no shared producer inventory is the sole
 * completeness oracle**, which is the whole difficulty: a matrix that decides
 * which findings it is required to cover is always complete. So the population
 * is read three ways — the findings directory's own frontmatter and
 * `end-state-materiality.md`'s four class tables (scripts/lib/findings.mjs,
 * shared with check-debts.mjs), and the seven action READMEs plus
 * `action-tree.md`'s repairs table — and all three must agree before anything
 * else is checked. The denominator is pinned in `census.json`
 * (`findings_population`), because round 1 demonstrated that deleting a finding
 * from every source regenerated green with a smaller population (limit 5); now
 * that fails until the pin is restated deliberately.
 *
 * ## Recency: evidence that passed while the defect existed proves no repair
 *
 * Round 1's limit 2: six claims named negatives that ran unchanged at the
 * reviewed tip — green *while the defect existed* — their only diff on this
 * branch being the tag itself. Every claim is now compared against the reviewed
 * tip (`9edd930`): a published negative byte-identical there (tags aside), a
 * claim-carrying test file unchanged there, or a check script unchanged there,
 * fails — the evidence predates every repair on this branch and cannot
 * demonstrate one. A tagged test *title* that already existed at the reviewed
 * tip in a since-changed file passes and is listed in the matrix, because
 * block-level history is not cheaply decidable — that boundary is printed, not
 * hidden. This also refuses limit 1's demonstrated relation mutation (tagging a
 * reviewed-tip negative as some other finding's falsifier); a *new* artifact
 * deliberately mis-tagged by its author remains outside every static oracle
 * here — isolation identity (`pnpm vectors:coverage`), the per-return mutation
 * batteries, and the challenge rounds are that oracle.
 *
 * ## The owed rows are the debt manifest's
 *
 * The `OWED` list that lived here grew into `docs/review/remediation/debts.json`
 * (`RC-9A`, ratified 2026-08-28): every deferred property is one registered
 * debt with owner, one blocking gate, required artifact, falsifier, expiry and
 * hashed inputs, validated by `pnpm debts:check`. This file reads the manifest
 * for its owed rows and keeps the vacuity guard: a debt whose finding carries a
 * falsifier claim fails as paid-and-not-struck — unless every such claim is
 * partial with its declared remainder at the debt's own gate, which is the
 * divisible-duty case (`RC-9`'s wasm binding: freshness falsified now,
 * provenance registered at `L-4`).
 *
 * ## What it cannot do
 *
 * It proves a falsifier exists, names the finding it refuses, its liveness
 * oracle holds, and its evidence postdates the reviewed tip. **It does not
 * prove the falsifier isolates.** A negative that refuses for a second reason
 * satisfies everything here and demonstrates nothing — which is this project's
 * recurring defect. `pnpm vectors:coverage` proves isolation for AAD fields by
 * eliding each one and requiring the declared negative — identity, not arity —
 * to stop failing, and the mutation batteries recorded in each action's Stage D
 * cover the rest. Those are different oracles on purpose; this one would pass
 * if it were its own.
 *
 * Usage: node scripts/check-traceability.mjs [--check]
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MANIFEST, loadManifest } from './lib/debts.mjs';
import { readFindings } from './lib/findings.mjs';
import { installReceipt, readReceipt, treeDigest } from './lib/receipts.mjs';

installReceipt(import.meta.url);

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const at = (p) => ROOT + p;
const read = (p) => readFileSync(at(p), 'utf8');

const REMEDIATION = 'docs/review/remediation/';
const OUT = REMEDIATION + 'traceability.md';
const ACTIONS = ['S0-1', 'S0-2', 'S0-3', 'S0-4', 'S0-5', 'S0-6', 'S0-7'];

/** The tip the review reviewed. Evidence unchanged since then passed while every current defect existed. */
const REVIEWED_TIP = '9edd9300adebcec3abd2234c946f1dcccdc17eef';

const failures = [];

/**
 * The registered debts — the manifest `RC-9A` grew from this file's old `OWED`
 * list, which was, per its own docblock, a declaration of debt and not a
 * coverage claim. The declaration now carries the ratified fields and lives in
 * one home; `pnpm debts:check` validates it, and this file only consumes it:
 * a required-class debt renders as owed, a gate-class debt renders as
 * registered, and the vacuity guard below still refuses paid-and-not-struck.
 */
const DEBTS = loadManifest(ROOT);

// --- 1. the population, read three ways and pinned ----------------------------

const population = readFindings(ROOT);
failures.push(...population.failures);
const { declared, classOf } = population;

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
 * @property {string} [vector] For a negative or guard: the published vector file.
 * @property {object} [entry] For a negative: the published entry, for the recency diff.
 */
/** @type {Claim[]} */
const claims = [];
const parse = (raw) => {
  const [finding, gate] = raw.split(' -> ');
  return { finding, gate: gate ?? null };
};

/**
 * Every scan below walks its directory recursively (round 1, limit 4: all
 * three `readdirSync` calls were non-recursive, so a tag under `test/geometry/`
 * or `scripts/lib/` vanished at exit 0). A claim in a file the carrier rules do
 * not admit now fails loudly instead of being unreadable.
 */
const walk = (dir, keep) =>
  readdirSync(at(dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && keep(entry.name))
    .map((entry) => `${entry.parentPath}/${entry.name}`.slice(at(dir).length).replace(/^\/+/u, ''))
    .sort();

const VECTORS = 'test/vectors/';
for (const file of readdirSync(at(VECTORS)).filter((f) => f.endsWith('.json'))) {
  const doc = JSON.parse(read(VECTORS + file));
  const source = doc.generated_by ?? VECTORS + file;
  for (const negative of doc.must_fail ?? []) {
    for (const raw of negative.falsifies ?? []) {
      claims.push({
        ...parse(raw),
        kind: 'negative',
        what: negative.name,
        where: source,
        vector: VECTORS + file,
        entry: negative,
      });
    }
  }
  for (const [guard, held] of Object.entries(doc.falsifies ?? {})) {
    for (const raw of held) {
      claims.push({ ...parse(raw), kind: 'guard', what: guard, where: source, vector: VECTORS + file });
    }
  }
}

const TESTS = 'test/';
const TAG = /^[ \t]*\/\/ falsifies: (.+)$\n[ \t]*(describe|it)(\.\w+)?\(\s*(['"`])(.*?)\4/gmu;
/** Any line offering itself as a claim, so one this scanner cannot attach is a failure. */
const ANY_TAG = /^[ \t]*(?:\/\/|\*) falsifies:/gmu;
/** @type {Map<string, Set<string>>} Test file to the titles it tags. */
const tagged = new Map();
for (const file of walk(TESTS, (name) => /\.(?:ts|tsx|mjs)$/u.test(name) && !name.endsWith('.json'))) {
  const src = read(TESTS + file);
  const offered = [...src.matchAll(ANY_TAG)].length;

  // A claim outside a `*.test.ts(x)` file has no oracle: vitest collects
  // nothing from a helper, a scheduler, or a Playwright spec, so a tag there
  // would be a claim about evidence no gate observes. It fails rather than
  // being unreadable — the recursive-scan repair is only a repair if what the
  // carrier rules do not admit is refused instead of skipped.
  if (!/\.test\.tsx?$/u.test(file)) {
    if (offered > 0) {
      failures.push(
        `${TESTS}${file} offers ${offered} falsifier claim(s) and is not a *.test file vitest ` +
          'collects. A claim with no liveness oracle is not a claim; move it to the evidence.',
      );
    }
    continue;
  }

  // A tag the pattern cannot attach must fail rather than disappear. `S0-1`
  // repaired this exact shape three times — a check that classifies by matching
  // a list silently passes whatever the list does not name — and a scanner that
  // skipped a detached `// falsifies:` would be the fourth, in the file whose
  // whole job is to notice that a claim has no evidence behind it.
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
for (const file of walk(SCRIPTS, (name) => name.endsWith('.mjs'))) {
  const src = read(SCRIPTS + file);
  const head = src.slice(0, src.indexOf('\n */\n'));
  const line = /^ \* falsifies: (.+)$/mu.exec(head);

  // Same rule as the tests, one carrier over: every offered claim is either
  // read or refused. A `falsifies:` docblock line in a generator is a claim
  // written in the wrong carrier — generators register through `falsifies()` so
  // the claim is published only if the guard ran — and one in `scripts/lib/`,
  // or below the leading docblock, is out of every oracle's reach either way.
  const offered = [...src.matchAll(/^ \* falsifies:/gmu)].length;
  if (offered > 0 && !/^check-[a-z-]+\.mjs$/u.test(file)) {
    failures.push(
      `${SCRIPTS}${file} carries a \`falsifies:\` docblock line, which is only read from a ` +
        'top-level `check-*.mjs`. A generator registers claims through `falsifies()` instead, so ' +
        'the claim is published only if the guard ran; a library has no gate of its own.',
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
 * The wiring check keeps the dead direction; the execution receipts below
 * close the live one (`FU-14`'s repair): a script-carrier claim is credited
 * only by a receipt its current bytes wrote against the current tree.
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

/**
 * The execution receipts (`FU-14`'s repair; `P-5` falsifier 20's rule). A
 * script-carrier claim is credited only when the script's receipt says it
 * executed and passed, was written by the script's current bytes, and ran
 * against the current tree — `pnpm check` mints every receipt before this, its
 * last step, reads them, and `pnpm build` mints the two build-gate ones inside
 * `test:geometry`'s web server. A receipt from an edited script or another
 * tree fails: crediting yesterday's run against today's state is exactly the
 * claim shape the challenged tip's green matrix was convicted of.
 */
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const nowTree = treeDigest();
for (const claim of [...unique.values()].filter((c) => c.kind === 'script')) {
  const receipt = readReceipt(claim.what);
  if (receipt === null) {
    failures.push(
      `${claim.where} carries a falsifier claim and has no execution receipt (.receipts/). ` +
        'Reachability is not execution (FU-14): run `pnpm check` (or `pnpm build` for the build ' +
        'checks) so the claim is credited by a run, then re-run this.',
    );
    continue;
  }
  if (!receipt.ok) {
    failures.push(
      `${claim.where}'s last receipted execution FAILED (${receipt.finished}). A failing falsifier ` +
        'demonstrates the defect, not the repair; fix it and re-run the gate.',
    );
    continue;
  }
  if (receipt.script_sha256 !== sha256(read(claim.where))) {
    failures.push(
      `${claim.where} changed since its receipt (${receipt.finished}). A receipt credits the bytes ` +
        'that ran, not the file that now exists — the gutted-script claim, refused. Re-run the gate.',
    );
    continue;
  }
  if (receipt.tree.head !== nowTree.head || receipt.tree.dirty_sha256 !== nowTree.dirty_sha256) {
    failures.push(
      `${claim.where}'s receipt was written against another tree (${receipt.tree.head.slice(0, 12)}…, ` +
        `${receipt.finished}); the tree has changed since it ran. Re-run the gate so the credit is an ` +
        'execution against this state.',
    );
  }
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

// --- 5. recency: evidence must postdate the reviewed tip ----------------------

/**
 * Round 1's limit 2, made a rule: a falsifier that ran unchanged at the
 * reviewed tip passed *while the defect existed*, so it cannot demonstrate the
 * repair — its tag is a claim about evidence the defect never disturbed. Each
 * claim's artifact is compared to `git show <reviewed tip>`: negatives at the
 * entry (tags aside), tests and check scripts at the file. A tagged title that
 * existed at the tip inside a since-changed file is the boundary of what file
 * history decides cheaply; those are printed in the matrix, never silent.
 */
const gitAt = (path) => {
  try {
    return execFileSync('git', ['-C', ROOT, 'show', `${REVIEWED_TIP}:${path}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null; // the path did not exist at the tip: the evidence is new
  }
};
const oldTextCache = new Map();
const oldText = (path) => {
  if (!oldTextCache.has(path)) oldTextCache.set(path, gitAt(path));
  return oldTextCache.get(path);
};
const canonical = (v) => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
};
const untagged = (entry) => {
  const { falsifies: _f, isolates: _i, ...rest } = entry;
  return rest;
};

/** @type {Claim[]} Tagged titles that predate the tip in files that changed since. */
const predates = [];
for (const claim of unique.values()) {
  if (claim.kind === 'negative') {
    const old = oldText(claim.vector);
    if (old === null) continue;
    const oldEntry = (JSON.parse(old).must_fail ?? []).find((n) => n.name === claim.what);
    if (oldEntry !== undefined && canonical(untagged(oldEntry)) === canonical(untagged(claim.entry))) {
      failures.push(
        `${claim.vector}: "${claim.what}" is identical (tags aside) at the reviewed tip — it passed ` +
          `while ${claim.finding} existed, so it cannot demonstrate the repair; only the tag is new.`,
      );
    }
  } else if (claim.kind === 'guard') {
    const old = oldText(claim.vector);
    if (old === null) continue;
    const held = JSON.parse(old).falsifies?.[claim.what];
    if (Array.isArray(held) && held.some((raw) => raw.startsWith(claim.finding))) {
      failures.push(
        `${claim.vector}: guard "${claim.what}" already claimed ${claim.finding} at the reviewed tip; ` +
          'a claim that predates the branch demonstrates nothing about its repairs.',
      );
    }
  } else {
    const old = oldText(claim.where);
    if (old === null) continue;
    if (old === read(claim.where)) {
      failures.push(
        `${claim.where} is byte-identical at the reviewed tip and carries a claim for ` +
          `${claim.finding} — evidence unchanged since the defective tip passed while the defect ` +
          'existed and cannot demonstrate its repair.',
      );
    } else if (claim.kind === 'test' && old.includes(claim.what)) {
      predates.push(claim);
    }
  }
}

// --- 6. every required finding is covered, or a registered debt ---------------

/** @type {Map<string, Claim[]>} */
const byFinding = new Map();
for (const claim of claims) {
  byFinding.set(claim.finding, [...(byFinding.get(claim.finding) ?? []), claim]);
}

/**
 * The vacuity guard, over the manifest instead of the old local list (which
 * `RC-9A` grew into `debts.json`; `pnpm debts:check` validates the entries
 * themselves). Paid-and-not-struck stays a failure here, with one carve-out
 * the ratification defines: a claim declared partial at exactly the debt's own
 * gate is the divisible-duty case — the falsified half and the registered
 * remainder are two homes of one split, and they must agree on the gate.
 */
const owed = new Map(DEBTS.map((d) => [d.finding, d]));
for (const debt of DEBTS) {
  if (!declared.has(debt.finding)) {
    failures.push(`${MANIFEST} names ${debt.finding}, which is not a finding.`);
    continue;
  }
  const overreach = (byFinding.get(debt.finding) ?? []).filter((c) => c.gate !== debt.gate);
  if (overreach.length > 0) {
    failures.push(
      `${debt.finding} is a registered debt at ${debt.gate} and carries ${overreach.length} falsifier ` +
        `claim(s) not declared partial at that gate (${overreach.map((c) => `"${c.what}"`).join(', ')}). ` +
        'Either the debt was paid and not struck, or a claim credits more than the registered split allows.',
    );
  }
  if (!definesGate(debt.gate)) {
    failures.push(`${debt.finding} is owed to "${debt.gate}", which action-tree.md does not define.`);
  }
}
for (const id of required) {
  if (byFinding.has(id) || owed.has(id)) continue;
  failures.push(
    `${id} is a current ${classOf.get(id)} defect with no falsifier and no registered debt. Either an ` +
      `artifact claims it or ${MANIFEST} says who owes one.`,
  );
}

// --- 7. report, before anything is rendered ----------------------------------

if (failures.length > 0) {
  console.error(`traceability: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

// --- 8. the matrix -----------------------------------------------------------

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
      // A finding can carry both: the falsified half of a divisible duty, and
      // the registered remainder. Render both — the split is the point.
      const evidence = [
        ...held.map(cite),
        ...(debt === undefined
          ? []
          : [
              debt.status === 'paid'
                ? `**Registered debt \`${debt.id}\`, paid ${debt.payment_record?.date}** (\`${debt.payment_record?.kind}\`) in [\`debts.json\`](./debts.json); it blocked \`${debt.gate}\` until payment. ${esc(debt.property)}`
                : `**Owed to \`${debt.gate}\`** — registered debt \`${debt.id}\` in [\`debts.json\`](./debts.json) (owner: ${esc(debt.owner)}; expires ${debt.expiry}). ${esc(debt.property)}`,
            ]),
      ].join(' · ');
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
actually collects; **for a check script, under its execution receipt** (\`.receipts/\`,
\`scripts/lib/receipts.mjs\`): the script executed and passed, the receipt was written by the script's current
bytes, and it ran against the current tree — \`pnpm check\` mints every receipt before \`trace:check\`, its
last step, reads them. Reachability in command text was this carrier's whole credit once, and the gate exiting
at lint while this paragraph said everything ran is how that was convicted (\`FU-14\`/\`E5\`; \`P-5\` falsifier
20 made execution the floor). And every claim survives a recency comparison against the reviewed tip
\`${REVIEWED_TIP.slice(0, 7)}\`: evidence identical there passed *while the defect existed* and is refused.

**What it does not prove is that a falsifier isolates.** A negative that refuses for a second reason satisfies
everything here and demonstrates nothing — this project's recurring defect. \`pnpm vectors:coverage\` proves
isolation for AAD fields by eliding each one and requiring exactly the negative that declares that field —
identity, not arity — to stop failing; the mutation batteries recorded in each action's Stage D cover the rest.
Those are deliberately different oracles.

> ### The five limits \`S0-9\` found, and where each stands since the \`S0-8\` regeneration
>
> Recorded here rather than in a report because this is the document a reader reaches for, and it was
> overclaiming. Disposition: [\`S0-9/DISPOSITION.md\`](./S0-9/DISPOSITION.md).
>
> 1. **Relation** — repaired at its checkable faces, and the residue is stated. The recency rule refuses the
>    demonstrated mutation (tagging a reviewed-tip negative as another finding's falsifier now fails, because
>    such a negative predates every repair); an \`isolates\`-declaring negative is bound to its field by the
>    cipher (\`pnpm vectors:coverage\`). A **new** artifact deliberately mis-tagged by its author is outside
>    every static oracle here — the mutation batteries and the challenge rounds are that oracle, and a row
>    below still does not mean *closed*.
> 2. **Recency** — repaired. Every claim is compared against the reviewed tip: a negative identical there
>    (tags aside), or a claim-carrying test file or check script unchanged there, fails. The stated boundary:
>    a tagged *title* that existed at the tip inside a since-changed file passes and is listed below.
> 3. **Check-script liveness** — repaired by the execution receipts above: a gutted or edited script no longer
>    keeps its claim, because the receipt binds the bytes that ran; assertion strength stays the batteries'.
> 4. **The recursive scan** — repaired. All three scans walk their directories recursively, and a claim in a
>    file the carrier rules do not admit (a helper, \`scripts/lib/\`, a Playwright spec) fails loudly.
> 5. **The population pin** — repaired. \`census.json\` pins the findings count and id hash; deleting a finding
>    from every source now fails every consumer until the pin is restated deliberately.

## The population is read, not declared

| Source | What it states | Count |
| --- | --- | --- |
| \`docs/review/findings/*.md\` | the review's own records, one file per finding | ${declared.size} |
| [\`end-state-materiality.md\`](./end-state-materiality.md) | four closure-effect classes | ${classOf.size} — ${design.length} design · ${closure.length} closure · ${gates} gates · ${outside.length - gates} historical |
| the seven \`S0-*/README.md\` tables and [\`action-tree.md\`](./action-tree.md)'s repairs row | who owns each repair | ${owners.size} |

All three must agree before anything below is checked, because a matrix that decides its own population is
always complete — and the denominator is pinned (\`census.json\`'s \`findings_population\`: ${declared.size} ids), so a
finding deleted from every source fails rather than shrinking the population (limit 5, repaired).
**${design.length + closure.length} findings are current design or closure defects and therefore require a falsifier.**
${covered(design) + covered(closure)} carry one; ${DEBTS.filter((d) => required.includes(d.finding)).length} is a registered debt in [\`debts.json\`](./debts.json).

## Current design defects — ${covered(design)} of ${design.length} carry a falsifier

${HEAD}
${rowsFor(design)}

## Current closure and evidence defects — ${covered(closure)} of ${closure.length} carry a falsifier

${HEAD}
${rowsFor(closure)}
${beyond}
## Outside the required population — ${outside.length}

Neither owed a falsifier nor silently dropped. Every *Explicit later* finding is a registered debt in
[\`debts.json\`](./debts.json) — owner, one blocking gate, required artifact, falsifier, expiry, hashed inputs —
whose gate blocks while it is unmet (\`pnpm debts\`, \`RC-9A\`); historical-only corrections have no surviving
defect to falsify and belong to \`H-1\`'s append-only ledger — which is why a claim naming one of them is a
failure here rather than a bonus.

| Finding | Class | State |
| --- | --- | --- |
${outside
  .map((id) => {
    const debt = owed.get(id);
    const state =
      debt !== undefined
        ? debt.status === 'paid'
          ? `Registered debt \`${debt.id}\` — **paid ${debt.payment_record?.date}** (\`${debt.payment_record?.kind}\`); it blocked \`${debt.gate}\` until payment, and the observation expires ${debt.payment_record?.expiry ?? debt.expiry}.`
          : debt.status === 'waived'
            ? `Registered debt \`${debt.id}\` — waived until ${debt.waiver?.expiry} by ${debt.waiver?.authority} (waived is not paid); blocks \`${debt.gate}\` again on expiry.`
            : `Registered debt \`${debt.id}\` — blocks \`${debt.gate}\`, expires ${debt.expiry}.`
        : classOf.get(id) === 'gate'
          ? 'UNREGISTERED — pnpm debts:check refuses this state.'
          : '`H-1` ledger correction.';
    return `| \`${id}\` | ${classOf.get(id)} | ${state} |`;
  })
  .join('\n')}

${
  predates.length === 0
    ? ''
    : `## Tagged titles that predate the reviewed tip — ${predates.length}

The recency rule's stated boundary: these \`describe\`/\`it\` titles already existed at \`${REVIEWED_TIP.slice(0, 7)}\`,
inside files that have changed since. File history proves the file moved, not that the block did; whether the
assertions behind these titles strengthened is the batteries' and the challenge's subject, and hiding the list
would be the overclaim this document was convicted of.

${predates
  .sort((a, b) => (a.where + a.what < b.where + b.what ? -1 : 1))
  .map((c) => `- \`${esc(c.what)}\` in \`${c.where}\` (claims \`${c.finding}\`)`)
  .join('\n')}

`
}## The claims themselves

${claims.length} claims across ${new Set(claims.map((c) => c.where)).size} files — ${[...counts]
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([k, n]) => `${n} ${k}`)
  .join(' · ')}.

| Carrier | Where the claim is written | What keeps the claim live |
| --- | --- | --- |
| a published negative | \`must_fail[].falsifies\` in the vector file, so the claim and the evidence are one object | the generator's published-versus-asserted comparison, in both directions |
| a guard inside a generator | \`falsifies()\`, published by \`claims()\`, which emits only what registered during that run | \`pnpm vectors:check\` regenerates and compares, so a guard that stops being called writes a file missing its claim |
| a test | \`// falsifies:\` above a \`describe\` or \`it\` | \`vitest list\` — the tests the default run collects, not the source text |
| a check script | \`falsifies:\` in the module docblock | wired into \`pnpm check\`'s or \`pnpm build\`'s command text **and** credited by its execution receipt — present, passing, written by the current bytes against the current tree (\`FU-14\`, repaired at the \`S0-8\` regeneration) |

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
      `${DEBTS.length} registered debts. Script claims credited by execution receipts; recency held against ` +
      `${REVIEWED_TIP.slice(0, 7)}. ${OUT} is current.`,
  );
} else {
  writeFileSync(at(OUT), matrix);
  console.log(
    `Wrote ${OUT}: ${claims.length} claims over ${byFinding.size} findings, ` +
      `${settled} of ${total} current defects carry a named falsifier.`,
  );
}
