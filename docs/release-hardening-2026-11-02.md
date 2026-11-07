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

## Stop-rule clarification on resume

Red unit tests on code still being written are ordinary development: fix, rerun and
preserve the logs. Functional stops concern the hardened app (journeys, app runs,
cold opens and Stage 5), an unexpectedly accepted negative control, or an existing
test that cannot pass without weakening a guard. The two existing controls in
localRetentionProgress and automaticLocalRetention passed after the metadata-map
rename without any edits to those test files. The original stop record is preserved.

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

## Working state

Our active slice is in [progress.md](./progress.md#active-slice-release-hardening--format-contract-and-idle-audit).
Closed outcomes and reasoning remain in completed.md and decisions.md. This document
records the operator's hardening scope and ordered plan; it introduces no separate
documentation procedure or second active-state home.


## Operator amendment — display-controlled native campaigns,2026-11-03

The operator's Mac power-log review places every full observer failure from363/365/374 in display-off intervals and the full clear/trim passing retries in display-on intervals; the Mac never slept. After a complete display-on storage:editor run at the same2,400s outer budget as374-20, all12normal cases and3mutants pass in phase380. Keep all earlier failed evidence. Subsequent macOS native campaigns use `caffeinate -d` and record actual display power state in each5s host log. No wait, deadline, assertion, gate, limit, budget, trust or format decision changes; no new lab phase or performance/causal credit.


## Operator amendment — unit hang guard and exhaustive extents, 2026-11-03

The operator reports restarting the continuously busy fseventsd after phase383.
Rerun the nine failed commands with the original120s full-unit stage first, adding
explicit fseventsd CPU and swap use to every five-second host observation. Record
actual full-unit elapsed time on every run. If any cleaned-host full-unit stage
still exceeds120s, only that class of hang guard is approved to increase to240s.
No other deadline, wait or assertion changes. Preserve every383failure.

Replace the codec property's160seeded draws with all72distinct logical extents:
two publishers, every first/count with count positive and first+count<=8. Retain
all existing byte assertions. This is exhaustive coverage of the old logical
input domain, including extents absent from the fixed seed; no test is removed.


## Operator amendment — continue Stage3.2,2026-11-04

No questions are pending. Continue from407through indirect reader review, per-load/live
owned pages, dense writing, dual audit, G8/B and floor lifecycle/old artifacts/cold/
rollback. Freeze and report each bounded phase, then continue without waiting for
operator input. Stop only for a format, trust, limit or deadline decision, or a
failure that cannot be fixed within the existing guards. This narrows the earlier
blanket functional-failure stop; preserve every earlier record and failed attempt.
No release, commit, merge or deployment authorization is added.


## Operator amendment — bounded index proof and preparation debts, 2026-11-05

Defer commits. Past-index fallback may be proved with the421test-only Worker-build
pattern, lowering only INDEX_MAX_BYTES. Production remains32MiB. Bind the ordinary
asset to that value, prove the test's constant-only change by inverse bytes and
keep the identical eligibility comparisons. The returning-reader proof must still
observe an actual refusal, later fully verified continuation, exact positions,
Undo and ordinary offline process-cold. All original900s setup,120s native and15s
cold bounds remain; this is functional evidence with no performance acceptance.

Do not diagnose preparation cost in this phase. Carry these earlier failed
fixture observations into Stage6, without treating them as representative account
throughput:438's900s attempts witness384replacements/85positions/2,464,019wire
bytes (large pasted values), and1,536replacements/86positions/4,249,788wire bytes
(one-slice UTF8 values).439's corrected900s attempt witnesses1,344replacements/
64positions/3,714,996wire bytes. The actual returning-reader cap case did not run.
The immutable [438record](development-evidence/2026-11-02-release-hardening/438-native-index-fixture-hold/README.md)
and [439record](development-evidence/2026-11-02-release-hardening/439-native-index-preparation-blocker/README.md)
remain the outcome homes. Real-scale32MiB build-up, fallback time and process RAM
are debt, or explicitly report-only later evidence; a smaller functional ceiling
establishes none of those quantities and does not replace the Stage5gates.

Stage6must also state the producer preparation ceiling and its observed size.
In439the producer parks during building at1,024witnessed replacements/49accepted
positions/2,830,306wire bytes. Its status alone cannot distinguish the byte ceiling
from PREPARATION_ENTRIES; instrument the unchanged guard to resolve this without
fixing it. After that park,439actually admits, durably saves and witnesses320more
replacements through15additional accepted positions, ending at1,344/64. That is
bounded continued-writing/sync evidence, not completed maintenance or a claim of
unlimited progress. Keep the journal, parked/retry semantics and every ceiling.
Exact guard/size observations are the next bounded debt-recording task.


### Capacity debt observation — phase442

The exact439R2parked producer/witness/service were cloned and reopened under their
naturally matching frozen439verifier closure; every runtime source is byte-equal
to current hardened code. Five unchanged PreparationCapacity throws and both
LocalBaselineCapacityError guards were instrumented with content-free numeric
observations and inverse-byte proofs. The module-ready event confirms that the
observed Worker code actually loaded. This is reproduction telemetry, not a
retroactive measurement of439, which lacked the throw observations.

The refusal is the **encoded local-baseline limit**, not either preparation-journal
ceiling at retentionPreparation429:

| Value at refusal | Observed | Original ceiling |
|---|---:|---:|
| Encoded baseline bytes | 5,763,419 | 4,194,304 |
| Raw snapshot bytes | 2,779,095 | 4,194,304 |
| Sources | 0 | 4,096 |
| Publishers | 3 | 128 |

encodeLocalBaseline throws LocalBaselineCapacityError at its encoded-length guard;
localRetentionPlan maps that existing candidate refusal to skipped/capacity.
None of the five PreparationCapacity throw observations fires in this reproduction.
No limit, format, catch or retry policy changes. The previous authenticated
baseline/journal and writing remain authoritative; maintenance did not complete.

After the park, the producer remains active/durable without pressure. One new
fully awaited edit is durably saved and accepted at publisher position50; the
witness has the exact complete normalized Markdown archive. Maintenance then
shows waiting/capacity after the changed hint; no later retry completion was
observed. Existing new-hint/retry-clock behavior is retained, and a future
candidate may still hit the same ceiling.439's320post-park replacements and15new
positions remain separate earlier evidence. [Frozen-source observation, every
attempt and limits](development-evidence/2026-11-02-release-hardening/442-capacity-debt-observation/README.md).

Carry the4MiBencoded-baseline ceiling, continuing growth after a park and unmeasured
real-scale32MiBindex time/RAM into Stage6. Do not fix or diagnose preparation cost
in this work. The74.4sreport-only reproduction passes its120sbound and gives no
phone, input/peer performance, RAM or Stage5credit.


### Operator additions to the phase 442 debts — 2026-11-05

**Effective snapshot ceiling.** The 4 MiB limit applies to the encoded JSON
baseline. `bytes()` converts the snapshot to hex before `values()` includes it
in that record, so each snapshot byte occupies two encoded bytes, in addition
to metadata and the other baseline fields. Usable snapshot capacity is therefore
about 2 MiB, less that overhead. Phase 442's existing observation is a
2,779,095-byte snapshot encoded into 5,763,419 bytes; it is not a new measurement.
See `localBaselineRecord.ts` (`bytes`, `values`, `encodeLocalBaseline`) and
`contentRecord.ts` (`MAX_BATCH_BYTES`).

The encoded cap is the first practical capacity boundary as the snapshot grows;
the raw-length check against 4 MiB does not provide 4 MiB of usable snapshot
space. That early raw guard can still reject a single input already larger than
4 MiB before encoding. It remains intact. Binary encoding or a different ceiling
requires an explicit operator format/limit decision; neither is a repair in scope.

**Repeated capacity attempts.** A capacity refusal parks the current authenticated
hint key, not all future hints. A changed ledger hint permits another attempt
behind `LOCAL_RETENTION_RETRY_MS` (60 seconds), with the existing quiet/readiness
checks still applying (`automaticLocalRetention.ts`, `observation`, `schedule`,
and the skipped-result branch). A device that continues writing can therefore
re-enter the failing preparation/build path roughly once a minute when those
checks permit. This is a retry-cost risk inferred from the scheduler, not an
observed cadence: the clock runs from the refusal, and attempt duration and
quiet/readiness delays can lengthen the interval. No permanent capacity park or
cheap retry is established by phase 442.

Stage 6 must list the **unmeasured per-attempt wall/CPU cost** of those repeated
failures alongside the unresolved 438/439 preparation cost and production
32 MiB index build-up/fallback time and RAM. The 74.4-second phase 442 journey
is not a measurement of an individual failed attempt. No new timing, retry-policy,
format, limit, guard or code change is included in these additions.


## Operator amendment — Stage 5 preflight and host noise, 2026-11-05

The 432–436 full pass stands for the unchanged application source. Since 436,
changes are confined to tests, two test-only build configurations, policy and
bookkeeping; the new specs passed in 437 and 441. Before timed runs require only:
typecheck, lint, one complete unit-suite pass, release-validation inventory/policy
checks, fairness.spec and past-index.spec once each, the frozen release-profile
build, and one short dry run of windowed power-log capture. Retain any broader
checkpoint work already performed; do not repeat its remaining commands.

The operator may work lightly in the editor, Firefox and terminal; the Lima VM
stays idle. Builds, other test suites and benchmarks pause during timed blocks,
not between blocks. Before goals-desktop/mobile4x and any cell near the 16 ms
input or 2.5 s peer/marker gate, pause and ask the operator to clear the machine.

Fixed before any timed result: if a failed replicate's five-second host log
shows a non-test process above one full core for more than ten seconds, or swap
growth, rerun that replicate once and retain both results. Operationally inspect
consecutive samples of the same non-test PID above 100% spanning more than ten
seconds, and any increase in recorded swap usedMiB. Preserve the original failed
predicates and noise qualification; no silent regrading or repeated rerun-to-green.
All gates, other stop rules and deadlines remain unchanged.


## Operator Stage 6 observation — bounded batch work, 2026-11-05

Record without a repair: `readInboundBatch` stops adding subrequests after a
completed read reaches the existing 250 ms work cap. Under genuine service load,
a quiet device's appended request can lose this batch shortcut and wait for its
native turn after up to eight busy logical positions (with ordinary eligible
self/other turns still applying). The allowance is a logical bound and provides
**no wall-time limit**. The cap does not bound an individual completed inner read.
Omitted suffixes grant no quiet evidence; the 750 ms request-start cache age,
authority/signature/chain/commit checks and native rotation stay unchanged.

This is a code-level observation requested for Stage 6, not a new real-service
load measurement or acceptance result. Keep the 250 ms cap, all budgets and the
existing peer/marker/input gates. Phase 448 attributed the diagnosed shared-loop
stall mainly to test reporting; phase 449's private control did not establish a
separate production scheduling defect.
