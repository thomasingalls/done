# Fresh authority-read wait during final application

2026-10-12 · **signed `b60d535d`** commits the preceding membership-proof work.
This phase is investigation only. Runtime, authority checks, undo and deployed behavior are unchanged.
Release validation remains paused.

**Finding: the measured read wait is not a measurement of disk latency.** Opening and cursor callback
intervals account for nearly all of it, but final-application opens are much slower than other opens
in the same sessions. Both CPU profiles show workspace UI rendering during those final opening
intervals. The cooperative yield timer contributes little.

**Next recommendation:** isolate admission-status updates from the workspace content/actions context,
then remeasure the unchanged authority path. The code currently sends every queue-status object through
the same React context used by all cards. This is a concrete contention candidate with no need to
weaken fresh checks or introduce a database connection cache. Connection reuse remains a candidate
after that measurement; the current evidence cannot assign the whole opening interval to it.

## Timing attribution

Four serial restored sessions use the current default: membership yielding/reuse enabled, ordinary
cursor custody reader, prepared receive and fresh final authority check. Same 120-card/~60 KB fixture,
12 KB Goals, ~400-character target card, 120 keys at requested 150 ms gaps, CPU-4x receiver and 75 ms
artificial request delay. Active-peer runs include ten peer edits; backlog starts 600 positions behind.
The first two sessions have no CPU sampling; the next two sample at a requested 1 ms interval.

Medians below are elapsed milliseconds, not CPU costs. Medians of components are not additive.
Cursor callbacks/getters are nested inside the transaction and must not be added a second time.

| Session | Final jobs | Complete read | Open call → success callback | Cursor transaction | Budget yields | Other checks: open |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Active, unsampled | 12 | 31.2 | 15.6 | 11.0 | 0.7 | 0.9 |
| Backlog, unsampled | 21 | 24.9 | 13.5 | 9.0 | 0.7 | 0.9 |
| Active, sampled | 12 | 25.2 | 14.6 | 9.7 | 0.4 | 0.9 |
| Backlog, sampled | 18 | 26.5 | 15.1 | 9.1 | 0.8 | 0.9 |

Across final checks in the two **unsampled** sessions:

- Opening occupies **43% / 47%** of total read elapsed time.
- Cursor transaction occupies **53% / 46%**. Each returns four values through five cursor callbacks.
  Value retrieval consumes a median **3.3 / 3.0 ms**; the rest is mostly callback-to-callback waiting.
- Actual budget yields occupy **3.0% / 5.5%**, below the predeclared scheduling-repair trigger.
- Synchronous layout checks and close calls are tiny. `close()` timing measures its JS invocation,
  not physical connection shutdown. Unaccounted continuation/instrumentation time is **0.6% / 0.5%**.
- Final storage-queue acquisition remains small; final apply/publication medians are **6.7 / 6.5 ms**.

Read maxima are **94.7 / 70.4 ms**. Cursor transactions in those outliers take **80.9 / 54.1 ms**,
with much larger callback gaps rather than larger records or value-getter cost. Total final-read overlap
with recorded >50 ms long tasks is **0 / 0.3 ms** in the unsampled sessions. That does **not** imply an
idle main thread: several shorter tasks and browser work can delay dispatch without any one qualifying as a long
task. The unsampled typing p95s are **60.4 / 64.2 ms**; these diagnostic sessions are not a speedup test.

## The profiles change the interpretation of “open”

During final opening intervals, the active profile has **66 React/UI samples of 151**, and the backlog
profile **112 of 277**. Only one sample in each is classified idle. Another **70 / 141** are `(program)`,
which this study leaves unclassified: they are not evidence of disk wait, idle time or any particular
rendering operation. CodeMirror also appears. Counts are dependent diagnostic samples, not a partition
of CPU time or an estimate of the gain from removing a component.

Resolved stacks include `Card`, `Goals`, `Collection`, `Menu` and React render/commit work. The finding
survives conservatively excluding samples near interval boundaries using the full clock-alignment
roundtrip: **58 / 94** interior React/UI samples remain. Those roundtrips are recorded in each profile
analysis. Cursor transaction samples instead include substantial idle and native-read callback work.
The sampled runs have shorter cursor tails than the unsampled ones; they do not explain each earlier
outlier individually.

