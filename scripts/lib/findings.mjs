/**
 * The findings population, read once for every checker that consumes it.
 *
 * Two checkers need the same two homes — the findings directory's own
 * frontmatter and `end-state-materiality.md`'s four class tables:
 * `check-traceability.mjs` (which findings require a falsifier) and
 * `check-debts.mjs` (which findings are deferred to a later gate and must be
 * registered debts). Parsing them twice would be two readers to keep agreeing;
 * this module is the one reader, and each consumer applies its own rules.
 *
 * **The population is pinned** (`S0-9` round 1, matrix limit 5: *nothing pins
 * the population — deleting a finding from all four sources regenerates green
 * with a smaller denominator*). `census.json` carries `findings_population`:
 * the count and a SHA-256 over the sorted ids. Deleting or adding a finding
 * now fails here — in every consumer at once — until the pin is deliberately
 * re-stated in the same commit, which is the authority-map discipline applied
 * to the denominator itself.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const FINDINGS = 'docs/review/findings/';
const MATERIALITY = 'docs/review/remediation/end-state-materiality.md';
const CENSUS = 'docs/review/remediation/census.json';

const CLASSES = [
  ['design', '## Current design defects', '## Current closure/evidence defects'],
  ['closure', '## Current closure/evidence defects', '## Explicit later'],
  ['gate', '## Explicit later', '## Historical-only'],
  ['historical', '## Historical-only', '## Unresolved product choice'],
];

/**
 * Read the population from its two homes, verify the pin, and report every
 * disagreement. Throws only when a home is unreadable enough that nothing can
 * be checked; ordinary disagreements land in `failures` for the caller.
 *
 * @param {string} root repository root, with trailing separator or not
 * @returns {{
 *   declared: Map<string, {severity: string, status: string}>,
 *   classOf: Map<string, string>,
 *   failures: string[],
 * }}
 */
export const readFindings = (root) => {
  const read = (p) => readFileSync(join(root, p), 'utf8');
  const failures = [];

  /** @type {Map<string, {severity: string, status: string}>} */
  const declared = new Map();
  for (const file of readdirSync(join(root, FINDINGS))) {
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

  const materiality = read(MATERIALITY);
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

  // The pin: both homes must also agree with the deliberately stated denominator.
  let pin;
  try {
    pin = JSON.parse(read(CENSUS)).findings_population;
  } catch (error) {
    failures.push(`${CENSUS} cannot be read: ${error.message}`);
    pin = undefined;
  }
  if (pin === undefined) {
    failures.push(`${CENSUS} carries no findings_population pin; an unpinned population shrinks silently.`);
  } else {
    const ids = [...declared.keys()].sort();
    const idsSha = createHash('sha256').update(ids.join('\n')).digest('hex');
    if (pin.count !== ids.length || pin.ids_sha256 !== idsSha) {
      failures.push(
        `the findings population is ${ids.length} ids at ${idsSha.slice(0, 12)}… and ${CENSUS} pins ` +
          `${pin.count} at ${String(pin.ids_sha256).slice(0, 12)}…. A finding was added or removed: ` +
          'restate the pin in the same commit, or restore the record. Neither happens silently.',
      );
    }
  }

  return { declared, classOf, failures };
};
