# Phase 551 — say what a refusal is, and what to do about it: history maintenance and sign-in

The operator asked on 2026-11-11: "if there are messages that would help a user take action, that might be worth an edit as well. 'check your connection' is not a helpful message in any case". The coordinating session asked for this phase on 2026-11-12, from part B of [investigation 14](../investigations/14-behind-devices-and-refusal-messages.md), re-read against `3b8394590` (phases 544, 547 and 550 had added refusals and sentences since). Scope: the history route and sign-in. Sync-lane refusals are the next phase. Nothing was amended. No service change, no service logging, and no stored format, wire message, route or limit changes.

## What was wrong (read in code, reproduced by the base-tree run)

- **History maintenance had one failure sentence.** Every failed command showed "History maintenance could not finish. Your writing and saved progress are kept. Check your connection, then check history or resume." That covered the service's fourteen named refusals, its 404 and malformed replies, authorization refusals, a busy service, a timeout, and the client's own checks. `historyHttp.ts` turned every non-200 reply into one `HistoryTransportUnavailable`, and wrapped every failed request the same way. That also hid the scoped transport's typed sign-in errors.
- **Sign-in had one disconnected sentence.** "Network login is unavailable. Your writing remains available offline." covered a busy service, storage that cannot save, an outdated request, an unknown refusal and no reply alike. A reconnect from the sync notice that failed at the service went back to the same sentence with no reason. ("Could not reconnect sync. Please try again." appears only when the Worker request itself fails, because `NetworkLogin.connect` never throws.)
- **HIST-OTHER, the phase 547 gap.** This device discards its waiting snapshot and the reply is lost after the service recorded it. Another device then publishes. Every later command except Check history resent the cancellation, and the service refused it as `checkpoint-conflict`. Check history showed "Saved snapshot progress is ready to resume." with neither Resume nor Verify offered. With two devices nothing in the view could move on. On `3b8394590`: Discard is refused, and Check history reports `pending: 'resume'` where Verify is needed.
- **The phase 550 waiting sentence** gave examples ("once its unsent writing is sent or an unfinished account step on it is completed") that do not fit a build with automatic retention off.

## The change

**A closed list of failures** (`src/account/historyFailure.ts`, 33 codes). The history view turns a code into a sentence (`src/ui/historyFailureMessages.ts`). Only a service that gave no usable answer says to check the connection.

**Classifying a history reply** (`historyHttp.ts`):
- **A refusal** is only the service's exact body: `{ ok: false, refusal }` with exactly those two keys, JSON, at most 512 bytes.
  - 409 with one of the route's fourteen reasons gets that reason's code.
  - 404 `not-found` and 400, 403 or 413 `malformed` get theirs.
  - Any other reason, a malformed one, or a known one on the wrong status gets `history-refused`: "…This is not a problem with your connection…".
- **No usable answer** is `history-unreachable`:
  - the request failed;
  - a gateway or HTML page, other JSON, an oversized body, or a non-JSON reply;
  - a reply cut off mid-read;
  - also a non-JSON body on an authorization status, where the scoped transport's own parse throws.
- **Time and stopping.** The 10 s timeout, or a `TimeoutError` from the scoped transport, is `history-timeout`. The operation's own stop is `history-stopped`.
- **The scoped transport's errors** are named:
  - `NetworkSignInRequired`;
  - `NetworkAuthorityChanged`;
  - `NetworkThrottled`, which is capacity after the transport's two retries;
  - `GrantDenied(reason)`, now exported;
  - `NetworkLoginUnavailable(problem)`, which is new. It replaces a plain `Error` with the same message when the login has no access and is not asking for a passkey, and carries the login's own reason.
- **Retrying is unchanged.** Every one of these is still a `HistoryTransportUnavailable`, exactly as before, so automatic maintenance still retries them and the receive path still returns `unknown`. `HistoryReplyRefused` keeps its class (receiving halts as before) and gains the code `history-reply-unverified`.

