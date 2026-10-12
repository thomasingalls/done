# Let journalled Account typing proceed during timed flushes

Base: signed **`7b088f80`**, the storage-selection repair. This bounded slice changes timed
Account flush scheduling; it does not change stored records, journal acknowledgement, caller
isolation, authority checks or audit coverage. Release validation remains paused. Nothing in
this packet is publication or physical-phone evidence.

## Diagnosis before repair

One profiled CPU-4x run on the signed baseline recorded nine timed flushes, taking 622.7 ms
of elapsed time. Local admission waits summed 163.7 ms. The three meaningful waits were
**65.1, 61.1 and 35.6 ms**, each wholly inside a flush span: **161.8 ms**, or 98.8% of that
run's queue wait. This identifies queue blocking by the flush, not 622.7 ms of synchronous
CPU. The run had one 54 ms long task and a worst visible frame of 86.9 ms; it is diagnostic
and is not pooled with the comparison. Its CPU profile and numeric spans are retained.

`probe/diagnose.py` reproduces the elapsed-span overlap from the pre-replay observation.
The queue's timer previously inserted a FIFO flush barrier. Later inputs therefore waited
for all asynchronous storage/verification/cleanup, even though they could acknowledge through
an independent synchronous journal append. The selected repair addresses this exact wait.

## Implementation and boundary

A timed Account flush owns a separate tracked flight. It copies its observed journal snapshot
through the existing serialized storage tail and performs exact key/value cleanup after commit.
Local input still journals before canonical application. A newer journal revision leaves the
owner dirty and preserves its own next batch deadline. Late snapshot capture may cause a safe
redundant follow-up copy; it cannot mark an unobserved suffix clean.

Foreground inputs remain FIFO. Remote admission, explicit `whenDurable()` and forced content
writes after journal refusal wait for the background copy; later inputs wait behind those
heads. Maintenance waits for clean/settled storage. Failure blocks the owner and retains
acknowledged writing. Close drains both flights before disposal. See the
[contract](../../account-background-journal-flush.md).

`VITE_ACCOUNT_BACKGROUND_FLUSH=0` restores timed FIFO barriers. The measured candidate used
`=1`; after it met the prospective criteria, the default was changed to enabled. No other
runtime change separates the measured candidate from the final default build.

## Prospective comparison

See [protocol.md](./protocol.md). Three fresh restored sessions per arm ran serially in
AB/BA/AB order, without CPU profiling or concurrent builds/tests. Both arms were built from
the same runtime with only the explicit switch changed. Each uses the same synthetic
120-card/600+ received-position fixture (54,211 exported Markdown bytes), Chromium CPU-4x,
offline, and 120 keys at requested 150 ms spacing. A single undo history spans the block;
each run undoes/redoes all 120 keys and cold-reopens the result. All six passed, with no
failed/discarded timing runs. The separate initial diagnostic also passed recovery/undo.

| Session | Handler median / p95 / max ms | Frame median / p95 / max ms | Sum local queue wait ms | Max local queue wait ms |
| --- | --- | --- | ---: | ---: |
| Reference 1 | 5.7 / 7.8 / 32.5 | 16.6 / 28.8 / 100.2 | 276.4 | 86.1 |
| Background 1 | 5.7 / 7.6 / 21.0 | 16.6 / 20.8 / 38.1 | 3.1 | 0.6 |
| Background 2 | 5.6 / 6.9 / 22.7 | 16.5 / 20.3 / 40.2 | 2.3 | 0.6 |
| Reference 2 | 5.6 / 7.2 / 24.6 | 16.0 / 22.6 / 88.8 | 162.4 | 66.1 |
| Reference 3 | 5.8 / 7.3 / 24.4 | 16.5 / 22.3 / 90.9 | 192.1 | 68.1 |
| Background 3 | 5.5 / 6.7 / 21.3 | 16.2 / 20.0 / 40.3 | 2.5 | 0.7 |

Aggregate local queue wait falls **630.9→7.9 ms (98.7%)**, exceeding the predeclared 80%
target. Median-of-session handler medians improve **5.7→5.6 ms**, and frame p95 improves
**22.6→20.3 ms**, satisfying both 10% regression guardrails. Worst observed frame falls
**100.2→40.3 ms**. Frame medians stay near one display frame; the second pair regresses
16.0→16.5 ms. There are **no tasks >=50 ms in either arm** of this comparison. The gain
is mostly removing a wait, not eliminating long tasks or making the journal cryptography free.

Every session records nine dirty flushes, nine selective warm loads, 126 audited physical
rows / 781,609 ciphertext bytes, no full census, and 120 direct text preparations. Record
copies stay at 28.8–29.7 KB; the precise number of sources inside a timed snapshot varies
slightly with scheduling. Summed flush elapsed spans fall 1,859.7→1,612.0 ms, but that is not
CPU savings and the dependent spans must not be added to key waits as separate CPU costs.

The session is the analysis unit. Keys are repeated dependent observations; quantiles use
floor(n*p). These are descriptive local results, not significance tests. Keydown-to-visible
frame omits pre-dispatch delay. The **16 ms p95 budget remains unmet**; explicit barriers,
remote receive work, browser scheduling, workspace-size costs and history growth remain.
Online performance and physical-phone latency were not measured in this comparison.

## Checks and provenance

[checks.md](./checks.md) describes controlled queue tests, actual encrypted journal/database
crash boundaries and the product regression. `source-identity.json` identifies the signed
base, runtime hashes at comparison, both bundles, final runtime and production assets, plus
the external reusable fixture's hash. The fixture itself contains disposable credentials and
is deliberately excluded.

`evidence.tar.gz` retains the seven numeric observations, diagnostic CPU profile, derived
summary/diagnosis, build/test logs and exact comparison/final source patches.
`manifest.json` lists each member's size and SHA-256 plus the archive hash. It excludes browser
storage, service databases, keys and authenticators. Retained probe source uses installed Node
entrypoints, starts isolated local servers, stops them after each run, and preserves all attempts.
