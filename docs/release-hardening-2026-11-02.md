# Release hardening — operator decision, 2026-11-02

Lab work ended at phase 334. This is a canonical hardening lane, based on signed
`89b11fe2`, with sequential patches. Earlier phase records and lab roots are immutable.
No new lab phases or unlisted speed experiments. New ideas go into the backlog unmeasured.

The operator's November 2 hardening note governs this work. The requirements in
[LANDING326](./performance-experiments/2026-10-29-worker-catchup/phase326/evidence/LANDING326.md.gz),
[323 landing notes](./performance-experiments/2026-10-29-worker-catchup/phase323/evidence/LANDING-NOTES-DRAFT.md.gz)
and [MODE-REPAIR326](./performance-experiments/2026-10-29-worker-catchup/phase326/MODE-REPAIR326.md)
apply, with the operator's explicit evidence and retry decisions taking precedence.

## Boundaries and stop rules

All gates, limits, budgets, deadlines and security checks stay. No server or wire
change is authorized. Stop and report on app refusal, owner closure, repair-required,
missing writing, actual archive difference or cold failure; an unexpected negative-control
pass; or a need to change trust, limits, gates or the approved format. A guard cannot
be weakened to harden an item: drop it and record why. Preserve harness failures,
repair the harness and rerun. Latency misses remain failures and do not erase a run.
At Stage 5 make at most one fix when the cause is known and in scope; otherwise the
operator chooses fix or debt. A maintenance deadline missed because of retry waits
requires an immediate report with the numbers.

No private lab implementation lands: no rangeLab, labRawReadAhead, maintenanceTraceLab,
faultTrace327, ledgerDiff329, auditLab333, query/sessionStorage switches, named-hint
header or requestBudget observation counters. Reimplement the approved behavior.

Excluded: V/F/D, named hints, immediate-inflight or sender-default changes, zero-delay
priority retries, automatic checkpoints/two-device admission/signed tips, phase 333
rotation-cost repairs, per-publisher fetch-ahead, both phase 334 diagnostics, changes to
the single scheduler work lane, forged-ID probe, CRDT ownership or a rewrite.

## Target and release profile

Capacity mapping, S, Y with a 10-second priority retry, R1000, E and idle-start audit.
After format approval only: stored-mode repair, dense receipts, record-scoped owned
parsed pages, G8 and B. Keep range 4, quiet 750 ms, coordinated-2000, 16/s and 64/s
budgets, 32 MiB index, V0 and D0.

All following names have the `VITE_ACCOUNT_` prefix: BASELINE_READ, BASELINE_INSTALL,
RETENTION, RETENTION_AUTO, RETENTION_RESUME and RANGE_RECEIVE are 1; HISTORY_AUTO is
0; BATCH is coordinated-2000. Ordinary RANGE_RECEIVE builds stay off. Until format
approval, no released build may write the new rows.

## Ordered work and checkpoints

1. **Maintenance.** Capacity mapping first: all five PreparationCapacity sites become
   skipped/capacity through the existing parked path, keep the journal/caps, retry a
   changed authenticated hint behind the retry clock, and park again on reopen.
   Integrity/storage errors still halt, with content-free error class/code diagnostics.
   S starts its slice clock at the first fresh miss; replayed hits do not consume fresh
   work time. Y uses a typed priority-only interruption and retries in 10 seconds;
   every non-priority or mixed condition remains 60 seconds. Input/drain quiet guards
   remain. Prove every throw site, saved-journal reopen/retry, integrity halt, fresh
   progress/bounds, every interruption condition/mix and quiet behavior. **Full-suite checkpoint.**
2. **Receive without new rows.** R1000 is per-slot state, active for 30 seconds after
   quiet discovery without an intervening publisher hint; retain the first-missed-hint
   limitation. Prove post-drain liveness, normal cost, clocks, invalidation, close and
   maintenance. E holds only exact raw original bytes, bounded/ephemeral/erased, with
   750 ms quiet eligibility, own checks at 5 seconds, native round robin/send yielding,
   request-start proof age. Prove clock/context/cursor/through/expiry, malformed or
   reordered/mismatched batches, continuous fairness with and without backlog, old tabs.
   **Full-suite checkpoint.**
