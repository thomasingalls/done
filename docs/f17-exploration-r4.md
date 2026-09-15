# F-17 exploration round 4 — shared UI card lookup

2026-09-15. The preceding primitive value-string phase is committed and signature-verified as **`55ab217e4552acfece4bea41e56a2feba5506aef`**. This round implements and tests shared UI card indexing. Preserve it as an optional experimental component, but keep round three as the selected baseline: the ordinary later median improves **2.7%**, while early p95 worsens **8.0% in both pairs**. The result is mixed.

All **six timing sessions /480 measured keys**, **49 focused cases**, TypeScript and two deliberate fault controls complete with the expected outcomes. Main runtime/tests/defaults and release counts remain unchanged. [Protocol, patches, raw samples and logs](./performance-experiments/2026-09-15-f17-r4/README.md).

## Candidate and boundary

The candidate builds a lookup over `snapshot.cards` in `WorkspaceUiProvider`, memoized by the detached cards array, and shares a lookup closure with the nine mounted Collections. Collections resolve their current section IDs through that closure instead of independently constructing a full-card Map. Direct construction also avoids the intermediate key/value tuples. Only `workspaceUi.tsx` and `Collection.tsx` change at runtime relative to round three's selected combination.

Every authoritative `workspace.read()` still runs. Fresh card arrays rebuild the lookup; status/error renders may reuse it. Card replacement, last-ID-wins behavior, missing-ID filtering, section order and current callbacks remain. The mutable Map is private to its lookup closure, and older closures keep their own detached records. Collection actions, archive rendering and Next capacity use the current snapshot. No canonical-object cache, membership shortcut, broad component comparator, CRDT or storage change is introduced.

Both builds use the actual React Compiler configuration and identical build-only Local snapshot activation. Source maps confirm that the full-card Map construction site is absent from the candidate Collection and present in its provider memo. These are static code sites, not measured runtime construction counts. React can retry renders or discard memoized values; correctness does not require exactly one construction. The lookup adds retained indexing state to the existing UI snapshot lifetime. No CPU, allocation or retained-heap profile runs this round, so a reduction in GC time or heap use is not established.

## Focused checks

Seven new component cases pass, including **50 deterministic generated publication histories** (seed 170409). They mount the real provider, Collection, reorder hook and archive renderer with controlled workspace reads/publications and mocked Card/Compose leaf ports. Checks cover fresh reads, same-ID replacement, Unicode, duplicate card IDs, order/add/remove/movement, missing IDs, status/error/retry/discard, current action destinations and Next capacity, archive independence, read failure/recovery, workspace replacement and subscription teardown. Generated observations compare actual rendered collections and shared lookups with a native Map oracle.

Six affected test files add **42 passing cases** covering card commands, Goals, reorder, unfiled rendering, editor projection and pending projection. Thus this increment has **49 unique focused cases across seven files**, plus TypeScript and scoped formatting. The restored new file is run once more after fault controls; that repeat does not add unique cases. Prior core evidence is linked through the unchanged selected core bytes, not represented as a new full-suite pass.

Two deliberate faults are caught: a stale memo dependency fails five of seven cases; a wrong-key lookup fails all seven. Both also produce generated counterexamples. Exact candidate bytes are restored before the final check and build. There are no observed candidate correctness failures. An initial unavailable-formatter command and a premature analysis invocation while the Unicode result was still being written are retained as tooling/orchestration errors. Neither causes a discarded or repeated timing session.

These controls do not constitute native drag/IME/pending/remote or Account qualification. The browser screen checks actual editor typing, undo/redo and persistence, while broader behavior remains ahead of RC entry.

## Application comparison

The unchanged common screen uses the full 20-day ×15-card /400-Goals-line corpus and an extra edited card. Each fresh session UI-seeds and cold-reopens the corpus, asserts its marker and requested emoji condition, then runs 8 warmups, 40 early measured keys, 96 additional warmups and 40 later keys. Requested key gaps are 50 ms. Chromium 151.0.7922.34, Pixel 7 settings, 1280×900 viewport and CPU4 after unthrottled setup match the prior screen. Builds/tests are serialized against timing.

