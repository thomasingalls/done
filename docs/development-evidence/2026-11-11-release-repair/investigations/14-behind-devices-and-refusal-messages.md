# Devices behind a prune, first pass, and the refusal-message inventory

A delegated agent's report from 2026-11-11, filed as delivered. Run in a copy of `2277ef5db`, two devices. Paths under `/private/tmp` were session scratch space and no longer exist; the supporting files that mattered are under [support](./support/).

**What happened next.** The operator judged its browser test too weak to settle the question: two devices, a returning device that had verified both snapshots, tiny histories and no failing control. Treat part A as superseded by report 15. Part B, the refusal inventory and proposed sentences, stands and is queued.

---

## Phase 544 follow-ups: A (devices behind a prune) and B (refusals shown as "check your connection")

**A in one line:** the strand I inferred last time does not happen in production, I was wrong about it. A device that comes back after a prune installs the snapshot automatically, keeps its unsent writing, and sends it, in either order. That is verified by browser test.

**B in one line:** every history refusal, and every network failure, currently ends in the same "Check your connection" sentence. The inventory and proposed sentences are below.

I made no edits in the worktree. Everything I ran used a copy (`git archive 2277ef5db`), with `node` run directly, never `pnpm`. Browser runs used ports 53421/53422, not 53221/53222. The copy is deleted. The probe sources and output are kept in `/private/tmp/claude-502/-Users-thomasingalls-Code-done--claude-worktrees-l2-onboarding-863db1/a2cb3ea1-c2ed-4b47-b08f-dc5bb9d6e506/scratchpad/behind-device-evidence/`. Line numbers below are at `2277ef5db`.

---

## A. A device that is behind when history is pruned

### Runs (in the copy)
- **Browser spec `behind-prune.spec.ts`: 2 of 2 pass** (27.4 s and 28.8 s, against a fresh vite build of the copy). Two devices. The second device stops receiving and sending, verifies two snapshots, writes text while offline and locks. The first device then prunes. The test runs twice, once per return order:
  - **Install first:** on reopening, the second device installed the snapshot on its own and showed the covered writing and its own unsent text, with nothing sent yet. After sending was unblocked, its text was accepted (new `publisher_decisions` row) and appeared on the first device. Later writing then flowed both ways.
  - **Send first:** reopened with sending allowed but the catalog still blocked. Its text was accepted and reached the first device first. The second device did not get the covered writing until the catalog was unblocked, then installed and caught up.
  - My first run failed only because I counted the wrong table: the second device's stream lives in `publisher_decisions`, not `delivery_decisions`.
- **Node probe `behind.test.mjs`: 2 of 2 pass.**
  - After a prune, a read below the previous snapshot's cut returns `{kind:'unknown', reason:'unavailable'}`; a read past it returns positions 2–3. The latest snapshot's cut (position 2) is past the pruned floor.
  - After a prune, exact retries of pruned accepted positions return their original decisions, and the publisher's next position (4) is accepted.
- **Node probe `behind-retired.test.mjs`: 1 of 1 passes.** A cut that lands inside a peer stream this device has already reduced, with no retained link, throws `RetiredHistoryRequired`. A cut at or past the device's frontier applies normally.
- **Already in the repo, not in CI:** `test/packaged-account/history.spec.ts:199` checks that a returning editor installs and keeps its text, but does not check that the text is then sent.

### 1. The strand: refuted for production
**Which devices fetch history** (`accountReceive.ts:1704-1724`). A device fetches when it has network access, is not detached, can receive, and any of these holds:
- the service advertises membership continuation;
- the device has installed or inherited history;
- its membership epoch is past 3;
- its key generation is past 1.

Once true, this stays true for the life of the owner. It is re-checked at the start of every receive pass, throttled to every 5 seconds, before any stream is read (`:4110`).

**Why it never strands in production** (verified by reading):
- The production service always enables continuation (`account-service/public-state.ts:170`, `:271`).
- The packaged client takes the flag from `/config` and caches it (`src/account/packagedConfig.ts:108`, `:145`, `:175`), then passes it to the Worker (`src/ui/windowCeremonyUi.ts:317`, `:407`).
- The history route only exists when continuation is on (`account-service/scoped-http.ts:97`), so a service that does not advertise it cannot prune at all.
- So every production device fetches history, and the device I described last time cannot exist.

