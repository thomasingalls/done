---
schema: 1
kind: finding
id: f-b997cdb-checkpoint-coverage-unchecked
status: candidate
type: evidence-weakness
severity: medium
confidence: high
introduced_by: b997cdb6bfaabc0e73cbecbb444dc0df84044d71
work_item: B-02
created_by: /root
updated: 2026-08-21
challenged_by: none
superseded_by: none
---

# The checkpoint vector signs coverage fields without checking that they describe the snapshot or accepted heads

## Affected requirement or guarantee

TRD §7.6 and row 7 require an attribution-preserving full checkpoint with insertion and deletion coverage and an
accepted-head baseline, so retained envelopes below it can be dropped safely and fallback restore cannot omit state.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §7.6 states that a bare state vector is not full coverage
and requires insertion/deletion evidence, suffix, and fallback. Original claims `OC-033` and `OC-069` preserve this.

## End-state source

`9edd9300adebcec3abd2234c946f1dcccdc17eef:scripts/generate-checkpoint-vectors.mjs` defines `SNAPSHOT` as a UTF-8
sentence and `SV`, `DS`, and `HEADS` as independent constants. Verification decrypts and compares the sentence,
verifies the manifest signature, and mutates signed fields, but never parses Yjs or derives/compares coverage.

## First introduction and propagation

Introduced with row 7 at `b997cdb6bfaabc0e73cbecbb444dc0df84044d71`. The same vector and claim survive to the pinned tip and feed
row 6 retention, row 10 packages, checkpoint fallback, historical-key disposal, and continuity claims.

## Reachable consequence

An implementation following the exercised verifier can accept a producer-signed manifest whose `sv`/`ds` do not
describe the decrypted snapshot, or whose accepted-head vector advances beyond operations represented by that
snapshot. Once the client starts suffix replay from those heads and old envelopes/keys are dropped, omitted accepted
content can be unrecoverable. Even absent a malicious producer, an encoding/selection bug can create the mismatch.

## Supporting evidence

The exact generator imports no Yjs implementation, derives no state vector or delete set from `SNAPSHOT`, and performs
no cross-check between `HEADS` and content. `coverage-ignores-insertions` and `coverage-ignores-deletions` merely show
that changing signed byte strings invalidates the producer signature. Exact `--check` passes, confirming the gap is
in the oracle rather than stale output.

## Counterevidence and disconfirmation attempt

AES-GCM, checkpoint digest, producer signature, sorted head-vector digest and separate field bindings all work as
specified. An honest implementation could additionally parse the decrypted snapshot, recompute `{sv,ds}`, and prove
its relationship to accepted input before publishing/accepting it. That required semantic step is not specified as a
restorer check or exercised by this evidence, and producer honesty alone is weaker than the claimed coverage check.

## Validation procedure

Use real Yjs snapshot bytes produced from a known accepted-envelope run. Recompute `sv` and `ds` from the decrypted
snapshot at restore, compare them to the manifest, and test snapshots that omit an insertion, omit a deletion, or
claim accepted heads beyond their applied run. Require fallback rather than partial admission for each mismatch.

## Disposition

Test and clarify: specify the producer/restorer coverage derivation and accepted-head relationship, then replace the
independent constants with an end-to-end Yjs checkpoint/suffix oracle.
