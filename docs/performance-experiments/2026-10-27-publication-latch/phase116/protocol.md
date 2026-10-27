#115+ — Publication-only deadline latching

Bounded outcome: once a publication window is due, a later local wake cannot reopen/postpone it
while another pass or the asynchronous send prelude runs. Preserve the publication quiet300/max2000
policy before expiry and the existing close/clear lifecycle. Change the publication scheduler call
site only. Shared batchWindow/local journal flushing, persisted wire/position/capsule ownership,
durable barriers, authority/history/signature/witness/auth/final-commit checks, all limits/concurrency,
retry backoff and notification handling stay. Legacy/no-batch behavior stays. No gate relaxation.

Preserve113–114 immutable unsigned patches;115+ follow114 tree0905d8a8f59e97608d3ce55684c8832cd4934859.
HEAD1ee9c351 is signed/pushed112; real index empty. No commit/push/preview/API/production change here.
Keep existing old tests/assertions and qualification obligations; generalized912/367 remains paused.

First append regressions and demonstrate before-repair failures at exact/past expiry under held
receive and asynchronous prelude. Exercise fresh-window reset, nonexpired quiet collection, existing
receive/send failure floors, lock/drain and separate local flush behavior. Reuse the pinned three
scheduler counterexamples; an omission control must restore the old delays. Run affected unit and
encrypted native tests, types/lint/format and normal bookkeeping checks; preserve failures.

Freeze two complete rebuilt client exports and the existing exact native reference image/server.
R uses114 runtime, no latching/quiet reuse. C combines115 publication latching and experimental750ms
quiet reuse in an explicitly frozen one-line exported-owner change; product quiet default remains
off until full acceptance. No verifier/format/rate/backoff changes in either arm. Same build metadata
APP_BUILD_REVISION67288576/DATE2026-10-27, coordinated-2000/retention-auto1 as prior lab. Source/artifact
identities distinguish the experimental arm from its controlled label; not a signed release image.

First fixed two-receiver sequence: R-normal,C-normal,C-withheld,R-withheld, once each, no retries.
Reuse the exact previously corrected late harness, stopped H6/M2/Q2 seed and pinned storage restore;
H1/H2 both receive while H2 types120 trusted focused visible keys at500ms plus early/mid/late markers
on the separate reverse card (hot cursor thresholds>=33/513/993). Complete peer p95<=2500ms, each
marker<=2500ms, local p95<=16ms,30s final new delivery,600s backlog, exact full original archive plus
only offered append, both same-profile offline cold reopens without reinjection, source/loaded worker/
resource/fault and independent native signature/prefix/seed-byte/isolation guards all remain. Lost
hint mode must genuinely withhold workspace frames; qualify alternative ready reconnects. Missing
keys fail; never select a subset. Whole journeys are units, not120 independent population samples.
The protocol is an engineering comparison/mechanism test, not a population or isolated latch effect.

No validators/builds/profilers alongside timed runs. Existing image1CPU/1GiB/no swap/pids128 readonly,
separate Chrome browser roots. Actual seed Goals5000/4157/1049, not the unestablished13kH target.
No Android/real-provider generalization. Confidential fixtures/profiles/DBs remain outsideGit;
retained artifacts are whitelisted hashes, counters and synthetic workload metadata.

Decision: if either C fails any gate, retain failure, do not activate750ms or prepare release; scope
next repair (capacity pacing remains plausible). Do not add repetitions for a win. If both C pass,
first run the original eight R,C,C,R heavy/nonoverlap comparisons with both rebuilt clients, retaining
all2.5s/16ms/30s/600s/120s/data/native/undo/fairness guards and throughput nonregression/gain-vs-reference-
drift rules before activation/readiness. Passing two-receiver cases alone is not release qualification.
Only then consider an activation patch and identify signed-source/artifact release checks separately.
All outcomes, source identities, limitations and unsigned sequential patches remain reviewable.
