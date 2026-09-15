# F-17 exploration round 2 — component removal and editor projection

2026-09-15. Round one is committed and signature-verified as `cc0f85c5ad7b7d3dde6b5b02477d0452c2066666`. This round keeps **primitive-string preparation reuse + bounded comparison pooling + an editor projection shortcut** as the next experimental combination. It parks the previous publication cache while preserving its patch and useful ordinary-text result. Main runtime/tests and Local/Account defaults remain unchanged.

All **18 fresh browser sessions /1,440 measured keys /1,872 warmup keys** pass exact typing, bounded undo/redo and cold reopen. The selected composition passes **4 focused files /127 cases** and TypeScript. These are cheap exploratory checks, not release receipts or a budget pass. [Source, protocol and raw evidence](./performance-experiments/2026-09-15-f17-r2/README.md).

## What each component contributes

The signed source already contains the private Local snapshot implementation. Four disposable variants add the round-one optimizations, then remove one at a time. All use the same build-only Local snapshot selection and actual packaged application. Each runs twice in forward/reverse order on a UI-seeded corpus of 20 days ×15 cards, 400 Goals lines and an additional edited card. Pinned Chromium 151 uses Pixel 7 browser settings, a 1280×900 viewport and CPU4 after unthrottled setup. Builds/tests never overlap measurements.

| Ordinary-text variant | Early median | Later median | Early p95 | Later p95 |
| --- | ---: | ---: | ---: | ---: |
| Preparation + pool + publication | 54.30 | 53.60 | 72.45 | 63.90 |
| Without preparation reuse | 57.65 | 56.95 | 80.25 | 78.90 |
| Without pooling | 57.45 | 57.45 | 76.90 | 75.30 |
| Without publication cache | 55.90 | 55.45 | 79.00 | 76.85 |

Milliseconds; each cell is the median of two session statistics. “Later” means ordinary typing after 96 additional warmup keys, not a separately counted number of undo groups. Each measured block has 40 dependent key samples; p95 has limited precision. The prospective protocol and every raw sample are retained.

Paired median gains from retaining preparation are **5.8% early /5.9% later**; retaining pooling gives **5.5% /6.7%**; retaining publication gives **2.9% /3.3%**. These are marginal effects conditional on the other two components, not independently additive gains. Two reverse-order blocks reduce order bias but cannot establish population effects or eliminate host/JIT/GC drift. No minimum percentage rule discards an otherwise useful small gain.

The removal combinations pass their affected workspace/equality cases: 99 without preparation, 96 without pooling, and 93 without publication. The unchanged full combination reuses its round-one 126-case evidence. There was no full unit, native, memory or release run here.

## Why the publication cache is parked

The round-one cache conservatively falls back for emoji-bearing snapshots after the surrogate-normalization defect found in that round. Four additional sessions requested a rocket emoji in the extra edited card. Early results have opposite directions. Both later comparisons are slower with the cache: median ratios **1.027 /1.255**, p95 ratios **1.108 /1.220**, against the same combination without it.

Those sessions inserted the requested setup text but did **not explicitly assert emoji presence in the chosen card**. Their helper bytes and this limitation are retained. Host variation is also substantial, so the exact apparent penalty should not be treated as an established causal effect. The mixed guard, fallback work and extra semantic complexity justify using the simpler companion configuration for the next prototype. The ordinary-text gain remains evidence, and the implementation remains available for revision.

The [companion decision](./performance-experiments/2026-09-15-f17-r2/editor-decision.md) was recorded before editor timing. It also strengthened untimed setup to assert the marker and requested emoji condition for all six subsequent editor sessions. Earlier observations were neither discarded nor retroactively given those checks.

## The next incremental improvement

Every workspace publication currently projects all mounted editors. An unchanged Goals surface still scans its text, dispatches a selection transaction, rebuilds live-preview decorations and updates selected-line React state. The candidate keeps every authoritative `document.read()` but skips the scan for equal text and skips dispatch when text, effective selection and editability are all unchanged. Selection comparison includes association, bidi state, goal columns and undirectional ranges. Text/selection/editability changes and unreadable reads keep their existing paths.

