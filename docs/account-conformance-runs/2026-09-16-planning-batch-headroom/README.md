# Historical planning batch headroom


## 2026-09-16 — Historical batch reads restore planning headroom

Account activation is signed and verified as `f2c3658b`. Its final wrapper-infrastructure test process
reported 59.924 seconds against the unchanged 60-second deadline, so restore planning headroom before
adding another wrapper. Batch the 26 exact activation historical expressions through one bounded
`git cat-file --batch` process. Preserve reference/revision/path/SHA-256 pins and Git replacement-object
semantics. All other individual readers and every execution-time freshness check retain fresh Git reads.
The snapshot remains synchronous and scoped to one compilation, returns defensive pin objects and
publishes no partial file-pin batch after a failed read.

The batch decoder requires exactly the requested number of blob records, checks length-delimited binary
bytes and terminal delimiters, and rejects missing/non-blob/oversized/truncated/extra output. Keep the
five-second Git timeout and 2 MiB per-blob limit; bound aggregate output by the reviewed group size
(maximum 26, with groups above eight reserved for the exact activation population). No child execution
deadline, report budget, fixture assertion or runtime product behavior is relaxed.

Three same-input profiles before and after produce identical manifests, reducing Git subprocesses from
**62 to 37**. These are local diagnostic observations, separate from application performance gates.
The owned qualification passes **225 cases in eight executions**, followed by exact activation reuse:
141 planning cases, 25 activation, 21 service-inbound regression and 38 runner-stage cases. Manifest
reports **42.387s /60s** test-process time (46.668s total stage wall time), and wrapper
infrastructure reports **48.849s /60s** (53.442s total stage wall time). The wall totals
include runner work outside the child watchdog. Every group drains and activation retains all 31 reports.
These measurements restore observed headroom, without qualifying loaded-host or immutable aggregate behavior.

Two new runner cases cover binary/order/replacement/snapshot/freshness behavior and **160 generated
framing histories (seed 150977)**. All 26 historical blob substitutions in a separate local clone match
fresh `git show` bytes under the batch reader and still refuse at execution. Review found that an earlier
comparison reused the same snapshot; the final control independently invokes the uncached execution
checker against every replaced batch, with the earlier control retained. Expanded source population
refuses before import. The clone is restored. Deliberately trusting a stale planning pin or omitting the
trailing-output check fails the named assertion. Initial scratch mutation launches lacked dependency
resolution; retain those failures, add the local dependency link, and require the actual assertion
failure before counting either control as detected. The pnpm formatter/linter launchers stalled; only
task-owned launchers were terminated and installed local binaries passed. No dependency was installed.

The first two owned epochs fail on stale census expectations, first in general selection and then in
generated selection. Both full epochs and pre-repair sources are preserved. Update both exact counts
and the runner-stage census, then the 17 focused checks and final qualification pass. These failures
are bookkeeping defects, not waived test outcomes. Scoped formatting/lint, graph/manifest and whitespace
checks pass. Complete evidence remains below the 1,000,000-byte archive bound; raw full dependency
inventories remain external by hash rather than being claimed as a self-contained installation.

Totals remain **629 obligations /292 required files /272 general files**; the two new cases raise the
reviewed denominator to **2,203 dispositions (11 not applicable)**. Unresolved integration remains
**110: zero test-file /71 command /39 campaign**. This is headroom repair, not another resolved wrapper.
Runtime, package/dependencies, vectors/crypto census, F-17 debt, prior archives and L-2 remain unchanged.
Next: Account admission-bounds wrapper integration, then remaining families and qualification repairs,
immutable aggregate and private human rehearsal. No personal app/browser/server, relay, device or
deployment operation occurs.
[Evidence and verifier](./README.md).

The schema-3 lossless UTF-8/base64 archive retains 215 complete payloads in 611,480
XZ-compressed bytes, below the unchanged 1,000,000-byte bound. All owned reports, receipts and both
failed census epochs are retained, along with source snapshots, all 26 historical source files,
replacement controls, the 160-run framing control, omission mutations and measurement scripts/results.
The full dependency inventories are external by hash in `raw-artifacts.json`; this archive alone cannot
reconstruct the installed dependency tree. No report was truncated.

Run `python3 docs/account-conformance-runs/2026-09-16-planning-batch-headroom/verify.py` from the repo.
Add `--current --raw` for source/external-inventory equality. The portable verifier checks artifact
integrity, contracts, exact cases, nonces, process drain, child completion and reuse, historical pins,
controls, equal-manifest profiling and the retained census failure. It does not rerun tests, replace the
owned semantic reconcilers or establish immutable release qualification. Timing comparisons are local
observations, not loaded-host guarantees.
