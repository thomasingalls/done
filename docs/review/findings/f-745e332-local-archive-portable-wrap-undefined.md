---
schema: 1
kind: finding
id: f-745e332-local-archive-portable-wrap-undefined
status: repaired
type: implementation-hazard
severity: high
confidence: high
introduced_by: 745e332b061e0e964ae655e853f2f3b393667c66
work_item: X-05
created_by: root
updated: 2026-08-29
challenged_by: root-v01-20260826
superseded_by: none
---

# The never-established Local archive has no selected portable opener

## Affected requirement or guarantee

A fidelity archive of a purely Local workspace must be an exact encrypted restore source after the originating device is gone. Because Local has no account recovery keypair, the archive needs its own explicit portable wrap and a separately retained factor; the archive itself is ciphertext, not that factor.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/PRD.md` §8.3 and `:docs/TRD.md` §9.3 require an explicit Local portable wrap (`OC-044`). The same snapshot's continuity gate requires clean-device archive restore using only saved recovery material.

## End-state source

At `9edd9300adebcec3abd2234c946f1dcccdc17eef`, TRD §9.3 repeats that a Local archive has no account recovery keypair and needs an explicit portable wrap. `docs/selections/row-10-portable-package.md` makes never-established Local one of the supposedly selected package states, but its parts table describes the `recovery` part as account-style `R_pub` plus code-sealed `R_priv`. `scripts/generate-package-vectors.mjs` gives `never-established-archive` opaque checkpoint/generations/recovery digests and a device-signed manifest; it generates and opens a generation wrap only for the live account vector using the account recovery keypair.

## First introduction and propagation

The portable-wrap requirement exists at the pinned base. `745e332b061e0e964ae655e853f2f3b393667c66` closes row 10 by unifying never-established, live, and retired package shapes without defining the Local-specific keypair/code derivation, confirmation, seal, generation wrap, or restore algorithm. The omission propagates into tip TRD §§9.3 and 15, the package vector, row-20 closure, and continuity tests 4 and 9.

## Reachable consequence

1. A user creates a never-established Local workspace and an encrypted fidelity archive.
2. The originating profile/device is lost, leaving the archive and whatever code the UI instructed the user to save.
3. A clean independent client verifies the device-signed manifest and finds checkpoint/generation/recovery parts.
4. No selected construction says which private key the Local code opens, how that key is sealed, or how it unwraps the archived generation. Assuming the account `R_priv` contradicts the Local state; accepting the manifest signature supplies authenticity but no decryption capability.
5. The only remaining ciphertext cannot be restored, defeating the archive's load-bearing total-device-loss case.

The consequence is permanent availability loss in the strongest Local continuity scenario, not plaintext exposure.

## Supporting evidence

The exact-tip generator's `ARCHIVE_PARTS` contains only digests. Its HPKE `wrap` is produced once with `KEYS.recovery.r_pub`, attached to `live-cutover-package`, and opened only through the corresponding account `r_priv`. The never-established positive checks only a manifest signature. The exact `--check` therefore passes without exercising any Local opener, saved code, portable wrap, or clean-device decrypt/restore path.

## Counterevidence and disconfirmation attempt

TRD §9.3 explicitly says that a code opens the Local archive and that an explicit portable wrap is required, so the intended safety model is not absent. Row 14's generated-code/keypair pattern could be reused for an archive-only recovery identity. But no selection states that reuse, defines whether each archive or workspace gets the identity, specifies confirmation/rotation/loss semantics, or publishes bytes that a clean importer can open. Intent prose does not make the closed construction implementable.

## Validation procedure

1. Create a never-established Local workspace and archive under the selected format.
2. Delete all profile/device key material while retaining only the archive and the user-facing saved factor.
3. On a clean independent build, derive/open the portable private key, unwrap every required generation, decrypt the checkpoint, and restore exact CRDT state.
4. Add byte-isolating negatives for the code seal, public/private-key relation, generation wrap context, generation number, workspace, and archive state.
5. Repeat without any account credential, service, account recovery keypair, or original origin.

## Disposition

Reopen row 10's never-established state and row-20 closure. Select an archive-specific portable opener and exercise the full saved-factor-to-checkpoint restore path before claiming the Local fidelity archive is an exact restore format.

**Repaired — 2026-08-29** under the authorized `S0-10` disposition workflow (`docs/review/README.md` §Finding lifecycle states the standard; `remediation/traceability.md` is the
generated finding→falsifier matrix). The defect's return is refused by the archive negatives
enumerated in the matrix — `archive-manifest-signed-by-the-archiving-device`, the `aad-only-archive-*`
isolations and their siblings (package vectors).
