# Account consumer work — bounded development protocol

Recorded before implementation and measurement, 2026-10-10. Baseline: signed `4500d9b6`,
with incremental Account ledger validation enabled. Release validation remains paused.

## Decision

Reduce repeated history work while preserving the existing physical census, authority checks,
durability, exact retry bytes, cold verifier and audit. Measure fixed per-position overhead as well
as history growth. Repair the largest measured avoidable consumer cost, including envelope selection
if that wins; do not let the preliminary file list dictate the optimization.

First profile fresh/deep typing and a deep cold open. Count loads, rows/bytes, transactions,
authority checks, WebCrypto calls and successful allocations; report counts per key and per
position. Distinguish queue waiting, operation elapsed time, synchronous clone/parse cost and CPU
samples. Nested durations are not additive. Browser instrumentation records counts only, not values,
keys, credentials, request bodies or document text beyond the disposable typing fixture.

## Candidates and predictions

1. Independently check a lookup-table hex encoder and indexed byte comparison against their old
   implementations. Inspect Yjs validation allocation; preserve full parsing and pending dependency
   semantics. No reusable dirty document, global randomness override or writer-ID shortcut.
2. Select before cloning at verified consumers. Reuse verified source lookup for exact duplicate
   checks; avoid reconstructing a catalogue merely to answer incoming IDs.
3. Repair the largest remaining measured history consumer, potentially envelope source selection.

Hypotheses, not promised results: leaf loops reduce their own CPU cost >=30%; consumer changes
reduce copied bytes and repeated historical source decodes. Combined main-thread p50 at the four
history points is estimated at 75/90/115/140 ms (prior candidate 100/125/165/197). Deep cold opening
should improve from ~11.8 s, but no linear 10,000-edit extrapolation is an observation or acceptance
criterion. Underlying physical rows and admission/maintenance serialization still impose costs.

## Measurement

Use the same disposable packaged app, browser, service, text and cadence in each arm; no concurrent
browser/native checks while timing. Diagnostic CPU profiles are separate from latency comparisons.
Compare 100-key blocks after 0/520/1220/2220 actual per-key edits, retaining the prior reopen sequence
for comparability. Repeat the pair in reverse order. Keep an additional uninterrupted 2,320-edit
session, measuring its beginning/end without clearing undo history, and profile one deep cold open.
Report achieved history, actual typing gaps, physical rows and positions per key, not only requested
cadence. Retain failed/incomplete runs; never replace their history label with the intended count.

Primary: stable-text p95 at depth. Secondary: main-thread p50 and slope, paint, input-handler time,
queue waiting, maintenance, cold open, post-GC heap, copies/decodes and operation counts. A browser
run is the comparison unit; correlated keys are not independent replications. Reversed pairs expose
some run-order noise, not population confidence or phone performance. Small-corpus results do not
establish large-workspace behavior. No p-values or invented sample-size precision.

## Correctness and activation

Focused differential checks cover exact byte operations, detached projections, catalogue duplicates,
selection order/limits, incomplete Yjs updates, retries, invalidation, abort and cold reopen. Reuse the
existing native two-owner/compaction and authority-boundary checks relevant to changed paths, not a
generalized campaign. A mismatch or missing edit disqualifies the candidate.

Enable the combined incremental path by default only after: (a) these focused checks and a packaged
two-device delivery/reopen check pass; (b) both matched comparisons show deep stable-text improvement
without a repeatable shallow or uninterrupted-session regression; (c) cold-open/heap results show no
repeatable material regression against `4500d9b6`; (d) the normal reference audit still executes and
agrees. Retain an explicit `reference` build override. This is a development activation decision,
not an F-17 pass or a release-validation restart. Public rollout still needs a separately built,
reviewed and deployed image; a source default does not update the user's running account.

Keep a small demonstrated improvement rather than demand a one-shot latency cure. If copy removal
is real but user latency stays within run variation, record that and do not broaden retention changes
to manufacture a victory. Rows per key / burst batching is a subsequent architectural lever and is
not silently changed in this comparison.
