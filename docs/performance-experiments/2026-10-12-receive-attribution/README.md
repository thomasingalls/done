# Receiving attribution on the deployed build

Measurement phase complete. Runtime and stored formats are unchanged; no candidate is activated
or published. Release validation remains paused. The signed infrastructure checkpoint is
`7f76a59f6249a03b822d73de63e96bcf98fb96df` in `ol-infra`, recording the user's successful two-way
sync recovery on `77657e23`. This packet starts the next performance phase on `codex/batched-receive`.

## Decision

Reduce repeated authority verification and carrier loading before introducing larger wire pages.
Retain the current receipt format. Incremental coverage is **not** the bottleneck in this workload.
The profile also identifies a cheap prerequisite: `assertCurrent` hex-encodes the entire joined
marker just to compare it with the retained marker. That encoding alone accounts for 44.5 seconds
of sampled CPU across the catch-up window.

Proceed in bounded steps:

1. Omit redundant own-stream polls while preserving uncertain-submit reconciliation and periodic
   checks. Remove unnecessary marker-comparison encoding without changing authenticated bytes or
   when fresh authority is checked. Remeasure before estimating the remaining batching gain.
2. Group existing one-position receipts under the owner, with one checked durable commit and
   authenticated readback per bounded group. Reduce repeated status/authority/load work in the same
   owned operation. Keep each entry's signature, prefix and content checks; validate a group as one
   ordered admission, not as independently publishing concurrent callbacks.
3. Add bounded network prefetch only where the remaining measurements justify it. The current
   single-outstanding-request rule must become an explicit bounded request set; at most two
   concurrent reads initially leave room within the four-request session limit for sending and
   control work. Due sending and input must get turns between bounded groups.

This is an implementation choice from attribution, not a measured speedup for that candidate.
Eight single-position replies still mean eight HTTP requests; only grouped owned processing
amortizes the repeated local work. Fewer commit transactions alone would miss the main cost.
Do not weaken custody checks or simply retain a MAC instead of comparing fresh durable evidence.
Any wider verified-custody reuse needs explicit lifetime, row-equality and invalidation rules.

## Identity and method

Runtime `77657e23c994727c8db56201a8c3d4cfe310b7b9` is unchanged at checked-out merge
`1734b2f59e3fe732cab480e94cb5d9a14503e030`. The ordinary build matches all 35 assets checked against
the retained public rollout hashes, including all precache assets, the index alias and service
worker. This runs the published frontend locally, **not** a benchmark against the public service.
The disposable service runs on Node 26.11.1; the deployed container uses Node 24.

The [prospective protocol](./protocol.md) records the fixture, predictions, decision rules and
setup amendments. Each run restores the same genuinely enrolled synthetic pair: 120 roughly
400-character cards, 12 KB Goals, and 600 accepted positions waiting for the receiver. During
catch-up, the writer types 120 more keys and the receiver uploads a sentinel. Afterward, both
directions, complete exports, 12 burst deliveries and offline reopening are checked.

Run order was ordinary local, ordinary plus 75 ms per account request, then an instrumented local
run. Builds and the parallel disk traversal finished before timing. The latency condition adds
delay before forwarding through the same loopback proxy; it does not emulate phone CPU, bandwidth,
loss or TLS. The instrumented run has counters, inclusive function timers and a main-thread CPU
profile; do not pool its elapsed time with the ordinary observations.

## Results

| Observation | Ordinary local | Ordinary +75 ms/request | Diagnostic local |
| --- | ---: | ---: | ---: |
| 600-position catch-up | 308.307 s | 374.759 s | 306.068 s |
| Useful peer reads / own-stream reads | 600 / 149 | 600 / 149 | 600 / 150 |
| Receiver request-to-response-header interval union | 26.881 s | 100.495 s | 26.339 s |
| Membership discovery / history catalog requests on receiver | 58 / 58 | 67 / 67 | 57 / 57 |
| Subsequent burst-to-peer median, 12 observations | 2,366 ms | 2,385 ms | 2,348 ms |
| Subsequent burst-to-peer maximum | 2,770 ms | 2,886 ms | 2,389 ms |
| Offline open after full journey | 6,763 ms | 6,834 ms | 6,994 ms |
| Post-open, post-GC JS heap | 20.84 MB | 20.90 MB | 21.11 MB |
| Catch-up long tasks over 50 ms, count / maximum | 0 / — | 1 / 1,091 ms | 1 / 564 ms |

