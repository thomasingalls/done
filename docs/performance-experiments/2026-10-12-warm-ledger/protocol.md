# Warm ledger loads: prospective bounded investigation

Base: deployed application source `9465fb04`, merged through `24481b82`.
Release validation stays paused. No deployment or local record-format change is included.

## Question and first decision

Do full IndexedDB censuses and retained-record copies cause the remaining CPU-4x typing long
tasks? Begin with one isolated profiled run of the current direct-admission build on the retained
synthetic 120-card, 600+ received-position fixture. No repair is selected from the earlier
unthrottled profile alone. Capture numeric load/copy/validation/admission spans alongside long
tasks and a mapped CPU profile. Overlap establishes attribution within this run, not a universal
causal effect or a physical-phone result. Report other major stacks if the premise is wrong.

## Units, measurement, and analysis

The observation is one fresh restored browser session: 120 keys at requested 150 ms spacing,
one continuous undo stack, CPU-4x, offline to isolate local work. Keys are dependent observations;
do not treat 120 keys as 120 independent trials. Retain handler and visible-frame median/p95/max,
long-task count/duration, loads/rows/bytes/copy bytes and named work costs. CPU profiling changes
timings, so do not pool the profiled run with unprofiled comparisons. Frame delay starts at event
dispatch and can miss waiting before dispatch. Record profiler clock uncertainty when aligning
samples with browser time. Use the prior probe's floor(n*p) quantile convention.

If the attribution supports repair, compare three fresh unprofiled pairs in AB/BA/AB order on the
same restored bytes and identical instrumentation. Predeclared mechanism criterion: unchanged
warm tasks read no historical row payloads; append work reads only new rows when proven safe;
full open and independent audits still verify all retained evidence. Performance criterion:
at least 30% reduction in aggregate long-task duration across matched runs, no >10% increase in
median handler time, and disclose p95/max even if they do not improve. Small samples establish
a local mechanism and effect magnitude, not population confidence or a phone latency budget.

Each run must preserve all text, undo/redo and offline lock/reopen. Focused storage tests must
cover reservation-before-commit, late lower-sequence commits, cross-owner append/compaction,
counter changes, aborted transactions, late completion after close, audit detection and buffer
ownership. Do not infer committed-row coverage from next_seq alone. A failed safety condition
blocks activation regardless of speed. If the warm design cannot establish these properties
without a format change, retain the measurements and describe the missing mechanism.

## Operational controls and limits

Reuse the checkout with separate small frontend bundles; do not copy docs or complete source
trees. Finish disk cleanup before measurements. Run no simultaneous browser/build campaign.
Keep fixtures, credentials and service state outside Git; commit numeric evidence and source
identity. Exclude harness failures explicitly, retaining their logs. Browser CPU throttling and
host scheduling limit transfer to actual devices. The proposed audit detection window requires
an explicit contract; it must not arise accidentally from a cache optimization.

Local retention is design-only alongside this investigation. Target bounded-history per-task
and opening cost, while identifying the authentication, reader-fence and migration decisions
needed before deleting any local ledger evidence.

## Accepted audit-policy clarification

The user's follow-up explicitly requested bounded rolling checks of old rows on ordinary tasks,
plus row/time-triggered completion. Thus the mechanism criterion is **no full historical payload
census on an unchanged warm load**, with the bounded audit slice reported separately. The earlier
"no historical row payloads" wording is too strong for that accepted policy. This does not change
the timing criterion. The final comparison uses the same candidate source in both arms, with
`VITE_ACCOUNT_WARM_LOADS=0` and `=1`, after the initial attribution on the unchanged baseline.
