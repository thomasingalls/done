# Plaintext-residue evidence assessment — F-21.4

2026-09-12. Source baseline: signed `f118127c3156de1bac44cc731e51ffc2296643f5`.

**F-21.4 remains open; preparation is complete.** Importance: **high assurance**, because the
confidentiality claim requires observation of plaintext carriers beyond the successful encryption path.
This assessment does not demonstrate a current content leak. The original review's concern is valid,
but existing custody and cleanup tests deserve their narrower credit.

C13 copies complete synthetic Chromium profiles and attempts known root openers against retained
content and a synthetic future receiver. It includes factor-present and planted promptless-opener
controls. That is useful custody evidence; it is not a neutral search for content. Cleanup tests
establish absence of known legacy namespaces and retention of the encrypted destination. They do
not scan arbitrary browser carriers, physical database remnants or all logs.

The [test contract](../../account-residue-testing.md) and
[surface inventory](../../account-residue-prep/surfaces.json) separate logical-carrier scans (R1),
physical filesystem residue (R2) and copied-profile custody (C13). They require independent acquisition,
matching before redaction/hashing, unknown-key discovery, representation and collector controls,
explicit incomplete results and independent live/cold content checks. A clean empty scenario or a
successful decryption cannot substitute for the measurement. Fragmentation, compression and opaque
key capabilities limit what the first negative result can establish.

Two source distinctions matter. Current actor/device-label edits use encrypted document metadata;
the legacy plaintext device-name helper is not their current writer. Browser recovery preparation
does retain the registration retry capability and its exact finalization request. Those known
sensitive locations must be reported separately; the protocol is not a blanket "no secrets at rest"
construction. The standard native preparation fixture bypasses that browser owner, so R1 must call
it explicitly. No runtime exposure is newly authorized by this inventory.

PRD acceptance item 13 still expected a copied default profile to unlock without a factor. It is
corrected to agree with the already selected mandatory-factor contract in PRD §7.2, TRD §11.1 and
SC-08. A planted promptless opener remains a positive control. The correction adds no empirical
evidence for platform-wide protection.

The [prep record](../../account-conformance-runs/2026-09-12-account-residue-prep.md) preserves the
lexical source query, 71 source pins and 23 inventory entries. Static references and preservation
are checked; no scanner, application test or plaintext-residue result was produced in this phase.

Next is R1 implementation: calibrated browser logical-storage, current service SQL and diagnostic
collectors, P0–P7 owner histories, an actual journal side-write leak control and 24 generated variations
after directed cases pass. Packaged UI/service-worker/export and migration/clear trials follow.
Physical residue and broader platform custody remain separate gates. No personal profile, recovery
file, server or real Account participates in these tests.
