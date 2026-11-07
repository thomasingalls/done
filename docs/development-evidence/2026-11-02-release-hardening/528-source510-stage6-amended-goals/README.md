# Stage 6 amendment — completed source 510 matrix with approved Goals guards

**Date:** 2026-11-07. **Scoped matrix complete: 12 cells, 3 supported passing replicates each. Stop for the operator.**

This amends phases 491, 517 and 523 without rewriting them. The operator accepted 518 and carried 21 source-qualified runs, then accepted 525 outcome (a), explicitly changed only the Goals Undo/Redo completion guards, and carried the two stricter 522-r1 Goals passes. The four remaining amended-spec runs pass in 527. There are **36 supported passing matrix rows: 21 source carryovers + 9 native/fairness reruns + 2 stricter Goals r1 carries + 4 fresh amended Goals runs**. These represent 15 distinct passing plain 510 Stage 5 executions; 16 raw Stage 5 rerun attempts include the retained old failed 522-r2. The six separate no-credit phase 525 diagnostic tries are excluded from that count. These are not 36 new executions. No noise retry was used.

The app, ordinary 510 assets, fixtures, analyzers, pinned browser, budgets, limits, format and all other gates/deadlines are unchanged. The only new guard is the operator-approved `expect.poll(..., {timeout: 2500})` after each original Undo/Redo chord, retaining the exact text-differs/text-restored predicates. The new frozen spec is SHA-256 `f57e393f748093d2f4fe45de2dce849038adbaa2872c0b17376b50fed13b35ff`; phase 526's inverse proof binds exactly two changed lines. No profiler or new timed observer was added.

## Every supported journey

| Cell / replicate | Disposition | Evidence | Input p95 ms | Peer p95 ms | Deep ms | Goals beforeinput / rAF p95 ms | Result |
|---|---|---|---:|---:|---:|---|---|
| fairness / 1 | executed-on-plain510 | 521-r1-fairness | 4.500 | 1107.100 | — | — / — | pass |
| fairness / 2 | executed-on-plain510 | 521-r2-fairness | 6.800 | 1343.000 | — | — / — | pass |
| fairness / 3 | executed-on-plain510 | 521-r3-fairness | 9.100 | 927.100 | — | — / — | pass |
| goals-desktop / 1 | operator-carried-stricter-goals-guard | 522-r1-goals-desktop | — | — | — | 6.773 / 15.375 | pass |
| goals-desktop / 2 | executed-on-plain510-amended-goals-guard | 527-r2-goals-desktop | — | — | — | 5.538 / 16.938 | pass |
| goals-desktop / 3 | executed-on-plain510-amended-goals-guard | 527-r3-goals-desktop | — | — | — | 5.782 / 14.863 | pass |
| goals-mobile4x / 1 | operator-carried-stricter-goals-guard | 522-r1-goals-mobile4x | — | — | — | 4.379 / 34.368 | pass |
| goals-mobile4x / 2 | executed-on-plain510-amended-goals-guard | 527-r2-goals-mobile4x | — | — | — | 4.617 / 34.569 | pass |
| goals-mobile4x / 3 | executed-on-plain510-amended-goals-guard | 527-r3-goals-mobile4x | — | — | — | 5.682 / 37.329 | pass |
| grown-normal / 1 | operator-carried | 472-r1-grown-normal-harness-retry | 3.607 | 1030.140 | — | — / — | pass |
| grown-normal / 2 | operator-carried | 472-r2-grown-normal | 5.079 | 1031.183 | — | — / — | pass |
| grown-normal / 3 | operator-carried | 472-r3-grown-normal | 3.896 | 1015.449 | — | — / — | pass |
| grown-withheld / 1 | operator-carried | 472-r1-grown-withheld | 4.420 | 1473.400 | — | — / — | pass |
| grown-withheld / 2 | operator-carried | 472-r2-grown-withheld | 3.921 | 1584.941 | — | — / — | pass |
| grown-withheld / 3 | operator-carried | 472-r3-grown-withheld | 4.146 | 1600.451 | — | — / — | pass |
| late-normal / 1 | operator-carried | 475-r1-late-normal | 3.955 | 1033.360 | — | — / — | pass |
| late-normal / 2 | operator-carried | 475-r2-late-normal | 3.710 | 1037.590 | — | — / — | pass |
| late-normal / 3 | operator-carried | 475-r3-late-normal | 3.853 | 1029.259 | — | — / — | pass |
| late-withheld / 1 | operator-carried | 475-r1-late-withheld | 3.213 | 1779.782 | — | — / — | pass |
| late-withheld / 2 | operator-carried | 475-r2-late-withheld | 4.481 | 1937.680 | — | — / — | pass |
| late-withheld / 3 | operator-carried | 475-r3-late-withheld | 4.765 | 1994.494 | — | — / — | pass |
| native-context / 1 | operator-carried | 474-474-r1-native-context | — | — | — | — / — | pass |
| native-context / 2 | operator-carried | 474-474-r2-native-context | — | — | — | — / — | pass |
| native-context / 3 | operator-carried | 474-474-r3-native-context | — | — | — | — / — | pass |
| native-deep / 1 | executed-on-plain510 | 520-r1-native-deep | — | — | 20042.631 | — / — | pass |
| native-deep / 2 | executed-on-plain510 | 520-r2-native-deep | — | — | 21827.583 | — / — | pass |
| native-deep / 3 | executed-on-plain510 | 520-r3-native-deep | — | — | 22726.044 | — / — | pass |
| native-resumable / 1 | executed-on-plain510 | 520-r1-native-resumable | — | — | — | — / — | pass |
| native-resumable / 2 | executed-on-plain510 | 520-r2-native-resumable | — | — | — | — / — | pass |
| native-resumable / 3 | executed-on-plain510 | 520-r3-native-resumable | — | — | — | — / — | pass |
| old-maintenance-normal / 1 | operator-carried | 470-r1-old-maintenance-normal | 3.384 | 796.318 | — | — / — | pass |
| old-maintenance-normal / 2 | operator-carried | 471-r2-old-maintenance-normal | 3.530 | 796.353 | — | — / — | pass |
| old-maintenance-normal / 3 | operator-carried | 471-r3-old-maintenance-normal | 3.696 | 816.707 | — | — / — | pass |
| old-maintenance-withheld / 1 | operator-carried | 471-r1-old-maintenance-withheld | 3.180 | 1829.596 | — | — / — | pass |
| old-maintenance-withheld / 2 | operator-carried | 471-r2-old-maintenance-withheld | 3.484 | 1847.544 | — | — / — | pass |
| old-maintenance-withheld / 3 | operator-carried | 471-r3-old-maintenance-withheld | 3.530 | 1830.457 | — | — / — | pass |

