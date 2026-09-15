# F-17 incremental publication experiment

**Park this publication implementation and keep R3 + membership-repair eligibility as the selected
experimental combination.** The preceding repair phase is signed and signature-verified as
`e0a8726347b75d8c57a89afcbdf9ca34ed829b39`. This next isolated phase passes correctness controls,
but its fixed application screen is mixed early and slower in both later comparisons. The source,
new controls and every observation remain available. [Evidence packet](./performance-experiments/2026-09-15-f17-publication-r1/README.md).

## What the candidate changes

Only private Local selection-snapshot mode uses the new owner-private publication cache. It records
actual changed Yjs types during preparation, consumes that plan only at verified adoption and
refreshes existing changed card text or Goals. Structural, metadata, archive and unknown mutations,
missing/stale plans and normalized shape keys require the full reader. Remote delivery invalidates
before apply/publication. Refused or discarded work cannot update the published cache. The other
owner modes retain the full reader; default Local and Account activation remain unchanged.

Every public read remains a detached structured clone. The cache retains projected values and indexes,
not old documents, histories or byte leases. Header metadata is reread from each accepted candidate.
Because a fork can normalize text without a transaction, surrogate-bearing card/Goals/archive fields
are reread too. This includes valid displayed pairs that may span independently encoded Yjs items;
it avoids the older cache's blanket exclusion of emoji-bearing workspaces. Surrogate-bearing shape
keys or member IDs force full projection because normalization can change identity or order.

The controlled read-count test confirms that changing one card in an eight-card fixture reads that
card plus one unrelated sensitive card, with no further card-body reads on a repeated publication.
That is a bounded source-work check, not a measured application allocation count or complexity proof.
Output cloning still scales with snapshot size, sensitive refresh with the number of sensitive fields,
and header work with metadata size. This implements neither selective subscriptions nor stable public
snapshot identities. Full document verification, source capture and editing/selection/event behavior
remain. [Boundary review](./performance-experiments/2026-09-15-f17-publication-r1/implementation-review.md).

## Correctness evidence and defects found

Final affected checks pass **218 unique tests across 13 files**, including **nine new cases /60
generated differential histories**, TypeScript and scoped formatting. New histories compare complete
published projections after text, Goals, normalization, structural/unknown changes, undo/redo, no-ops
and abandoned drafts, while poisoning returned snapshots to check detachment. Existing owner tests
cover remote/pending/source/refusal/retry/discard/close behavior; the prior publication normalization
reproductions and 11 editor/IME controls remain. Three deliberately broken variants are caught by
designated assertions: omitted normalization refresh, ignored structural fallback and aliased output.
Original source identities are restored before builds.

A new regression exposed a real candidate defect: calling the existing history-clear diagnostic
without changing the content revision left the cache reporting undo count 1 instead of 0. Reads now
compare the two live stack lengths and refresh those scalar values, without a document scan. The
before-repair source, test and failing log remain. This was reproduced through the diagnostic seam;
it is not an observed production input-loss incident.

The first split-pair test also failed, but its setup had already normalized the text. Pinned Yjs
replaces surrogate halves when splitting an existing item. The corrected fixture creates adjacent
halves under distinct writer IDs, asserts the visible pair before fork, then checks normalized full
and cached projections. Both original setup evidence and correction remain. An unused test import
and a repeated editor run after restoring mutation controls are recorded separately. No timing
overlaps tests or builds. [Control findings](./performance-experiments/2026-09-15-f17-publication-r1/control-findings.md).

## Fixed application comparison

Both variants use the real React Compiler build with identical build-only Local snapshot activation.
The previous screen/recorder/measurement helpers remain byte-identical. Fresh Chromium 151 sessions
use Pixel 7 settings, 1280×900 viewport, 20 days ×15 seeded cards, 400 seeded Goals lines and a marked
edited card. CPU4 starts after setup. Eight warmups and 40 early measurements precede 96 more warmups
and 40 later measurements, requesting 50 ms between measured keys.

All **six sessions /480 measured keys /624 warmups** pass exact block text, bounded undo/redo,
the existing corpus checks, edited-card cold reopen and owned process drain. There are two ordinary
pairs in opposite order, followed by a separate selected/candidate Unicode guard. Every session and
sample is retained; none is resampled. Source, bundles and helpers retain all 416 frozen identities.

| Ordinary-text block | Selected median | Candidate median | Paired median regression | Paired p95 regression |
| --- | ---: | ---: | ---: | ---: |
| Early | 29.25 ms | 29.40 ms | 1.1% | 0.3% |
| Later | 27.25 ms | 30.60 ms | 12.3% | 18.2% |

Latency cells are medians of session statistics; percentages are median paired ratios. The ordinary
early median improves 9.0% in one pair and regresses 11.3% in the other. Later medians regress
3.7%/21.0%, with p95 regressions of 9.3%/27.1%. Unicode medians regress 8.2% early /1.3% later;
p95 regresses 15.7%/3.3%. [Raw results and analysis](./performance-experiments/2026-09-15-f17-publication-r1/analysis.json).

This small descriptive comparison does not establish a stable effect, population estimate or cause.
Keys are dependent, p95 has 40 samples per block and order reversal cannot eliminate host/JIT/GC
variation. The later block is not a verified deep-history stratum. The corpus helper checks counts,
per-day markers and Goals line count, not every byte; undo must change text and redo restore it,
not establish one-key depth. The recorder remains a paint proxy, without quantile subtraction.
There is no profile, GC/heap measurement, phone run, native Account campaign or full-gate rerun.

## Disposition and next boundary

Keep the candidate as an optional patch, including its useful correctness controls. These results
do not justify adding it to the selected combination or rejecting incremental publication generally.
Whole-snapshot cloning and cache/header maintenance remain possible costs, not measured explanations
for this result. A later attempt should address a specific remaining cost. [Decision](./performance-experiments/2026-09-15-f17-publication-r1/decision.md).

**Next: persistent text-history buffers on R3 + repair eligibility, retaining full verification.**
Define accepted/candidate ownership and reset/fallback behavior first, including refusal, retry,
discard, remote updates, undo/redo, structural commands, metadata and close. Incremental verification's
proof, hidden scans and failure-detection policy remain a separate phase. Native ownership/memory/
Account composition qualification and the unchanged application gate still precede RC entry.

Main runtime/tests/defaults remain unchanged. The last actual gate remains **12.2/75.1 ms
desktop/CPU4 card p95**, with Android focus **54.2 ms**; F-17 stays partial. Counts remain **618
obligations; 263 files /2,121 dispositions (11 not applicable); 0 test-file /96 command /63 campaign
unresolved**. No aggregate receipt or release-adapter credit is added.

The prior packet, 52 personal/package/vector pins, root perspective, signed append-only prefixes and
L-2 verify unchanged. Personal app/server, phone, relay and deployment remain untouched. This new
phase is uncommitted.
