# Prepared remote handoff: prospective comparison

Written before measurement on 2026-10-12. Decision: retain this bounded content handoff and CPU
cooperation for publication preparation if correctness holds and online tails materially improve.
Reference is the same source with `VITE_ACCOUNT_PREPARED_RECEIVE=0` and
`VITE_ACCOUNT_CPU_YIELD=0`; candidate enables both. Base is signed `08a82089`. No stored/wire changes.
This is a focused engineering benchmark, not resumed release qualification.

Reuse the preceding matched restored-session protocol: two repetitions per arm, silent peer,
10 peer edits two seconds apart, and a 600-position receive backlog. Two desktop Chromium profiles,
120 cards / roughly 60 KB of card text / 12 KB Goals, edit the roughly 400-character Project 2 card.
Receiver is CPU-4x, service requests have 75 ms added delay, 120 keys at requested 150 ms spacing.
Restore matching browser and service snapshots for every session. Reverse arm order in repetition two.
Run serially, no builds or other tests during timing. A separate active/backlog candidate profile
attributes residual work; profiling runs do not enter the timing table.

Primary measures: per-session key-to-next-frame p95 and count over 100 ms. Secondary: handler and
CDP dispatch times, observed key gaps, local admission queue wait and remote overlap, long task
counts/durations, receive and send progress, HTTP responses. A restored session is the analysis unit;
keys within it are dependent and are not 120 independent replicates. Report both repetitions, no
pooled confidence intervals or population claims. CDP delivery waits can undercount pre-handler
blocking; this does not estimate physical-phone touch latency. Aggregate receive positions include
own-stream progress and initial state, so are not new peer-position counts.

Prediction: most logical remote queue wait disappears; remaining final authority read and apply
still fence briefly. Budgeted byte comparison and task boundaries should reduce long task exposure,
but one native crypto operation, full authentication, Yjs apply or projection is not preemptible.
Do not claim an 8 ms task maximum. Working target remains online/backlog p95 <=50 ms and at most
5% of backlog keys >100 ms; the separate TRD target remains 16 ms. If the target is missed but both
repetitions improve p95 by >=25%, retain a correct improvement, disclose the miss and identify the
remaining category from the separate profile. If mixed/negative, retain evidence and leave the
reference path as default pending diagnosis. Do not silently enlarge this slice into more shrinking.

Guardrails in every session: exact local text, last-key undo/redo, peer preservation, eventual export
convergence, cold offline replay, no halted lanes or unexpected request refusals. Abort investigation
on correctness failure; retain the failed attempt and distinguish harness fixes from runtime repairs.
Native controls separately exercise commit/crash, pending Yjs dependencies, rejected local head,
forced-write ordering, authority/lifetime invalidation, and cancellation. No credentials, writing or
private browser/service snapshots enter the evidence archive; only synthetic numeric telemetry,
source patch and test logs. Private fixture and bundle hashes identify inputs.
