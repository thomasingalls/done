# Phase 547 — two devices making a snapshot at once, Discard, and the 4,096-position replay bound

The operator approved three manual-flow fixes on 2026-11-11, from the read-only report on automatic history pruning. Automation is not approved and is not touched: no automatic discard, no jitter, no change to the automatic scheduler's policy (`src/account/automaticHistoryMaintenance.ts` is unchanged). Every change is in the one owner command the History maintenance view already calls, `runHistoryMaintenance` (`src/account/historyMaintenance.ts`), in the cold replay (`src/crdt/historySource.ts`), and in the view.

## 1. Two devices creating a snapshot at once

**What was wrong (read in code, reproduced below).** Creating reads the catalog, prepares the snapshot (a full cold replay, seconds to minutes), saves it as this device's attempt, then publishes it. Nothing re-read the catalog after preparing. A second device that published in that window left the first holding a saved snapshot the service would never accept:

- *Two devices.* B's publish is refused `checkpoint-busy` because A's proposal is pending. A's proposal needs B to verify it. B's history check said "Saved snapshot progress is ready to resume.", because a saved attempt took precedence over verifying, and offered only Resume, which the service refuses again. Discard was hidden, because `canDiscard` was true only for a pending proposal of this device's own. Pressing Discard anyway threw "Only the producer can cancel this checkpoint". Neither device could finish, and B's saved attempt also kept B's local history reduction parked (`retentionAttemptsSettled`).
- *Three devices.* If a third device verifies A's proposal first, B's snapshot names a parent that is no longer latest. Its publish is refused for good (the service answers `unavailable`), and B showed the same Resume-only state.

**Closing the window.** After preparing, and after the existing install-size check, creating reads the pending proposal again. If the catalog's sequence, latest or pending pointer changed, it saves and sends nothing and returns the new state with `raced: true`. In the two-device case that state is the other device's snapshot to verify, so the next step is Verify. The extra read is one request per creation.

**What remains, and how a person recovers it.** The save and the publish are still two steps, so another device can publish in between. That device's own saved snapshot is now classified against the authenticated catalog it already reads, never against a refusal reply (the transport is unchanged):

| `saved` | Meaning | Discard |
|---|---|---|
| `sendable` | not on the service; nothing stands in its way | records a cancellation on the service, as before |
| `waiting` | it is the pending proposal | removes it from the service, as before |
| `blocked` | another device's proposal is pending; it could only be sent if that one were discarded | keeps the cancellation for later, drops the attempt now |
| `superseded` | the service admitted another snapshot since it was made; its parent is no longer latest | records a cancellation if nothing is pending, otherwise only drops the attempt |
| `stale` | membership or carried sources changed; the service checks both | as `superseded` |
| `cancelling` | discarded here; the service has not recorded the cancellation yet | sends it when nothing else is pending |

An attempt whose hash is the catalog's latest or previous was admitted while its reply was lost. It gets no `saved` value and no Discard; Resume reconciles it, as before, and the discard command now reconciles it too instead of recording a cancellation.

**Why keeping the cancellation is sound.** The service refuses a cancellation (`checkpoint-conflict`) while a different proposal is pending, so in the `blocked` state one cannot be recorded. The cancellation hash stays in the saved progress (the existing `discard` field; no format change) and the attempt is dropped, so the other device's snapshot can be verified at once. Two outcomes end it:
- that snapshot is admitted: the discarded one names an older parent and can never be published, so the kept cancellation is cleared in the same command that admits;
- that snapshot is discarded: the next history command finds nothing pending and records the cancellation, exactly as the earlier cancellation tombstone does. A delayed delivery of the discarded snapshot is then refused `checkpoint-cancelled` (tested).

A kept cancellation never blocks verifying. `superseded` and `stale` snapshots need no cancellation, because the service checks the parent and the epoch head and refuses them for good; only the attempt is dropped. While a cancellation is kept, local reduction stays parked as before (`retentionAttemptsSettled` reads the same field), and phase 546's sentence says so.

**The deadlock walked to its end** (`test/account-history/race.test.mjs`, two real credentials, real service):
1. B saves its snapshot; A publishes; B's publish is refused `checkpoint-busy`.
2. B checks history: `saved: blocked`, Discard offered. A checks: `saved: waiting`.
3. B presses Discard: no cancellation is sent (only the two reads every command makes), B's attempt is dropped, its cancellation kept, and the status is A's snapshot to verify.
4. B verifies: A's snapshot is admitted, sequence 1, and B's kept cancellation is cleared.
5. A resumes and reconciles its own saved proposal. Both devices check: nothing pending, nothing saved. A delayed delivery of B's discarded snapshot is refused.

## 2. Discard

