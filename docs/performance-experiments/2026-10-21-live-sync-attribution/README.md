# Released live sync: foreground and reopening attribution

**Outcome:** ordinary catch-up is the next bounded repair target. A receiver missing exactly 600 accepted updates takes **33.691 s** on loopback and **57.919 s** with 75 ms added per request. It makes over 600 signed limit-one reads. New typing waits behind that ordered backlog. This reproduces slow, visible incremental catch-up without a bandwidth constraint. No runtime speedup is implemented by this evidence phase.

The secondary live-typing cost is intentional publication batching: isolated edits arrive in roughly half a second locally; continuous typing has approximately two-second tails. Keep its repair separate from catch-up and from local disk-flush policy.

## Source and workload

- Branch base: `27dc7d78d973f2741a813d8d217f28e0c2f033a4`.
- Measured release: `faf465f7255f2df8c5c2f0fac6c8d74e2e2450c2`. Public unauthenticated entry assets still identify this release. Fourteen rebuilt entry assets match their downloaded bytes. All 792 archived source/config/helper files match their release blobs; installed/frozen lock bytes agree. This does not audit the complete installed package store.
- Ordinary receiving, scheduler, prefetch, grouping, admission, notification and batch-policy sources are identical between release and branch base. The branch's newer enrollment reconstruction work is a different consumer; the API graph as a whole is not claimed identical.
- Node 24.18.0, macOS arm64, Apple M1 Pro/10 logical cores/32 GiB; headless Chromium `151.0.7922.34`. Separate synthetic browser contexts and virtual credentials use the actual encrypted UI/account API. This is not Firefox, physical Android, public-cluster or personal-account measurement.
- Verified seed: 121 day cards; initial day markdown 51,440 bytes; Goals `master.md` exactly 13,000 characters/bytes. Whole exports agree on both peers before freezing at authored prefixes A=9/B=2. The backlog seed is A=609/B=2, with exactly 600 newly accepted character updates and B kept offline. Both private snapshots and matching API state remain outside Git.
- Thirty isolated bursts, then 120 character inputs offered every 150 ms without waiting for the peer. Catch-up offers another 120 inputs during draining and a new item from the receiver. Initial local opening/unlock is outside the catch-up clock: this measures online synchronization after local opening, not total application startup. Foreground has a fixed three-second online warm-up outside timing.

The [prospective protocol](./protocol.txt), [source/build identities](./identity.json), [private-seed hashes and outcome audit](./audit.json), [raw numeric observations](./runs/), [analysis](./analysis.json) and [reproduction sources](./reproduction/) preserve the boundaries. `run-classification.json` distinguishes primary, diagnostic and pilot observations. `artifact-provenance.json` records source and stored hashes; `SHA256SUMS` checks the packet.

## Ordinary observations

Each restored journey is one observation, not 120 independent trials. Percentiles below are descriptive nearest-rank within one journey; there are no population intervals or handset speedup claims.

| Measurement | No added request delay | +75 ms per request |
| --- | ---: | ---: |
| Isolated input → peer DOM, p50 / p95 | 535.6 / 629.1 ms | 680.8 / 840.0 ms |
| Isolated input → submit request, p50 | 412 ms | 401 ms |
| Continuous input → peer DOM, p50 / p95 | 1,360.7 / 2,278.2 ms | 1,521.9 / 2,457.1 ms |
| Continuous input → local DOM, p95 | 6.9 ms | 6.2 ms |
| Full 600-update backlog observed by assertion | 33.691 s | 57.919 s |
| Receiver read requests during catch-up phase | 620 | 622 |
| Of those, self-stream reads | 7 | 12 |
| Catch-up HTTP 429s, both devices combined | 3 | 0 |
| New input during catch-up → peer DOM, p50 / p95 | 24.753 / 32.663 s | 49.076 / 56.825 s |
| New input during catch-up → local DOM, p95 | 13.9 ms | 8.0 ms |

All receiver queries sign `limit: 1`. The 600 old positions plus nine new sender envelopes remain ordered; a fast link cannot skip their verification. The full-backlog assertion includes test polling delay; the raw DOM threshold curves retain first observations independently. For example, locally the first/100th/300th/600th backlog characters appear after 0.936/6.086/15.477/33.421 seconds. Complete phase convergence, including new writing in both directions, finishes by 33.997/58.734 seconds.

The receiver's union of read transport intervals rises from 13.080 to 37.752 seconds. Its difference, 24.672 seconds, closely tracks the 24.228-second backlog increase. Intervals overlap with other work and are not additive critical-path allocations. The intervention adds request latency, not bandwidth, WAN/TLS behavior or phone CPU. Existing SSE frames do not incur a new proxy delay after subscription.

Ordinary read forwarding-to-response-header p50 is 33 ms locally. Three local rate refusals remain recorded, rather than explaining the whole 33.7 seconds as throttling. The latency-added arm is slower without any 429. A future faster reader may reach the unchanged 16-work-units/second policy more often; this phase establishes neither safe capacity nor permission to raise it.

Some CDP response bodies are unavailable after HTTP 200 because the application cancels its completed reader. Readable bodies therefore undercount accepted entries. Neither an HTTP 200 nor an unavailable debug body is classified as domain progress/data loss; the client prefix, diagnostics and complete exports are separate evidence.