**This device's own refusals** keep their messages and gain codes (`HistoryRefusal`), in `historyMaintenance.ts` and `historyOwner.ts`:
- A failed check of an answer inside the client is `history-reply-unverified`, unless a more particular code was given.
- The native owner's read of accepted writing returns nothing on any failure. It now names why from the transport's own closed diagnostic codes, which it still records as before.

**The Worker boundary.** A command the page asked for ends with `historyCommandFailure(cause)` in `accountReceive.ts`: the same failure with its code as an own property, which the Worker channel already passes to the page. Automatic maintenance calls `runHistory` directly and keeps the original error and its retry rule.

**The view.** `AccountHistory.tsx` shows the sentence for the code, or the general one for a code it does not know. A failure never changes the status shown.

**HIST-OTHER** (`historyMaintenance.ts`; no amendment needed). Three parts:
- **Resending a kept cancellation.** When the resend is refused `checkpoint-conflict`, the refusal only prompts a fresh authenticated catalog read. If another device's snapshot is pending there, the cancellation is kept as phase 547 keeps one, and the command goes on: this device's attempt, the snapshot being cancelled, is dropped. Otherwise the refusal stands, and the cancellation is sent next time.
- **Check history.** A saved attempt that is the snapshot this device is cancelling, kept while another device's snapshot waits, no longer makes the state "resume". The other snapshot is offered for verification.
- **Discard.** Pressing Discard while this device's cancellation is kept describes the state instead of trying to discard the other device's snapshot.

End state: "A snapshot is ready for this device to verify. A snapshot discarded on this device will be cancelled on the service once the other device’s snapshot is verified or discarded." with Verify. Verifying it clears the cancellation, as phase 547's fence does.

**Sign-in** (`networkLogin.ts`, `NetworkLoginNotice.tsx`, `SyncNotice.tsx`, `accountSessionBridge.ts`):
- The login keeps why its last attempt failed: `unreachable`, `busy`, `unavailable`, `outdated` or `refused`.
- Every status it publishes carries the reason, or none, so a later success clears it.
- The bridge carries the reason as an optional, closed field.
- The Account section's login notice shows it in place of the status sentence while Connect or Reconnect is offered. The sync notice shows it under "Sync needs an account passkey check."

**Waiting sentence** (wording only): "Changes from your other devices may stop arriving here until this device can finish history maintenance. A history snapshot saved on the service is checked and installs then. Your writing on this device is kept."

## Shipped table: history maintenance

