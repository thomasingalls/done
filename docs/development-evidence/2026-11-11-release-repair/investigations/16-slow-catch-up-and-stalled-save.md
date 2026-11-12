# Slow catch-up on a reduced device, and a save that never finishes

A delegated agent's report from 2026-11-12, filed as delivered. Run in copies of `2277ef5db` and `7e6aff636` with three devices, a profile build and trace hooks; load averages are given with the timings. Paths under `/private/tmp` were session scratch space and no longer exist; the supporting files that mattered are under [support](./support/).

**What happened next.** The operator queued a fix for each on 2026-11-12: completing the background replay's follow-on steps instead of discarding it, and splitting or cleanly refusing an action over the 16 KiB journal limit. Neither was built when this was filed.

---

## Summary

Both behaviours reproduce, and neither is caused by load.

1. **Slow catch-up: a defect that phase 545 made cheaper but did not remove.** When C has reduced its history, every warm-audit "full semantic oracle" replays C's whole baseline. While that replay runs, the receive lane always has foreground work waiting, so the audit is interrupted right after the replay finishes. The replay result is thrown away, the oracle stays due, and it starts again from scratch as soon as the queue drains.
   - At 2277ef5db each replay takes 23–28 s. The Worker was blocked for 156–178 s of a 180 s window. History requests in flight hit their 10 s timeout, which produces the `receive:network-unavailable` notice. C never caught up in 2 of 2 runs.
   - At 7e6aff636 each replay takes 2.6–4.7 s. There are no timeouts and no notice. Catch-up still took 147 s, against 28 s for the same scenario with C not reduced, because 16 of 17 oracle replays were thrown away (64.8 s of Worker time).
   - None of the queued fixes touch this.
2. **Stalled save: a deterministic size limit.** Any single command whose update exceeds 16 KiB blocks the Window's admission queue permanently and halts sync on that device. That covers compose, duplicate, Done for now, merge, and copying a Goals line. A 15,000-character compose saves in 60 ms; 17,000 stalls. The sibling's 20 KB card hit exactly this. It is long-standing, present at both commits, and not covered by the queued fixes.

One precondition you should know: C can only reduce in a build with `VITE_ACCOUNT_RETENTION_AUTO=1`. The default packaged build and the Dockerfile default (`ARG VITE_ACCOUNT_RETENTION_AUTO=0`) include no retention writer, so no device reduces. My first build without the flag never reduced; the poll timed out at 180 s. The sibling's build evidently had it on, and all my runs below use `VITE_ACCOUNT_RETENTION_AUTO=1 VITE_ACCOUNT_LEDGER_PROFILE=1`.

## Behaviour 1: slow catch-up

**Runs.** All are the sibling's lost-phone spec at its large size (C holds about 150 small and 3 × 5 KB cards in 7 envelopes; A writes about 900 markers and 1 MB; two prune cycles). "Phase 2" is the time after C's blocked route is removed.

