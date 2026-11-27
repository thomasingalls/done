# What starts and cancels local reduction

A delegated agent's report from 2026-11-11, filed as delivered. Read-only trace at `6eb2fead1`. Paths under `/private/tmp` were session scratch space and no longer exist; the supporting files that mattered are under [support](./support/).

**What happened next.** Led to phases 539 and 540.

---

Read-only trace at 6eb2fead1; nothing was run or edited. Paths are relative to `/Users/thomasingalls/Code/done/.claude/worktrees/l2-onboarding-863db1/`. V = verified by reading, I = inferred.

## Observation 1 (phone): causality is reversed
- **No path from a reduction attempt to a lane wake (V).** None of the `scheduler.wake` sites (`src/crdt/accountReceive.ts:4013-4201`) is reached by it. The fenced install's `promote([])` emits no update (`src/crdt/admissionQueue.ts:634-645`), so neither `subscribe` nor local-change listeners fire.
- **The receive lane wakes on its own idle timer (V).** The interval is 15-20 s with healthy notifications, 5 s otherwise (`src/crdt/accountSyncDriver.ts:66-67`, `313-315`; `accountReceive.ts:4044`). The 5 s history-catalog recheck is only a throttle inside that pass (`accountReceive.ts:1687`, `1751`).
- **`ready` turning false does not cancel anything (V).** `begin()` sets `working` and publishes (`accountSyncDriver.ts:214-216`), which sets `synchronizationQuiet=false` and calls `refresh()` (`accountReceive.ts:4110-4118`). While running, `schedule()` just returns (`src/crdt/automaticLocalRetention.ts:118-121`), and `remove()` receives no abort signal.
- **The actual cancel is the storage-queue priority guard (V).**
  - The pass's first storage job is `receiveStatus` (`src/crdt/accountReceiveDriver.ts:200`), which is `runCaptureTask` (`accountReceive.ts:1919-1922`).
  - `run()` then replaces the token: `if (!preparation) preparationActivity = {};` (`src/crdt/accountCapture.ts:341`).
  - The preparation's next step throws `MaintenanceInterrupted` with `queuePriority` (`accountCapture.ts:766-779`).
  - That becomes `skipped / activity-or-journal` (`accountReceive.ts:3860-3867`).
- **What is discarded (V).** The inventory, plan and current unsaved slice are dropped (`src/crdt/contentStore.ts:1076-1077`, `1113-1117`). Only completed 2 s slices of record-opening and full replay persist, and only with `VITE_ACCOUNT_RETENTION_RESUME` (`src/crdt/retentionPreparation.ts:18`, `415`). On an already-reduced device, the "verifying" and "building" suffix replays take no memo (`src/crdt/localRetentionPlan.ts:380`, `417`), so they must fit in one window.
- **Next attempt (V).** It is 10 s after a priority-only interruption, 60 s otherwise, and only once lanes are quiet again (`automaticLocalRetention.ts:199-209`).
- **Starvation (I, from those clocks).** The usable window is roughly the poll interval minus 10 s: about 5-10 s healthy, under 5 s unhealthy. An attempt needing longer never finishes while online. `docs/product-backlog.md:1142-1146` (phase 309) already recorded this: 36 s with polls paused, never with them.

## Observation 2 (desktop): ranked reasons
1. **No hint, and no re-observation (V mechanism, I timing).** `validate` clears `localRetentionHint` on entry (`accountReceive.ts:648`) and restores it only after the full check (`955-956`). The offline edge yields one `refresh()`; with no hint, no timer is set (`automaticLocalRetention.ts:103-126`). Nothing calls `refresh()` when the hint returns; only a page keydown/pointerdown, visibility change or workspace status change does (`accountReceive.ts:3931-3943`). Three minutes is shorter than one 4-5 minute step.
2. **The in-flight send step keeps the storage tail (V).** It checks the gate only between storage operations (`accountSyncDriver.ts:488-518`). Preparation queues behind it (`accountCapture.ts:345-349`), and each further job from that step re-triggers the guard above.
3. **An open spool position makes the device `ineligible` (V).** `verified.delivery.acceptedThrough !== (spool.origin?.position ?? 0) + spool.positions.length` refuses (`src/crdt/localBaselineReplay.ts:483-489`). It is found only after the full replay, then parked until the hint changes (`automaticLocalRetention.ts:206-207`). Offline, a prepared-but-unaccepted position can never settle (I). This is the structural deadlock: reduction needs the backlog accepted.
4. **Durability (I).** `durable && pendingItems === 0` (`accountReceive.ts:3922-3923`; `admissionQueue.ts:326-351`) fails while a journal flush or received page waits behind the tail. A send backlog alone does not fail it; `pendingItems` counts admission jobs, not positions.
5. **Internal skips (V).** `pending-promotion` and `durable-attempt` (an unfinished history, approval or rotation attempt) at `accountReceive.ts:1053-1067` back off 60 s and need a new event.
6. **Visibility (V).** A hidden or occluded window fails `ready` (`3925`); returning to visible clears the hint again (`accountCapture.ts:459-463` → `accountReceive.ts:445-447`).
7. **Clocks (V).** Any page input restarts the 10 s quiet clock; the 30 min cooldown only follows a success, so it does not apply here.
8. **Flags (V).** Absent flags would hide the section entirely (`src/ui/Menu.tsx:422`); they are four build flags (`src/crdt/localBaselineMode.ts:3-13`) plus `!account.detached`.

