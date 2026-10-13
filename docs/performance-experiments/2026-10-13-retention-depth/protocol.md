# Authenticated local retention: history-depth protocol

Written before measurements, on signed `354c9c59`. Bounded development evidence, not release
qualification. No runtime changes, public conversion, deployment, or automatic retention cadence.
Only disposable synthetic copies may be reduced.

## Decision and questions

Determine whether the private reduced owner removes retired protocol history from cold and warm
work, and identify any remaining depth-dependent cost before reader-first publication planning.
Preserve complete authority checks, authenticated counters, journal fencing, caller isolation,
normal audit policy and undo. Do not disable these to obtain a timing result.

## Design, estimands and units

Paired, within-fixture native Chromium benchmark. Four received-history depths: 1, 129, 601 and
1,201 accepted positions (0, 128, 600 and 1,200 redundant positions beyond the initial workspace).
Each extra position has its own encrypted envelope, acceptance chain and signed receipt, but
contains an already covered small update. Thus the exact Yjs state, visible workspace and pending
suffix are identical across depths. The synthetic workspace contains 120 cards and approximately
12 KB of Goals; measure and report its actual snapshot size. This isolates protocol-history cost;
it does not model growth of the Yjs struct/tombstone history or admission of novel remote text.

At each depth, copy the closed complete fixture. In another disposable copy, invoke the real
private atomic removal API once, check unchanged content and zero physical prefix rows, and save
that closed reduced fixture. No direct row deletions or alternate readers. Start every measured
replicate from the saved complete or reduced state in a new context; do not reuse a warm owner.

Primary outcome: native owner cold-open elapsed time and physical rows/bytes loaded. Primary
estimand: paired reduced-minus-complete contrast at each depth and change with retired depth.
Secondary: post-GC heap, five warm status reads, one local edit/flush/publication, a bounded receive
suffix, first reduction cost/long tasks, and a second reduction after suffix operations. Record work
counters, WebCrypto calls and long tasks, so elapsed-time changes cannot hide skipped verification.
The native seam does not include the packaged application UI, platform credential interaction or
key-to-visible-frame latency. Check the retained real 600-position packaged fixture separately if
it remains reproducible; label any different fixture and scope rather than pool results.

## Sampling, order and analysis

One feasibility pilot at the shallowest depth, excluded from timing summaries. Then three paired
replicates per depth, complete/reduced order alternating by depth and replicate. Reuse the same
signed source throughout. Collect a final shallow pair as a drift anchor. Report per-replicate
values, medians, ranges, paired ratios and work counts; no p-values or population/phone claims.
Replicates share one machine and synthetic account and are not independent users. Three repeats
are a feasibility budget, not a power calculation; they only resolve large structural changes.
A final anchor changing over 20% from the initial shallow median makes timing contrasts tentative.
Retain failures and exclusions with reasons. Never silently replace a failed sample.

## Predictions and decision rules

Before measuring: complete cold verification should grow with position count; reduced physical
row loads should depend on the fixed suffix, not retired positions. With a fixed snapshot and
terminal evidence, reduced cold work and heap should be approximately flat (allow integer field
length changes). Warm unchanged reads should make no full baseline replays after opening. Local
publication and receive should extend the baseline incrementally while still performing fresh
authority checks. A depth-dependent full replay or growing retained memory is a follow-up defect
or architectural limit, not an invitation to weaken checks.

A correctness failure stops that arm and is recorded. Investigate probe mistakes first; runtime
repairs need a separate bounded scope. Per-operation timeout 120 s; stop a cell if it exceeds that,
record it as censored/failure, and do not claim a successful latency. Initial fixture construction
has a 15-minute ceiling. Do not run an exhaustive matrix, qualification, or a mutation campaign.

## Guardrails and threats

Compare exact snapshot digests at fixture boundaries; test journal-before-apply, undo/redo and cold
recovery of a later local edit. Real IndexedDB, WebCrypto, exclusive owner and protocol verification
remain in use. Synthetic service signatures and test passkeys are isolated from user data.