3. **Format contract and operator handoff.** Specify final bounded binary schema/tag
   home, every direct reader, stale-tab fence, rollback/reader-only artifact, handoff
   version, logical budgets/audit units/index charge, released v2/lab-row evidence and
   reader-first release option. **Full-suite checkpoint; stop this stage for approval.**
   Only after approval implement stored mode from saved-byte arguments, all four
   stored callers and gates, dense readers/writer, exact-evidence owned pages with
   record-scoped turns, G8/range 4, B up to four signed requests of eight positions
   with the existing two-read fallback. Keep cache limits 8 entries/32 positions/
   MAX_PENDING_BYTES across cache/tail/wire, cancellation/wipe, budget/cut/order/
   fairness/contention/hint-loss/active-edit/index/old-tab controls, identical inbound
   hex refusal, and full-versus-incremental mixed-row properties. Permanently retain
   the stale-turn negative control. Pass RANGE_RECEIVE through Vite/Docker explicitly.
   Rejection/deferral skips these writers and keeps RANGE_RECEIVE off.
4. **Idle-start audit.** After 1,000 ms without keydown/beforeinput/pointerdown and no
   foreground job queued; 1,024 new physical rows force an attempt, not completion.
   Keep 256-row/5-minute due rules and all existing guards/nondiscretionary validation.
   Prove quiet/jobs/cap/interruption/continuous activity/no-input/close and oracle
   mismatch refusal (stale page turn if present, otherwise injected ledger difference).
   Document the longer audit lag and receive blocking as proposed RC debt.
   **Full-suite checkpoint. If format approval is pending, complete this then wait.**
5. **Final hardened gates, after approval or explicit format deferral.** Full suite
   green before timings; frozen release-profile assets and pinned Chrome; no lab code
   or observation switches in built assets. Current civil-date fixtures must be grown
   through real sync/accepted edits, never edited storage. Quiet host, no profiler,
   external CPU/top-process log every 5 seconds for each timed run.
   Three replicas of each original cell: native-context, native-resumable, native-deep,
   late-normal, late-withheld, old-maintenance-normal/withheld, fairness,
   goals-desktop/mobile4x, grown-normal/withheld (36 journeys). Keep input 16 ms p95,
   peer/every-marker 2.5 s, deep 30 s at 0 ms, backlog 600 s, cold 15 s, writer 120 s.
   Grown overlap alone requires >=60 keys. Observe both grown owners through completion
   or 120 seconds after the last key; one failed replicate fails a cell. The full target
   has never run these gates; phase 320 was an earlier stack.
   Report-only: deep 50 ms x3, grown 329 single-500 Device 1/coordinated/0 ms x3 with
   audit overlap, paired-150 same fixture/policy/RTT x3, one 3,072-position reader with
   non-overflowing exact fallback-position counter, actual Goals sizes. Report a
   recurring phase 332 download timeout, but do not investigate it otherwise.
6. **Landing report, then stop.** Each item hardened/tests or dropped/reason; every
   journey/failed predicate; hardened versus lab deep 14.6 s, maintenance 34/55 s,
   withheld/input/cold/bytes-per-position/index-cap results. Proposed debts include
   audit blocking receive (4.6–5.0 s at ~2,700 rows; 6.5 s worst, ~1.7 ms/row), paired
   >2.5 s/coordinated 2-second hold, unchanged single work lane, no physical phone or
   real-account timing, no proven RAM saving and retention parking at capacity.
   Record non-default flags, ask the operator to confirm deployed flags (not recorded
   by the repo), and give flag/format rollback steps. No automatic merge/deployment.

## Current checkpoint

Stage 1.1 is complete (patch 335); Stage 1.2 is active. Capacity mapping has focused evidence; the Stage 1 full-suite checkpoint is still pending. No new format is approved.
Checkpoint evidence will be appended to completed.md before advancing this state.
