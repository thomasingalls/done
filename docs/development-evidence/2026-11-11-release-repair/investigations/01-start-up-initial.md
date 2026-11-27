# Start-up, first pass

A delegated agent's report from 2026-11-11, filed as delivered. Read-only. Paths under `/private/tmp` were session scratch space and no longer exist; the supporting files that mattered are under [support](./support/).

**What happened next.** Its leading candidate, the tightened index eligibility, became phase 538. Its statement that the release switched automatic reduction on was later found unsupported: report 10 traced those flags to the 2026-10-28 release.

---

## Start-up investigation: desktop/phone + Account + sync (read-only; nothing run, built or edited)

Code read at HEAD; `git diff 759890ca0..HEAD -- src` touches only card UI, so the start-up path equals the release. Previous production is **410221ad**, not ed4923893 (530 README:37,59), but it is an ancestor of ed4923893 with no `src` difference, so `git diff ed4923893..759890ca0 -- src` is the release (164 files).

### 1. The message and what holds it
- Exact string: **"Input is waiting to be saved."** (`workspaceUi.tsx:317-320`, repeated per editor at `admittedEditor.ts:346-353`). Its sibling "Input is waiting for storage." needs `state === 'blocked'` and shows Retry/Discard buttons.
- Condition (verified): `pendingItems > 0`, the count of local **and remote** jobs in the Window's admission FIFO (`admissionQueue.ts:330`). One job runs at a time (`:971-995`); keys typed behind it are queued and not displayed.
- What must finish: the head job. Remote heads are created by:
  - the final apply of each received page (`windowWorkspaceQueues.ts:73-96`);
  - "fenced" Worker operations held for their whole duration (`admissionQueue.ts:1172-1214`): history-checkpoint install (`accountReceive.ts:3585-3599`), each compaction checkpoint save (`:1104-1112` via `workerContextQueue.ts:25-37`), and the compaction commit (`:3836-3852`).
- Every one of these waits on the Worker's single serialized storage queue (`accountCapture.ts:345-349`), behind whatever is already running.

### 2. Why it took many minutes at ~3,500 positions, and why compaction relieved it
Two mechanisms, both verified in code; which one the phone hit is inferred.

**A. Loss of incremental verification (most likely).**
- Unreduced devices verify incrementally only while an index stays eligible: at most 32,768 rows and 32 MiB (`incrementalAccountLedger.ts:88-116, 310-325`). Otherwise every ledger change runs the full reference check (`verifiedRecords.ts:207-211` → `accountReceive.ts:685-825`).
- Measured: the index charge was 25,969,753 of 33,554,432 bytes at 3,072 positions with the new dense rows (516 README), so the cliff is near 3,950 dense positions. The phone's rows are legacy ones that each embed a whole signed page (`inboundRecord.ts:44`); their charge is unmeasured.
- Measured: a full check costs 4.6–5.0 s at ~2,700 rows on a lab desktop, about 1.7 ms/row (release-hardening doc:113).
- Inferred arithmetic: 5–10k rows × 1.7 ms × 4–5 for a phone ≈ 35–85 s per ledger change. Each received page is one change; each synced edit is about three. Ten changes is 6–14 minutes.

**B. The first automatic compaction itself.**
- It starts at ≥1,024 records after 10 s quiet and visible (`automaticLocalRetention.ts:15-18`).
- Each attempt re-reads the whole inventory and re-hashes all previously saved work (`contentStore.ts:889`, `localRetentionPlan.ts:337-362`), does 2 s of fresh work (`retentionPreparation.ts:18, 413-415`), then saves under the Window fence, so the message reappears every slice.
- Total cost is quadratic in history. Interruptions discard the slice and wait 10–60 s.

Compaction relieves both: the device moves to a baseline plus suffix, which does not use that index.

**Will it grow back?** It can. Re-compaction needs a visible, idle 10 s window, sync idle and a 30-minute cooldown. It parks when the encoded baseline passes 4 MiB (about 2 MiB of snapshot) and halts on owner error until reopen. A phone used in short bursts may never get that window (inferred).

### 3. Sync sidebar
- It is a live mirror with no saved initial value: lanes start at `starting` with position 0 (`accountSyncDriver.ts:82-89`) and fill only when a step returns (`:245-265`).
- It waits, serially through one scheduler slot (`:94, 200-211`), on:
  - session resume: finish/acknowledge/renew POSTs, 10 s timeout each (`networkLogin.ts:79, 526-549`);
  - a send step of three or more storage tasks plus a submit (`:485-521`);
  - authority refresh, history fetch, and one read per publisher (`accountReceive.ts:4048-4098`).
- Why still slow after compaction (inferred): these are per-step costs. Every foreground, resume or pageshow invalidates the warm view (`accountCapture.ts:452-471`), forcing a full re-read and, on a reduced device, a whole-baseline replay (`contentStore.ts:459-498, 663-669`). Failures back off 1–30 s.
- I found no other history-sized term, so I cannot explain minutes here.

