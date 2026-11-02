# Phase334 — why the remaining direction is slow

Trace-only lab evidence, no new build, benchmark, source/default/format/trust change, hardening or release. All original gates and stop rules remain. Reuses18 successful phase 329 pairs and12 successful phase 333 pairs (30 journeys, 60 owner snapshots), with333’s complete native audit/read/storage/driver logs. No acceptance credit and no regrading of any prior failure.

The dominant observed slow direction is **Device2→Device1**. Device2’s prefix comparisons are expensive, but the long peer delay is not simply time waiting for Device2 to publish. Device1 falls behind already-published positions while alternating its own sends with receiver checks. The immediate-inflight policy produces more positions than this receiver schedule drains during typing. This is an observed queue imbalance in the fictional lab workload, not a claim about current production.

## Signing completed before investigation

All 93 prepared patches 241–333 are signed in order, with exact planned trees and parent links verified. Head `2c92793c23fab59781c5fa327ec7500c79356681`; working tree/index clean before this evidence phase. A signed child contains its signed parent’s hash, so signatures were issued serially by one automatic runner rather than pre-issued in parallel. Existing Secretive/key policy unchanged. No push/merge/publication/deployment. Phases 307–333 were independently checked to contain docs/evidence only; no private lab implementation is in those commits. [Commit mapping](./signed-241-333.json).

## Prefix comparison: expensive, but count units matter

Counters are complete before/after snapshots. The high-volume rangeLab log stores only 250,000 events, then stops recording events while counters continue. Device2 immediate logs stop about 3.0–3.5 s after typing starts; those missing later events cannot be assigned to specific later read/send turns. The separate phase 333 native buffer has zero overflow.

`prefixComparisonCalls` mixes a full-array comparison with a one-record comparison. In `verifiedRecords.verify`, the changed-identity prefix loop calls `await sameRecordsCooperatively([a],[b],checkpoint)` for each matching record. Millions of calls are therefore **not millions of whole-ledger replays**. A call creates single-record arrays and async work; it still checks record kind/generation/sequence, exact bytes, task freshness and the 8 ms cooperative budget. The V0 stack does not skip this comparison. The same loop exists in committed source: [verifiedRecords.ts](../../../../src/crdt/verifiedRecords.ts).

The lab wrapper adds timing/counters/an event per call. Its reported elapsed spans include cooperative waits and async scheduling; event allocation/counter overhead outside the measured span is additional. These totals are not CPU attribution or a clean production estimate. Existing traces cannot quantify the observer’s contribution. No claim is made that a bulk comparison will save exactly this many seconds.

| Policy | RTT ms | Device | Comparison calls, millions (r1/r2/r3) | Instrumented comparison s (r1/r2/r3) |
|---|---:|---:|---|---|
| coordinated-2000 | 0 | 1 | 0.342, 0.342, 0.342 | 0.768, 0.776, 0.793 |
| coordinated-2000 | 0 | 2 | 0.559, 0.559, 0.559 | 4.127, 4.144, 4.142 |
| coordinated-2000 | 50 | 1 | 0.342, 0.342, 0.342 | 0.773, 0.788, 0.788 |
| coordinated-2000 | 50 | 2 | 0.559, 0.559, 0.559 | 4.169, 4.126, 4.175 |
| immediate-inflight | 0 | 1 | 1.173, 1.175, 1.170 | 1.829, 1.816, 1.866 |
| immediate-inflight | 0 | 2 | 3.117, 3.127, 3.114 | 10.475, 10.489, 10.408 |
| immediate-inflight | 50 | 1 | 1.126, 1.105, 1.097 | 1.651, 1.646, 1.629 |
| immediate-inflight | 50 | 2 | 2.695, 2.707, 2.703 | 8.490, 8.571, 8.678 |

Device2 immediate comparison spans are 8.490–10.489 s in phase 333, versus 7.834–9.846 s in phase 329. Coordinated is 4.126–4.175 s versus 3.665–3.730 s. Deferring Device1’s warm audit did not eliminate Device2’s prefix work. The separately named `appendPrefixComparison` whole-prefix classifier is only 30.7–47.3 ms in phase 333 immediate: confusing those similarly named counters would select the wrong cost. Complete 60-owner counter rows, event truncation and all 30 original runs remain in [prefix334.csv](./prefix334.csv). Ratio of call count to warm views is only an algebraic proxy, not a count of full passes or mean row length.

