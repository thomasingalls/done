# F-17 application growth diagnostic

**The larger workspace is the clearest cost in this experiment.** Doubling seeded cards from 300 to 600 increases paired deep-block medians by **59.3% with history retained /45.2% with history cleared**. Clearing history has a modest benefit at 600 cards and mixed results at 300. This supports prioritizing whole-document work; it does not establish that history copying is free or predict the speedup from persistent buffers.

All **eight main sessions /1,280 measured keys** pass exact text, actual history-depth checks, one-key undo/redo and cold reopen, with context/browser/server and owned process groups drained. Two native smoke branches, six focused hook cases and both discriminating faults pass in their intended roles. The original setup failure and its distinct passing reproduction remain preserved.

2026-09-15, following signed and signature-verified `ac0b84ce`. This is the first bounded phase of the adopted architectural plan: measure workspace and retained-history costs, then address membership repair and publication separately, followed by persistent text-history buffers with full verification and a separate incremental-verification decision. The selected R3 optimizations remain fixed; UI indexing and publication caching remain optional patches.

[Protocol, source, raw results and audit](./performance-experiments/2026-09-15-f17-growth-r1/README.md). Main runtime/tests/defaults and release counts remain unchanged. This is diagnostic evidence, not a release receipt or a strict complexity proof.

## What this comparison separates

Eight fresh encrypted Local sessions cross 300/600 seeded cards with retained/cleared runtime history, in two opposite-order blocks. Both sizes use 15 cards/day and 400 seeded Goals lines, plus the same marked emoji-bearing edited card. Each session reaches 1,000 trusted editor keystrokes before the history intervention. The larger size changes both cards and days; it is a corpus-size contrast, not a separate estimate of each dimension.

A build-only hook calls the real UndoManager.clear() in the clear condition. It checks identical canonical bytes, history-document bytes, content, selection, group, writer and revision before/after, plus complete canonical/projection agreement. Only undo/redo and their range count may change. The hook returns copied facts and hashes; no document, history or key reference escapes. It is absent from the normal application and makes no claim that clearing a user's history is an acceptable optimization.

Clearing keeps the same document within that session and removes retained runtime history. The comparison estimates the total history-retention effect, including copying and any GC consequences; it does not isolate one function. The two conditions use separate fresh sessions with different random IDs. Growth within a retained session also lengthens the edited card, so early/deep comparisons alone cannot identify undo cost.

## Measurement and checks

The compiled app includes the exact R3 selected patch and identical build-only Local snapshot activation plus diagnostic hook. Pinned Chromium 151 uses Pixel 7 settings, 1280×900 viewport and CPU4 for measurement. The existing trusted-keydown → requestAnimationFrame → queued-task recorder is byte-identical to R4. It is a paint proxy; no control p95 is subtracted from it.

Each session has 8 warmup and 80 early measured keys, then 912 additional trusted editor keys to build history unthrottled. After the retain/clear intervention, 8 warmup and 80 deep keys run at CPU4. Measured keys use 50 ms requested gaps. The accelerated setup includes bounded exact-text settlement between 100-key bursts. It does not reproduce sustained CPU4 loading, natural typing, thermal behavior or handset responsiveness. Census, digest, full-match and durability checks run outside the measured loops; no CPU/allocation profile or forced GC runs during timing.

Initial cold-corpus checks verify each day's card count and card-15 marker, plus the seeded Goals line count. Final cold reopen compares the complete edited-card text. The history-clear guard separately compares the full visible snapshot and both document encodings before/after its intervention.

Six focused real-Yjs hook checks pass, including no-op-clear and content-mutation controls that must refuse. Two small native smoke sessions pass both intervention branches, one-key undo/redo and cold reopen. These controls are about the diagnostic; no broad product suite or release gate is rerun.

The first full attempt stops during accelerated setup because an immediate text read is short. Its 80 early samples and original source/protocol/log/result remain. A distinct full-size reproduction waits for exact text and reaches 1,002 undo groups, then passes undo/redo and reopen. Its longest observed delayed-visibility settlement is 548.6 ms; the DOM status observation does not identify a particular internal queue cause. There is no observed lost-input result after settlement in that reproduction.

Before campaign-v2, the protocol changes only the untimed checkpoint to a 3,000 ms bounded exact-text wait, recording immediate lengths and wait duration. All eight factorial cells restart under new identities. Original attempt, reproduction and smoke observations remain separate from the main comparison. No product deadline or measured cadence changes, and no valid slow timing is discarded.

