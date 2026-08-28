/**
 * Where a repaired finding says which evidence refuses it.
 *
 * `S0-8` owes a matrix from every repaired finding to the falsifier that proves
 * it. The obvious way to build one is to write the table, and that is the
 * failure mode `P-5` rejected as Branch B: a hand-maintained table is a second
 * copy of every mapping, and this project has already shipped three artifacts
 * whose second copy went stale while every check stayed green
 * (`f-992bc91-network-carrier-registry-stale` is the type specimen).
 *
 * `RC-8C` states the rule: **one home per fact; every consumer reads the home;
 * where two artifacts must agree, the agreement is checked in both directions
 * by something that is neither of them.** So the claim lives *at the evidence*,
 * and docs/review/remediation/traceability.md is generated from it rather than
 * written beside it.
 *
 * There are two carriers in this module, because there are two kinds of
 * evidence in a generator and they have different liveness proofs.
 *
 * **A published negative carries its claim as a field.** `must_fail[].falsifies`
 * sits on the negative object itself, so the claim and the evidence are one
 * object and cannot disagree. That the negative still runs is already proved,
 * in both directions, by each generator's published-versus-asserted comparison:
 * a negative published and never asserted fails the generator, and so does one
 * asserted and never published.
 *
 * **A guard carries its claim by running.** Several falsifiers are not vectors
 * at all — `checkCarriers` reading each row's own status line, the opener
 * predicate refusing to drop a generation something still needs. Those are
 * assertions inside the generator, and a claim written *about* one in a comment
 * is the second copy again: delete the guard and the comment survives. So the
 * claim is registered from inside the guard body by `falsifies()` below, and
 * published by `claims()` into the vector file the generator writes.
 *
 * That makes `pnpm vectors:check` the liveness oracle, at no new cost: it
 * regenerates and compares, so a guard that stops running produces a file
 * missing its claim, and the comparison fails naming it. **The check that binds
 * the claim to the guard is neither the claim nor the guard** — it is the
 * regeneration diff, which is `RC-8C`'s third clause satisfied by machinery
 * that already existed.
 *
 * **The placement is for a reader, and a mutation established that.** Calling
 * `falsifies()` on the first line of the guard rather than at its call site
 * changed no result: either way, deleting the guard's invocation deletes the
 * claim, because `claims()` publishes only what registered during that run. So
 * the reason to keep it inside the body is that the claim then sits beside the
 * code a reviewer is checking — not that it proves anything the call site
 * would not. What is load-bearing is the registration happening at run time at
 * all; where in the run is not.
 */

/** @type {Map<string, Set<string>>} guard name to the findings it refuses. */
const registry = new Map();

/** Every finding id has this shape; a typo becomes a claim about nothing. */
const ID = /^f-[a-z0-9]+-[a-z0-9-]+$/u;

/** A partial repair names where the remainder is owed. */
const GATE = /^(?:L-[1-4]|H-1|S0-(?:10|[1-9]))$/u;

/**
 * Register, from inside a guard, the findings that guard refuses.
 *
 * Call it as the first statement of the function that performs the check. The
 * registration is the evidence that the guard ran, so a `falsifies()` sitting
 * beside the call rather than inside the body proves nothing.
 *
 *   const checkCarriers = () => {
 *     falsifies('checkCarriers', ['f-992bc91-network-carrier-registry-stale']);
 *     ...
 *   };
 *
 * A claim may be partial. `'f-bd87655-x25519-support-floor-omitted -> L-4'`
 * says this guard covers part of the finding and names who owes the rest —
 * which keeps the honest answer expressible, so a partial repair never has to
 * be published as a whole one to appear in the matrix at all.
 *
 * @param {string} guard The name of the check, as a reader would grep for it.
 * @param {readonly string[]} findings Finding ids, optionally `id -> gate`.
 */
export const falsifies = (guard, findings) => {
  if (findings.length === 0) {
    throw new Error(`falsifies("${guard}", []) claims nothing; omit the call instead.`);
  }
  const held = registry.get(guard) ?? new Set();
  for (const claim of findings) {
    const [id, gate] = claim.split(' -> ');
    if (!ID.test(id)) {
      throw new Error(`falsifies("${guard}"): "${id}" is not a finding id.`);
    }
    if (gate !== undefined && !GATE.test(gate)) {
      throw new Error(
        `falsifies("${guard}"): "${gate}" is not an action or gate that can owe the remainder.`,
      );
    }
    held.add(claim);
  }
  registry.set(guard, held);
};

/**
 * The claims that ran, for the generator to publish into its vector file.
 *
 * Sorted, because the published document is compared byte for byte and a map's
 * insertion order is an accident of which guard the generator called first.
 * Returns `undefined` when nothing registered, so a generator with no guard
 * claims publishes no empty object.
 *
 * @returns {Record<string, string[]> | undefined}
 */
export const claims = () => {
  if (registry.size === 0) return undefined;
  return Object.fromEntries(
    [...registry.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([g, s]) => [g, [...s].sort()]),
  );
};
