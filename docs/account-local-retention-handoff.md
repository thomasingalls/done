# Private retention preparation handoff — 2026-10-13

Base: signed `75a3e94b`. This phase keeps the existing reduced format and exact deletion set.
Public retention activation and release validation remain paused.

## Contract

Prepare on the exclusive owner's serialized storage tail, outside the admission FIFO. Initial
admission settles and the journal flushes first. Capture a private lifetime/activity guard. Every
preparation effect retains its live SessionTask checks; admitted input or lifecycle changes cancel
preparation at its next guarded effect. Cancellation has no reservation, era transition or deletion.
The input itself still journals synchronously before changing the live Y.Doc.

A completed plan may carry its isolated evidence and the owner's activity guard across task
settlement. It must not carry a SessionTask or a crypto callback tied to the expired task. The
original planning context is used during preparation only. Final entry uses a new storage task.

The final FIFO job repeats complete fresh authority and durable-attempt checks, checks the captured
activity and empty journal, and retires old receive flights and final-application permissions.
Before reservation it compares the exact current storage inventory against the prepared one. A
changed inventory or intervening activity abandons the plan; it never authorizes a broader cut.
The transaction adapter still compares every physical row and metadata field under strict atomic
transactions. Reservation burns, successor era installation, exact deletion, authenticated readback
and independent baseline replay retain their existing rules.

No storage task waits for an admission job that might itself need the storage tail. Preparation
settles before final queue entry. The final phase fences later input until readback completes;
only then can new-era journalling begin. An uncertain mutation closes the owner. A cancelled
preparation leaves it editable. Empty queue promotion preserves the live Y.Doc and UndoManager.
Prepared evidence is single-use and erased after success, refusal, invalidation or closure.

## Evidence

The [completed packet](./performance-experiments/2026-10-13-retention-handoff/README.md) includes the
profile, frozen bundles, prospective protocol, matched observations and focused controls. At 1,201
own positions, the median largest task falls from 436 to 97 ms; total cut time rises from 5.706 to
6.029 seconds. An input intervention is admitted in 9.4 ms instead of waiting 5.567 seconds; the new
attempt yields without deletion. CPU-4x still has a 533 ms task and 1.860 seconds fenced.

191 unique affected unit tests, 17 native controls and three packaged lifecycle/checkpoint journeys
pass. The native controls distinguish preparation cancellation from fenced mutation and retain
crash, abort, exact retry and undo/reopen evidence. A lifecycle failure exposed an intentional retired
read propagating through the initial durability wait; the private operation now skips before mutation
while the owner is live. An uncertain mutation still closes it.

The existing nested census now yields between delivery, spool and source rows; its synchronous
callers execute the same checks. Synchronous exact inventory comparison borrows bytes without
cloning them, while the prepared plan and returned evidence keep their own detached copies.
No stored format, public activation, journal-era rule, full verification or undo policy changed.
The final atomic exchange/readback remains the next input-queue bottleneck; first conversion is
still unsuitable as transparent automatic maintenance on the current evidence.
