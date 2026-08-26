---
schema: 1
kind: finding
id: f-dbfd01f-device-lock-rotation-caveat-lost
status: validated
type: guarantee-overstatement
severity: medium
confidence: high
introduced_by: dbfd01f54cdfcab994ac7df2298ba0da0bbe7da9
work_item: B-04
created_by: /root
updated: 2026-08-26
challenged_by: root-v01-20260826
superseded_by: none
---

# `The normative device-lock copy promises immediate forward protection while its selection permits rotation to remain owed`

## Affected requirement or guarantee

The optional device lock is meant to protect content written after enrollment from a profile copy made before
enrollment. Its user-facing boundary is therefore temporal: either content-key rotation succeeds and the product may
say “from now on,” or the copy must disclose that full protection waits for the next rotation.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/PRD.md` §7.2 and
`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §13.3 leave device-lock derivation, enrollment migration,
and copy open while requiring the default opener to disappear and preserving the distinction from account and
recovery proof (`OC-026`, `OC-075`).

## End-state source

At `9edd9300adebcec3abd2234c946f1dcccdc17eef`, `docs/PRD.md` §7.2 says enrollment rotates the content key and
therefore the promise is “from now on”; `docs/TRD.md` §13.3 likewise says enrollment reseals and then rotates and
that rotation protects everything written from that point. The same SHA's
`docs/selections/row-13-device-lock.md` §§4–5 still persists `rotation_owed` and says that if ordinary rotation
cannot be invoked locally, the flag remains true until a later ordinary rotation and the copy must say protection
takes full effect then.

## First introduction and propagation

`f5def83ac6f21873ab7fb589247dd116fc2febd9` selects the lock and explicitly records the soft joint: Stage 4's
multi-device rotation may not be locally invocable, so enrollment can finish locked but unrotated. The first
requirements fold at `dbfd01f54cdfcab994ac7df2298ba0da0bbe7da9` carries the unconditional happy path into PRD
§7.2, TRD §13.3, and TRD §15 row 13 but drops both `rotation_owed` and the conditional copy. That divergence remains
at the pinned tip.

## Reachable consequence

If a device completes factor resealing while the ordinary multi-device rotation operation is unavailable or has not
committed, a pre-enrollment profile copy still holds the current `K_g`. It can therefore open ciphertext written
before the eventual rotation even though the product has told the owner that protection applies “from now on.” The
factor gate itself remains sound; the failure is an overstated post-enrollment confidentiality boundary.

## Supporting evidence

The selection's state table makes step 3 atomically install locked custody and step 4 separately clear
`rotation_owed`; it calls locked-and-unrotated weaker but recoverable. Its §5 states the exact alternative copy if
rotation cannot be invoked locally. The normative fold describes only “reseals and then rotates” and exposes no
pending state or qualified promise. Later row-15 work makes rotation service-committed but does not establish that a
device-lock enrollment always completes that commit before showing the copy.

## Counterevidence and disconfirmation attempt

Before Stage 4, a one-device workspace can rotate unilaterally, so the unconditional wording is correct for the
initial local-only implementation. I tested whether later protocol selections guarantee the same ordering after
multi-device admission. They specify intent/outcome and fail-closed rotation, but do not delete `rotation_owed` from
row 13 or prove enrollment cannot reach locked state before the ordinary rotation outcome. The selection's explicit
contingency therefore remains live rather than historical.

## Validation procedure

1. Model enrollment with an admitted second device and make the rotation service unavailable after the factor/envelope
   transaction commits.
2. Confirm that custody is `locked` with `rotation_owed: true` and that new writes still use the pre-enrollment
   generation until an ordinary rotation outcome commits.
3. Restore a profile snapshot taken before enrollment and attempt to open those intervening records.
4. Reconcile the observed state with the exact copy shown to the owner.

## Disposition

Clarify and test. Either make successful rotation a precondition for presenting enrollment as complete, or preserve
the selection's pending state and conditional copy in the normative PRD/TRD.
