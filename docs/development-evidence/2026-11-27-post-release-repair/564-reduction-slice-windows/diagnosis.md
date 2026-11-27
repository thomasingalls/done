# Diagnosis behind phase 564 (lab 565i hand-back, 2026-11-27)

The delegated agent's diagnosis, filed as delivered to the coordinating session, before phase 564 was asked for. Paths under `/private/tmp` were session scratch space. The regrown seeds stay there; the run logs this phase relied on are in this directory. Labels: **[measured]** = measured in the lab, **[code]** = read in code, **[inferred]** = inferred from those two.

---

`report.md` was not written: the Write tool refuses report files from a subagent, so the hand-back was the report. The lab worktree `agent-a758f6dbf7501f911` at `5d0705fc2` held temporary instrumentation only. Nothing was committed or pushed.

## Cause, and how sure I am

**1. With the network on, a routine receive poll cuts every attempt after the 60 s window.** This explains the phone's earlier stops at "a few thousand" and "near 29,000".
- How it works [measured, with all clocks scaled; code]:
  - Each run gets one 60 s window of protection (the phase 540 deferral).
  - The first routine idle poll after the window ends cuts the attempt. That poll's first storage job replaces the preparation token: `receiveStatus` inside `driveReceiveStep`, run through `runCaptureTask` → `run()`.
  - Then comes a 60 s yield in which nothing is protected. Each retry (10 s after a priority-only cut) is cut by the next poll, 15 to 20 s later.
- **A device whose setup takes longer than 60 s never saves anything while online.** Setup means reading every row and re-hashing the saved work.
- A control that only stops the window from expiring makes the same device finish.
- **How sure:** high on the mechanism. That the phone's setup exceeds 60 s is inferred from it reaching about 89% of 32,635 records when the window ends.

**2. With the network off, nothing interrupts. The read → verify → "Input is waiting to be saved." → restart cycle is progress, not a loop.**
- Each cycle is one saved preparation slice, and the next cycle builds on it [measured]:
  - 156 cycles with 0 interruptions;
  - the count of saved receipts imported at each attempt's start rose every time;
  - it finished.
- **Why there are so many cycles:** the slice budget.
  - Formula [code]: budget = max(2 s, min(2·(setup + last save), time left in the window − last save)).
  - Inside the first 60 s deferral, "time left" counts from the run's first slice. During the yield, `protectedUntil` is `now`. Either way the budget falls to the 2 s floor once setup has eaten the window.
  - Offline, the deferral protects against nothing, yet it still caps the budget [measured].
- Each 2 s of new work then repeats a full re-read of every row, a re-hash of every saved receipt and a fenced save (that save is the banner).
- **How sure:** high that offline cycling is progress on the seed. The live devices' cycle counts are not reproduced, because the seed lacks their 3,999 received positions and their installed snapshots.

**3. The desktop's minutes per sent position is the full ledger check.**
- [code] 35,379 physical records is more than `INDEX_MAX_ROWS` = 32,768 (`src/crdt/incrementalAccountLedger.ts:94`). The desktop therefore keeps no continuation indexes, and every ledger change runs the full reference check.
- One sent position costs **six** full checks [measured]. With the bound forced low at 14,402 records, one card took 10.0 s, against 1.3 to 1.4 s on the incremental path.
- On a full-check device, phase 539's hold also parks new envelopes while an attempt is due or running. In the lab, one card waited 22.7 s, until the reduction finished [measured]. On a device whose reduction does not finish, the hold budget is 5 min per window [code].
- The phone, at 32,635 records, is 133 physical rows (about 17 sent positions) below the same bound [inferred].

## Reproduction

**Seeds**
- The phase 554 seeds were gone: `…/scratchpad/sc/snap-*` held empty directories, emptied when /tmp was cleaned on Nov 23.
- I regrew them with `scripts/performance/send-cost`: `SEND_COST_STEP=seed`, then `grow`, `SEND_COST_PORT=54611`, released flags with automatic reduction off.
  - 1,000 positions: 7,202 records, 4.4 MB of plaintext.
  - 2,000 positions: 14,402 records, 8.8 MB.
  - 3,000 positions was not finished.

