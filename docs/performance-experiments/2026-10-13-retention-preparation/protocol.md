# Initial retention conversion responsiveness — prospective protocol

Runtime anchor: signed `77e54ada` (measurement-only successor of `354c9c59`).
No public conversion, format change, personal profile, or release qualification.

## Decision and design

Profile one first cut at 1,201 genuine accepted own positions before changing runtime code.
Use the preceding native series' two-card / 12,559-character Goals fixture and real composed owner.
Locate the 12-second foreground task, then repair the largest identified splittable work while
preserving complete authentication, exact inventory/atomic deletion, journal-era fences and undo.
The first diagnostic is mechanism attribution, not comparative timing evidence.

For the repair, compare three fresh cloned complete-history contexts per arm using the same seeded
storage and alternating reference/candidate order. Preserve the reference observer bundle before
edits. Each context is a unit of observation; all share one synthetic fixture and host, so report
median/range descriptively, with no independent-population or phone claim. CPU-1x is primary.
An additional CPU-4x candidate observation may expose residual indivisible work, separately reported.

## Measures and guardrails

Primary: maximum foreground task during cut; secondary: total cut time, timer responsiveness,
crypto/work counts, exact before/after state, accepted queued input and undo/redo after cut, cold
reopening. CDP CPU profile is separate from comparison runs. Long-task observer must drain after
completion. These are main-thread responsiveness measures, not keystroke-visible latency: admission
can still legitimately wait behind the complete atomic operation.

Require an order-of-magnitude reduction of the reproduced multi-second task before describing the
stall as repaired. Target splittable CPU slices near the existing 8 ms budget. Report remaining
>50 ms tasks and any total-time penalty; do not silently widen the target or remove integrity work.
If the largest cost is an indivisible operation, measure it and bound this phase's claim rather than
bypassing the fence. No change to input overtaking, application policy or retention cadence.

Correctness: focused coverage equivalence and corruption controls for the changed algorithm,
owner closure/invalidation across a yield, actual retention abort/retry/crash controls, queued
journal-before-apply and undo. Keep reservations and final exchange atomic; no yields in IndexedDB
transactions. Full authentication and post-commit readback remain mandatory.

## Execution and limits

Start with a bounded native diagnostic (30-minute overall, 15-minute seed, 120-second operation
ceilings), retain failures and profile/bundle hashes. After attribution, record the selected repair
before comparison. Run only affected tests/build checks; general release validation remains paused.
Synthetic passkeys/state stay in private temporary directories; numeric evidence/probes are retained.
Host load, JIT and GC can confound small effects; the target here is the observed multi-second stall,
not a small latency gain. Independent browser restarts provide repeats, not independent users.
No novel remote backlog, live phone, pending-heavy or arbitrary workspace-growth conclusion.

## Attribution and selected repair (before candidate comparison)

The deep own-history diagnostic reproduced a 13.717 s cut and an 11.499 s foreground task.
Inclusive sampled CPU: full replay 9.428 s; coverage 8.674 s, of which rebuilding/applying content
accounts for most. These overlap and must not be summed. Planner self/inclusive is 0.184/1.494 s.

Selected repair: bind a private immutable content view once per full replay and once for the
candidate snapshot's deletion classification; preserve reference fork/apply/compare and pending
semantics, not the direct-coverage shortcut. Use the existing cooperative self projection and 8 ms
budget between originals/classifications and before replay crypto. Index already checked unique
sequences for classification instead of repeated linear lookup. Clear views on all exits. Keep all
full verification passes, fresh custody calls, readback and exact reservation/exchange unchanged.
The comparison additionally records native crypto counts and validates queued input by visible
text after undo (encoded Yjs state legitimately retains its undone structs), then exact cold state.