## Observed application latency

| Seeded cards | Runtime history before deep warmup | Early median | Deep median | Deep p95 |
| --- | --- | ---: | ---: | ---: |
| 300 | Retain 1,002 groups | 47.95 | 49.60 | 53.40 |
| 300 | Clear to 0 groups | 49.35 | 51.80 | 66.30 |
| 600 | Retain 1,002 groups | 76.15 | 79.00 | 85.60 |
| 600 | Clear to 0 groups | 74.95 | 75.05 | 82.00 |

Milliseconds; cells are medians of two session statistics. The conclusions use paired ratios, not ratios of rounded table values. Early samples cover 10–90 undo groups in every condition. Deep samples cover 1,010–1,090 retained groups or 8–88 after clearing. Every diagnostic key contributes exactly one group.

All four individual 600/300 median comparisons increase: by 60.4%/58.2% with history retained and 35.9%/54.5% with history cleared. At 600 cards, retained/cleared median ratios are 1.070 and 1.036; at 300 they are 0.907 and 1.012, with opposite signs. Both 300-card cleared p95 observations are higher, so the smaller-workspace tail does not support a general benefit from clearing. Small session counts and frame-sensitive measurements limit causal interpretation.

The actual integrated struct counts are **2,797 at 301 total cards /5,577 at 601 total cards**. Those counts remain constant from early to deep in each session; encoded history length grows by 1,001 bytes as the edited card grows. The retained sessions' early→deep median increases are 2.5–5.0%. These are selected-R3 observations, not a reproduction of the reviewer's reference-path growth numbers. They do not qualify substantially longer, many-target or deletion-heavy histories.

The main campaign includes 8,704 diagnostic keys: 1,280 measured and 7,424 untimed setup/warmup keys. The failed first attempt's 80 measured keys, reproduction's 160 and smokes' 32 are retained separately and excluded from the factorial analysis.

## Interpretation limits

Fresh sessions are analysis units; keys within sessions are dependent. Two repeats per condition and 80 keys per block provide descriptive engineering contrasts, not population confidence or precise tail estimates. Order reversal reduces but cannot remove host/JIT/GC drift. Scope is append typing into one emoji-bearing card with two selected text targets and about 1,000 retained groups. Many-target selection histories, extensive delete/undo/redo, pending remote state, Account workloads and longer sessions remain unqualified. No measured retained-heap or GC-time improvement is claimed.


## Disposition and next bounded phase

Continue the adopted sequence. **Next implement the conservative membership-repair eligibility experiment** in an isolated candidate. Skip the text command's one pre-repair scan only when the exact accepted projection is known repaired. Conservatively invalidate that fact on remote delivery before publication, retain repair when the basis is dirty, and preserve system-source capture and refusal/retry/discard behavior. [Static boundary and discriminating controls](./performance-experiments/2026-09-15-f17-growth-r1/next-repair-boundary.md).

Incremental publication follows as a separate phase. Persistent text-history buffers remain the larger subsequent experiment, initially keeping full verification. This history-clear control does **not** measure their potential benefit: they would also eliminate a document fork still performed in both arms here. Incremental verification's proof, native deletion-set scans and detection-policy change remain separate. Keep the existing R3 improvements and both optional patches.

No product repair/optimization, full-suite campaign, new CPU/allocation profile, phone run or application-gate rerun occurs. The setup correction changes only an untimed immediate-read assumption after a discriminating reproduction. [Disposition](./performance-experiments/2026-09-15-f17-growth-r1/decision.md).

## Records and release position

F-17 stays partial. Local and Account defaults retain the reference. The latest actual application gate remains **12.2/75.1 ms desktop/CPU4 card p95**, with Android focus **54.2 ms**; it has a separate protocol and is not directly comparable with this diagnostic. Manifest and adapters remain **618 obligations; 263 files /2,121 dispositions (11 not applicable); 0 test-file /96 command /63 campaign unresolved**. There is no immutable aggregate or added release receipt.

The signed base, measured source/bundle/helper identities, 66 files in the previous R4 packet, 52 personal/package/vector pins, root perspective, L-2 suffix and signed append-only prefixes verify unchanged. Main runtime/tests, personal app/server, phone, relay and deployment remain untouched. The new diagnostic, static prep and updated records are uncommitted.
