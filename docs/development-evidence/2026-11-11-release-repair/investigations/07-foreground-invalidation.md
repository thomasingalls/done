# What returning to the app costs, and what the invalidation protects

A delegated agent's report from 2026-11-11, filed as delivered. Read-only at `ff8578cd0`. Paths under `/private/tmp` were session scratch space and no longer exist; the supporting files that mattered are under [support](./support/).

**What happened next.** Its option G was built in phase 545. Options E and F are held for the operator: see WARM-BYTE-COMPARE and WARM-REAL-SUSPENSION in the product backlog.

---

## Foreground invalidation: what it costs, what it protects, and other ways to keep the guarantee

This was a read-only pass at tip `ff8578cd0`. I made no edits and ran no builds or tests. Line numbers for `contentStore.ts` are from the committed version (HEAD); the other agent's working-tree edit near line 1093 shifts everything after it by 5. All paths are under `/Users/thomasingalls/Code/done/.claude/worktrees/l2-onboarding-863db1/`.

**Short answer:**
- On the reduced phone, every return to the app throws away a cache that would otherwise let it skip work. The first sync job after that re-decrypts the whole baseline (up to 8 MiB) and replays it in full. Re-running a deterministic replay on bytes that have not changed detects nothing new.
- The threat the invalidation answers is damage to stored bytes made by something other than this app while it was hidden. Comparing every stored byte with what the app already verified catches that damage just as well, at far lower cost. The unreduced desktop already does exactly this on return.
- I recommend making the phone do the same, and fixing a gap I found by reading where the code can skip the check it promises. Measure on the real devices first.

### 1. What happens on foreground today

**Verified by reading:**
- **Event path.** The page forwards `visibilitychange`, `freeze`, `resume` and `pageshow` to the Worker:
  - `src/crdt/accountWorkerClient.ts:483-493` sends them.
  - `src/crdt/accountWorkerOwner.ts:493-496` and `src/crdt/accountWorkerRuntime.ts:101-111` re-dispatch them inside the Worker.
  - `src/crdt/runtimePorts.ts:60-71` delivers them to the listeners.
- **Handlers** (`src/crdt/accountCapture.ts:452-482`):
  - Becoming visible, `resume` and `pageshow` all call `invalidate()` (lines 453-458). Hiding and `freeze` only revoke the shadow token and the final-apply permission.
  - `invalidate()` does four things:
    - It changes the shadow-activity token, which interrupts reduction preparation and warm audits in flight.
    - It revokes the final-apply permission.
    - It sets `forceFullRead = true` (`contentStore.ts:1633-1635`).
    - It calls `invalidateAuthority` (`src/crdt/accountReceive.ts:447-454`). That withdraws ledger hints, replaces the retention-authority stamp, discards the shadow baseline candidate and clears the custody-authentication memo.