**Why the rule is drawn there:** the flag is an unauthenticated capability hint. The comment at `:1702-1703` says authenticated evidence (a later epoch or generation, installed history) "cannot be downgraded by that hint". Without the gate, a device on a service with no history route would get a 404 on every pass. That surfaces as `HistoryTransportUnavailable`, which stops the whole receive pass (`:4134-4140`).

### 2. The ordinary case works with no manual step
Verified by the browser test above. By reading:
- `installHistory` with a v2 event calls `applyHistoryReceiveCuts` (`inboundLedger.ts:368-447`), which moves each peer cursor up to the snapshot's cut.
- Reads then continue past the cut. The cut is the latest snapshot's, which is at or past the floor the prune used.

### 3. Unsent local writing survives, in either order
Verified by the browser test above. What makes it true (by reading, plus the node probe):
- **The snapshot is full document state.** It is a Yjs document with nothing garbage-collected, so installing it is a merge, and the device's unsent items stay in its document.
- **Installation never acknowledges or removes unsent writing.** It only moves peer cursors. For the device's own stream, it checks the cut against the device's retained upload attempts (`inboundLedger.ts:386-411`).
- **The device's own stream continues across the prune.** Pruning replaces old decisions with ciphertext-free receipts that keep the ledger's hash chain (`account-service/prunedDecision.ts:1`). Exact retries return the original decision (`account-service/delivery.ts:1179-1180`). The next position is accepted; the node probe shows both.
- **A prune never touches unsent writing.** It only covers positions at or below the previous snapshot's cut for each publisher (`account-service/historyCheckpoint.ts:562-590`). Unsent writing sits above the device's accepted head.

What could break it:
- **Uninstallable latest snapshot.** Writing still sends, but receive halts (phase 544).
- **Own-stream cut that does not match retained attempts** (`inboundLedger.ts:393`, `:410`). That is an integrity halt, and would need local loss of upload records.
- **A failed catalog read stops all receiving, not just history.** Verified: both browser specs rely on blocking only the catalog read to stop receiving. Any trouble on the history route therefore shows up as `network-unavailable` on the receive lane.
- **Reduced peer streams (inferred, three or more devices).** After local reduction, each stream's state records how far it was reduced (`localBaselineReplay.ts:768`). A cut inside that range throws (verified by probe). `installHistory` turns that into skipping the whole install (`accountReceive.ts:1887-1895`, by reading). So a device that is ahead on a reduced peer but behind on a pruned peer gets no cursor moves at all. It then retries as `network-unavailable` indefinitely. That needs at least three devices; with two, the device is ahead of the only peer, so it never needs the cut.
- **Key rotation while offline** was not examined.

### 4. Nothing stops a prune while a device is behind, and neither side can know
By reading:
- **Prune** (`account-service/historyCheckpoint.ts:530-597`) checks only that the latest and previous snapshots are admitted and that the request names them. Phase 544 adds the "latest must be installable" check.
- **The service** has no table recording how far each device has read (I listed every table). It sees signed read requests with each reader's position while serving them, but stores nothing.
- **The pruning device** sees the device roster only, not anyone's receive position.

A hard refusal would let one lost phone block pruning forever, so a warning is the only sensible use of such a record.

### 5. Smallest change, and the design question
- **Case 1 needs no change for production.** Optional hardening, about 15 lines plus two tests:
  - in `src/account/historyHttp.ts`, treat a 404 from the history route as "this service offers no history";
  - in `fetchHistory` (`accountReceive.ts:1717`), drop the capability-hint gate.