The ordinary order is selected/candidate/candidate/selected, followed by a separate selected/candidate Unicode pair. Exact text after both blocks, bounded undo/redo and exact edited-card cold reopen are required. Session medians are primary; p95 from 40 keys/block is secondary. Keys within a session are dependent. “Later” means later typing, not independently counted history depth. The fixed corpus, small session count, proxy-paint measurement, and host/JIT/GC variation limit inference. No significance, population confidence or broad multilingual effect is claimed. Cross-round absolute timings are not a concurrent comparison, and gains must not be added to prior percentages.

| Ordinary-text variant | Early median | Later median | Early p95 | Later p95 |
| --- | ---: | ---: | ---: | ---: |
| R3 selected combination | 50.25 | 51.30 | 56.05 | 59.00 |
| Plus shared UI card lookup | 50.10 | 49.90 | 60.55 | 56.05 |

Milliseconds; each cell summarizes two session statistics. Paired ratios give **0.3% early /2.7% later median gains**, **8.0% early p95 worsening /4.9% later p95 improvement**. Individual early median comparisons have opposite signs. Both later median and p95 comparisons favor the candidate, while both early p95 comparisons worsen by about 8%. The latter is a reason to defer selection; this small campaign does not establish a causal population regression.

The single explicit-Unicode pair passes. Early/later medians change **50.5→49.4 /50.4→50.3 ms**; p95 changes **55.4→54.2 /55.5→59.7 ms**. That is also mixed, with later p95 worsening 7.6%. All six sessions pass every correctness and closure check. The 480 measured and 624 warmup keys survive with no discarded or repeated screen session. The analysis error is from invoking the all-session helper before the Unicode output existed; final analysis succeeds after completion.

## Decision and next phase

Retain the [UI-only patch](./performance-experiments/2026-09-15-f17-r4/ui-index.patch), the [complete combination including it](./performance-experiments/2026-09-15-f17-r4/candidate.patch), and all observations. Keep **round three's preparation + pool + editor + primitive value-string combination** as the selected baseline for the next experiment. Its patch applies unchanged above signed `55ab217e`. The shared index remains an optional component, alongside the separately parked publication cache; neither is included in that baseline.

This decision preserves incremental work without treating removal of repeated source work as a general end-to-end speedup. The issue is the mixed tail result, not the size of the possible gain. A later composition experiment can revisit this low-complexity patch when there is new evidence to do so. No additional run is added now to chase a favorable outcome. [Recorded decision](./performance-experiments/2026-09-15-f17-r4/comparison-decision.md).

Next refresh two CPU/allocation profiles of the retained combination on the same full corpus, then choose a narrow repair in the remaining complete-comparison byte loop, document/history allocation or membership repair. The previous profiles predate primitive value-string reuse; they cannot establish the current ordering of these costs. Keep full normalization/comparison and ownership requirements. Use focused checks and the common short screen for the next candidate. Native composition/refusal/pending/remote, private-codec/version, scratch lifetime/memory, appropriate integration controls and the unchanged application-latency gate remain ahead of RC entry.

## Records and release position

F-17 remains partial. Default Local and Account retain the reference. The latest actual application gate stays **12.2/75.1 ms desktop/CPU4 card p95**, with Android focus **54.2 ms**. Its separate workload/measurement protocol makes those observations unsuitable for a direct numerical comparison with this screen. No new budget pass is claimed.

The manifest remains **618 obligations**; the general set remains **263 files /2,121 dispositions (11 not applicable)**. Unresolved adapter rows remain **0 test-file /96 command /63 campaign**. Experimental tests live in retained patches, not new release adapters. No immutable aggregate runs. Remaining wrapper certification, host-Python input binding, recorded timing/owner/oracle observations and R-04/P-06 still precede the later private Account and human milestones.

The previous packet's 74 file identities, 52 personal/package/vector pins, L-2 suffix and signed append-only prefixes are checked unchanged. Main runtime/tests, personal app/server, phone, relay and deployment remain untouched. The new evidence and checkpoint following signed `55ab217e` are preserved with this phase.
