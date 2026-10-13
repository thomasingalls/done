# Budget the remaining preparation loops — 2026-10-13

Base: signed `127fcf2a`, [private evidence reuse](./account-local-retention-evidence-reuse.md).
Retention remains private and release validation remains paused. This phase changes scheduling of
existing checks; it changes no format, authority rule, exact cut or final transaction boundary.

## Why these loops

The aligned retained CPU-4x trace places 433/450 ms main-thread events in self-receive projection,
349 ms in replay comparison/source selection and 214 ms in baseline summarization. The supposedly
cooperative self helper yielded around its synchronous projector and through later coverage checks,
but could still parse an entire history of positions and capsules before returning control.

## Ownership and continuation

Synchronous and cooperative self advancement drain the same generator. It retains all original
source parsing, accepted-decision decoding, chain/head/checkpoint consistency checks and coverage
proof. Only cooperative callers await the existing guarded budget between positions. Their census,
delivery and inbound state remain private until the entire operation succeeds; partial projection
on failure is discarded, never published as verified progress.

Decoded capsules are owned by that generator, including while it is suspended. Iterator closure on
a rejected checkpoint erases them in `finally`; originals copied for the coverage phase are also
erased on completion, refusal or interruption. Caller source bytes are unchanged. This adds guarded
suspension of owned decoded buffers; it does not expose them or memoize a result across owner lives.

Baseline summarization, next-source selection and complete outstanding-obligation projection now
check the same CPU budget between records. Summarization/comparison use their current owner/activity
guard. Production baseline callers supply the guard through replay comparison. Source selection's
optional checkpoint is supplied for private comparison; its ordinary synchronous work between crypto
awaits retains the same selection rules. All partially consumed originals, original order, actor/epoch
boundaries, byte/count limits and obligations beyond the next batch remain checked. No decoded capsule
in those source scans remains live across a new budget yield.

The 8 ms budget is a scheduling target for splittable loops. It cannot preempt one decoder, Yjs update,
structured clone, native IndexedDB result or GC. Every actual budget yield rechecks the guard before
resuming work. Invalidated preparation may not sign/install a candidate or pass into the final cut.

## Boundaries unchanged

Complete fresh custody/authority checks, all cryptographic verifications, strict census/equality and
deletion proofs, reservation burns, journal-era/activity fences and authenticated readback/independent
replay remain. No yield was added inside the final native transaction. Final mutation/readback still
hold admission; uncertain mutation still closes the owner. Preparation remains outside admission,
so input journals before applying and cancels it. The installed Y.Doc and UndoManager are unchanged.

The [measurement protocol](./performance-experiments/2026-10-13-retention-tasks/protocol.md) specifies
matched task-duration measurements and focused cancellation/equivalence controls. Its [results](./performance-experiments/2026-10-13-retention-tasks/README.md) show no reported
>=50 ms task in any of three CPU-1x candidates (reference maxima 100–103 ms), and a CPU-4x maximum
of 97 ms versus 483 ms. Total time rises about 2–3%; verification work remains. A checkpoint/cold-open
journey failed once and passed five follow-ups without a repair. The failure remains unexplained
and prevents calling lifecycle validation completely clean. Public activation, compatible reader-first rollout/rollback, product trigger,
cadence and capacity behavior remain separate.
