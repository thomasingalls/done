# Private retention final transaction — 2026-10-13

Base: signed `f89ee3f9`, the [preparation handoff](./account-local-retention-handoff.md).
This phase changes only the private removal adapter and numeric profiling. Public retention remains
disabled and release validation remains paused.

## Profile-driven decision

The [packet](./performance-experiments/2026-10-13-retention-fenced/README.md) separates the final
admission fence into authority, evidence copies, raw inventory, reservation/replacement transactions,
readback, authenticated load, independent replay and cleanup. The first deep own-history profile puts
645 ms of the 1,022 ms fence in the final replacement transaction; only about 88 ms is its census,
comparison and write submission. Readback plus load/replay takes about 67 ms. This selects transaction
request volume before duplicate evidence copies.

Explicit `IDBTransaction.commit()` was measured first and rejected: its three quiet paired fence
measurements overlap the reference, with only a 2.6% median change. It is absent from the selected
implementation. Completion, abort and cancellation retain the original automatic-commit behavior.

## Exact coverage, grouped physical removal

The previous private adapter issued one `delete(key)` for every covered logical row. The current
settled-cut planner already proves that its exact deletion set covers the complete logical inventory.
The adapter now independently verifies that equality inside the same strict transaction as mutation:

1. Read every physical store/key/value and metadata entry. Compare every field and sealed byte against
   the prepared post-reservation inventory. A late low key, changed ciphertext, missing row or metadata
   difference aborts before any clear.
2. Recheck the private plan's lifetime/binding and full inventory, then synchronous owner/activity and
   journal eligibility. Fresh complete custody checks still precede both exchanges.
3. Check the deletion set against the actual census: only the three logical stores, positive safe
   integer keys, no duplicates, no omitted keys, no substituted or extra keys. This explicitly refuses
   a future partial cut or survivor; planner eligibility alone cannot authorize clearing.
4. Queue new encrypted chunks, remove only obsolete metadata chunk keys, and `clear()` each logical
   store whose complete set was just proved. Update the authenticated counter/pointer/era in that
   same strict transaction. The metadata store is never cleared. Transaction serialization excludes
   a concurrent row arriving between census and clear; queued external writes cannot enter this cut.
5. Await native completion. Compare exact raw readback, authenticate the reduced store, independently
   replay the candidate and perform the final fresh authority/journal checks before releasing input.

This explicitly replaces the earlier **per-key database-operation** rule in the
[deletion design](./account-local-retention-deletion.md). The individually enumerated coverage proof
is unchanged. There is no sequence threshold, range inference, resumable deletion or broader logical
cut. The operation remains atomic across all four stores, with predecessor reservation burns and
unchanged old-or-new crash recovery. A failure after uncertain mutation still closes the owner.

The live Y.Doc and UndoManager remain installed. Preparation can still be cancelled by admitted
input; final mutation/readback still fence new input and new-era journalling. No stored format,
nonce accounting, authority policy or public activation changes.

## Result and remaining work

Three matched desktop pairs reduce median final fence **1,030 → 473 ms (54%)** and replacement
exchange **621 → 99 ms**. One profiled CPU-4x pair reduces the fence **1.898 → 1.564 s**;
maximum tasks remain material. All **129** unit tests, **18** native controls and **three** packaged
lifecycle/checkpoint journeys pass. The packet retains the observations and focused controls. Duplicate plan copies and comparisons
remain deliberately intact in this phase. Initial conversion still reads and verifies all history;
this is not a claim of constant-time conversion or transparent background maintenance. Compatible
reader-first rollout/rollback, capacity behavior and a product trigger remain separate work.