| Code | Produced by | Sentence, as shipped | Action named | Retried by automatic maintenance |
|---|---|---|---|---|
| `history-unreachable` | No usable answer: the request failed, a non-200 reply that is not the service's exact refusal body (a gateway or HTML page, other JSON, over 512 bytes), a non-JSON 200, a reply cut off mid-read; a login with no access whose last attempt got no answer; an accepted-writing read with no answer | History maintenance could not reach the account service. Your writing and saved progress are kept. Check your connection, then check history or resume. | Check your connection, then Check history or Resume | yes |
| `history-timeout` | No answer within 10 s (the history transport's timeout, or the scoped transport's, which rejects with `TimeoutError`); an accepted-writing read that timed out | The account service did not answer in time. Your writing and saved progress are kept. Check your connection, then check history or resume. | Check your connection, then Check history or Resume | yes |
| `history-stopped` | The operation's own signal ended the request (the workspace locked or closed) | History maintenance stopped on this device before it finished. Your writing and saved progress are kept. Check history to see where it stands. | Check history | yes |
| `history-checkpoint-busy` | 409 `checkpoint-busy`: publishing while another proposal waits | Another device’s snapshot is waiting for verification, so this one was not sent. Your writing and saved progress are kept. Check history to verify that snapshot first. | Check history, verify that snapshot | yes |
| `history-checkpoint-cancelled` | 409 `checkpoint-cancelled`: publishing a proposal this device already discarded | This snapshot was discarded earlier, so the service will not take it. Check history, discard it here too, then create a new one. Your writing is unchanged. | Check history, Discard, create a new one | yes |
| `history-sources-changed` | 409 `sources-changed`: devices added or recovered while the snapshot was made or verified | Your account’s devices changed while this snapshot was made or verified, so the service did not accept it. Your writing and saved progress are kept. Check history to see what to discard or make next. | Check history | yes |
| `history-checkpoint-required` | 409 `checkpoint-required`: verifying a snapshot that is no longer stored | The snapshot you were verifying is no longer waiting. Your writing and saved progress are kept. Check history to see where things stand. | Check history | yes |
| `history-admission-conflict` | 409 `admission-conflict`: another admission already recorded | Another device verified this snapshot first. Your writing and saved progress are kept. Check history. | Check history | yes |
| `history-checkpoint-conflict` | 409 `checkpoint-conflict`: verifying or discarding a snapshot that is not the pending one; also this device's own check before discarding | A different snapshot is waiting now. Your writing and saved progress are kept. Check history before trying again. | Check history | yes (the client's own: no, as before) |
| `history-retention-boundary-changed` | 409 `retention-boundary-changed`: pruning after a newer snapshot was verified | A newer snapshot was verified since you checked, so nothing was removed. Check history, then prune covered history again. | Check history, Prune covered history again | yes |
| `history-source-unavailable` | 409 `source-unavailable`: handoff source history not on the service yet | History from a recently added or recovered device is not on the service yet. Your writing and saved progress are kept. Try again after your devices have synced. | Wait for devices to sync, try again | yes |
| `history-state-changed` | 409 `state-changed` | The account changed while history maintenance ran. Your writing and saved progress are kept. Check history, then try again. | Check history, try again | yes |
| `history-checkpoint-too-large` | 409 `checkpoint-too-large` (an earlier build, or a race past this device's own checks) | The service refused a snapshot too large for your devices to install. Check history to see which one. Your writing is unchanged. | Check history | yes |
| `history-ledger-integrity` | 409 `ledger-integrity`; an accepted-writing read refused `ledger-integrity` | The account service found a problem with its stored history and has paused changes until it is checked. This is not a problem with your connection. Nothing you do on this device will fix it. Your writing on this device is kept. | None: says nothing on this device will fix it | yes |
| `history-unavailable` | 409 `unavailable` (also expiry, clock skew or a failed verification on the service) | The account service could not finish history maintenance. This is not a problem with your connection. Your writing and saved progress are kept. Try again later. | Try again later | yes |
| `history-invalid-proof` | 409 `invalid-proof`: producer or admitter does not match the request | The account service did not accept this device’s part in history maintenance. This is not a problem with your connection. Nothing you do on this device will fix it. Your writing and saved progress are kept. | None: says nothing on this device will fix it | yes |
| `history-malformed` | 409, 400, 403 or 413 `malformed`; a grant refused `malformed`; a login whose last attempt was refused `malformed`; an accepted-writing read refused `invalid-request` or `envelope-size` | The account service could not use this request from this version of the app. Updating the app may fix it. Your writing and saved progress are kept. | Update the app | yes |
| `history-not-found` | 404 `not-found`: the service has no history route | This account service does not offer history maintenance. Nothing you do on this device will fix it. Your writing and saved progress are kept. | None: says nothing on this device will fix it | yes |
| `history-sign-in-required` | `NetworkSignInRequired`: 401 `sign-in-required`, or the login asks for a passkey | Sync needs an account passkey check before history maintenance can continue. Choose Reconnect sync under Account in this menu, then try again. Your writing and saved progress are kept. | Reconnect sync under Account, then try again | yes |
| `history-sync-disconnected` | `NetworkLoginUnavailable` with no reason: the login has no access and is not asking for a passkey | Sync is not connected, so history maintenance could not start. Your writing and saved progress are kept. Check Account in this menu, reconnect sync if it is offered, then try again. | Check Account, Reconnect sync if offered | yes |
| `history-authority-changed` | `NetworkAuthorityChanged` (409 `authority-changed`); this device's checks that its account authority changed (source authority, unknown snapshot authority, custody and source differ) | Your account’s devices changed while history maintenance ran. Your writing and saved progress are kept. Check history again in a moment. | Check history again in a moment | yes (the client's own: no, as before) |
| `history-capacity` | `NetworkThrottled`: 429 `capacity` after the scoped transport's two retries; a login whose last attempt was refused `capacity` | The account service is busy. This is not a problem with your connection. Your writing and saved progress are kept. Try again in a minute. | Try again in a minute | yes |
| `history-storage-unavailable` | 503 `storage-unavailable`; a login whose last attempt was refused `storage-unavailable`; an accepted-writing read refused `storage-unavailable` | The account service cannot save changes right now. This is not a problem with your connection. Your writing and saved progress are kept. Try again later. | Try again later | yes |
| `history-access-refused` | 403 `wrong-account`, `insufficient-scope` or `invalid-proof`; `grant-required` or `access-required` after the transport's own retry | The account service did not accept this device’s sign-in. Your writing and saved progress are kept. Lock and reopen this workspace, then try again. | Lock and reopen the workspace | yes |
| `history-refused` | The service's refusal body with a reason this version does not know, a malformed reason, or a known reason on the wrong status; another grant refusal; a login refused for another reason; an accepted-writing read refused with another hint | The account service did not accept this request. This is not a problem with your connection. Your writing and saved progress are kept. Check history, then try again. | Check history, try again | yes |
| `history-reply-unverified` | `HistoryReplyRefused` (an answer over the page limit or that does not verify); this device's checks of an answer (catalog regressed or forked, unexpected completion receipt, snapshot from another account, baseline without admission) | The account service’s answer could not be checked, so nothing from it was used. This is not a problem with your connection. Your writing and saved progress are kept. Check history to try again; if this keeps happening, nothing you do on this device will fix it. | Check history; says plainly when nothing on this device will help | no, as before (receive halts) |
| `history-advanced` | This device's own: the catalog moved between reads, or during preparation | Another snapshot was saved while this one was being read. Your writing and saved progress are kept. Check history, then try again. | Check history, try again | no, as before |
| `history-finish-saved` | This device's own: a saved snapshot blocks creating, verifying or pruning | This device has a saved snapshot to finish or discard first. Your writing and saved progress are kept. Check history to see it. | Check history | no, as before |
| `history-prune-unchanged` | This device's own: pruning needs two unchanged verified snapshots | Covered history can be removed once two snapshots are verified and unchanged. Check history to see where things stand. | Check history | no, as before |
| `history-not-producer` | This device's own: discarding another device's current snapshot | Only the device that made this snapshot can discard it. Verify it here, or discard it on that device. | Verify it here, or discard it on that device | no, as before |
| `history-receive-pending` | `HistoryReceivePending` after its own retries: a receive is still settling | Sync is finishing on this device. Your writing and saved progress are kept. Try again in a moment. | Try again in a moment | yes, as before |
| `history-local-progress` | This device's own: saved history progress changed underneath, or did not persist | This device could not save its history progress. Your writing is kept. Lock and reopen this workspace, then check history. | Lock and reopen, then Check history | no, as before |
| `history-failed` | Anything else, and any code this version does not know | History maintenance could not finish. Your writing and saved progress are kept. Check history, then try again. | Check history, try again | as before for the underlying error |

