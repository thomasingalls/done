# `P-8` — checkpoint semantic authority and immutable creation authority

**Decided:** 2026-08-26 · **Checkpoint:** `RC-5A`, retained replay witness plus semantic admission ·
**Head baseline after trim:** trust the admitting credential, with self-admission recorded as such ·
**Creation:** `RC-5C`, creator-committed card identity · **Status:** decided, not yet consolidated

Consolidation is [`S0-5`](../action-tree.md), which also needs `S0-2`. Adopts the single-owner precedent from
[`P-1`](./P-1-recipient-authority.md). Nothing below is implemented.

## The two defects

**Coverage.** The exercised verifier accepts a producer-signed manifest whose `sv`/`ds` need not describe the
decrypted snapshot, and whose accepted-head vector may advance beyond operations that snapshot represents. Once
suffix replay begins from those heads and old envelopes and keys are dropped, omitted accepted content is
unrecoverable. An encoding or selection bug produces this as readily as a malicious producer.

**Attribution.** Row 8 places standing claims in "a write-once map in the content root, keyed by card id." A
mutable CRDT map cannot enforce write-once; that is a convention, not an authority. A compromised admitted
credential replaces another source's entry with one naming itself, signs the complete tuple with its own valid
key, and ships it in its own accepted envelope. The replacement verifies, and can be exact against the current
body. After checkpoint and trim remove earlier envelopes, a fresh restorer has neither a prior value nor an
accepted creation position to enforce the rule against, so it reports the attacker as verified creator.

## The decision

### Checkpoint — `RC-5A`

A producer proposes; an eligible client materialises the snapshot, derives insertion and deletion coverage and the
suffix, names the generation opener, and signs a `SemanticAdmission` before any pre-checkpoint envelope may be
trimmed. The producer signature authenticates the proposal and never admits its semantics by itself.

**Two things a restorer checks are separated, because only one of them is a trust question:**

1. **Snapshot-to-coverage consistency is always re-derived locally and is mandatory.** The checkpoint carries the
   snapshot, so any fresh restorer can materialise it, re-derive `{sv,ds}`, and compare. No witness, no signature
   and no other party is involved. This half of the coverage defect is closed by arithmetic.
2. **The accepted-head baseline is the trust question**, because establishing that the head vector did not advance
   past what the snapshot represents requires the accepted events, which are exactly what trim removes.

For (2) the restorer trusts the admitting credential, and the record is honest about what that means: **a fresh
restorer's confidence in the head baseline is exactly its confidence in the admitting credential, and the design
does not pretend the head alone proves semantics.**

**Self-admission is permitted and recorded.** `P-1` selected single-owner authority, so the only eligible client
may be the producer itself. Requiring a second admitter would mean a single-device workspace can never checkpoint
and therefore retains envelopes without bound — the exact condition checkpoints exist to end, and the same
circularity that ruled quorum out in `P-1`. So: **a second eligible client must admit when one exists; where none
does, the producer self-admits and the `SemanticAdmission` names that it did.** A restorer can then see the weaker
provenance rather than infer a stronger one.

### Creation — `RC-5C`

A card's identifier commits to its creating credential and a signed `CreationCertificate`, so no other credential
can produce a valid replacement creator for the same id. Readers recompute the derivation. Editors may change the
body and produce "verified but edited" — row 8's honest reading, preserved — but cannot change creator or id.

## Why A rather than B

B requires "enough authenticated post-decryption event identity/order to prove semantics" and concedes that "an
opaque Merkle root alone is insufficient" and that "encrypted events make absence/first-event proofs impossible
unless stable privacy-sensitive identifiers or client-produced semantic witnesses are selected."

This design's spine is a content-blind relay (§7.2). B therefore either exposes post-decryption structure to the
service or falls back on client-produced witnesses — which is A under another name. It also reopens rows 5–8/10,
the service inventory, and the validated "one mark is enough" checkpoint-scope conclusion. That is a large amount
of demolition to arrive back where A already stands.

## Why C rather than D

C needs no new authority: the id carries the proof, so anti-replacement is structural rather than adjudicated. D
introduces an ordering authority with metadata and availability cost, and "composes naturally with either
checkpoint branch only if both use the same accepted-order domain" — a coupling C does not create.

