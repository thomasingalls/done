# Immediate authority handoff: prospective comparison

Record before timing. Use the approved immediate-only contract at signed `742e1c14`, with exact
runtime at signed `5c7ba18a` as anchor. Hypothesis: letting input proceed during the complete final
custody read reduces receiving-related queue delay without weakening authentication or undo.
The fresh read is retained; the measured prior 18–20 ms median read wait is an opportunity, not a
predicted subtraction from input p95. Busy/activity misses pay a second check, so benefit is uncertain.

Reuse the status-subscription protocol and its independent input recorder: twelve serial fresh
sessions, 600 keys at 150 ms, CPU-4x, 75 ms artificial request delay; silent/active/600-position backlog.
For each condition run reference/candidate in block 1, candidate/reference in block 2. Restore the
same synthetic 120-card fixture/client/service state each session. The active peer types every two
seconds. No reopening within a typing block. No concurrent builds, test runners or profiling.

Assignment and analysis units are sessions; keys, requests and tasks are dependent observations.
Primary estimand is the paired per-session change in event-timestamp-to-observing-rAF p95 on this
fixture/desktop. It is a pre-paint proxy, not physical screen presentation. Secondary measures:
median/p99/max, >50/100 ms frequency, dispatch wait, actual cadence, handler cost, long-task excess,
queue/job costs, full authority-read durations, immediate hits/skips/activity/queue misses and extra
checks. Compare completed sync work so faster progress does not masquerade as more CPU per receipt.
Retain every run, including setup/correctness failures; repeat only identified harness failures.

All sessions must preserve exact local/peer text, last-key undo/redo, whole-export convergence and
cold offline replay. The focused native and unit controls separately check invalidation, refused
custody, abort/native settlement, blocked input, reentrancy and crash boundaries. Both builds use
identical instrumentation; the prior read-attribution plugin is retained, but the old final-function
probe is replaced by runtime gate counters because that function has changed. Record changed source
hashes and executable build hashes. Use the existing calibrated independent-cadence recorder; missing
samples or bounded-inflight overflow fail the run. No host/process lists are committed.

Decision rule: all correctness guards and a truly synchronous successful fast path are required.
Claim latency benefit only when both contrasts improve an affected condition; 10 ms or 20% is a
useful effect, not a significance cutoff. Reject default adoption if silent-peer p95 worsens in both
contrasts by >10% and >3 ms, if fallback/extra-read cost dominates, or if receive progress stalls.
Mixed/small results are inconclusive. Two sessions per arm/condition cannot resolve small effects or
supply powered confidence intervals; do not pool keys into independent samples. The fixed order
balances simple drift but does not remove nonlinear host drift, fixture dependence, cadence/IME
limitations or sampling error in tails. No efficacy stopping or additional favorable runs.

Runbook: focused correctness/type/build checks; freeze runtime and paired builds; run the fixed
sequence; analyze all twelve sessions; record source/evidence hashes and final disposition. A bug
repair requires recording the failing evidence and restarting affected comparisons under a named
new candidate. This is a bounded optimization study, not resumed release qualification. Physical
account performance remains pending its separately authorized disposable credential walkthrough.
