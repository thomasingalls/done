# F-17 exploration round 3 — primitive strings inside Yjs values

2026-09-15. The preceding round is committed and signature-verified as **`602e4ceead5698c0d70f70a3b4b7770779459351`**. This round profiles its selected preparation + comparison-pool + editor combination, then extends string reuse to top-level primitive strings stored as Yjs values. Retain that extension as the next experimental baseline: paired ordinary-text medians improve **12.7% early /13.7% later**, and p95 improves **29.7% /30.1%** over the exact previous combination.

All **six timing sessions /480 measured keys**, two separate diagnostic sessions, **134 focused cases**, TypeScript and two deliberate fault controls complete successfully in their intended roles. These are exploratory results. Main runtime/tests and product defaults remain unchanged. [Protocol, source patches, raw samples and logs](./performance-experiments/2026-09-15-f17-r3/README.md).

## What the profiles found

Both diagnostic sessions use the full 20-day ×15-card /400-Goals-line corpus, UI-seeded in disposable stores. After eight warmups, 60 keys run under simultaneous CPU and allocation sampling. The selected build, pinned Chromium 151, Pixel 7 browser settings, 1280×900 viewport and CPU4 match the subsequent comparison. Text, bounded undo/redo and cold reopen pass in both profiles.

| Diagnostic measure | Profile 0 | Profile 1 |
| --- | ---: | ---: |
| Dominant document-fork callsite, inclusive ms | 1,340 | 1,351 |
| Dominant complete-comparison callsite, inclusive ms | 999 | 996 |
| All `encodeInto` self samples, ms | 515 | 468 |
| Dominant membership-repair callsite, inclusive ms | 354 | 358 |
| Dominant Collection render callsite, inclusive ms | 133 | 131 |
| Sampled allocations, decimal MB | 225.3 | 223.8 |

Inclusive rows overlap their children and are not additive exclusive costs. These are sampled diagnostic observations across 60 keys, not uninstrumented timings or causal effects. Allocation estimates include collected objects, not just retained heap. This full corpus differs from round one's profiling scope; comparing their allocation totals would not establish a regression. Heap-before/after/lock observations and complete profiles are retained.

The major encoder ancestor chains pass through native `writeAny` during both document forking and complete comparison. The earlier optimization handles text/string fields but misses primitive strings stored as values, such as card IDs in arrays and metadata strings. That makes extending the existing mechanism a narrower target than replacing document construction or changing the comparison contract. The [target decision](./performance-experiments/2026-09-15-f17-r3/target-decision.md) precedes candidate timing.

## The candidate and its checks

Only `src/crdt/yjs.ts` changes at runtime relative to the prior selected combination. The owned history fork already has a private, synchronous stream of immutable strings. Eligible primitive `writeAny` strings now join it: primitive strings of at least 32 UTF-16 units with no surrogate units, using the same eligibility predicate as before. A reserved private marker tells the paired decoder to consume the next string. Complete consumption checks remain; non-owned forks, nested objects, other scalar types and binary detachment retain their existing handling.

The comparison encoder writes the pinned native primitive-string type tag, then uses the existing byte-position/string-field representation. This represents the complete native encoding, including type and field position. Full reconstruction/normalization, pending bytes/dependency bookkeeping and pool cleanup/reentry behavior remain. No state-vector-only, sampled-content or hash equality shortcut is introduced. The new private convention depends on the pinned Yjs/lib0 implementation; published wire encoding still uses the ordinary encoder.

Eight new focused cases include **150 deterministic generated differential cases** against native normalization. They cover interleaved text/value strings, native V1 export/replay, string/type/order differences at identical clocks, Unicode and lone-surrogate equivalence, FEFF, split items, pending dependencies/delete bytes, nested binary detachment, boxed/nonplain runtime values, reentry and exception cleanup. Existing workspace, comparison, preparation, selection-history and pending-projection regressions add **126 passing cases across five files**. TypeScript and scoped formatting pass.

Two deliberate faults are detected: changing the fork marker breaks decoding, and omitting comparison string content produces false equality caught by directed and generated controls. The reduced generated failure and complete logs survive. Exact candidate runtime bytes are restored before build; the new test file passes again after restoration and formatting.

