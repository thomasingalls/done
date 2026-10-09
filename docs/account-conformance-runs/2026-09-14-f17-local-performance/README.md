# Private Local performance and activation decision

The candidate meets the prospective relative command-performance rule, but **default activation is
refused** because the unchanged application gate still fails CPU-4x Android card typing.
[Full protocol and interpretation](../../f17-local-performance.md).

| Result | Observation |
| --- | --- |
| Signed comparator | Complete runtime source at signed `0c84e5cc`; signature verified |
| Current comparators | Same functional-checkpoint bundle; `reference` versus `local-handoff` |
| Fixed comparison | Six balanced orders, 54 sessions, 1,296 warmups, 3,456 measured commands |
| Semantic checks | Exact text/caret/revision/history, one preparation, undo/redo and full durable replay passed |
| Candidate improvement, 10,000 items | 10.2% vs reference / 12.0% vs signed baseline; narrow threshold clearance |
| Candidate improvement, 100,000 items | 29.7% / 29.0% |
| Unchanged application typing p95 | 12.9 ms desktop / **63.5 ms CPU-4x Android**, budget **<16 ms** |
| Other application budgets | Passed; all 30 measurement rows retained |
| Execution | All 12 cases ran without retries; final Android afterAll budget hook failed; processes drained |
| Decision | Candidate stays private; F-17 partial; no product or adapter edit in this phase |

The relative gains use the median of six paired session-median ratios. They are not ratios of pooled
command medians, and the observations are not independent population samples. Node uses a memory
carrier and excludes encryption, IndexedDB and paint. Existing reference writer-renewal warnings and
their output cost remain. One tail regression in the medium stratum is retained; the prospective
four-block regression rule was not reached. Earlier browser values (15.2/69.4 ms) are historical
reference context, not a paired browser speedup estimate.

The prospective protocol incorrectly says seven cases per project. The unchanged source and frozen
stage explicitly enumerate six per project; all twelve executed. Original protocol bytes are retained
alongside the correction. No budget, test, timeout, retry, worker or workload was changed to obtain
these results. Build-setup failures before timing are also retained; none is counted as a measurement.

## Evidence and reproduction

`artifacts.json` hashes every gzip archive and decoded payload. `node-observations.json.gz` retains
all individual warmup and measured durations; `node-output.json.gz` retains complete per-session
stdout/stderr. The frozen protocol, build/worker/order/analysis programs, untimed checks, all analysis,
activation patch, original application case report, measurement sidecar, output, browser ownership and
failed receipt survive. `verify.py` independently recomputes the relative decision and validates case
census, measurement attachment, preservation pins, archived hashes and the applicable source state.
Run from the repository root:

```sh
python3 docs/account-conformance-runs/2026-09-14-f17-local-performance/verify.py
python3 docs/account-conformance-runs/2026-09-14-f17-local-performance/verify.py --raw
```

The source is signed `0c84e5cc` plus the preceding
[functional packet's source patch](../2026-09-14-f17-local-handoff/README.md).
The current non-document source pins are identical to that packet's checked, reconstructable pin
array. The browser variant adds only the archived Local opener argument in its disposable source
snapshot. `input-reference.json.gz` records exact bundle/module hashes, source/dependency digests,
runtime identity and the checked source reference. Full frozen inputs, actual bundles and remaining
harness/setup output are retained under `test-results/f17-local-performance/comparison`; the owned
browser run is under `test-results/f17-local-performance/application-candidate`. Large frozen manifests
and disposable app build outputs stay there with hashes in `raw-artifacts.json.gz`. This bounded
packet does not embed a complete installed dependency tree or browser profile. `--raw` also checks
these locally retained files. The benchmark build and controller scripts use their recorded absolute
scratch path; reproduce in that location or document a path-only relocation before a new run.

The archive remains below the prospective 250,000-byte ceiling. Append-only record prefixes, the
prior functional packet, all 52 personal/vector pins and L-2 are preserved. Unrelated root files,
personal browser/package/server/routing/recovery files were untouched. No commits were made in this
phase. Integration counts remain 616 obligations with 96 command and 63 campaign rows unresolved;
this run is not aggregate, physical-device or Account qualification.