"Retried" means the error is still a `HistoryTransportUnavailable` or a `HistoryReceivePending`, as before this phase. Nothing about retrying changed. The accepted-writing read's failures were plain errors before and are still not retried. Each code is lowercase letters and hyphens, which the Worker channel passes; anything else reaches the page as `operation-refused` and gets the general sentence.

## Shipped table: sign-in

| Reason | When | Sentence, as shipped | Action named |
|---|---|---|---|
| `unreachable` | A session request got no usable answer: the request failed, a timeout, a non-JSON or gateway page, or a body outside the session result shape | Sync could not reach the account service. Check your connection, then reconnect sync. Your writing remains available offline. | Check your connection, Reconnect sync |
| `busy` | Refused `capacity`: the account holds the most sessions the service allows, too many attempts, or the session route's rate limit | The account service is busy, so sync could not connect. This is not a problem with your connection. Try Reconnect sync again in a minute. Your writing remains available offline. | Reconnect sync in a minute |
| `unavailable` | Refused `storage-unavailable` | The account service cannot save sign-ins right now, so sync could not connect. This is not a problem with your connection. Try again later. Your writing remains available offline. | Try again later |
| `outdated` | Refused `malformed` | The account service could not use the sign-in request from this version of the app. Updating the app may fix it. Your writing remains available offline. | Update the app |
| `refused` | Any other refusal the passkey ceremony does not answer, including `not-found` and reasons this version does not know | The account service did not accept this sign-in. This is not a problem with your connection. Try again later. Your writing remains available offline. | Try again later |
| none | Refusals the passkey ceremony answers (`unknown-attempt`, `request-conflict`, `proof-conflict`, `invalid-proof`, `expired`, `cancelled`, `retry-unavailable`, `sign-in-required`, `access-required`) | Unchanged: Reconnect sync with your account’s passkey. Your writing is available offline. | Reconnect sync |
| none | Local failures: saving the login on this device, an access reply that does not check, a cancelled passkey; also the first moment after opening | Sync is not connected. Reconnect sync to try again. Your writing remains available offline. (was "Network login is unavailable. Your writing remains available offline.") | Reconnect sync |

