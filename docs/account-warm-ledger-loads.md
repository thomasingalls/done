# Warm Account ledger loads — bounded owner reuse

Implemented, 2026-10-12. Enabled by default only for private v9 Account capture/receive owners.
`VITE_ACCOUNT_WARM_LOADS=0` or `VITE_ACCOUNT_LEDGER=reference` restores full physical reads.
Generic Local/shared owners and startup recovery retain their existing full reads.
No persisted format or wire change; publication and general release validation are separate.

## Decision and evidence

The operator accepted an owner-local verification window, with count plus first/last-key checks,
rolling audit work, row/time-triggered completion and full verification after resume/reacquisition.
The prior per-task check of every old ciphertext is deliberately replaced in this path. An old
same-count interior change may remain undetected until that row's audit or a full reopen. The
owner continues using its prior authenticated memory; this does not claim to prevent database
corruption or detect a coherent rollback with no external witness. See the dated decision entry
and the [measurement protocol](performance-experiments/2026-10-12-warm-ledger/protocol.md).
The [results](performance-experiments/2026-10-12-warm-ledger/README.md) record the focused activation
criteria, measurements and their limits; default activation here is not a deployment receipt.

The CPU-4x baseline reproduced nine journal-flush long tasks, 71–176 ms. In those task windows,
old-byte comparisons, full-view cloning and carrier bookkeeping dominate. Reading only metadata
will not eliminate detached copies in downstream verification; this first repair keeps their
ownership contract and reports that residual cost explicitly.

## Authority and cache extension

`openAccountWriteSession` and `openJoinedWriteSession` hold an exclusive Web Lock through
initialization, use, native settlement and disposal. `accountCapture` additionally serializes
storage tasks. Only those composed owners request warm loads; `reuseOpened` alone does not.
Each acquisition performs a complete physical read and full Account verification before use.

A successful warm load reads the authenticated counter and, in the same IndexedDB transaction,
each store's count and first/last key. Unknown metadata refuses. An unexpected counter change forces the
existing full read/verification; unchanged counter plus changed shape refuses. Counts are native
key operations, not a constant-time complexity claim. They do not prove the middle rows match.

Only this owner's completed `compareAndWrite` can extend the retained ciphertext/plaintext arrays.
The verified predecessor must match either the committed counter or the exact before/reserved
counter pair of this attempt. After this owner's exact reservation transaction completes, its
retained counter may advance from that verified predecessor without changing the rows or semantic
identity. Pre-commit sync loads still authenticate the counter, check the shape, audit old rows
and validate semantic evidence. They no longer reread all history merely because this owner
reserved sequences. This does not clear a resume/full-read invalidation, reset the audit cursor,
or accept an unknown transition. See the [owned-reservation repair](performance-experiments/2026-10-12-owned-reservations/README.md).
Removing that incidental full read means an old same-shape ciphertext change can now wait for
its rolling audit even across a reservation, within the already accepted warm-owner window.
The load uses only prior verified memory until then; it does not read and trust that changed row.
A reserved sequence is never classified as a committed row. A failed
reservation/seal/commit clears reuse, and uncertain predecessor state takes the full path. All
new semantic Account evidence is validated before a later load returns it. Returned records stay
detached: caller erasure cannot damage retained plaintext. No naked borrowed buffers escape.

No high-water range read guesses the existence of earlier reserved positions. Conforming other
writers are excluded. A deliberately nonconforming late lower-sequence insertion changes the shape
and refuses; it is not silently skipped. Compaction retains its independent full-census and exact
row-deletion transaction, then invalidates warm state. Rotation/disposal clear the owner cache.

## Audits and resumption

Every warm load checks one rolling batch of old ciphertext against the bytes authenticated earlier.
A batch contains at most 16 rows and 128 KiB, except that a single larger row must be checked whole.
It is bounded by a record's existing size limit, not a universal millisecond ceiling. Mismatch or
missing data gives `repair-required`; the Account owner closes and attempts no repair.

After 256 appended rows or five minutes without a completed pass, a timer schedules audit slices
regardless of idle state. Each slice is a separate serialized storage job, with an event-loop yield
between slices, so ordinary jobs can run between them. The pass captures its endpoint; subsequent
appends cannot indefinitely move it. Each background slice also checks authenticated counter and
shape. Full physical verification and compaction remain independent checks.

The trigger is not a hard real-time completion SLA: a frozen/suspended browser does not run timers,
large individual records can exceed the desired task budget, and native storage can be delayed.
Visibility return, `pageshow` and `resume` invalidate warm reuse so the next load performs a full
read. Reacquisition constructs a new owner and always verifies afresh. Close cancels scheduling,
drains active native work and clears buffers. There is no worker or background key export.

## Remaining work

Private Account selections and owned verification now avoid copying whole histories for small
answers, but `createVerifiedRecords` still byte-compares its detached history, and ordinary full
loads retain caller-owned copies. Unchanged custody authentication now has separate [owner-local reuse](account-authority-authentication-reuse.md),
with fresh complete inventory comparison on each check. Warm work is not all
independent of ledger length. Further reuse needs its own lifetime/aliasing checks; physical local retention needs the separate
[authenticated-baseline design](account-local-retention-design.md).
