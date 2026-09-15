# F-17 exploratory optimization round 1

September 15, 2026; signed base `20a535c44d2c33b394306fa67023c62d2d9c5f40`.

**Keep the combination as an experimental baseline.** Three isolated agents produced compatible prototypes. Their combination reduced median trusted-key latency by about **9.4%** on the held-aside full application corpus in both run orders. Tail improvements were smaller: about **8.6% in the early block and 5.6% in the later block**, using paired session p95 ratios. The <16 ms application target remains unmet; this round is exploration, not release qualification or default activation.

The main runtime and tests are unchanged. Candidate changes are reviewable patches in the [round evidence](./performance-experiments/2026-09-15-f17-r1/README.md), with disposable checkouts/builds in `/private/tmp/done-f17-exploration-r1/`. The existing `local-snapshots` mode is selected only by the same private build seam for every benchmark variant, including baseline. It already contains the earlier fork/comparison, handoff and selection-history improvements; these results measure an additional increment.

## Candidates and cheap correctness floor

| Candidate | Mechanism | Focused result and limits |
| --- | --- | --- |
| Preparation | Carry long primitive strings directly through the private paired fork codec; preserve detached mutable structures. | Original five-file 115-case pass plus five final adversarial cases. Review found and repaired boxed-string eligibility. Unicode, key/string ordering, legacy JSON, subdoc GUID and nested forks exercised. Backing-string retention and codec fault controls still need qualification. |
| Allocation | Reuse at most two cleared comparison encoders, capped at 256 KiB each and 1,024 cleared string slots each; lease warm contiguous buffer views until comparison ends. | Two files /24 cases pass, including generated oracle comparisons, reentry, throwing getters and large-to-small reuse. Initial erroneous test expectation retained. Pooling is module-wide in the prototype; retained capacity, direct clearing controls and deeper reentry need qualification. |
| Publication | Refresh only changed text in a private cached projection; structural, unknown, remote and revision-gap changes use the full reader; detach returned snapshots. | Final 92 workspace cases and TypeScript pass. Cross-review reproduced stale cached text after a fork normalized a lone surrogate. Conservative repair excludes all surrogate-bearing snapshots, including emoji, from reuse. That materially limits applicability. |

Combined patches pass **five focused files /126 cases** and TypeScript. Integration typecheck exposed two annotation/fixture issues, corrected without changing runtime semantics; original output remains. No full unit/native suite, registry sweep, wrapper certification, or application release gate was rerun per prototype. All twelve timing sessions pass exact edited text, undo/redo roundtrip and cold reopen. The separate diagnostic failure and its bounded follow-ups are described below; all failures and setup corrections remain available.

## Browser screen and combination

The common packaged app used pinned Chromium 151.0.7922.34, Pixel 7 settings, a 1280×900 viewport and CPU 4× throttling after untimed UI seeding. The small corpus contains 5 days ×15 cards and 400 Goals lines. Each fresh session measures 40 keys after 8 warmups and another 40 after 96 additional keys, with 50 ms gaps. The existing trusted-key paint-proxy recorder is reused. The later block is called `deeper` in raw output but is ordinary editor grouping, not a controlled number of undo groups.

Eight screening sessions used baseline/preparation/allocation/publication then reverse order. The first baseline preceded the separate baseline profile and final prototype checks/builds, so its temporal block is loose. No build or test overlapped timing, but host drift is visible: baseline medians rose in the second session. Paired screening median gains are therefore provisional: preparation **5–8%**, allocation **about 8%**, publication **4–8%**. Early-block p95 was effectively unchanged across two sessions; individual tail results were mixed. These small gains were retained instead of requiring each to solve the release overrun.

The selected combination includes all three distinct mechanisms. Before timing it, the decision and fixed B/C/C/B sequence were recorded. Confirmation used the held-aside full **20-day ×15-card /400-line** corpus and adjacent opposite-order pairs. Across twelve timing sessions, **960 measured trusted keys** and all 1,248 warmup keys completed; session measurements are dependent observations, not 960 independent experimental units.

| Full-corpus block | Baseline median | Combined median | Baseline p95 | Combined p95 |
| --- | ---: | ---: | ---: | ---: |
| Early | 61.20 ms | 55.45 ms | 89.15 ms | 81.50 ms |
| Later | 60.80 ms | 55.05 ms | 74.55 ms | 70.20 ms |

Table entries are medians of the two session summaries. Raw paired median ratios improve **9.4% in both blocks**; p95 improves in all four paired block comparisons, by 2.3–10.9%. Two sessions per variant and 40 keys per block do not establish population confidence intervals or stable extreme-tail guarantees. The short-screen component percentages must not be added together. Full-corpus confirmation did not include individual candidates, so it cannot assign each component a share of the combined gain.

## Allocation diagnostic

Separate short-corpus profiles sampled roughly **95.2 MB** allocated during 60 baseline keys, versus **87.3–92.1 MB** across three combined diagnostic observations. These estimates include collected objects and profiler overhead; they are not retained memory, a precise percentage effect, or evidence that pooling alone caused the reduction. Sampled GC time was 97 ms for baseline and 91–113 ms for the combination, so these observations do **not** establish a GC-time improvement.

After explicit collection, used JS heap was 11.30 MB for baseline and 11.45–11.53 MB for the combination. After lock/collection it was 9.80 MB versus about 9.91 MB in completed combined follow-ups. The combination thus retains modestly more heap in these observations. This is neither a leak test nor a memory-capacity qualification. The profiles still identify substantial document/history construction, editor projection and React rendering work; nested/inclusive attribution rows overlap and cannot be added.

The first combined profile captured valid typing/profile data but failed an immediate post-Undo inequality assertion, before redo or cold reopen. Preserve that failed run. An initial bounded-settlement follow-up passed; a final follow-up, without an extra pre-undo observation, reproduced the immediate unchanged text and then observed the **same Undo action settle within 160 ms without another input**. Redo and exact cold reopen passed. The input action's delivery is not its admission-settlement promise; the immediate assertion was premature. `diagnose-settle.mjs` retains the corrected bounded 3-second post-action check. No candidate code or timing results changed to resolve this harness issue. Four diagnostic observations are retained in total: baseline, the original failed combined postcheck, and two follow-ups.

## Disposition and next bounded round

Retain all patches and the combined experimental source as the starting point for further exploration. The next bounded round should compare the combination with selected components removed, especially publication given its Unicode restriction, and investigate the remaining document/history and editor projection/rendering costs shown by the profile. Preserve credible small gains; label effects that do not separate from session drift as inconclusive. Do not restart from the original reference for every experiment.

Before a selected implementation enters the RC, qualify its ownership/fallback/Unicode/pending/recovery behavior, memory limits and native boundaries, then run the unchanged application-latency gate. Passing this exploratory benchmark is not an activation receipt. Current Local and Account defaults remain `reference`; the latest actual application gate remains 12.2/75.1 ms desktop/CPU-4× card p95 with Android focus 54.2 ms. Those are different runs/protocols and must not be compared numerically with this screen as treatment effects.

Release counts remain **263 files /2,121 dispositions (11 not applicable)** and **0 test-file /96 command /63 campaign obligations unresolved**. F-17 is still partial. The full aggregate, wrapper certification, host-Python binding, recorded timing/owner/oracle observations, R-04/P-06 and subsequent private Account/human milestones remain as recorded in [the execution overview](./release-validation-execution.md). The personal app/server, phone campaign, vectors and L-2 are unchanged.