In the sync notice the sentence appears without its last sentence, under "Sync needs an account passkey check. Your writing remains available offline."

`wrong-account` is not reachable at sign-in. The session operations never return it, only the scoped routes do, where it is `history-access-refused`. The investigation's "This passkey belongs to a different account." therefore has nowhere to appear and was not added.

## Safety: a refusal body is unsigned

- **What a reason may do.** It chooses a code, so a sentence and whether to retry, and nothing else. No saved progress, cursor, catalog or saved snapshot classification depends on it. Phase 547's classification against the authenticated catalog is unchanged.
- **Unrecognised bodies.** An unknown or malformed reason in the service's body gets the general "not your connection" sentence. A gateway page, or any body outside the closed list, counts as unreachable.
- **The one decision prompted by a refusal** is HIST-OTHER's fresh catalog read. The authenticated catalog decides. A forged `checkpoint-conflict` costs one read and changes nothing; this is tested.

## Tests

**New tests, driven from the in-process service:**
- **`test/account-history/refusals.test.mjs`, 13 cases.** Requests go through the application's own `ScopedTransport` and `createHistoryTransport` to the real scoped HTTP route. The network session and per-device workspace grants are real (`test/account-history/http-fixture.mjs`; `devices(t, 2, { http: true })` in `devices-fixture.mjs`). Each case checks the code, the sentence, that it is still retried as before, and that saved progress, the service catalog and records are unchanged:
  - busy, from a real race;
  - cancelled, from progress saved before a discard;
  - conflict, from a discard racing another device's verification and new snapshot;
  - boundary changed, from a prune racing a newer verified snapshot;
  - too large, from an earlier build's publish past the install bound;
  - sign-in required, from a session revoked on the service;
  - capacity, from the request budget refusing, after the transport's two retries;
  - controls: no reply, a timeout, a gateway page (502 and 503), JSON outside the list and a refusal with an extra field all say "Check your connection";
  - forged and unknown bodies on resume, discard and check history: a forged named reason, an unknown reason, a malformed reason, a reason on the wrong status and an unverifiable 200 page each choose only a sentence, and the classification is unchanged;
  - HIST-OTHER, starting with Check history and starting with Discard;
  - a forged conflict on a kept cancellation (one authenticated read, nothing changed);
  - a login with no access, for each reason.

  The helper also checks that each code is an own property of lowercase letters and hyphens, as the Worker channel requires.
- **`test/account-sessions/client.test.mjs` (+3), sign-in against the real session service:**
  - capacity from 32 existing sessions, cleared when one is revoked, with no new passkey prompt;
  - storage refused at renewal through the service's commit hook;
  - an outdated renewal request;
  - no reply, a gateway page, a timeout and JSON outside the result shape through `postSession` with a mocked fetch;
  - a forged `capacity` and an unknown reason, each followed by a renewal that needs no passkey;
  - a reconnect whose challenge the service cannot store, cleared by the next reconnect.

