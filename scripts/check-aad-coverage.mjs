/**
 * Prove that every field bound in an AAD has a negative isolating it.
 *
 * `pnpm vectors:check` proves that every published negative still fails. That
 * is the wrong direction on its own: it cannot see a field that no negative
 * ever touches, and a construction whose `kind` or `purpose` is in the AAD but
 * in no `must_fail` entry passes it with nothing to show. docs/decisions.md
 * adopted the rule — every field bound in an AAD needs a published negative
 * that changes that field and nothing else — and closed with the admission that
 * the audit behind it was performed by hand and left out of the build. This is
 * that audit, run on every invocation.
 *
 * For each AAD construction, for each field in it: re-run the generator with
 * that field removed from the AAD, at seal time and at open time alike, and
 * watch which negatives stop failing.
 *
 *   - A negative that stops failing differed from the base vector in that field
 *     and nothing else. The cipher establishes it; nobody has to read the
 *     vector and agree.
 *   - A field where *no* negative stops failing is bound by the construction
 *     and tested by nothing.
 *
 * The converse is checked as **identity, not arity** (`S0-8`; round 1's limit:
 * swapping what two `aad-only-*` negatives test left the audit green with both
 * attributions wrong, because only the rescue *count* was checked). A negative
 * claiming isolation declares its one target on the published entry itself —
 * `isolates: "construction.field"` — and the cipher's rescue attribution must
 * equal that declaration exactly. Rescued by nothing, by two fields, or by a
 * different field than declared each fails; a name is not a claim.
 *
 * **Generators are discovered rather than listed.** A file matching
 * `scripts/generate-*-vectors.mjs` that does not report its constructions is a
 * failure here, not a silent omission — a new construction arriving with an
 * untested field is precisely what this exists to catch, and a hand-maintained
 * list is how it would get past.
 *
 * Usage: node scripts/check-aad-coverage.mjs
 */

import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { MARKER } from './lib/aad-coverage.mjs';
import { installReceipt } from './lib/receipts.mjs';

installReceipt(import.meta.url);

const run = promisify(execFile);

const SCRIPTS = import.meta.dirname + '/';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONCURRENCY = 8;

/**
 * What a generator emits on its marker line, in either of the two modes.
 *
 * @typedef {object} Report
 * @property {Record<string, string[]>} [constructions] Listing mode: AAD name to field names, in encoding order.
 * @property {{name: string, isolates: string|null}[]} [negatives] Listing mode: the published must_fail entries' names and isolation declarations.
 * @property {string[]} [rescued] Elision mode: the negatives that stopped failing.
 * @property {string} [error] Elision mode: the driver named a field no AAD builder has.
 */

/** @param {string} p */
const rel = (p) => p.slice(ROOT.length);

/**
 * Run one generator and parse the single line it addresses to us.
 *
 * @param {string} script
 * @param {Record<string, string>} env
 * @returns {Promise<Report>}
 */
