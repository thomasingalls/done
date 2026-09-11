/**
 * The authority-derivation map's checker (`S0-2` Stage A/B, queue item 3a).
 *
 * `P-1`'s ratified floor: **a verification key resolves through client- or
 * factor-authenticated state, or it does not verify** — and the map is where
 * that predicate is checked for every key in the workspace, so that a dangling
 * or service-only edge fails a build rather than waiting for a review to notice
 * (P-1 falsifier 14). Both `S0-9` rounds found class-1 defects one at a time;
 * the map exists so the class is closed as a class or not at all.
 *
 * The map itself is docs/review/remediation/S0-2/authority-map.md — the home;
 * this script is its readback. What it checks:
 *
 *   1. **Totality.** Every entry parses against exhaustive enums; an unknown
 *      kind, guard, status or field fails rather than entering no bucket —
 *      `checkSeparation`'s lesson, applied to the census that kept generating
 *      the class.
 *   2. **Termination.** Every resolution chain ends at `root:` or `via:`; `via:`
 *      targets exist and resolve without cycles; and the transitive roots obey
 *      the guard rule — an entry guarding keys, content, custody, attribution
 *      or deletion terminates only at `trust-root`, `factor` or `structural`,
 *      while an `availability` entry may terminate at `service` if its stated
 *      bound is cited. A chain that violates this is the class-1 defect, and it
 *      fails here whether or not anyone has filed a finding for it yet.
 *   3. **The open discipline.** A joint the dispositions hold open is declared
 *      `status: open` with the blocker that names it (an `FU-nn`, a finding, or
 *      a reopened `P-n`) and the return stage that owes the repair — both
 *      validated against the documents that define them. A resolved entry
 *      carrying a blocker, or an open entry whose pinned home has changed, is
 *      the paid-and-not-struck shape and fails in either direction.
 *   4. **Pins.** Every entry pins the section (or file) that states its rule or
 *      embodies its defect, by content hash. An edit to a pinned home fails
 *      until the editor re-reads the entry and either re-pins it or flips it —
 *      which is `RC-8C`'s both-directions agreement, made mechanical.
 *   5. **The population sweep.** Every `Ed25519(` construction — and, since
 *      the `S0-3` return, every AEAD construction (`AES-256-GCM(`,
 *      `XChaCha20-Poly1305(`, `AEAD(`) — in the TRD and the seven stage
 *      documents must sit in a section some entry pins, so the map cannot
 *      decide its own census. All seven stages since the `S0-9` round-3
 *      return (`R3-2`): the set used to name five schema documents, and a
 *      sealed construction added to `S0-3/A-schemas.md` — the write-admission
 *      machine's own schema home — entered no census at all; a document
 *      population that is itself a hand-maintained list is the same
 *      list-classification defect one level up, so the set now closes over
 *      every stage document. And `K_cp`'s census obligation — declared as an
 *      absence at the `S0-3` return, paid at the `S0-5` return when its homes
 *      selected the per-seal discipline and the `k-checkpoint` entry entered
 *      with the declaration struck — stays held mechanically: an entry beside
 *      a standing declaration is paid-and-not-struck, both missing is a
 *      silent drop, and either fails.
 *
 * What it does **not** prove: that the corpus implements a chain. `status` is
 * the honest carrier for that gap — an open entry's flip is owed at its
 * return's falsifiers, and those are the oracle, not this script. A pin detects
 * drift, never forgery. The what-blocks-what summary is computed here on
 * demand and maintained nowhere.
 *
 * Usage: node scripts/check-authority-map.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installReceipt } from './lib/receipts.mjs';
import { checkConstructionRegistry } from './account-first-authority/registry.mjs';

installReceipt(import.meta.url);

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(ROOT + p, 'utf8');

const MAP = 'docs/review/remediation/S0-2/authority-map.md';
const FOLLOWUP = 'docs/review/remediation/S0-9/FOLLOWUP-DISPOSITION.md';
const TREE = 'docs/review/remediation/action-tree.md';
const FINDINGS = 'docs/review/findings/';
const DECISIONS = 'docs/review/remediation/decisions/';

/** The documents whose signature constructions decide the census, not the map.
 * Closed over all seven stage documents at the `S0-9` round-3 return (`R3-2`):
 * `S0-1`'s policies and `S0-3`'s schemas joined, so a construction added to
 * either fails the sweep instead of entering no census. */
