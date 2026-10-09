# Private Local selection-snapshot comparison and application gate

September 15, 2026, above verified signed `0c84e5cc` and seven uncommitted bounded phases.
[Prospective protocol and outcome](../../f17-selection-performance.md).
[Preceding functional integration](../2026-09-15-f17-selection-integration/README.md).

**The candidate remains private.** The comparison completes every semantic check, but snapshot
reuse misses the predeclared incremental benefit rule. The single unchanged application gate
also fails. There is no runtime/default, Account, adapter, manifest or deployment change.

## Results

The four variants are the complete signed baseline B, current reference R, current Local handoff H
and current Local snapshots S. R/H/S have identical compiled bytes and differ by explicit mode.
The balanced BRSH/RHBS/HSRB/SBHR orders cover **64 fresh sessions, 5,248 warmups and 4,096 measured
insertions**. Every session passes exact text, caret, revision, undo/redo and canonical cold-replay
checks. No session, timing or output is dropped or repeated.

| Seed items / undo groups | Signed B | Reference R | Handoff H | Snapshots S |
| --- | ---: | ---: | ---: | ---: |
| 1,000 / 24–88 | 12.41 | 12.57 | 12.26 | 11.84 |
| 10,000 / 24–88 | 21.06 | 21.21 | 18.53 | 18.06 |
| 100,000 / 24–88 | 92.34 | 94.57 | 63.85 | 64.48 |
| 10,000 / 256–320 | 22.74 | 22.81 | 20.51 | 18.48 |

Values are medians of four session medians, in milliseconds. The decision uses paired ratios:
S/H improves **2.9%** at 10,000 items with shallow history and **10.3%** with deeper history;
the rule requires at least 10% in both. All cumulative S/R and S/B benefit checks pass, as do
all median/p95 regression guardrails. S/H is 0.7% slower at 100,000 items by median paired ratio.
Command timings use a memory carrier and exclude real encryption, IndexedDB and paint. They are
dependent observations within sessions, not a sample of independent users or devices.

The unchanged owned application stage runs once with only `local-snapshots` passed at the Local
opener in a disposable checkout. **Twelve cases execute; thirty measurement rows survive.**
Card p95 is **12.2/75.1 ms desktop/CPU-4x Android**, against <16 ms. Android focus is **54.2 ms**,
against <50 ms. All remaining budgeted metrics pass. Eleven cases report passed; the final Android
case carries the deferred afterAll budget failure. This is not a navigation correctness failure.
The stage takes 138.362 seconds including preparation/drain. Browser and process group drain,
and the localhost server closes. All four typing measurements contain 120 trusted-key samples.

The prior handoff application result, 12.9/63.5 ms, is a separate unpaired observation. This run
does not identify a browser regression caused by snapshots. Both fail the unchanged Android
typing gate. No physical-phone continuation, new performance repair or budget relaxation occurs.

## Retained evidence and checks

`artifacts.json.gz` contains an indexed map of exact UTF-8 payloads: the frozen protocol, benchmark
and application helpers, every command timing and stdout/stderr result, analysis, source excerpts,
activation patch, application measurement rows/receipts/browser inputs, preservation pins and
verification logs. Each decoded payload has its original byte length and SHA-256. The initial
base64 packaging exceeded the prospective 350,000-byte ceiling; using reversible UTF-8 strings
inside gzip reduces it without dropping evidence. The initial archive and packaging note remain
in the raw index. The ceiling and all measurement rules are unchanged.

`raw-artifacts.json` pins the larger inputs, complete compiled command bundles and disposable
application build under ignored `test-results/f17-selection-performance/`. These remain local;
the documentation packet does not embed a complete source checkout, installation or browser image.
`summary.json` pins the archive/index and records the outcome. The archive's protocol is the
prospective version; the linked living protocol adds the outcome after execution.

From the repository root:

```sh
python3 docs/account-conformance-runs/2026-09-15-f17-selection-performance/verify.py
python3 docs/account-conformance-runs/2026-09-15-f17-selection-performance/verify.py --raw
```

The verifier recomputes every session median/p95 and all decision rules from raw observations,
checks sample counts, balanced ordering, bundle identity, untimed smoke results, original application
contract, measurements, one-line activation, process/server drain, previous packet hashes and
preservation. `--raw` additionally checks local raw artifacts and complete before/after input identity.
The entire original source/dependency identity matches after the application run. The previous
functional packet still verifies; inventory/manifest and whitespace checks pass. No full functional
campaign is rerun for this measurement-only phase.

The frozen helpers are embedded for review/reproduction. A future run needs a new output location
and newly recorded input identities; it must not overwrite these measurements or be represented
as the original run. The current installation and exact signed baseline remain available locally.

## Checkpoint

F-17 remains partial. General integration stays **263 files / 2,121 dispositions (11 not applicable)**;
there are **0 unresolved test-file, 96 command and 63 campaign obligations**. Seven earlier packets,
52 personal/vector pins, append-only prefixes and L-2 are preserved. Personal app data, package,
relay, routing and browser remain untouched.

Eight completed bounded phases now await commits. Review and sign that backlog, then profile
the snapshot application variant's remaining document/history fork, complete comparison and
publication costs before selecting another repair. Wrapper certification, loaded-host observations
and immutable release qualification remain ahead.