Host VM activity, thermal/JIT/GC variation and timer scheduling remain confounders. Run one browser
benchmark at a time, record host load, avoid overlapping builds/tests, and do not infer phone or
release-budget compliance. Instrumentation overhead is common to both arms. Duplicate covered
updates deliberately omit the cost of novel text; the real received fixture is a separate check.
A reduced snapshot still contains CRDT history and retained proofs, so this study cannot establish
constant cost under arbitrary workspace or membership growth.

## Runbook and evidence

Store the probe, protocol, numeric samples, summaries, tool versions, source/bundle hashes and
commands in this packet. Keep disposable credential-bearing storage/service fixtures outside Git.
Use loopback-only fixture services. Retain compact diagnostic artifacts, not redundant builds.
Update the checkpoint with measured scope, failures, limits and the next bounded step.

## Feasibility amendment, before timing series

The native fixture is a single-publisher Account. Its historical manual receive harness can replay
self receipts, but the actual composed owner correctly refuses a fabricated self position absent
from its outbound spool. Pilot 4 demonstrated that boundary; do not bypass it or manufacture a
second certified member. Amend the native series to **own accepted positions** built through real
text admission, journal flush, envelope/submission and authenticated acceptance. Replace the first
character alternately, maintaining identical visible Goals (~12 KB) and two fixture cards. Each
depth pair has identical exact snapshot and empty pending suffix; across depths, Yjs tombstones
and client state can grow and snapshot bytes must be reported. The native series therefore measures
removing protocol history conditional on the CRDT history at that depth, not a fixed-state slope.
The retained 120-card/600-received-position packaged fixture supplies the separate realistic,
receive-heavy check. No synthetic received throughput claim will be made from the native series.

The service response oracle signs genuine synthetic acceptance chains independently with Node
crypto, as in the existing native tests. It avoids exhausting the unrelated service HTTP budget.
The measured client still seals and signs submissions, checks fresh authority, and authenticates
and durably stores the response. Measure an explicit publication and a second cut after a fixed
local edit/undo/redo suffix; these replace the proposed native eight-position receive suffix.

## Packaged received-history check, specified before its build/run

Use the retained `done-warm-publish-f516a958/deep-receive/deep-received-fixture.json` disposable
joined-device fixture. Clone its service state and browser storage. One private real-owner cut
creates the reduced comparator; keep all source fixtures unchanged. Three complete/reduced pairs,
order C/R then R/C then C/R. Measure first completed editor frame on offline unlock, work counts,
WebCrypto calls and post-GC heap. Confirm identical full Markdown archives. Afterwards exercise
120 card keystrokes at CPU-4x and 150 ms gaps with the real online scheduler and a silent peer,
undo/redo and offline reopen. This is a small functional timing check, not a well-powered typing
p95 estimate or a catch-up-while-typing condition. The key observer times handler-to-next-frame,
not hardware-input delay or assured visible-text completion. Do not compare it to a 16 ms target.
Keep network-state changes from one replicate out of the next by restoring its service snapshot.
Stop on failure; preserve partial cold results rather than continuing a broken online path.

## Diagnostic counter interpretation

`authorityChecks` counts calls to the receive owner's instrumented `assertCurrent`, not every
custody/lifetime check in the application. Native unchanged `deliveryStatus` on an intact carrier
can report zero there; reduced storage invokes that receive-owner callback while reconstructing
its baseline context. Do not interpret the raw count as a complete census of authority enforcement
or assert that both arms must emit that counter. Preserve the unchanged runtime and report the
counter's scope. The initial analysis script incorrectly asserted a positive value in both arms;
that assertion is narrowed to reduced-baseline continuation. No measurement or runtime code was
changed to make it pass.

## Exploratory first-cut profile

After the completed timing series showed a 14-second first cut at 1,201 own positions and a
3.1-second cut on the packaged received fixture, take one CPU profile of the latter cut only.
Reuse the same packaged bundle and untouched source fixture in a fresh service/browser copy.
Do not pool that profiled cut with unprofiled timings; use it only to locate the next repair.
No runtime edits follow automatically from this measurement task.