- **Nothing runs at the event itself; the first storage job pays.** Returning wakes sync at once: `src/account/notifications.ts:124-131,146-147` calls `wake('resume')`, which reaches `accountReceive.ts:4211-4220` and becomes `scheduler.wake('remote')`. The capture listener was registered first, so the flag is already set when the receive pass's first storage job runs. Every send or receive is serialized behind that job on the storage queue (`accountCapture.ts:336-379`).
- **Work in that first job** (`contentStore.ts:666-689` and `openSnapshot` at 373-574):
  - **Constant:**
    - The counter MAC check (386).
    - Full custody re-authentication, because the memo was cleared (`src/crdt/accountAuthority.ts:77-87`). It is bounded by the custody inventory, not by history.
  - **Proportional to saved records, on every device:**
    - One read of every row with its keys (`read(task, true)`, 258-296).
    - Parsing, sorting and a byte comparison of every row against the cached copy (389-411).
    - A copy of every plaintext (412). Rows whose bytes are unchanged are not decrypted again (420-428).
  - **Unreduced device with no baseline (the desktop that never reduced):**
    - The view identity is unchanged, so `verified.verify` returns after another byte comparison (`src/crdt/verifiedRecords.ts:163-170`).
    - There is no crypto and no ledger work. The cost is a read, byte comparisons and copies over more than 32 MiB.
  - **Reduced device (the phone):** a forced read turns off exact reuse (666), and reduced warm owners never qualify for it anyway (462-464). So the job:
    - Reads the baseline chunks.
    - Decrypts all of them (492).
    - Replays the baseline in full through `verifyCompleteLocalBaseline` and then `replayLocalBaseline` (`src/crdt/localBaselineShadow.ts:151-212`, `src/crdt/localBaselineReplay.ts:668-860`). The replay includes:
      - an HMAC check and a SHA-256 hash of the payload;
      - building the document state twice (710, 849);
      - inspecting every received record;
      - checking signatures on the spool, deliveries and receipts;
      - running the self-consistency comparison (`baselineReuse.compare`, 510-517).
    - Validates and clones the view, then rebuilds the continuation cache, whose index pass covers every record (546-560, `src/crdt/localBaselineReuse.ts:70-131`).
  - **Unreduced device that holds a baseline without having reduced:** forced reads also turn off the exact reuse this release added for such devices. The job then replays the whole history from zero, replays the baseline, and compares the two (`localBaselineShadow.ts:169`). This is the most expensive case. I could not tell whether the desktop is in this state.

**Inferred by reading (not reproduced):**
- **A replay multiplier.** `replayLocalBaseline` calls `verifyInboundCoverage` once for each carried source capsule (713-731) and once for each source in the record census (837-847).
  - Each call builds a new Yjs document (garbage collection off) from the full snapshot plus every suffix update (`src/crdt/inboundLedger.ts:485-505,561-572`).
  - So one replay costs roughly (number of source capsules since the last reduction + 3) × (snapshot + suffix).
  - On the phone this grows with every edit until the next reduction, and cold start pays it too.
- **The code can skip the check it promises.** `load()` clears the flag *before* the read (666-667). An interruption keeps the old view without restoring the flag (690-695). The warm audit consumes a pending forced read in the interruptible maintenance lane (1652-1655).
  - The race: on return, the overdue five-minute audit can start first. The receive pass's queued job then interrupts it (`accountCapture.ts:401-411`). The receive pass then takes the warm path, and no full read happens before reuse.
  - `test/localBaselineWarm.test.ts:193-214` pins exactly this behaviour on purpose for semantic audits. No test covers it for resume.
- **Possible double cost on bfcache restore or Chrome `resume`.** If a second invalidating event arrives while the first full read is running, line 678 starts a second full read.
- **Line 412 on the desktop.** The spread `opened.push(...copyRecords(...))` is on this path. Phase 542 recorded that Chromium throws when spreading about 200,000 arguments. The desktop's row count is unknown.
- **Cross-reference for the reduction-slicing agent.** Every hide also interrupts reduction preparation (`accountCapture.ts:460-468`), and every show invalidates `retentionAuthority` (`accountReceive.ts:1100-1111`).

### 2. The threat it answers: documents versus code

What the documents say:
- `docs/decisions.md:4472-4485` (2026-10-12): "Full verification remains mandatory at acquisition and before reuse after hidden/frozen-page resumption." The entry gives no threat list.
- `docs/account-warm-ledger-loads.md:71-74` gives the only stated reason: "a frozen/suspended browser does not run timers… Visibility return, `pageshow` and `resume` invalidate warm reuse so the next load performs a full read."
- The surrounding threat model, from the same file:
  - Line 14: the owner keeps using "prior authenticated memory; this does not claim to prevent database corruption or detect a coherent rollback with no external witness".
  - Line 53: "Conforming other writers are excluded."
- `docs/account-authority-authentication-reuse.md:41`: "The pre-existing exclusive-writer assumption still governs…"
- `docs/TRD.md:849-850`: "Suspended holders may delay completion indefinitely. Reacquire and recensus after interruption."
- `docs/TRD.md` §10.9 (around line 2050): same-origin code is inside the encryption boundary.

