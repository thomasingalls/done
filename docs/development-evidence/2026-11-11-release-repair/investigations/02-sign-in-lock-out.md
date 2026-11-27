# Desktop sign-in failure during the phone's maintenance

A delegated agent's report from 2026-11-11, filed as delivered. Read-only. Paths under `/private/tmp` were session scratch space and no longer exist; the supporting files that mattered are under [support](./support/).

**What happened next.** Unexplained. Report 12 examines the service side and finds the message the operator recalled exists only in a file nothing imports.

---

## Refocused report: temporary desktop lock-out during the phone's prune

All paths are under `/Users/thomasingalls/Code/done/.claude/worktrees/l2-onboarding-863db1/`. Read-only; nothing was run or changed.

**Bottom line: I found no fence, lease, pending row or server state that makes device B's unlock or sign-in wait for device A's snapshot or prune.** The lock-out therefore came from B's own close path or from B's online passkey step timing out. The desktop's exact message picks between them.

### 1. What could block B

**Not a cross-device block (verified):**
- Every server history action is one synchronous SQLite transaction touching only history tables and accepted `submission` bytes (`account-service/historyCheckpoint.ts:604-666`).
- Server sign-in and session code never read those tables (sub-agent trace, not re-read by me).
- Opening a saved account is local and works offline (`src/account/networkLogin.ts:262-264`).
- The design says a pending proposal must not block editing (`docs/account-history-management.md:34-35`).
- If A dies mid-way, the transaction rolls back and B is unaffected.

**(a) B signed out mid-reduction — most likely (mechanism verified, cause inferred):**
- Closing waits 5 s for the Worker, then terminates it (`src/ui/windowCeremonyUi.ts:204-215`, `src/crdt/accountWorkerClient.ts:112-124`).
- If cleanup fails, the window keeps its Web Locks "until context death" (`src/crdt/accountWorkerCohort.ts:72-73`, `:202-228`), and lock waits have no deadline.
- B would show one of:
  - "Native cleanup could not finish. Refresh before reopening. Your writing has been kept." (`src/ui/firstDeviceSetupWorker.ts:73-75`)
  - a stuck "Locking and finishing storage operations…"
  - "Checking your workspace… If this waits, close other tabs using this list."
  - "Account setup is open in another tab. Continue there or close it." (`src/account/firstDeviceSetup.ts:316-319`)
- Duration is bounded only by closing or reloading that PWA window, not by the phone.

**(b) Server busy during A's maintenance (mechanism verified, duration not measured):**
- After "Sign out", the account chooser needs server passkey verification with a 10 s client timeout (`src/account/bootstrapHttp.ts:58`).
- B would show "Account verification needs a connection. The saved account is still locked." or "Account verification could not finish. You can retry without changing the saved account." (`src/account/accountSignIn.ts:53-74`).
- The service is one Node process on synchronous SQLite (`account-service/core.ts:244`). Prune captures and serialises the full ledgers twice (`historyCheckpoint.ts:216-218`, `:604-609`), and each history write clears the process-wide verification cache (`:132-134`, `:676`).
- It is bounded: requests are cut at 10 s (`account-service/scoped-http.ts:245-248`) and expire at 30 s (`historyCheckpoint.ts:664`).

### 2. "Compact" versus "Prune covered history" — separate things

| | "History on this device" | "History maintenance" |
|---|---|---|
| Trigger | Automatic; only a "Check again" button | Manual buttons |
| Scope | That device's IndexedDB only | The account's history on the service |
| Code | `src/ui/LocalHistoryMaintenance.tsx`, `src/crdt/automaticLocalRetention.ts:15-18` | `src/ui/AccountHistory.tsx` |

- The UI never says "compact"; the operator almost certainly means the automatic device reduction ("Building a smaller history snapshot…").
- A snapshot is an encrypted account checkpoint stored on the service. With two devices, one creates it and the other must verify it (`src/account/historyMaintenance.ts:278-279`).
- "Second snapshot" is "Verified snapshot 2 is saved."; the Prune button only appears then (`AccountHistory.tsx:82`).
- Prune replaces service ciphertext at or below the first snapshot's cuts, for the whole account, not "for the phone" (`historyCheckpoint.ts:522-587`).
- Prune neither performs nor requires the device reduction, and does not check that any device has installed the snapshot locally.
- Two couplings exist, neither affecting sign-in:
  - Reduction pauses while a history command runs on that device (`src/crdt/accountReceive.ts:3918`).
  - Reduction pauses while that device holds an unverified proposal (`accountReceive.ts:1053-1067`), with no time limit.

### 3. Signing out mid-reduction

- **Nothing is left half-done (sub-agent trace; I read only the caller, `accountReceive.ts:1123-1150`).** The install is one strict IndexedDB transaction, so the device is either unreduced or fully reduced. A leftover preparation journal is ignored at open.
- **Reduction rarely gets to run (inferred).** It needs sync to be quiet (`accountReceive.ts:3916`), which this account never reaches.
- **Prune adds a sync risk (verified).** A device behind the pruned cut can only catch up by installing the latest snapshot (`accountReceive.ts:4062-4090`).
  - Over 4 MiB combined, receive halts as `inbound-size` (`src/crdt/historyInstall.ts:69`, `:155`).
  - Any other install failure halts receive as `integrity` (`src/crdt/accountSyncDriver.ts:337-345`).

### Questions for the operator
1. What exact text did the desktop show while locked out?
2. Was the desktop PWA window closed or reloaded between the failures and the success?
3. What does each device's sync notice say now?