**Build**
- Released flags: `LEDGER=incremental BATCH=coordinated-2000 RETENTION_AUTO=1 RETENTION_RESUME=1 RANGE_RECEIVE=1 HISTORY_AUTO=0`, `LEDGER_PROFILE` unset, `vite build --minify false`.
- A Worker-side event log records:
  - each attempt's start and end, with its deferral and `protectedUntil`;
  - stage progress and the slice budget;
  - receipts imported and saved;
  - every `MaintenanceInterrupted`, with its stack;
  - every ordinary storage job, with its stack;
  - full and incremental ledger checks.
- Knobs: `timeScale`, `pollHoldMs`, `noWindow`, `noReduce`, `indexMaxRows`.
- No logging on the service.

**Driver**
- The harness opens the packaged app, unlocks through the real form and passkey, opens Data → History, and watches.
- Network modes: `setOffline(true)` before unlocking, or online.
- It can add cards and records when the banner shows.

**Phone speed could not be done by throttling** [measured]
- CDP CPU throttling is refused on Worker targets ("only supported for pages, not workers").
- `taskpolicy -b` made opening about 900× slower, so it is unusable.
- Instead I emulated a device k× slower by dividing every scheduling constant by k: the 2 s floor, the 60 s deferral, the 60 s yield, the 10 s quiet, the 60 s retry, the 5 min hold and the poll interval. Phase 556 used the same equivalence.
- At ×100 the 1,000 seed's setup (1.0 to 2.6 s) is longer than its 0.6 s window. That is the phone's regime.

**Host contention**
- Another agent's packaged-account Playwright run (4 processes) overlapped every run.
- My own seed growth overlapped most of them.
- Counts and orderings are unaffected; timings come from a loaded host.

## Per-attempt evidence [measured]

**Online, ×20 (run r07, 1,000 seed).** The window is 3 s (stands for 60 s); polls every 0.75 to 1 s (stand for 15 to 20 s).

| # | start s | deferral | how far it got | what ended it | outcome |
|---:|---:|---|---|---|---|
| 1 | 0.9 | yes, 3 s | read 7,202/7,202, then verified 8,703 fresh results | deferral expired at 3.9 s; `receiveStatus` → queuePriority | cut, nothing saved: budget was window − setup, with no time for the save (`carriedMs` 0) |
| 2–4 | 4.5–6.6 | none (yield) | reading 3,136 / 4,896 / 4,512 records | next poll | cut |
| 5 | 7.8 | yes | budget at the floor after a cut | — | saved 1,195 |
| 6 | 9.4 | 1.4 s left | setup used the window up | poll | cut |
| … | | | the pattern repeats: about one saved slice per window and yield | | |
| 130 | 179 s | | | | reduced after 25 saves and 104 cuts |

- Every cut follows, by a median of 6 ms, an ordinary storage job from the receive lane: 78 `receiveStatus`/`driveReceiveStep` and 27 other `runCaptureTask`.
- This is the person's "one long run, then short ones" shape.

**Online, ×100 (run r08): setup longer than the window, the phone's regime.**
- 574 attempts in 421 s, all cut. Nothing saved, never reduced.
- Protected attempts reached 3,200 to 6,850 of 7,202 records; attempts in the yield were cut at 0.
- **Control (r09):** the same run with a deferral that never expires reduced in 2 attempts and 7 s, with 0 cuts. This knob also lifts the window cap on the budget; the cut stacks tie the stops to the polls.

**Offline, ×100 (run r06).** The floor is 20 ms (stands for 2 s).

| # | t s | reading s | verifying s | receipts imported | fresh results | save s |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0 | 0.6 | 0.6 | 0 | 284 | 0.2 |
| 50 | 81 | 0.7 | 1.0 | 5,889 | 42 | 0.3 |
| 100 | 189 | 0.9 | 1.1 | 7,671 | 40 | 0.4 |
| 156 | 343 | 1.0 | 1.1, then building, coverage, commit | 10,296 | — | reduced at 346 s |

- Every attempt was budgeted at the floor (deadline already past), every checkpoint was `ready`, and nothing interrupted.
- More than 98% of each cycle repeats earlier work, and that share grows: the re-hash went from 0.6 to 1.7 s.
- **Control (r14), the same run with no window cap (`noWindow`):** 2 attempts and 6.3 s, against 156 attempts and 346 s.

