# Exact local retention dry run — 2026-10-13

Base: signed **`af5f0d87`** (`G`), the [lifecycle-reader/rebase phase](./account-local-baseline-lifecycle-readers.md).
This phase implements step 3 of the [reader inventory](./account-local-retention-readers.md) and the
non-writing portion of the [deletion plan](./account-local-retention-deletion.md). The new code is
uncommitted; the [focused evidence packet](./development-evidence/2026-10-13-local-retention-plan/README.md)
identifies its source hashes. Nothing is enabled in the ordinary application.

## What a successful plan establishes

`localRetentionPlan` accepts detached physical rows and raw metadata from one snapshot. It has no
IndexedDB handle, allocator, encryption callback or deletion operation. It authenticates the exact
counter, predecessor pointer/chunks if present, scope, intent and reservations; validates every
store/key/header; decrypts the rows; and independently replays the complete physical history. A
persisted baseline also has to replay its suffix and match that intact reference before rebasing.
A corrupted predecessor or physical row cannot be reported as an ordinary capacity skip.

The candidate is built at the settled current cut, from full history for the first baseline or the
authenticated predecessor plus suffix thereafter. Its successor journal era is **hypothetical**.
It preserves source identities, whole partially consumed capsules and consumption, absolute positions,
burned attempts, terminal proofs/frontiers, authority cuts, latest checkpoint evidence, reservation
holes and the current protocol witness. It receives a fresh baseline MAC and is independently replayed.
No GCM invocation is reserved and no new era becomes visible to the synchronous journal writer.

Each physical row receives a disposition:

- content insertion/deletion coverage in the complete candidate snapshot;
- source capsule carried whole or consumed through verified accepted positions;
- settled spool or delivery evidence;
- authenticated receive frontier or history-installation evidence.

Unknown tags, wrong placement, duplicate sequences or failed verification refuse. The existing
settled-cut rules reject unresolved publication and pending document dependencies. Candidate encoding
has a typed capacity refusal at the existing 4 MiB/source/publisher limits; malformed stored encoding
still fails integrity checks. There is no smaller opportunistic deletion set.

The plan holds the **exact** old counter/MAC, pointer/chunks and every `(store, key, sealed record)`
entry, plus the candidate and owner-lifetime binding. Removing its enumerated keys from a detached
array must leave the expected empty logical suffix. Baseline-only replay must match the intact
reference's full document state, all outstanding capsule bytes/consumption (beyond a single send
batch), next source selection, positions/attempts, publication/receive state and installed history.
The plan never means “everything below a sequence number is covered.”

Verification compares the entire physical inventory again, including unknown fields, missing/extra
rows, a late previously reserved low key, changed bytes and all metadata. Caller-visible inspection
copies cannot modify a held plan. A different lifetime/intent, retired task or disposed plan refuses.
An owner reports only counts, byte sizes, revisions and disposition totals, then destroys its plan.
No reusable deletion capability escapes to the application.

## Real owner boundaries

`dryRunLocalRetention()` exists only on the composed private owner with both
`VITE_ACCOUNT_BASELINE_INSTALL=1` and `VITE_ACCOUNT_BASELINE_READ=1`.

1. Settle admission durability, flush exact journal originals and require completed journal cleanup.
   A failed durability barrier refuses before planning; a journal/activity change during the owned
   operation skips through the existing maintenance fence.
2. Hold the admission FIFO and slot Web Lock. Require no pending promotion, no detached owner and
   authenticated settled durable attempts. Retire old network flights and unused final-apply
   permissions under the existing retention read fence.
3. Read all three logical stores **and raw metadata in one readonly transaction**. Obtain the complete
   fresh authority context and run the detached planner. This deliberately bypasses warm selections.
4. Check complete fresh authority again, capture a second readonly physical census, and synchronously
   check lifetime/activity/journal eligibility and exact inventory equality before reporting success.
5. Dispose the plan and release the read/admission fences. The empty promotion makes no document
   change. The current journal binding, live Y.Doc and UndoManager remain in place.

A dry run can drain already admitted writing through the existing durability barrier. Once the
journal is settled, the planner performs no writes: no counter reservation, baseline installation,
era transition, row removal, key retirement or view replacement. The native control rejects any
content-database readwrite transaction in that settled interval and compares all four stores exactly.
The final recheck is evidence for this dry run, **not** a cross-database atomic commit or permission
to reuse the report later.

## Evidence and remaining boundary

Focused controls cover exact inventory mutations, caller/lifetime isolation, partial capsules,
reservation holes and burned attempts, pending/unsettled/capacity skips, generated settled histories,
subsequent allocations and repeated projected cuts. Native controls cover ordinary and anchored
owners, empty-suffix rebase, old-flight rejection, queued journal-before-apply input, undo/redo,
a fresh authority change, a row/chunk changed after capture, and renderer death/retry. The packet
records the actual commands, outcomes and test corrections.

The physical history is still complete and remains the oracle. Pure rebase can operate on a
baseline plus suffix; the physical planner in this phase deliberately does not accept a database
with that prefix already missing. No counter v5 / reduced-carrier codec, deletion transaction or
public reader is added. This is not a cold-open or typing speed improvement.

The next bounded implementation is the **separately authorized private atomic-removal phase**:
closed reduced representation, reservation in the predecessor representation, exact native
compare/exchange of pointer/chunks/era and enumerated keys, authenticated readback, and focused
abort/crash/lost-reply/retry controls. Its actual reduced stores must exercise the original/joined and
lifecycle readers. Public reader-first release and rollback, capacity/history-required product
behavior and growth measurements follow separately. General release validation remains paused.
