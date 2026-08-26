---
schema: 1
kind: finding
id: f-b997cdb-attribution-self-replacement
status: validated
type: implementation-hazard
severity: medium
confidence: high
introduced_by: b997cdb6bfaabc0e73cbecbb444dc0df84044d71
work_item: B-02
created_by: /root
updated: 2026-08-26
challenged_by: root-v01-20260826
superseded_by: none
---

# An admitted credential can replace an existing card's attribution with a new valid claim naming itself

## Affected requirement or guarantee

TRD §§4.8, 7.4, 7.6 and 13.7 require card-creation attribution to remain source-authenticated through checkpoint,
trim, restore and migration without a checkpoint producer or later writer re-signing another source's work.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/PRD.md` §§5.3–5.4 and
`:docs/TRD.md` §§4.8, 7.4, 7.6 require source-authenticated attribution and forbid re-signing mixed history.
Original-contract claims `OC-011`, `OC-014` and `OC-033` preserve those boundaries.

## End-state source

`9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/selections/row-8-attribution-record.md` places a signed claim in a
“write-once” CRDT map keyed by card id, deliberately omitting accepted envelope position. It states any writer can
delete a record but says a forged replacement would not verify.

## First introduction and propagation

Introduced at `b997cdb6bfaabc0e73cbecbb444dc0df84044d71`; propagated into row 7 checkpoints, row 10 packages, TRD
historical-generation retirement, provenance states, and migration/continuity reasoning. No later commit adds a
creation-event or first-write binding.

## Reachable consequence

A compromised or malicious admitted credential can mutate the content root by replacing Alice's attribution entry
for an existing card with a new record naming the attacker's own credential/actor and signing that complete tuple
with its own valid key. The mutation travels in the attacker's accepted envelope. The replacement signature verifies
and can be exact against the current body. After checkpoint/trim removes earlier envelopes and a fresh device restores
the map, it has no prior value or accepted creation position with which to enforce “write once,” so the UI can report
the attacker as the verified creator.

## Supporting evidence

`b997cdb6bfaabc0e73cbecbb444dc0df84044d71:scripts/generate-attribution-vectors.mjs` verifies only a phone
signature over the unchanged laptop tuple under the laptop verifier. It does not construct the attacker-valid case:
change actor and credential to the phone, sign the new message with the phone key, then verify with the phone key.
The record format lacks a sequence, original envelope digest, or other creation-event commitment, and residence in
the CRDT gives every writer mutation/deletion capability acknowledged by the selection itself.

## Counterevidence and disconfirmation attempt

Changing fields inside Alice's existing signature or signing Alice's unchanged tuple with another key fails, as the
current negatives demonstrate. A returning client that has durably remembered Alice's first entry could reject a
replacement. Neither protects a fresh checkpoint/package restorer, which is the retention use case that motivated
the construction. Acceptance of the replacement envelope proves the attacker made that mutation, not that the card
was created in it.

## Validation procedure

Add a second-admitted-credential scenario that starts from an existing card/claim, applies a CRDT replacement with a
new self-consistent tuple and signature, compacts/checkpoints, and restores on a client with no prior claim map. The
current record-level verifier will report the replacement as valid. A corrected construction must retain or
authenticate first-creation state independently of the mutable snapshot.

## Disposition

Reopen row 8. Bind provenance to an immutable accepted creation event or an equivalent append-only/first-write
commitment that a fresh restorer can verify; a CRDT “write-once” convention and tuple signature alone are insufficient.