## The read/send coupling

`accountSyncDriver` has one active `work` promise for both lanes. Due lanes alternate. A receive sweep yields to due sending after a completed empty check. Productive receiving returns after its native turn. `receiveSelection.completed` keeps a publisher only until its G8 position allowance is exhausted, then rotates to the next publisher. These are scheduling/fairness decisions; a network await releases the local storage tail but **does not release the scheduler’s lane**. E+B may already hold raw prefetched pages; that does not remove the native checks, per-publisher selection or G8commit allowance.

During immediate typing both schedulers are occupied about 99.9% of the 45 s window. Device1 spends roughly 33–36 s sending, with the remaining 9–12 s in receive lanes. At 0 ms it starts 51 sends but makes only 12 productive checks of Device2, admitting 64 positions during typing. Device2 starts 95–96 sends. At 50 ms Device1 admits 56 positions while Device2 starts 76–77 sends. The complete 200 submit-call totals reconcile with final accepted-tip advances in every owner/run; requests never overlap for an owner. These facts support the observed production/drain imbalance, without treating HTTP200alone as proof of acceptance.

The next table reports each original phase 333 run/owner, **typing window only**. Device1 receives Device2, Device2 receives Device1. All native logs are complete; operation intervals are clipped and disjoint. Submission intervals and read intervals are observations, not per-key→envelope mapping.

