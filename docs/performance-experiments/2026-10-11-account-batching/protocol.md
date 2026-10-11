# Bounded Account batching experiment

Decision: reduce typing interference in the activated `5ccee4d0` runtime without weakening local
admission, retry identity, authority checks, or peer recovery. Baseline is merged `7b6d8d9f` (runtime
identical), with numeric profiling enabled. Release validation remains paused; no live data is used.

## Question and predictions, before running

Can bounded publication batching improve stable-text p95 and reduce background main-thread work on
an Account with accumulated history? The prior request probe had 224 positions/600 keys. At 150 ms
between keys, a one-second maximum suggests about 7 keys/position (roughly 2.5x fewer positions), and
two seconds about 13 (roughly 4.8x fewer). These are scheduling predictions, not latency predictions:
fixed per-key source capture and local flushes remain, operations overlap, and backlog affects grouping.
Predict at least 25% less deep background CPU and 25% lower stable-text p95 if publication dominates.
No prediction that batching repairs existing cold-open growth or removes per-edit source records.

The candidate will compare a 300 ms quiet period with maximum waits of 1,000 and 2,000 ms. The existing
32-source/64 KiB bounds remain. Retry deadlines are independent: typing neither restarts nor extends
a failed send's backoff. Already persisted pending submissions retain exact retry bytes.

Local flush is an explicit factor. First compare publication-only batching with the fixed 250 ms local
flush unchanged. If admission remains dominated by local flush barriers, compare a coordinated Account
flush policy using the same quiet/maximum deadlines. Every edit still enters the synchronous encrypted
journal before acknowledgment; pressure and explicit `whenDurable()` still force commit. Local-only
workspaces keep their current policy. Do not silently change flush timing while reporting a scheduling-only result.

Hidden/pagehide should close the pending batch and request best-effort work without overriding retry
backoff. Lock must revoke unlocked capabilities promptly; a network drain must not delay key erasure
or imply guaranteed cloud delivery on suspension. Record the actual feasible behavior before wiring it.

## Baseline, instruments, units

Reuse the existing disposable desktop packaged-app probe, same pinned dependencies and virtual
authenticator retained across profiling. One browser experiment at a time, private ports, no live
service/profile, unchanged CPU setting. First capture one uninterrupted 2,320-edit session: fresh/deep
100-key profiles, history growth without clearing undo, ordinary compaction, and a deep cold open.
Record actual typing gaps, rows, positions, main-thread cost, stable DOM arrival, long tasks, retained
heap, journal flushes (dirty/total) per key, admission work/wait by job kind, and queue peaks by kind.
Cold open includes the same virtual unlock ceremony in all arms. A DOM arrival is not pixel presentation.

Assignment/analysis unit is a whole disposable session; individual keys, requests and nested cost
timings are dependent observations, not independent samples or additive CPU totals. Numeric counters
exclude writing, identifiers, keys and record bytes. CPU profiles and traces may affect timings; compare
the same instruments across arms and retain failed runs separately. Record source hashes and environment.

## Selection and bounded comparison

Use the fresh baseline to choose the first repair: if flush/publication work dominates, implement
batching; if reconstruction/maintenance dominates independently, repair that measured bottleneck instead.
Do not infer the phone's exact bottleneck from desktop timing.

For a promising candidate, compare baseline → 1s → 2s → baseline at matched history; use fresh/deep
blocks and at least one uninterrupted session. Existing-history comparisons must record matched
physical history, not confuse fewer newly created positions with cheaper processing of old rows.
Use the same saved disposable fixture when isolating costs at fixed history. These small paired
mechanism checks provide no population confidence interval; if order/drift reverses the conclusion,
repeat the conflicting pair once and report mixed evidence rather than keep sampling to success.

In a two-device run, type while the peer receives full batches. Measure receiver long tasks and stable
text as well as sender latency, submissions, 429s, drain time and per-batch peer delay. Preserve individual
authenticated frames/order; investigate page-level projection verification/publication if per-frame
comparison causes receiver regressions. Do not use merged Yjs bytes as a substitute for retained frames.

Success: complete/recoverable writing and exact retries; no new authority, pending-dependency or undo
failures; no 429s; >=25% reduction in deep stable-text p95 and background CPU in matched observations;
no repeatable shallow/receiver regression >20% and >20 ms. Prefer 1s if 2s does not materially improve
typing. Peer scheduling delay must be bounded by the selected maximum (plus measured processing/network
time), including continuous typing. Compare cold-open and maximum compaction costs; do not hide them.

Focused checks cover batch timer/backoff independence, limits and boundary transitions, crash before
publication, lost reply/exact retry, hide/lock cleanup, retained pending Yjs dependencies, receiver
publication ordering and cold replay as applicable to the actual patch. Reuse existing fixtures.
No generalized conformance, mutation, release inventory or exhaustive fault campaign is authorized.

## Limits

Desktop loopback results are development evidence, not physical-phone latency or internet peer-delay
claims. A faster sender can increase receiver work; larger envelopes do not automatically reduce all
source scans. Browser suspension can prevent any asynchronous flush/send; journal recovery is the
guarantee. Publication and a user walkthrough remain separate from this local candidate decision.