const SWEPT = [
  'docs/TRD.md',
  'docs/review/remediation/S0-1/A-policies.md',
  'docs/review/remediation/S0-2/A-schemas.md',
  'docs/review/remediation/S0-3/A-schemas.md',
  'docs/review/remediation/S0-4/A-schemas.md',
  'docs/review/remediation/S0-5/A-schemas.md',
  'docs/review/remediation/S0-6/A-schemas.md',
  'docs/review/remediation/S0-7/A-schemas.md',
  'docs/account-crypto/first-authority.md',
  'docs/account-crypto/recovery-layout.md',
  'docs/account-crypto/transport.md',
  'docs/account-crypto/service-custody.md',
  'docs/account-crypto/local-promotion.md',
  'docs/account-crypto/account-ledger.md',
  'docs/account-crypto/content-counter.md',
  'docs/account-crypto/store-journal.md',
  'docs/account-crypto/local-custody.md',
  'docs/account-crypto/checkpoint.md',
  'docs/account-crypto/local-provenance.md',
];

const KINDS = new Set(['verification', 'predicate', 'aead']);
const GUARDS = new Set(['keys', 'content', 'custody', 'attribution', 'deletion', 'availability']);
const STATUSES = new Set(['resolved', 'open']);
const ROOTS = new Set(['trust-root', 'factor', 'structural', 'service']);
/** The roots a non-availability guard may terminate at. P-1's ratified floor. */
const PERMITTED = new Set(['trust-root', 'factor', 'structural']);
const FIELDS = new Set([
  'entry',
  'kind',
  'guards',
  'verifies',
  'resolves',
  'counted-by',
  'discipline',
  'bound',
  'status',
  'blocker',
  'return',
  'pin',
  'note',
]);

const failures = [];
const fail = (msg) => failures.push(msg);

// --- 1. parse the map ---------------------------------------------------------

const mapText = read(MAP);
const blocks = [...mapText.matchAll(/^```authority\n([\s\S]*?)\n```/gmu)];
if (blocks.length === 0) {
  throw new Error(`${MAP} has no \`\`\`authority blocks; the scan is broken, not the map.`);
}

/**
 * @typedef {object} Entry
 * @property {string} id
 * @property {string} kind
 * @property {string} guards
 * @property {string} status
 * @property {string[][]} chains Parsed `resolves:` chains, each a list of steps.
 * @property {string|null} countedBy
 * @property {string|null} discipline
 * @property {string|null} bound
 * @property {string|null} blocker
 * @property {string|null} ret
 * @property {{path: string, section: string|null, hash: string}[]} pins
 */
/** @type {Map<string, Entry>} */
const entries = new Map();

for (const [, body] of blocks) {
  /** @type {Map<string, string[]>} */
  const fields = new Map();
  for (const line of body.split('\n')) {
    if (line.trim() === '') continue;
    const m = /^([a-z-]+):\s+(.+)$/u.exec(line);
    if (m === null) {
      fail(`${MAP}: unparseable line in an authority block: "${line}"`);
      continue;
    }
    const [, key, value] = m;
    if (!FIELDS.has(key)) {
      fail(
        `${MAP}: unknown field "${key}:" — the field list is exhaustive, and a value it does not name fails rather than entering no bucket.`,
      );
      continue;
    }
    fields.set(key, [...(fields.get(key) ?? []), value.trim()]);
  }

  const one = (key) => {
    const held = fields.get(key) ?? [];
    if (held.length > 1)
      fail(`${MAP}: entry "${fields.get('entry')?.[0]}" repeats "${key}:", which takes one value.`);
    return held[0] ?? null;
  };

  const id = one('entry');
  if (id === null) {
    fail(`${MAP}: an authority block has no "entry:" line.`);
    continue;
  }
  if (entries.has(id)) {
    fail(`${MAP}: entry "${id}" is declared twice.`);
    continue;
  }

  const kind = one('kind');
  const guards = one('guards');
  const status = one('status');
  if (kind === null || !KINDS.has(kind))
    fail(`${MAP}: entry "${id}" has kind "${kind}"; the enum is verification | predicate | aead.`);
  if (guards === null || !GUARDS.has(guards))
    fail(
      `${MAP}: entry "${id}" has guards "${guards}"; the enum is keys | content | custody | attribution | deletion | availability.`,
    );
  if (status === null || !STATUSES.has(status))
    fail(`${MAP}: entry "${id}" has status "${status}"; the enum is resolved | open.`);

  const chains = (fields.get('resolves') ?? []).map((raw) =>
    raw.split(' -> ').map((s) => s.trim()),
  );

  const pins = (fields.get('pin') ?? [])
    .map((raw) => {
      const withSection = /^(\S+) §(\S+) ([0-9a-f]{12})$/u.exec(raw);
      if (withSection !== null)
        return { path: withSection[1], section: withSection[2], hash: withSection[3] };
      const wholeFile = /^(\S+) ([0-9a-f]{12})$/u.exec(raw);
      if (wholeFile !== null) return { path: wholeFile[1], section: null, hash: wholeFile[2] };
      fail(
        `${MAP}: entry "${id}" has an unparseable pin "${raw}" — the forms are "<path> §<number> <hash12>" and "<path> <hash12>".`,
      );
      return null;
    })
    .filter((p) => p !== null);

  entries.set(id, {
    id,
    kind,
    guards,
    status,
    chains,
    countedBy: one('counted-by'),
    discipline: one('discipline'),
    bound: one('bound'),
    blocker: one('blocker'),
    ret: one('return'),
    pins,
  });
}