**Desktop speed, real time, offline**
- 1,000 seed: 2 attempts, 6.4 s.
  - Reading 0.5 s, verifying 3.1 s against a 2.0 s budget.
  - Saved 9,304 results in a 0.6 s save; the second attempt found them all and committed.
- 2,000 seed: 1 attempt, 7.8 s.
  - Reading 1.3 s, verifying 5.3 s, building 0.1 s, coverage 0.4 s, final check, install and readback 0.5 s together.
- So at desktop speed the seed never cycles more than twice.

**Sends, 2,000 seed, online**

| Run | Setup | One card, add → accepted | Work per sent position |
|---|---|---|---|
| r11 | incremental | 1.3 s and 1.4 s | 6 incremental checks of 3 to 6 ms |
| r12 | full check forced (`indexMaxRows` 8000) | 10.0 s | 6 full checks of 1.2 s; 2.4 s at opening |
| r13 | full check forced, reduction on | 22.7 s | The card arrived during a settled hold (level 3). Its input cut the attempt, the envelope waited out the hold, and the card was accepted 0.3 s after the reduction finished. |

**The banner**
- "Input is waiting to be saved." shows during every fenced save.
- It also flickers for about 0.1 s at every routine receive pass with nobody typing [measured, r11: every 16 to 18 s].

## Can it ever finish?

**Phone with the network on: no.** Its reading alone outlasts the protected window [scaled; phone timing inferred].

**Phone with the network off: yes in principle, but slowly** [inferred]. Each cycle costs setup (more than 60 s of reading plus a growing re-hash) + 2 s of new work + a save, and the cycle count is about V / 2 s, where V is the total fresh verify work.
- The seed's V on this desktop is 2.5 to 3 s at 7,202 records and 5.3 s at 14,402 [measured], so about 12 s at 35,000 [inferred].
- The live devices also verify 3,999 received positions each, against 101 to 201 in the seed, so the live V is larger by an unknown factor.
- Taking the phone as about 25× slower than this desktop (from its reading time) gives at least about 150 cycles of at least 75 s each. That is several hours of untouched, screen-on quiet.

It also needs all of the following [code]:
- **Fewer than 256 saves** (`PREPARATION_MAX_CHUNKS`). Past that, the journal is full and the rest runs as one pass that cannot pause.
- **No interruption** at all.
- **Every allocated position already accepted** by the time it reaches Building. Otherwise `summarizeBaseline` refuses `ineligible` (`localBaselineReplay.ts:497-504`). Unallocated sources are fine.

**Desktop** [inferred]
- Being on the full check, its hold gives slices of up to 2·(setup + save) inside 5 minute windows. It should finish in far fewer cycles than the phone.
- I cannot confirm from here whether it is progressing; the screen looks the same either way.

## What a person can see

- The screen shows only the stage, the record count and the banner, so a cycle that saved and one that lost its work look identical.
- Weak signs of progress:
  - "Verifying saved history…" gets slightly longer each cycle;
  - "Maintenance paused…" never appears offline, because it appears only after a cut;
  - the final cycle shows "Building…" and the later stages.

## The coordinator's other questions

**Membership repair**
- Never queued in any run [measured].
- It fires only on a remote event when cards have membership issues [code], so it cannot fire on an idle offline device. The seed has no such issues, so the lab cannot show this path.

**Installed snapshots**
- The seed has none.
- They matter at Building, through the `snapshot-size` limit [code].
- They would matter to the cycle only if the content records exceed one preparation value: 32 MiB, or about 26,214 records [code]. Then coverage checks run uncached in every cycle. The seed's content is 1,102 records and 27 KB at 7,202 rows.

**Full-check conditions at HEAD** [code, `incrementalAccountLedger.ts`]. Any one of these puts a device on the full check:
- more than 32,768 physical records;
- more than 32 MiB of plaintext (`INDEX_MAX_BYTES`);
- more than 32,768 logical rows: physical rows plus each receipt's extent − 1;
- more than 32,768 sources across outbound rows;
- receipt extents without a proof-byte observation;
- counter version ≠ 2;
- after an extension, more than 32,768 rows of work;
- `LEDGER=reference`.