## Separate diagnostic observations

The diagnostic changes only four frozen source files to emit numeric callbacks, enables existing ledger counters, wraps WebCrypto/IndexedDB timings and profiles the receiver. It runs after ordinary timing. Every original guard executes. Instrumented catch-up is 57.903 s, compared with ordinary 57.919 s; isolated p50 is 540.4 versus 535.6 ms. These close observations do not prove zero overhead; they support keeping this diagnostic distinct, with no observed >15% duration drift requiring the protocol's reverse-order follow-up.

For the 30 diagnostic isolated bursts, median input → actual local outgoing admission is 4.1 ms, publication due is 304 ms, send lane starts at 305.4 ms, HTTP starts at 410 ms, response headers arrive at 436 ms, verified send completion at 466.2 ms, and peer DOM at 540.4 ms. These are marginal medians, not summable components. The per-burst median from send-lane start to request is 104.9 ms: shortening publication alone would not eliminate preparation cost.

The median submit-headers → receiver content-hint difference is 0.7 ms (p95 1.2 ms); median hint → peer-read-start is 25.6 ms (p95 135.4 ms). The hint schedules work and grants no authority. These samples do not support replacing SSE as the first repair.

During diagnostic catch-up the receiver performs 1,016 ledger loads (1,015 warm), 1,521 authority checks (1,520 reuses), 164 incremental inbound verifications, 5,564 readonly transactions and 327 readwrite transactions. Zero full replay or mismatch is counted. Wrapped readonly transactions total 8.559 seconds of async duration; wrapped WebCrypto verification totals 0.303 seconds. Nested timings cannot be summed into elapsed time, and these wrappers do not cover every possible native/worker computation.

Receiver sampling spans 58.848 seconds, including 44.572 seconds in the profiler's idle bucket. Prominent mapped self samples include repeated exact-record comparisons in `verifiedRecords.ts` and scoped-control cursor callbacks in `startupStorage.ts`. Their cost remains a later candidate; the existing opt-in bulk-control experiment already records that it did not shorten fresh authority reads, so this profile alone does not justify enabling it. API sampling includes setup and guardrails across the whole process; it is not isolated request CPU or a service-capacity estimate. See [mapped leaf samples](./profiles-summary.json) and [retained profiles](./profiles/).

## Preservation and failures

All four primary and both diagnostic journeys pass whole-export equality, writing in both directions, local Undo/Redo retaining received writing, and lock/document navigation/offline unlock/reopen with another complete export comparison. The final export hash agrees across both conditions and diagnostics for each workload. Offline document reopening takes approximately 2.3 seconds foreground / 3.8 seconds with the deeper catch-up state; this is not a whole-process cold offline navigation test.

Keep the failed fixture attempts in [fixture-attempts.txt](./fixture-attempts.txt), their logs/results and source copies. They cover a missing explicit Check again action, mistaking debug-body availability for acceptance, an unclean accepted-prefix denominator, and a synthetic pagehide that intentionally retired the workspace. A fifth constructed the exact backlog but lacked the planned Goals text; its two foreground observations remain pilots. The corrected constructor verifies complete Goals exports and the exact denominator before primary timing. A diagnostic-analysis pilot also mixed relative flush and wall-clock publication deadlines; the corrected analyzer selects the publication clock and recomputes from retained traces. None is silently credited as a passing primary measurement.

`audit.json` independently checks all six successful outcomes/guardrails, complete initial Goals sizes, exact 600-position delta and unchanged measurement-probe hashes. The explicit artifact whitelist excludes fixture JSON, browser storage, service databases and keys; known private fixture codes/credential fields are scanned for exact-value leaks. This is not a general secret detector. Reproduction creates new disposable credentials; recorded synthetic secrets are deliberately unavailable in Git.

## Next bounded phase

Measure a branch-baseline reader against a candidate that reuses the branch's existing bounded `read-v2-batch` transport and short-lived authority work for **ordinary** catch-up, retaining the original independently signed single-entry requests/replies and durable receipts. First demonstrate the improvement on this same restored workload; do not presume that the transient eight-entry enrollment page can simply become a durable receive record. Keep exact prefix/request association, every signature/authority/expiry/actor check, ordered durable-before-visible promotion, group/byte/deadline/cancellation limits, fair input/send scheduling and old-server fallback.

Choose and freeze candidate acceptance thresholds before its comparison; require complete exports, both directions, Undo/Redo, reopen and failure-boundary regressions, rather than accepting fewer reads alone. Preserve any new rate bottleneck as evidence for a separate capacity/policy decision. Then address the live publication window independently, measuring whether its durability path actually permits decoupling from disk flush without reviving typing stalls.

No runtime or old repository test changes, signing, preview update, push, merge, deployment, gate change or generalized qualification resumption occurs here. `docs/progress.md` and the deferred formatting patch remain untouched. This packet selects a repair hypothesis; it does not establish an implemented speedup or release readiness.

[Independent final verification](./verification.json) recomputes the headline percentiles from raw DOM observations, checks public asset bytes separately, preserves append-only prefixes, and verifies the protected progress/deferred-format identities. Its checksum count excludes its own receipt. The verification source is retained in reproduction/.