**C's charged cost is close to zero now and rises quickly.** Card ids are `crypto.randomUUID()` today
(`src/lib/id.ts`), there are no external users, and row 21 already expects `id`, `author`, `origin` and
`createdAt` to be lost through the first-deployment cutover carrier. If ids change at cutover regardless, deriving
them from a creation commitment is nearly free — and it improves row 21's fidelity-archive branch, because
creation authority would then survive the cutover instead of being among the losses.

## Kept open: the portable-witness direction

The third option for the head baseline — make the proof travel so no restorer trusts any historical credential —
was **not** selected, and it should not be filed as merely rejected. It removes the trust question outright, makes
single-device workspaces first-class with no self-admission caveat, and eliminates the colluding
producer-and-verifier threat. It was set aside for one reason: retaining full replay inputs defeats the trim that
checkpoints exist to enable, and a succinct proof is new cryptography that would need its own review.

**The version worth evaluating is not "retain the events."** It is to make head-baseline correctness *arithmetic*
rather than replayed, by authenticating the mapping from accepted positions to the snapshot's own state-vector
clocks. Yjs state vectors are per-client clocks and the accepted chain is per-credential positions; if each
envelope authenticated the `(clientID, clock range)` its updates contribute, then summing those over the accepted
head vector yields an expected state vector that a restorer could compare against the snapshot's derived `sv`
directly — with no events, no witness, and no trusted admitter.

Two things to establish before that is more than an idea, both checkable without committing to it:

- **Row 4 does not bind it today.** The clear header carries `v, workspace, credential, epoch, gen, seq, nonce,
  digest` and the sealed body carries the actor and the update bytes. Nothing binds which clients and clock ranges
  those updates advance, so the mapping would be a row-4 change and would have to sit inside the seal, since the
  relay is not entitled to it.
- **Yjs client ids are not stable per device**, which is the real obstacle rather than the encoding. A `Y.Doc`
  draws a client id per instance, so one credential contributes under many client ids over its life and the
  mapping is not one-to-one. Whether an envelope can honestly enumerate the `(clientID, clock range)` pairs it
  carries — and whether deletions, which do not advance a clock, can be covered the same way — decides whether
  this reduces to arithmetic or quietly becomes replay again.

If that holds, it is a strictly better answer than the one selected here and should reopen this decision at
`S0-5` rather than waiting for a later stage. If it does not, the selected branch stands and this note records
why, so the question is not re-derived from scratch later.

## What `S0-5` must satisfy

1. A checkpoint omitting an accepted insertion or deletion fails admission.
2. A head vector reaching beyond the snapshot fails.
3. An extra operation present in the snapshot but not accepted fails.
4. A fresh restorer re-derives `{sv,ds}` from the snapshot and rejects a mismatch **without consulting any
   signature** — the local half must be independently sufficient for what it covers.
5. Producer-only admission fails wherever a second eligible client exists.
6. A self-admitted checkpoint is accepted where none exists, and the record names it as self-admitted.
7. Trim before the admission is signed fails.
8. Incomparable head-vector candidates are never ordered by wall clock; the selected authority retains or
   serialises them in its own order domain.
9. A whole valid self-replacement of another source's creation claim fails.
10. Card id and certificate substitution fails; a delete-and-recreate is visible as a new identity rather than
    forged continuity.
11. After trim, a fresh restore still reports the original creator.
12. Partial install activates neither content nor heads, and newest-checkpoint loss falls back to the
    second-newest with a surviving opener.

## What this reopens

PRD provenance and continuity; TRD §§4.5/4.8/7.6/10.4/13.7/14; rows 5/7/8/10/15; checkpoint and attribution
generators and vectors; suffix, trim and compaction requirements; restore and migration tests; `src/lib/id.ts` and
every card id reference.

## Rollback

Reconsider before package vectors depend on the chosen authority or order domain. The portable-witness note above
is an explicit invitation to reopen at `S0-5` if its two obstacles clear.

## What this does **not** decide

- The exact `CreationCertificate` encoding and the id derivation function. `S0-5` selects them; `P-8` requires
  only that another credential cannot produce a valid replacement creator for an existing id.
- Whether card and creation authority are destroyed together under compaction. That remains a product policy in
  `S0-5`'s compaction work.
- The admitting-client eligibility rule beyond adopting `P-1`'s single-owner authority — which credentials count
  as eligible verifiers is `S0-2`'s certified-set inventory.
