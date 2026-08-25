---
schema: 1
kind: commit-review
commit: b997cdb6bfaabc0e73cbecbb444dc0df84044d71
parent: 992bc9113093fe04d20df0247aa118d0f8ba365f
batch: B-02
classification: substantive
status: complete
owner: /root
started: 2026-08-21
updated: 2026-08-21
verdict: reopen
blocked_on: none
superseded_by: none
---

# Commit `b997cdb` — `Move attribution into the content root, and close the retention floor`

## Scope and exact sources

- Full object and parent diff: `b997cdb6bfaabc0e73cbecbb444dc0df84044d71` against
  `992bc9113093fe04d20df0247aa118d0f8ba365f`.
- `b997cdb6bfaabc0e73cbecbb444dc0df84044d71:docs/selections/row-8-attribution-record.md` and
  `:docs/selections/row-7-checkpoint.md`.
- `b997cdb6bfaabc0e73cbecbb444dc0df84044d71:scripts/generate-attribution-vectors.mjs` and
  `:scripts/generate-checkpoint-vectors.mjs`, with their committed JSON outputs.
- `b997cdb6bfaabc0e73cbecbb444dc0df84044d71:docs/{TRD,decisions,progress}.md`.
- Companion row 4/5/9/11 selection records amended by the commit.

## Change seen while moving backward

Returning to the parent removes standing per-card attribution claims from the content root and removes the full
encrypted checkpoint/manifest construction. In the parent, historical authorship still requires opening the source
envelopes and therefore retains historical generations without a bound. This commit attempts to close that floor by
snapshotting author-signed claims under the current content generation, then defines checkpoint coverage,
head-vector binding, rotation ordering, two-checkpoint retention, and project composition vectors.

## Original-contract trace

The attribution half addresses `OC-011`, `OC-014` and `OC-033`: preserve source identity without re-signing mixed
history, keep card provenance bounded rather than revision history, and make checkpoints attribution preserving.
The checkpoint half addresses `OC-033`/`OC-069`: a content-blind store needs a bounded full snapshot, insertion and
deletion coverage, accepted-head baseline, suffix, and fallback retention. The result later supports portability in
`OC-044`–`OC-046`.

## Construction and state-machine effect

### Attribution

At card creation, a credential signs workspace/card/actor/credential/epoch plus a commitment to the creation-time
body. The signed object lives in a purportedly write-once CRDT map beside the card. The signature and body commitment
answer different questions: who made the claim, and whether today's body is still exact. Trim/checkpoint moves the
claim forward under current content encryption, allowing old envelope keys to retire.

### Checkpoint

A full Yjs content-root snapshot is sealed under a workspace-separated checkpoint subkey. A producer-signed manifest
binds workspace, epoch/head, generation, ciphertext digest, opaque `sv` and `ds`, accepted-head-vector digest, and
producer. Rotation must admit a new-generation checkpoint before dropping the old key. At least two checkpoints and
their suffixes remain, and a failed newest checkpoint falls back atomically to the next-newest.

## Assumptions and guarantee boundaries

- A signature proves the named credential made one claim; it does not prove that claim was the first claim for a
  card or accompanied the card's creation.
- “Write once” is an application/state invariant, not a property of a collaboratively writable CRDT map. A returning
  device may remember an earlier entry; a fresh checkpoint restorer does not.
- Deleting a claim is explicitly accepted as availability loss. Replacement with a new, self-consistent claim is
  more serious because it can produce false verified attribution.
- Snapshot confidentiality/integrity is cryptographic under `K_g`; coverage and correspondence to accepted history
  are semantic claims by the producing credential.
- `{sv, ds}` can describe Yjs insertion/deletion coverage only if derived from and checked against the decrypted
  snapshot. The carrier signature alone proves only that the producer signed those bytes.
- Checkpoint cadence and concurrent-producer choice remain Stage 4/service decisions.

## Evidence and oracle independence

