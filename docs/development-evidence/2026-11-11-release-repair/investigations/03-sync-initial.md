# Sync taking twenty minutes and not finishing, first pass

A delegated agent's report from 2026-11-11, filed as delivered. Read-only; nothing measured. Paths under `/private/tmp` were session scratch space and no longer exist; the supporting files that mattered are under [support](./support/).

**What happened next.** Led to phases 538 to 541. Its send-path leads are developed in report 09.

---

## Sync investigation: report (read-only; nothing run, nothing measured)

Root for all paths: `/Users/thomasingalls/Code/done/.claude/worktrees/l2-onboarding-863db1/`. Previous production source is `410221ad`; local `main` has no `src`/service diff from it. HEAD's `src/crdt` and service code equal `759890ca0`.

### Bottom line
- **20+ minutes does not fall out of the shipped receive loop at ~3,500 positions.** It needs one of: a slow strict-FIFO sender, a device still doing a full ledger check per change, or a receive lane stuck in retry/halt.
- **"Responsive app" does not rule out CPU.** The account owner runs in a dedicated Worker (`src/crdt/accountOwner.worker.ts`, `accountWorkerOwner.ts:317-341`), so heavy ledger work leaves the UI thread free.
- **Service pruning does not shrink any device's local ledger.** Only per-device local reduction does.

### Best two causes for "responsive, many minutes, newest edits never arrive"
1. **Strict FIFO sender behind slow per-position work (~45%).** The newest edit is always last in the queue. This is worst on a device that is not locally reduced and is past the index bound; the desktop was interrupted mid-compact, so it is the suspect.
2. **Receive lane in retry backoff or halt left by the snapshot and prune (~30%).** Reads into the pruned range get 409 `unavailable`, or the snapshot install is refused, skipped or times out.

**One observation, both devices, Menu sync details, watched for 60 s:** each lane's phase, its number, and any `Reason`. Converged means each device's "Received positions" equals the sum of both devices' "Accepted position" (inferred from `accountReceive.ts:1290-1292` and `accountSyncDriver.ts:250-260`).

| What you see | Meaning |
|---|---|
| `Sending: working`, Accepted creeping, no Reason | Cause 1; the rate gives seconds per position |
| `Receiving: retrying` + `receive:network-unavailable` or `receive:request-expired`, stale "Last successful receive check" | Cause 2 |
| `blocked` + `receive:inbound-size` / `integrity` / `send:closed` | Halt |
| Both `idle` but numbers disagree | Cursor or receipt mismatch |

Also read the desktop's Menu → "History on this device" text: it says whether local reduction completed.

### 1. Cost model (verified structure; numbers from the project's own lab docs)
- **"Received positions"** is the sum over all streams, own plus peer, of the verified contiguous prefix (`accountReceive.ts:1290-1292`, `SyncNotice.tsx:92`). A position is one envelope of ≤32 sources / 64 KiB (`spoolRecord.ts:38-39`). Typing produces about 7.3 positions per 100 keys (phase 482).
- **One scheduler slot** is shared by send and receive (`accountSyncDriver.ts:92-94`, alternation at 203).
- **Receive turn:** one flight at a time (`accountReceive.ts:3622`), one `read-v2-batch` POST carrying ≤8 positions (2 requests × 4; `receiveLimits.ts:2,5`). The next turn is due after 0 ms on progress.
- **Send:** only position `acceptedThrough+1` (`accountSyncDriver.ts:496-508`, `accountDelivery.ts:382`, server `delivery.ts:1183`), then 50 ms. Per position there are about 5 spool appends and many loads.
- **History-sized work per operation:** a byte compare of all rows per load (`verifiedRecords.ts:172-173`), cloning the delivery census (`accountReceive.ts:3046-3054`), and decoding every source capsule per new envelope (`accountEnvelopePreparation.ts:61-109`).

| Delay | Value | Where |
|---|---|---|
| Retry backoff | 1→30 s | `accountSyncDriver.ts:306-308, 354-355` |
| Hints ignored while failing | — | `accountSyncDriver.ts:387-390` |
| Idle poll | 15-20 s healthy, 5 s otherwise | `accountSyncDriver.ts:66-67` |
| Send batch hold | 300 ms quiet / 2 s max | `accountBatchPolicy.ts:12` |
| HTTP deadline | 10 s | `privateDeliveryHttp.ts:18`, `historyHttp.ts:37` |
| Read request lifetime | 30 s, rechecked at commit | `accountReceive.ts:1359, 2350-2354`; server `delivery.ts:1481` |
| History catalog recheck | 5 s | `accountReceive.ts:1751` |
| Quiet reuse | 750 ms | `receiveSelection.ts:82` |
| Audit due | 256 rows or 5 min, forced at 1,024 | `warmContent.ts:26-27`, `warmAuditStart.ts:3-4` |
| Local reduction | ≥1,024 records, 10 s quiet, 60 s retry, 30 min cooldown | `automaticLocalRetention.ts:15-18` |

