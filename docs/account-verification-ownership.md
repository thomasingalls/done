# Private Account verification ownership — 2026-10-12

This is a memory-ownership change in the existing v9 Account verifier. It changes no stored bytes,
counter checks, signature requirements, journal ordering, undo semantics or physical audit policy.
The [measurement packet](performance-experiments/2026-10-12-owned-verification/README.md) contains
the comparison against signed warm-load base `e88c19a5`. Publication and release validation remain
separate. The carrier still returns a detached array and byte buffers to each caller.

Enabled by default for the incremental Account owner after the focused correctness checks and
three matched CPU-4x pairs. `VITE_ACCOUNT_RECORD_OWNERSHIP=0` restores the detached verifier;
`VITE_ACCOUNT_LEDGER=reference` also keeps that verifier. Generic users of `createVerifiedRecords`
retain its original cloning default. This branch change is not yet deployed.

## The copies removed

Previously each changed verified view copied all candidate records, deep-cloned its complete
semantic result, then copied all records again for retention. Incremental verification also scanned
the byte-equal predecessor twice because those copies had distinct buffers.

The private Account callback now transfers ownership of its result. An incoming prefix is eligible
for reuse only after checking kind, generation, sequence and every byte against retained rows.
New or changed rows are copied; the candidate can share the matching prefix only with the private
retained view. The incremental classifier still checks placement and sequence; identical internal
byte objects compare equal without rescanning. Changed placement/bytes and deletions cannot acquire
append authority merely from a counter or an object token.

After proof completion, the lifetime/revision checks must still pass before installation. The cache
then owns the candidate array and result directly. `read` and `readIfMatches` still compare incoming
records and clone the selected projection before returning it. Caller mutation/erasure therefore
cannot damage retained state. No borrowed carrier buffers or semantic view are exposed publicly.

## Callback and buffer contract

`ownResults` is an explicit, lifetime-fixed opt-in. Its only product caller is the closed
`accountReceive` validation closure. Callbacks may retain references from their private predecessor
in a new result, but must treat those predecessor objects/bytes as immutable. They transfer newly
constructed results; they may not return externally owned buffers, keys or task objects. Existing
incremental reducers copy mutable maps, position containers and peer state before changing them.
The crypto memo returns detached values. The reference mode keeps its original cloning contract.

The ownership cleanup first collects backing buffers reachable from the new result and candidate.
It erases only old buffers outside that set. Sharing a subarray keeps its entire backing allocation
alive until the final owner releases it. Traversal handles repeated object references and maps/sets;
erasure happens once per backing allocation. A successful candidate is not erased by `finally`.

Failure refuses the candidate and clears the current view. Invalidation increments its revision;
late completion cannot reinstall it. Overlapping verification is rejected before borrowing any
predecessor. Public readbacks remain independently mutable, and closing clears all owned buffers.
Independent semantic reference audits still use detached copies and compare complete results.

## Remaining cost and scope

The carrier's load copy remains roughly 33 MB per 120-key fixture session. Incoming equality checks,
graph traversal, map/array construction and audit work also still scale with history. This change
does not solve local retention or make warm operation constant time. Further removal of carrier
copies requires a separately reviewed selection/lease boundary that preserves caller erasure and
exception behavior. The [retention design](account-local-retention-design.md) remains design-only.
