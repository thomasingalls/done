/**
 * The remediation corpus census, and its computed status projection (`P-5`
 * ratified 2026-08-28, option A at both joints; built at the `S0-1` return).
 *
 * Both `S0-9` rounds convicted the remediation by its own rule: `RC-8C` was
 * ratified saying *every* fact and enforced over the corpus under review alone,
 * so the remediation's own documents — one of them an exact challenge input —
 * kept publishing decided-away content while every checker stayed green
 * (`FU-07`). The ratified repair is a census that is total by construction:
 * **every markdown document under docs/review/remediation/ declares its
 * standing from an exhaustive enum — `home | projection | record | superseded`
 * — and this walker refuses what it cannot classify.** A classification that
 * drops what it does not recognise cannot fail, it can only pass; that argument
 * has now been bought six times in this program, and this is its corpus form.
 *
 * What each standing obliges (P-5 falsifiers 16–19):
 *
 *   - **home** — the one current home of a fact. Names the readback that checks
 *     it: at least one `pnpm <script>` on the standing line, each of which must
 *     exist in package.json.
 *   - **projection** — regenerated from homes, never edited. Names its
 *     generator, which must exist on disk.
 *   - **record** — a dated report about the corpus at a commit. Names the full
 *     SHA it speaks of, which must exist and be an ancestor of HEAD (the
 *     `FU-16` shape made permanent), is pinned by content hash in
 *     `census.json`, and takes edits only as dated addenda under a re-pin.
 *   - **superseded** — no longer current. Opens with its successors before any
 *     old content, and every named successor must resolve.
 *
 * The walker doubles as the **computed status projection** — the
 * `review-status.mjs` shape, whose docblock calls itself a projection: it
 * parses each decision record's header (`Decided`/`Drafted`, `Ratified`,
 * `Status`), computes what is ratified and what each return owes, and checks
 * both directions against `HANDOFF.md`'s per-decision claims (P-5 falsifier
 * 22). The compared facets are the ratification **date**, the ratified
 * **option letter**, and the **owed falsifier ranges** — the option joined at
 * the `S0-9` round-3 return (`R3-1`), which demonstrated HANDOFF asserting a
 * different option than the record ratified with every gate check green,
 * because only the date was compared. Prose beyond those facets is not
 * compared, and the printed line says exactly that much. The queue's *order*
 * stays HANDOFF's alone — nothing here asserts a sequence.
 *
 * Two instance rules, stated because they are instances and not totality:
 *
 *   - the `FU-07` reproduction is refused by name: `corrected-end-state.md`
 *     must stand `superseded` with its header opening the file, and the `S0-9`
 *     node's input list must not name it — nor any record or superseded
 *     document — as a current input (falsifiers 15, 18);
 *   - the two sentences the rounds convicted of overclaiming
 *     (`status:check`'s and `trace:check`'s, `E4`/`E5`) are refused as byte
 *     rules if restored (falsifier 21). These are permanent negatives against
 *     named defects, not a semantic audit of every printed claim.
 *
 * **What a green run means, exactly:** every document is classified, the pins
 * are byte-current, the named readbacks exist as package scripts, and the
 * status homes agree. Existence and byte rules — never an execution receipt.
 * A checker reachable in command text can still have been skipped by an
 * earlier exit; crediting execution is `FU-14`'s repair, landed at the `S0-8`
 * regeneration in `check-traceability.mjs`'s receipt consumption (falsifier 20
 * states the rule; this script still does not claim it).
 *
 * Usage: node scripts/remediation-status.mjs [--check]
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installReceipt } from './lib/receipts.mjs';

installReceipt(import.meta.url);

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REMEDIATION = join(ROOT, 'docs', 'review', 'remediation');
const read = (p) => readFileSync(p, 'utf8');

const OPTIONS = new Set(process.argv.slice(2));
for (const option of OPTIONS) {
  if (option !== '--check') {
    console.error(`unknown option: ${option}`);
    process.exit(1);
  }
}
const CHECK = OPTIONS.has('--check');

const failures = [];
const fail = (msg) => failures.push(msg);

// --- the census ---------------------------------------------------------------

/**
 * Fenced code blocks are removed before standing lines are read, so a document
 * can quote the syntax (A-policies §6 defines it) without declaring twice.
 */
const stripFences = (text) => text.replace(/^```.*?^```/gms, '');

const STANDINGS = new Set(['home', 'projection', 'record', 'superseded']);