So what it actually protects against:
- **Not another tab or Worker.** The page holds the exclusive slot-wide lock `slot/worker-supervisor` for the whole session (`src/crdt/nativeCoordination.ts:38-46`, `src/crdt/accountWorkerJoin.ts:18-31`), and that does not change while hidden. Any writer that follows the protocol must also change the authenticated counter. Every warm load already re-reads and authenticates the counter and checks each store's count and first and last key (`contentStore.ts:597-603`, `src/crdt/warmContent.ts:62-117`).
- **Not storage eviction.** The next counter read fails anyway.
- **Not a bfcache restore.** As I understand Chrome's behaviour (not verified here), a restored page never lost its lock.
- **What remains:** a change to a row's bytes in place, with the same key and the same shape, by something outside the app (corruption, devtools, editing the files), while the audit timers were stopped. That is, restoring the integrity check and the audit's time bound after a suspension.

Where code and documents disagree:
- "Full verification" means different things by device. On the unreduced desktop the resume check is physical only: bytes compared with already-authenticated memory. On the reduced phone it is a full cryptographic and semantic replay that also runs the self-consistency check. The code comment at `contentStore.ts:1674` (HEAD) says that check "stays in interruptible maintenance, never moved to a typing task", yet invalidation puts it on the first foreground job.
- The interruption gap above means "before reuse" is not always enforced.
- The authority-memo invalidation re-authenticates custody bytes that every check already compares byte for byte (`accountAuthority.ts:77-81`).

### 3. Alternatives

| Option | Guarantee | Foreground cost | Size and files |
|---|---|---|---|
| **A. Re-check only the authenticated counter or head** | Weakens one thing: an in-place change made while hidden is caught only by the rolling audit after return, not before first use. This is already what every warm load does. | About 5 ms (key-count check measured at 10,000 keys) | Remove one call in `accountCapture.ts`; mark the audit due |
| **B. Know whether another context could have written (locks, BroadcastChannel, single Worker)** | The same as A. The lock already rules out every app writer for the whole session, and nothing in B can see writers outside the app, which are the remaining threat. | Same as A | Same as A |
| **C. Keep the view readable, verify in the background, gate only writes** | Gating writes still stalls send and receive. Without the gate it becomes "integrity confirmed within one background pass after return": the ordering weakens. The code already lands here in the interruption race. | Little or none | `accountCapture.ts`, `contentStore.ts` |
| **D. Defer until the first dependent operation** | Already deferred, but the first operation is the receive pass that returning triggers, so in practice it runs at once. A real version must decide which operations rely on old stored bytes. Reduction and compaction already take their own full census; acknowledgements that let the service prune would need the gate. Weakens routine operations to audit latency. | Low | Moderate; the risk is in classifying operations correctly |
| **E. Physical-only resume: reuse the completed replay when every row and chunk is byte-identical, the counter is authenticated and the authority pin matches** | Equivalent for this threat: every stored byte is still checked before reuse. It gives up only the self-consistency check at resume, which keeps running on its own schedule. This is the guarantee the desktop path already accepts. One condition to confirm: the replay's result depends only on the bytes and the authority, with no wall-clock expiry inside the replay. I did not check this exhaustively. | Reading every stored byte and comparing it, with no AES, HMAC, SHA-256, Ed25519 or Yjs work. Removes the source-capsule multiplier from resume. Does not help the desktop, which already works this way. | Small to moderate: `contentStore.ts` (separate a physical invalidation from a check-everything invalidation, and let reduced warm owners use the existing exact-reuse path at 462-490), `accountCapture.ts`, possibly `localBaselineReuse.ts`. Tests: `warmContent`, `localBaselineWarm`, `localBaselineExactReuse`. Needs an operator amendment of the 2026-10-12 decision wording. |
| **F. Invalidate only after real suspension** (a `freeze`/`resume` event seen, a gap in a Worker heartbeat, or hidden for longer than `WARM_AUDIT_MS`) | Keeps exactly the stated reason (stopped timers). A short time hidden is treated like time visible, which is already accepted. | Removes desktop tab-switch reads; the phone is mostly unchanged | `accountCapture.ts` only |
| **G. Close the interruption gap** (clear the flag only after a full read succeeds) | Brings the code back in line with the decision | Slightly more foreground work in the race | `contentStore.ts`, plus one test |

