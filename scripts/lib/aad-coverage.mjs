/**
 * The AAD-field coverage audit, and the hook the generators expose to it.
 *
 * docs/decisions.md records the rule: **every field bound in an AAD needs a
 * published negative that changes that field and nothing else.** It also
 * records the honest limit of the entry that adopted it — the audit was
 * performed by hand, by removing each field from each AAD in turn and
 * re-running, and that procedure was not in the build. `pnpm vectors:check`
 * proves every published negative still fails; it says nothing about whether
 * the negatives cover every bound field, so a future construction can arrive
 * with an untested one and a green check. This module is that procedure,
 * mechanized.
 *
 * **The audit is the hand procedure, not a proxy for it.** Elide one field from
 * one AAD construction, re-seal, and re-run every published negative. A
 * negative that *stops failing* under that elision differed from the base
 * vector in that field and in nothing else — which is the definition of an
 * isolating negative, established by the cipher rather than by inspection. If
 * no negative stops failing, nothing in the file was testing that field.
 *
 * A structural alternative was considered and rejected: the AAD encoding is
 * injective, so the published AADs could be parsed and compared field by field
 * without any cryptography. It is cheaper and it is weaker — it counts a
 * negative that changes the derived key *and* one AAD field as isolating that
 * field, which is exactly the confusion the rule was written to catch (row 13's
 * `factor` was bound in the HKDF `info` as well, and its obvious negative
 * passed whether or not the AAD bound anything).
 *
 * **Elision runs the generator in a subprocess**, driven by
 * scripts/check-aad-coverage.mjs through the two environment variables below.
 * A generator seals its vectors and asserts its negatives in one pass, often
 * inside `main`, so re-running under a mutation means re-running the process.
 * That also makes each mutation independent of the last, which a shared module
 * holding mutable state otherwise would not be.
 */

/** Set by the driver to enumerate a generator's AAD constructions and fields. */
const LIST = process.env.DONE_AAD_LIST === '1';

/** Set by the driver to one `"construction:field"` to remove from every AAD. */
const ELIDE = process.env.DONE_AAD_ELIDE ?? null;

/** The line the driver parses out of the generator's stdout. */
const MARK = '#aad-coverage ';

/** @type {Map<string, string[]>} */
const registry = new Map();
/** @type {Set<string>} */
const asserted = new Set();
/** @type {Set<string>} */
const rescued = new Set();
let elidedSomething = false;

const elision = (() => {
  if (!ELIDE) return null;
  const at = ELIDE.indexOf(':');
  if (at < 1 || at === ELIDE.length - 1) {
    throw new Error(`DONE_AAD_ELIDE must be "construction:field", got "${ELIDE}".`);
  }
  return { construction: ELIDE.slice(0, at), field: ELIDE.slice(at + 1) };
})();

const emit = (payload) => process.stdout.write(MARK + JSON.stringify(payload) + '\n');

/**
 * Declare an AAD's fields by name, in encoding order, and get back the values to
 * encode — minus the one field the driver is currently eliding.
 *
 * The caller keeps its own length-prefix and concatenation, because the
 * encoding is part of what each selection document specifies and belongs in the
 * file a reviewer reads. What moves here is only the field *list*, which is
 * what the audit needs to enumerate.
 *
 *   const aadForRecord = ({ principal, workspace, ... }) =>
 *     concat(...aadFields('content record', { label, principal, ... }).map(lp));
 *
 * @param {string} construction
 * @param {Record<string, string>} named
 * @returns {string[]}
 */
export const aadFields = (construction, named) => {
  const names = Object.keys(named);
  const seen = registry.get(construction);

  // One construction, one field list. A builder that includes a field
  // conditionally has two AADs sharing a name, and the audit would be
  // enumerating whichever of them happened to be built last.
  if (seen && seen.join('|') !== names.join('|')) {
    throw new Error(
      `AAD construction "${construction}" was built with two different field lists:\n` +
        `  ${seen.join(', ')}\n  ${names.join(', ')}`,
    );
  }
  registry.set(construction, names);

  const values = names.map((n) => named[n]);
  if (!elision || elision.construction !== construction) return values;
  if (!names.includes(elision.field)) return values;

  elidedSomething = true;
  return names.filter((n) => n !== elision.field).map((n) => named[n]);
};

/**
 * Assert that a negative fails, and record that it ran.
 *
 * Under an elision this stops throwing and starts *collecting*: a negative that
 * authenticates is the result the audit is looking for rather than a defect, so
 * the run has to continue past it to find every negative the elided field was
 * carrying.
 */
/**
 * @param {string} name
 * @param {() => unknown} fn
 */
export const refuses = async (name, fn) => {
  asserted.add(name);
  let failed = false;
  try {
    await fn();
  } catch {
    failed = true;
  }
  if (failed) return;
  if (elision) {
    rescued.add(name);
    return;
  }
  throw new Error(`Negative vector "${name}" succeeded when it must not.`);
};

/** The negatives that actually ran, for each generator's own published-versus-asserted check. */
export const assertedNames = () => [...asserted];

/**
 * Report to the driver and stop, or return and let an ordinary run finish.
 *
 * Call this once, after the last negative has been asserted and before the
 * document is assembled. On an ordinary run it does nothing at all.
 *
 * `publishedNegatives` is the file's own `must_fail` names. The driver checks
 * the converse of the coverage rule with them: a negative calling itself
 * `aad-only-` must be rescued by exactly one field.
 */
export const reportAudit = (/** @type {readonly string[]} */ publishedNegatives = []) => {
  if (LIST) {
    emit({ constructions: Object.fromEntries(registry), negatives: publishedNegatives });
    process.exit(0);
  }
  if (!elision) return;

  // A field the driver named and no AAD builder has ever heard of. This is a
  // driver bug or a renamed field, and reporting it as "no negative covers it"
  // would send whoever reads the failure looking for a missing test vector.
  if (!elidedSomething) {
    emit({
      elided: ELIDE,
      error: `no AAD construction "${elision.construction}" with a field "${elision.field}" was built`,
    });
    process.exit(1);
  }

  emit({ elided: ELIDE, rescued: [...rescued] });
  process.exit(0);
};

export const MARKER = MARK;
