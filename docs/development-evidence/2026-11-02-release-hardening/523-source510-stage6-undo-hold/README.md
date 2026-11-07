# Stage 6 amendment — source510 carryover, reruns and Undo stop

**Date:** 2026-11-07. **Status: not cleared; scoped matrix incomplete.** This amendsthe original phase 491 and phase 517 records without changing any historical evidence or failure. The operator accepted518 and carried21runs. Of the15 newly declared reruns,12 were attempted:11 pass,1 fails,3 remain unrun under the existing functional-failure stop. This is not36 new executions, nor15 completed reruns.

No app, test body, gate, assertion, wait, deadline, budget, limit, format, sender default or release flag changed. No new observer or profiler was added to timed runs. All earlier failures and records remain immutable. No publication or deployment is authorized by this amendment.

## Operator carryover and executed scope

The21 carried runs cover three replicates each of old-maintenance-normal, old-maintenance-withheld, grown-normal, grown-withheld, native-context, late-normal and late-withheld. Authority is the operator’s explicit decision recorded519, citing518’s normalized ordinary-bundle byte proof, saved-state reachability and maintenance install timing. All phase 518 coverage qualifications remain. Carried timings stay labelled **carried**, not fresh measurements.

The operator declared three reruns each of native-resumable, native-deep, fairness, goals-desktop and goals-mobile4x on plain 510. Native-resumable 3/3, native-deep 3/3 and fairness 3/3 pass. Goals-desktop replicate1 and Goals-mobile4x replicate1 pass. Goals-desktop replicate2 fails the original Undo guard. The remaining three Goals cases did not run.

The frozen specs, fixtures, analyzers, pinned Chrome and resource bounds are exact. The ordinary125-file510manifest remains byte-exact; its already-built42 additional native test assets have no source transforms or observation hooks. The Goals block has the fresh operator quiet-host reply. Five-second external host logs, display-state checks and windowed power logs remain unchanged. No candidate speed experiment or hardening is started.

## Every journey in the scoped matrix

| Cell / replicate | Disposition | Evidence | Input p95 ms | Peer p95 ms | Deep ms | Goals beforeinput / rAF p95 ms | Result |
|---|---|---|---:|---:|---:|---|---|
| fairness / 1 | rerun | 521-r1-fairness | 4.500 | 1107.100 | — | — / — | pass |
| fairness / 2 | rerun | 521-r2-fairness | 6.800 | 1343.000 | — | — / — | pass |
| fairness / 3 | rerun | 521-r3-fairness | 9.100 | 927.100 | — | — / — | pass |
| goals-desktop / 1 | rerun | 522-r1-goals-desktop | — | — | — | 6.773 / 15.375 | pass |
| goals-desktop / 2 | rerun | 522-r2-goals-desktop | — | — | — | — / — | FAIL |
| goals-desktop / 3 | not run | — | — | — | — | — / — | not run |
| goals-mobile4x / 1 | rerun | 522-r1-goals-mobile4x | — | — | — | 4.379 / 34.368 | pass |
| goals-mobile4x / 2 | not run | — | — | — | — | — / — | not run |
| goals-mobile4x / 3 | not run | — | — | — | — | — / — | not run |
| grown-normal / 1 | carried | 472-r1-grown-normal-harness-retry | 3.607 | 1030.140 | — | — / — | pass |
| grown-normal / 2 | carried | 472-r2-grown-normal | 5.079 | 1031.183 | — | — / — | pass |
| grown-normal / 3 | carried | 472-r3-grown-normal | 3.896 | 1015.449 | — | — / — | pass |
| grown-withheld / 1 | carried | 472-r1-grown-withheld | 4.420 | 1473.400 | — | — / — | pass |
| grown-withheld / 2 | carried | 472-r2-grown-withheld | 3.921 | 1584.941 | — | — / — | pass |
| grown-withheld / 3 | carried | 472-r3-grown-withheld | 4.146 | 1600.451 | — | — / — | pass |
| late-normal / 1 | carried | 475-r1-late-normal | 3.955 | 1033.360 | — | — / — | pass |
| late-normal / 2 | carried | 475-r2-late-normal | 3.710 | 1037.590 | — | — / — | pass |
| late-normal / 3 | carried | 475-r3-late-normal | 3.853 | 1029.259 | — | — / — | pass |
| late-withheld / 1 | carried | 475-r1-late-withheld | 3.213 | 1779.782 | — | — / — | pass |
| late-withheld / 2 | carried | 475-r2-late-withheld | 4.481 | 1937.680 | — | — / — | pass |
| late-withheld / 3 | carried | 475-r3-late-withheld | 4.765 | 1994.494 | — | — / — | pass |
| native-context / 1 | carried | 474-474-r1-native-context | — | — | — | — / — | pass |
| native-context / 2 | carried | 474-474-r2-native-context | — | — | — | — / — | pass |
| native-context / 3 | carried | 474-474-r3-native-context | — | — | — | — / — | pass |
| native-deep / 1 | rerun | 520-r1-native-deep | — | — | 20042.631 | — / — | pass |
| native-deep / 2 | rerun | 520-r2-native-deep | — | — | 21827.583 | — / — | pass |
| native-deep / 3 | rerun | 520-r3-native-deep | — | — | 22726.044 | — / — | pass |
| native-resumable / 1 | rerun | 520-r1-native-resumable | — | — | — | — / — | pass |
| native-resumable / 2 | rerun | 520-r2-native-resumable | — | — | — | — / — | pass |
| native-resumable / 3 | rerun | 520-r3-native-resumable | — | — | — | — / — | pass |
| old-maintenance-normal / 1 | carried | 470-r1-old-maintenance-normal | 3.384 | 796.318 | — | — / — | pass |
| old-maintenance-normal / 2 | carried | 471-r2-old-maintenance-normal | 3.530 | 796.353 | — | — / — | pass |
| old-maintenance-normal / 3 | carried | 471-r3-old-maintenance-normal | 3.696 | 816.707 | — | — / — | pass |
| old-maintenance-withheld / 1 | carried | 471-r1-old-maintenance-withheld | 3.180 | 1829.596 | — | — / — | pass |
| old-maintenance-withheld / 2 | carried | 471-r2-old-maintenance-withheld | 3.484 | 1847.544 | — | — / — | pass |
| old-maintenance-withheld / 3 | carried | 471-r3-old-maintenance-withheld | 3.530 | 1830.457 | — | — / — | pass |

