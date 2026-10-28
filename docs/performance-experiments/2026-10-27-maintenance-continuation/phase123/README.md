# Phase123 — share first-conversion full verification

2026-10-27. Parent122. No computer use, signing, release preparation or deployment.

The predecessor replays the original history once for the reference and again inside the candidate
builder. A new witness-count discriminator observes2 calls instead of1 and fails. Corrupt-ciphertext
and valid-MAC/invalid-witness controls already refuse before candidate signing.

A paired builder now captures its own context/input, performs full verification internally, builds
and independently replays the compact candidate, and returns both owned reference/candidate results.
It never accepts a caller-supplied verified ledger. The first-conversion planner consumes both; the
existing standalone builder keeps its API and erases the unneeded reference. Failed construction
erases partial reference evidence. Existing v3/v4 predecessor comparisons and v5 rebase semantics
remain. There is no reusable cross-owner capability or persisted verification success flag.

The first draft moves full verification into candidate-refusal handling. A new deliberate failure
control demonstrates an inappropriate ineligible skip. That failing attempt is retained. The final
builder reports reference completion through a zero-argument internal stage boundary. The planner
propagates every earlier failure; only subsequent candidate capacity/ineligibility handling retains
its existing skip behavior. No mutable reference is exposed to a callback during construction.

Six new cases cover one full witness verification, ciphertext/witness rejection before signing,
reference-failure classification, detached input/reference/candidate ownership and authority loss
during candidate construction. All96 cases across the five affected suites pass. Initial test-only
Uint8Array generic typing fails; using the repository's Bytes type fixes it, and typecheck/lint pass.
The normal activated diagnostic build passes; its exact client hashes are retained.

The real service/crypto/native-IDB diagnostic converts57 v2 rows to v5, keeps exact writing and cold
reopens offline. It observes **1 full-history replay instead of2**, while retaining4 compact baseline
replays and2 complete baseline checks during conversion. Reduced reopening still performs2 full
baseline replays after122, with3 fresh native snapshots. Counts establish removed duplication;
no phone latency or first-conversion wall-time speedup is inferred from this small desktop fixture.

Original exact survivor projection/reference comparison, current authority/inventory binding,
nonce reservation, strict atomic replacement, authenticated readback and independent installed
replay are intact. No deletion set, accepted document, journal/undo, format or security policy changes.
Native failure/fence results and final ordinary bookkeeping follow separately in this packet.

The independent crypto join preserves410 sources/197 domain families and all site classifications;
only localBaselineReplay/localRetentionPlan source hashes change. The new required unit file remains
uncredited: manifest914 obligations/369 unresolved, retaining all913 prior obligations and blocks.
General qualification remains paused. No old test is edited. Next: bounded phase/counter progress
and restart observability, then resumable-preparation and automatic-service-maintenance contracts.

All21 existing native removal/failure cases pass again on this phase, without skips/retries.

The first ordinary pass correctly refuses four construction source-site line pins after the planner
edit. Independent comparison proves only line numbers moved: all sites, labels, roles, contracts,
statuses and existing qualification blocks are unchanged. Refresh only those four sourceSites
arrays, retain the failing receipt and recompile the unchanged obligation population.

All12 existing construction-registry negative controls pass after the four line-only pin updates.

Final13 ordinary checks pass with the reviewed construction line pins and complete evidence population.
