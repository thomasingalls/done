---
schema: 1
kind: finding
id: f-3bea0e6-suite-separation-ignores-both-path
status: validated
type: evidence-weakness
severity: medium
confidence: high
introduced_by: 3bea0e69469e47b790fe6214d7fbed42bcf84441
work_item: B-04
created_by: /root
updated: 2026-08-26
challenged_by: root-v01-20260826
superseded_by: none
---

# `The suite-separation oracle silently excludes every role labeled both from both path buckets`

## Affected requirement or guarantee

TRD §§13.2 and 13.10 separate synchronous journal cryptography from asynchronous constructions. Row 1 explicitly
chooses the stronger reading—no primitive reused across the two paths—and claims a build-failing generator check
enforces that invariant for every suite role.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §15 row 1 asks for a concrete suite without primitive
reuse across asynchronous and synchronous paths (`OC-063`). `OC-039` and `OC-082` require evidence to test the exact
invariant rather than merely reproduce a producer's model.

## End-state source

At `9edd9300adebcec3abd2234c946f1dcccdc17eef:scripts/generate-suite-vectors.mjs`, the `hash` role remains
`{ primitive: 'SHA-256', path: 'both' }`. `checkSeparation()` constructs buckets only where
`r.path === 'async'` or `r.path === 'sync'`; consequently `both` enters neither set, cannot appear in their
intersection, and is published as if the separation check passed.

## First introduction and propagation

`3bea0e69469e47b790fe6214d7fbed42bcf84441` introduces both the `path: 'both'` role and the exact-match bucket
logic. Its selection prose says `checkSeparation()` buckets every role and places SHA-256 in the asynchronous set,
while the data labels that role `both` and the implementation drops it. Later coverage/AAD improvements leave this
logic unchanged through the pinned tip.

## Reachable consequence

A later suite edit can label a primitive `both`—intentionally or accidentally—and still receive a green vector check
even though the declared stronger invariant says that primitive is shared. Today the inconsistency is already visible
for SHA-256: either the role label is wrong and should name its actual path, or the stronger prose rule is not the
intended rule. Until resolved, CI cannot prevent cross-path primitive reuse of the class it claims to reject.

## Supporting evidence

At `3bea0e6:scripts/generate-suite-vectors.mjs` lines 108–113, SHA-256 is labeled `both`. Lines 342–370 at the
pinned form filter with equality for `async` and `sync` before intersecting the results; there is no expansion or
validation of `both`. Yet `3bea0e6:docs/selections/row-1-algorithm-suite.md` §3 says the generator buckets every role,
lists SHA-256 in the async set, and promises that any primitive appearing in both paths fails the build. Running the
exact generator with `--check` succeeds, demonstrating that self-consistency does not exercise the missing branch.

## Counterevidence and disconfirmation attempt

The narrower TRD §13.2 rule is about primitive *keys*, not primitive names, and journal HKDF derivation occurs once at
open on an asynchronous path. Under that intended boundary, reusing SHA-256 as a hash may be acceptable. But the row-1
selection deliberately adopts §13.10's stronger primitive rule and says that is what the oracle enforces. The finding
therefore does not assert SHA-256 reuse is cryptographically unsafe; it asserts that the declared oracle and rule are
not the implemented ones.

## Validation procedure

1. Add a temporary suite role `{ primitive: 'XChaCha20-Poly1305', path: 'both' }` and run the generator check; the
   current logic will not report a shared primitive.
2. Decide whether `both` is valid. If so, expand it into both buckets; if not, reject it as an invalid path value.
3. Add mutation tests for `async → both`, `sync → both`, unknown path labels, and actual shared primitives.
4. Reconcile the selection's set listing and the published vector with the chosen semantics.

## Disposition

Fix and clarify. Make path values exhaustive and make the oracle fail for the exact stronger invariant, or narrow the
normative claim to the key-domain property actually required by §13.2.
