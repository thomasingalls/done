# Receive attribution before batching

Prospective protocol, 2026-10-12. Release validation remains paused. This is a bounded
engineering measurement of the deployed runtime `77657e23`, available unchanged at merged
`1734b2f5`. No production accounts, service data, or physical-device storage are inspected.

## Question and decision

Where does the roughly half-second per received position go on the current build: repeated
per-page storage/authority work, per-entry verification/coverage, service/network work, or
waiting between operations? Choose the next implementation from that attribution. Consider
grouping existing single-position receipts before introducing a new stored format. Move
unnecessary own-stream reads ahead of any format change, subject to authenticated unknown-submit
reconciliation. A permitted HTTP concurrency count is not permission to overlap owner tasks.

The previous 307–318 second loopback result makes network round trips an unlikely explanation
for most elapsed time. It does **not** by itself prove that the remainder is active client CPU:
native I/O, crypto workers, scheduling and queue waiting must also be measured. Cold-open
coverage cost cannot be assumed to recur in the same proportion during incremental receiving.

## Design, units and fixture

Descriptive attribution plus a restored-fixture latency comparison. Reuse the retained synthetic
two-device fixture: 120 roughly 400-character cards, 12 KB Goals and 600 accepted positions
waiting for the receiver. Start each run from identical browser/service snapshots, with fresh
browser contexts and virtual passkeys. The full restored run is the analysis unit; its requests
are dependent observations, not independent statistical replicates.

First run the unchanged production frontend locally. Then repeat with 75 ms added to each
account request before forwarding to the same local backend. This models added request latency,
not phone CPU, bandwidth, packet loss, TLS, or the public cluster. Use an otherwise identical
proxy at zero delay in the local condition. A separate diagnostic build enables existing numeric
ledger counters plus bounded function/crypto/transaction timings and a CPU profile. Do not pool
its timings with ordinary builds. No concurrent builds, tests or disk scans during timed runs.

## Outcomes and instruments

- Primary: wake-to-complete 600-position text convergence, deadline 600 seconds. Preserve
  failure/censoring, with no post-hoc extension counted as success.
- Request counts, self/peer cursors, status and completion timing; proxy forwarding-to-response
  time separates imposed delay from the local backend path. Store no tokens or account IDs.
- Diagnostic counter deltas: physical loads/rows/bytes, authority checks, verification passes,
  coverage checks/rebuilds, storage/admission queue waiting, crypto calls and transaction counts.
  Function timers are inclusive; nested or overlapping costs must not be added as disjoint time.
- CPU sampling distinguishes active JS from idle/native awaits. Report per-position values and
  early/late request intervals without treating them as independent runs.
- Existing journey guardrails: writer activity and receiver sentinel upload during catch-up,
  complete export equality, subsequent burst delivery, receiver typing and offline cold reopen.
  Next-frame timings are responsiveness proxies, not presentation/input-admission latency.

Diagnostic rows and profiles contain only synthetic workloads and numeric timing/code locations.
Credential-bearing snapshots remain outside Git. Retain only bounded evidence, reuse the seed,
and avoid a new repository/dependency copy for each run.

## Analysis and decision rule

Report individual results, counts, proportions and an interval union for network busy time where
available. There is no population confidence claim from these few serial runs. If conditions
differ by less than 15%, or host drift/setup errors make interpretation ambiguous, repeat them
in reverse order before attributing the difference. A clear large cost concentration is enough
to select a prototype; it is not enough to activate one.

Classify amortizable overhead from the operations actually performed. A one-entry-per-page
baseline alone cannot identify the speedup from batching: per-page and per-entry counts are
collinear. Use the measured budget as an upper bound, then compare a prototype to establish
the gain. If coverage consumes at least half the accounted client processing time, prioritize
coverage before receipt redesign. If repeated load/authority/commit work dominates, prototype
grouped existing receipts with serialized verification/commit and bounded speculative fetch.
If neither dominates, target the largest measured component first.

The own-stream change must preserve lost-submit reconciliation, periodic discovery and fair
publisher/send turns. Before implementing concurrent fetches, verify actual session capacity,
request expiry, prefix dependencies and the one-outstanding-request ownership rule. Do not
infer feasibility solely from the service's in-flight allowance.

Any new receipt format needs an explicit reader-first deployment/activation and rollback plan,
coordinated with retained-baseline design; this attribution phase writes no new receipt format.
Checkpoint-based catch-up is a separate candidate whose two-device admission restrictions must
be traced before claiming it available or unavailable.

## Runbook and limits

1. Freeze runtime identity, harness and build configuration; record the reused fixture hash.
2. Finish unrelated disk traversal; build the unmodified and diagnostic bundles before timing.
3. Restore and run ordinary local, ordinary +75 ms, then diagnostic local, serially. Keep every
   attempt's outcome. Stop each disposable service before the next fixture restore.
4. Compare exports/reopening and record timing/counter/CPU attribution. Write the implementation
   decision with supporting measurements and unresolved costs.

Instrumentation overhead, host thermal drift, synthetic workspace choice and a single restored
account limit generalization. The delayed condition is not a physical-phone benchmark. Existing
deep received-history costs and future retention remain separate from the throughput result.

Setup amendment before a complete timed run: the reused fixture's active date is October 11.
After local midnight, the old harness selected a noneditable adjacent-day card from October 12
and its concurrent writer task failed. Preserve `local-1` as an interrupted harness attempt
(about 30 seconds of partial catch-up), not a completed result. Navigate both restored editors
through the date control to October 11 before the online wake, and again after cold reopening.
The cold-open timer still ends at first editor frame, before that navigation. Also make cleanup
continue when Playwright has already closed a context. Two build setup failures are retained:
pnpm could not perform its registry identity lookup inside the sandbox (use the installed Vite
CLI directly), and TypeScript 7's package does not expose the old compiler AST API (use the
already-installed Babel parser for the isolated diagnostic transform). No runtime repair or
performance result is attributed to these harness changes.

Predictions recorded while the first corrected run is still in flight, before its completion:
using the previous packet rather than a new result, expect about 300–340 seconds locally.
At the previous 750 receiver reads, 75 ms adds roughly 56 seconds just to those serialized
requests; discovery/history requests can add more, so expect about 360–420 seconds overall.
These are rough engineering predictions, not acceptance limits. The diagnostic hypothesis is
that repeated owned loads/checks outweigh network time; incremental coverage may be much
cheaper than cold replay because original-update and positive-coverage reuse are available.
Preserve a contrary result and change the prototype priority accordingly.