The initial new-test run had one fixture failure: public Y.Array insertion rejects `undefined` before either codec runs. The corrected fixture inserts an allowed placeholder and changes its pinned runtime ContentAny value, preserving the intended native-codec fallback check. This required no candidate implementation repair. The original failure and initial formatting failure remain in the packet.

## Paired application comparison

Four fresh, uninstrumented ordinary-text sessions run selected/candidate/candidate/selected. Each has eight warmups, 40 early measured keys, 96 additional warmups and 40 later measured keys, with 50 ms requested gaps. Marker and requested emoji condition are asserted before timing. All exact text, undo/redo and edited-card cold-reopen checks pass. Browser contexts, browsers and loopback servers close after every session; builds/tests do not overlap timing.

| Ordinary-text variant | Early median | Later median | Early p95 | Later p95 |
| --- | ---: | ---: | ---: | ---: |
| Previous selected combination | 53.90 | 55.55 | 72.85 | 74.40 |
| Plus primitive value-string reuse | 47.05 | 47.95 | 51.20 | 52.00 |

Milliseconds; cells summarize the two session statistics. Decisions use the retained paired ratios: **12.7% /13.7% median gain**, **29.7% /30.1% p95 gain**, early/later respectively. Every individual median and p95 comparison favors the candidate. These gains are conditional on the existing combination and must not be added to earlier rounds' percentages.

The separate single Unicode pair also passes. Early medians are **53.8→49.6 ms**, later **54.3→48.3 ms** (7.8% /11.0% gains); p95 is **66.0→61.3 ms** and **73.3→55.7 ms**. That pair checks the edited-card emoji condition in one fixed order; primitive value-string Unicode semantics are also exercised by the focused differential tests. It does not establish broad multilingual performance.

Fresh sessions are the analysis units; repeated keys within sessions are dependent. “Later” means later typing, not independently counted undo depth. With two ordinary pairs and only 40 samples per block, p95 precision and population generalization remain limited. Reversed order reduces drift but cannot remove host/JIT/GC variation. No candidate allocation/CPU profile ran, so the p95 improvement cannot be attributed to a measured GC-time or retained-heap reduction. The six timing sessions contribute 480 measurements and 624 warmup keys; the two 60-key diagnostic sequences stay separate.

## Decision and next phase

Keep the [complete candidate patch](./performance-experiments/2026-09-15-f17-r3/candidate.patch) as the experimental combination above signed `602e4cee`. The patch includes the prior preparation, pool and editor changes; the agent's smaller delta and exact pre-candidate source also survive. Publication caching remains parked with its earlier evidence intact. No RC/default activation occurs.

Next build **one shared UI card lookup per detached workspace snapshot** and reuse it across the nine mounted Collections. Read-only inspection confirms their repeated full-card index construction remains in the emitted React Compiler build; not every source-level allocation does. Keep each authoritative `workspace.read()` fresh and preserve collection order, membership, callbacks, editing and status behavior. Its remaining magnitude after this round's improvement is not measured, so use another focused paired screen. Membership repair, byte comparison and broader context memoization remain separate opportunities.

The selected RC still needs native composition/refusal/pending/remote behavior, private-codec/version and scratch-lifetime/memory qualification, appropriate integration controls, and the unchanged application-latency gate. F-17 remains partial; the latest actual gate stays **12.2/75.1 ms desktop/CPU4 card p95**, with Android focus **54.2 ms**. Those separate gate observations are not directly comparable with this screen.

## Records and release position

The manifest remains **618 obligations**; the general set remains **263 files /2,121 dispositions (11 not applicable)**. Unresolved adapter obligations remain **0 test-file /96 command /63 campaign**. These experiments add no release receipts or resolved adapter rows. The immutable aggregate and remaining wrapper/input/owner/oracle/R-04/P-06 work precede the later private Account and human milestones.

All 71 files in the previous packet, 52 personal/package/vector pins, the L-2 suffix and signed append-only record prefixes are checked unchanged. Main runtime/tests, personal app/server, phone, relay and deployment remain untouched. This experiment packet and checkpoint record the work following the signed round-two commit.