All three journeys pass complete Markdown export equality in both devices and again after offline
reopening: 54,211 bytes. These completed receiver stores have 661–662 heads rows and 143 outbound
rows; this is a deep received-history open, not a small 51-record fixture. The 6.8-second ordinary
opens remain beyond the 2.5-second budget and are consistent with the previous matched receive
packet's roughly 6.9 seconds. This phase did not profile cold open or repair that cost.

The added-latency run is 66.452 seconds (21.6%) longer. The local request interval union is 8.7%
of catch-up elapsed time. Those intervals end at response **headers**, not body completion, and
can overlap client work; their complement is not automatically CPU time. Backend forwarding to
reply-end for delivery reads averages 23.7 ms locally, including proxy/loopback and handling.
The diagnostic profile independently samples 243.5 seconds of non-idle main-thread activity out
of 306.2 seconds. Native crypto-worker CPU is not captured.

Later peer requests also get farther apart: the ordinary local mean interval is 459 ms at cursors
100–199 and 561 ms at 500–599. These are dependent intervals containing interleaved own/control
requests, not a fitted complexity law. Batching and subsequent retained-baseline work should be
checked against depth, not only fresh-account throughput.

## Where the time goes

Counts and durations below cover the diagnostic catch-up window, including background work and
the receiver's sentinel. Async timers are **inclusive and overlapping**. Do not add them together
or interpret 195 seconds as the removable cost of one particular check.

| Operation | Calls | Accumulated elapsed time |
| --- | ---: | ---: |
| Serialized storage operations | 3,194 | 277.46 s |
| Receive-owner authority checks | 5,792 timed; 5,793 counted | 195.08 s |
| Content loads | 4,286 | 62.16 s |
| Read-only IndexedDB transactions | 53,361 | 87.15 s |
| Read-write IndexedDB transactions | 1,218 | 0.78 s |
| WebCrypto verification, including authority MACs | 48,122 | 7.01 s |
| New inbound-page verification wrapper | 1,350 | 0.95 s |
| Stored inbound-ledger verification wrapper | 1,216 | 0.96 s |
| Coverage checks | 127 | 0.248 s |
| Coverage rebuilds | 3 | 0.012 s |

Counter snapshots can straddle in-flight operations, explaining the one-call authority difference.
The roughly 7.1 content loads and 9.7 authority checks per useful position are workload averages,
not inherent protocol requirements. Loads read 2.51 million rows / 8.55 GB cumulatively, and
record copies total 13.40 GB; those are repeated traffic, not retained heap or disk occupancy.
There is one full verification/audit, 1,217 incremental calls and zero recorded mismatches.

Sampled CPU self time sharpens the attribution:

- Custody `hex`: **84.91 s**, including 44.50 s called by the receive authority comparison and
  40.28 s called by custody record serialization for authentication.
- `sameBytes`: **32.13 s**, including 16.05 s comparing verified row sets, 9.24 s through the
  `equalStoredRecord` helper, and 4.09 s in custody equality. The helper's location in
  `contentCompaction.ts` does not make all those calls compaction jobs.
- Recovery-protocol hex: **12.60 s**; garbage collection: **10.15 s**.

The previous repair of `recordEqual` is still present. It removed hex from that equality function;
it did not remove MAC-payload serialization or the separate whole-marker hex comparison. Thus
these remaining costs do not mean the earlier change was lost.

Coverage's earlier 2.82-second cold-open figure described full replay. Incremental receiving can
reuse original updates and positive coverage conclusions. The fresh attribution does not support
putting coverage ahead of repeated authority/loading work for online catch-up.

## Correctness boundaries and limitations

