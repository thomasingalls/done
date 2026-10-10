# Account consumer and selection costs

2026-10-10. Development performance work on top of signed
`4500d9b61b7c67b0d2abcabfc7f377ab449e23d6`. Release validation remains paused.

The combined candidate improves typing and cold opening. **Default activation is held** while an
intermittent packaged peer/history delivery failure is investigated. The final source retains
`VITE_ACCOUNT_LEDGER=incremental` as an opt-in; an ordinary build still selects the reference path.
Nothing here deploys an image or changes the running public service.

## What changed

- Replace per-byte hex conversion and callback byte comparison with a lookup table and indexed
  loops. Differential tests include offset views, mutations and detached buffers.
- Give each isolated content-validation Y.Doc a fixed, unused GUID. It still gets a fresh random
  client ID, fully decodes/applies its input, checks pending dependencies and is destroyed. This
  avoids the 31 random draws used for a default GUID, without reusing document state.
- Select and detach only the requested verified result; reuse the verified source catalogue for
  exact duplicate/conflict checks instead of reconstructing it on every journal flush. Keep the
  complete physical census, exact byte comparison and fallback verifier.
- Reuse owner-bound immutable undo-selection metadata for Account preparation. This was the largest
  named avoidable cost in the deep profile. Account still uses its reference document fork,
  original source capture and full post-admission verification. Local's document handoff and spare
  catch-up optimization are not enabled for Account.
- Add opt-in numeric profiling of loads, copies, parsing, authority checks and allocations, alongside
  probe-only transaction/WebCrypto counters. No record bytes or credentials go into these counters.

The baseline profile put selection-history copying at about **62 ms/key inclusive**, source catalogue
reconstruction at **44 ms/key**, and envelope selection at **7.5 ms/key CPU / 8.9 ms/key elapsed**.
The repair followed that ordering. An earliest-unallocated-source index was not the winning target.
Nested CPU and elapsed measurements must not be added together.

## Matched comparisons

Both arms enable the incremental ledger. This measures the *additional* improvement from this slice,
not all accumulated improvement over the reference path currently used in production. Each run typed
2,320 edits in a disposable account. Order: baseline 1, candidate 1, candidate 2, baseline 2.
Each measured block has 100 keys, with reopen boundaries after the blocks. The predictions and
decision rule were recorded in [protocol.md](./protocol.md) before implementation.

Stable-text p95, milliseconds:

| Prior edits | Baseline 1 | Candidate 1 | Candidate 2 | Baseline 2 |
|---:|---:|---:|---:|---:|
| 0 | 11.0 | 3.7 | 2.5 | 9.1 |
| 520 | 136.8 | 19.6 | 15.9 | 111.9 |
| 1,220 | 321.9 | 46.7 | 59.9 | 338.2 |
| 2,220 | 574.0 | 87.3 | 171.5 | 601.4 |

At depth, the paired reduction is **84.8% and 71.5%**. Stable arrival measures the final arrival of
the character after any controlled-editor removal/restoration; first DOM arrival alone was too
optimistic. This is a DOM stability measure, not a claim that pixels were presented at that instant.

Main-thread p50 milliseconds per key:

| Prior edits | Prediction | Baseline 1 | Candidate 1 | Candidate 2 | Baseline 2 |
|---:|---:|---:|---:|---:|---:|
| 0 | 75 | 99.3 | 72.1 | 72.3 | 100.3 |
| 520 | 90 | 122.9 | 34.9 | 38.9 | 125.6 |
| 1,220 | 115 | 169.5 | 69.4 | 94.9 | 164.6 |
| 2,220 | 140 | 184.1 | 123.9 | 129.2 | 186.3 |

The fitted slopes fell from 0.0395/0.0393 to 0.0291/0.0328 ms per prior edit. Growth remains.
The nonmonotonic shallow points reflect different background publication/batching activity; they
are not evidence of a constant cost per edit. These are two matched runs, not independent samples
per key or a population confidence interval. The small corpus and desktop browser do not establish
phone or large-workspace performance.

## Fixed costs and uninterrupted history