The matrix therefore has32 passing rows (21 carried plus11new), one failing row and three unrun rows. One failed replicate fails its cell: **Goals-desktop fails; Goals-mobile4x is incomplete**. The other ten cells pass their original applicable predicates. The full machine matrix preserves every row and its source binding.

Goals keeps the frozen diagnostic denominator, paragraph, return/Undo and exact-cold predicates. Key-to-rAF is not the mutation16 ms gate, and Goals has no peer measurement. No new threshold or substitute metric is introduced. The failed run’s observations are retained but not relabelled as a complete passing diagnostic.

## Functional guard failure and stop

The failure is at the unchanged `/private/tmp/done-goals-gates-478-20261106/stall.spec.ts:90`: save `beforeUndo`, press `ControlOrMeta+z`, immediately read `documentText`, assert that it differs. It did not differ. `exactParagraph` and `returnInputPreserved` passed; no page errors were recorded. The final frozen observer records trusted, focused, visible key events and no overflow. Redo, export and cold were not reached; they are neither passes nor a cold failure.

The evidence proves the immediate unchanged read. It does **not** yet distinguish eventual Undo failure from an immediate assertion racing asynchronous UI publication. No test repair is assumed, no wait is added and no app fix is made. The autogenerated error-context suggestions remain untrusted diagnostic text.

The fixed host-noise rule does not allow a retry here: swap stayed12692.44 MiB, the display stayed on, and no process exceeded one core for more than 10 seconds (longest high CPU streak5.004 seconds, a test renderer). The wrapper did not hit its deadline. The frozen functional-failure stop wins; r2-goals-mobile4x, r3-goals-desktop and r3-goals-mobile4x remain unrun.

## End baseline revision and history, after each attempted run

Each attempted journey’s existing saved profile(s) were copied only after its timed wrapper and app owners exited. The phase 518 native digest/readonly metadata seam then inspected the copies on inert pages. Every source storage-file inventory and native before/after digest agrees. No original profile was opened by the inspector; there was no extra in-run observation or new semantic trust. Only profiles the harness already saved are listed; ephemeral publisher/background ends are not invented.