- **The real remaining risk is the reduced-peer skip.** About 10 lines in `inboundLedger.ts:426-432`: ignore a cut the device is already past instead of throwing, so other publishers' cuts still apply. This changes ledger replay semantics and needs review and replay tests.
- **"How far behind" is not what limits catch-up.** Catching up costs one snapshot install, however long the device was away, and unsent writing is kept regardless. Re-initialising is only needed when the device cannot catch up:
  - the snapshot cannot be installed;
  - the reduced-peer skip;
  - possibly a missed key rotation.

  My suggestion is a named "this device cannot catch up" state with a guided "re-sync from the service" action that carries the unsent writing. Because the document is a CRDT, re-sending the local state as a fresh update after installing is safe. That would replace any distance limit. This is a moderate change and has not been designed yet.

---

## B. Refusals shown as "check your connection"

### How refusals travel today (verified by reading)
- **The history transport turns everything into one error.** `createHistoryTransport` raises `HistoryTransportUnavailable` for:
  - a network failure or any authorization error (`src/account/historyHttp.ts:56`);
  - any non-200 reply, including every 409 refusal (`:67`);
  - a timeout (`:40`, `:87`).
- **The history view shows one sentence for every failure**, including the client's own checks: "History maintenance could not finish. Your writing and saved progress are kept. Check your connection, then check history or resume." (`src/ui/AccountHistory.tsx:43`)
- **On the receive path**, a history failure becomes `unknown` (`accountReceive.ts:4134-4140`). The sync notice then says "Changes from your other devices are not arriving here." with "Reason: receive:network-unavailable".
- **Sync refusals** (`/account/delivery/*`) arrive as 409 with `{v:1, kind:'unknown', reason}`. They are recorded only as diagnostics and return null (`src/account/privateDeliveryHttp.ts:76-100`, `:128-141`, `:155-164`). The scheduler shows them as `network-unavailable` (`src/crdt/accountSyncDriver.ts:369`).
- **Sign-in refusals:** the scoped transport turns `capacity`, `sign-in-required` and `authority-changed` into typed errors (`src/account/scopedTransport.ts:352-385`). Network login collapses session refusals into "reconnect" or "disconnected" (`src/account/networkLogin.ts:533-534`, `:552-554`). The page then shows "Sync needs an account passkey check…" or "Could not reconnect sync. Please try again."
- **No bridge change is needed to carry a reason.** The Worker channel already passes an error's own `code` property to the page when it is lowercase letters and hyphens (`src/crdt/workerChannel.ts:75-79`).

### History route: what each refusal is, and the sentence I would show
Today every row shows the generic sentence above.