The separate CPU-profiled session kept one renderer and its undo history through all 2,320 edits.
At the first/deep blocks, active CPU fell from **101.9/248.0 to 61.3/140.2 ms/key**. Deep stable-text
p95 fell from **684.6 to 107.7 ms**, and the observed key-gap p50 from **241.3 to 167.2 ms**.
The intervening 2,120-key block took 293 seconds versus 197 seconds. These profiling runs are
diagnostic observations, separate from the matched latency comparisons.

Recorded deep input-event processing p95 was 75.0 → 10.9 ms. Event Timing only reported 54/7
qualifying input events out of 100 keys respectively (its duration threshold is 16 ms), so this is
the p95 of a censored subset, not an all-input handler p95. The retained undo stack is nevertheless
present in both captures, and the CPU profile identifies its metadata-copy cost directly.

Counts from their 100-key blocks (all activity in the interval, including background work):

| Measure | Baseline fresh | Candidate fresh | Baseline deep | Candidate deep |
|---|---:|---:|---:|---:|
| Positions/key | 0.38 | 0.37 | 0.05 | 0.11 |
| Carrier loads/key | 8.53 | 8.32 | 1.25 | 2.77 |
| Carrier loads/position | 22.4 | 22.5 | 25.0 | 25.2 |
| Authority checks/position | 19.8 | 19.9 | 17.4 | 19.5 |
| IDB read transactions/position | 209.1 | 210.1 | 199.2 | 215.8 |
| IDB write transactions/position | 13.2 | 13.1 | 21.8 | 19.2 |
| WebCrypto calls/key, excluding randomness | 220.1 | 215.6 | 37.4 | 83.4 |
| WebCrypto calls/position, excluding randomness | 579.1 | 582.6 | 747.6 | 758.5 |

These ratios explain why reducing history growth alone cannot remove the initial cost: each accepted
position still accompanies many loads, transactions and authority checks. They are interval ratios,
not a causal assertion that every position requires exactly this work. Individual cryptographic
operations, random calls, bytes and per-key/per-position counts are in
[operation-counts.json](./operation-counts.json) and [uninterrupted.json](./uninterrupted.json).

The faster candidate publishes more positions at depth. Source parses fall from 81,304 to 28,403,
but total measured record-copy bytes **rise from 439 MB to 941 MB** as it completes more publication
work. Do not claim that all memory traffic fell. Post-GC retained heap is a different measurement.
No new burst-batching policy was introduced.

## Cold opening, heap and maintenance

| Measure | Baseline 1 | Candidate 1 | Candidate 2 | Baseline 2 |
|---|---:|---:|---:|---:|
| Cold open after 2,320 edits | 11.20 s | 7.52 s | 7.21 s | 11.63 s |
| Reopened post-GC heap | 15.24 MiB | 15.25 MiB | 15.34 MiB | 15.24 MiB |
| Largest observed compaction | 1.45 s | 0.91 s | 0.96 s | 1.59 s |
| Normal reference audits / mismatches | 2 / 0 | 2 / 0 | 2 / 0 | 2 / 0 |

Cold opening improved **33–38%**, but remains well above 2.5 seconds. Full verification is preserved.
A separate profile reopened the exact same saved baseline history with each implementation:
11.95 → 7.21 seconds. Hex inclusive CPU fell from about 2.54 to 0.87 seconds and isolated update
validation from 2.96 to 1.02 seconds. Both still parsed 75,531 source capsules for 2,360 captured
sources—about 32 passes per source. That repeated startup reconstruction remains a clear target.
There is no measured 10,000-edit cold-open result; extrapolation would be a hypothesis.

Compaction/audits still occupy the admission owner for substantial intervals. Accepted-prefix byte
retention is unresolved. The next growth lever is reducing physical rows per typing burst, with its
own durability, attribution, retry and undo-boundary analysis. Before another optimization or rollout,
resolve the packaged delivery failure described below.

## Verification and activation

The focused unit, native abort/retry/compaction, reference-override and current-key authority tests
pass. The packaged history checks have both passes and failures; see
[verification.md](./verification.md) and [decisions.md](./decisions.md). A clean diagnostic pass does
not erase the repeated post-maintenance delivery timeout in ordinary runs. No timeouts or service
rate limits were loosened to obtain a pass.