| Run | Saved profile | Counter / revision / history | Source bytes and native records unchanged |
|---|---|---|---|
| 520-r1-native-resumable | private-profile | 5 / 2 / baseline-plus-suffix | yes |
| 520-r1-native-deep | private-profile | 2 / 0 / complete | yes |
| 520-r2-native-resumable | private-profile | 5 / 2 / baseline-plus-suffix | yes |
| 520-r2-native-deep | private-profile | 2 / 0 / complete | yes |
| 520-r3-native-resumable | private-profile | 5 / 2 / baseline-plus-suffix | yes |
| 520-r3-native-deep | private-profile | 2 / 0 / complete | yes |
| 521-r1-fairness | private-profile-Q0 | 5 / 1 / baseline-plus-suffix | yes |
| 521-r1-fairness | private-profile-Q1 | 2 / 0 / complete | yes |
| 521-r2-fairness | private-profile-Q0 | 5 / 1 / baseline-plus-suffix | yes |
| 521-r2-fairness | private-profile-Q1 | 2 / 0 / complete | yes |
| 521-r3-fairness | private-profile-Q0 | 5 / 1 / baseline-plus-suffix | yes |
| 521-r3-fairness | private-profile-Q1 | 2 / 0 / complete | yes |
| 522-r1-goals-desktop | private-profile | 5 / 1 / baseline-plus-suffix | yes |
| 522-r1-goals-mobile4x | private-profile | 5 / 1 / baseline-plus-suffix | yes |
| 522-r2-goals-desktop | private-profile | 2 / 0 / complete | yes |

The failed run’s counter is v2, revision0, complete history. By the metadata gate shown in phase 518, that workspace cannot seed the reduced warm continuation and reach phase 508’s added `if(logical)clearView()` statement. This narrows attribution but does not identify a root cause or excuse the failed guard. The native-resumable cases directly cover input/Undo after reduction; the other endpoint states do not timestamp reduction or count recovery interruptions.

## One unmeasured effect of 508, and unchanged debts

**Post-reduction typing cost remains unmeasured:** how frequently the fresh-check interruption after a nonempty logical advance occurs; how often conservative `clearView` forces full reauthentication; and input/peer latency during continued typing on an already reduced device. These endpoint observations and passing functional cases do not quantify that mechanism. No frequency, amortized cost or absence of regression is inferred.

All existing Stage 6 debts inthe original phase 491 and phase 517 records remain: full audits block receive; coordinated paired-150 exceeds 2.5 s; no physical-phone/real-account timing or proven RAM saving; initial lost-hint idle wait; preparation/baseline capacity ceilings and possibly expensive once-per-minute retries on new hints; about2 MiB snapshot within the4 MiB hex-encoded baseline limit; unmeasured preparation cost; batch-shortcut fairness has a logical bound without a wall-time bound; and history-sized/unbounded Worker replies. Earlier report-only sender/deep-50 misses remain bound to their original builds, without extra carryover credit.

The missing3072 report was separately supplied in phase 516: native open 519 ms, catch-up54216 ms, open-through-visible54735 ms, exact ordinary offline cold 5958 ms, peak charged index 25969753bytes below33554432,769 source encoded receipts/5185602bytes, and no observed capacity fallback. That approved observed-build report grants no blocking credit and proves neither RAM saving nor an actual production-cap crossing.

## Flags, rollback and operator handoff

The phase 510 profile is unchanged: `VITE_ACCOUNT_BASELINE_READ=1`, `BASELINE_INSTALL=1`, `RETENTION=1`, `RETENTION_AUTO=1`, `RETENTION_RESUME=1`, `RANGE_RECEIVE=1`, `HISTORY_AUTO=0`, `BATCH=coordinated-2000`, `LEDGER=incremental`, `LEDGER_PROFILE=0` (the abbreviated names all have the `VITE_ACCOUNT_` prefix). Ordinary writer defaults remain off. Service automation, V/F/D and sender-default changes stay out. Deployed flags still require operator confirmation during separately authorized release work.

Rollback obligations remain: a same-source reader-on/writer-off image is the compatible rollback target.Phase 430’s earlier component images do not claim a final signed source-510 image pair. **Rolling back to any build before this release locks out devices that wrote dense rows.** Disabling the writer does not undo saved rows or their authenticated floor; do not clear storage or rewrite receipts to force rollback.

Sequential documentation patches 519–523 preserve the 21 carried decision, nine passing native/fairness reruns, Goals partial failure and this amendment. The real index stays empty. **Stop for the operator with the matrix incomplete.** No extra run, app/harness repair, merge, push, image preparation, publication or deployment follows this stop.
