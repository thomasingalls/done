# Phase13: duplicate batch admission and exact-word typing

The combined local candidate passes every prospective actual16/64 timing and data guard.
It prevents concurrent exact duplicates from spending extra native work and enables the
held V3 exact-word comparator. This is unsigned sequential patch13, not a release or rollout.

## Contract, decision and measurement

Read [protocol](protocol.md), [contract review](contract-review.md), [decision](decision.md)
and [summary](summary.json). The plan predates implementation/measurement. D16/64 is the
unchanged working policy; B32/128 is a separate temporary diagnostic and is not adopted.
[Source identity](source-identity.json) freezes R/C source and test/build inputs;
[browser identity](browser-identity.json) freezes artifacts/harness. Source closure803→804
includes runtime, build tools and40 packaged test helpers; crypto TS census399→400.

| Workload | Catch-up R→C seconds | Local input→DOM p95 R→C ms |
|---|---:|---:|
| D feedback1 |143.423→67.082|13.8→7.4|
| D feedback2, reversed |140.523→67.091|11.8→9.6|
| D ordinary |33.602→34.156|12.6→8.1|
| D independent4-read |51.363→51.475|13.0→4.8|
| D foreground |—|8.9→9.2|
| B diagnostic feedback |28.077→29.084|14.8→5.9|

Feedback catch-up improves53.23%/52.26%; reference drift2.06% is within15%.
Ordinary and independent catch-up are slightly slower, and foreground typing is roughly
unchanged. This does not establish universally faster sync/typing. Ordinary catch-up remains
about34seconds. All1440 new keys,60 foreground markers, whole exports, both-way writing,
Undo/Redo and locked offline reopening pass across12 journeys. The fixed-load control joins
the captured template hash to the actual browser wire body: exactly4 reads,72 offers,0 skips
per arm. Phase12's three-read limitation and all phase11 word-only failures remain preserved.

[Raw analysis](browser-analysis.json.gz), [independent review](evidence-review.json) and
[fixed run plan](browser-plan.json) retain every declared run with no retries. Per-key
observations are dependent; results are descriptive fixed local headless Chromium journeys,
not physical Android/Firefox, mobile input-to-paint, WAN, long-history or maximum-capacity proof.
No CPU profiler/capacity trace hooks are present. Foreground warmup is3s with30 isolated
markers then120 keys150ms; catch-up uses120 genuine keys150ms. All original deadlines remain.

## Repair and regression evidence

The scheduling collection borrows bounded immutable request buffers, matches exact bytes
within a service-held scope and only supplies refusal. Original admission cost remains,
extra reservation is skipped on overlap, started-work charging/refund is unchanged, and
all original authority/signature/native/proof/custody/freshness checks run for admitted work.
The original active bound and existing handler lifetime apply. There is no response cache,
new authorization, queue, fingerprint, persisted state, rate/refill/retry/deadline change.
The HTTP timeout still does not preempt a running native operation. Exact-word comparison
keeps scalar short/unaligned spans, every tail byte, metadata and cooperative checkpoints,
with no ownership/invalidation/erasure or verification-lease extension.

The original HTTP implementation fails the new duplicate test (`checks/http-before.log.gz`).
Five appended regressions pass and all original six case bodies/assertions remain AST-exact.
Six intentional omission variants fail their intended checks; source/logs and
[mutation summary](mutation-summary.json) remain. See [source challenge](source-challenge.json),
[build receipts](build-receipts.json), [post-browser checks](post-browser-checks.json),
[metadata review](metadata-review.json) and [planning receipt](planning-receipt.json).
50native,112word/ownership and105planning cases pass, as do matched R/C type/build/budget/
isolation checks and working type/lint/format. Build/test checks ran separately from browsers.
The planning log's filesystem bounds are explicitly not precise runner timestamps or timings.

All881 qualification rows,337 unresolved obligations,97 construction statuses, crypto domain
sites/contracts and registry classifications remain unchanged. The five new native cases
are in an already blocked file and receive no aggregate qualification credit. Root inventory
identities are regenerated for the reviewed source delta; no old census assertion needed editing.
[Identity review](identity.json) verifies the working sources exactly match tested C, numeric
policy remains16/64, all prior patch hashes and real index bytes remain unchanged, and no
staging occurred. Other-seat progress and deferred formatting remain untouched.

## Preserved material and reproduction

`runs/` contains compressed original12 run results, Playwright reports, invocation/service
logs and numeric Node monitors. `checks/` preserves passing checks, the original failed HTTP
counterexample and intentional omission failures. `reproduction/` includes exact handler/
helper/test sources, frozen browser harness, Bbudget source, scripts and omission variants.
Before/after sources plus original protocol, metadata failures before regeneration and every
measurement are retained; a later pass does not erase an earlier failure.

Scripts retain original absolute scratch paths and source/fixture dependencies; they are
reproduction records, not a portable one-command package. Use Node24.18.0 and pinned repo
dependencies, read the prospective protocol, prepare matched source closures, run baseline
HTTP reproduction then candidate checks/mutations/builds serially, run the fixed browser plan,
independently analyze/review, then regenerate metadata and preserve/check artifacts. Earlier
packet references supply heldV3 and the original synthetic fixture. Generate new disposable
credentials; private fixture data are deliberately excluded. Reproducing performance requires
matching machine/browser/flags and does not imply identical timings.

The packet uses an explicit numeric/source/hash whitelist and scans known fixture secrets
(raw and JSON-escaped) after decompression. No database/profile/storage, private credential,
unlock code or environment file is included. The scan is not universal DLP.
[Artifact provenance](artifact-provenance.json), [privacy audit](privacy-audit.json) and
[SHA256SUMS](SHA256SUMS) bind the preserved files. Sequential patch/commit instructions and
independent01→13 apply receipts live outside the packet to avoid circular hashes. No real
staging, signing, commit, push, preview8443 change, merge or deployment. General qualification
remains paused. Ordinary catch-up, representative devices/WAN and broader capacity remain open.