// --- 2. per-entry shape rules -------------------------------------------------

for (const e of entries.values()) {
  if (e.kind === 'aead') {
    if (e.chains.length > 0)
      fail(
        `${MAP}: "${e.id}" is an aead entry and carries "resolves:" chains; an AEAD key is counted or disciplined, never resolved.`,
      );
    const has = [e.countedBy !== null, e.discipline !== null].filter(Boolean).length;
    if (has !== 1) {
      fail(
        `${MAP}: "${e.id}" must name exactly one of "counted-by:" (the durable state that counts its invocations) or "discipline:" (the nonce rule that needs none) — P-3 falsifier 16's two clauses. It names ${has}.`,
      );
    }
  } else {
    if (e.chains.length === 0)
      fail(
        `${MAP}: "${e.id}" has no "resolves:" chain; a key or predicate with no stated resolution is a dangling edge.`,
      );
    if (e.countedBy !== null || e.discipline !== null)
      fail(`${MAP}: "${e.id}" is not an aead entry and carries an AEAD field.`);
  }
  if (e.pins.length === 0)
    fail(
      `${MAP}: "${e.id}" pins nothing; every entry pins the home that states its rule or embodies its defect.`,
    );
  if (e.status === 'open') {
    if (e.blocker === null)
      fail(
        `${MAP}: "${e.id}" is open with no "blocker:" — an open joint names the disposition entry that holds it open.`,
      );
    if (e.ret === null)
      fail(
        `${MAP}: "${e.id}" is open with no "return:" — an open joint names the stage that owes its repair.`,
      );
  } else {
    if (e.blocker !== null || e.ret !== null) {
      fail(
        `${MAP}: "${e.id}" is resolved and still carries a blocker or return — the debt was paid and the declaration was not struck, or the flip was premature. One of the two lines is wrong.`,
      );
    }
  }
}

// --- 3. chains terminate, and the transitive roots obey the guard rule --------

for (const e of entries.values()) {
  for (const chain of e.chains) {
    for (const [i, step] of chain.entries()) {
      const terminal = /^(root|via):/u.test(step);
      if (i === chain.length - 1 && !terminal) {
        fail(
          `${MAP}: "${e.id}" has a chain ending at "${step}", which is neither "root:" nor "via:" — a dangling edge.`,
        );
      }
      if (i < chain.length - 1 && terminal) {
        fail(`${MAP}: "${e.id}" has "${step}" mid-chain; root: and via: are terminals.`);
      }
    }
    const last = chain[chain.length - 1] ?? '';
    const root = /^root:(.+)$/u.exec(last);
    if (root !== null && !ROOTS.has(root[1])) {
      fail(
        `${MAP}: "${e.id}" terminates at "root:${root[1]}"; the enum is trust-root | factor | structural | service.`,
      );
    }
    const via = /^via:(.+)$/u.exec(last);
    if (via !== null && !entries.has(via[1])) {
      fail(`${MAP}: "${e.id}" resolves via "${via[1]}", which is not an entry.`);
    }
  }
}

/**
 * The transitive terminal roots of an entry, following `via:` edges.
 * @param {string} id
 * @param {string[]} stack
 * @returns {Set<string>}
 */
const terminalRoots = (id, stack = []) => {
  if (stack.includes(id)) {
    fail(
      `${MAP}: resolution cycle: ${[...stack, id].join(' -> ')} — a chain that resolves through itself resolves nothing.`,
    );
    return new Set();
  }
  const e = entries.get(id);
  if (e === undefined) return new Set();
  const roots = new Set();
  for (const chain of e.chains) {
    const last = chain[chain.length - 1] ?? '';
    const root = /^root:(.+)$/u.exec(last);
    if (root !== null) roots.add(root[1]);
    const via = /^via:(.+)$/u.exec(last);
    if (via !== null) for (const r of terminalRoots(via[1], [...stack, id])) roots.add(r);
  }
  return roots;
};