### 4. Start-up stages
1. Shell, config and router (`main.tsx:26-98`): blocks first paint, small, no network wait.
2. A Worker boots before the unlock form appears (`windowCeremonyUi.ts:193-224, 394-414`).
3. Unlock code plus passkey on every open (`AccountSetupApp.tsx:383-400`).
4. Blocking: preliminary verification reads, decrypts and validates everything and replays the document (`accountStartup.ts:57-358`).
5. Blocking: the live owner repeats that (`accountCapture.ts:236-265`).
6. Blocking: history is streamed to the Window in ≤128 KiB pages and replayed on the main thread (`accountWorkerOwner.ts:393-404`, `admissionQueue.ts:430-434`).
7. Background: session, sync, compaction at 10 s, audits at 5 minutes or 256 rows.

Measured on desktop: 3.59 s → 0.14 s at 1,201 positions after reduction; 5.96 s offline cold at 3,072 positions; the release gate is 15 s.

### 5. What the release changed, and what may be worse
- Index eligibility was tightened from raw record bytes to the owned graph (records + verified view + proofs). An unreduced device that qualified before can now fall off the fast path. This is the leading regression candidate.
- Automatic compaction was switched on (previous Dockerfile default 0; deployed flags are not recorded in the repo), so the quadratic first run happens right after upgrade.
- Verification moved to a Worker, which adds the stream and main-thread replay but is why the page shows a notice instead of freezing.

### 6. Earlier leads
- (a) Ledger revalidation at open: still true, twice per open.
- (b) Whole-page re-read per position: fixed for new rows only; legacy rows remain until compacted.
- (c) Device checkpoints: still off (`HISTORY_AUTO=0`).
- (d) Idle audit: shipped; not due at open; blocks receive when it runs.
- (e) F-17 per-keystroke cost: not on this path, not re-checked.

### 7. Cheapest confirming measurement
Use a profile build (`VITE_ACCOUNT_LEDGER_PROFILE=1`) on a copy of an unreduced ~3,500-position profile. In the Worker realm, read `__doneLedgerMetrics()` after one received page.
- Confirmed if `full` increments with `timings.full.maxMs` in seconds.
- Killed if only `incremental` moves.
- `test/inbound-index/past-index.spec.ts` already forces this fallback and could record the per-change time.

### 8. Questions for the operator
1. Was the many-minute wait before or after the 2026-11-08 update?
2. Did Menu → Data show "Reading saved history: X of Y records…" during it?
3. Was "compaction" the automatic device reduction or the manual "Prune covered history"?
4. Did typed characters appear late, or was the page frozen?
5. For the sidebar: how many seconds, and what do the Sending/Receiving lines and any `Reason:` code show while waiting?
6. Is the desktop reduced too?

### Files (all under /Users/thomasingalls/Code/done/.claude/worktrees/l2-onboarding-863db1)
- /Users/thomasingalls/Code/done/.claude/worktrees/l2-onboarding-863db1/src/ui/workspaceUi.tsx
- /Users/thomasingalls/Code/done/.claude/worktrees/l2-onboarding-863db1/src/crdt/admissionQueue.ts
- /Users/thomasingalls/Code/done/.claude/worktrees/l2-onboarding-863db1/src/crdt/incrementalAccountLedger.ts
- /Users/thomasingalls/Code/done/.claude/worktrees/l2-onboarding-863db1/src/crdt/accountReceive.ts
- /Users/thomasingalls/Code/done/.claude/worktrees/l2-onboarding-863db1/src/crdt/accountCapture.ts
- /Users/thomasingalls/Code/done/.claude/worktrees/l2-onboarding-863db1/src/crdt/contentStore.ts
- /Users/thomasingalls/Code/done/.claude/worktrees/l2-onboarding-863db1/src/crdt/automaticLocalRetention.ts
- /Users/thomasingalls/Code/done/.claude/worktrees/l2-onboarding-863db1/src/crdt/retentionPreparation.ts
- /Users/thomasingalls/Code/done/.claude/worktrees/l2-onboarding-863db1/src/crdt/accountSyncDriver.ts
- /Users/thomasingalls/Code/done/.claude/worktrees/l2-onboarding-863db1/src/crdt/accountStartup.ts
- /Users/thomasingalls/Code/done/.claude/worktrees/l2-onboarding-863db1/docs/release-hardening-2026-11-02.md
- /Users/thomasingalls/Code/done/.claude/worktrees/l2-onboarding-863db1/docs/development-evidence/2026-11-02-release-hardening/516-complete3072-reader-report/README.md
- /Users/thomasingalls/Code/done/.claude/worktrees/l2-onboarding-863db1/docs/development-evidence/2026-11-07-hardened-release/530-signed-arm64-candidate/README.md
