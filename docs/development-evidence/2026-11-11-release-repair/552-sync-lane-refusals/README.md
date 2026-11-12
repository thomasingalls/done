# Phase 552 — the send and receive lanes say why an attempt got no result

Same operator ask as phase 551 (2026-11-11): a message should help a person act, and "check your connection" is wrong when the service answered. The coordinating session asked for this phase on 2026-11-12, from "Sync and sign-in routes" in [investigation 14](../investigations/14-behind-devices-and-refusal-messages.md) and the notes in the phase 551 hand-back. The hard constraint was that this phase changes what is said, not what is done. It does. Nothing was amended. No service change, no service logging, and no stored format, wire message, route or limit changes.

## What was wrong (read in code, reproduced by the base-tree run)

- **No result looked the same, whatever the cause.** `privateDeliveryPost` returned `null` both for a refusal and for no answer. It recorded only a diagnostic.
- **Unknown reasons looked like gateway pages.** `serviceHint` turned a hint whose reason it did not know into `response-invalid`, the same as a gateway page.
- **The scheduler said `network-unavailable` for every `unknown` step**, so the notice showed only "Reason: send:network-unavailable" or "receive:network-unavailable". That covered:
  - a device being removed;
  - a damaged service ledger;
  - a store that cannot save;
  - a request from another version;
  - a busy service;
  - a login with no access;
  - a grant from before the account changed;
  - genuinely no answer.
- **The receive path's history failures were folded in too.** They became `unknown` and showed the same reason. Phase 551's `NetworkLoginUnavailable(problem)` and the exported `GrantDenied` were also shown as `network-unavailable` on the lanes.

## The change

**A closed list** (`src/account/syncRefusal.ts`):
- 19 codes for the delivery requests;
- on the receive lane, a history failure keeps its phase 551 code;
- `src/account/historyFailureCodes.ts` now holds phase 551's list with no runtime dependencies, so the page can validate it; `historyFailure.ts` re-exports it unchanged.

**The transport says why** (`privateDeliveryHttp.ts`, a new optional `explain` callback). It never changes what is returned, recorded or retried; a test checks the result and the diagnostics are identical with and without it. How each outcome is classified:
- **No usable answer: `unreachable`.**
  - The request failed.
  - A non-409 reply that is not a page.
  - A 409 body outside the service's exact hint envelope `{ v: 1, kind: 'unknown', reason }`.
  - A hint body over 512 bytes.
  - A reply cut off.
- **Time and stopping.** A timeout is `timeout`. The caller's own stop says nothing.
- **The service's hint.** A known reason is that reason. An unknown or malformed reason inside the envelope is `refused`.
- **Version mismatch.** A 400, 403 or 413 `{ ok: false, refusal: 'malformed' }` is `invalid-request`. That body is read only when an explanation is wanted, bounded at 512 bytes.
- **Too large to use.** A page over the limit is `unusable`.
- **The scoped transport's errors** (`deliveryFailure`):
  - throttled is `capacity`;
  - authority changed is `authority-changed`;
  - the login's own reason maps to `unreachable`, `capacity`, `storage-unavailable`, `invalid-request` or `refused`, and to `login-disconnected` when it has none;
  - grant reasons map as in phase 551;
  - a passkey request is left unexplained, because the sign-in gate already says so.

**The composition attaches it** (`accountReceive.ts`, `accountDelivery.ts`):
- Each lane has a note, reset when the scheduler starts its step.
- **Sender.** The delivery operations' submissions and reads feed the sender's note.
- **Receiver.**
  - The receiver's reads feed its note per request, exactly like their diagnostics: only for the attempted prefix, and cleared with the batch's aggregate fallback.
  - Phase 550's verification read feeds it too.
  - A receive-path `HistoryTransportUnavailable` adds its phase 551 code.
- **Which explanation wins.** Within one step, the service answering outranks no answer, and the first of each stands.
- **Only `unknown` steps carry it.** When the step returns `unknown`, the explanation goes on the result as `refusal`. Every other result is untouched.