| Run | Commit | Order | C reduced | Phase 2 outcome | Load (1-min) |
|---|---|---|---|---|---|
| r1 | 2277ef5db | send-first | yes | receive stuck at 487 from +42 s; notice at about +106 s; **not caught up in 180 s**; 198 markers missing on C | 9–17 |
| r5 (replicate, with audit trace) | 2277ef5db | send-first | yes | stuck at 517 from +30 s; notice at about +90 s; **not caught up in 180 s**; 131 markers missing | 11–20 |
| r2 | 7e6aff636 | send-first | yes | **147 s**, no notice, converged | 8.7 rising to 28.6 (another agent's browser test started mid-run) |
| r3 | 7e6aff636 | install-first | yes | install plus suffix 30–45 s, then sending 12.7 s, converged | 8–17 (my r4 setup running concurrently) |
| r4 | 7e6aff636 | send-first | no | **27.9 s**, converged, 0 replays | 9–17 |

For reference, the sibling saw about 146 s (send-first, reduced) and about 20 s + 20 s (install-first, not reduced). The sibling had changed two things at once; with one variable at a time, **whether C is reduced is what matters**. Order changes how often the replay is interrupted: send-first 16, install-first 4.

**Where the time goes (ledger metrics, my trace seams, network log):**
- **2277ef5db.**
  - Each replay does 321 whole-document rebuilds and 471 coverage checks. In r1's window that is 52 s of rebuilds and 104 s of checks; the Worker was unresponsive for 155.8 s.
  - r5's trace shows all 7 replays (22.8–25.9 s each) were the warm-audit oracle, and all 7 ended in `MaintenanceInterrupted`: 171 s wasted.
  - History catalog requests in flight were aborted at 22–29 s. That gives `HistoryTransportUnavailable`, a receive result of `unknown`, and the `network-unavailable` reason (`src/crdt/accountSyncDriver.ts:364-374`); the notice shows 30 s later (`src/ui/SyncNotice.tsx:9-17`).
  - **The receive backoff lead is not the cause.** Failures only reached 1–3, so the waits were at most 4 s.
  - The history install itself took 15–22 s because a replay ran inside it (3.4–5 s at the tip).
- **7e6aff636 (r2).**
  - 20 replays, each with 2 rebuilds and about 158 checks; checks total 54.5 s; the Worker was blocked 60.7 s.
  - Of 17 oracle audits longer than 1 s, 16 were interrupted and 1 completed: 64.8 s wasted. Every interrupted one had run all 158 checks, so the interruption came after the replay finished.
  - The unreduced run (r4) had 0 replays.
- **The remaining roughly 45 s at the tip is not precisely attributed.** Contributors I can see:
  - C wrote 16 positions during catch-up (9→25), against 2 when not reduced, each costing a full send-path run.
  - About 976 short audit slices (`auditWarm` called 1,156 times, 2–16 ms each), roughly 5 s.
  - A catalog fetch at most every 5 s at the head of a receive pass (`src/crdt/accountReceive.ts:1711,1775,4117`), 0.6–2.4 s each when the Worker was not blocked.
  - Load rising to 28 in the second half. This is a single run; treat that part as an observation.

**Mechanism (code at the tip).**
1. The oracle runs a full replay (`src/crdt/contentStore.ts:1693-1697` → load → replay at `:496-504`).
2. The first interruptible step after the replay throws whenever any foreground job is queued (`src/crdt/accountCapture.ts:401-410`). I infer this is the authority re-check at `contentStore.ts:505`, via `accountReceive.ts:416-420`.
3. The comparison (`:520`) and the new reuse view (`:557`) therefore never run, so `due()` stays true (`src/crdt/localBaselineReuse.ts:145-148`).
4. The audit restarts as soon as no foreground job is queued (`src/crdt/warmAuditStart.ts:45`, `src/crdt/warmAuditScheduler.ts:63-73`).
5. During catch-up every network wait opens that gap.

The oracle has been in place since 354c9c596 (2026-10-13).

**Classification.** At 2277ef5db: the phase 545 cost multiplied by this restart defect. At the tip: a defect not covered by any queued fix. Phase 545 was necessary (each replay is about 7× cheaper, which ends the timeouts) but not sufficient. These are counts, reproduced in 3 of 3 reduced send-first runs and by a unit probe, so this is a finding, not an observation of load.

**Smallest sound change.** Keep the interruption point before the replay. Once a replay has completed, let the steps after it (authority re-check, comparison, new reuse view) run without the queue-priority interruption. The replay is synchronous, so the foreground job has already waited; interrupting afterwards returns no time to it and only discards the work. The authority check still runs. An optional extra: don't start the oracle while the receive lane has a backlog.

**Test that fails without it.** `/private/tmp/claude-502/-Users-thomasingalls-Code-done--claude-worktrees-l2-onboarding-863db1/a2cb3ea1-c2ed-4b47-b08f-dc5bb9d6e506/scratchpad/oddities/tools/oracle.probe.test.ts`
- It uses the `test/localBaselineWarm.test.ts` fixture and must run with `VITE_ACCOUNT_LEDGER_PROFILE=1`.
- It makes the oracle due, interrupts at the first authority check after the replay counter increments, retries, and asserts the retry does not replay again.
- At 7e6aff636 it fails: one replay on retry, and the oracle stays due.
- The existing pre-replay case (`localBaselineWarm.test.ts:193`) should keep passing.
- A browser-level guard: in the lost-phone send-first reduced run, count interrupted long oracle audits. Today it is 16; a fix should give at most 1.

## Behaviour 2: stalled save

**Reproduced deterministically** (run s1 at the tip, load 10.5–13.1):
- 5,000 characters saved in 108 ms and 15,000 in 60 ms; 17,000 sat at "Waiting to save…" and I stopped watching at 90 s.
- The page shows "Input is waiting for storage. Retry storage / Discard pending input".
- Both sync lanes go to `blocked` with reason `local-storage`, and the compose field is read-only.

A unit probe confirms it in both the `reference` and `account-text` preparations. Affected: compose at 16,200 and 17,000 characters, duplicate, Done for now, merge of a 17,000-character card, and copying a 17,000-character Goals line. Retry stays blocked. Pasting into a card editor is fine, because text commands slice.

**Attribution.**
1. `MAX_JOURNAL_UPDATE = 16 * 1024` (`src/crdt/journalCodec.ts:6`).
2. Compose and the other affected commands build their change in one transaction and return no remaining part (`src/crdt/workspaceCommands.ts:301-325, 347-351`).
3. `src/crdt/admissionQueue.ts:773-782` throws `slice-required`, and the pump calls `block()` (`:376-385`). The job stays in the queue and its ticket never settles. Retry prepares the same update again.
4. The blocked workspace sets the sync gate to `local-storage` (`src/crdt/accountReceive.ts:3610`).

The threshold is between 15,000 and 16,200 ASCII characters, which is about 5,400 characters of three-byte text. The rule dates from 0b5337ab9 (2026-09-08).

**Smallest sound change.** When a command returns an unsliced update over the limit, refuse that one input (take it off the queue and reject its ticket) and keep the queue active; a retry can never succeed.
- Draft: `/private/tmp/claude-502/-Users-thomasingalls-Code-done--claude-worktrees-l2-onboarding-863db1/a2cb3ea1-c2ed-4b47-b08f-dc5bb9d6e506/scratchpad/oddities/tools/oversize-draft.patch`.
- With it, the probe went from 10 of 20 cases stalled to 0, with the queue active. The merge case was added afterwards and was not rerun against the draft.
- In the browser (s2), a 17,000-character card was refused at once, the field stayed editable and kept the text. The message still reads "That action was not saved. Check storage and try again." and needs its own wording.
- The draft makes exactly one existing test fail: `test/admissionQueue.test.ts:350` ("…preserving a resumable pending input"). It encodes the stall as intended, on the assumption that the command will slice on retry. That assumption does not hold for these commands. The rest of the admission, workspace, preparation, compose and Done-for-now suites pass: 328 tests, 1 skipped.
- A better follow-up is to make compose and the other affected commands slice, so long text saves instead of being refused.

**Test that fails without it.** `/private/tmp/claude-502/-Users-thomasingalls-Code-done--claude-worktrees-l2-onboarding-863db1/a2cb3ea1-c2ed-4b47-b08f-dc5bb9d6e506/scratchpad/oddities/tools/oversize.probe.test.ts` (fixture from `test/workspaceAdmission.test.ts`): every case's ticket must settle within 1 s with the queue active. Today 12 of 22 cases stall. The browser spec `tools/spec/save.public.spec.ts` with `SIZES=5000,15000,17000` also fails today.

## What ran versus what I infer
- **Ran**, all in copies with the sibling's seams plus my own trace seams (`tools/instrument.py`, `tools/instrument2.py`):
  - 5 lost-phone runs, at both commits, varying reduction and order;
  - 2 save runs;
  - the unit probes, at the tip both unfixed and with the draft.
- **Inferred, not measured:**
  - The exact throw site after the replay. The trace and the unit probe agree on the effect.
  - That C's extra 16 positions are the automatic card-membership repair that runs after receiving (`src/crdt/admittedWorkspace.ts:808-821`).
  - How much of the catalog request time is service-side. In the network log it can't be separated from the Worker being blocked.

## Other things that looked wrong
- The oversize stall tells the user it is a storage problem, and it halts sync until they discard or reload.
- Each tip replay still forks the whole document about 158 times (about 18 ms per fork on about 1 MB), so its cost still grows with checks × document size.
- Under load around 20, A's "Check history" button stayed disabled for more than 60 s during setup. That made my first r4 attempt fail; it was a flake and the rerun passed.
- The `latest` history request shows as `net::ERR_ABORTED` in every run even though the install succeeded, which makes the network logs misleading.

## Files and cleanup
- Evidence for each run (timeline, 1 s samples of sync state and ledger metrics, network log, Worker trace, load every 10 s) is under `/private/tmp/claude-502/-Users-thomasingalls-Code-done--claude-worktrees-l2-onboarding-863db1/a2cb3ea1-c2ed-4b47-b08f-dc5bb9d6e506/scratchpad/oddities/runs/`.
- Specs, probes, the draft patch and summarizers are under `/private/tmp/claude-502/-Users-thomasingalls-Code-done--claude-worktrees-l2-onboarding-863db1/a2cb3ea1-c2ed-4b47-b08f-dc5bb9d6e506/scratchpad/oddities/tools/`.
- All copies are deleted and nothing of mine is running. The worktree is untouched (HEAD 7e6aff636). The only writes near it were Vite's temporary config bundles in the worktree's `node_modules/.vite-temp`; that directory is now empty.
