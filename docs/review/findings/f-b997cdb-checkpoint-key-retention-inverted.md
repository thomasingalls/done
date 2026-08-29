---
schema: 1
kind: finding
id: f-b997cdb-checkpoint-key-retention-inverted
status: repaired
type: contradiction
severity: medium
confidence: high
introduced_by: b997cdb6bfaabc0e73cbecbb444dc0df84044d71
work_item: X-03
created_by: /root
updated: 2026-08-29
challenged_by: root-v01-20260826
superseded_by: none
---

# The checkpoint retention rule names the checkpoint rather than the key, so the old generation can be dropped while fallback still needs it

## Affected requirement or guarantee

At least two checkpoints and their suffixes must remain usable so a client can fall back when the newest checkpoint
is unavailable. Because each checkpoint is sealed under one content-key generation, at least one usable unwrap path
for every retained checkpoint generation must survive for the same interval.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §7.6 and `OC-033`/`OC-069` require retained fallback
checkpoints and explicitly make fallback restore a test. The construction and generation-retention interlock were
open.

## End-state source

At `9edd9300adebcec3abd2234c946f1dcccdc17eef`, `docs/selections/row-7-checkpoint.md` says a checkpoint is openable
only while its generation is retained and requires two checkpoints, but its purported mirror rule is “Never drop a
checkpoint whose generation any retained checkpoint still needs.” TRD §7.6 and the generated checkpoint vector
repeat the checkpoint-as-subject wording. Row 15 then says the previous generation may be dropped after only three
conditions: transition settled, one new-generation checkpoint admitted, and local new-generation trim complete.
It does not require every retained fallback checkpoint to remain openable.

## First introduction and propagation

`b997cdb6bfaabc0e73cbecbb444dc0df84044d71` introduces both the two-checkpoint rule and the inverted subject.
`4259822828060fe2b9592fa525cd9a17170af285` later turns one successor checkpoint plus local trim into the exact
old-generation deletion gate without repairing it. Both forms survive into the TRD register, service inventory, and
checkpoint/transition vector prose at the pinned tip.

## Reachable consequence

1. `C_g` is the newest checkpoint under generation `g`.
2. A rotation commits; `C_(g+1)` is admitted and the initiating device trims locally under `g+1`.
3. The row-15 three-part gate now permits dropping generation `g`, while the row-7 retention rule still keeps
   `C_g` as the required second-newest fallback.
4. The durable store loses or cannot serve `C_(g+1)`. `C_g` and its manifest are intact and authentic, but a client
   with no surviving unwrap path for `g` cannot decrypt the mandated fallback, so §11.3 test 8 fails by construction.

This is a recovery/durability failure. It does not enable plaintext disclosure.

## Supporting evidence

The exact tip consistently says checkpoints are generation-bound and that two must remain. Its only cross-retention
sentence directs whether to drop a checkpoint, not whether to retain a generation opener. `checkpoint.json` repeats
the prose but has one checkpoint and no two-generation deletion scenario. `transition.json` checks signatures and
publishes the three-part gate as text; it does not attempt fallback after deleting `g`.

## Counterevidence and disconfirmation attempt

The intended sentence is readily inferred as “never drop a generation that any retained checkpoint still needs,”
and independently retained recovery or reader wraps could keep `g` open after its local `KeyEnvelope` is removed.
That benign reading is a viable fix, but the selected sources do not identify which opener survives, and the exact
row-15 deletion predicate omits the condition. If “drop the previous generation” means only one local envelope while
a remote recovery wrap necessarily remains, the consequence narrows; that object-specific interpretation also needs
to be stated and tested before it can discharge fallback.

## Validation procedure

1. Produce `C_g`, rotate, admit `C_(g+1)`, and satisfy local trim.
2. Delete every opener the current rule permits deleting, make `C_(g+1)` unavailable, and restore `C_g` plus its
   suffix on an already-enrolled and a newly enrolled device.
3. Require at least one authenticated, authorized unwrap path for `g` until `C_g` itself leaves the retained set.
4. Repeat across two rotations so both retained checkpoints and their generation/wrap inventory advance together.

## Disposition

Clarify and test before old-generation deletion: invert the normative rule to retain every generation opener needed
by any retained checkpoint, and add that condition to row 15's deletion predicate.

**Repaired — 2026-08-29** under the authorized `S0-10` disposition workflow (`docs/review/README.md` §Finding lifecycle states the standard; `remediation/traceability.md` is the
generated finding→falsifier matrix). The defect's return is refused by `the opener predicate`
guard (checkpoint vectors).