**View tests:**
- **`test/accountHistory.test.tsx` (+1).** The 33 sentences word for word. Only unreachable and timeout say "Check your connection". Every code is shown through a `WorkerChannelError` in the rendered view, with the status unchanged. Unknown codes, a channel failure and an uncoded error get the general sentence.
- **`test/syncNotice.test.tsx` (+1, and one assertion changed).** The sign-in sentences in both notices. The neutral disconnected sentence. A reason never replaces a status that is not offering to connect. The changed assertion is the waiting sentence's new wording.
- **`test/accountSessionBridge.test.ts` (+1).** The reason crosses the bridge and clears; unknown reasons are refused.

**On `3b8394590`** ([base-tree-run.txt](./base-tree-run.txt); [base-run.sh.txt](./base-run.sh.txt) shims only the new `historyFailure.ts`):
- all 13 refusal cases fail: every failure classifies as the general one, and in HIST-OTHER Discard is refused and Check history reports `resume`;
- the 3 sign-in cases fail: the base login has no reason;
- 4 Vitest cases fail: the three new ones and the waiting sentence; the base view shows "History maintenance could not finish. … Check your connection …" for every code;
- the 40 existing cases in those files pass.

**Mutation controls** ([mutation-controls.txt](./mutation-controls.txt), [script](./mutation-controls.py.txt); each applied alone in the worktree and restored, and the tree was compared with a backup afterwards): all 22 make a test fail.

| | Piece removed |
|---|---|
| M1 | naming route refusals |
| M2 | the exact-envelope check |
| M3 | the general sentence for an unknown reason |
| M4 | the timeout name |
| M5 | naming sign-in and authorization refusals |
| M6 | the code on an unverifiable answer |
| M7 | the login's reason on the transport's error |
| M8 | the classifier's mapping for it |
| M9 | HIST-OTHER's fresh catalog after a refused resend |
| M10 | the fresh catalog deciding instead of the refusal |
| M11 | Check history treating the cancelled attempt as resumable |
| M12 | Discard with a kept cancellation |
| M13 | the login's reason for a renewal refusal |
| M14 | the login's reason for a finish refusal |
| M15 | telling no reply apart |
| M16 | a reconnect keeping its challenge's reason |
| M17 | the login notice's reason |
| M18 | the sync notice's reason |
| M19 | the bridge field |
| M20 | the view using the code |
| M21 | "Check your connection" for no reply |
| M22 | the waiting sentence |

## Not verified

- **The Worker boundary and the native owner are read, not run.**
  - The wrapper in `accountReceive.ts` and `historyOwner.ts`'s codes (its authority checks and its accepted-writing read) were checked by reading. The native history owner runs only in the packaged browser harness, and this phase ran no browser.
  - The tests apply `historyCommandFailure` themselves and show the code through a `WorkerChannelError`. `test/workerChannel.test.ts` already checks that a handler's own code reaches the page.
- **Two pieces have no test.** The client's own verification of a service-signed answer inside `historyMaintenance.ts` (the `unverified` wrapper) is not driven, because `historyHttp.ts` verifies the page first and a test would need a service that signs a bad snapshot; removing the wrapper would not fail a test. The 512-byte refusal-body bound is not tested.
- **The network edge.** No real gateway or proxy in front of the service: the controls replace the reply in the transport. The session route's own HTTP 429 was not exercised: sign-in capacity came from the service's per-account limit in process, and `postSession` was run against a mocked fetch.
- **No browser, no device.** The sentences were checked in unit-test DOMs.

## What the sync-lane phase should know

- **`privateDeliveryPost` cannot tell a refusal from no answer.** It returns `null` for both.
  - Phase 551 reads the reason from its diagnostic sink for the history owner's read. The sync lanes can do the same, or the function can return the reason.
  - `serviceHint` returns null for a hint whose reason is not in `SERVICE_HINTS`, and that is then noted `response-invalid`, like a gateway page. Under this phase's rule, an unknown reason in the service's envelope should get the general "not your connection" sentence, so that needs telling apart.
