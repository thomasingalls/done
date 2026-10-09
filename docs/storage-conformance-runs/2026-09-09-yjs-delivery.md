# Yjs delivery order and pending handoff — execution evidence, 2026-09-09

Phase 2 is committed as **0399567**. Core repair phase 3 adds the [pinned Yjs repair and harness](../yjs-delivery.md)
and remains uncommitted. The two changes retain earlier cross-client wake-ups and drain newly parked
wake-ups that became ready during the current apply. Original record bytes, wire encoding, channel API,
strict runtime forks/projection checks and conservative compaction policy remain unchanged.

## Final executions

| Execution | Result | Evidence |
| --- | --- | --- |
| Native delivery/handoff | Eight cases; 100 generated channel histories, saved generated failure and one renderer death pass | [JSON](./2026-09-09-yjs-delivery.json) |
| Original-wire and handoff campaign | 50,000 original, 50,000 pending-handoff and 50,000 concurrent-handoff histories pass; all 5,040 saved-case orders pass | [JSON](./2026-09-09-delivery-ordering.json) |
| Earlier wake-up omitted | Exactly 78 of the saved case's 5,040 orders fail again | [JSON](./2026-09-09-delivery-order-control.json) |
| Pending donor JSON replay | Four additional snapshot hops, duplicate snapshot and later basis pass | [JSON](./2026-09-09-delivery-order-replay.json), [input](./2026-09-09-delivery-order-replay-input.json) |
| Saved native JSON replay | Previously failing owner handoff and human-only undo pass | [JSON](./2026-09-09-delivery-native-replay.json), [input](../../test/yjs-delivery/ready-wakeup.json) |
| Installation | Clean offline frozen-lockfile install; source/ESM/CJS hashes, four Yjs peer resolutions and both runtime regressions pass | [JSON](./2026-09-09-delivery-install.json) |

Chromium **151.0.7922.34**, Node **26.8.1**, macOS arm64. The clean install uses **pnpm 11.20.0** and
`--ignore-scripts`; no dependency version is upgraded. The patch updates source, ESM and CJS. Patched
distributions omit their upstream source-map references, so built application maps refer to the patched
distributions. The local patch is not an upstream-reviewed release. `yjs:check` runs before build and in
the check chain; `storage:delivery` adds the campaign and native suite after the projection suite.

The final native donor/receiver cases open both owners before the donor receives the pending originals,
then exercise initial snapshot and hello response over the actual scoped BroadcastChannel. A later
accepted update from the same sender is a FIFO processing sentinel. The donor closes before remaining
original basis delivery; receiver-local input survives and human Undo removes only that input. Separate
pending-deletion and pressure/abort/retry cases pass. Snapshot-only recovery uses a different browser
context, proves that the exact received snapshot is persisted without the donor's original records, kills
the renderer after a journalled local command, reopens and completes from the missing basis.

The Node campaign includes **30,016** pending-struct donors and **26,640** pending-deletion donors in its
handoff arm; its concurrent arm includes **37,062 / 32,726** respectively. These are generated counts,
not production prevalence. Every intermediate apply must leave no parked wake-up whose lower bound is
already satisfied. Concurrent authors synchronize between epochs, edit separate text roots, and share
an array and a map of nested objects. Independent string/token/object ledgers establish preservation;
this does not independently specify arbitrary same-position concurrent text ordering. Native generated
sources synchronize between edits and are a different alphabet. Native output flags describe the receiver's
pending state at join; directed cases separately record the donor before joining.

## Sensitivity and the defect found during this phase

| Native mutation | Required assertion | Evidence |
| --- | --- | --- |
| Forget earlier cross-client wake-up | `original-records-complete` | [JSON](./2026-09-09-delivery-missed-wakeup.json) |
| Do not drain a newly parked ready wake-up | `delivery-ticket-accepted` in the saved generated history | [JSON](./2026-09-09-delivery-park-ready-wakeup.json) |
| Omit pending structs from snapshots | `pending-structs-reach-joiner` | [JSON](./2026-09-09-delivery-drop-snapshot-pending.json) |
| Omit pending deletions from snapshots | `pending-deletions-reach-joiner` | [JSON](./2026-09-09-delivery-drop-snapshot-deletions.json) |
| Omit hello-response snapshot | `hello-snapshot-received` | [JSON](./2026-09-09-delivery-skip-hello-snapshot.json) |

All five are detected on frozen copies, at the named assertions. Unexpected exceptions and timeouts do
not count. The first candidate fixed the exhaustive seven-record case and passed 150,000 preliminary
histories. The native generator then failed at generated index **6**: canonical and history projections
had identical pending struct/deletion bytes and serialized state but different missing-clock maps. One
map retained a wake-up whose lower bound was already satisfied. The projection guard closed ordinary
access and retained durable data ([failure](./2026-09-09-delivery-ready-before.json),
[diagnostic capture](./2026-09-09-delivery-ready-diagnostic.json)). The final patch checks the merged pending
union, including a newly created union, for ready retries before returning. The strict projection guard
is preserved. The saved history and the second mutation pin this correction; the final 150,000-history
campaign also checks the intermediate ready-wakeup invariant. No native shrinking is claimed.

