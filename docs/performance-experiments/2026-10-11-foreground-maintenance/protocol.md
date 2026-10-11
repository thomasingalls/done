# Foreground maintenance: prospective bounded probe

Release qualification remains paused. No production data or browser storage is used.

## Decision and prediction

Compare deployed runtime source `203a0655` with interruptible automatic compaction and a
bulk-read deletion census. Hypothesis: an input arriving during compaction can resume after
the current owned operation settles, rather than after the entire compaction. The deletion
transaction should need a constant number of collection requests instead of one cursor
callback per retained row. Neither change relaxes exact byte/placement/counter checks.

Before measurement: expect at least a 50% reduction in collision admission time at 1,200
retained non-content rows. Quiet compaction should not consistently regress more than 20%.
An individual synchronous Yjs operation and an already committing transaction remain
non-preemptible; this phase does not promise a hard per-keystroke latency ceiling.

## Design, units and measurements

Controlled native Chromium mechanism benchmark, baseline/candidate then candidate/baseline,
serially on this Mac. Each fresh disposable context contains roughly 60 KB of synthetic text,
128 content updates and 600 heads plus 600 outbound rows. The opaque retained rows exercise
the physical census but **do not model Account ledger validation**. One restored workload/run
is the analysis unit; individual records and input events are not independent replicates.

Each run measures quiet automatic compaction and a separate fresh-context collision, with an
input scheduled 25 ms after maintenance starts. Primary outcome: submit-to-admitted-state
milliseconds; also record timer dispatch delay, maintenance duration, transaction request counts,
long tasks, and whether later idle maintenance finishes. A profiled baseline is diagnostic only,
excluded from the paired elapsed-time comparison. No physical display-latency claim follows.

Guardrails: original plus new text survives a cold reopen; non-content rows are untouched;
close drains the active flight; cancellation never rewinds counters, removes uncovered rows,
or hides integrity failures. Directed unit/native tests cover cancellation around publication
and deletion, concurrent records, failed transactions, and input order. No campaign expansion.

## Analysis and decision rule

Report both paired observations, their differences and request counts; do not infer population
p95 or statistical significance from two pairs. Keep failures/timeouts as outcomes. Thermal
drift, GC and timer scheduling remain sources of variance; reversed order helps but cannot
eliminate them. Retain the change only if the primary gain appears in both pairs and correctness
guardrails pass. Mixed results require investigation, not a changed threshold. Phone, full
Account-ledger costs, WAN sync, and long-term starvation are outside this mechanism comparison.

## Runbook

`node docs/performance-experiments/2026-10-11-foreground-maintenance/probe/run.mjs
<source-root> <new-output-directory>` starts one Vite fixture on localhost:53781 and uses native
IndexedDB, Web Locks and WebCrypto. Set `MAINTENANCE_PROFILE=1` for a separate CPU profile.
Never run two copies together. Generated code/credentials stay in disposable browser storage;
retained results contain only numeric observations and a content-equality boolean.

## Added application check

After the first mechanism baseline, add an application measurement using the already retained
synthetic receiver fixture from `2026-10-11-client-receive/candidate-1`: 120 cards, 12 KB Goals,
600 received positions, 125 content records. Three ordinary offline keystrokes spaced 500 ms
apart cross the 128-record threshold through actual journal flushes. A diagnostic wrapper around
the existing 750 ms timer notifies the Playwright host; it dispatches one more ordinary key 25 ms
later. Both builds use this wrapper. Record the actual key event timestamp, DOM visibility,
transaction durations, long tasks and cold-reopen content equality. The wrapper is probe-only.

Use the same baseline/candidate, candidate/baseline order and 50% collision-improvement target.
The first application pair records timestamps/recovery; before the second pair, add final physical
row counts to distinguish a maintenance timer from completed compaction. The added read occurs
after timing ends. A separate quiet baseline CPU profile identifies where actual Account
maintenance spends CPU; profiled elapsed times are excluded from the matched timing comparison.

Run `node node_modules/@playwright/test/cli.js test --config
docs/performance-experiments/2026-10-11-foreground-maintenance/probe/account.config.ts` with
`DONE_PERF_SOURCE`, `DONE_PERF_RESULTS`, and `DONE_REOPEN_FIXTURE` set as for the prior receiver probe.
Set `MAINTENANCE_COLLISION=1` for timed collisions; `RECEIVE_PROFILE=1` enables the diagnostic profile.
This is offline to isolate admission/maintenance, not a new sync or release-validation campaign.