**The scheduler only stores it** (`accountSyncDriver.ts`):
- `lane.refusal` is set and cleared exactly where `lane.retryReason` is.
- The status shows it as `refusal` only beside the reason `network-unavailable`. A halt, a standing condition or the sign-in or storage gate shown instead hides it.
- Nothing in the scheduler reads it.
- The bridge carries a known code beside `network-unavailable` and drops anything else.

**The notice** (`SyncNotice.tsx`, `src/ui/syncRefusalMessages.ts`) shows one sentence for the code under the lane's line, and the reason line shows `lane:code` (for example `send:removal-pending`, `receive:history-capacity`). With no explanation, it shows exactly what it showed before.

## Shipped table

| Code (shown as `lane:code`) | Produced by | Sentence, as shipped | Action named | Driven by |
|---|---|---|---|---|
| `unreachable` | No usable answer: the request failed; a non-409 reply that is not the right kind (a gateway or HTML page, any other status); a 409 body outside the service's hint envelope; a hint body over 512 bytes; a reply cut off; a login whose last attempt got no answer | This device could not reach the account service. Check your connection. This device will try again by itself. | Check your connection; the device retries | controls (no reply, gateway pages, JSON outside the envelope), a login fake, and in the browser |
| `timeout` | No answer within 10 s (the transport's own timeout, or the scoped transport's `TimeoutError`) | The account service did not answer in time. Check your connection. This device will try again by itself. | Check your connection; the device retries | control |
| `removal-pending` | Hint `removal-pending`: this device's removal is prepared | This device is being removed from the account, so the account service no longer accepts its changes. This is not a problem with your connection. Your writing on this device is kept. | None on this device; says so | in process |
| `ledger-integrity` | Hint `ledger-integrity` | The account service found a problem with its stored history and has paused changes until it is checked. This is not a problem with your connection. Nothing you do on this device will fix it. Your writing on this device is kept. | None on this device; says so | in process (submission and read) |
| `storage-unavailable` | Hint `storage-unavailable`; a grant refused `storage-unavailable`; a login refused `storage-unavailable` | The account service cannot save changes right now. This is not a problem with your connection. This device will try again by itself. | The device retries | in process |
| `invalid-request` | Hint `invalid-request`; a 400, 403 or 413 `{ ok: false, refusal: 'malformed' }`; a grant refused `malformed`; a login refused `malformed` | The account service could not use a request from this version of the app. Updating the app may fix it. Your writing on this device is kept. | Update the app | in process (submission and read), and in the browser |
| `envelope-size` | Hint `envelope-size` on a read (on a submission it is the existing send halt, unchanged) | The account service could not use a request from this version of the app. Updating the app may fix it. Your writing on this device is kept. | Update the app | in process (transport level) |
| `unsupported-epoch` | Hint `unsupported-epoch` | The account service did not accept the last attempt. This is not a problem with your connection. This device will try again by itself. | The device retries | in process |
| `out-of-order` | Hint `out-of-order` | The account service did not accept the last attempt. This is not a problem with your connection. This device will try again by itself. | The device retries | in process (submission and read) |
| `parent-required` | Hint `parent-required` | The account service did not accept the last attempt. This is not a problem with your connection. This device will try again by itself. | The device retries | in process |
| `unissued-parent` | Hint `unissued-parent` | The account service did not accept the last attempt. This is not a problem with your connection. This device will try again by itself. | The device retries | in process |
| `unavailable` | Hint `unavailable` | The account service did not accept the last attempt. This is not a problem with your connection. This device will try again by itself. | The device retries | forged hint only |
| `state-changed` | Hint `state-changed` | The account service did not accept the last attempt. This is not a problem with your connection. This device will try again by itself. | The device retries | forged hint only |
| `refused` | The service's hint envelope with a reason this version does not know, or a malformed reason; a grant or login refused for another reason | The account service did not accept the last attempt, for a reason this version of the app does not know. This is not a problem with your connection. This device will try again by itself. | The device retries; says it is not the connection | forged hint |
| `unusable` | A 200 answer over the read or response limit | The account service’s answer could not be used. This is not a problem with your connection. This device will try again by itself. | The device retries; says it is not the connection | forged answer |
| `capacity` | The scoped transport's capacity refusal after its two retries; a login whose last attempt was refused `capacity` | The account service is busy. This is not a problem with your connection. This device will try again by itself. | The device retries | in process |
| `access-refused` | A grant refused `wrong-account`, `insufficient-scope`, `invalid-proof`, `grant-required` or `access-required` after the transport's own retry | The account service did not accept this device’s sign-in. Lock and reopen this workspace, then try again. | Lock and reopen the workspace | in process (a non-member credential) |
| `authority-changed` | The scoped transport's `authority-changed`: the grant was issued before the account's devices changed | Your account’s devices changed. This device will catch up by itself. | None; the device catches up by itself | in process (a grant from before a removal fence) |
| `login-disconnected` | The login has no access, is not asking for a passkey and knows no reason | Sync is not connected. Reconnect sync under Account in the menu. | Reconnect sync under Account | login fake with the real transport |