for (const e of entries.values()) {
  if (e.kind === 'aead') continue;
  const roots = terminalRoots(e.id);
  if (e.guards === 'availability') {
    if (roots.has('service') && e.bound === null) {
      fail(
        `${MAP}: "${e.id}" terminates at root:service with no "bound:" — a service power is accepted only with its stated bound cited.`,
      );
    }
  } else {
    for (const r of roots) {
      if (!PERMITTED.has(r)) {
        fail(
          `${MAP}: "${e.id}" guards ${e.guards} and terminates at root:${r}. ` +
            `P-1's floor: a verification key resolves through client- or factor-authenticated state, or it does not verify — ` +
            `a service-only edge here is the class-1 defect, whatever its status line says.`,
        );
      }
    }
  }
}

// --- 4. blockers and returns name things that exist ---------------------------

const followup = read(FOLLOWUP);
const tree = read(TREE);
const definesGate = (name) => new RegExp(`^#+ .*\`${name}\``, 'mu').test(tree);
const findingFiles = new Set(readdirSync(ROOT + FINDINGS));
const decisionFiles = readdirSync(ROOT + DECISIONS);

for (const e of entries.values()) {
  if (e.blocker !== null) {
    if (/^FU-\d{2}$/u.test(e.blocker)) {
      if (!followup.includes(`\`${e.blocker}\``)) {
        fail(`${MAP}: "${e.id}" names blocker ${e.blocker}, which ${FOLLOWUP} does not define.`);
      }
    } else if (/^f-[a-z0-9-]+$/u.test(e.blocker)) {
      if (!findingFiles.has(`${e.blocker}.md`)) {
        fail(`${MAP}: "${e.id}" names blocker ${e.blocker}, which is not a finding.`);
      }
    } else if (/^P-\d$/u.test(e.blocker)) {
      if (!decisionFiles.some((f) => f.startsWith(`${e.blocker}-`))) {
        fail(`${MAP}: "${e.id}" names blocker ${e.blocker}, which is not a decision record.`);
      }
    } else {
      fail(
        `${MAP}: "${e.id}" has blocker "${e.blocker}"; the forms are FU-nn, f-<finding>, and P-n.`,
      );
    }
  }
  if (e.ret !== null && !definesGate(e.ret)) {
    fail(`${MAP}: "${e.id}" returns at "${e.ret}", which action-tree.md does not define.`);
  }
}

// --- 5. pins ------------------------------------------------------------------

const hash12 = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);

/**
 * The exact byte slice of one numbered section: its heading line through the
 * line before the next heading of the same or a higher level.
 * @param {string} text
 * @param {string} number e.g. "13.5" or "1"
 * @returns {string|null}
 */