All 12 cells have three supported passing replicates under their applicable frozen version. One failed replicate would still fail a cell; no failure was silently recast. The old 522-r2 remains a separate failed historical attempt under the superseded immediate-read guard. Carryover authority, source versions and original metrics remain explicit in `528-journeys.json`.

Goals retains its original 779-event denominator, exact paragraph, preserved return input, archive and exact cold predicates. Its beforeinput/rAF measurements are diagnostic; key-to-rAF is not the mutation 16 ms gate and Goals has no peer measurement. No substitute threshold is introduced.

## Goals completion guard and preserved failure

| Goals run | Undo poll elapsed ms | Redo poll elapsed ms | Qualification |
|---|---:|---:|---|
| 522-r1-goals-desktop | — | — | not recorded; old stricter spec |
| 522-r1-goals-mobile4x | — | — | not recorded; old stricter spec |
| 527-r2-goals-desktop | 48.563 | 38.453 | driver elapsed; no threshold |
| 527-r2-goals-mobile4x | 77.548 | 67.319 | driver elapsed; no threshold |
| 527-r3-goals-desktop | 62.056 | 49.107 | driver elapsed; no threshold |
| 527-r3-goals-mobile4x | 74.909 | 64.635 | driver elapsed; no threshold |

These elapsed fields span the driver's keypress call through poll success and have no independent threshold. They include dispatch and polling overhead, so they are not CPU costs or a precise timestamp of canonical admission. The actual assertions retain the approved 2,500 ms timeout. The two carried r1 values were not recorded, not inferred as zero.

**522-r2 is preserved as the immediate-read race per accepted phase 525 and the operator's explicit disposition.** That old run failed immediately after Mod-z; Redo/export/cold were not reached and remain unobserved. Its exact queue state/eventual Undo latency was not recorded and is not fabricated. Phase 525 separately reproduced eventual exact Undo/Redo in all six tries, including all three busy-queue tries; it earns no Stage 5 credit. Phase 527-r2 is a fresh passing run of the amended guard, not a rewriting of 522-r2.

## Saved end state on profile copies

