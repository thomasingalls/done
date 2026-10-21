# Publisher-scoped snapshot-race invalidation

2026-10-21 · bounded repair · unsigned sequential patch05 after immutable01→04.

## Outcome and contract

A same-connection publisher fingerprint race now discards only that publisher's preliminary owner,
tip and queued audit. Unchanged publishers still pass their own fresh transaction-time full header,
row-count and served-row fingerprint check. The identity map holds at most128 keys with LRU eviction;
unique object identities fence captures, delayed remember and active audit completion across eviction,
invalidation and key recreation. Global data_version/explicit clear/close/applicable audit failure
fences and quarantine remain. No wire/storage format, authority/signature/custody/grant/expiry check,
rate, burst, concurrency, work, body, retry or deadline change. Shipped refill stays16/session,64/process.

Six new cases reproduce the old cross-publisher failure and cover stale memo, external/global clears,
eviction/recreation, active/queued audits and quarantine. All114 affected native/protocol/budget cases
pass, including those six. Six guard-removal controls fail at intended independent assertions. This
is a bounded correctness repair; original full mixed contention still fails, so capacity remains open.

## Native evidence: every predeclared run retained

Six genuine hot sessions each request256 positions from the same1024-position seed. Hot writes are
offered every500ms, unrelated writes1000ms, unrelated reads250ms. Scoped grants and independent original
wire/page proofs are unchanged. Reference and candidate source differ only in publisherTips.ts.
The raw probe aborts on409, retaining existing429 waits,10s HTTP/120s replay/1GiB sampled RSS bounds.
Whole restored runs are units; requests and positions are dependent. No synthetic409 continuation.

| Fixed order / workload | Outcome | Verified read positions | Hot / other writes verified | Elapsed |
| --- | --- | ---: | ---: | ---: |
| Pair1 reference, all traffic | failed409 | 0 | 0 / 5 | 6.039s |
| Pair1 candidate, all traffic | failed409 | 545 | 24 / 12 | 15.139s |
| Pair2 candidate, all traffic | failed409 | 554 | 27 / 13 | 15.148s |
| Pair2 reference, all traffic | failed409 | 0 | 0 / 5 | 6.003s |
| Candidate, unrelated writer+reader, no hot writer | passed | 1536 | 0 / 20 | 21.003s |
| Candidate, both writers, no unrelated reader | failed409 | 505 | 14 / 7 | 10.647s |

The passing discriminator finishes replay at20.166s with100429 responses (including repeats).
Five raw failures remain failures, not fast completed operations or proof of indefinite starvation.
Time to refusal cannot establish a throughput improvement. The repaired full mixed arms make useful
progress but do not meet completion. Same-publisher contention remains an acceptance blocker before
rate/capacity promotion. Independent read-only cold SQL verifies every actual stored seed and new
wire, original accepted proof, position and prefix in all six runs, including failures/unacknowledged
writes; no offered/queued write is promoted to success. Raw CPU/RSS and schedules remain in runs/native.

## Actual client continuation

Exact patch02 packaged client build (110 files) and the same encrypted121-card/13,000-character Goals,
600-position backlog are restored into two disposable Chromium contexts. Source selection, cwd and
remote-batch injection proxy hash are checked before each invocation; no source observer is installed.

| Journey | Catch-up | Result |
| --- | ---: | --- |
| Natural | 33.768s | passed |
| Three bounded duplicate reads per receiver request | 152.792s | passed |
| Duplicate pressure + one remote-batch and one submit409 | 158.162s | passed |

All complete exports are byte-identical, and both-way writing, Undo/Redo and locked offline document
reopening pass. Original600s catch-up/30s writing guards stay. The explicit remote batch contains only
remote inner reads; next automatic attempt succeeds with nonempty pages after1136ms. The refused pending
submit is accepted for identical body bytes after1038ms. Both refused bodies were available to CDP and
agree with the known pre-forward proxy injection. No manual Retry/reload/wake creates recovery. No
natural browser state-changed refusal is observed; injected behavior does not estimate its frequency.
Duplicate reads share one device session; this is functional continuation, not six independent
installations, production throughput, safe-policy selection or a matched browser speed estimate.

## Retained failures and corrections

- The old source fails the new unchanged-capture regression at the intended assertion.
- First repaired publisher run passes19/20: its new external-commit fixture used a SQLite no-op UPDATE.
  A separate probe confirms data_version1→1 for the no-op and1→2 for an actual external schema commit.
  The corrected NEW control asserts the version change and equality of both publisher snapshots.
- First broader run has13 failures:12 sandbox localhost-listener refusals and one stale old mutation
  anchor. Elevated repeat has113/114. The anchor is absent already in patch04 and is retargeted to the
  current selectPublisher call around authority reuse, retaining that reuse, every assertion and deadline.
  Repaired repeat passes114/114. No old formatting-only patch is applied.
- The first independent planning auditor incorrectly expected the release selection to be unchanged.
  All878 old obligation rows and97 construction entries were already exact. The generator correctly
  adds the NEW blocked obligation to the release denominator. The corrected auditor checks this addition
  in both directions, every other selection/exclusion exact,879 obligations/335 unresolved. Keep the
  first failed audit and source; no planning gate was removed or relaxed to satisfy it.

- The first planning regression run passes108/109 and refuses a stale crypto source census.
  Independent comparison finds only three changed hashes (publisherTips and two patch02 receiver
  files) plus the new patch02 receivePageTransport source; all domain sites/non-source metadata are
  exact. Refresh these pins only, preserving every construction classification/contract and all tests.
  Preserve the failing run and census-review.json; all109 final planning regressions pass afterward.

- The first independent patch application is correctly rejected by exact tree comparison:
  global Git apply.whitespace=fix rewrites18 blank lines in archived reproduction scripts. No runtime
  or tests differ. Keep that artifact/tree discrepancy and repeat in a fresh isolated index using
  --whitespace=nowarn to preserve every evidence byte. The repaired packaging script and first receipt
  are retained; no source/evidence lines are stripped to accommodate the global setting.

## Identities, reproduction and limits

See protocol.md (chosen before repair), starting.json, source-identity.json (803 source files per arm),
identity.json (client/private-fixture hashes and closure), native-plan.json, browser-plan.json,
check receipts, omission-controls.json, planning-audit.json and verification.json. Reproduction source
is stored as text; private encrypted fixture JSON, SQLite files, browser storage, keys/codes and installed
packages stay outside this packet. The known-value privacy scan checks35 raw/escaped fixture values;
it is not a general secret detector. SHA256SUMS covers every packet artifact except itself.

Use the recorded Node24 runtime and unchanged private fixture recipe/paths from preceding packets.
Run native arms sequentially with api-load.mjs (LOAD_POSITIONS=256, LOAD_FIRST_WRITER/OTHER_WRITER/PEER,
LOAD_OUTPUT); its default four-run order is reference,candidate,candidate,reference. audit-api.mjs
independently checks each stopped service DB. run-browser.py restores each separate browser journey;
its frozen cwd must match SYNC_SOURCE. Run neither probes nor builds/validators concurrently with
measurements. Apply with git apply --index --whitespace=nowarn for byte-exact evidence. The current cumulative checkout already contains01→05; do not reapply patches over it.

No Firefox/Android/physical-phone/WAN, population confidence, optimal rate, maximum capacity,
absence-of-starvation, whole-process browser cold reopen, production adoption, full-suite or generalized
security/release qualification claim. General qualification stays paused. New regression execution
obligation remains blocked pending separate adapter review. No staging/signing/commit/push/preview8443
restart/merge/deployment; the other seat's progress.md and all prior patches/packets remain untouched.
