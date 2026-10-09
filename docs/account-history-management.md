# Account history management

2026-10-09. Bounded product implementation, with unsigned intermediate commits authorized.
Release validation remains paused. The retained :8443 service stays on `34035330` during development.

## Contract and sequence

The current application retains every accepted envelope and reconstructs recovery from genesis,
all handoff snapshots and every publisher stream. Repeated membership changes work, but they do
not provide general history retention. Existing acceptance ledgers also authenticate refusal/retry
history: deleting their rows as though they were merely ciphertext would break those guarantees.

Implement in this order:

1. Repeatable checkpoint proposal and semantic admission, independent of enrollment. Bind the full
   publisher cut vector (including finalized publishers), current membership, generation and exact
   previous checkpoint. Recompute both Yjs insertion and deletion coverage after decrypting. A sole
   eligible device may self-admit; with another eligible device, a different device must admit.
2. Durable service exchange and client preparation/retry. Serialize advancement against the admitted
   parent, preserve exact retries after lost replies, and recheck current authority at commit. A
   pending proposal must not block editing or membership changes.
3. Reader installation and recovery from the new baseline plus its suffix. Commit content and the
   accepted-head baseline together; preserve local unaccepted originals and refuse unresolved
   dependencies. Exercise an offline returning device and lost-device recovery.
4. Retention and pruning only after those readers work. Keep at least two admitted checkpoints and
   every suffix needed by either. Separate retained decision evidence from removable ciphertext;
   neither a producer signature nor a largest sequence number is permission to delete history.

These follow [row 7](./selections/row-7-checkpoint.md). Generation-key retirement, destructive Yjs
compaction/attribution retirement, public deployment and release qualification remain separate.
No historical key is dropped in this phase. The existing snapshot/output bounds remain explicit
until the reader path has been changed and exercised; publishing a larger carrier alone does not
remove the application's activation limit.

## Current increment

Implementing the checkpoint carrier, cryptographic replay/admission and service exchange first.
No new snapshot authorizes pruning or replaces a local content root until the installation work is
complete. No automatic cadence or user-facing maintenance control has been activated yet.

## Checkpoint primitive checkpoint

`history-checkpoint` v1 is a separate, closed carrier; existing genesis, enrollment and recovery
encodings remain unchanged. Its signed metadata binds the membership head, lineage, generation,
producer, monotonically numbered checkpoint parent, complete publisher cuts, ciphertext digest,
and separate insertion/deletion coverage. Fresh salt/nonce derive a per-snapshot encryption key.
`history-checkpoint-admission` v1 binds the complete proposal hash and rederived coverage under the
certified admitting credential. Eligibility comes from verified membership, including early
single-device accounts. Finalized publisher cuts cannot advance or disappear.

The content helpers capture their inputs before asynchronous work, refuse pending dependencies,
reopen their own ciphertext, and require the admitter's independent accepted replay to be contained
in the snapshot. They do not authenticate how the owner obtained that replay/cut pair; the upcoming
native owner must derive it from verified durable state and accepted streams. They grant no install
or trim permission. Six focused tests pass, including genuinely signed false coverage, both
self-admission flag directions, deletions, missing accepted content and finalized publishers.
TypeScript, scoped lint/format and diff checks pass.
