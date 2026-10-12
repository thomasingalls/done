# Prepared remote handoff and cooperative Account work

2026-10-12. Implemented locally after explicit authorization. No stored or wire format changes.
The [authority-reuse measurement](performance-experiments/2026-10-12-authority-reuse/README.md)
triggered the prospective escalation rule: active-peer frame p95 207–211 ms, backlog 137–162 ms
at CPU-4x, with 92–99% of remaining local queue wait overlapping remote admission. The
[new protocol and evidence](performance-experiments/2026-10-12-prepared-receive/protocol.md)
measure the handoff separately from that earlier result. Release validation remains paused.

## Ordering and ownership

TRD §6.1 permits a committed but undisplayed suffix. A local edit against the currently displayed
document cannot depend on a remote page that has not been applied there. This implementation uses
that boundary only for ordinary signed content receipts, including grouped existing-format receipts.
History installation retains the original fenced path. Authority/key/membership changes stay on the
existing serialized authority paths; a changed authority cannot promote a previously prepared page.

1. The admission owner permits **one** remote preparation at a time. It takes a detached bounded
   input and stops discretionary compaction. Local commands keep their existing FIFO and synchronous
   encrypted journal-before-apply route. A forced local write still awaits its durable storage job.
2. Remote authentication, receipt verification, atomic content/receipt append and authenticated
   readback run on the existing exclusive storage queue. Preparation never awaits editor promotion
   while holding that queue. It stages copies of the original update frames and a private final check.
3. After that storage task settles, a final job joins the editor FIFO. It reacquires the storage
   owner, freshly checks the full custody inventory/authentication, verifies the captured authority
   context is still the same, and synchronously applies the frames to the **current** canonical
   document and undo history. It never swaps in a pre-preparation snapshot. Page publication remains
   grouped as before; all original Yjs frames, including pending structs/deletions, are retained.
4. Only final application resolves receive success and allows the next receive page. Therefore the
   driver cannot advance past undisplayed content in a live session. Sending retains its existing
   scheduler turn between receive steps. No unbounded prepared queue is introduced.

The stored receipt may be ahead of the displayed document while preparation is pending. Content
coverage and compaction consume stored records, not the older editor snapshot. The journal preserves
independent local edits made meanwhile. Cold replay includes both: renderer death after remote commit
and before promotion neither loses the remote update nor replays the local command twice.
The document exposed after final application has durable remote dependencies before a subsequent
local acknowledgement can refer to them.

## Failure, pressure, lifetime and bounds

A refused local head holds the final remote apply behind it. Preparation can start even if pressure
arose during the preceding fetch; pressure must not become a permanent receive refusal. Retrying
storage preserves FIFO. Discarding that pending suffix closes the owner when preparation exists,
because it may already contain committed remote content; reopening cold-replays the durable suffix.
A failed/stale final check likewise closes for replay. Invalid network evidence rejected before a
commit leaves local editing available, as before. Integrity and generation failures retain existing
owner closure rules.

Close rejects queued promotions, revokes the carrier, drains native preparation/final application,
then erases detached input and staged frames. Late verification cannot apply after cancellation.
`whenDurable()` includes a previously started handoff but awaits it **outside** the editor queue;
otherwise a forced local job waiting for storage could deadlock with final remote promotion.
Automatic journal copies can overlap preparation; their storage work remains serialized. Automatic
compaction is deferred until preparation settles. Explicit compaction still starts after durability.

Input and staged update frames each have a 4 MiB cap, independently of the existing 4 MiB pending
editor queue. Only one proposal is retained, with no whole-document copy. These are bounds on the
additional proposal buffers, not a total process-heap bound; existing verification/crypto copies remain.
No caller receives internal records, verification data, mutable frames or the private finish closure.

## CPU cooperation

Private v9 Account storage tasks use an 8 ms cooperative budget at async operation boundaries.
The verifier compares large old-record buffers in 64 KiB chunks, checking the same budget between
chunks/records. Full cooperative censuses and receipt verification also expose budget checkpoints.
Those inputs belong to the serialized storage owner for the entire operation; local admission only
appends to its separate synchronous journal. Public read projections remain detached, and every byte
is still compared. View invalidation during a yield rejects the result instead of reinstalling it.
Lifetime is checked before work and after yielding. No yield occurs inside an IndexedDB transaction
callback, and native settlement keeps the write permit until it finishes.

Eight milliseconds is a target for splittable work, **not** a maximum task duration. A single Yjs
apply, projection, clone, full custody authentication or native operation is not preemptible. Final
application remains fenced. Residual costs must be reported from measurements rather than assumed
away.

`VITE_ACCOUNT_PREPARED_RECEIVE=0` retains the whole-receive editor fence as the reference.
`VITE_ACCOUNT_CPU_YIELD=0` disables the new Account task/comparison cooperation. Both are build-time
switches; neither changes stored data. The existing ordered-receive native suite explicitly selects
its reference fence unless `ACCOUNT_PREPARED_RECEIVE=1` is supplied. New native controls select the
prepared product path. Local retention is still design-only and outside this slice.
