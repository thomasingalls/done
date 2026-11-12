# A busy Worker handoff slot halting reduction

A delegated agent's report from 2026-11-11, filed as delivered. Read-only at `9882e30cd`. Paths under `/private/tmp` were session scratch space and no longer exist; the supporting files that mattered are under [support](./support/).

**What happened next.** Fixed in phase 546.

---

## Worker handoff refusal during reduction (read-only, tip 9882e30cd)

Phase 543 did not touch `workerWorkspaceQueues.ts`, `accountReceive.ts`, `admissionQueue.ts` or `accountSyncDriver.ts`, so their line numbers match ff8578cd0.

**Short answer:** the halt is real and new with the Worker owner, but in production it needs a narrow race. It cannot explain the phone repeatedly starting "reading" and stopping partway; the ordinary interruption path already does. The smallest fix is to turn the before-anything-happens refusal into an interruption.

### 1. Where the error is raised (verified)

- The message comes from `workspaceQueueRefused()` in `src/crdt/workerWorkspaceQueues.ts:14-15`. `acknowledgedReceive.ts` does not raise it; its only errors are "already consumed" and "context unavailable".
- **The condition.** The Worker queues hold one `flight` slot (`workerWorkspaceQueues.ts:44-46`). `begin()` (59-71) throws synchronously whenever `flight` is already set. A flight lasts from `begin` until the job's `finally` clears it (103), which is after the Window apply settles.
- **Which operations share that slot.**
  - Prepared receives: `prepare`, at 113-114.
  - Fenced operations: `enqueue`, at 131-135, bound into the Worker by `workerAccountComposition.ts:46-59`.
- **Callers of `enqueue`** (`accountReceive.ts`):
  - receive lane: `receiveHistory` (3616), and `receivePage` / `receiveGroup` when prepared receive is off (3631, 3698);
  - reduction: `removeLocalHistory`'s commit (3860) and the progress save through `contextQueue.run(persist)` (1132, `workerContextQueue.ts:23-33`);
  - authority adoptions through `contextQueue.run` (2756, 2761);
  - "Check history", via `dryRunLocalRetention` (3901);
  - advance, replace and install baseline (3911, 3918, 3924).
- **Callers of `prepare`:** receive pages and groups (3627-3629, 3691-3695).
- **The refusal is deliberate.** `test/workerWorkspaceQueues.test.ts:271-291` pins it: `enqueue` throws `'handoff'` while a prepare is outstanding (287), and the prepare then still completes.
- **No teardown.** A refusal from `begin` happens before `track`, so `config.failed()` is not called and the Worker is not torn down. Refusals after `begin` do call it (96-97).
- **The older version waited.** The page-side `receiveOwned` simply queues FIFO (`admissionQueue.ts:1038-1047`). Only a second pending prepared receive was refused (`prepareOwned`). `workerWorkspaceQueues.ts` does not exist in 410221ad, so this refusal path first reached production with 759890ca0.

### 2. Can automatic reduction meet it in production?

**Verified guards**
- An attempt starts only when both sync lanes are quiet (`automaticLocalRetention.ts:293-296`; `accountReceive.ts:4158-4167`).
- A receive pass releases its flight before its lane goes idle. So at attempt start no receive flight is held.
- "Check history" also cannot be pending at start: a fenced job occupies the Window queue, which counts in `pendingItems`, and readiness requires zero (`accountReceive.ts:3948`).
- The deferral check runs only when a lane starts (`accountSyncDriver.ts:130-134, 257`).
  - Under the settled phase 539 hold, no receive pass starts during the attempt.
  - Under the phase 540 tier, hint, online, authority, retry and dirty passes still start.
  - With no hold, after the 5-minute hold budget lapses, or after the 60 s poll deferral ends, any pass can start.
- The scheduler's quiet-sync check therefore protects only the attempt's start, not its end.

**Verified mechanics**
- Every receive storage job replaces the preparation token at call time (`accountCapture.ts:341`), at receive start and again at the final apply (`accountReceive.ts:1962, 2132-2133`). The read-only preparation then throws at its next guarded step, which becomes a skip.
- A prepared page receive calls its storage job in the same microtask chain as its `begin` (1962). So it interrupts the preparation rather than halting it.
- A fenced operation holds the flight across a Worker → Window → Worker round trip (`workspaceFence` → Window FIFO head and journal flush → `workspaceCommit`, `windowWorkspaceQueues.ts:103-121`) before it touches storage.

