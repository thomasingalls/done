# Private Account editing lifetime

This bounded phase attaches the verified Account handoff to the existing admitted workspace and
encrypted journal. It is a private factory, not a default-app or relay cutover. The first Account editor
holds an exclusive slot permit for its whole lifetime. Competing opens and maintenance wait until it
closes; existing Local shared-writer behavior is unchanged. Concurrent Account editors remain a later
extension. There is no lock upgrade, release/reacquire gap or cached proof carried into another permit.

## Activation and provenance

On each acquisition, authenticate the Local provenance, custody, selected Account index, admission
receipt and independently pinned binding; require a new passkey assertion and the device-lock code.
The recovery code and service are not needed. Recheck retained routing and progress after the ceremony.

Version 4 selected progress still means frozen genesis. Before any admitted initialization or edit,
cold-replay database plus journal and require that exact genesis, including coverage and device wrap.
Then strictly replace only the authenticated promotion carrier with version 5, stage `account-active`.
The full signed genesis, receipt, binding and original custody provenance remain retained. This durable
record distinguishes an editable Account from an interrupted handoff. Abort leaves version 4; commit
followed by lost acknowledgement leaves version 5. No app initialization or writing may precede the
activation acknowledgement. Old readers refuse version 5; handoff/admission/preparation cannot resume it.

Version 5 startup verifies the original checkpoint independently, then checks that current recovery
contains its integrated clocks and deletions. Later edits and additional durable pending updates are
allowed. Applying the checkpoint to a detached current-state fork must leave integrated and pending
state unchanged. This check never restores a missing source update into the actual document. The
original checkpoint is ancestry evidence, not a current-state snapshot. This does not detect a complete
profile rollback; no monotonic external freshness or revocation guarantee is added here.

## Lifetime and admission

After verification and activation, custody caches, journal, admission queue, document projection and
undo history remain attached to that same permit. Use the existing synchronous encrypted journal and
ordered admission rules: an accepted local change survives renderer death; refused or pending changes
remain outside the accepted document and outbound callbacks. Reopen replays later disk and journal
updates. Exact-coverage compaction must preserve genesis coverage and later writing.

The actor identity must match the retained Account principal. This private editor has no authenticated
relay receiver: its public receive path refuses incoming bytes before persistence. Outgoing callbacks
are local accepted-update observations only and do not grant relay publication authority.

Close, abort and pagehide invalidate access immediately, reject unaccepted work, drain native work,
erase buffers/release key references and destroy projections before releasing the permit. Stale editor
and text-surface handles cannot read or write. A detected generation change invalidates this owner.
No other compliant lifecycle owner can change generation or custody while its exclusive permit is held.
Future rotation, Account clear/delete and multi-epoch reopening require their own contracts.

## Evidence required

Directed native tests cover first activation, before/after its commit, cold reopen after journal-only
edits, deletion and undo, compaction, missing/changed provenance/index, wrong identity/pin/factor/passkey,
queued owner cancellation, close/drain, pagehide, stale handles and generation invalidation. Include
durable pending dependency replay without treating an old genesis as the current document. Generated
histories compare editing and reopen to an independent string model and preserve source/key/identity
inventories. Guard controls must actually expose a bad result when disabled. Preserve exact artifacts
and limits; no whole-protocol, physical power-loss, platform-matrix or encrypted-sync claim follows.
