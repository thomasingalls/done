# Final retention fence attribution — prospective protocol

Base: signed `f89ee3f9`. Private retention only; no activation, format change or release campaign.

Decision: locate the remaining approximately one-second admission fence at 1,201 own positions,
then remove the largest demonstrably redundant work while retaining full fresh authority,
exact inventory, strict atomic reservation/replacement, journal-era fencing, authenticated readback,
independent baseline replay and the existing Y.Doc/undo ownership.

## Design and measurements

Repeat the previous genuine 1,201-position, two-card, 12,559-character Goals fixture (8,439 physical
rows). A closed database snapshot is cloned into isolated contexts. Synthetic credentials and the
independent acceptance oracle never touch real writing. First collect one CPU-profiled current-build
conversion with nested numeric timings and a User Timing trace: pre-mutation authority/inventory,
reservation census/comparison/transaction, sealing, replacement census/comparison/write/transaction,
raw readback, authenticated load, independent replay and cleanup. Timings include awaited I/O;
CPU samples distinguish execution from waiting. Nested times are not additive.

The initial profile decides the repair, before modifying behavior. Predicted candidates are repeated
whole-plan copies/comparisons and two full strict transaction censuses; the smaller reduced-store
readback could instead dominate. No quantitative speedup is assumed before attribution.

After choosing a repair, append its prediction here before running it. Compare three alternating
reference/candidate pairs on the same seeded state. Report each observation, median and range of
final fence and total duration, longest task and timer gap, work and native-crypto counts, exact
recovery, and undo/journal controls. Add one same-session CPU-4x pair as exploratory evidence.
This is a repeated benchmark on one host/fixture, not independent users or a release gate. No
population confidence interval or phone claim is justified. Detectable target: at least 20% lower
median final-fence time with no lost checks or correctness regression. A null/mixed result keeps
profiling evidence and does not justify weakening the boundary. Stop on integrity/recovery failure.

Profile runs are separate from quiet paired timings. No other test campaign runs during observations.
Record host load and retain exact bundles, profiler/trace, raw numeric observations, source hashes and
focused test results. Seed time is not included. Three pairs cannot resolve small effects or machine
interference; VM load and prior-run drift remain limitations. CPU throttling is not a phone.

## Safety controls

Retain atomic abort, reservation burn/retry, process death, exact old-row/metadata mismatch, corrupted
readback, restored journal, old-read retirement and queued-input/undo controls. Add only controls for
new code boundaries. Every snapshot must reopen identically. Do not move any authority or journal
check outside its required lifetime; do not allow input during uncertain mutation or before successor
era authentication. No range deletion, history-format change, weakened verification or personal data.

## Attribution and selected repair (before candidate timing)

The initial profiled run has a 1,021.5 ms fence. Replacement exchange is 644.8 ms:
41.8 ms census, 23.7 ms comparisons, 22.5 ms issuing exact writes, leaving approximately 557 ms
for request processing/settlement and cleanup. Its CPU samples are mostly idle/program, not replay.
Raw readback is 15.8 ms, authenticated load 44.7 ms and independent replay 6.7 ms. Three detached
history copies total 90.2 ms. This makes native transaction settlement the first target.

Candidate 1: explicitly call `IDBTransaction.commit()` only after the final guarded checks and all
exact writes have been queued in each strict exchange. Keep every comparison, per-key deletion,
crypto call, completion/abort handler and authenticated readback. This allows commit without waiting
for request-success event dispatch. Do not release ownership until transaction completion; a close
while commit is in progress must drain it and still prevent publication/admission. Injected synchronous
abort must prevent the commit call; request errors must still abort. Prediction: if dispatch accounts
for most of the unexplained interval, replacement settlement and the fence fall by at least 20%.
If it does not, report that null result and choose a measured follow-up; do not substitute range deletion.

## Second candidate, after the explicit-commit comparison

Three quiet explicit-commit pairs give fence times reference 1012.7/977.7/1009.4 ms and candidate
972.1/983.4/1027.0 ms. Median improvement 2.6%, with overlap: below the 20% criterion. Remove that
behavioral change. Keep its frozen bundles/results/patch as the negative result; it is not combined
with the next repair.

Candidate 2 groups exact deletion requests using `clear()` only for logical stores proved completely
covered. This revises the private adapter's per-key-operation rule, **not** the enumerated coverage
rule. The same strict transaction first compares every physical key, sealed byte and metadata field,
then checks plan/lifetime/journal, then independently proves deletion-set equality (including duplicate,
omitted/foreign keys and store names) with that actual census. Only then may it clear those logical
stores. No metadata clear, sequence-range inference, partial deletion or omitted survivor is permitted.
No outside connection can append between census and mutation in this transaction. A future partial-cut
planner must refuse here rather than accidentally deleting its survivors.

Prediction: reducing 8,439 individual delete requests to at most three proved-complete logical-store
clears removes most of the ~557 ms settlement interval. Expected fence 0.4–0.6 s on the current host
(40–60% reduction), leaving copies/comparisons, authority and readback unchanged. Keep the same six
quiet paired runs and exploratory 4x pair. Add deletion-plan omission/duplicate/foreign-key controls,
native abort after first clear, and a late-row mutation control before any clear. All previous journal,
crash, retry, readback, authority and undo evidence must still pass. No activation.