On the receive lane, a history failure keeps its phase 551 code in the reason line and takes the sentence of the same meaning:
- `history-unreachable`, `history-timeout` → the no-answer sentences;
- `history-ledger-integrity`, `history-storage-unavailable`, `history-capacity`, `history-access-refused` and `history-authority-changed` → their own;
- `history-malformed` → the version sentence;
- `history-sync-disconnected` → `login-disconnected`;
- `history-reply-unverified` → `unusable`;
- `history-refused` → `refused`;
- `history-stopped` and `history-sign-in-required` → nothing, because the lane is closing or the sign-in line already shows;
- anything else → the shared retry sentence.

**Sentences reused from phase 551:** `ledger-integrity`, the version sentence (worded "a request" because the notice is not about one command), `access-refused`, and the login reasons through their codes.

**What is not named here, and why:**
- `sign-in-required` is left to the sign-in line the notice already shows; the lane then shows reason `sign-in-required`, not this code.
- `envelope-size` on a submission is the existing send halt, which is also raised locally for an oversized envelope. It keeps no sentence because the halt cannot tell the two apart.
- No existing sentence changed: the browser specs' `receive:sign-in-required`, `receive:integrity` and "Changes from your other devices are not arriving here." are untouched.

## Proof the schedule is untouched

- **The schedule control** (`test/syncRefusal.test.ts` with `test/syncRefusalSchedule.ts`).
  - A scripted two-lane schedule under a fake clock: repeated `unknown` steps through the backoff, an expiry, a progress, a thrown error, a local wake, two retries, online and a remote hint, recorded at 46 moments.
  - Each moment records, for both lanes: phase, failure count, next attempt, reason, issue start, last success and position, plus the armed timers and the calls made.
  - The expected trace was recorded by running the same script against the phase 551 scheduler (`51779e97d`; [script](./schedule-record.test.ts.txt), [trace](./schedule-phase551.json)).
  - The test runs the script once with no explanation, once for each of the 19 codes, for three history codes, and for a forged code outside the list. Every run gives exactly the phase 551 trace.
  - The same test checks that the code is shown exactly at the moments the reason is `network-unavailable`.
- **The mutation controls show the test has teeth.** Making a refusal skip counting a failure (M11), or halt the lane (M12), makes it fail.
- **Existing timing tests, unmodified, pass:**
  - phases 539, 540 and 546: `retentionReductionHold`, `reductionHoldDutyCycle`, `retentionFenceCollision`, `automaticLocalRetention`, `localHistoryMaintenance`, `workerWorkspaceQueues`, `reductionSyncHold`, `receiveRepairPolling`;
  - the sync campaign's `accountSyncDriver`, `accountReceiveDriver` and `ownedReceiveQueue`, and the five account-sync source-anchor controls;
  - the native browser sync suite (`test/account-sync/native.test.mjs`).

  The only change to them is an optional third argument on the shared scheduler fixture's `finish`. No existing call passes it.

## Safety: a hint is unsigned

