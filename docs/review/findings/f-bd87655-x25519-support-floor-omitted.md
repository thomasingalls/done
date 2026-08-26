---
schema: 1
kind: finding
id: f-bd87655-x25519-support-floor-omitted
status: validated
type: contradiction
severity: low
confidence: high
introduced_by: bd876553c8a2be17ff55c399f416d7eed9075935
work_item: B-03
created_by: /root
updated: 2026-08-26
challenged_by: root-v01-20260826
superseded_by: none
---

# The capability-specific support-floor inventory omits WebCrypto X25519 required by selected HPKE

## Affected requirement or guarantee

TRD §10.11 says every design dependency that Baseline cannot resolve gets a capability-specific floor, evidence,
date, and absence behavior, and calls Ed25519 and PRF the whole current list. Suite 1 selects HPKE base mode with
DHKEM(X25519) for recovery and reader wraps.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` leaves the algorithm suite and support behavior
open. Original claims `OC-004`, `OC-042`, and `OC-045` require portable, testable recovery and device admission
without silently assuming an unavailable platform primitive.

## End-state source

`9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/TRD.md` §§10.11, 13.10, and 15 still select X25519 HPKE
but inventory only Ed25519 and PRF as capability-specific support questions. The end-state row-14 selection still
states that X25519 in WebCrypto is the same missing support-floor class and is load-bearing in Stage 4.

## First introduction and propagation

Introduced by `bd876553c8a2be17ff55c399f416d7eed9075935`: it adds §10.11's “whole current list” while leaving
the parent row-14 warning intact. Row 1 then marks the availability debt closed only for Ed25519. Stage-4 HPKE
recovery and public-key wrap paths inherit the gap.

## Reachable consequence

If a supported browser lacks the exact WebCrypto X25519 operations the HPKE implementation expects, recovery-key
wrapping, content-generation delivery, or reader admission cannot execute. Unlike optional PRF, there is no stated
absence path. Current compatibility data makes an immediate browser incompatibility unlikely, but the policy and
test debt remain incomplete and can regress unnoticed as the moving floor changes.

## Supporting evidence

`bd87655:docs/selections/row-14-recovery-code.md` §8 explicitly says X25519 is the same class of support-floor
assumption as Ed25519 and should be answered once before Stage 4. `bd87655:docs/selections/row-1-algorithm-suite.md`
selects X25519 HPKE but provides no HPKE vector, while `bd87655:docs/TRD.md` §10.11 declares only Ed25519 and PRF
to be the complete list. Baseline's aggregate WebCrypto feature cannot establish per-algorithm support.

## Counterevidence and disconfirmation attempt

Contemporary MDN compatibility data reports X25519 across current core engines, so the selected algorithm likely
clears the policy today. That does not resolve the contradiction: the commit's own rule requires dated
capability-specific evidence and absence behavior, and the build has neither an X25519/HPKE conformance check nor
a fallback. The finding is therefore a coverage gap, not a claim that current browsers are incompatible.

## Validation procedure

Add a dated WebCrypto X25519 compatibility table beside Ed25519, state the behavior for absence, and exercise the
exact key generation/import/derive operations used by the Stage-4 HPKE construction in the declared browser matrix.
Add a published RFC 9180 vector once the selected implementation exists.

## Disposition

Clarify and test. Include X25519 in §10.11's capability-specific inventory and keep the Stage-4 support check open
until the exact HPKE implementation passes on the current floor.
