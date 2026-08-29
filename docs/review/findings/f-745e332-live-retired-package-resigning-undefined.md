---
schema: 1
kind: finding
id: f-745e332-live-retired-package-resigning-undefined
status: repaired
type: guarantee-overstatement
severity: medium
confidence: high
introduced_by: 745e332b061e0e964ae655e853f2f3b393667c66
work_item: X-05
created_by: root
updated: 2026-08-29
challenged_by: root-v01-20260826
superseded_by: none
---

# A live package cannot be upgraded to retired by importing only the terminal record under the selected manifest

## Affected requirement or guarantee

An offline replica or portable live package may later learn that its historical lineage was retired. Row 10 claims the same artifact is upgraded—not replaced—by importing the signed terminal record, while the package manifest continues to authenticate its state and complete part set.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/PRD.md` §6.9 (`OC-020`) permits an offline replica to retain a stale live head and later import terminal evidence. `:docs/TRD.md` §15 row 10 (`OC-072`) requires the terminal/cutover package to travel without depending on the old operator.

## End-state source

`9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/selections/row-10-portable-package.md` says a live package is upgraded to retired by importing the terminal record. Its signed manifest binds `lineage_state`, `lineage_head_digest`, `epoch`, `parts_digest`, and `assembled_by`. The same record says a live manifest is signed by a credential while a retired manifest is signed by the service/trust root. The exact-tip package generator constructs two independently signed manifests with those different values.

## First introduction and propagation

Introduced by `745e332b061e0e964ae655e853f2f3b393667c66` with row 10 and its vector. It propagates into tip TRD §§9.3, 14.4, and 15, the account-deletion story, and the claim that one importer upgrades one artifact across lineage states.

## Reachable consequence

1. A credential assembles a valid live package and signs its manifest.
2. The service later retires the lineage; an offline holder eventually receives the genuine signed terminal record but not a separately preassembled retired package manifest.
3. Replacing the live `head` part changes `parts_digest`; retirement also changes `lineage_state`, `lineage_head_digest`, `epoch`, and the required assembler identity.
4. The live credential signature no longer verifies, while the offline importer does not hold the service authorization private key required to sign the selected retired manifest.
5. Keeping the old manifest leaves the artifact live; accepting changed fields under the old signature defeats the field-binding negatives.

The holder cannot obtain the claimed authenticated in-place upgrade. Relaxing verification would create an integrity failure; preserving verification loses retirement labeling and terminal evidence in the portable artifact.

## Supporting evidence

In `scripts/generate-package-vectors.mjs`, `liveFields` is signed by the laptop credential. `retiredFields` changes five signed inputs and is signed anew by `KEYS.k_auth`. The `retired-presented-as-live` negative correctly proves that state cannot be changed under the retired signature. No transition vector takes a live manifest plus a signed terminal record and derives a verifiable retired manifest.

## Counterevidence and disconfirmation attempt

The old service can assemble and sign a complete retired terminal package before deletion, and importing that whole package satisfies the broader PRD handoff if it was durably delivered. That is a valid replacement/full-package path and is already constrained by the separate safe-survivor finding. It does not establish row 10's narrower claim that importing only the terminal record upgrades the existing live package without replacement. A terminal record could be designed to authorize a deterministic manifest transformation, but the selected carrier does not do so.

## Validation procedure

1. Start from the exact live package vector and retain its valid manifest/signature.
2. Supply only the genuine terminal record and public authorization history; remove the service signing private key.
3. Attempt the specified in-place upgrade and verify the resulting manifest under the selected verifier.
4. Require the result to bind retired state, terminal head, epoch, complete parts, and assembler without trusting unsigned importer choices.
5. If the intended path is instead full retired-package replacement, state that explicitly and test durable delivery/merge rather than claiming terminal-record-only upgrade.

## Disposition

Clarify and reopen the live-to-retired transition in row 10. Either define a signed deterministic upgrade authorized by the terminal record or narrow the guarantee to import of a complete service-signed retired package.

**Repaired — 2026-08-29** under the authorized `S0-10` disposition workflow (`docs/review/README.md` §Finding lifecycle states the standard; `remediation/traceability.md` is the
generated finding→falsifier matrix). The defect's return is refused by `live-manifest-relabelled-as-retired`
and `retired-manifest-under-the-assembling-credential` (package vectors).
