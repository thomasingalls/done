# Phase117 — Publication-latch comparison accepted

All twelve prospectively ordered journeys pass, once each, with no retries or concurrent builds,
validators or profilers. Source, artifacts, plans and apparatus were frozen in phase116 before
dispatch. This compares R (held112 runtime) with C (publication latching plus guarded750ms reuse).
It does not isolate the causal contribution of the latch or establish population performance.

| Journey | Reference | Candidate |
| --- | ---: | ---: |
| Two receivers, normal, peer p95 upper bound | 2498.5ms | 2047.5ms |
| Two receivers, workspace notifications withheld, peer p95 upper bound | 2372.8ms | 2367.2ms |
| Heavy contention, replay median | 211701.5ms | 147814.5ms |
| Non-overlapping sessions, replay median | 130258.5ms | 80132.5ms |

Both two-receiver C runs observe every120 offered key and all3 separate markers. Candidate local
p95 upper bounds8.1/9.0ms; every marker below2500ms. The unchanged gates are peer p95<=2500ms,
local p95<=16ms, each marker<=2500ms, final new delivery30s and full backlog600s. Withheld C's
maximum peer delay is2740.1ms and maximum local25.4ms: passing p95 does not mean every key meets
the threshold. Fault records confirm workspace frames were actually withheld and no reconnect
ready frame substituted for them. The earlier111 failures remain preserved and are not passing runs.

Heavy R,C,C,R replay gain30.18%, above7.78% reference drift; both paired gains32.91%/27.22% agree.
Quiet-publisher read attempts decrease48.44%. Heavy candidate peer p95 upper bounds706.5/722.8ms
and local7.5/6.5ms, complete120-key series. Non-overlap replay gain38.48%, above0.64% reference
drift; paired gains38.57%/38.40%, quiet attempts decrease75.22%. Both directions confirm upload
before sender close, receiver opens after close, exact writing and same-profile offline cold reopen.

All original continuation, pending sealed-record durability, undo/redo, archive, isolation, loaded
worker/source, read-only1CPU/1GiB/no-swap/pids128 and no-OOM guards pass. Independent native audit
rechecks ciphertext digests, envelope/wrapper/acceptance signatures, every accepted prefix and seed
wire/response byte identity. Heavy only adds Q writing, late only H2, non-overlap only H1; unrelated
accounts remain unchanged. This audit is not independent full authority-chain qualification.
Independent timing reconstruction also rejects false-gate and missing-observation controls.

Decision: the specified performance/data acceptance blocker is cleared for this fixture. Activate
the exact tested guarded owner in a separate bounded patch, then check affected tests and runtime
artifact equivalence. Product default remains held off at this evidence-only phase. The actual H
Goals fixture is5000 characters (M4157/Q1049), not the unestablished13kH target. Chrome virtual
credentials and desktop hardware do not establish Android or physical-provider behavior. These
twelve whole journeys are engineering comparisons, not independent per-key population samples.

Qualification912 obligations/367 unresolved stays paused. Signing and signed-source release
artifact checks remain separate. No commit/push, preview8443 update, image publication or deployment.
Unsigned117 follows116. Private fixture, profiles and native databases remain outside Git.
