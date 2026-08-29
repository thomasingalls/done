---
schema: 1
kind: finding
id: f-c611666-rotation-reader-eligibility-missing
status: repaired
type: implementation-hazard
severity: high
confidence: high
introduced_by: c6116669030eedeea3d599bca0da3547114e6930
work_item: X-01
created_by: /root
updated: 2026-08-29
challenged_by: root-v01-20260826
superseded_by: none
---

# Rotation has no client-authenticated reader-eligibility state, so an authorization-only credential can receive the next key

## Affected requirement or guarantee

The authority split promises that a malicious authorization service may admit a credential but cannot cause an
existing client to deliver a content key without a separate user-mediated proof. Rotation must also distribute each
new generation to all legitimate remaining readers without requiring every device to be awake.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/PRD.md` §§6.3, 7.3–7.4 and 11 test 7, and the same SHA's
`docs/TRD.md` §§13.2, 13.5–13.7 and 11.2 test 7, require the authorization and content-delivery gates to remain
independent. Yet §13.5 makes the service-signed epoch the source of credentials/capabilities and §13.7 instructs an
owner client to wrap the next generation to every remaining reader wrapping key. This unresolved joint is already
present at the branch point (`OC-027`, `OC-029`, `OC-073`).

## End-state source

`9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/selections/row-11-enrollment-ceremony.md` authenticates one new
credential's wrapping public key and binds the first wrap to that ceremony, but defines no durable success artifact
that another client can verify at a later rotation. At the same SHA, `docs/TRD.md` §§13.5–13.7 retains the
service-signed credential/capability epoch and the every-remaining-reader rule. Row 15's exact rotation payload in
`scripts/generate-transition-vectors.mjs` contains `cutoff`, `excluded`, `recovery-wrap`, and a map of credential ids
to wraps; it has no content-delivery proof, proof digest, or independently authenticated eligibility set.

## First introduction and propagation

The contradictory requirements originate in the pinned base, `c6116669030eedeea3d599bca0da3547114e6930`.
`a073574fcb90f9f2a70fa1be2bae5dc1d9c364f3` authenticates the initial delivery but does not create a transferable
eligibility record. `4259822828060fe2b9592fa525cd9a17170af285` later makes rotation payloads and outcomes exact while
continuing to take the wrap map as input without validating why each recipient may receive the key. The gap survives
at the pinned tip and in end-state claims E-04, E-08, and E-10.

## Reachable consequence

1. A malicious authorization service admits a credential it controls with read capability and signs a successor
   epoch.
2. Existing clients correctly refuse the immediate enrollment wrap because no person completed row 11's ceremony.
3. Later, an honest owner performs an unrelated rotation—for example, revoking another device or enabling its local
   device lock.
4. The owner follows §13.7 and builds wraps for every remaining reader in the service-signed epoch. Nothing in the
   specified local or shared state distinguishes the service's credential from one whose delivery ceremony
   succeeded.
5. The service-controlled credential receives and opens `K_(g+1)`.

Authorization alone has then caused delayed rather than immediate content-key delivery. The service can decrypt the
new generation through its admitted recipient, violating the central non-custodial guarantee.

## Supporting evidence

An exact-tree search at `9edd930` finds “content-delivery proof” only in the conformance statement, not in an epoch,
credential, transition, or enrollment-success schema. Row 11 records that a mismatch spends a credential but defines
no corresponding authenticated success record. Row 15's generated `rotate` vector maps two credential ids directly
to opaque wraps and its generator checks sorting/signatures, not reader eligibility. RFC 9180 base-mode HPKE gives
the holder of the selected recipient private key the plaintext; it does not decide whether the application was
entitled to select that recipient: https://www.rfc-editor.org/rfc/rfc9180.html (retrieved 2026-08-21).

## Counterevidence and disconfirmation attempt

The strongest benign reading is that “remaining reader wrapping key” means only a credential that has already
completed content delivery, not every service-authorized credential with read capability. That reading would close
the attack only if clients share a durable, non-service-forgeable binding from credential id to wrapping public key
and successful ceremony. No such object, signer, persistence rule, propagation rule, or validation vector is
specified. A purely local record is also insufficient: a different honest device may later perform the rotation and
must distinguish successful enrollment from service-only admission without replaying the human ceremony.

## Validation procedure

1. Model an epoch with owner `A`, legitimate enrolled reader `B`, and service-admitted reader `M` whose row-11
   ceremony never completed.
2. Have `A` construct a rotation that excludes an unrelated credential and otherwise follows the current epoch.
3. Assert that no wrap to `M` is emitted or accepted and that `B` still receives one.
4. Make the test consume only durable state available to `A`; a boolean supplied by the authorization service is not
   an independent proof.
5. Repeat from a device that did not conduct `B`'s ceremony. The current model has no value with which to pass the
   discriminating assertion.

## Disposition

Reopen the authorization/decryption joint. Specify a durable client-authenticated reader-key eligibility artifact
that binds at least the workspace/lineage, credential id, wrapping public key, and completed delivery ceremony (or
an equivalent construction), make rotation validate it independently of service authorization, and add the delayed-
delivery adversarial vector above.

**Repaired — 2026-08-29** under the authorized `S0-10` disposition workflow (`docs/review/README.md` §Finding lifecycle states the standard; `remediation/traceability.md` is the
generated finding→falsifier matrix). The defect's return is refused by `certified-set-approved-by-an-impostor`,
`certified-set-from-another-epoch` and `certified-set-with-an-added-member` (enrollment vectors).
