# Phase114 — Publication delay and capacity backoff both contribute

**The aim remains complete peer p95 below2.5s while retaining the catch-up gains. Quiet reuse stays
disabled; this diagnosis does not clear the gate or activate a repair.** All31 earlier patches are
signed/pushed at1ee9c351.113/114 are new unsigned evidence patches; no release preparation/deployment.

Reuse every key in the four original111 journeys:480 observations, no new benchmark run. Native
accepted-position counts312 and sequential successful submission requests agree. All480 keys have
admissible bounded mappings;448 identify a single publisher position,32 retain grouped alternatives.
All33 keys over2.5s map uniquely. Following fresh read cursors account for every native position in
both directions. Independent reconstruction verifies every key total/stage sum and original p95;
missing-key and false-gate controls fail.13 synthetic instrument controls pass. Original native/data/
cold/profile/resource guards remain [at their existing home](../../2026-10-27-quiet-budget/phase111/README.md).

## Where the two candidate p95 samples spent time

| Original sample | Complete peer p95 upper bound | Dispatch→submission start | Server availability→read opportunity | Read headers→peer DOM |
|---|---:|---:|---:|---:|
| C normal, key91 / accepted position65 |2532.0ms (**fail**)|2268–2272ms|182–199ms|47.3–51.0ms|
| C withheld, key81 / accepted position63 |2739.1ms (**fail**)|1063–1067ms|1598–1613ms|41.1–45.1ms|

These are the actual keys at each complete-series p95, not a sum of independent marginal p95s.
Availability is bounded between successful submission start and headers using independent native
accepted-prefix evidence, not HTTP status alone. Pre-HTTP includes local admission, waiting/batching,
preparation and persistence; uninstrumented internals remain unresolved. Post-header includes remaining
body transfer, verification, native commit/readback, final owned application and DOM notification.
Neither stage is a measurement of server CPU or just network delay.

Across all120 candidate keys, submission HTTP p95 is bounded22–32ms normal/22–28ms withheld; read
HTTP38–42ms/32–36ms; final read-header→DOM56.3–60.0ms/66.0–70.0ms. These marginal intervals must not be
added to predict an end-to-end quantile. The seconds are largely before HTTP publication and before
the right read opportunity. Exact stage alternatives and each failed key remain in the reports.

## Capacity creates a whole-receive-lane pause

| Journey | H1 batch429s | H2 batch429s | H1 no-read interval after429 | Keys >2.5s overlapping H1 capacity pause |
|---|---:|---:|---:|---:|
| R normal |24|17|1001–1009ms|1/3|
| C normal |21|10|1002–1009ms|6/7|
| C withheld |23|12|1001–1010ms|12/13|
| R withheld |18|11|1001–1007ms|10/10|

All136 recorded native errors independently identify429 `authorization-refused/capacity`; browser
counts agree. No submit, membership or grant failures in these journeys. A catch-up batch refusal
returns an unknown receive outcome, and the existing composed scheduler imposes the1s receive failure
clock. It pauses subsequent reads of **every publisher** in that receiver, including an already
available interactive peer. Sending has its own failure state; do not call this a halt of both lanes.
The overlap table is observed temporal overlap, not a counterfactual guarantee that removing the
refusal saves exactly that interval. Ready remained1; content hints do not bypass failed receive clocks.

A concrete withheld tail (key33): after an empty-progress opportunity, H1 gets a hot-publisher batch
429, waits about1s, resumes the bulk read, refreshes membership/history and sweeps other publishers, then reads H2. Its
availability→opportunity delay is2014–2048ms. Thus750ms is a fixed eligibility budget at selection,
not a preemptive wall-clock read deadline when a pass or failure clock prevents selection. Shrinking
only that budget cannot repair the whole composition.

The policy admits16 work units/s per service-held session with120 burst; process64/s with480 burst,
active16/per-session4. A4-frame batch reserves4 units, not one HTTP unit. Observed scoped concurrency
upper bound3 (per client2) is below those active ceilings; each client has one successful grant begin/
finish. Source keeps renewed grants on the parent session key. The native capacity response does not
identify whether admission or batch top-up refused: do not invent that unavailable counter. A
pinned budget boundary check shows30 four-page calls exhaust a session, another session still has its
own burst, and at63ms refill one peer read fits while a4-page top-up fails. Failed top-up still costs
one admission unit; later refill admits4. This tests existing policy arithmetic, not historical branch
attribution or measured physical server capacity. No limit, concurrency or backoff was changed.

## Publication can lose an already-expired quiet opportunity

Current `batchWindow.note()` replaces the due time on later local input until the fixed2s cap.
The composed scheduler serializes receive/send passes and rechecks the quiet deadline after an async
send prelude. An opportunity that was due while another pass ran can be postponed by the next input.
The same helper also controls local journal flush; scope a repair to publication first.

Three frozen fake-clock histories use the verbatim production window/scheduler slice from signed
1ee9c351.8 local wakes at500ms spacing, otherwise controlled successful operations:

| Deliberately controlled history | First publication |
|---|---:|
| Receive100ms, prelude0ms |300ms|
| Receive250ms, prelude0ms |2000ms|
| Receive100ms, prelude250ms |2100ms|

All8 inputs publish, at most one lane is active, cancellation drains. Round quanta were fixed before
execution and are not fitted estimates of real internal costs. This demonstrates a possible mechanism;
it does not prove which real prelude took250ms or predict a repaired p95. Native authority/crypto and
application paths are outside this success-only model and retain all original checks. Pinning reads
to complete signed Git source afterward leaves source hashes and every deterministic outcome exact;
initial and pinned artifacts remain. No timing-driven rerun or benchmark adoption credit.

## Next bounded repair and safeguards

[Contract](next-repair.md): once a publication window becomes due, later input must not reopen it.
Prefer the publication scheduler's existing close/clear lifecycle so local flush batching and mobile
admission stay unchanged. Preserve persisted-wire retries, source custody, durable barriers, ownership,
all fresh authority/history/witness/authorization/commit checks and every existing failure clock. Add
expired-window, async-prelude, fresh-window, persisted-retry, backoff, lock/flush and local-flush
independence regressions before change. This is a proposed repair, not implemented here.

Then rebuild both clients and rerun original eight plus four complete two-receiver normal/withheld
journeys. Keep2.5s, all120 keys, every data/fairness/local-typing/replay gate and measured catch-up gains.
If publication latching is insufficient, the separate capacity target is proactive pacing/reserved
interactive opportunity before429, not ignoring refusals or allowing new hints to erase backoff.
Changed interference means no fixed-timestamp subtraction predicts success.

Same fixture limitation: actual5kH Goals, virtual browser credentials, Chrome on this Mac, native1CPU/
1GiB; no Android or population inference. Generalized qualification912/367 stays paused. No product
runtime/old-test change, default activation, preview/API restart, release prep or deployment.

Source-site refinement:113 labels the single-page promotion at1631 as grouped. The grouped handoff
is at1814, also after durable commit/readback. [Exact locator correction](source-site-refinement.json)
preserves the original record; no timing, proof, cursor mapping or gate changes.

All13 fresh ordinary source/static checks pass against the current signed runtime and the byte-matched
held experimental build. Its frozen build label remains the earlier experimental67288576; this is not
a new signed release image. Known-fixture-value scanning passes; private fixtures/profiles/native DBs
stay outsideGit. These checks supply no blanket release qualification credit.