- **What a hint may do.** It chooses a code and so a sentence, nothing else: never a cursor, a halt, or whether or when to retry.
- **Forged and unknown bodies are tested** on the real transport. A forged `removal-pending`, `ledger-integrity`, `storage-unavailable`, `unavailable` or `state-changed`, an unknown reason, a malformed reason, an envelope with an extra field and an oversized answer each:
  - return `null` with the same diagnostics as without the explanation;
  - record nothing on the service;
  - leave the next real submission accepted.
- **The schedule is unaffected by a forged code too:** the schedule control includes one.

## Tests

**New tests, driven from the in-process service:**
- **`test/account-history/delivery-refusals.test.mjs`, 7 cases.** These use the application's `ScopedTransport` and `privateDeliveryPost` over the real scoped HTTP route, with a real session and grant (the phase 551 fixture). Each request runs twice, with and without an explanation, and the result and diagnostics are compared.
  - **Produced by the service:**
    - `out-of-order`, on a submission and on a read;
    - `unsupported-epoch`;
    - `envelope-size`;
    - `invalid-request`, from a submission signed by an unknown key, a read the service cannot decode, and a 413 for a body past the route limit;
    - `unissued-parent`;
    - `parent-required`;
    - `ledger-integrity`, on a submission and a read after the ledger's ordinal is changed;
    - `storage-unavailable`, with the decisions table renamed;
    - `removal-pending`, after a real removal preparation of this device, preceded by `authority-changed` from the grant held from before the fence;
    - `access-refused`, from a grant for a credential that is not a member;
    - `capacity`, after the transport's two retries.
  - **The login's reasons**, through the real transport.
  - **Sign-in required** is left unexplained.
  - **Controls:**
    - no reply, a timeout, 502 and 503 gateway pages and JSON outside the envelope all say "Check your connection";
    - forged and unknown hints, as above.
- **`test/account-sync/refusal-native.test.mjs`, 2 cases.** The composed workspace in Chromium against the in-process service (the native sync harness).
  - **Sender.** The real service answers an altered submission `409 invalid-request`. The status shows `refusal: 'invalid-request'` beside `network-unavailable`, retrying, with nothing accepted. Then a lost request shows `unreachable`. Then the lane settles normally and the refusal clears.
  - **Receiver.** A `storage-unavailable` hint substituted at the network edge is shown and clears after recovery.
- **`test/syncRefusal.test.ts`, 3 cases:**
  - the schedule control above;
  - the halt or gate hiding the code;
  - the step note's priority.

**View and bridge tests:**
- **`test/syncNotice.test.tsx` (+1).** The 19 sentences word for word; only `unreachable` and `timeout` say "Check your connection"; history codes map by meaning; each code appears in the rendered notice and in the reason line; Retry is still offered.
- **`test/accountSessionBridge.test.ts` (+1).** The code crosses the bridge beside `network-unavailable`. Unknown or malformed codes, and codes beside another reason, are dropped and the status kept.

**On `51779e97d`** ([base-tree-run.txt](./base-tree-run.txt), [script](./base-run.sh.txt); the seven edited sources reverted, new modules and tests kept):
- all 7 transport cases fail, with no explanation given;
- both browser cases fail: the refusal never appears and the 60 s wait ends;
- 3 Vitest cases fail: the sentences, the bridge field, and the schedule control. The control fails on the display part; its trace part matches on the base, as it must;
- the 19 existing cases in those files pass;
- the two cases added after this run (the halt or gate case, and the 413 assertion) fail on the base too, in a [second run](./base-tree-run-2.txt).

**Mutation controls** ([output](./mutation-controls.txt), [rerun](./mutation-rerun.txt), [script](./mutation-controls.py.txt); each applied alone in the worktree and restored). The first run had two survivors:
- M6, the malformed-request reading: the read the test used gets a 409 hint, not a 400;
- M10, showing the code beside any reason.

The 413 assertion and the halt or gate case were added, and both now fail. All 21 are detected.