Discard is offered for every saved snapshot of this device's own that no device has admitted (`sendable`, `waiting`, `blocked`, `superseded`, `stale`) and as Finish discarding for `cancelling` when it can be sent. It is never offered for an admitted snapshot, for another device's current proposal, or for this device's saved admission of another device's snapshot (that one reconciles). One existing case is kept on purpose: another device's proposal that the account's membership has made stale can still be discarded by any current device, as since 2026-10-09 ([account-history-management.md](../../../account-history-management.md), "Durable service exchange"; the service enforces the same rule).

## 3. The 4,096-position replay bound

`HISTORY_REPLAY_EVENTS` (4,096) is unchanged. It now lives in `src/account/historyReplayBound.ts` so that the page-side owner command can name it; `historySource.ts` re-exports the same constant (pinned by a test).

- **Checking history** reports `positions: { since, allowed }`: accepted positions since the latest admitted snapshot (from genesis before the first), summed over every publisher from the authenticated heads the check already reads.
- **Creating** counts this device's own replay before preparing, from the cuts its replay starts at (`historyReplayStart`: the previous snapshot it can open, else a recovery or replacement baseline, else genesis, the same order as `readHistorySource`). Past the bound it returns `replay: { snapshot: 'new', needed, allowed }` with nothing prepared, saved or sent.
- **Verifying** does the same from the proposal's cuts before admitting: `replay: { snapshot: 'pending', … }`, nothing admitted or saved; the device that made it is offered Discard.
- **The cold replay itself** now counts before reading any position and throws `HistoryReplayLimit` (same message as before, plus `needed` and `allowed`); its in-loop check stays as a backstop and throws the same error. Creating and verifying turn it into the same named outcome instead of the generic failure. This also applies to the membership handoff replay in `membershipSource.ts`, which now refuses past the bound before reading instead of after 4,096 positions.

A device joined by a handoff can start its first replay later than genesis, so it may be able to make a first snapshot that an original device cannot verify. The view's count is the account's count since the last verified snapshot, which is what an original device replays.

## The text shown in each new state

Every sentence is in `src/ui/AccountHistory.tsx`, composed by `historyStatusMessage` and pinned word for word in `test/accountHistory.test.tsx`. "Your writing is unchanged." and the existing sentences are kept; browser specs read "Snapshot saved. Verify it from another approved device." and "Verified snapshot N is saved.", which still appear as before.

Wherever Discard is offered (also for the existing stale and too-large cases), this follows the state's sentence:

> Discarding removes only this unfinished snapshot. Your writing, verified snapshots and other devices’ snapshots are not affected.