Review caught an IME exception before timing: composition-end reconciliation must still dispatch even when accepted model text is unchanged, because transient preedit DOM may remain after refused input. The candidate explicitly forces that path and bypasses the shortcut during composition. Eleven focused editor cases cover the shortcut, cursor normalization, unreadable state, pending/status behavior and this forced path. That is not native IME qualification.

Only `src/editor/admittedEditor.ts` differs at runtime between the editor candidate and its preparation + pool comparator. Four fresh sessions run comparator/candidate/candidate/comparator:

| Ordinary-text variant | Early median | Later median | Early p95 | Later p95 |
| --- | ---: | ---: | ---: | ---: |
| Preparation + pool | 60.50 | 59.10 | 87.90 | 78.50 |
| Preparation + pool + editor shortcut | 58.50 | 56.75 | 83.50 | 72.70 |

Paired median gains are **3.3% early /4.0% later**; paired p95 gains are **5.0% /7.3%**. All four individual median comparisons improve. The first pair's later p95 is 1.0% worse; the other three p95 comparisons improve. This is a useful small increment, not proof of a universal improvement. Different timing batches have different baselines: do not compare this table directly with the ablation table or claim a net gain over round one's complete combination.

A final single Unicode pair, with emoji presence explicitly checked, passes all semantic postchecks. Medians are 59.4→58.0 ms early and 59.0→57.5 ms later (2.4% /2.5% improvements); p95 is 81.2→78.8 and 83.2→82.3 ms. This is a guard observation with one fixed order, kept separate from the primary editor comparison. It does not qualify multilingual input or establish a broad effect estimate.

## Retained work and next decision

The [complete selected patch](./performance-experiments/2026-09-15-f17-r2/selected.patch) applies to signed `cc0f85c5`; the editor-only patch and the round-one component patches also survive. The new combination passes the focused editor/workspace/equality/pending checks and TypeScript. All timing sessions close their browser context, browser and loopback server. No new allocation or CPU profiling campaign ran in round two.

Next profile this selected combination to locate its remaining dominant document/history/comparison and rendering work, then take one more bounded optimization decision using focused checks and a serial common screen. A selected RC still needs native composition/refusal/pending/remote coverage, scratch ownership/lifetime and memory checks, appropriate integration controls, and the unchanged application-latency gate. Removing redundant editor update notifications is intentional; extension behavior must be reviewed before promotion. Avoid repeatedly running the entire release graph per prototype.

Rust/Wasm is a possible later engine migration, not a prerequisite to the next increment. This repository already uses Rust/Wasm for synchronous journal encryption. Moving the current Yjs/history workload would be a substantial data-engine and integration change, though it need not replace the whole UI. Small ports that repeatedly copy JS objects/strings may lose their benefit at the boundary; Yrs/ywasm is a starting point, not proof that our history/pending/recovery behavior is interchangeable. [Project-specific assessment and primary references](./performance-experiments/2026-09-15-f17-r2/wasm-assessment.md).

## Release checkpoint

F-17 remains partial. The latest unchanged application-gate observation remains **12.2/75.1 ms desktop/CPU4 card p95**, with Android focus **54.2 ms**; these separate gate measurements are not directly comparable with the exploratory screen. Local and Account retain the reference by default. No personal app/server/phone/relay/deployment operation occurs.

The manifest still has **618 obligations**; the general set remains **263 files /2,121 dispositions (11 not applicable)**. Unresolved adapter obligations remain **0 test-file /96 command /63 campaign**. The immutable aggregate has not run. Wrapper certification, host-Python input binding, recorded timing/owner/oracle observations, R-04/P-06 and the later private Account/human milestones remain ahead. All 96 prior packet files, 52 personal/package/vector pins and the L-2 suffix are checked unchanged; append-only records retain their signed prefixes. This round's report/packet records the work following the signed round-one checkpoint.