const probe = async (script, env) => {
  let stdout = '';
  try {
    ({ stdout } = await run(process.execPath, [script], {
      cwd: ROOT,
      env: { ...process.env, ...env },
    }));
  } catch (err) {
    // A non-zero exit is only ever a real failure here. The audit's own signal
    // — a negative that stopped failing — is collected and reported with exit
    // code 0, precisely so that a generator throwing for some unrelated reason
    // stays distinguishable from it.
    const { stdout: out, stderr, code, message } = /** @type {any} */ (err);
    const detail = [out, stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${rel(script)} exited ${code ?? '?'}:\n${detail || message}`, { cause: err });
  }

  const line = stdout.split('\n').find((l) => l.startsWith(MARKER));
  if (line === undefined) {
    throw new Error(
      `${rel(script)} reported no AAD constructions.\n` +
        '  Every scripts/generate-*-vectors.mjs must import reportAudit() from\n' +
        '  scripts/lib/aad-coverage.mjs and call it after its last negative —\n' +
        '  including generators with no AAD at all, which report an empty set.',
    );
  }
  return /** @type {Report} */ (JSON.parse(line.slice(MARKER.length)));
};

/**
 * Run tasks with a bounded number in flight; each generator run is a whole node process.
 *
 * @template T
 * @param {(() => Promise<T>)[]} tasks
 * @returns {Promise<T[]>}
 */
const pool = async (tasks) => {
  /** @type {T[]} */
  const results = Array.from({ length: tasks.length });
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, async () => {
    for (let i = next++; i < tasks.length; i = next++) results[i] = await tasks[i]();
  });
  await Promise.all(workers);
  return results;
};

/** @param {string} script */
const auditGenerator = async (script) => {
  const { constructions = {}, negatives = [] } = await probe(script, { DONE_AAD_LIST: '1' });

  const targets = Object.entries(constructions).flatMap(([construction, fields]) =>
    fields.map((field) => ({ construction, field })),
  );

  const reports = await pool(
    targets.map((t) => () => probe(script, { DONE_AAD_ELIDE: `${t.construction}:${t.field}` })),
  );

  /** @type {string[]} */
  const failures = [];
  // Negative name to the fields whose elision rescued it.
  /** @type {Map<string, string[]>} */
  const rescuedBy = new Map();

  targets.forEach((t, i) => {
    const { rescued = [], error } = reports[i];
    if (error !== undefined) {
      failures.push(`${t.construction}.${t.field}: ${error}`);
      return;
    }
    if (rescued.length === 0) {
      failures.push(
        `${t.construction}.${t.field} is bound in the AAD and no negative isolates it.\n` +
          `      Removing it from the AAD left every negative in ${rel(script)} still failing,\n` +
          '      so nothing published is testing that binding. Add a negative that changes\n' +
          `      ${t.field} and nothing else, named aad-only-*.`,
      );
      return;
    }
    for (const name of rescued) {
      rescuedBy.set(name, [...(rescuedBy.get(name) ?? []), `${t.construction}.${t.field}`]);
    }
  });

  // The converse, as identity: a declared isolation must be exactly what the
  // cipher establishes. An aad-only name without a declaration is refused too —
  // a name the audit cannot hold to anything is the arity-only contract back.
  for (const { name, isolates } of negatives) {
    if (isolates == null) {
      if (name.includes('aad-only-')) {
        failures.push(
          `"${name}" claims isolation by name and declares no target. The claim is a declaration\n` +
            "      on the published entry — isolates: 'construction.field' — held to the cipher's\n" +
            '      rescue attribution; a name is not a claim (S0-8, identity rather than arity).',
        );
      }
      continue;
    }
    const fields = rescuedBy.get(name) ?? [];
    if (fields.length === 1 && fields[0] === isolates) continue;
    failures.push(
      fields.length === 0
        ? `"${name}" declares isolates: ${isolates} and no elision rescues it. It keeps failing\n` +
            '      with every field removed in turn, so it is failing on a wrong key or on a\n' +
            '      second field it also changes — which is what the declaration says it does not do.'
        : fields.length === 1
          ? `"${name}" declares isolates: ${isolates} and the cipher attributes it to ${fields[0]} —\n` +
            '      the declaration and the establishment disagree, which is the swapped-attribution\n' +
            '      defect the identity rule exists to refuse.'
          : `"${name}" declares isolates: ${isolates} and is rescued by ${fields.length} fields: ${fields.join(', ')}.`,
    );
  }

  return { script, constructions, targets, failures };
};

const main = async () => {
  const scripts = (await readdir(SCRIPTS))
    .filter((f) => /^generate-.*-vectors\.mjs$/u.test(f))
    .sort()
    .map((f) => SCRIPTS + f);

  if (scripts.length === 0) throw new Error('No scripts/generate-*-vectors.mjs found.');

  const audits = await pool(scripts.map((s) => () => auditGenerator(s)));

  let fields = 0;
  let failed = 0;
  for (const audit of audits) {
    fields += audit.targets.length;
    const names = Object.keys(audit.constructions);
    const summary =
      names.length === 0
        ? 'no AAD'
        : names.map((n) => `${n} (${audit.constructions[n].length})`).join(', ');
    console.log(
      `${audit.failures.length === 0 ? '  ok' : 'FAIL'}  ${rel(audit.script)} — ${summary}`,
    );
    for (const f of audit.failures) {
      failed += 1;
      console.log(`      ${f}`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} AAD coverage failure${failed === 1 ? '' : 's'}.`);
    process.exit(1);
  }
  console.log(`\n${fields} AAD fields, each isolated by a published negative.`);
};

await main();