`updateIndex(bounded)` in `inboundLedger.ts`, the 4 MiB / 4,096-entry positive coverage cache, is a cache that clears itself. It does not decide the full-check path.

**Prune**
- It clears only that account's verified tips on the service (phase 553). The next submit or read re-verifies once: 0.6 to 0.75 s at about 1,000 rows in phase 553, seconds at about 4,000 positions [inferred].
- I found nothing on the device side that would make the next send slow.

**What a person can read to tell the cases apart**
- Nothing on screen shows the full-check state.
- If sending is slow only while History shows a running or queued stage, that is the hold.
- If it is slow at every send, that is the full check.

## Repairs (proposed, not built)

1. **No window cap when the receive lane cannot run.** Pass no `protectedUntil` while the gate is not `ready`.
   - Measured effect: offline slices grow to 2·(setup + save); the r14 control gave 2 cycles instead of 156.
   - Leaves exposed: the online case.
   - Amends phase 556 change A ("never past the moment sync resumes").
2. **Reserve the save in the first protected slice**, using an estimated save time before the first one is measured.
   - Stops the protected attempt from losing its whole slice (r07 attempt 1 lost 8,703 results).
   - Leaves exposed: a setup longer than the window still saves nothing.
   - Amends phase 556.
3. **Size the poll deferral to the measured setup** (until the first save, bounded by k × setup) instead of a fixed 60 s.
   - The online phone could then save one slice per window.
   - Leaves exposed: incoming edits arrive later.
   - Amends phase 540's unmeasured 60 s.
   - Repairs 1 to 3 leave **phase 83 unchanged**. Letting polls wait behind preparation instead would amend it.
4. **Cut the per-cycle repeat.**
   - E from investigation 10: saves of O(H + slice) instead of O(H + W).
   - Check saved receipts lazily instead of re-hashing all of them every attempt.
   - This makes cycles cost about their new work.
   - E needs the operator's amendment of the exact authenticated readback decisions.
5. **The full-check cliff.**
   - Index past 32,768 rows.
   - At least, don't let phase 539's hold park sending on a device whose reduction cannot finish quickly.
   - Amends the phase 554 index gate.
6. **A "verified N of M" line** in the History panel, from the journal's statistics. Display only.

## Usable on the live devices today, without a new build

**Phone**
- Turn off both Wi-Fi and mobile data. Keep it plugged in, screen on, the page visible, and don't touch it.
- That removes the only interrupter found; every slice then saves.
- Expect many cycles at the 2 s floor.
- If it ends with "not ready for a safe reduction": reconnect until Sending is idle, then go offline again. Saved progress survives as long as rows below the saved prefix don't change [code].

**Desktop**
- Same: network off.
- Don't judge its reduction by how fast it sends; it is on the full check (35,379 > 32,768).

**"Check again"**
- It resets the yield and the hold [code], which buys one new 60 s window.
- It doesn't help the phone online.

## What the lab lacks compared with the live account

- **Received positions:** 101 or 201 in the seed against 3,999 on each live device. These dominate V and the full check: the full check is 1.1 to 2.4 s here, against the 4 to 5 min reported live.
- **Installed snapshots:** none in the seed.
- **Record size:** about 600 B per record here against about 900 B live (near 32 MiB at 35,379).
- **Scale:** no seed at 32,000 to 35,000 records. Growing to about 4,900 positions would take about 2 h.
- **Device:** no real phone, and no CPU throttling for Workers.

## Not reproduced or not run

- **"Service stopped" mode** (online, requests refused): not run. From the code, the gate stays `ready`, and each failing pass's first storage job would cut like a poll does, on the retry backoff.
- **Content compaction:** never ran. From the code, compaction would make the saved checkpoint stale, which loses all saved progress. It needs at least 128 content changes since opening.

## Incidents

- My first lab run listened on `[::1]:54611` while my growth run's browser resolved `localhost` freely. Growth stalled at 1,818 positions. I discarded that copy and regrew from the 1,000 snapshot, with growth pinned to 127.0.0.1 and lab runs to `::1`.
- Some `run.sh` launches failed at once because the lab port was still busy, and left empty work directories, which I deleted.
- Nothing overran its bound.