| Run | Saved profile | Counter / revision / history mode | Source files and native records unchanged |
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
| 527-r2-goals-desktop | private-profile | 2 / 0 / complete | yes |
| 527-r2-goals-mobile4x | private-profile | 2 / 0 / complete | yes |
| 527-r3-goals-desktop | private-profile | 2 / 0 / complete | yes |
| 527-r3-goals-mobile4x | private-profile | 2 / 0 / complete | yes |

Every listed endpoint was inspected only after its wrapper exited, on copies of profiles the harness already saved. The source file inventories and native before/after digests agree. The old failed 522-r2 endpoint remains separately recorded in 523 (counter v2, revision 0, complete). No ephemeral profile end was invented, and no endpoint implies a reduction timestamp or a count of recovery interruptions.

## Requested new debts

**The exact ERR_ABORTED cancellation cause is unknown.** In saved 522-r2 traffic, the post-resume submit began at +640.490 ms and ended `net::ERR_ABORTED` after 22.939 ms. The saved service ledger shows a continuous 58 accepted publisher positions and zero refused positions; no lost or refused position is evident. The browser's 57 submit calls are not a complete request/response pairing. No abort reason/stack/body was recorded, so no specific cancellation mechanism is claimed. The next membership request at +16.149 s, versus +3.994 s in r1, is consistent with the existing healthy 15–20 s idle cadence and their different pre-resume poll phases; that is not proof excluding storage/queue delay. Phase 524 contains the unchanged saved-record trace.

**Undo's main-thread cost remains unmeasured.** Phase 525's intended 10 ms observation loop left gaps of approximately 23–241 ms across the six tries. Those gaps hint at delayed main-thread scheduling but do not attribute CPU, dispatch, queue admission, publication or browser-protocol overhead. The new poll elapsed fields do not resolve that attribution. No new profiling or app repair is authorized here.

**The one unmeasured effect of 508 remains:** on already reduced devices, the frequency of full reauthentication after the conservative `if (logical) clearView()` interruption and the resulting input/peer cost during continued typing. Endpoint inspection and passing functional Undo do not quantify that path.

## Other Stage 6 findings, flags and rollback remain

All implementation/test dispositions and lab-versus-hardened qualifications in 491/517 remain in force; this amendment changes only the scoped source-510 matrix and requested debts. Keep the existing full-audit receive blocking (lab 4.6–5.0 s around 2,700 rows, 6.5 s worst), coordinated paired-150 misses, initial missed-hint idle wait, no physical-phone/real-account timing or proven RAM saving, retained-journal capacity parks and potentially expensive 60 s retries after new hints, effectively ~2 MiB of snapshot inside the 4 MiB hex baseline ceiling, unmeasured preparation/index costs, 250 ms batch-shortcut logical fairness without a wall-time bound, and history-sized Worker replies. Earlier report-only misses keep their original source identity and gain no fresh 510 credit.

The separate phase 516 report reached 3,072 positions: 519 ms native open, 54,216 ms catch-up, 54,735 ms open-to-visible, exact ordinary offline cold 5,958 ms, peak charged index 25,969,753 bytes below 33,554,432, and 769 encoded receipts / 5,185,602 bytes (~1,688 bytes/position). No production index fallback was observed. This is report-only and proves neither RAM saving nor actual crossing of the production cap.

The unchanged release profile uses the `VITE_ACCOUNT_` prefix for `BASELINE_READ=1`, `BASELINE_INSTALL=1`, `RETENTION=1`, `RETENTION_AUTO=1`, `RETENTION_RESUME=1`, `RANGE_RECEIVE=1`, `HISTORY_AUTO=0`, `BATCH=coordinated-2000`, `LEDGER=incremental`, `LEDGER_PROFILE=0`. Ordinary writer defaults remain off. Service automation, V/F/D and sender default changes remain out. Deployed flags still require operator confirmation during separately authorized release work.

The compatible rollback target remains a same-source reader-on/writer-off image; the earlier phase 430 component images are not a final signed 510 image pair. **Rolling back to any build before this release locks out devices that wrote dense rows.** Disabling writing does not undo saved rows or their authenticated floor. Do not clear storage or rewrite receipts to force rollback.

Phases 526–528 are sequential documentation/evidence patches with private hash-bound frozen-spec artifacts. The real index remains empty. **Stop for the operator.** No extra journey, app change, commit, push, image preparation, publication or deployment follows this amendment.