/** Every .md under the jurisdiction, recursively — round 1's non-recursive-readdirSync lesson is a floor. */
const files = readdirSync(REMEDIATION, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
  .map((entry) => relative(REMEDIATION, join(entry.parentPath, entry.name)))
  .sort();

if (files.length === 0) throw new Error('the census found no documents; the walk is broken, not the corpus.');

const pkg = JSON.parse(read(join(ROOT, 'package.json')));
const scripts = pkg.scripts ?? {};

const ancestryCache = new Map();
const isAncestor = (sha) => {
  if (!ancestryCache.has(sha)) {
    try {
      execFileSync('git', ['-C', ROOT, 'cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
      execFileSync('git', ['-C', ROOT, 'merge-base', '--is-ancestor', sha, 'HEAD'], { stdio: 'ignore' });
      ancestryCache.set(sha, true);
    } catch {
      ancestryCache.set(sha, false);
    }
  }
  return ancestryCache.get(sha);
};

/** @type {Map<string, {standing: string, paragraph: string}>} */
const census = new Map();

for (const file of files) {
  const text = stripFences(read(join(REMEDIATION, file)));
  const lines = text.split('\n');
  const at = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\*\*Standing:\*\*/u.test(line));

  if (at.length === 0) {
    fail(`${file} declares no standing. The enum is home | projection | record | superseded, and a document in no bucket is the class-3 defect.`);
    continue;
  }
  if (at.length > 1) {
    fail(`${file} declares its standing ${at.length} times; a document has exactly one.`);
    continue;
  }

  const { index } = at[0];
  const match = /^\*\*Standing:\*\* ([a-z-]+)\b/u.exec(lines[index]);
  const standing = match?.[1];
  if (standing === undefined || !STANDINGS.has(standing)) {
    fail(`${file} declares standing "${standing ?? lines[index]}"; the enum is home | projection | record | superseded, and an unknown value fails rather than entering no bucket.`);
    continue;
  }

  // The declaration is a header, not a footnote: it comes before the first section.
  const firstSection = lines.findIndex((line) => /^## /u.test(line));
  if (firstSection !== -1 && index > firstSection) {
    fail(`${file} declares its standing below the first section heading; the standing is the first thing a reader needs and belongs in the header.`);
  }

  // The paragraph the declaration opens, since these documents wrap long lines.
  let end = index;
  while (end < lines.length && lines[end].trim() !== '') end += 1;
  const paragraph = lines.slice(index, end).join('\n');
  census.set(file, { standing, paragraph });

  if (standing === 'home') {
    const named = [...paragraph.matchAll(/`pnpm ([\w:.-]+)`/gu)].map((m) => m[1]);
    if (named.length === 0) {
      fail(`${file} stands as a home and names no readback; a home names at least one \`pnpm <script>\` that checks it.`);
    }
    for (const name of named) {
      if (scripts[name] === undefined) {
        fail(`${file} names readback \`pnpm ${name}\`, which package.json does not define.`);
      }
    }
  }

  if (standing === 'projection') {
    const paths = [...paragraph.matchAll(/`((?:scripts|docs|test)\/[^`]+)`/gu)].map((m) => m[1]);
    if (paths.length === 0 || !paths.some((p) => existsSync(join(ROOT, p)))) {
      fail(`${file} stands as a projection and names no existing generator; a projection names the script that regenerates it.`);
    }
  }

  if (standing === 'record') {
    const sha = /speaks of `([0-9a-f]{40})`/u.exec(paragraph)?.[1];
    if (sha === undefined) {
      fail(`${file} stands as a record and names no full 40-hex subject SHA ("speaks of \`<sha>\`"); a record with no verifiable subject is the FU-16 shape.`);
    } else if (!isAncestor(sha)) {
      fail(`${file} speaks of ${sha}, which is not an ancestor of HEAD — the FU-16 defect: content may be present, but the label is not exact-lineage provenance.`);
    }
  }

  if (standing === 'superseded') {
    for (let i = 0; i < index; i += 1) {
      if (lines[i].trim() !== '' && !/^# /u.test(lines[i])) {
        fail(`${file} is superseded but its header does not open the file — only the title may precede it, so a reader landing at the top cannot take the content for current.`);
        break;
      }
    }
    const successors = [...(/successors:\s*([\s\S]*)$/u.exec(paragraph)?.[1] ?? '').matchAll(/`([^`]+)`/gu)].map(
      (m) => m[1],
    );
    if (successors.length === 0) {
      fail(`${file} is superseded and names no successors; a superseded page opens by naming what replaced it.`);
    }
    for (const successor of successors) {
      const resolved = [join(REMEDIATION, dirname(file), successor), join(ROOT, successor)];
      if (!resolved.some((p) => existsSync(p))) {
        fail(`${file} names successor \`${successor}\`, which does not resolve.`);
      }
    }
  }
}

// --- the record pins ----------------------------------------------------------

const CENSUS_CONFIG = 'census.json';
let pins = {};
try {
  const config = JSON.parse(read(join(REMEDIATION, CENSUS_CONFIG)));
  if (config.schema_version !== 1) fail(`${CENSUS_CONFIG} has unsupported schema ${config.schema_version}`);
  pins = config.record_sha256 ?? {};
} catch (error) {
  fail(`${CENSUS_CONFIG} cannot be read: ${error.message}`);
}

const records = [...census].filter(([, c]) => c.standing === 'record').map(([file]) => file);
for (const file of records) {
  if (pins[file] === undefined) {
    fail(`${file} stands as a record and ${CENSUS_CONFIG} does not pin it; every record is pinned, or its edits are silent.`);
  }
}
for (const [file, expected] of Object.entries(pins)) {
  const standing = census.get(file)?.standing;
  if (standing !== 'record') {
    fail(`${CENSUS_CONFIG} pins ${file}, which ${standing === undefined ? 'is not in the census' : `stands as a ${standing}`}; pins hold records only.`);
    continue;
  }
  const actual = createHash('sha256').update(read(join(REMEDIATION, file))).digest('hex');
  if (actual !== expected) {
    fail(
      `${file} differs from its pin in ${CENSUS_CONFIG}. A record changed under its census entry: re-read it, ` +
        `add the edit as a dated addendum, and re-pin — or revert. Neither happens silently.`,
    );
  }
}

// --- the computed status projection -------------------------------------------

const DECISIONS = 'decisions';
/** @type {Map<string, {ratified: string|null, option: string|null, statusWord: string, owed: {stage: string, from: number, to: number}[]}>} */
const decisions = new Map();

for (const file of files.filter((f) => f.startsWith(`${DECISIONS}/`))) {
  const id = /^(P-\d|RC-\d)/u.exec(file.slice(DECISIONS.length + 1))?.[1];
  if (id === undefined) {
    fail(`${file} does not name a P-n or RC-n decision; the projection cannot attribute it.`);
    continue;
  }
  const text = stripFences(read(join(REMEDIATION, file)));

  if (!/\*\*(?:Decided|Drafted):\*\* \d{4}-\d{2}-\d{2}/u.test(text)) {
    fail(`${file} has no parseable **Decided:**/**Drafted:** date; a header the projection cannot read is a status it is not checking.`);
  }
  const ratified = /\*\*Ratified:\*\*\s+(\d{4}-\d{2}-\d{2})/u.exec(text)?.[1] ?? null;
  // The ratified option is part of the claim, not decoration (`R3-1`): the
  // headers hard-wrap, so \s+ must be allowed to cross the line break.
  const option = /\*\*Ratified:\*\*\s+\d{4}-\d{2}-\d{2},\s+option ([A-Z])\b/u.exec(text)?.[1] ?? null;

  const statusStart = text.indexOf('**Status:**');
  if (statusStart === -1) {
    fail(`${file} has no **Status:** line; the projection cannot read where this decision stands.`);
    continue;
  }
  const statusEnd = text.indexOf('\n\n', statusStart);
  const status = text
    .slice(statusStart + '**Status:**'.length, statusEnd === -1 ? undefined : statusEnd)
    .replace(/\s+/gu, ' ')
    .trim();
  const statusWord = /^(ratified|decided)\b/u.exec(status)?.[1];
  if (statusWord === undefined) {
    fail(`${file} has status "${status.slice(0, 60)}…", which starts with neither "ratified" nor "decided"; an unreadable status fails rather than entering no bucket.`);
    continue;
  }
  if ((statusWord === 'ratified') !== (ratified !== null)) {
    fail(`${file} says "${statusWord}" while its **Ratified:** field ${ratified === null ? 'is absent' : `says ${ratified}`}; the header disagrees with itself.`);
  }
  const owed = [...status.matchAll(/the `(S0-\d)` (?:return|regeneration) owes falsifiers (\d+)[–-](\d+)/gu)].map(
    (m) => ({ stage: m[1], from: Number(m[2]), to: Number(m[3]) }),
  );
  decisions.set(id, { ratified, option, statusWord, owed });
}

// HANDOFF's per-decision claims, from the State section's claim bullets.

const HANDOFF = 'HANDOFF.md';
const handoff = stripFences(read(join(REMEDIATION, HANDOFF)));
const stateStart = handoff.indexOf('\n## State\n');
const stateEnd = handoff.indexOf('\n## ', stateStart + 1);
if (stateStart === -1 || stateEnd === -1) {
  fail(`${HANDOFF} has no ## State section; the per-decision claims cannot be read.`);
}
const state = stateStart === -1 ? '' : handoff.slice(stateStart, stateEnd === -1 ? undefined : stateEnd);

/** @type {Map<string, {ratified: string|null, option: string|null, owed: {stage: string, from: number, to: number}[]}>} */
const claims = new Map();
for (const raw of state.split(/\n(?=- )/u)) {
  const id = /^- \*{0,2}`(P-\d|RC-\d)`/u.exec(raw)?.[1];
  if (id === undefined) continue;
  if (claims.has(id)) {
    fail(`${HANDOFF} carries two claim bullets for \`${id}\`; a decision has one claim, in one place.`);
    continue;
  }
  // These documents hard-wrap at ~110 columns, so a claim phrase can be split
  // mid-sentence; the claims are read from the unwrapped bullet.
  const block = raw.replace(/\s+/gu, ' ');
  const ratified = new RegExp('`' + id + '` is ratified \\((\\d{4}-\\d{2}-\\d{2})\\)', 'u').exec(block)?.[1] ?? null;
  const option = new RegExp('`' + id + '` is ratified \\(\\d{4}-\\d{2}-\\d{2}\\): option ([A-Z])\\b', 'u').exec(block)?.[1] ?? null;
  const owed = [
    ...block.matchAll(/the `(S0-\d)` (?:return|regeneration)[^.]*? owes the record's falsifiers (\d+)[–-](\d+)/gu),
  ].map((m) => ({ stage: m[1], from: Number(m[2]), to: Number(m[3]) }));
  claims.set(id, { ratified, option, owed });
}

// Agreement, in both directions (P-5 falsifier 22).

const owedKey = (owed) =>
  owed
    .map((o) => `${o.stage}:${o.from}–${o.to}`)
    .sort()
    .join(', ');

for (const [id, record] of decisions) {
  if (!handoff.includes(`\`${id}\``)) {
    fail(`${HANDOFF} never names \`${id}\`; every decision record has a claim there, or the homes have diverged.`);
    continue;
  }
  const claim = claims.get(id);
  if (record.ratified !== null && claim?.ratified !== record.ratified) {
    fail(
      `${DECISIONS}/${id}: the record says ratified ${record.ratified} and ${HANDOFF}'s claim ${claim?.ratified === undefined || claim?.ratified === null ? 'does not say ratified' : `says ${claim.ratified}`} — the FU-07 shape, two authority homes disagreeing about one status.`,
    );
  }
  if (record.ratified === null && claim?.ratified != null) {
    fail(`${DECISIONS}/${id}: ${HANDOFF} claims it is ratified and the record's header does not; the claim is wider than its home.`);
  }
  // The ratified content, at its checkable face — the option letter (`R3-1`,
  // the round-3 return): HANDOFF asserting a different option than the record
  // ratified passed every gate check while only the date was compared.
  if (record.ratified !== null && (record.option ?? null) !== (claim?.option ?? null)) {
    fail(
      `${DECISIONS}/${id}: the record ratified ${record.option === null ? 'no stated option' : `option ${record.option}`} ` +
        `and ${HANDOFF}'s claim says ${claim?.option == null ? 'no option' : `option ${claim.option}`} — the R3-1 shape: ` +
        'the ratified content drifting between the two homes while only the date was compared.',
    );
  }
  if (owedKey(record.owed) !== owedKey(claim?.owed ?? [])) {
    fail(
      `${DECISIONS}/${id}: the record owes [${owedKey(record.owed) || 'nothing'}] and ${HANDOFF} claims ` +
        `[${owedKey(claim?.owed ?? []) || 'nothing'}] — the FU-15 shape, one debt with two homes.`,
    );
  }
}
for (const id of claims.keys()) {
  if (!decisions.has(id)) fail(`${HANDOFF} carries a claim bullet for \`${id}\`, which has no decision record.`);
}

// --- the current-input rule (falsifiers 15 and 18) ----------------------------

const SUPERSEDED_INPUT = 'corrected-end-state.md';
if (census.get(SUPERSEDED_INPUT)?.standing !== 'superseded') {
  fail(`${SUPERSEDED_INPUT} does not stand superseded; the FU-07 reproduction is open again.`);
}

const TREE = 'action-tree.md';
const tree = read(join(REMEDIATION, TREE));
if (!tree.includes('`corrected-end-state.md` is superseded')) {
  fail(`${TREE}'s P-5 node no longer states the supersession; the plan and the record have diverged.`);
}
const s09Start = tree.search(/^### `S0-9` /mu);
const s09 = s09Start === -1 ? null : tree.slice(s09Start, tree.indexOf('\n### ', s09Start + 1));
const inputs = s09 === null ? null : /- \*\*Exact affected artifacts:\*\*([\s\S]*?)(?=\n- \*\*)/u.exec(s09)?.[1];
if (inputs == null) {
  fail(`${TREE} has no S0-9 "Exact affected artifacts" list; the challenge's current inputs cannot be checked.`);
} else {
  if (inputs.includes(SUPERSEDED_INPUT)) {
    fail(`${TREE} lists ${SUPERSEDED_INPUT} as an S0-9 input again — the exact FU-07 reproduction, refused (P-5 falsifier 15).`);
  }
  for (const [, named] of inputs.matchAll(/`([^`\s]+\.md)`/gu)) {
    const standing = census.get(named)?.standing;
    if (standing === 'record' || standing === 'superseded') {
      fail(`${TREE} lists ${named} as a current S0-9 input while it stands as a ${standing}; a dated or superseded page admits no current consumption (P-5 falsifier 18).`);
    }
  }
}

// --- the convicted sentences (falsifier 21) -----------------------------------

/**
 * Instance negatives against the two printed claims the rounds convicted of
 * overclaiming — byte rules against named defects, not a semantic audit.
 */
const CONVICTED = [
  {
    file: 'scripts/check-selection-status.mjs',
    phrase: 'none contradicts the register',
    was: 'E4: membership and citing sentences were checked; "the register" read wider than the scan',
  },
  {
    file: 'scripts/check-traceability.mjs',
    phrase: 'and that artifact still runs',
    was: 'E5: a check script reachable in command text was credited as running',
  },
];
for (const { file, phrase } of CONVICTED) {
  if (read(join(ROOT, file)).includes(phrase)) {
    fail(
      `${file} says "${phrase}" again — the sentence S0-9 convicted of claiming more than the scan ` +
        `(P-5 falsifier 21). The claim narrowed at the S0-1 return; restore the narrow sentence or narrow the new one.`,
    );
  }
}

// --- report -------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`remediation census: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

const counts = new Map();
for (const { standing } of census.values()) counts.set(standing, (counts.get(standing) ?? 0) + 1);
const countLine = ['home', 'record', 'projection', 'superseded']
  .map((s) => `${counts.get(s) ?? 0} ${s}`)
  .join(' · ');

const ratified = [...decisions].filter(([, d]) => d.ratified !== null).map(([id]) => id);
const decided = [...decisions].filter(([, d]) => d.ratified === null).map(([id]) => id);
const byStage = new Map();
for (const [id, d] of decisions) {
  for (const o of d.owed) byStage.set(o.stage, [...(byStage.get(o.stage) ?? []), `${id} falsifiers ${o.from}–${o.to}`]);
}

if (CHECK) {
  console.log(
    `remediation census: ${census.size} documents (${countLine}), ${records.length} pins current; ` +
      `${ratified.length} ratified · ${decided.length} decided; HANDOFF's dates, options and owed ranges agree in both directions.`,
  );
} else {
  console.log(`remediation census: ${census.size} documents — ${countLine}.`);
  console.log(`  every document classified; ${records.length} record pins current; every named readback exists.`);
  console.log(`decisions: ${ratified.length} ratified (${ratified.sort().join(' ')}) · ${decided.length} decided (${decided.sort().join(' ')}).`);
  console.log('owed at the returns, computed from the records (the queue order is HANDOFF.md\'s alone):');
  if (byStage.size === 0) console.log('  nothing — no record states an owed falsifier range.');
  for (const [stage, entries] of [...byStage].sort(([a], [b]) => (a < b ? -1 : 1))) {
    console.log(`  ${stage}: ${entries.join(' · ')}`);
  }
}
console.log(
  '  Scope: standings, pins, readback existence, header/claim agreement, the S0-9 input rule and two named ' +
    'sentence negatives — byte rules, never an execution receipt (FU-14\'s receipts live at trace:check ' +
    'since the S0-8 regeneration; this stays byte rules).',
);