| Run | Device | Send starts / read turns | Send s / receive s | Peer commits / positions | Peer revisit p50 / max ms | Submit interval p50 ms | Submit HTTP p95 ms | Max accepted backlog lower bound |
|---|---:|---|---|---|---|---:|---:|---:|
| paired333-r1-d0-coordinated-2000-attempt2 | 1 | 21 / 147 | 12.278 / 11.696 | 21 / 21 | 167.200 / 2182.700 | 2097.340 | 21.850 | 1 |
| paired333-r1-d0-coordinated-2000-attempt2 | 2 | 21 / 160 | 6.850 / 12.011 | 21 / 21 | 313.900 / 2173.300 | 2096.056 | 21.423 | 1 |
| paired333-r1-d50-immediate-inflight | 1 | 45 / 45 | 33.367 / 11.449 | 11 / 56 | 5805.400 / 7399.500 | 940.246 | 72.543 | 26 |
| paired333-r1-d50-immediate-inflight | 2 | 76 / 76 | 30.545 / 14.295 | 33 / 44 | 629.800 / 3743.100 | 578.935 | 82.333 | 4 |
| paired333-r1-d0-immediate-inflight | 1 | 51 / 50 | 35.737 / 9.083 | 12 / 64 | 4562.000 / 6009.200 | 858.818 | 22.171 | 36 |
| paired333-r1-d0-immediate-inflight | 2 | 95 / 94 | 33.384 / 11.433 | 40 / 49 | 534.500 / 2819.200 | 455.818 | 27.436 | 4 |
| paired333-r1-d50-coordinated-2000 | 1 | 21 / 144 | 13.523 / 19.738 | 21 / 21 | 197.800 / 2287.300 | 2098.850 | 74.423 | 1 |
| paired333-r1-d50-coordinated-2000 | 2 | 21 / 156 | 8.063 / 20.599 | 21 / 21 | 666.400 / 2121.400 | 2100.673 | 77.832 | 1 |
| paired333-r2-d0-immediate-inflight | 1 | 51 / 50 | 35.875 / 8.949 | 12 / 64 | 4629.900 / 6008.100 | 886.766 | 27.341 | 37 |
| paired333-r2-d0-immediate-inflight | 2 | 96 / 96 | 33.627 / 11.196 | 37 / 49 | 525.500 / 2899.800 | 460.099 | 26.477 | 4 |
| paired333-r2-d50-immediate-inflight | 1 | 45 / 44 | 33.270 / 11.565 | 11 / 56 | 5809.500 / 7310.000 | 940.563 | 80.769 | 26 |
| paired333-r2-d50-immediate-inflight | 2 | 77 / 76 | 30.348 / 14.500 | 31 / 42 | 638.200 / 3728.700 | 570.714 | 81.026 | 4 |
| paired333-r2-d0-coordinated-2000 | 1 | 21 / 145 | 12.471 / 11.483 | 21 / 21 | 164.700 / 6032.800 | 2103.416 | 22.251 | 1 |
| paired333-r2-d0-coordinated-2000 | 2 | 21 / 153 | 6.981 / 11.801 | 21 / 21 | 1040.900 / 2594.400 | 2101.972 | 23.927 | 1 |
| paired333-r2-d50-coordinated-2000 | 1 | 21 / 144 | 13.280 / 19.504 | 21 / 21 | 194.100 / 2205.100 | 2103.521 | 70.885 | 1 |
| paired333-r2-d50-coordinated-2000 | 2 | 21 / 158 | 8.045 / 20.526 | 21 / 21 | 670.900 / 2120.400 | 2097.043 | 76.869 | 1 |
| paired333-r3-d50-coordinated-2000 | 1 | 21 / 144 | 13.175 / 19.507 | 21 / 21 | 198.200 / 2210.000 | 2103.472 | 72.011 | 1 |
| paired333-r3-d50-coordinated-2000 | 2 | 21 / 156 | 7.923 / 20.591 | 21 / 21 | 659.600 / 2111.400 | 2095.389 | 74.758 | 1 |
| paired333-r3-d50-immediate-inflight | 1 | 45 / 44 | 33.570 / 11.258 | 11 / 56 | 5819.200 / 7161.500 | 957.515 | 80.529 | 26 |
| paired333-r3-d50-immediate-inflight | 2 | 77 / 76 | 30.326 / 14.507 | 31 / 44 | 623.100 / 4566.600 | 574.953 | 74.951 | 4 |
| paired333-r3-d0-immediate-inflight | 1 | 51 / 51 | 35.821 / 9.008 | 12 / 64 | 4907.700 / 7230.700 | 859.950 | 26.061 | 36 |
| paired333-r3-d0-immediate-inflight | 2 | 95 / 95 | 33.514 / 11.317 | 39 / 48 | 550.600 / 2924.500 | 452.530 | 36.434 | 4 |
| paired333-r3-d0-coordinated-2000 | 1 | 21 / 145 | 12.348 / 11.489 | 21 / 21 | 147.800 / 2213.000 | 2099.023 | 21.140 | 1 |
| paired333-r3-d0-coordinated-2000 | 2 | 21 / 154 | 6.923 / 11.829 | 21 / 21 | 1059.400 / 2590.800 | 2098.640 | 21.936 | 1 |

### One concrete six-second gap

In `paired333-r1-d0-immediate-inflight`, Device1 reads Device2 after position 50 and commits 8 positions. Its next primary read begins after 58, **6009.200ms later**. Between them: four other-publisher checks and one self check, all empty, plus six own sends. The send intervals occupy **4873.700ms** (81.1%) of the gap. The next read is at least36positions behind acknowledged submissions; the oldest already-acknowledged pending position has waited at least**18.072s** before that read begins. [Every revisit gap](./peer-revisit-gaps334.csv).

Across 0 ms immediate runs, Device1’s primary-peer revisit median is 4.562–4.908 s; at 50 ms, 5.805–5.819 s. Max gaps are 6.008–7.400 s, and conservative already-acknowledged waits reach 15.6–18.5 s. This matches the direction and order of the persistent 14–15 s middle markers and 17–20 s peer p95 from phase 333. It does not establish the exact decomposition for each key.

Accepted-time bounds use **ordinal inference**, not a timestamp column in a server receipt: complete single-flight 200 submit calls are checked against exact final accepted advances, ordered using the monotonic sender, and their response-header times conservatively bound acceptance from above. Receiver cursor advances independently equal native commit credit and final peer-tip advances. No other writer for those fictional publisher credentials participates. If those conditions had failed, no accepted-time bound would have been reported. Per-key→signed-envelope assignment is absent from the existing traces.

