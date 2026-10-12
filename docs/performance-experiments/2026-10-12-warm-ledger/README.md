# Warm Account ledger loads — 2026-10-12

This slice removes repeated full physical censuses from the exclusive Account owner's warm
loads. No persisted format changes. It also records the approved disk cleanup and begins local
retention design without implementing deletion. Release validation remains paused; nothing in
this packet is a deployment or qualification result.

## Attribution before repair

The isolated CPU-4x profile of the current direct-admission build reproduced nine long tasks,
71–176 ms, all inside journal flush/load work. It counted nine loads, 8,165 loaded rows,
33,137,661 loaded plaintext bytes and 92,079,132 record-copy bytes during 120 keys.
The loaded-byte metric excludes ciphertext overhead; it is not a byte-exact disk-I/O counter.

Within the long-task windows, old-byte comparison took about 30–45 ms self time per typical
task, `equalStoredRecord` about 20–30 ms, and verification/cloning another 22–30 ms self time.
Inclusive times overlap: `openSnapshot` was roughly 53–63 ms and the verified-record path
60–76 ms. This supports targeting the full census/comparison, while identifying detached
copies as a remaining cost. The profile-to-browser clock uncertainty was 1.85 ms. The initial
metrics-span instrumentation lacked a source map for that metrics module; attribution here
uses the separately mapped carrier/verification functions. Final pairs use corrected maps.

## Final matched comparison

Same source and instrumentation, `VITE_ACCOUNT_WARM_LOADS=0` versus `=1`, three fresh pairs in
AB/BA/AB order. Each restored the same synthetic 120-card, roughly 60 KB workspace with 600+
received positions, typed 120 keys offline at requested 150 ms spacing, then undid/redid all
120 edits and reopened offline. All six sessions passed those content assertions.

| Arm/run | Long tasks | Total ms | Largest ms | Handler median/p95 ms | Frame median/p95/max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Reference 1 | 9 | 1,274 | 170 | 5.9 / 7.5 | 17.1 / 57.8 / 78.9 |
| Warm 1 | 8 | 695 | 93 | 5.7 / 7.5 | 16.6 / 51.3 / 165.8 |
| Reference 2 | 9 | 1,315 | 163 | 6.1 / 8.4 | 17.9 / 65.2 / 78.1 |
| Warm 2 | 8 | 720 | 104 | 5.8 / 7.6 | 17.0 / 44.9 / 166.5 |
| Reference 3 | 9 | 1,274 | 159 | 6.0 / 7.9 | 17.8 / 57.4 / 66.1 |
| Warm 3 | 10 | 926 | 131 | 6.6 / 9.8 | 19.1 / 56.3 / 156.9 |

Aggregate long-task duration fell **39.4%** (3,863 → 2,341 ms), exceeding the predeclared 30%
threshold. Median of session handler medians was 6.0 → 5.8 ms; the third warm session was slower
than its pair. The sample is too small for a population guarantee. Profiling and preliminary
runs are retained separately and not pooled into this comparison.

After those pairs, final review corrected the audit frontier to capture all rows present when a
pass starts, then keep that endpoint fixed. The ordinary default-enabled build was rechecked in
one isolated, unpooled session: eight long tasks totaling 713 ms, maximum 94 ms; handler
5.7/7.3 ms median/p95; frame 16.5/45.3/168.4 ms. Its nine warm loads still perform exactly 126
rolling row checks and no full census. Undo/redo and offline replay pass. The safety tests and
packaged two-device journey were also rerun after that correction. This confirmation supports
the mechanism; it is not an additional matched pair or a replacement for the disclosed maxima.

All nine warm loads avoided a full payload census. Instead each session checked 126 old rows
in rolling slices, totaling 781,609 ciphertext bytes, plus metadata/key-shape checks. Existing
detached downstream copies remain approximately **92.07 MB per 120 keys**. Warm-load work is
therefore not independent of history yet.

Worst key-to-frame samples got worse. The trace explains the observed queueing, not a universal
regression estimate: warm run 1's 165.8 ms maximum started as a flush began, waited 142.2 ms for
admission, then applied in 8.3 ms. Reference run 1's maximum arrived near the end of a longer
flush and waited 41.9 ms. These frame measurements start at event dispatch and omit time before
dispatch, including blocking by the reference's longer synchronous tasks. They cannot establish
that every key feels faster. The repair reduces one measured source of stalls; it does not meet
the 16 ms typing budget or remove flush queueing. CPU throttling is not a current-phone result.

## Count and key-bound cost at depth

Disposable native IndexedDB, CPU-4x, three stores, 256-byte synthetic values, five warmups then
50 sequential samples. "Shape" includes counts, first/last keys and metadata read, but excludes
the counter HMAC. Ascending condition order; descriptive measurements, not a complexity proof.

| Total rows | Counts median / p95 ms | Shape median / p95 ms |
| ---: | ---: | ---: |
| 600 | 1.0 / 1.4 | 1.2 / 1.8 |
| 2,500 | 1.5 / 2.1 | 2.0 / 2.8 |
| 10,000 | 4.1 / 5.0 | 4.4 / 5.2 |

The shape guard gets more expensive with key count. It avoids materializing historical blobs;
it is **not constant time**. A different authenticated storage design is needed to eliminate
this growth rather than merely reduce its coefficient.

## Contract, controls and next boundary

See [the implementation contract](../../account-warm-ledger-loads.md) and the decision record:
authenticated counters, count/first/last keys, exact owned commit extension, bounded rolling
checks, 256-row/five-minute audit triggers, and full reads after visibility/resume/reacquisition.
Same-count interior damage may wait for its audit; only prior verified memory is used meanwhile.
The reference switch remains available. Generic Local/shared writers do not use this policy.

Focused safety checks cover transaction aborts, reservation gaps, counter authentication,
cross-owner writes, late lower-sequence insertion, damage detection, close/resume races and
input/output buffer aliasing. A mutable input during asynchronous sealing exposed a real cache
hazard during review; the implementation captures plaintext before sealing and retains a
regression test. Native checks and exact command results are recorded in `checks.md`.

The next performance boundary is the remaining whole-history copies and verification ownership;
the [local-retention design](../../account-local-retention-design.md) separately specifies the
authentication/journal/fencing decisions needed before deleting accepted history. This repair
does not authorize that format change.

## Reproduction and retained evidence

- [Protocol](protocol.md), [cleanup](cleanup.md), probe source under `probe/`.
- Numeric session files, sampled CPU attribution, count samples and logs are compressed in
  `evidence.tar.gz`; `manifest.json` hashes both retained files and scratch-only bundle inputs.
- `source-identity.json` records base, final source hashes and measured-bundle hashes. The final
  default selector and audit-frontier correction are identified separately from the paired build.
- Scratch root: `/tmp/done-warm-ledger-20261012/`. Fixture and credentials stay outside Git at
  the path in the protocol runner. No service database, browser storage, writing or token is
  included in the evidence archive.

Build the probe with `VITE_ACCOUNT_LEDGER_PROFILE=1`, `VITE_ACCOUNT_TEXT_ADMISSION=direct`, and
`VITE_ACCOUNT_WARM_LOADS=0` or `1`, using `probe/build.config.ts`. `probe/run-final-pairs.py`
records the exact six-run order and environment. For attribution add `TYPING_PROFILE=1`, then
run `probe/task-profile.mjs RESULTS_DIR DIST_DIR`. `probe/summarize.py SCRATCH_ROOT` reproduces
the table; `probe/count-depth.mjs OUTPUT_JSON` runs the key-count experiment.