The attribution generator signs three positive tuples, distinguishes verified from exact, and checks ten isolated
field/signature negatives. The checkpoint generator checks AES-GCM/HKDF/Ed25519 carrier bindings, 18 negatives,
head-vector sorting, and separate `sv`/`ds` signature fields. Exact `--check` execution for both artifacts passed in
a disposable `b997cdb` snapshot on 2026-08-21.

Both generators are composition evidence under the same application model. Attribution's
`assembled-by-another-credential` keeps the original tuple naming the laptop and merely swaps the signature, so it
does not test a phone replacing the whole tuple with a phone-authored claim. The checkpoint generator uses a UTF-8
sentence as `SNAPSHOT` and unrelated hard-coded hex strings as `SV`/`DS`; it never parses Yjs, derives coverage from
the snapshot, or relates accepted-head positions to snapshot content.

## Downstream propagation

Row 8's claim residence is inherited by row 7 checkpoints, row 10 packages, migration, terminal deletion, historical
generation retirement, provenance UI, and the claim that checkpoint producers do not re-sign other authors. Row 7's
head vector and fallback retention feed row 6 anti-replay state and row 10 package suffixes. Both constructions
survive unchanged to the pinned tip.

## Consequences and residual failures

The creation-time body commitment correctly preserves “verified but edited” nuance, co-locating claims with cards
eliminates a separate store/migration path, and new-generation-before-old-key-drop plus two-checkpoint fallback are
sound lifecycle constraints.

However, any admitted credential can sign a new tuple naming itself, replace the CRDT map value for an existing card,
and deliver that mutation through its own accepted envelope. The new claim verifies under the key it names. Once a
checkpoint/trim removes the old operation history, a fresh restorer cannot distinguish replacement from creation;
the absent envelope position/creation event is exactly the missing invariant. The checkpoint evidence also does not
establish that its signed coverage fields correspond to the encrypted snapshot or accepted heads, leaving a future
verifier vulnerable to treating signed assertions as checked coverage.

## Falsification attempt and counterevidence

- I reran both exact committed generators; all published positives and negatives passed.
- I tested the intended benign case conceptually and against generator behavior: an edited body retains a valid claim
  but fails the exactness commitment, which is correct.
- I challenged claim replacement using a forged signature over the original laptop tuple; the existing negative
  correctly refuses it. I then let the second credential sign a complete tuple naming its own credential/actor. That
  is a valid signature over a valid claim and no retained position/creation binding exists to reject it after restore.
- I looked for a vector or specified fresh-restore invariant that proves “first entry for card id.” None survived;
  the selection acknowledges any writer can delete CRDT entries but assumes a forged replacement cannot verify.
- I checked whether the checkpoint vector derives `sv` or `ds` from its plaintext. It does not import Yjs; all three
  are independent constants. Field mutation negatives therefore cannot validate semantic coverage.

## Nuance preservation

The commit usefully separates attribution authenticity from body exactness, source claims from checkpoint-container
signatures, attribution retention from content-key retention, and forced rotation ordering from unmeasured cadence.
It loses the distinction between “credential signed this tuple” and “this tuple was the immutable claim accepted at
card creation,” and between “coverage bytes are signed” and “coverage bytes describe this snapshot/history.”

## Verdict

`reopen`: lifecycle ordering, encryption, field binding, and retention are well supported, but row 8 does not make
write-once provenance enforceable for a fresh restorer and the row-7 evidence does not exercise its central coverage
relationship. Those are load-bearing reasons the historical generation/envelope floor was declared closed.

## Findings and unresolved checks

- `f-b997cdb-attribution-self-replacement` — an admitted writer can replace a claim with one that validly names itself.
- `f-b997cdb-checkpoint-coverage-unchecked` — the vector never relates snapshot, `{sv,ds}`, and accepted heads.
- Stage 4 still owes checkpoint concurrency/selection, partial-install rollback, and measured cadence.