### Contrast with coordinated sending

Coordinated creates about 21 positions during typing per device, with one position per productive receive turn and at most one acknowledged position behind at a read. It leaves scheduler idle time and allows more complete receiver sweeps between sends. It therefore avoids the growing native position backlog, but its 2 s publication policy still misses original peer/marker gates. This is evidence about work/coalescing and scheduling, **not approval to select a default**. Every original phase 333 cell remains failed.

## What prefix cost can and cannot explain

Device2’s extra prefix work makes its own operations more expensive and is a clear cost candidate. However, it still publishes more rapidly than Device1 can consume. Optimizing Device2 alone does not establish that the slow direction will improve; more small envelopes could increase receiver pressure. The measured send HTTP request-to-header p95 is about 22–36 ms in 0 ms immediate, 73–82 ms with 50 ms injected. Neither Internet bandwidth nor a 20 s idle repair timer explains this continuous, busy receiver queue. R1000and quiet750 are unchanged.

Much of Device1’s send lane is native storage work. In the representative 0 ms immediate run, 51 sends occupy 35.742 s: 9.013 s is tagged envelope preparation and 20.809 s is in 153 untagged storage jobs. Device2’s 95 sends occupy 33.380 s, including 10.077 s tagged envelope preparation and 16.815 s in 283 untagged jobs. The source has untagged delivery `withState` / `withSelection` boundaries for preparing a submission, selecting pending bytes and recording the returned receipt. The existing tag does **not** uniquely identify each such operation or its inner clone/crypto/prefix costs; no invented attribution closes that gap. Queue-wait sums count waiting jobs, not extra wall time, and are not added to operation totals.

## Check roles preserved; next lab questions only

The exact retained-row comparison proves that input rows really match the previously authenticated rows before borrowing their buffers into a new candidate. An owner lease, scalar counter, or later audit is not a substitute for this boundary. Fresh authority, witness/counter authentication, per-entry crypto/expiry, authorization, chain order and commit guards are separate; this analysis skips none of them. The semantic warm oracle remains, including its hard-cap exposure. No V/F, persisted trust, cross-owner handoff or format change is proposed here.

Two separate possible next diagnostics, **not built or authorized as hardening in334**:

1. Separate the comparison algorithm from observation overhead: aggregate row/byte counts and one event per prefix walk, retaining all exact comparisons. Then compare the current per-record async helper with a single cooperative prefix walk, keeping byte/header/task/revision/erasure checks and checkpoints. This needs a current-date fictional fixture and declared paired controls; old spans cannot give the gain.
2. Trace/tag the three delivery storage boundaries and test whether bounded quiet reconciliation can avoid a send between every empty publisher check, or otherwise improve receiver service under simultaneous writing. Keep G8, quiet750, session/account budgets, fairness/liveness, no-progress semantics, chain-order commit and every original gate. Do not just make Device2 emit more envelopes or increase a limit.

Both need independent live-writing/fairness/marker/cold checks before any later operator decision. This phase does not pick a repair or start it.

## Evidence and limitations

[Protocol](./PROTOCOL334.md), [all source/input identities](./inputs334.json), [independent checks](./independent334.json), [counter tables](./prefix334.json), [full native window tables](./native334.json), [read turns](./read-turns334.csv), [storage jobs](./storage-jobs334.csv), [driver intervals](./driver-turns334.csv), [qualified submission mapping](./submit-maps334.json). Original raw traces retain their single indexed homes in329/333;334checks both raw hashes and those existing compressed copies instead of duplicating them. All original failures and host logs remain.

A derived CSV initially reused `name` for run and job, overwriting the run field. Attempt 1 analysis/output files are retained; attempt 2 adds explicit `runName`. This was an analysis schema defect, with no new app run or source change. Independent cursor/credit, final-prefix and submission checks consume raw native logs independently of the table generator. Aggregate prefix counters cannot be attributed to late individual jobs after the 250k-event truncation, and instrumented elapsed spans do not establish clean CPU cost. No new acceptance result or causal estimate across separate host runs is claimed.
