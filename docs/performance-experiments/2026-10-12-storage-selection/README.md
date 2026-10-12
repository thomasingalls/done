# Account storage selections — 2026-10-12

The verifier-ownership repair is committed signed as **`f4f01228`**. This next working-tree slice
removes full storage-load copies when an operation only needs a small verified answer. The
[prospective protocol](protocol.md), [ownership/lease contract](../../account-storage-selection.md)
and [source/bundle hashes](source-identity.json) distinguish the design, measured variants and
final activation. There is no stored-format change, deployment or resumed release campaign.

## Mechanism

The preceding packet attributes about 33 MB per 120-key session to nine detached carrier loads.
Those journal flushes only need exact source-presence answers. A new private selection interface
performs the same counter/shape checks, rolling physical audit and semantic verification, then
provides an opaque, synchronous lease to the separate verifier. The verifier clones only the
selected answer. Callers never receive carrier rows or buffers; lease expiry and lifetime/view
checks prevent late or foreign use. The opted-in private validator alone borrows retained input
immutably and copies its own new rows before retaining them.

Selections serve source-presence checks and existing receive/delivery/spool projections, publication
checks and committed submission/status readback. Genuine full-record consumers, independent audits,
cold reads and compaction keep detached loads. `VITE_ACCOUNT_SELECTIVE_LOADS=0` restores the old
full-copy path; disabling warm loads or selecting the reference ledger also disables selections.

## Matched comparison

Same synthetic 120-card / 600+ received-position fixture, 54,211 exported Markdown bytes. Each
session freshly restores it, opens offline, sets desktop Chromium CPU-4x, then types 120 keys at
requested 150 ms spacing into one card without resetting undo. It undoes/redoes the full block
and reopens offline. No profiling or other builds/tests overlap the timed sessions. Serial order
is reference-1, selected-1, selected-2, reference-2, reference-3, selected-3. Quantiles use floor(n*p).

Both variants use the same candidate source with explicit selection `0/1`. The candidate retains
the signed base's validation and copy behavior when off. After timing, only the default selector
changes from explicit `=1` to enabled unless `=0`. No failed typing attempt was omitted.

| Session | Handler median / p95 / max, ms | Frame median / p95 / max, ms | Long tasks | Total / max task, ms | Record-copy bytes |
| --- | --- | --- | ---: | --- | ---: |
| Reference 1 | 5.8 / 8.0 / 31.6 | 16.5 / 22.0 / 110.1 | 4 | 238 / 68 | 33,164,599 |
| Selected 1 | 6.1 / 8.1 / 21.8 | 17.7 / 38.8 / 115.7 | 0 | 0 / — | 29,404 |
| Selected 2 | 5.8 / 8.5 / 20.7 | 17.3 / 37.4 / 96.4 | 0 | 0 / — | 29,404 |
| Reference 2 | 5.8 / 8.1 / 20.4 | 16.7 / 36.2 / 110.7 | 4 | 217 / 56 | 33,165,151 |
| Reference 3 | 5.7 / 7.9 / 29.3 | 17.1 / 50.3 / 115.4 | 5 | 284 / 66 | 33,163,753 |
| Selected 3 | 6.3 / 8.2 / 27.1 | 18.2 / 50.0 / 90.1 | 0 | 0 / — | 29,404 |

All six pass undo/redo and offline replay. Record copies fall **99.91%**, exceeding the declared
90% criterion and below the predicted 0.1 MB. Remaining recorded copies are new verifier/coverage
rows, not nine full histories. Every session still performs nine dirty flushes and nine warm loads,
with 126 old rows / 781,609 ciphertext bytes audited. Candidate sessions report nine successful
selections; reference sessions report zero. No store census is performed during the typing window.

The reference records 13 tasks totaling 739 ms at or above the browser's 50 ms long-task threshold;
none are observed in the three candidate sessions. This meets the target for that metric but
**does not mean the work disappeared or total CPU time fell by 739 ms**. Work moved below a
threshold, and input can still wait while a flush awaits storage/crypto.

There is no typical-input-speed win here. Median of handler medians rises **5.8→6.1 ms (5.2%)**;
median of frame p95s rises **36.2→38.8 ms (7.2%)**. Both remain within the predeclared 10% limit.
Frame medians rise in every pair; pair 1's p95 rises **22.0→38.8 ms**. Candidate worst frame is
**115.7 ms**, versus **115.4 ms** for reference. These regressions are retained, not smoothed away.
The 16 ms p95 budget remains unmet. The activation decision is based on the strong copy reduction,
unchanged integrity checks and passing predeclared guardrails, not a claim that typing is faster.

Secondary timing helps separate the mechanisms: total time inside the nine admission flushes
sums to **2,558.5→2,055.9 ms** across the three sessions (19.6% lower). Sum of per-key admission
waits instead rises **773.7→812.4 ms**; it depends on when keys collide with flushes. These are
elapsed spans and dependent waits, not additive CPU attribution. New selected-result cloning is
not included in the old `readProjection` timing counter; the numeric result sizes here are small.

This is a descriptive result from three fresh sessions per arm, not population significance,
physical-phone performance, online catch-up speed or a proof at arbitrary history sizes. Frame
timing starts at dispatch and misses pre-dispatch blocking. CPU-4x is an emulation. The fixture
has received history, but this typing comparison is intentionally offline.

## Checks and evidence

[Focused checks](checks.md) cover selected/full-load caller isolation, lease expiry and forgery,
failed/late/async selection, resume and audit behavior, generated read equivalence, native
source/decision/compaction/cold continuation, independent reference-audit refusal, reader
serialization and the packaged two-device delivery/undo/offline journey. No ordinary API loses
its ability to return fully detached records. The new interface stays private to the composed owner.

`evidence.tar.gz` retains all six numeric observations, pre-replay observations, comparison summary,
check/build logs and exact runtime/test patch. `manifest.json` records sizes and SHA-256 for each
member and archive. Browser storage, service databases, authenticators and fixture credentials are
excluded. Reusable fixture and source-mapped bundles remain outside Git at the recorded paths/hashes.
`probe/build-pairs.py` and `probe/run-pairs.py` preserve the exact build/run environment; the latter
stops on any failure. `probe/summarize.py <results-directory>` recomputes session statistics.

## Remaining

Selections remove unnecessary caller copies on their paths, not every history-dependent operation.
Full record consumers, verifier equality scans, container construction/cleanup and projections
that genuinely return large state remain. Input still waits behind async flushes; this slice does
not alter journal durability or queue order. Local retention remains design-only. New work is
uncommitted/unpublished at this checkpoint; release validation and public deployment are separate.