The same fresh reader's **0.9 ms** median opening interval on other checks makes “opening a connection
intrinsically costs 15 ms” an unsupported conclusion. Final and other operations are not randomized
counterfactuals, and their surrounding work differs. Together with the stacks, this is evidence to test
UI contention before crediting a connection cache with the apparent 13–16 ms opportunity.

## Matching source path

1. `admissionQueue.ts` queues final remote promotion through `receiveOwned` and `enqueue`. Enqueue
   calls `pump()` and then `notify()`; completion and preparation settlement also notify status.
2. `status()` creates a new object for every notification. `WorkspaceUiProvider` passes every
   `workspace.onStatus` notification to `setStatus`.
3. The provider supplies a new context value containing both status and content/actions. `Card`
   subscribes to that whole context even though it only takes `mountEditor`; collections consume
   snapshot/actions, and Goals consumes status mainly for active/blocked availability.
4. React can therefore rerender these consumers on a queue-only status change while
   `preparedPromotion` is awaiting `assertCurrent` → `slotCustodyRows` → `probeDatabase`.

This code path and the profiles support the hypothesis; they do not establish that every sampled
render was caused by that status notification rather than concurrent typing or content publication.
The next controlled repair/experiment should split stable content/actions from granular status
subscriptions, keeping pending/error notices and active/blocked controls timely. Do not suppress
status updates, hide warnings, delay authoritative content or remount editors. Keep the authority
reader, FIFO, journal ordering and undo unchanged so the comparison isolates the UI effect.

If a meaningful opening wait remains afterward, test a custody connection owned strictly by the
exclusive writer lifetime: fresh complete readonly snapshot on every check, same layout/equality/full
authentication rules, close on cancellation/version change, no reuse across lock reacquisition. That
lifecycle design and its measured benefit are **not implemented or established here**. The earlier
bulk-reader experiment remains opt-in; these observations do not overturn its failed adoption result.

## Decision and limits

The [prospective protocol](protocol.md) required a component to exceed 50% in both unsampled conditions
before treating it as dominant. Neither opening nor cursor transactions meet that rule. Yielding also
misses its separate >=25% and >=8 ms trigger. The correct disposition is a bounded follow-up comparison,
not removing checks or declaring the disk the bottleneck. Accounting residuals stay below 2%, so no
extra diagnostic run or instrumentation refinement was needed. Four planned sessions were run.

All four preserve exact writing, last-key undo/redo, peer text, full export convergence and cold offline
replay. Completed account requests during typing are HTTP 200; no page errors. Instrumentation adds
overhead, CPU-4x is desktop emulation, sessions complete different amounts of sync, and automated input
can undersample blocked periods. Sampled sessions are not pooled with unsampled timings. No release
latency, physical-phone, retained-history or throughput claim follows.

## Evidence and reproduction

[summary.json](summary.json) reports final and other checks separately and counts incomplete/boundary
observations. Every complete final job matches exactly one measured authority check. The analyzer
checks non-overlapping time accounting and retains per-check intervals. Nested cursor getter time
is reported separately. [source-identity.json](source-identity.json) pins source, helpers, bundles and
fixture hashes; [manifest.json](manifest.json) verifies [evidence.tar.gz](evidence.tar.gz).

The archive includes numeric events/results, CPU profiles and resolved profile analyses, plus build
and session logs. No fixture contents, saved credentials, service/browser snapshots or writing are
included. The initial diagnostic build failed on an ambiguous `onabort` instrumentation anchor; it
matched both layout and content transactions. Anchoring the line precisely fixed the probe before
any session ran. The failed build log is retained. Runtime files were never edited.

Build `probe/build.config.ts` with `VITE_ACCOUNT_LEDGER_PROFILE=1` into the scratch `diagnostic` folder
recorded by `probe/run.py`. With the private restored fixtures available, that runner executes the four
sessions serially and refuses to overwrite output. `probe/analyze.py` regenerates the timing analysis;
`probe/profile.mjs` resolves sampled stacks and its endpoint-sensitivity counts. `probe/record.py`
archives an explicit allowlist and verifies every entry. No new broad test campaign was run for this
instrumentation-only investigation.