- **Two transport changes reach the sync lanes:**
  - The scoped transport now throws `NetworkLoginUnavailable(problem)` where it threw a plain `Error` with the same message. `privateDeliveryPost` still treats it as `network-unavailable`; the lanes could name the login's reason from `problem`.
  - `GrantDenied` is exported; its reason is unsigned. `storage-unavailable`, `wrong-account`, `insufficient-scope` and `invalid-proof` from a lane still show as `network-unavailable`.
- **The sync notice now shows the login's reason** under "Sync needs an account passkey check." A new sync retry reason should not repeat it.
- **Investigation 14's sync list still stands:**
  - `removal-pending`;
  - `ledger-integrity` and `storage-unavailable` with the history sentences;
  - `invalid-request` and `envelope-size` with the version sentence;
  - the six reasons retried automatically.
- **Retry timing was not touched.** No error changed class, and the receive path's own `HistoryTransportUnavailable`s (`accountReceive.ts`, the verification read) take the default code and are never shown. The timing tested by phases 539, 540 and 546 is unchanged.

## Runs on the final tree (this seat)

In [evidence.json](./evidence.json):
- **Vitest:** 20 files that import the changed modules, 198 of 198.
- **`node --test test/account-history/*.test.mjs`:** 100 of 100 (87 existing, 13 new), in 272 s.
- **Node session files:** `client.test.mjs`, `scoped-client.test.mjs`, and the CI session and history step's session and handoff files, 90 of 90. The step's two history files ran with `test/account-history`.
- **`pnpm typecheck`.**
- **Formatting and lint on the 22 changed code files:** `oxfmt` through stdin and `oxlint --no-ignore --react-plugin`, both clean.
- **The nine adapter files:** 178 of 178.
- **`pnpm validation:inventory`** (10 of 10), the plan check, and **`pnpm account:crypto-prep`** (6 of 6, census matched).

At review, on the final tree: the full unit suite (`pnpm test --maxWorkers=1`), 352 files, 3,677 passed and 1 existing skip, in 366 s; then `pnpm typecheck`, `pnpm build`, the ten contract checks, the inventory and plan checks, `pnpm account:crypto-prep`, the nine adapter files, the packaged-application routing tests, `pnpm trace:check`, `node --test test/account-history/*.test.mjs` and the CI session and history step.

**Bookkeeping** per [development.md](../../../development.md#release-bookkeeping):
- **Denominator.** `test/accountHistory.test.tsx` is in the reviewed Vitest selection, so the case denominator moves from 3,031 to 3,032.
- **Planning inventory.** It moves to 1,126 obligations with 556 unresolved. The new node file is a blocked obligation, like every file in `test/account-history/`.
- **Runtime census.** It records the two new sources and new hashes for the ten edited ones. No changed line adds a domain label or a cryptographic call.
- **Construction registry.** The `done/account-ledger-reference-mismatch` site moves from line 966 to 967 of `accountReceive.ts` (one import line).
- **Source-text anchors** ([anchor-check.txt](./anchor-check.txt), [script](./anchor-check.py.txt)). 256 strings from `vite/`, `test/` and `scripts/` and 122 literals of the base sources were checked. The changed counts are ordinary strings: `application/json`, event listener names, `sign-in-required`, `storage-unavailable`, `account-protocol` import paths, `history-checkpoint`, and `} catch (cause) {`. One count fell: "History maintenance" in `AccountHistory.tsx`, 3 to 2, because the old failure sentence moved to `historyFailureMessages.ts`. The browser specs match the "History maintenance" button, which is unchanged. No test or script matched the old failure sentence or "Network login is unavailable".
- **Tests and scripts that match the new sentences:**
  - `test/accountHistory.test.tsx` (all 33);
  - `test/syncNotice.test.tsx` (the sign-in sentences and the waiting sentence);
  - `test/account-history/refusals.test.mjs`, through the exported table.