const section = (text, number) => {
  const escaped = number.replace(/\./gu, '\\.');
  const lines = text.split('\n');
  const headOf = (line) => /^(#{2,3}) /u.exec(line);
  const start = lines.findIndex((line) => new RegExp(`^#{2,3} ${escaped}[. ]`, 'u').test(line));
  if (start === -1) return null;
  const level = headOf(lines[start])[1].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const h = headOf(lines[i]);
    if (h !== null && h[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
};

/** Every (path, section) some entry pins, for the sweep below. */
const pinned = new Set();

for (const e of entries.values()) {
  for (const pin of e.pins) {
    let text;
    try {
      text = read(pin.path);
    } catch {
      fail(`${MAP}: "${e.id}" pins ${pin.path}, which does not exist.`);
      continue;
    }
    const subject = pin.section === null ? text : section(text, pin.section);
    if (subject === null) {
      fail(
        `${MAP}: "${e.id}" pins ${pin.path} §${pin.section}, and no such section heading exists.`,
      );
      continue;
    }
    pinned.add(`${pin.path}::${pin.section ?? '*'}`);
    const current = hash12(subject);
    if (current !== pin.hash) {
      fail(
        `${MAP}: "${e.id}" pins ${pin.path}${pin.section === null ? '' : ` §${pin.section}`} at ${pin.hash}, and the content is now ${current}. ` +
          `The home changed under the entry: re-read it, then either update the pin (the entry still holds) or flip the entry's status and strike or add its blocker (the change repaired or reopened the joint). Neither happens silently.`,
      );
    }
  }
}

// --- 6. the population sweep: the documents decide the census ------------------

/** The construction tokens the sweep attributes: signatures, and — since the
 * S0-3 return (P-3 falsifier 16) — AEAD seals. */
const CONSTRUCTS = ['Ed25519(', 'AES-256-GCM(', 'XChaCha20-Poly1305(', 'AEAD('];

for (const path of SWEPT) {
  const text = read(path);
  const lines = text.split('\n');
  let current = null;
  for (const line of lines) {
    const h = /^#{2,3} ((?:\d+\.)*\d+)[. ]/u.exec(line);
    if (h !== null) current = h[1];
    if (!CONSTRUCTS.some((t) => line.includes(t))) continue;
    if (current === null) {
      fail(
        `${path}: a signature or AEAD construction sits above every numbered section; the sweep cannot attribute it.`,
      );
      continue;
    }
    if (!pinned.has(`${path}::${current}`) && !pinned.has(`${path}::*`)) {
      fail(
        `${path} §${current} constructs a signature or a seal and no map entry pins that section. ` +
          `Every verifier or key an acceptance step consumes is a map entry, or the map's census is smaller than the corpus.`,
      );
    }
  }
}

// --- 6b. the census's one declared absence (P-3 falsifier 16, the S0-3 return) --

{
  const declared = mapText.includes('The checkpoint subkey `K_cp` does not enter yet');
  const entered = entries.has('k-checkpoint');
  if (entered && declared) {
    fail(
      `${MAP}: a k-checkpoint entry exists while §5 still declares K_cp's absence — the debt was paid and the ` +
        'declaration was not struck.',
    );
  }
  if (!entered && !declared) {
    fail(
      `${MAP}: no k-checkpoint entry and no declared absence — K_cp's census obligation was silently dropped ` +
        '(P-3 falsifier 16; its counter-or-discipline selection is owed at the S0-5 return).',
    );
  }
}

// --- 7. report ----------------------------------------------------------------

const accountConstructions = checkConstructionRegistry(ROOT, { entries });
for (const failure of accountConstructions.failures) fail(failure);

if (failures.length > 0) {
  console.error(`authority map: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

/** Entries blocked through an open dependency, not open at their own joint. */
const blockedThrough = (id, stack = []) => {
  const e = entries.get(id);
  if (e === undefined || stack.includes(id)) return null;
  for (const chain of e.chains) {
    const via = /^via:(.+)$/u.exec(chain[chain.length - 1] ?? '');
    if (via === null) continue;
    const target = entries.get(via[1]);
    if (target === undefined) continue;
    if (target.status === 'open') return via[1];
    const deeper = blockedThrough(via[1], [...stack, id]);
    if (deeper !== null) return deeper;
  }
  return null;
};

const open = [...entries.values()].filter((e) => e.status === 'open');
const blocked = [...entries.values()]
  .filter((e) => e.status === 'resolved')
  .map((e) => ({ id: e.id, through: blockedThrough(e.id) }))
  .filter((b) => b.through !== null);

const byReturn = new Map();
for (const e of open) byReturn.set(e.ret, [...(byReturn.get(e.ret) ?? []), e.id]);
const perStage = [...byReturn]
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([stage, ids]) => `${stage}: ${ids.join(', ')}`)
  .join(' · ');

const edges = [...entries.values()].reduce((n, e) => n + e.chains.length, 0);
console.log(
  `authority map: ${entries.size} entries, ${edges} chains; every chain terminates at a permitted root for its guard, ` +
    `and every signature and AEAD construction in the ${SWEPT.length} swept documents sits in a pinned section.`,
);
console.log(
  `  open at their own joint: ${open.length}${open.length === 0 ? '' : ` — ${perStage}`}`,
);
console.log(
  `  blocked through an open home: ${blocked.length}${blocked.length === 0 ? '' : ` — ${blocked.map((b) => `${b.id} (via ${b.through})`).join(', ')}`}`,
);
console.log(
  '  This proves the rules resolve and their homes are pinned — not that the corpus implements them: ' +
    "each open entry flips only at its return, under that record's falsifiers. Account construction coverage is reported separately below.",
);
console.log(
  `  Account constructions: ${accountConstructions.specified} specified, ${accountConstructions.open} open, ${accountConstructions.inherited} inherited outside Account acceptance, ${accountConstructions.excluded} non-crypto exclusions. This is registration evidence, not a finding-closure decision. See docs/review/implementation/account-crypto-closure.md and run account:crypto-audit.`,
);
