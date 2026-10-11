# Submit receipt scheduling and scoped session budgets

Based on signed `46388e4f`. The [runtime patch](./runtime.patch) and [source hashes](./source.json)
identify the candidate. Incremental verification remains opt-in; no deployment or release campaign
was performed. This is the second bounded activation repair after the
[correctness phase](../2026-10-11-account-correctness/README.md).

## Changed behavior

A successful submit no longer expedites the receive lane. The delivery status supplies its already
verified aggregate inbound position (own receipt plus peer prefixes), so UI progress advances without
another load or a self read. An unknown submit still expedites an eligible receiver to reconcile a
possibly lost reply; receive backoff and diagnostic halts remain in force. Ordinary send backoff and
its local-edit wake policy are unchanged.

The service suppresses content hints to the submitting credential's workspace subscriptions. It still
notifies peers and enrollment subscribers; control changes still notify their initiating device.
Periodic authenticated reads and ready/reconnect repair remain. The event format has not changed,
so this does not require simultaneous server/client notification-protocol upgrades.

Scoped HTTP budgets now use the service-held session identity behind access tokens and grants.
Renewing either cannot refill its allowance. A session has 120 burst requests, replenished at 16/s,
and at most four in flight. The scoped handler has a 480/64/s ceiling and at most 16 in flight.
Unknown well-formed tokens have a separate 120/2/s bucket. Budget state has a fixed 1,024-entry cap;
only fully replenished inactive entries can be forgotten. Existing body limits and 10-second deadlines
remain. Budget identity is **not authorization**: all live-session, scope, authority and proof checks
remain at the domain transaction. Bootstrap/login and subscription-handshake limits are unchanged.

The allowance is intended to accommodate interactive submission plus peer reads and control traffic.
It is a service policy, not a measured production throughput claim. A session already refused by its
own limit does not consume the shared allowance; aggregate service saturation can still refuse work.

## Bounded request measurements

[Protocol written before measurements](./protocol.md), [probe](./requests.spec.ts), and
[machine-readable summary](./summary.json). Fresh disposable packaged accounts; one browser run at a
time. Both builds use the incremental ledger. Every writer typed 600 characters with a requested
150 ms delay between keys, producing roughly 96 seconds of typing. Requests include a short drain
window and exclude notification streams/session renewal from the scoped count.

| Run | Typed keys | Typing duration | Scoped requests | Successful submits | Requests/key | Requests/successful submit | HTTP 429 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Signed baseline | 600 | 95.5 s | 367 | 76 | 0.612 | 4.83 | 63 |
| Candidate, one device | 600 | 96.2 s | 227 | 224 | 0.378 | 1.01 | 0 |
| Candidate, two devices | 1,200 | 95.7 s | 699 | 139 | 0.583 | 5.03 | 0 |

The single-device candidate had 224 submits and one periodic request each for authority, history, and
self-stream repair. Every measured candidate request returned 200. The two-device run had 139 submits,
131 membership discovery requests, 131 history checks and 298 reads. Complete card contents converged
on both devices within the original 15-second guard; the recorded drain window was 9.15 seconds,
including a final two-second observation wait. This is not a per-edit latency percentile.

The baseline continued seeing 429s in every 30-second interval, including drain, so its 76 accepted
submits do not establish a completely drained cloud queue. Its lower sustained requests/key than the
previous short run is throttling, not an improvement. The candidate accepted more positions while
making fewer total requests. Consequently this result does **not** establish reduced stored history
or cold-open cost; burst batching remains a separate opportunity.

The first three attempts never reached typing: an obsolete Scheduled-card selector, then a Done card
that needed keyboard unlock rather than click. Their logs are retained as `baseline.log`,
`baseline-1.log`, `baseline-2.log`. The middle attempt also selected the wrong backend and is excluded.
The probe now requires an explicit backend source, uses the card's real Enter action, limits UI waits
to 15 seconds, and reports typing progress. `baseline-3` is the completed baseline.

These are single-run mechanism checks on a small desktop workspace over loopback. They do not measure
mobile performance, cold-open growth, rare failures, production capacity, or user-perceived input
latency. No inference treats individual requests as independent experimental replicates.

## Focused verification

- 15 scheduler tests, including unknown-outcome reconciliation, verified aggregate progress, remote
  wakes, backoff/halts and the existing generated deferred histories.
- 30 grant, scoped HTTP, notification and budget tests. New HTTP coverage exhausts a session, renews
  access and replaces its grant, verifies neither resets the limit, allows a second login, and still
  refuses a revoked parent. Budget controls exercise refill, clock reversal, process/concurrency
  limits, idempotent release, invalid-token isolation and churn without resetting spent tokens.
- Four native checks with incremental verification and reference audit on every append: normal
  receipt progression/compaction/cold replay, lost reply, and both declined self-read decision kinds.
- The same four native checks pass with the reference ledger. TypeScript, targeted lint, formatting
  and the packaged incremental build pass.

## Decision and remaining work

This slice passes its predeclared single-device request thresholds and the two-device no-429 /
convergence guard. Request amplification from one's own successful commits is no longer an activation
blocker in these checks. The next bounded phase is the incremental-default activation decision and
integration, retaining the reference override and audit, followed by the normal publication path.

Peer hints still reset membership/history discovery and sweep streams; their roughly five requests
per accepted submission show remaining opportunity. That optimization needs to distinguish content
hints from control changes without losing authority/checkpoint discovery. Further store-load,
accepted-prefix retention, cold reconstruction and typing-burst batching work remains separate.

## Reproduce the bounded probe

Build the chosen source with `VITE_ACCOUNT_LEDGER=incremental node node_modules/vite/bin/vite.js build`.
An archive without `.git` also needs the full `APP_BUILD_REVISION` and `APP_BUILD_DATE`. Use the same
source for its backend and application build. Then, from this repository (absolute paths required):

```sh
REQUEST_SOURCE=/absolute/source REQUEST_DIST=/absolute/source/dist \
  REQUEST_OUTPUT=/private/tmp/unique-disposable-run REQUEST_CONDITION=candidate \
  node node_modules/@playwright/test/cli.js test \
  --config docs/performance-experiments/2026-10-11-account-requests/probe.config.ts
```

Use `REQUEST_CONDITION=baseline` to record the unmodified baseline without applying candidate traffic
thresholds; set `REQUEST_DEVICES=2` for the concurrent guardrail. The fixture owns ports 53221/53222;
run it alone. Each output directory must be fresh. Keep its private disposable service state outside
the repository; the retained packet contains only timing/status metadata, source and logs.