| | Piece removed |
|---|---|
| M1 | naming the service hint |
| M2 | the envelope check for unknown reasons |
| M3 | the timeout name |
| M4 | the login's reason |
| M5 | grant reasons |
| M6 | reading a malformed-request reply |
| M7 | `unusable` for an answer too large |
| M8 | leaving a passkey request to the sign-in line |
| M9 | the scheduler storing the code |
| M10 | showing it only beside `network-unavailable` |
| M11 | a refusal changing the backoff |
| M12 | a refusal halting the lane |
| M13 | the bridge field |
| M14 | the bridge's reason rule |
| M15 | the notice sentence |
| M16 | the reason line |
| M17 | "Check your connection" for no answer |
| M18 | the note's priority |
| M19 | the composition attaching the code |
| M20 | the sender passing it to submissions |
| M21 | the receiver noting its reads |

## Not verified

- **The receive path's history failures in the composed lane.** `HistoryTransportUnavailable` noting its phase 551 code was checked by reading: the browser harness does not host history snapshots. The mapping from code to sentence is tested.
- **Two hints only forged.** `unavailable` and `state-changed` were not produced by the in-process service, so they were driven only with forged hints.
- **The receiver's browser case uses a substituted hint.** Its real-service refusals are tested at the transport level.
- **The old single-lane delivery driver** (`accountDriver.ts`, used by the spool's own driver) is unchanged and still shows `network-unavailable`.
- **No real gateway or proxy, and no device.** The browser runs are headless Chromium on a shared Mac.

## Runs on the final tree (this seat)

In [evidence.json](./evidence.json):
- **Vitest:** 30 files (the changed modules' importers and the timing tests), 343 of 343.
- **`node --test test/account-history/*.test.mjs`:** 107 of 107 (100 existing, 7 new), in 264 s.
- **Session and CI step files:** 90 of 90.
- **Account-sync controls and the new browser cases:** 7 of 7.
- **`test/account-sync/native.test.mjs`:** 27 passed and its own 6 conditional skips, in 354 s.
- **`pnpm typecheck`.**
- **Formatting and lint on the 21 changed code files:** `oxfmt` through stdin and `oxlint`, both clean.
- **The nine adapter files**, **`pnpm validation:inventory`** and the plan check, and **`pnpm account:crypto-prep`:** 178 of 178, 10 of 10 and the plan, 6 of 6 with the census matched.

At review, on the final tree: the full unit suite (`pnpm test --maxWorkers=1`), 353 files, 3,682 passed and 1 existing skip, in 356 s; then `pnpm typecheck`, `pnpm build`, the ten contract checks, the inventory and plan checks, `pnpm account:crypto-prep`, the nine adapter files, the packaged-application routing tests, `pnpm trace:check`, `node --test test/account-history/*.test.mjs` and the CI session and history step.

**Bookkeeping** per [development.md](../../../development.md#release-bookkeeping):
- **Denominator.** `test/syncRefusal.test.ts` joins the reviewed Vitest selection, so the case denominator moves from 3,032 to 3,035. The reviewed files go from 117 to 118, the general stages from 302 to 303, and the reviewed Vitest stages from 136 to 137.
- **Planning inventory.** It moves to 1,129 obligations with 558 unresolved. The two new node files are blocked like their neighbours.
- **Sync campaign.** Its case count is unchanged at 86.
- **Runtime census.** It records the three new sources and new hashes for the seven edited ones. No changed line adds a domain label or a cryptographic call.
- **Construction registry.** The `done/account-ledger-reference-mismatch` site moves from line 967 to 973 of `accountReceive.ts`.
- **Source-text anchors** ([anchor-check.txt](./anchor-check.txt), [script](./anchor-check.py.txt)). 205 strings and 98 literals were checked.
  - In `historyFailure.ts`, the phase 551 codes moved, unchanged, to `historyFailureCodes.ts`. The tests that match them import the list, and they pass.
  - Otherwise there are more counts of `application/json` and `network-unavailable`.
  - No test, spec or script matched text that changed. The browser specs' notice matches (`receive:sign-in-required`, `receive:integrity`, "Changes from your other devices are not arriving here.") are unchanged.
- **Tests that match the new sentences:**
  - `test/syncNotice.test.tsx`, all 19;
  - `test/account-history/delivery-refusals.test.mjs`, through the exported table.
