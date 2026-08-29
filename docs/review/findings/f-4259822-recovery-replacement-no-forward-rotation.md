---
schema: 1
kind: finding
id: f-4259822-recovery-replacement-no-forward-rotation
status: repaired
type: guarantee-overstatement
severity: high
confidence: high
introduced_by: 4259822828060fe2b9592fa525cd9a17170af285
work_item: X-04
created_by: /root
updated: 2026-08-29
challenged_by: root-v01-20260826
superseded_by: none
---

# Replacing an exposed recovery code keeps the generation the old recovery material already opens

## Affected requirement or guarantee

Recovery replacement exists for a code that was lost or exposed and claims to leave exactly the new recovery set
live. The original exclusion rule says lost read access is enforced by rotating the content generation so the
removed reader retains history but nothing newer.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/PRD.md` §7.4 says content rotates on lost read access, while
§7.6 already defines replacement as a new recovery keypair and rewrap of existing generations (`OC-029`, `OC-034`).
The base leaves interrupted replacement and rotation behavior open in TRD row 15, so the tension is not a settled
defect until the later transition choice closes that row.

## End-state source

At `9edd9300adebcec3abd2234c946f1dcccdc17eef`, `docs/selections/row-14-recovery-code.md` §5 says replacement is
for a lost or exposed code and rewraps every required existing generation to a new `R_pub`.
`docs/selections/row-15-transitions.md` selects `replace-recovery` as a distinct transition whose target is a
replacement counter; it does not create `K_(g+1)` or invoke `rotate`. TRD §13.8 says the old and new recovery sets
are never both live because the old code would still open content, but the active content generation is unchanged.

## First introduction and propagation

The base contains the rewrap-only replacement sketch and the general rotate-on-lost-read-access rule.
`4259822828060fe2b9592fa525cd9a17170af285` settles replacement as its own atomic transition without composing a
forward rotation. `ff0b48f8ce7f1878ac6abb9c849380800b55370c` strengthens step-up and explicitly preserves the lost-or-
exposed-code use case, but changes no generation. The omission survives into the tip PRD/TRD, transition and
recovery vectors, and service inventory.

## Reachable consequence

1. Before replacement, a party who knows the exposed old code obtains or retains the old code-sealed
   `RecoveryEnvelope` and a recovery wrap for current generation `g`. This may be a prior recovery attempt, a stale
   package, or material fetched while the party also had account/relay access.
2. The party can derive old `R_priv` and unwrap `K_g`; alternatively it retains those inputs and does so later.
3. The legitimate owner completes `replace-recovery`. The service deletes the old live set and installs new
   `R_pub`, wraps, and envelope, but honest devices continue writing under the same `K_g`.
4. Anyone holding the old material can decrypt later ciphertext under `g` whenever they can obtain it, until an
   unrelated rotation eventually occurs.

Replacement cannot erase history or a key already copied, but without a fresh generation it also does not bound
future exposure. The impact is continuing confidentiality loss after the UI reports the exposed code replaced.

## Supporting evidence

Exact-tip searches find no path that composes `replace-recovery` with `rotate`. The transition generator's
replacement payload contains `new-recovery-public-key` and `rewrapped-generations = 1|2|3|4|5`; unlike the rotate
payload it contains no new generation or reader/recovery wrap for one. Row 13 independently recognizes the same
temporal principle for a copied pre-lock opener and mandates a forward rotation because re-sealing the same `K_g`
does not protect later ciphertext.

## Counterevidence and disconfirmation attempt

If the old code was merely lost and no one copied the recovery envelope, wraps, or unwrapped key, deleting the old
service-held set is sufficient. The attack also ends at the next legitimate rotation and cannot revoke plaintext
already obtained. Those are bounds, not a disproof of the exposed-code case the selection explicitly claims to
serve. The design already accepts forward rotation as the way to make removal govern future rather than past access.

## Validation procedure

1. Save the old recovery envelope and current-generation wrap and unseal them with the old code.
2. Complete the exact selected recovery-replacement transition.
3. Write new content without an unrelated rotation and obtain its ciphertext.
4. Confirm the old `K_g` still decrypts it; this is the current expected result.
5. A corrected lifecycle must either atomically compose replacement with a new generation distributed only to the
   new recovery key and eligible readers, or explicitly narrow replacement copy to say that exposure persists until
   a separate rotation and make that rotation unavoidable.

## Disposition

Reopen recovery replacement. Treat an exposed recovery capability as lost read access and select/test the forward-
rotation composition or narrow the guarantee to the weaker deletion-of-service-state property.

**Repaired — 2026-08-29** under the authorized `S0-10` disposition workflow (`docs/review/README.md` §Finding lifecycle states the standard; `remediation/traceability.md` is the
generated finding→falsifier matrix). The defect's return is refused by the `replacement-payload
variants` guard (transition vectors), with TRD §13.7 selecting rotation as replacement's default —
`none-lost-not-copied` the only non-rotating value. The remainder declared on the claim — the composed
replacement-plus-rotation executing in the implementation — rides `L-2`, as the matrix states.
