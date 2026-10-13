# Private retention evidence reuse — prospective protocol

Base: signed `eb2a3374`. Private retention only; no activation, format change or release campaign.

The preceding packet locates 436 ms of a 1,564 ms CPU-4x final admission fence in three
whole-history copies, and 339 ms in three comparison spans containing repeated checks. This
phase removes only detached copies that runtime callers do not need and comparisons of private
immutable evidence against its own copy. Each fresh physical census still receives one complete
byte-for-byte comparison, and the final strict transaction independently proves exact deletion-set
completeness. Full fresh authority, reservation burns, journal fencing, readback, independent replay,
live Y.Doc/undo and failure closure stay intact.

## Prediction and decision

The planner owns its deep captured evidence. Runtime callers receive detached candidate/counter
material and deletion keys; comparison methods borrow private bytes synchronously without exposing
them. A private snapshot of the reserved counter substitutes only that metadata entry in the second
transaction comparison. The old rows and old encrypted chunks are neither cloned nor exposed.

Before candidate timing: expect roughly 0.9–1.1 s for the CPU-4x fence and 0.30–0.35 s at CPU-1x,
versus the preceding 1.564 s and 473 ms. These are hypotheses from removing copies and duplicate
comparisons, not targets that permit removing checks. Accept at least 20% lower median paired
CPU-1x fence with unchanged crypto/fresh-authority work and all correctness controls passing.
If mixed or below threshold, retain evidence and investigate without weakening the boundary.

## Matched observations

Reuse the same genuine 1,201-position, two-card, 12,559-character Goals fixture (8,439 physical
rows), synthetic credentials and independent acceptance oracle. Clone the closed database into
isolated contexts. Freeze the reference from `eb2a3374` and candidate bundle. Compare three quiet
alternating R/C, C/R, R/C pairs, then one profiled CPU-4x pair. Record total, preparation, final
fence, nested copies/censuses/comparisons/exchanges/readback/replay, longest tasks and timer gaps,
crypto/authority counts, exact cold recovery and input/undo controls. Nested timings are not additive.
Seed time is excluded. No other test campaign runs during timed observations.

Retain raw results, bundles, CPU profiles/aligned traces, source hashes and focused test logs. The
unit of observation is a conversion, repeated on one host and one fixture. Three pairs cannot
resolve small effects, machine drift or VM contention. No population confidence interval, phone
claim, whole-product typing result or release qualification follows.

## Boundary controls

Test mutation of every detached returned value, binding and original input; snapshot isolation of
the reserved counter; disposal and lifetime invalidation across awaited crypto; changed/missing/extra
old rows and old metadata after reservation; malformed deletion sets; abort/crash/retry and nonce
burns; exact authenticated readback; journal-era/old-read fencing; live undo/redo and cold recovery.
Retain preparation-time input intervention for both arms and candidate CPU-4x: input must journal
before apply and invalidate the preparation before mutation. Stop on integrity or recovery failure.