**The interleaving that halts (inferred)**
1. An attempt is running and its read-only preparation is near its end. This needs a non-full-check device, or a lapsed hold, or any device under the poll tier.
2. Something starts a fenced flight without a storage job in between: a hint-driven receive pass reaching `receiveHistory`'s install or an authority adoption, or the person tapping "Check history".
3. The Worker queues take the `'fenced'` flight, and its round trip to the Window begins.
4. Before that round trip returns, the preparation passes its last guarded check.
   - Commit case: `planLocalRetention` 540-543, then `contentStore` returns the prepared removal.
   - Save case: the signed delta's final `current()` check.
5. Nothing awaits between that check and the reduction's `enqueue`, as far as I traced: `finalApplyGate.settle` is microtask-only.
6. `removeLocalHistory` calls `enqueue` (3860), or `prepareLocalRemoval` calls `contextQueue.run(persist)` (1132). `begin` throws.
7. The fenced operation from step 2 then completes normally.

**How likely, and where it is likely**
- In production the preparation's last check must fall inside one Window round trip after a fenced operation begins, and a long preparation usually loses that race and becomes a skip. So it is rare.
- In the browser suite it is likely. The tests call `removeLocalHistory` directly with no scheduler gating (`lifecycle-owner.spec.ts:35, 306`; `removal-checkpoint.spec.ts:18`). They run tiny histories, so the preparation takes milliseconds. They also run paired receivers and history-handoff probes (`removal-checkpoint.spec.ts:5, 52`), which use fenced installs.

**The reverse collision**
- A receive starting while the reduction holds the slot for its save or commit: its `begin` throws a plain Error. The receive lane does not halt; it retries with 1-30 s backoff (`accountSyncDriver.ts:395-420`).

### 3. What the device does

**Verified**
- **Scheduler outcome.**
  - The error is a plain Error. `removeLocalHistory`'s catch converts only `MaintenanceInterrupted` and `ReceiveAuthorityChanged` (`accountReceive.ts:3880-3893`), so it rethrows.
  - The scheduler records `halted`, reason `owner-error`, ownerError `'Error'` (`automaticLocalRetention.ts:412-424`) and releases the hold.
  - `wake`, `refresh` and `retry` do nothing while halted (`retry` at 492-493), so "Check again" cannot recover it.
- **What the person sees.** "Automatic maintenance stopped because a storage or verification check failed. Lock and reopen this workspace before trying again." No button is shown (`LocalHistoryMaintenance.tsx:97-98, 125`). The last progress stage would be `coverage` in the commit case, or `opening`/`verifying` in the save case.
- **Nothing is written.**
  - `begin` throws before any Window job, reservation or seal.
  - `prepared.dispose()` erases the plan (3878) or the signed delta (1134). Earlier saved checkpoints stay on disk.
  - Sync continues.
- **Recovery** needs a new owner: lock and reopen, or a Worker restart.

**Inferred: the phone.**
- A halt can only happen after preparation finishes, and it stops for good with that sentence.
- Repeatedly starting "reading" and stopping partway is the ordinary token-replacement interruption (skip, "paused", retry after 10 or 60 s), which phase 540 already attributes to idle polls.
- So this path does not explain that symptom unless the halted sentence was also seen.

### 4. Smallest sound change, and how it fits change A

**Recommended: a typed busy refusal**
- Add a distinct error class, keeping the same message, thrown only from `begin`'s `flight` branch.
- In the reduction's two `enqueue` paths (the commit at 3860, the save at 1132), map it to `MaintenanceInterrupted` with a new condition, so the outcome is a skip retried after 60 s.
- Why it is sound: the refusal happens before any effect. Every refusal after `begin` keeps failing closed through `config.failed()`, and the test at 287 still passes because the message is unchanged.
- Size: about 10-15 lines in `workerWorkspaceQueues.ts` and `accountReceive.ts`, plus two cases (an outstanding prepare at save time, and at commit time).
- Optional refinement for the save: wait for the slot to clear, then call `enqueue` synchronously. The appended rows a receive writes do not invalidate the saved prefix, so the slice survives. For the commit, waiting gains nothing: the receive almost always changes the inventory, and the commit's preflight compare then skips anyway.

**Rejected**
- **Making the queues wait.** It changes a deliberate, pinned shared refusal and would also make receives wait behind long commits.
- **Holding receive during the commit.** It does not cover "Check history" or passes already started, and it delays hint-driven writing, which phase 540 rejected.

**Fit with change A:** they are independent. A cuts the number of fenced saves per reduction to roughly log H, so there are fewer chances to collide. Under the recommended change, a collision costs one attempt, which A already bounds to (1 + ρ) × setup. Total work stays proportional to history as long as collisions are rare.

**Not determined:** whether `refreshAuthority` or `whenDurable` always run a storage job before their fenced step (if they do, they would interrupt instead of halt); `live.run`'s unwinding; how often production passes reach `receiveHistory` installs or adoptions.