**Wall time (inference from lab numbers):**
- **Receive, indexed:** 17.6-22 ms per position on loopback (phases 516/520), plus about 18 ms per position at 50 ms injected delay. That puts 3,500 positions at roughly 3 min on a desktop and under 15 min on a slow phone. 20 min needs about 20k positions.
- **Send:** 0.35-0.7 s per position at small history (phase 334) and 1.8-2.6 s at 2-3k positions (phases 316/491, upper bounds). 20 min is a backlog of 500-3,000 positions, fewer on a slow phone.
- **Past the index bound:** the limit is 32 MiB owned bytes or 32,768 logical rows (`incrementalAccountLedger.ts:88-117, 311-325`). Every ledger change then runs the full check (`verifiedRecords.ts:211`, `accountReceive.ts:685-825, 883-889`). The lab measured 0.4-1.7 ms per row. A sent position needs 4-5 changes, so 20 min is only tens of positions.
- **Is 3,500 large?** Yes for this bound. The largest timed fixture, 3,072 dense positions, charged 25,969,753 of 33,554,432 bytes (phase 516). This account's receipts are mostly pre-release rows.
- **Why it began on 11-08:** the release added owned-byte and proof-byte charging to eligibility. `410221ad` charged raw record bytes only.

### 2. Ways it fails to finish
- **Pruned range:** a read reaching a pruned row returns `unavailable` (`delivery.ts:1552`). The client sees `unknown`, backs off to 30 s, and the sweep stops at the failing stream (`accountSyncDriver.ts:459-465`).
- **History first:** every receive turn runs the snapshot step before the sweep (`accountReceive.ts:4062-4090`).
  - A download over 10 s loops with no sweep.
  - An install over 4 MiB halts with `inbound-size` (`historyInstall.ts:69,155`).
  - Other install errors halt with `integrity`.
  - After local reduction a cut can be refused and silently skipped (`accountReceive.ts:1867-1875`, `retentionCheckpoint.ts:29`), leaving the cursor under the pruned floor.
- **Request expiry:** a turn longer than 30 s is discarded at commit (`receive:request-expired`). A device clock more than 30 s off is refused on every read.
- **Silent gate:** storage pressure pauses both lanes with no notice (`accountReceive.ts:3581-3582`, `SyncNotice.tsx:14`).
- **Worker handoff:** the storage task is held through the Window's apply (`acknowledgedReceive.ts`). Any handoff failure closes the owner and forces a cold reopen (`workerWorkspaceQueues.ts:106-110`).
- **Audits:** foreground work interrupts them and they restart from zero (`accountCapture.ts:397-410`).
- **Send halts:** a signed refusal gives permanent `closed` (`deliveryRecord.ts:53-61`), but only generation refusals produce one (`delivery.ts:1196-1205`), so it is unlikely here. Unsigned refusals retry every 30 s forever, shown as `send:network-unavailable`.

### 3. Maintenance, pruning and the index fallback
- **Index fallback after pruning:** still possible on any device that has not completed local reduction. The phone reduced, and reduced mode rebuilds indexes on a small set (`localBaselineReuse.ts:118-125`), so it is probably out. The desktop is unknown.
- **Reduction cannot start on a busy device:** it requires both lanes idle or blocked, no pending input and a visible window (`accountReceive.ts:3915-3925, 4110-4116`). A device that is always working or retrying never qualifies.
- **Did the unconverged state strand the desktop?** Prune has no check of reader progress (`historyCheckpoint.ts:554-587`). A behind reader depends entirely on snapshot install. That strands receive, not sign-in.
- **For the sign-in agent (inference):**
  - Publish/admit/prune wipe server caches (`historyCheckpoint.ts:134-135, 676`) and re-verify every stream on the server's one thread, per a sub-investigation. A long phone prune could time out another device's 10 s sign-in requests.
  - A snapshot producer keeps the whole checkpoint in its custody record (`custodyRecord.ts:69, 86-90`), and that record is re-read on every authority check (`accountAuthority.ts:63-80`).
- **Sender as bottleneck:** yes, see cause 1.

### 4. Leads at 759890ca0
| Lead | Status |
|---|---|
| (a) single slot, stop-and-wait | True. Receive now batches ≤8; send is unchanged |
| (b) whole-page re-parse | Repaired per docs (phases 367-413); not re-verified in code |
| (c) ledger cost grows with history | Partly true: per-load compares, audits, and everything past the index bound |
| (d) maintenance never completes | Lab case repaired (phases 336/337/469); the 60 s retry and quiet-sync precondition remain |
| (e) history fence | True, but history waits for receive (`historyReceiveFence.ts`); receive is not fenced |
| (f) 750 ms / 300 ms | True |
| (g) no real RTT | True; only 0 or 50 ms loopback was ever timed |
| (h) capacity halts | Now a "park" of local reduction only; sync continues |

### 5. Cheapest confirmations (named, not collected)
- **Cause 1:** the desktop's Accepted position rises no faster than one per several seconds with a pegged worker thread. Row counts of the desktop's IndexedDB `content` + `heads` + `outbound` stores.
- **Cause 2:** the Reason code. In DevTools Network, `read-v2-batch` answering 409 `{"reason":"unavailable"}`, or `/account/history/v1/checkpoint` cancelled at 10 s.

### 6. Questions for the operator
1. The sidebar readout above, both devices.
2. Did the desktop's local reduction ever complete?
3. If both devices stop editing, do they converge, and how long does it take?
4. Which direction is worse?
5. Are both device clocks within 30 s of true time?
6. How large is the Markdown export (against the 4 MiB install limit)?
7. What are the server pod's CPU limit and restart count?

### Verified versus not
- **Verified by reading:** every file:line above.
- **Sub-investigations, spot-checked only:** the server cost claims and the send-side tallies. I corrected one: catalog reads do not wipe server caches.
- **Inferred:** this account's row and byte counts, all wall-time estimates, and the ranking percentages.
