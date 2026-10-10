# Self-stream repair: focused before/after measurement

2026-10-10. The first repair removes normal self-envelope download, duplicate content persistence
and self-promotion. Native checks confirm that behavior, including cold replay and lost replies.
**It does not establish a general typing-latency win.** Fresh-account stable-text latency improves
in this comparison, but later p95 results are mixed and remain unacceptable. Whole-ledger validation
is still the next bounded repair. Nothing here resumes release validation or changes a budget.

Implementation and compatibility: [repair note](../../account-self-stream-progress.md).
Completed checks: [verification](./verification.md).

## Method

Baseline is `343c4bce23d05da525f6e7b001901978686014e0`, the experiment branch with the deployed
runtime source. Candidate is that baseline plus the two production-file changes on
`codex/account-self-stream-progress`. [source.json](./source.json) records their SHA-256 hashes,
the production diff hash and both builds' JavaScript asset hashes. The candidate was uncommitted
when measured; its displayed base revision alone does not identify the repair.

One pass per build, baseline first, on the same Mac using Chromium 151.0.7922.34, no CPU throttle,
a disposable one-device account, a virtual passkey and temporary localhost account services.
Both use the same installed dependencies. Other desktop applications remained running; host load
averages are retained in the summaries. No other browser test campaign ran during these blocks.

The [original diagnostic probe](../2026-10-10-account-desktop-typing/README.md) is reused with a
shortened sequence: 200 ordinary keys; 120 faster keys; another 200 ordinary keys; 100 traced keys;
then stop the service and type 100 traced keys. No 1,020/2,020-edit points, CPU profile or device
campaign. Both runs completed all 720 keys, and every block reported complete text. Native tests,
rather than this timing probe, cover cold reopening and crash recovery.

Ordinary keys use the original fixed 110–180 ms gap sequence; the faster block requests 50 ms.
The page and driver slow under load, so actual intervals are larger, as recorded below. These are
observations from a short sequential comparison, without repeated runs or randomized order; small
differences cannot be confidently attributed to the patch.

## Results

Values are baseline → candidate, in milliseconds. Text means **stable** character presence in the
editor DOM, recomputed from raw captures; the summaries' first-arrival measure is optimistic when
the controlled editor removes and later restores pending input. Paint means the next frame, which
need not contain the accepted character. Tracing adds overhead; compare corresponding blocks.

| Block (prior edits) | Paint p95 | Stable text p50 | Stable text p95 | Key queue p95 |
| --- | ---: | ---: | ---: | ---: |
| Ordinary typing (0) | 89.1 → 83.0 | 30.0 → 16.5 | 243.9 → 153.8 | 84.0 → 77.8 |
| Faster typing (200) | 188.1 → 181.8 | 135.2 → 116.2 | 588.4 → 467.9 | 181.0 → 174.4 |
| Ordinary typing (320) | 280.9 → 263.2 | 221.8 → 182.1 | 793.6 → 839.2 | 271.9 → 256.4 |
| Traced typing (520) | 361.7 → 408.3 | 316.5 → 291.5 | 1,142.8 → 1,221.1 | 351.1 → 396.1 |
| Service stopped, traced (620) | 442.0 → 439.4 | 24.3 → 1.2 | 472.8 → 473.2 | 439.1 → 435.7 |

| Block | Keys encountering the waiting-to-save indicator | Actual key gap p50 |
| --- | ---: | ---: |
| Ordinary (0), 200 keys | 90 → 40 | 179.3 → 172.5 |
| Faster (200), 120 keys | 73 → 55 | 146.5 → 140.6 |
| Ordinary (320), 200 keys | 110 → 92 | 284.3 → 275.6 |
| Traced (520), 100 keys | 60 → 49 | 341.1 → 352.1 |
| Service stopped (620), 100 keys | 45 → 43 | 188.8 → 191.3 |

The retained census is useful context, not a controlled per-edit storage comparison: batching and
automatic content compaction occur at different points in the two executions. In particular, do not
interpret total content-row counts as a measured percentage saving from removing self copies.
The native test directly checks that ordinary successful submissions produce zero self-inbound
rows and only empty own-stream response pages.

Own-stream HTTP checks remain. Request frequency can even increase when shorter checks allow more
work to run. This repair avoids downloading and processing the content again; it does not introduce
a new head-only endpoint or eliminate polling/discovery. It also reconstructs the accepted prefix
from verified retained records on each validation, so it still incurs work proportional to history.

## Evidence and reproduction

- `baseline/` and `candidate/`: summaries, raw per-key/network captures, stable-text tables and logs.
- `probe/`: the exact shortened probe used for both runs. Its only environment changes select the
  built source directory and output directory. Network captures retain paths, timings and byte
  counts, not authorization headers or body contents.
- `source.json`: baseline, candidate source/diff fingerprints and build asset hashes.
- Large Chrome trace files remain in `/tmp/done-self-stream-progress-perf/results-{baseline,candidate}`;
  derived trace summaries are retained here. Temporary raw traces are not durable evidence.
- Browser databases, service keys and disposable credentials are not included.

To repeat, build the baseline and candidate in separate directories using the same dependencies.
Copy `probe/` into a scratch directory with access to the repository's installed Node dependencies;
the probe creates disposable service state next to itself. Run each build sequentially:

```sh
DONE_PERF_SOURCE=/absolute/path/to/built-checkout DONE_PERF_RESULTS=/absolute/path/to/results node /absolute/path/to/scratch/probe/campaign.mjs account
DONE_PERF_SOURCE=/absolute/path/to/built-checkout DONE_PERF_RESULTS=/absolute/path/to/results node /absolute/path/to/scratch/probe/stable.mjs
```

Ports 53771/53772 must be free. This starts only the disposable local service and packaged gateway;
it must not be pointed at an existing service-state directory.