The performance, cold-open/heap and normal-audit criteria passed. The unresolved browser result
holds default activation. Keep the existing switch until the failing peer/history journey is
understood and its focused regression passes with the ordinary candidate build. This is not an
F-17 closure or a restart of release qualification.

## Evidence and reproduction

- [comparisons.json](./comparisons.json): four-point results and physical row counts.
- [source.json](./source.json) + [candidate.patch](./candidate.patch): exact timed candidate against
  the signed baseline. Baseline adds only [instrumentation.patch](./instrumentation.patch).
- [cold-source.json](./cold-source.json) + [cold-candidate.patch](./cold-candidate.patch): the earlier
  candidate used for the same-fixture cold profile. It precedes later explicit reference gating.
- [final-source.json](./final-source.json) + [final-runtime.patch](./final-runtime.patch): final source,
  distinguished from measured source by reference-path gating, a malformed-input profiling guard
  correction, skipping a profiling-only byte-count scan when profiling is disabled, and the held
  default. Valid incremental measurements with profiling enabled are unaffected.
- Raw observations, summaries, logs and compressed CPU profiles are in the arm directories.
  [profiles-and-traces.json](./profiles-and-traces.json) gives profile hashes and local paths/hashes
  for the larger trace files; those local traces are not included in this packet.
- The initial diagnostic cold-open failures are retained. An isolated CDP control proved that
  detaching the profiler session disabled the virtual authenticator; retaining that session fixes
  the probe. [probe/cdp-lifecycle.mjs](./probe/cdp-lifecycle.mjs) reproduces it without an account.
  Completed typing captures remain useful; those failed final cold attempts are excluded from the
  successful cold-open figures.

Use two scratch checkouts of `4500d9b6`, apply the instrumentation patch to one and candidate patch
to the other. Install the pinned dependencies, retain the repo's Yjs patch, and build each with:

```sh
VITE_ACCOUNT_LEDGER=incremental VITE_ACCOUNT_LEDGER_PROFILE=1 \
  node node_modules/vite/bin/vite.js build --sourcemap
```

Run one browser campaign at a time, from a directory where the probe can resolve Playwright:

```sh
DONE_PERF_ROOT=/tmp/done-account-consumers \
DONE_PERF_SOURCE=/absolute/path/to/scratch-checkout \
DONE_PERF_RESULTS=/tmp/done-account-consumers/results-new-baseline \
  node docs/performance-experiments/2026-10-10-account-consumers/probe/campaign.mjs slope
```

Use `diagnostic` instead of `slope` for the uninterrupted profiled session; `diagnostic smoke` gives
a short profile/reopen check. `DONE_REOPEN_FIXTURE=/absolute/private/fixture.json` with `reopen`
uses a saved private probe fixture for a same-history cold comparison. The probe creates disposable
service state and credentials under its scratch root. Those fixtures contain private virtual test
credentials and device codes and are deliberately excluded from this packet. Do not substitute
someone's real profile. The report scripts recompute summaries from the numeric raw observations.

Focused commands (no full campaign):

```sh
node node_modules/typescript/bin/tsc -b --noEmit
node node_modules/vitest/vitest.mjs run test/accountConsumerPrimitives.test.ts \
  test/verifiedRecords.test.ts test/incrementalLedger.test.ts test/contentCompaction.test.ts \
  test/accountDelivery.test.ts test/sourceCapture.test.ts test/selectionSnapshots.test.ts \
  test/selectionHistory.test.ts test/custodyCrypto.test.ts
ACCOUNT_LEDGER_MODE=incremental ACCOUNT_LEDGER_AUDIT=every node --test \
  --test-name-pattern='one owner advances|native (submission|response) abort|generated incremental|lost submit answer' \
  test/account-sync/native.test.mjs
ACCOUNT_LEDGER_MODE=reference node --test --test-name-pattern='one owner advances' \
  test/account-sync/native.test.mjs
node --test test/account-membership/retry.test.mjs
node node_modules/@playwright/test/cli.js test --config playwright.packaged-account.config.ts \
  test/packaged-account/history.spec.ts --grep 'two native device owners|returning editor'
```