| Refusal | Kind | Proposed sentence | Action named |
|---|---|---|---|
| `checkpoint-busy` | another device will resolve | "Another device has a snapshot waiting for verification. Check history to verify it, or discard it on the device that made it." | Check history |
| `checkpoint-cancelled` | person must act | "This snapshot was discarded earlier and cannot be sent. Discard it here too, then create a new one." | Discard |
| `sources-changed` | transient | "Your account changed while the snapshot was being prepared. Check history, then create it again." | Check history |
| `checkpoint-required` | conflict | "The snapshot you were verifying is no longer waiting. Check history to see where things stand." | Check history |
| `admission-conflict` | another device resolved it | "Another device verified this snapshot first. Check history." | Check history |
| `checkpoint-conflict` | conflict | "A different snapshot is waiting now. Check history before trying again." | Check history |
| `retention-boundary-changed` | transient | "A newer snapshot was verified since you checked. Check history, then remove covered history again." | Check history |
| `source-unavailable` | transient | "History from a recently added or recovered device is not on the service yet. Try again after your devices have synced." | wait |
| `state-changed` | transient | "The account changed while history maintenance ran. Try again." | retry |
| `checkpoint-too-large` (older clients only) | size | "This snapshot is too large for your devices to install, so the service did not keep it. Your writing is unchanged." | none |
| `ledger-integrity` | nobody can act | "The account service found a problem with its stored history and has paused changes until it is checked. This is not a problem with your connection. Your writing on this device is kept." | none |
| `unavailable` (also covers expiry, clock skew, failed verification) | nobody can act | "The account service could not finish history maintenance. This is not a problem with your connection. Your writing and saved progress are kept; try again later." | retry later |
| `invalid-proof` | nobody can act | "The account service did not accept this device's part in history maintenance. Your writing and saved progress are kept." | none |
| `malformed`; HTTP 400/403/413 | version mismatch | "The account service could not use this request from this version of the app. Updating the app may fix it. Your writing is kept." | update |
| 404 `not-found` | capability | "This account service does not offer history maintenance." | none |
| 429 `capacity` (after the transport's retries) | capacity | "The account service is busy. Try again in a minute." | retry |
| `sign-in-required` | person must act | "Sync needs an account passkey check before history maintenance can continue." | Reconnect sync |
| `authority-changed` | transient | "Your account's devices changed. Check history again." | Check history |
| 503 `storage-unavailable` | nobody can act | "The account service cannot save changes right now. This is not a problem with your connection." | retry later |
| 403 `insufficient-scope`, `wrong-account`, `invalid-proof` | person must act | "The account service did not accept this device's sign-in. Lock and reopen this workspace, then try again." | reopen |
| no reply, or timeout | genuinely unreachable | "History maintenance could not reach the account service. Your writing and saved progress are kept. Check your connection, then check history or resume." A timeout would say "did not answer in time" instead. | Check connection |

The client's own refusals in `src/account/historyMaintenance.ts` and `historyOwner.ts` also currently show the generic sentence:
- "Another snapshot was saved while this one was being read. Check history and try again."
- "Finish or discard the saved snapshot first."
- "Covered history can be removed once two snapshots are verified and unchanged."
- "Only the device that made this snapshot can discard it."
- For a reply that does not verify, or a regressed catalog: "The account service's answer did not verify. Nothing was changed. This is not a problem with your connection."
- For `HistoryReceivePending`: "Sync is finishing on this device. Try again in a moment."

### Sync and sign-in routes
These share the pattern; today they show `network-unavailable`.
- **Sync refusals** (`account-protocol/diagnostics.ts:1-14`):
  - `removal-pending`: "This device is being removed from the account, so its changes are not being sent."
  - `ledger-integrity`: same sentence as on the history route.
  - `storage-unavailable`: same sentence as on the history route.
  - `invalid-request` and `envelope-size`: the version-mismatch sentence.
  - `unsupported-epoch`, `out-of-order`, `parent-required`, `unissued-parent`, `unavailable`, `state-changed` are retried automatically: "The account service did not accept the last attempt; this device will try again. This is not a problem with your connection."
- **Sign-in:** name `wrong-account` ("This passkey belongs to a different account.") and `capacity`/`storage-unavailable` ("The account service is busy.") instead of the general "Could not reconnect sync."

### Telling unreachable from refused, without trusting the service more
- **Unreachable** means no HTTP response at all: the fetch rejected, it was aborted or timed out, or the browser reports being offline. A gateway error page (HTML, or a body outside the closed vocabulary) also counts as unreachable.
- **Refused** means a reply came back from the pinned origin (`redirect:'error'`) with a JSON body matching a closed list of reasons.
- Refusal bodies are unsigned, just like today's diagnostic hints, which `diagnostics.ts:1` calls "Unsigned diagnostic vocabulary". So they should only choose the sentence and whether to retry, never change saved progress, cursors or the catalog. An unknown reason gets the generic "not your connection" sentence. A forged refusal can only show the wrong message, which an attacker able to forge one could already cause by blocking the request.

### Size of change B
- **History, ready now:** about 100 lines plus three test files, touching four files.
  - `historyHttp.ts`: classify replies into a closed list, map authorization errors, and give each error a `code` like `history-busy`.
  - `historyMaintenance.ts`: give the client's own refusals codes.
  - `AccountHistory.tsx`: map the code to a sentence; only "unreachable" keeps "check your connection".
  - Keep the `HistoryTransportUnavailable` retry behaviour for automatic maintenance and the receive path.
- **Sync lanes:** a separate phase of about 60 lines plus tests.
  - `privateDeliveryHttp` returns the reason.
  - The scheduler gains a "service refused" retry reason with a detail.
  - The bridge and the sync notice show it.
  - This touches the retry timing that phases 539 and 540 tested.
- **Sign-in:** about 20 lines, in `networkLogin` and `SyncNotice`.
