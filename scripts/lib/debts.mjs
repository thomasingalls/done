/**
 * The debt manifest — `RC-9A`, ratified 2026-08-28, consolidated at the `S0-8`
 * regeneration.
 *
 * Every property Stage 0 defers to a later gate is exactly one entry in
 * `docs/review/remediation/debts.json`, carrying the debt floor's fields:
 * owner, one blocking gate, the required artifact, the falsifier that artifact
 * must survive, an expiry, and hashed inputs. "Later" is computed from the
 * manifest, never promised in prose: a gate consults it and **blocks** while
 * its debt is unpaid, expired or input-changed; an entry leaves only by a
 * payment record or a recorded waiver; and what-blocks-what is a projection
 * computed on demand.
 *
 * This module is the loader, the validators and the evaluator.
 * `check-debts.mjs` is the CLI that wires them into `pnpm check` and the gate
 * consultations; `check-traceability.mjs` reads the same manifest for its owed
 * rows — the `OWED` list this grew from lived in that script and was, per its
 * own docblock, *a declaration of debt, not a coverage claim*. Now the
 * declaration has the fields the ratification requires, and one home.
 *
 * **What a payment may credit** is `RC-9`'s receipt floor: an execution or a
 * dated observation at the debt's own gate — never a component KAT, never an
 * audit's history, never a Baseline citation (falsifier 8). Each entry's
 * `payment` block types what its receipt must carry and names the shapes it
 * refuses, so the refusal is a check rather than a convention.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const MANIFEST = 'docs/review/remediation/debts.json';

const STATUSES = new Set(['open', 'paid', 'waived']);
const DATE = /^\d{4}-\d{2}-\d{2}$/u;

export const hash12 = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);

/**
 * The exact byte slice of one numbered section: its heading line through the
 * line before the next heading of the same or a higher level — the
 * authority-map pin discipline, applied to a debt's inputs.
 */
