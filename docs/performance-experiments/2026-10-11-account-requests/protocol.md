# Submission request scheduling: bounded comparison

Decision: retain the request-scheduling and session-budget slice, then assess incremental default
activation separately. No release validation or deployment is authorized by these measurements.

Compare signed `46388e4f` with this working tree, both packaged with the incremental ledger enabled.
Use fresh disposable sessions/state and a single browser run at a time on this Mac. First run the
single-device baseline, then the candidate, then a candidate two-device guardrail. Each writer types
600 characters with a requested 150 ms gap (at least 90 seconds). Actual gaps include browser and
application work; retain duration and counts rather than treating injected cadence as achieved.
One two-device case uses both writers concurrently on different cards in the same account.

Prediction: the baseline makes about four scoped requests per accepted position (submit, authority,
history, self read); the single-device candidate should approach one submit per position plus periodic
repair/discovery. It should have no 429 responses. Peer hint discovery is unchanged, so no prediction
of a one-request-per-position two-device rate is made. Session allowance is 16/s with a 120 burst,
process allowance 64/s with a 480 burst; these policy limits are not measured capacity claims.

Observe request path, start/end time, status, device and setup/typing/drain phase using Playwright
network events. Do not retain headers, bodies, tokens, writing or credential state. Report endpoint
counts, requests per typed key, 429 count, submit count, 30-second bins, actual duration, queue drain,
and peer convergence within 15 seconds after typing. Keep failed runs and state what failed.

Success for this slice: single-device candidate <= 0.6 requests/key and <= 1.2 scoped requests per
successful submit, no 429 during single/two-device typing, no growing *network* backlog, both complete
texts visible locally and on the peer after drain. An absent workspace-status banner alone is not
proof of network drain: also require request quiet and peer text convergence. Cold reopen and unknown
reply correctness are covered separately by focused native tests. Failure means investigate within
this slice or report the remaining blocker; do not loosen thresholds after observing a result.

This is a mechanism benchmark, not a population estimate: the run is the analysis unit; correlated
requests/keystrokes are not independent samples. One run per condition supplies no reliable failure
rate or p95 confidence interval. Whole-pair baseline/candidate changes do not separately identify the
budget change's performance effect. Deterministic tests establish budgeting and receipt behavior.
Machine drift, fresh tiny workspaces, loopback latency and virtual passkeys limit generalization;
no mobile, deep-history, server capacity, or typing latency claim follows. Reuse existing onboarding
helpers unchanged. No low-level tracing during timed blocks. Stop on a functional failure and retain
its output before adjusting the probe.
