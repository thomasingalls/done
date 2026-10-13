# Retirement evidence contract — 2026-10-13

Base: signed **`cf16e61a`** (`G`), non-deleting baseline lifecycle. The
[new contract](../../account-local-retention-evidence.md) is design work plus one executable
characterization. No runtime code, stored bytes, production profile, service, browser fixture or
release inventory changed. This working phase is uncommitted.

## Source audit

| Source | Finding used in the decision |
| --- | --- |
| `src/crdt/accountReceive.ts`: `prepareRead`, `fetchPage`, `receiveGroup`, prepared final application | Requests remain outstanding outside the storage queue; grouped requests bind exact bytes and contiguous positions. A retirement boundary needs explicit invalidation, plus a disposition for committed promotion. |
| `src/crdt/retainedHistory.ts`, `inboundLedger.ts`: `contextAt`, `applyHistoryReceiveCuts` | Terminal duplicates can use retained receipts; unknown older links refuse. The own-cut branch currently refuses below the replay origin even if a checkpoint record could supply an exact pin. |
| `src/crdt/localBaselineReplay.ts`, `localBaselineRecord.ts` | The reduced state keeps terminal proofs, latest installed checkpoint, partial/unallocated capsules and consumed indexes. Fully consumed capsule identities do not survive. |
| `src/crdt/sourceCapture.ts`: `capturedRecovery`, `capturedSourcePresence`; `accountCapture.ts`: `persist` | Deduplication requires original capsule identity and bytes, not snapshot coverage. Live private owners still use the full catalogue. |
| `src/crdt/journalCodec.ts`, `journalStore.ts` | Generation/storage-key-bound synchronous AEAD; exact post-commit journal removal. Current bytes have no retirement-era binding. |
| `src/crdt/contentRecord.ts`, `spoolRecord.ts` | Allocation is reservation accounting, not committed-row coverage. Spool events exclude ordinary source/content commits. Neither is a universal backup-pair certificate. |
| `src/crdt/historyInstall.ts`, `historyOwner.ts`, `historySource.ts`, `src/account/historyMaintenance.ts` | Installation and independent admission are different operations; native history production/admission cold-replays accepted service history. Retained attempts carry checkpoint/admission/discard progress and cannot be treated as disposable network reads. |
| `src/crdt/localBaselineStorage.ts`, `accountCapture.ts`: `withBaselineCensus` | Current private replacement uses exact atomic metadata/history comparisons, reserved invocations, journal exclusion and full reference comparison; it does not delete logical rows. |

Reviewed alongside the current retention/transition/lifecycle/compatibility documents and the journal,
checkpoint and restore context in sequencing, the action tree and the separate public restore procedure.
The new decision does not alter the server restore tradeoff or enable key retirement.

## Executed checks

`node node_modules/vitest/vitest.mjs run --maxWorkers=1 test/localBaseline.test.ts test/sourceCapture.test.ts test/journalCodec.test.ts`
— **41 tests / 3 files pass**. Log: [unit.log](./unit.log).

The new test, “characterizes why a restored legacy journal cannot use a retired source catalogue,”
uses signed accepted positions and the actual baseline builder/replayer. Its exact restored capsule
produces zero pending originals against the full catalogue and two against the reduced catalogue.
Those two updates change no Yjs state. This is a passing counterexample to using content coverage as
source deduplication, not a passing implementation test for a new restore policy.

Existing cases in that run cover old terminal duplicates, refusal of unavailable own/peer checkpoint
links, authority continuation, partial capsules, generated cut histories, compaction and undo.
TypeScript `tsc -b --noEmit`, changed-test lint/format and `git diff --check` also pass. No browser,
general qualification, mutation or performance campaign was started. The preceding lifecycle's
183 unit checks, 15 native cases and four packaged journeys remain evidence of that earlier phase;
they were not rerun or credited as tests of this design.

`manifest.json` records this test log's hash and the changed test's source hash. The journal wrapper,
metadata-era transition, live old-flight fencing, exact retained-checkpoint adapter and restore
refusals remain **implementation gates**, first exercised without deletion. No new operational safety
or latency claim follows merely from recording these rules.