export const section = (text, number) => {
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

/** Parse the manifest file, failing loudly rather than defaulting. */
export const loadManifest = (root) => {
  const doc = JSON.parse(readFileSync(join(root, MANIFEST), 'utf8'));
  if (doc.schema_version !== 1) {
    throw new Error(`${MANIFEST} has unsupported schema_version ${doc.schema_version}.`);
  }
  if (!Array.isArray(doc.debts) || doc.debts.length === 0) {
    throw new Error(`${MANIFEST} carries no debts; an empty manifest cannot be what the census expects.`);
  }
  return doc.debts;
};

const FIELDS = ['id', 'finding', 'property', 'owner', 'gate', 'artifact', 'falsifier', 'payment', 'expiry', 'registered', 'status', 'inputs'];

/**
 * Structural validation: the debt floor's fields, one debt per finding, dated
 * fields parseable, pins current. Corpus-level rules (the finding exists, the
 * gate is defined, the gate-class census is total) belong to the caller, which
 * holds the population.
 *
 * @returns {string[]} failures
 */
export const validateManifest = (debts, root) => {
  const failures = [];
  const read = (p) => readFileSync(join(root, p), 'utf8');
  const ids = new Set();
  const findings = new Set();

  for (const debt of debts) {
    const name = debt.id ?? '<unnamed>';
    for (const field of FIELDS) {
      if (debt[field] === undefined || debt[field] === null || debt[field] === '') {
        failures.push(`${MANIFEST}: "${name}" is missing "${field}" — the debt floor's fields are not optional.`);
      }
    }
    if (ids.has(debt.id)) failures.push(`${MANIFEST}: two entries share the id "${debt.id}".`);
    ids.add(debt.id);
    if (findings.has(debt.finding)) {
      failures.push(
        `${MANIFEST}: ${debt.finding} appears in two entries — one debt, one gate (the FU-15 shape, refused).`,
      );
    }
    findings.add(debt.finding);

    if (!STATUSES.has(debt.status)) {
      failures.push(`${MANIFEST}: "${name}" has status "${debt.status}"; the enum is open | paid | waived.`);
    }
    for (const field of ['expiry', 'registered']) {
      if (typeof debt[field] === 'string' && !DATE.test(debt[field])) {
        failures.push(`${MANIFEST}: "${name}" has ${field} "${debt[field]}", which is not a YYYY-MM-DD date.`);
      }
    }
    if (DATE.test(debt.expiry ?? '') && DATE.test(debt.registered ?? '') && debt.expiry <= debt.registered) {
      failures.push(`${MANIFEST}: "${name}" expires ${debt.expiry}, on or before its registration ${debt.registered}.`);
    }

    const payment = debt.payment ?? {};
    if (typeof payment.kind !== 'string' || !Array.isArray(payment.requires) || payment.requires.length === 0) {
      failures.push(
        `${MANIFEST}: "${name}" has no typed payment (kind + requires); an untyped debt is paid by anything, which is the checkbox decay the falsifier column exists to refuse.`,
      );
    }

    for (const pin of debt.inputs ?? []) {
      let text;
      try {
        text = read(pin.path);
      } catch {
        failures.push(`${MANIFEST}: "${name}" pins input ${pin.path}, which does not exist.`);
        continue;
      }
      const subject = pin.section == null ? text : section(text, pin.section);
      if (subject === null) {
        failures.push(`${MANIFEST}: "${name}" pins ${pin.path} §${pin.section}, and no such section heading exists.`);
        continue;
      }
      const current = hash12(subject);
      if (current !== pin.hash) {
        failures.push(
          `${MANIFEST}: "${name}" pins ${pin.path}${pin.section == null ? '' : ` §${pin.section}`} at ${pin.hash}, and the content is now ${current}. ` +
            'An input changed under the debt: re-read the entry, then re-pin it (the debt still binds) or amend it (the basis changed). Neither happens silently.',
        );
      }
    }

    if (debt.status === 'paid') failures.push(...validatePayment(debt));
    if (debt.status === 'waived') failures.push(...validateWaiver(debt));
    if (debt.status === 'open' && (debt.payment_record !== undefined || debt.waiver !== undefined)) {
      failures.push(`${MANIFEST}: "${name}" is open and carries a ${debt.payment_record ? 'payment record' : 'waiver'}; strike the status or the record, not neither.`);
    }
  }
  return failures;
};

/**
 * A payment credits an execution or a dated observation, receipted — never a
 * component KAT, an audit's history, or a compatibility-policy citation
 * (`RC-9` falsifiers 6 and 8). Exported for the gate evaluation and for the
 * negatives in test/debtManifest.test.ts.
 */
export const validatePayment = (debt) => {
  const failures = [];
  const name = debt.id ?? '<unnamed>';
  const record = debt.payment_record;
  if (record === undefined) {
    failures.push(`${MANIFEST}: "${name}" is marked paid with no payment record; a debt is paid by a receipt, or it is not paid.`);
    return failures;
  }
  const refused = debt.payment?.refuses ?? [];
  if (record.kind !== debt.payment?.kind) {
    const why = refused.includes(record.kind)
      ? `which this debt names as refused — ${debt.falsifier}`
      : `and this debt is paid only by "${debt.payment?.kind}"`;
    failures.push(`${MANIFEST}: "${name}" presents a "${record.kind}" as payment, ${why}.`);
    return failures;
  }
  for (const field of debt.payment?.requires ?? []) {
    if (record[field] === undefined || record[field] === null || record[field] === '') {
      failures.push(`${MANIFEST}: "${name}"'s payment record is missing "${field}", which its type requires.`);
    }
  }
  if (record.date !== undefined && !DATE.test(record.date)) {
    failures.push(`${MANIFEST}: "${name}"'s payment record has date "${record.date}", which is not a YYYY-MM-DD date.`);
  }
  // An external observation without a date and an expiry fails the gate that
  // reads it, and an expired one fails the same way (P-5 falsifier 14's
  // discipline, given its second half; first exercised by S0-10's X25519 table).
  if (debt.payment?.kind === 'dated-external-observation') {
    for (const field of ['source', 'date', 'expiry']) {
      if (record[field] === undefined || record[field] === '') {
        failures.push(`${MANIFEST}: "${name}"'s observation has no ${field}; an undated or unsourced observation is an assertion.`);
      }
    }
    if (DATE.test(record.expiry ?? '') && record.expiry < today()) {
      failures.push(`${MANIFEST}: "${name}"'s observation expired ${record.expiry}; an expired observation fails exactly as a missing one.`);
    }
  }
  return failures;
};

/** A waiver is an explicit, scoped, expiring, recorded decision naming its authority (`RC-9` falsifier 7). */
export const validateWaiver = (debt) => {
  const failures = [];
  const name = debt.id ?? '<unnamed>';
  const waiver = debt.waiver;
  if (waiver === undefined) {
    failures.push(`${MANIFEST}: "${name}" is marked waived with no waiver record.`);
    return failures;
  }
  for (const field of ['scope', 'expiry', 'authority', 'recorded']) {
    if (waiver[field] === undefined || waiver[field] === '') {
      failures.push(`${MANIFEST}: "${name}"'s waiver has no ${field}; a waiver without ${field} is an ambiguity, not a decision.`);
    }
  }
  if (DATE.test(waiver.expiry ?? '') && waiver.expiry < today()) {
    failures.push(`${MANIFEST}: "${name}"'s waiver expired ${waiver.expiry}; the debt blocks again.`);
  }
  return failures;
};

export const today = () => new Date().toISOString().slice(0, 10);

/**
 * Evaluate one gate's arrival: the entries that block it, each with the reason.
 * A debt blocks while unpaid, expired or input-changed; a validly waived debt
 * reports as waived and does not block, but never as paid.
 *
 * @returns {{blocking: {debt: object, why: string}[], waived: object[]}}
 */
export const evaluateGate = (debts, gate, root) => {
  const blocking = [];
  const waived = [];
  for (const debt of debts.filter((d) => d.gate === gate)) {
    const pinFailures = validateManifest([debt], root).filter((f) => f.includes('pins'));
    if (pinFailures.length > 0) {
      blocking.push({ debt, why: 'its hashed inputs changed and the entry was not re-read' });
      continue;
    }
    if (debt.status === 'waived') {
      const bad = validateWaiver(debt);
      if (bad.length > 0) blocking.push({ debt, why: bad.join('; ') });
      else waived.push(debt);
      continue;
    }
    if (debt.status === 'paid') {
      const bad = validatePayment(debt);
      if (bad.length > 0) blocking.push({ debt, why: bad.join('; ') });
      continue;
    }
    const expired = debt.expiry < today();
    blocking.push({
      debt,
      why: expired
        ? `unpaid and expired ${debt.expiry} — the registration itself must be re-affirmed`
        : `unpaid — required: ${debt.artifact}`,
    });
  }
  return { blocking, waived };
};

/** What blocks what, computed from the manifest on demand — never transcribed beside it. */
export const projection = (debts) => {
  /** @type {Map<string, object[]>} */
  const byGate = new Map();
  for (const debt of debts) {
    if (debt.status === 'paid' || debt.status === 'waived') continue;
    byGate.set(debt.gate, [...(byGate.get(debt.gate) ?? []), debt]);
  }
  return byGate;
};
