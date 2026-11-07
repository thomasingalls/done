# Phase 472 — grown maintenance passes with both owners observed

Grown-normal and grown-withheld each pass 3/3 on the exact phase 470 ordinary
release-profile assets (phase 469 repair). The fixture has 2,048 accepted backlog
positions and the current civil date, grown through real accepted writing/sync.
No storage edits, new build, application/case change, profiler or lab factor.

| Journey | Overlap keys | Writer completion observed (s after last key) | Reader completion observed (s after last key) | Input p95 (ms) | Peer p95 (ms) | Worst marker (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Normal 1 | 120 | 33.052 | 39.292 | 3.607 | 1030.140 | 972.573 |
| Withheld 1 | 114 | 35.600 | 61.787 | 4.420 | 1473.400 | 1337.977 |
| Normal 2 | 120 | 38.321 | 38.175 | 5.079 | 1031.183 | 1001.837 |
| Withheld 2 | 112 | 37.667 | 61.510 | 3.921 | 1584.941 | 1952.412 |
| Normal 3 | 120 | 31.712 | 43.405 | 3.896 | 1015.449 | 866.314 |
| Withheld 3 | 112 | 31.975 | 62.404 | 4.146 | 1600.451 | 938.775 |

All original metric predicates pass, including >=60-key overlap, 16 ms input,
2.5 s peer/every-marker, 600 s backlog, final delivery, writer deadline and both
cold archives. The saved-preparation prerequisite also stays required and is
exercised in every valid run. Neither old-fixture amendment is applied. The
writer's original 120-second wait is unchanged, followed by the original
phase 321 observation of both owners until completion/halt/120 seconds after
the last key. All twelve owner completions are observed without censoring.
No new attempts are observed during typing, nor reader attempts during its drain.

Writer completions are observed at 31.712–38.321 s, reader completions at
38.175–62.404 s. These are public status observations with the original clock
bounds, not native task timestamps. The inclusive lock/close/reopen/export/close
cold intervals all pass 15 s; maximum is 3.309 s. No capacity status is observed.
Native journal bytes, exact interruption jobs and configured retry-clock events
are unavailable in shipping presentation and stay explicitly null. Observed
attempt outcomes and end-to-next-start gaps are retained; no zero native counts
or fictitious journal statistics are substituted.

## Preserved harness failure and repair

The first normal attempt reaches both observed completions, exact archive/Undo
and both exact cold exports. An optional final observer then evaluates an already
closed original page, throwing before result.json can be saved. Preserve its
partial result, failed child log, host/power files and private state; it receives
no acceptance credit. This is a harness failure, not a reported app refusal or
archive/cold difference. Stop and remove only its verified disposable API
container (gateway had exited), preserving the cleanup identity.

The private presentation helper now marks closed-page observations unavailable.
It leaves live snapshots exact and propagates live errors; four controls pass.
No assertion, wait, gate or app source changes. A fresh normal replicate-1
retry and the other five declared cases all pass. Also keep the earlier private
driver-generation error, which occurred before any app run. There are seven app
attempts, six valid journeys, one ungraded harness failure, and no noise retries.

The case is byte-identical to its bound phase 466 body. The full original
phase 320 metric/gate block is unchanged after indentation-only extraction;
only its lab-native reporting is replaced by honest public-presentation fields.
All 125 shipping files and seven phase 469 working bindings remain exact.
Every valid run has display-on five-second CPU/top/fseventsd/swap logs; swap is
constant and no qualifying non-test CPU streak is recorded. Windowed power files
and full-log hashes/sizes remain. Bulk state/profile bytes stay local behind one
hash manifest, with no evidence object copies in Git.

The repaired-source candidate has 12/36 blocking journeys passing. Twenty-four
remain (native 9, late-writing 6, fairness 3, Goals 6), then report-only work and
Stage 6. Earlier-source passes remain evidence, not transferred acceptance.
Continue in bounded phases with the native block and later host handshakes.
No commit, push, release preparation or deployment.