| State | Sentence (then the Discard sentence where Discard is offered) | Buttons besides Check history |
|---|---|---|
| `raced` (creating found another device's snapshot) | Another device made a snapshot while this one was being prepared, so this one was not saved or sent. Your writing is unchanged. *(then the new state, usually:)* A snapshot is ready for this device to verify. | Verify history snapshot |
| `sendable` | This device has a saved snapshot that is not on the service. Resume to send it, or discard it. | Resume history snapshot, Discard unfinished snapshot |
| `waiting` | unchanged: "Saved snapshot progress is ready to resume." (after a check) or "Snapshot saved. Verify it from another approved device." (after creating). Resuming admits it on a single-device account. | Resume history snapshot, Discard unfinished snapshot |
| `blocked` | This device has a saved snapshot it cannot send, because another device’s snapshot is waiting for verification. Discard it here, then verify the other snapshot. | Discard unfinished snapshot |
| `superseded` | This device has a saved snapshot that can no longer be sent, because the service has verified another snapshot since it was made. Discard it. | Discard unfinished snapshot |
| `stale` | This device has a saved snapshot that can no longer be sent, because the account changed after it was made. Discard it. | Discard unfinished snapshot |
| `cancelling`, nothing pending | A snapshot discarded on this device still has to be cancelled on the service. Finish discarding. Your writing is unchanged. | Finish discarding |
| `cancelling`, kept while another device's snapshot waits | the state's own sentence, then: A snapshot discarded on this device will be cancelled on the service once the other device’s snapshot is verified or discarded. | Verify history snapshot |
| positions, up to 3,072 | The service has accepted 3,072 positions (uploads from your devices) since the last verified snapshot. *("since this account began" before the first)* | as before |
| positions, 3,073 to 4,096 | The service has accepted 3,073 positions (uploads from your devices) since the last verified snapshot. A snapshot can cover at most 4,096, so make one soon: past that, no snapshot can be made and older service history can never be removed. | as before |
| positions, past 4,096 | The service has accepted 4,097 positions (uploads from your devices) since the last verified snapshot, more than the 4,096 a snapshot can cover. No snapshot can be made, so older service history cannot be removed. Your writing is unchanged. | Create is hidden |
| creating past the bound | Making a snapshot on this device would replay 4,097 positions, and a snapshot can replay at most 4,096. Nothing was saved or sent. Your writing is unchanged. | none |
| verifying past the bound | Verifying this snapshot on this device would replay 4,097 positions, and a snapshot can replay at most 4,096, so it was not verified. It can be discarded from the device that made it. Your writing is unchanged. *("Discard it." on the device that made it)* | none here; Discard on the maker |

The view calls positions "positions (uploads from your devices)": each accepted position is one upload from one device. The positions sentence follows the existing one, for example "Verified snapshot 1 is saved. The service has accepted 12 positions (uploads from your devices) since the last verified snapshot."

## Tests and runs

**New tests.** Node tests run the real `runHistoryMaintenance` against the real in-process service, with one credential, key, verified membership and saved progress per device (`test/account-history/devices-fixture.mjs`). The fixture copies the account set-up from `test/account-ceremony/content-transfer.test.mjs` (two devices certified at epoch 3; a third through the continuation ceremony, certified at epoch 5) instead of sharing it, so that file and its case identities are unchanged.

- `test/account-history/race.test.mjs` (6 cases):
  - two devices create at once and the one still preparing saves and sends nothing, then verifies the other;
  - the two-device deadlock, walked to its end as above;
  - a kept cancellation is recorded after the other device discards instead, and a delayed delivery is refused `checkpoint-cancelled`;
  - three devices: a snapshot admitted by the third leaves the loser `superseded`, which it discards without sending a cancellation and then verifies the next one;
  - Discard for `sendable` (publish request lost) and `waiting`;
  - never discarded here: another device's current proposal (refused, nothing sent), this device's saved admission whose reply was lost (reconciles with `admit`), and this device's own snapshot admitted while its reply was lost (reconciles with `publish`).
- `test/account-history/replay-bound.test.mjs` (6 cases) covers every combination asked for:

  | Positions | First snapshot, creating | First snapshot, verifying | After an admitted snapshot, creating | After an admitted snapshot, verifying |
  |---|---|---|---|---|
  | 3,072 | made | admitted | made | admitted |
  | 3,073 | made | admitted | made | admitted |
  | 4,096 | made | admitted | made | admitted |
  | 4,097 | refused before preparing; nothing sent or saved | refused before admitting; nothing sent or saved | refused before preparing | refused before admitting |

  Checking history reports the exact count in each case. The verifying refusals need a proposal the verifier cannot replay, so a device whose replay starts later (as a handoff-joined device's first replay does) makes it; a build without this check could also have made it. A sixth case makes a bound met inside preparation or verification return the same named outcome.
- `test/account-history/replay-bound-source.test.mjs` (4 cases): the cold replay with 4,096 positions completes in 512 reads; with 4,097 it throws `HistoryReplayLimit` (4,097 and 4,096, same message) before any read and before any history progress. Both from genesis and after an admitted snapshot, on the signed-page apparatus of `multi-page-source.test.mjs`. It also checks that `historyReplayStart` and `historyReplayPositions` give the replay's own count.
- `test/account-history/client.test.mjs` (+1): a saved snapshot left behind by a membership change is `stale`, offered for discard and cancelled on the service.
- `test/historyReplayBound.test.ts` (3, new): the bound is 4,096 and `historySource.ts` reads the same constant; the counting rule; the replay start order.
- `test/accountHistory.test.tsx` (+4): every sentence above word for word, and the buttons for each state, including that Discard and Finish discarding send `discard`.
- `test/accountSessionBridge.test.ts` (+1): the Worker-to-page bridge carries the new fields and refuses malformed ones.

**Two existing assertions changed.** In `test/account-history/client.test.mjs`, "verification never admits a pending snapshot too large to install, and inspection names it" and "pruning is refused while the latest snapshot is too large to install" compare a whole check-history result. That result now also carries `positions: { since: 0, allowed: 4096 }`, so both expectations gained that field. No other existing assertion changed.

**On the base tree** (`7e6aff636`, new tests copied in; [runs](./base-tree-runs.txt)):
- All 6 race cases fail. The race case throws `checkpoint-busy`. The deadlock case shows `{ pending: 'resume', saved: undefined, canDiscard: false }` where Discard is wanted. The kept-cancellation case throws "Only the producer can cancel this checkpoint". The superseded and not-sent cases offer no Discard. The never-discarded case shows the base recording a cancellation for an admitted snapshot instead of reconciling it.
- All 6 bound cases fail at the first check, which has no positions on base. A probe with those checks removed ([probe](./replay-bound-nopositions.probe.mjs.txt)) shows that creating at 4,097 positions returns no refusal on base, from genesis and after a snapshot.
- 2 of 4 source cases fail: base reads 4,096 positions, then throws a plain error with no counts. The two 4,096 cases pass as controls.
- The stale case and the two changed assertions fail.
- 5 Vitest cases fail, and `test/historyReplayBound.test.ts` cannot load (no module there). The other 14 cases in those files pass.

**Mutation controls on the final tree** ([output](./mutation-controls.txt), [script](./mutation-controls.py.txt)). Each removes one piece, runs the tests that guard it, and restores the file:

| Piece removed | Fails |
|---|---|
| M1 the catalog re-read after preparing | the race case |
| M2 Discard for this device's own unadmitted snapshot | deadlock, three-device, not-sent/waiting and stale cases (4) |
| M3 keeping the cancellation (send it at once instead) | deadlock and kept-cancellation cases |
| M4 clearing a kept cancellation once the other snapshot is admitted | the deadlock case |
| M5 counting before preparing | both 4,097 cases |
| M6 counting before admitting | both 4,097 cases |
| M7 the replay's own count before reading | both 4,097 source cases (the backstop then throws after 4,096 reads) |
| M8 the named outcome for a bound met inside preparation | the named-outcome case |
| M9 positions in check-history results | the two changed client assertions and a 4,097 case |
| M10 reconciling an admitted snapshot instead of discarding it | the never-discarded case |
| M11 hiding Resume where resuming cannot help | the view's buttons case |
| M12 warning past three quarters (made "at") | the positions sentence case |
| M13 the sentence on what discarding affects | the saved-state sentence case |
| M14 the bridge's new fields | the bridge case |

**Final tree.**
- `pnpm test --maxWorkers=1` passes: 347 files, 3,351 cases, one existing skip, 352.68 s, on Node 26.13.0 with the host load average between 8 and 16. Other sessions' Playwright runs were active. None of the four files known to time out under load failed.
- `node --test test/account-history/*.test.mjs` passes 87 of 87 in 443 s: 70 existing and 17 new.
- The CI service step passes 69 of 69. Its files are the five session files, `source.test.mjs`, `multi-page-source.test.mjs` and `handoff.test.mjs`.
- The ten CI contract checks pass, as do `pnpm validation:inventory`, `plan.mjs` and the nine adapter files (178 cases).
- `pnpm typecheck` passes, and `pnpm build` passes at 309.0 of 350 kB.
- `oxfmt --check` and `oxlint --react-plugin` pass on the changed files. `oxfmt` reformatted four of them after the mutation controls ran; whitespace only.
- `pnpm trace:check` passes after the contract checks are rerun on the finished tree. Its receipts are bound to the tree, so the order matters.

**Bookkeeping** follows [development.md](../../../development.md#release-bookkeeping).
- `test/historyReplayBound.test.ts` joins the reviewed Vitest selection. The case denominator moves from 2,704 to 2,711 (3 new cases plus 4 in `test/accountHistory.test.tsx`), reviewed files from 111 to 112, general stages from 296 to 297 and reviewed Vitest stages from 130 to 131.
- The three new node test files are blocked obligations, like every other file in `test/account-history/`. The planning inventory moves to 1,120 obligations with 555 unresolved.
- The runtime census gains `src/account/historyReplayBound.ts` and new hashes for the changed sources. No changed line adds a domain label or a cryptographic call.
- One registered site moves: `done/checkpoint/v1` in `historySource.ts`, line 266 to 282. The construction registry follows it.
- Of 53 string literals of 16 or more characters that occur in the base versions of the five edited sources and in `vite/`, `test/` or `scripts/` ([check](./anchor-check.py.txt)), every one occurs the same number of times now except:
  - `recovery-reading` and `replacement-checkpoint`, which occur once more in `historyOwner.ts`; they are kind strings, not anchors;
  - the replay's error message, which moved unchanged to `historyReplayBound.ts`; no file under `vite/`, `test/` or `scripts/` referenced it before this phase.

  `src/account/automaticHistoryMaintenance.ts`, whose text the automatic-history browser spec transforms, is untouched.

## Limits

- No browser suite, native suite or device. The view is checked in unit-test DOMs only. The browser specs that read the history view (`test/packaged-account/history.spec.ts`, `recovery.spec.ts`, `membership-connection.spec.ts`, and the local-baseline specs that press Resume) were checked by reading only. The sentences they wait for still appear, and Resume is still offered where they press it.
- The native owner's `replayStart` follows `readHistorySource`'s order and is unit-tested. It was not composed with a real recovered or replacement device. The replay's own count before reading is the backstop for such a device.
- The race tests drive the real client and service with fixture `prepare` and `admit`. A native cold replay was not run in them.
- The bound tests take about 6 minutes under this host's load; the node history tests are not in CI.
- A kept cancellation keeps local reduction parked until it is cleared or recorded, as any saved history step does.
- No commit or deployment.

[Identities and results](./evidence.json).
