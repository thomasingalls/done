# Phase 469 — arbitrate audit and preparation queue entry

A per-owner FIFO gives warm audit and read-only retention preparation turns
before either joins the existing serialized storage queue. Preparation captures
its priority token when its turn starts. The turn ends only after the native
operation and its owned cleanup settle; it does not cover the later retention
mutation or lend a task, proof, key or authority. Owner abort prevents queued
callbacks from starting; owner cleanup drains the maintenance turns.

Foreground work bypasses this arbitration. The original priority token update,
shadow/activity/journal/handoff/authority checks, audit guards, permit ownership,
verification and final mutation checks remain. Audits still become due at the
same thresholds and the 1,024-row/logical cap still invokes an attempt: a due
audit queues behind the current preparation turn and ahead of later preparation
slices. The scheduling change keeps it from continually invalidating the same
preparation before its journal observation finishes. No new timer, budget,
format or trust is introduced; the 10/60-second retries and 120-second completion
wait are unchanged.

Eight new controls cover the actual scheduler's forced attempt during a held
preparation observation, FIFO progress ahead of later slices, foreground
interruption, queue-head readiness, refusal propagation, integrity propagation,
abort/drain and independent owners. A private mutation removes serialization;
the first regression fails at audit entry (expected 0, actual 1), as required.
Keep that negative-control run. It adds no test switch to production.

All 115 focused cases in nine files pass. The full suite passes 332 files,
3,226 cases plus the one existing skip, in 128.63 seconds under the unchanged
approved 240-second hang guard. Typecheck, lint, changed-file format checks and
16 release census/policy controls pass. Independent AST comparison preserves all
47 original owner if-conditions and 26 throw arguments. Seven guard/policy files
are byte-identical. No old behavioral test was edited.

Bookkeeping adds precisely eight case IDs and removes none: general population
2,603 to 2,611 across 281 to 282 stages. The old census fixture changes only its
five exact count/title values. Runtime crypto census review finds no changed
domain/site classification: its refresh includes the seven previously approved
phase 457 clock files and this phase's two scheduling files. Registry, 200
labels/templates, 36 groups and 15 manual entrypoints remain. Planning census
success is not aggregate execution credit.

This phase contains the repair and regression evidence only. No maintenance
performance credit yet: next build the uninstrumented release-profile client
and rerun the approved maintenance case with the operator's quiet-host readiness.
Phase 467/468 failures remain; Stage 5 is not declared green. Every host/windowed
power log remains, with no repeated full power-log or evidence object copies.
No commit, push, release preparation or deployment.