The first campaign generator split an emoji surrogate pair: its external expected string contained a
lone surrogate, while source Yjs normalized it before the receiver test ([development report](./2026-09-09-delivery-generator-before.json),
[input](./2026-09-09-delivery-generator-input.json)). The generator now translates Unicode scalar positions
into UTF-16 offsets. This is a source-generator correction, not a delivery failure or an invalid-Unicode
support claim. The native smoke helper also needed closed-owner observation guards and the correct
hello-recipient sentinel; those failed harness runs were not counted as passes. A later storage-property
rerun stopped on an obsolete `focused` report variable after 40 passing histories; the variable was removed
and the complete final suite rerun. The full unit property timeout was raised to 30 seconds after its
concurrent case exceeded the default during parallel verification; no assertion was removed.

## Existing regressions

| Suite | Final result | Evidence |
| --- | --- | --- |
| Projection | 12 cases, 100 generated histories, one renderer death; six current controls detected | [Baseline](./2026-09-09-delivery-projection-baseline.json), [structs](./2026-09-09-delivery-projection-drop-pending-structs.json), [deletions](./2026-09-09-delivery-projection-drop-pending-deletions.json), [workspace](./2026-09-09-delivery-projection-skip-workspace-check.json), [Goals](./2026-09-09-delivery-projection-skip-text-check.json), [content](./2026-09-09-delivery-projection-ignore-integrated-content.json), [cause](./2026-09-09-delivery-projection-erase-projection-cause.json) |
| Admission / editor / workspace / startup | 15 / 12 / 10 / 15 cases; 6 / 3 / 4 / 3 controls detected | [Admission](./2026-09-09-delivery-admission-regression.json), [editor](./2026-09-09-delivery-editor-admission-regression.json), [workspace](./2026-09-09-delivery-workspace-admission-regression.json), [startup](./2026-09-09-delivery-owned-startup-regression.json) |
| Content trim | 21 cases; eight controls detected | [JSON](./2026-09-09-delivery-content-trim-regression.json) |
| Storage properties | 120 histories, six corpus replays, 18 renderer deaths; four shrunk/replayed controls detected | [JSON](./2026-09-09-delivery-storage-properties-regression.json) |
| Journal contention | 12 cases including 100 generated histories; older contention mutants not rerun | [JSON](./2026-09-09-delivery-journal-contention-regression.json) |
| Legacy source / export capture | 12 / 16 checks, 100 / 60 generated histories, four / seven controls detected; export includes three renderer deaths | [Source](./2026-09-09-delivery-legacy-source-regression.json), [export](./2026-09-09-delivery-legacy-export-regression.json) |

Two earlier controls now represent repaired behavior. The old projection `serialize-startup` mutation
survives under the fixed library and is retired; the exact runtime-fork policy remains. The old partial-
merge corpus now recovers its complete external string model. Its mutation is retired from the semantic
storage-property battery, while the directed trim suite still detects violation of the unchanged incomplete-
union retention policy. Prior five/seven-control reports retain their historical scope. Current projection
properties require full external-string recovery for arbitrary original orders, with no baseline fallback.

Full Vitest passes **741 tests / 61 files**, including 3,000 new generated delivery/handoff histories and
500 repeated-fork histories. Typecheck, focused lint/format, patch guard, build/budget, vector/AAD and
applicable governance/origin/WASM/traceability checks pass. Initial JavaScript remains **306.3 kB / 350.0 kB**
gzipped. The literal full check chain, geometry, separate unchanged lifecycle/custody/content/journal/genesis/
clear browser suites and broader platform/performance acceptance were not rerun.

Final raw reports are copied byte-for-byte from `verified-*`, `campaign-refined`, `order-mutant-final`,
`pending-donor-replay-final`, `projection-*`, the eight `<suite>-refined` directories, and
`storage-properties-final`. Development reports are explicitly separate. Recorded current source/harness/
guide/dependency hashes and frozen candidate hashes are checked; development/preliminary reports retain
their earlier input hashes. Installation artifacts are checked against the current lockfile and patch.

## Boundary

The saved ordering/handoff defects and the new ready-wakeup mismatch have bounded regression coverage.
No new wire format, original-record archive, automatic redelivery, carrier rewrite or broadened compaction
policy is introduced. Library internals, recursive pending retries, whole-state projection comparisons,
undo retention, large-state working set and input-to-paint costs still require independent review and
performance acceptance. The generated alphabets are not a proof for malicious binary updates or all Yjs
operations. Migration remains unimplemented: carrier selection, old-writer exclusion, pre-active destination/
import ownership and the existing lifecycle/acceptance gates still apply. Matrix evidence advances without
changing any obligation, debt status or payment record.