The source [assessment](./code-assessment.md) records the internal changes grouping requires:
ordered witness extension, aggregate bounds, request expiry, authority rechecks and durable
readback. Reference and incremental readers must cold-replay the grouped writes identically;
abort/retry, stale authority, reordered replies and lost-submit recovery need focused controls.
No multi-position receipt or migration was implemented here. If that becomes necessary later,
coordinate it with retained-baseline design and ship readers before writers; an image rollback
alone cannot make an older reader understand already-written records.

Own-stream reads remain 149–150 per 600 useful reads. Removing them is a worthwhile independent
piece, but cannot plausibly eliminate most of this run. Existing admitted checkpoints can speed
later catch-up. Creating a fresh checkpoint with only two members cannot bypass the other
member's independent admission replay; changing that rule remains a separate protocol decision.

There were no HTTP refusals in the timed windows, including no 429s. The request logs nevertheless
contain HTTP-200 abort flags and closed subscription streams, plus deliberate offline setup
failures outside the window. Sequential cursors, full convergence and export equality pass;
these are not zero-network-error runs. The bounded proxy and disposable subscription lifecycle
also limit transport interpretation. Long tasks remain in two conditions; they are not attributed
to compaction or an audit merely because those operations ran.

These are single serial observations, not a population estimate or a phone measurement. The
21.6% difference exceeds the protocol's ambiguity threshold; no extra timing repetitions were
started. A one-entry-per-page baseline cannot separately identify per-page and per-entry scaling:
the costs are collinear. The proposed batching prototype must establish that amortization in an
actual comparison. Burst timing includes publication batching and assertion polling; online
key-to-next-frame observations are not key-to-visible-admitted-text measurements.

## Evidence and reproduction

`samples/` holds sanitized numeric observations and recomputed summaries; raw synthetic text,
database identifiers and credential-bearing snapshots are excluded. `profiles/` contains the
compressed CPU profile, mapped aggregates and its used source maps. `manifest.json` hashes the
packet; `external-results.json` hashes original external inputs/results. The interrupted `local-1`
attempt and failed build setup are retained, with their dispositions in the protocol. No primary
timeout was turned into a passing result. Existing temporary files were not deleted.

Use installed dependencies and the retained private fixture identified in `identity.json`.
Rebuilding a fixture requires `RECEIVE_SEED=1` in a new fixture/output directory and updating the
fixed fixture date to its creation date; do not overwrite the retained seed. Run observations
serially on private ports 53771, 53772 and 53774. For the unchanged frontend:

```sh
APP_BUILD_REVISION=77657e23c994727c8db56201a8c3d4cfe310b7b9 APP_BUILD_DATE=2026-10-11 \
  node node_modules/vite/bin/vite.js build --outDir /tmp/done-receive-attribution-20261012/baseline-dist

DONE_PERF_SOURCE="$PWD" \
DONE_PERF_FIXTURE_ROOT=/tmp/done-client-receive \
DONE_PERF_DIST=/tmp/done-receive-attribution-20261012/baseline-dist \
DONE_PERF_RESULTS=/tmp/done-receive-attribution-20261012/new-local \
RECEIVE_DELAY_MS=0 \
  node node_modules/@playwright/test/cli.js test \
  --config docs/performance-experiments/2026-10-12-receive-attribution/probe/receive.config.ts
```

For the latency condition use a fresh output directory and `RECEIVE_DELAY_MS=75`. For diagnostics,
build separately with `VITE_ACCOUNT_LEDGER_PROFILE=1` and `--config` pointing to
`probe/diagnostic.config.ts`, retaining the same build identity variables; run with
`RECEIVE_DIAGNOSTIC=1`. Analyze each result with `node probe/analyze.mjs <run-directory>`.
For archived observations, decompress `samples/<run>.json.gz` to `<run-directory>/result.json`
first. To remap the profile, extract the source-map archive into a scratch dist directory and
run `node probe/profile.mjs <uncompressed-profile> <dist-directory> <output-json>`.

The separate [disk inventory](./disk-usage.md) answers the user's storage question. It is not a
cleanup action or a measurement of application storage growth.