Two of your hypotheses are ruled out (V):
- **Lane stuck in `working`:** lane phase reports `offline` straight from the gate, even mid-step (`accountSyncDriver.ts:103-111`).
- **Gate blind to DevTools Offline:** the gate reads the Window's `navigator.onLine`, relayed to the Worker (`src/crdt/runtimePorts.ts:51-54`; `src/crdt/accountWorkerClient.ts:259-262`, `491-492`).

That DevTools Offline flips `navigator.onLine` is Chrome behaviour (I). Check: if Send still showed "working", the Worker never saw offline.

## Status → on-screen text (`src/ui/LocalHistoryMaintenance.tsx:28-62`, V)
| Status | Text |
|---|---|
| closed / no runtime | section absent |
| halted | "Automatic maintenance stopped because a storage or verification check failed…" |
| running, `durability` | "Finishing saved writing before maintenance…" (also covers queueing for storage) |
| running, `reading` | "Reading history saved on this device…" |
| running, `opening` | "Reading saved history: X of Y records…" |
| running, `verifying` / `building` / `coverage` | "Verifying saved history…" / "Building a smaller history snapshot…" / "Checking that the snapshot keeps all your writing…" |
| running, `current` / `installing` / `readback` | "Checking that your writing has not changed…" / "Saving the smaller history…" / "Checking the saved result…" |
| waiting + capacity / history-required / ineligible | "A history check is queued…" (button "Check queued") |
| `activity-or-journal` | "Maintenance paused to let editing or sync finish…" |
| `capacity` | "…reached a preparation or snapshot size limit…" |
| `history-required` | "Some history needed for a safe reduction is unavailable…" |
| `ineligible` | "This device's history is not ready for a safe reduction…" |
| everything else | "Automatic maintenance is on for this device…" |

"Everything else" covers no hint, quiet wait, `pending-promotion`, `durable-attempt` and `preparation-saved`, so reasons 1, 4 and 5 are indistinguishable on screen.

## Change points
- **(a) Start while a lane is busy:**
  - Relax `synchronizationQuiet` in `observe()` (`accountReceive.ts:3916-3917`).
  - Add a fallback flag where indexes are dropped (`accountReceive.ts:885-889`, `804-815`).
  - Keep or re-announce the hint in `validate` (`648`, `955`).
  - Park the send lane at a settled boundary. This is required because of reason 3. The existing hook is `beforeNewEnvelope` → `batching` (`accountSyncDriver.ts:234-242`, `502-503`, `280-286`), which sets the lane idle before a new envelope is allocated.
- **(b) Survive lane wake-ups:**
  - Either stop idle polls bumping the token in `run()` (`accountCapture.ts:336-341`; it already takes a `kind`).
  - Or defer `lanes.receive.due` while the phase is `running`, via a new `wake` cause (`accountSyncDriver.ts:367-416`).
  - The 10 s floor is at `automaticLocalRetention.ts:202-203`.
- **Must not break:**
  - Quiet sync is scheduling only: "Statuses are scheduling hints, never authority" (phase 84 README under `docs/performance-experiments/2026-10-26-maintenance-contention/`).
  - Foreground storage must not wait behind read-only preparation, and queued reads must never cancel the final exchange (phase 83 README; `accountCapture.ts:820`).
  - Safety lives in the owner: settled-cut eligibility, `retentionReady`, the journal and authority checks, inventory equality at commit (`contentStore.ts:1005-1007`), and invalidating volatile reads at the cut (`accountReceive.ts:1128-1137`; `docs/decisions.md:4537-4541`).
  - Routine polls must not reset the input-quiet clock (`automaticLocalRetention.ts:247-253`).

The assumption that has expired is "maintenance is discretionary and sync is cheap"; in the full-check fallback both are false.