Making the replay itself resumable does not reduce the total work. It only helps combined with C.

### 4. Did the release change this?

The handler's behaviour is unchanged between `410221ad` and `759890ca0`. The old `accountCapture.ts` used the same events and the same `invalidate`/`visible`/`freeze` bodies directly on `document`. Three things did change:
- The owner moved into a Worker. `accountWorkerClient.ts`, `accountWorkerRuntime.ts`, `runtimePorts.ts` and `workerActivity.ts` are all new. A forced read that used to freeze the screen now blocks the storage queue instead, so it shows up as slow sync. This is inferred.
- `contentStore.ts` gained exact reuse for unreduced owners that hold a baseline, but forced reads still turn it off.
- Off the release, phase 542 raised the baseline write ceiling to 8 MiB, which enlarges the phone's replay.

Whether the reduced replay path is new to production depends on whether `410221ad` was built with `RETENTION_AUTO=1`. The repository does not record that. The 10-28 release image did compile it (`docs/development-evidence/2026-10-28-resumable-sync-release/README.md:19`), and `410221ad` was a Node-only update, so it was probably not new.

### 5. Recommendation and the measurement to run first

**Recommendation:** E plus G for the phone. It keeps the guarantee and moves the full self-consistency replay back into the background lane, where the code says it belongs. Offer F to the operator as a separate judgement for the desktop, whose remaining cost is the physical read itself. Leave everything alone if the measurement below shows the post-return job is small.

**Measure first, on the real phone and desktop.** Use a branch-tip build with `VITE_ACCOUNT_LEDGER_PROFILE=1` and otherwise the release flags. The metrics live in the Worker's global (`__doneLedgerMetrics`), so the harness has to read them there. For each foreground, record:
- whether it was a resume or a cold start (same Worker incarnation or not);
- time from the event arriving in the Worker to the end of the first storage job, and to sync status reaching idle;
- `storageQueueWait`, `physicalRead`, `loadElapsed`, and the counts `baselineFullReplays`, `warmLoads` and `authorityAuthentications`;
- baseline encoded size, suffix rows, and number of source capsules since the last reduction.

Alternate this with a variant build that skips `invalidateWarm` on becoming visible, to isolate its share.

**Stop rule:** under about 300 ms, or under about 10% of time to sync ready, on the phone means leave it. Seconds dominated by replay means build E plus G.

An optional cheaper first step in Node, using the phase 542 size probe: time a forced read against a warm load at 2, 4 and 8 MiB baselines with 0, 50 and 200 suffix capsules. That tests the inferred multiplier; it does not replace the device run. For reference, phase 542 measured cold reopen at 0.26, 0.52, 1.1–1.2 and 2.1–2.3 s for 4, 8, 16 and 32 MiB. That was Node on a Mac with an in-memory IndexedDB and a freshly reduced, near-empty suffix, so treat it as a floor.

### What I could not determine
- Whether the slow sidebar happens on cold opens or on resumes. If it is cold opens, this invalidation does not explain it, and iOS installed web apps often cold-start after being backgrounded.
- The real sizes on either device.
- Whether the desktop holds a baseline without having reduced.
- `410221ad`'s build flags.
- Browser behaviour: whether overdue Worker timers fire before the forwarded event arrives; whether WebKit keeps the Web Lock and the IndexedDB connection through an installed app's suspension; Chrome bfcache with a held lock and a Worker.
- Whether the replay depends on wall-clock time.
- Whether the interruption gap and the double read happen in practice. Neither was reproduced, per the ground rules.
