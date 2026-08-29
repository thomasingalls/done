/**
 * The debt manifest's readback, and the gates' consultation of it (`RC-9A`,
 * ratified 2026-08-28; consolidated at the `S0-8` regeneration).
 *
 * Three duties, one home:
 *
 *   1. **The census is total over the deferred.** Every finding
 *      `end-state-materiality.md` classifies as *Explicit later* resolves to
 *      exactly one entry in `docs/review/remediation/debts.json`, and every
 *      entry names a finding that exists and is not historical. A deferred
 *      property outside the manifest fails here rather than entering no bucket
 *      — a gate-class finding can no longer be required to have nothing, and a
 *      future return that defers a property must register it or this fails.
 *   2. **The entries hold the debt floor.** Owner, one blocking gate, required
 *      artifact, falsifier, expiry, typed payment, hashed inputs — validated by
 *      scripts/lib/debts.mjs, with a changed input failing until the entry is
 *      re-read. One debt, one gate: the manifest is the only gate-assigner, a
 *      finding appears in at most one entry, and the two prose homes that state
 *      a gate (TRD §10.11's closure sentence; action-tree.md's `L-4` node) are
 *      held to the manifest in both directions.
 *   3. **What blocks what is computed, never transcribed.** `pnpm debts` prints
 *      the projection from the entries on demand; `HANDOFF.md`'s one claim of
 *      it is parsed and compared in both directions; and `--gate <name>`
 *      evaluates an arrival — blocking, with the debts named, while any of that
 *      gate's debts is unpaid, expired or input-changed.
 *
 * It also holds `RC-9` falsifier 10's claim-scope rule: the wasm source↔blob
 * binding in check-wasm-seal.mjs must print drift detection and nothing wider —
 * the named widening phrase is refused as a byte rule, under `P-5`'s ratified
 * rule that a checker's printed claim is exactly its scope.
 *
 * And since the `S0-10` arrival (2026-08-29) it reads the one paid artifact the
 * manifest points at: TRD §10.11's X25519 evidence table, held to the payment
 * record in both directions — engines × operations exactly, one row per pair,
 * each row passing, sourced, dated, and carrying the record's one expiry. The
 * debt's own falsifier is the rule: an empty, undated, unsourced or expired
 * table fails the S0-10 evaluation that reads it, and a populated table beside
 * an unpaid entry fails the same way — an artifact and a record disagreeing is
 * the FU-07 shape wherever it appears.
 *
 * falsifies: f-bd87655-x25519-support-floor-omitted -> S0-10
 *
 * Usage: node scripts/check-debts.mjs [--check | --gate <name>]
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFindings } from './lib/findings.mjs';
import { MANIFEST, evaluateGate, loadManifest, projection, section, validateManifest } from './lib/debts.mjs';
import { installReceipt } from './lib/receipts.mjs';

installReceipt(import.meta.url);

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const GATE = args.includes('--gate') ? args[args.indexOf('--gate') + 1] : null;
if (GATE === undefined || args.some((a) => !['--check', '--gate', GATE].includes(a))) {
  console.error('usage: node scripts/check-debts.mjs [--check | --gate <name>]');
  process.exit(1);
}

const failures = [];
const fail = (msg) => failures.push(msg);

// --- the manifest and the population ------------------------------------------

const debts = loadManifest(ROOT);
failures.push(...validateManifest(debts, ROOT));

const population = readFindings(ROOT);
failures.push(...population.failures);
const { declared, classOf } = population;

const tree = read('docs/review/remediation/action-tree.md');
const definesGate = (name) => new RegExp(`^#+ .*\`${name}\``, 'mu').test(tree);

const byFinding = new Map(debts.map((d) => [d.finding, d]));
for (const debt of debts) {
  if (!declared.has(debt.finding)) {
    fail(`${MANIFEST}: "${debt.id}" names ${debt.finding}, which is not a finding.`);
    continue;
  }
  const cls = classOf.get(debt.finding);
  if (cls === 'historical') {
    fail(`${MANIFEST}: "${debt.id}" registers ${debt.finding}, which is historical-only — H-1's ledger has no surviving debt to defer.`);
  }
  if (!definesGate(debt.gate)) {
    fail(`${MANIFEST}: "${debt.id}" blocks gate "${debt.gate}", which action-tree.md does not define.`);
  }
}

// The census is total over the deferred (RC-9 falsifiers 2 and 12): a
// gate-class finding with no entry, or with two, fails rather than entering no
// bucket. The matrix required nothing of this class before; now the class *is*
// the manifest's census.
for (const [id, cls] of classOf) {
  if (cls !== 'gate') continue;
  if (!byFinding.has(id)) {
    fail(
      `${id} is classified Explicit later and has no debt entry. A deferred property is a registered ` +
        'debt, or it is not deferred — the return that defers it registers it.',
    );
  }
}

// --- one debt, one gate, all homes agreeing (falsifier 4) ---------------------

const TRD_ASSIGNER = 'required before Stage 0 closes';
// Exact case: the file is docs/TRD.md, and a case-folding filesystem resolving
// a lowercase spelling is what let this read work anyway (`R3-3`, round 3) —
// on a case-sensitive filesystem the old spelling crashed the gate.
const trd1011 = read('docs/TRD.md');
const x25519 = byFinding.get('f-bd87655-x25519-support-floor-omitted');
if (trd1011.includes(TRD_ASSIGNER)) {
  if (x25519 === undefined) {
    fail(
      `docs/TRD.md §10.11 makes the X25519 dated readback "${TRD_ASSIGNER}" and the manifest has no ` +
        'entry for f-bd87655-x25519-support-floor-omitted — a debt one home states and the other cannot see.',
    );
  } else if (x25519.gate !== 'S0-10') {
    fail(
      `docs/TRD.md §10.11 assigns the X25519 readback to Stage 0 closure and the manifest blocks ` +
        `"${x25519.gate}" with it — the FU-15 shape, one debt with two gates, refused (RC-9's one-gate floor).`,
    );
  }
} else {
  fail(`docs/TRD.md no longer says "${TRD_ASSIGNER}"; the X25519 debt's gate-assigning home changed under it.`);
}

for (const phrase of ['what-blocks-what is computed from the manifest', 'debts.json']) {
  if (!tree.includes(phrase)) {
    fail(`action-tree.md no longer says "${phrase}"; its L-4 node must carry the RC-9 ratification's answer.`);
  }
}

// --- the S0-10 artifact: §10.11's evidence table and the payment agree --------
// The x25519 debt's own falsifier, made a check: an empty, undated, unsourced
// or expired table fails the S0-10 evaluation that reads it. The record is one
// home and the table the other; both directions, or the R3-1 shape rides again.

const EVIDENCE_COLUMNS = ['Engine', 'Operation', 'Result', 'Source', 'Date', 'Expiry'];
const DATE_CELL = /^\d{4}-\d{2}-\d{2}$/u;
const s1011 = section(trd1011, '10.11');
if (s1011 === null) {
  fail('docs/TRD.md no longer has a §10.11 section heading; the X25519 evidence has no home to read.');
} else if (x25519 !== undefined) {
  const cellsOf = (line) =>
    line
      .split('|')
      .slice(1, -1)
      .map((c) => c.replaceAll('`', '').trim());
  const lines = s1011.split('\n');
  const headAt = lines.findIndex(
    (line) => line.startsWith('|') && cellsOf(line).join(',') === EVIDENCE_COLUMNS.join(','),
  );
  const rows = [];
  if (headAt !== -1) {
    for (let i = headAt + 2; i < lines.length && lines[i].startsWith('|'); i += 1) {
      const cells = cellsOf(lines[i]);
      if (cells.length !== EVIDENCE_COLUMNS.length) {
        fail(`docs/TRD.md §10.11 evidence row "${lines[i].slice(0, 40)}…" has ${cells.length} cells; the readback cannot attribute it.`);
        continue;
      }
      const [engine, operation, result, source, date, expiry] = cells;
      rows.push({ engine, operation, result, source, date, expiry });
    }
  }

  if (x25519.status === 'paid') {
    const record = x25519.payment_record ?? {};
    const engines = Array.isArray(record.engines) ? record.engines : [];
    const operations = Array.isArray(record.operations) ? record.operations : [];
    if (rows.length === 0) {
      fail(
        'docs/TRD.md §10.11 has no populated evidence table while the manifest marks the X25519 debt paid — ' +
          'an empty table fails the S0-10 evaluation that reads it.',
      );
    }
    const seen = new Set();
    for (const row of rows) {
      const engine = row.engine.split(/\s/u)[0].toLowerCase();
      const key = `${engine} × ${row.operation}`;
      if (!engines.includes(engine) || !operations.includes(row.operation)) {
        fail(`docs/TRD.md §10.11 carries an evidence row for ${key}, which the payment record does not declare — the homes must agree in both directions.`);
        continue;
      }
      if (seen.has(key)) {
        fail(`docs/TRD.md §10.11 carries two evidence rows for ${key}; one observation, one row.`);
        continue;
      }
      seen.add(key);
      if (!row.result.startsWith('pass')) {
        fail(`docs/TRD.md §10.11's ${key} row reads "${row.result}"; a row that does not observe the operation passing cannot support the floor the payment claims.`);
      }
      if (row.source === '' || row.source === '—') {
        fail(`docs/TRD.md §10.11's ${key} row is unsourced; an unsourced observation is an assertion.`);
      }
      if (!DATE_CELL.test(row.date)) {
        fail(`docs/TRD.md §10.11's ${key} row has date "${row.date}"; an undated observation is an assertion.`);
      }
      if (row.expiry !== record.expiry) {
        fail(`docs/TRD.md §10.11's ${key} row expires "${row.expiry}" and the payment record says ${record.expiry ?? 'nothing'}; one observation set, one expiry.`);
      }
    }
    for (const engine of engines) {
      for (const operation of operations) {
        if (!seen.has(`${engine} × ${operation}`)) {
          fail(`docs/TRD.md §10.11's evidence table has no row for ${engine} × ${operation}, which the payment record declares; a missing row is a missing observation.`);
        }
      }
    }
  } else if (rows.length > 0) {
    fail(
      'docs/TRD.md §10.11 carries a populated evidence table while the manifest does not mark the X25519 debt ' +
        'paid — an artifact without a payment record, the two homes disagreeing.',
    );
  }
}

// --- the wasm binding's printed claim is its scope (falsifier 10) -------------

const wasmChecker = read('scripts/check-wasm-seal.mjs');
if (!wasmChecker.includes('drift detection only')) {
  fail(
    'scripts/check-wasm-seal.mjs no longer states "drift detection only" — the source↔blob binding must ' +
      'print exactly its scope: it detects drift, never forgery; attestation is the registered L-4 debt.',
  );
}
if (/attests (?:the )?(?:toolchain|provenance)|provenance (?:is )?attested/u.test(wasmChecker)) {
  fail(
    'scripts/check-wasm-seal.mjs claims attestation — wider than the binding proves. A hash comparison ' +
      'detects drift; a lying builder or a compromised toolchain is exactly the residue the registered ' +
      'wasm-toolchain-provenance debt exists for (P-5: a checker\'s printed claim is exactly its scope).',
  );
}

// --- the projection, and HANDOFF's one claim of it (falsifier 9) --------------

const byGate = projection(debts);
const handoff = read('docs/review/remediation/HANDOFF.md');
const claimAt = handoff.indexOf('registered debts block:');
if (claimAt === -1) {
  fail('HANDOFF.md carries no "registered debts block:" claim; the projection has nothing to agree with.');
} else {
  // The claim is one hard-wrapped sentence; read to the end of its paragraph.
  const paragraphEnd = handoff.indexOf('\n\n', claimAt);
  const claimText = handoff
    .slice(claimAt, paragraphEnd === -1 ? undefined : paragraphEnd)
    .replace(/\s+/gu, ' ');
  const claimed = new Map([...claimText.matchAll(/`([A-Z0-9-]+)` — (\d+)/gu)].map((m) => [m[1], Number(m[2])]));
  for (const [gate, entries] of byGate) {
    if (claimed.get(gate) !== entries.length) {
      fail(
        `the manifest computes ${entries.length} debt(s) blocking ${gate} and HANDOFF.md claims ` +
          `${claimed.get(gate) ?? 'none'} — the projection and the claim must agree in both directions.`,
      );
    }
  }
  for (const [gate, count] of claimed) {
    if ((byGate.get(gate) ?? []).length !== count) {
      fail(`HANDOFF.md claims ${count} debt(s) block ${gate} and the manifest computes ${(byGate.get(gate) ?? []).length}.`);
    }
  }
}

// --- report -------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`debts: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

const counts = { open: 0, paid: 0, waived: 0 };
for (const debt of debts) counts[debt.status] += 1;

if (GATE !== null) {
  if (!definesGate(GATE)) {
    console.error(`"${GATE}" is not a gate action-tree.md defines.`);
    process.exit(1);
  }
  const { blocking, waived } = evaluateGate(debts, GATE, ROOT);
  for (const debt of waived) {
    console.log(`waived  ${debt.id} — by ${debt.waiver.authority}, scope: ${debt.waiver.scope}, until ${debt.waiver.expiry} (waived is not paid)`);
  }
  if (blocking.length > 0) {
    console.error(`${GATE} BLOCKS — ${blocking.length} registered debt(s) unmet:`);
    for (const { debt, why } of blocking) console.error(`  - ${debt.id} (${debt.finding}): ${why}`);
    process.exit(1);
  }
  console.log(`${GATE}: no registered debt blocks — every entry for it is paid or validly waived.`);
} else if (CHECK) {
  console.log(
    `debts: ${debts.length} registered (${counts.open} open · ${counts.paid} paid · ${counts.waived} waived), ` +
      'entries valid, pins current, gate-class census total, homes agree. ' +
      "Scope: the manifest and its byte rules, plus §10.11's evidence table held to the X25519 payment record " +
      'in both directions — a gate arrival is evaluated by --gate, and blocking happens there.',
  );
} else {
  console.log(`debts: ${debts.length} registered — ${counts.open} open · ${counts.paid} paid · ${counts.waived} waived.`);
  console.log('what blocks what, computed from the manifest (never transcribed):');
  for (const [gate, entries] of [...byGate].sort(([a], [b]) => (a < b ? -1 : 1))) {
    console.log(`  ${gate} — ${entries.length}:`);
    for (const debt of entries) console.log(`    ${debt.id} (${debt.finding}) — expires ${debt.expiry}`);
  }
  console.log('a gate arrival consults: node scripts/check-debts.mjs --gate <name> (blocks while unmet).');
}
