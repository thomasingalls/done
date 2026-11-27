# Phase 564 — reduction's time windows come from what the device measured

The coordinating session asked on 2026-11-27 for repairs 1 to 3 of the lab diagnosis ([diagnosis.md](./diagnosis.md)), in order to make local reduction finish on a device whose setup is long, online and offline. The operator then set the rule this phase follows:

> "yes 5 min is fine, but i also don't want to get into a position again where critical work is impossible because we chose a relatively arbitrary cutoff point where there may not need to be one"

The coordinating session's reading of it: a limit on reduction may make progress smaller or later, but never impossible, and a limit must come from what the device measured, not from a constant. That withdrew the brief's first default for repair 3 (a deferral of at most max(60 s, 3 × setup), never more than 5 min) before it was built.

**Base:** `76aade840` (phase 563), clean. **Where this was built:** the delegated agent's worktree is write-isolated from the main worktree. The change, its tests and these records were made in the delegated agent's worktree, moved to `76aade840`, and are handed over as a patch for the coordinating session to apply. Nothing was committed, staged or pushed.

## Cause, in one paragraph

Each reduction attempt re-reads every saved row before it can do any new work (phase 556 change D), and that setup takes about 90 s on the affected phone and less on the desktop. Phase 540 protected an attempt from routine idle receive polls for a fixed 60 s from its run's first slice, and phase 556 change A planned every slice to end, with its save, before that moment. Three things followed:
- **Online, setup longer than the window:** every attempt was cut by the first poll after the 60 s, and nothing was ever saved.
- **The first protected slice:** before any save had been measured, it reserved no time for its save. It ended at the window, and the save was cut.
- **Offline:** the window still capped every slice, though no routine sync could run. Slices fell to the 2 s floor, and each cycle repeated the whole setup for 2 s of new work.

The diagnosis has the reproduction and controls.

## The change

### `src/crdt/automaticLocalRetention.ts` (the scheduler)

**Repair 1: no window when routine sync cannot run.**
- New observation `routineSync`, false while the sync gate is not ready (offline, signed out, storage pressure).
- Then `protectedUntil` is omitted, so the owner plans no slice against a window. This applies in the hold, in the poll window and in the yield alike.

**Repair 3: the idle-poll window is measured, not fixed.**
- **The first window** is `LOCAL_RETENTION_POLL_HOLD_MS` (60 s). It is used only until the owner has reported a setup on this history.
- **Every later run's window** is `measuredNeed(setup, save)` = (1 + `PREPARATION_SETUP_RATIO`) × (setup + save). That is the setup, the grown slice and the save, using the longest setup and the last save the owner measured. An unmeasured save counts as long as the setup.
- **No fixed ceiling.** When a window ends while its attempt is still running, the attempt has not saved, because a save ends the window. The window then becomes max(twice the last, the measured need) instead of letting polls resume. Doubling reaches any setup.
- **The deferral ends at the run's first save,** and the existing 60 s yield follows. Before this phase, a saved slice that continued at once kept the window.
- **A device whose measured need exceeds what is left of the yield waits for the yield to end,** when its next window starts. It no longer starts attempts that a routine poll cuts before they can save. Without this, every cut in the yield made the next protected slice the 2 s floor (phase 556's rule after a cut), and progress fell to 2 s per window. Offline (routine sync cannot run) nothing waits.
- **The same rule before a held window's first save** (phase 539, a device on the full check):
  - The hold budget starts at max(5 min, measured need).
  - An attempt that is still running and has not saved when the budget lapses gets max(twice, need), as long as nothing cut an attempt in that window.
  - An attempt cut by input or the journal in the window lets the budget lapse as before. The person is active, and this hold parks the sender.
- **Measurements:** the owner reports its setup and save times through a new optional fourth argument of `remove`, `measure(kind, ms)`. A completed removal starts a new history and clears them.

**Diagnostics** (the existing port) also carry `setupMs`, `saveMs` and `windowEndsAt`. They are values the scheduler now keeps anyway.

### `src/crdt/retentionPreparation.ts` (the journal's budget)

**Repair 2:**
- A slice planned against a window reserves its save. That reserve is the last measured save, or, before any save, this attempt's setup. The setup is a safe guess: a save repeats the setup's inventory read and prefix work on far fewer rows. In the browser a save measured 0.2 to 0.6 times the setup.
- New option `onFirstFresh(at)`, called once at the first fresh check, so the owner can report its setup.

### `src/crdt/contentStore.ts`

- `preparationSaveMs` is undefined until a save is measured, and `carriedMs` is passed only then.
- `prepareHistoryRemoval` takes the `measure` callback. It reports the setup through `onFirstFresh` on every attempt, including one kept to the plain target after a cut, and reports the save after `savePreparationDelta`.

### `src/crdt/accountReceive.ts`

- The scheduler's observation gains `routineSync: gate() === 'ready' && !networkLoginNeedsPasskey(...)`, the same condition under which the sync scheduler runs a lane.
- `removeLocalHistory` and `prepareLocalRemoval` pass `measure` to the owner.

No stored format, wire format, service message, product string or size or count limit changes. No UI changes.

## Decisions amended

1. **Phase 540, "Unmeasured scheduling bound: … at most sixty seconds per run, counted from its first slice, … the existing sixty-second yield".**
   - Now: 60 s is only the first window before anything is measured. Later windows are the measured need, and an unsaved running attempt's window grows without a ceiling.
   - The window ends at the run's first save; a continuing slice no longer keeps it.
   - A device whose measured need exceeds the yield waits for the yield to end instead of starting attempts in it.
   - Justification: diagnosis r08, with a setup longer than the window, ran 574 attempts in 421 s at ×100 and saved nothing. The patched build reduced in 2 attempts ([p08](#lab-before-and-after)). In the composed simulation, a 90 s setup online went from nothing saved in 12 h to reduced in 20.7 min.
2. **Phase 556 change A, "It is never planned past `deadline` less that save" and "[the budget] never plans past the moment routine sync resumes", with `protectedUntil` = now in a yield.**
   - Now: with routine sync unable to run there is no moment it resumes, so no window plans the slice.
   - An unmeasured save is reserved at the setup.
   - Justification: diagnosis r06 offline at ×100 took 156 attempts and 346 s, all at the floor; the r14 control without the window took 2 attempts and 6.3 s; the patched build took 1 attempt and 3.2 s ([p06](#lab-before-and-after)). With the real owner, 157 attempts at "now" fell to 3 without a window. The first protected slice reserved no time for its save: diagnosis r07 attempt 1 lost 8,703 results.
3. **Phase 539's hold budget, only before a window's first save, for an uncut running attempt.** The budget is never shorter than the measured need, and it grows instead of lapsing. This parks the sender for as long as the device needs to save once. *This is the case the coordinating session asked to check against the rule; see "Phase 539's hold and the rule".*

Unchanged, and tested:
- Phase 546's progress rule: the window is marked when it ends without progress, and its yield is unchanged.
- A cut window lapses at its budget.
- Phase 83: no storage path changed, and a routine poll still cuts an unprotected attempt through the token.
- Hints, input and the journal still interrupt at once.
- The poll deferral never parks the sender.

## Phase 539's hold and the rule

**Before:**
- A device on the full check (more than 32,768 rows, as the affected desktop) gets a settled hold of 5 min per window.
- If its setup, one slice and the save exceeded 5 min, the window lapsed unsaved and phase 546 stopped the hold from engaging again on that history.
- Its attempts then ran under the idle-poll deferral, which does not park the sender. On a device that is still sending, each send's storage jobs cut the attempt, so it could not save until sending stopped.

**Now:** the held window before its first save grows like the poll window, so the first save happens.

**Consequence, plainly:** while a full-check device runs that first held window, new writing on it is not sent, for as long as its setup, one slice and the save take. That is measured, not capped.

**Today's two devices:** the desktop's setup is well under 5 min (its 35,379 rows read and verify in visible but short cycles), so for them this changes nothing. The phone is not on the full check.

## Worst-case delay of a change only a poll would find

**During a run:** until its first save, at most the time the device needs for setup, one slice and the save, plus one poll interval (15 to 20 s with healthy notifications).
- The first run on a history: setup + 2 s + save (+ one doubling's overshoot only if it outlasts its window, which the save ends).
- Later runs: about `measuredNeed` = 3 × (setup + save).
- Then the 60 s yield runs routine polls.

**Measured in the lab:**
- Desktop speed, 14,402 rows, online (p10on): the longest gap between receive passes was 16.8 s, which is the ordinary poll interval. The attempt (8.0 s) fitted inside it.
- At ×100 (p08): the longest gap was 4.0 s, against a measured need of about 4 s. That stands for about 400 s on a device 100 times slower.

**For the phone** (setup about 90 s, save about 20 s, inferred): the first run is about 2 min and later runs about 5.5 min, each followed by a 60 s yield.

**Hints and the notification stream are never deferred.** Content from the other device arrives at once and cuts the attempt as before.

## Tests

Each new case fails at `76aade840` and passes with the change. Changed existing assertions are listed with their reason.

**New, `test/retentionSliceWindows.test.ts`.** The real sync scheduler with the real reduction scheduler on a simulated clock, with a model owner (setup, budget law, save) and polls every 17 s.

| Case | At `76aade840` | After |
|---|---|---|
| a setup longer than sixty seconds, online with polls running, saves and finishes (90 s setup, 20 s save, 600 s of work) | nothing saved in 6 simulated hours (1,428 attempts in 12 h, all cut) | reduced in 20.7 simulated min, 4 attempts, 3 saves, 0 cuts |
| with routine sync unable to run, slices are not held to the two-second floor (same device, offline) | 300 attempts, 560 min | 3 attempts, 15.8 min |
| property, setups 30 s, 61 s, 2, 5, 10, 20, 30, 45 min online: the first run saves within ⌈log₂(need / 60 s)⌉ extensions of one window, and the waiting poll runs within one interval of that save | fails at every setup (above 60 s: never saves; at 30 s: the poll waits for the window, not the save) | passes at every setup |
| unchanged: during a long window the sender is never parked and a hint still cuts at once | fails (the window had lapsed at 60 s) | passes |
| a routine poll waits no longer than the run takes to its first save, then gets the yield | fails | passes |

**Desktop-shaped device in the same simulation** (20 s setup, 5 s save, 120 s of work):
- online: from 22.9 min (56 attempts, 34 cut) to 5.5 min (3, 0 cut);
- offline: from 7.7 min (13 attempts) to 3.5 min (3).

**New, `test/retentionSliceBudget.test.ts`** (the real content owner, real WebCrypto, fake IndexedDB, a work clock):
- *the first protected slice saves what it verified, inside its window.* At `76aade840` setup plus fresh work was 6,528 of a 6,516-unit window, which left nothing for the save. After: 3,908, ending a setup's length (2,606) before the window.
- *with no window, slices grow with the setup; held to now, they stay at the floor.* A measurement: 157 attempts against 3. It passes at both trees, since the owner already accepted an omitted window; the scheduler cases above are the ones that fail at `76aade840`.

**Changed assertions** (`test/retentionReductionHold.test.ts` unless named):
1. *the budget starts when sync is parked under the hold, bounds even a running attempt, then yields:* at the 5 min budget the running, unsaved attempt now keeps the hold (was: released). Then it is cut by input, and the longer budget lapses at its end. One more retry ran inside it (calls 2 → 3).
2. *an attempt that starts late under a parked hold keeps the budget already running:* at the budget's end the running attempt keeps the hold, extended from the same start: `windowEndsAt` goes from 10 s + 5 min to 10 s + 10 min (was: released).
3. *a capacity refusal that arrives after the hold expired still spends it:* a saved slice first, so the budget lapses mid-attempt (calls 1 → 2).
4. *a saved slice continuing at once keeps the deferral; …* is renamed *a run's first save ends its poll deferral; routine polls get the yield before the next window*. After the save, `hold` is undefined (was: idle-poll), the next slice is unprotected, and a new window comes after the yield.
5. *the poll deferral is bounded from its first slice, …* is renamed *a run that outlasts its poll window unsaved gets a longer one; its save ends it, announced, then yields*. At 60 s the running attempt keeps the deferral, and the window grows to at least twice. Before, polls resumed mid-attempt.
6. *a full-check device keeps its full hold, …:* a saved slice first, so the budget lapses (calls 2 → 3).
7. *the lane watcher wakes the scheduler once per tier change …:* the save is now a tier change, so the wake counts go 1, 2 → 2, 3, 4.
8. `test/retentionSliceBudget.test.ts`, *the scheduler tells each attempt when routine sync resumes:*
   - the slice continuing after a save gets `now` (the yield), where it was `QUIET + POLLS`;
   - two assertions are added: with `routineSync` false the attempt gets no window, in the poll path and in the hold.

Nothing else was loosened.

**Runs**
| Command | Result |
|---|---|
| `pnpm exec vitest run` on 25 files: the three changed or new test files, and every other unit file that imports `automaticLocalRetention`, `createPreparationJournal`, `prepareHistoryRemoval` or `removeLocalHistory`, plus `accountSyncDriver` and `localHistoryMaintenance` | 25 files, 268 passed ([unit-neighbours.log.gz](./unit-neighbours.log.gz)) |
| The same new and changed cases on the `76aade840` sources (product files swapped back) | 19 fail: the 12 in `retentionSliceWindows`, 5 changed cases in `retentionReductionHold`, and *the scheduler tells each attempt…* and *the first protected slice…* in `retentionSliceBudget`. Passing at both trees: changed cases 3 and 6 (they only add a saved slice first) and the cycles measurement ([unit-base.log.gz](./unit-base.log.gz), [unit-after.log.gz](./unit-after.log.gz)). |
| `pnpm exec tsc -b --noEmit --force` | exit 0 |
| `pnpm exec oxfmt --check` and `pnpm exec oxlint --react-plugin` on the seven changed source and test files | pass, pass |
| `node scripts/release-validation/check.mjs`, `plan.mjs` after recording | pass; 1,137 obligations, 562 unresolved |
| `pnpm validation:inventory` | 10 passed |
| CI's release execution adapter files (`node --test --test-concurrency=2 …`, as in `ci.yml`) | 178 passed, including the 3,097-case denominator |
| `pnpm account:crypto-prep` after recording | matched, 6 passed |
| the ten CI contract checks, `vectors:check` to `wasm:verify` | all exit 0 (before the final records; `pnpm build` and `pnpm trace:check` ran after them, last) |

**The full unit suite was not run for this phase** (operator, 2026-11-27: it runs once before merge). Neither were the packaged browser step nor `pnpm test:account-setup`.

## Lab before and after

These are packaged-app runs, using the same harness and seeds as the diagnosis. The patched build is the product patch plus the lab instrumentation ([lab-hooks-564.py.txt](./lab-hooks-564.py.txt), [lab-instrumentation.patch.txt](./lab-instrumentation.patch.txt)). Scaled runs divide every scheduling constant by the factor, including the first window and the yield. The measured need is real time, as the device measures it. No other Playwright or Vitest process ran during the patched runs.

| Run | Seed, network, scale | Before (diagnosis) | After (phase 564) |
|---|---|---|---|
| r08 / p08 | 1,000 positions, online, ×100 (setup longer than the window) | 574 attempts in 421 s, all cut, never reduced | 2 attempts: the first run's window grew twice and the floor slice saved 300 results, then the measured window of 4.1 s held a 2.6 s slice; reduced at 6.3 s |
| r06 / p06 | 1,000, offline, ×100 | 156 attempts, 346 s, every slice at the floor | 1 attempt, 3.2 s (budget 1.9 s, no window) |
| r07 / p07 | 1,000, online, ×20 | 130 attempts (104 cut, 25 saved), 179 s | 2 attempts: 5,523 results saved in the first, inside its window with the reserve; reduced at 9.8 s |
| r02 / p02 | 1,000, offline, desktop speed | 2 attempts, 6.4 s | 1 attempt, 3.6 s |
| r10 / p10 | 2,000, offline, desktop speed | 1 attempt, 7.8 s | 1 attempt, 8.0 s |
| — / p10on | 2,000, online, desktop speed | — | 1 attempt, 8.0 s; longest gap between receive passes 16.8 s (the poll interval) |
| r13 / p13 | 2,000, online, full check forced (`indexMaxRows` 8,000), card added at 13 s | card accepted after 22.7 s; reduced at 35.6 s | card accepted after 23.8 s; reduced at 36.8 s. The hold path still completes, and a card waits for it as before |

**What each run cannot show about the live devices:**
- **The seed:** 1,000 to 2,000 own positions and 101 to 201 received, against 3,999 received on each live device. It has no installed service snapshot. It has 7,202 or 14,402 rows, against 32,644 and 35,379.
- **Scaling:** stands in for a slower device by shortening the clocks, not by slowing the CPU (CDP cannot throttle a Worker). It shows the windows' logic, not phone timings.
- **r13 and p13:** use a forced index bound; the desktop is past it for real.
- **Seed growth:** a seed past 32,768 real rows was not grown. From the 2,000-position seed it needs about 2,600 more positions at 1.5 to 3 s each (about 1.5 to 2 h), longer than this phase.

## What is still exposed

**The phone (32,644 rows, not on the full check yet):**
- **Online:**
  - Its first run on a history now saves: the window grows until it does.
  - Each later run is about 3 × (setup + save), followed by a 60 s yield in which it waits.
  - Progress per cycle is a grown slice, so it should finish in a handful of windows, if nothing but routine polls interrupts.
  - Remaining interrupters: hints from the desktop, input, and a page that is hidden or under storage pressure (that releases the window).
  - **Inferred, not observed:** each window runs routine polls up to about 5.5 min late.
- **Offline:** slices grow with the setup. It finishes in a few attempts, unless an allocated but unaccepted position makes the plan `ineligible` at Building (phase 1 diagnosis; unchanged).
- **The full-check cliff:** it is 124 physical rows (about 17 sent positions) below it. Past it, sending costs six full checks per position (SEND-ROW-BOUND), and the hold parks sending while a reduction runs.

**The desktop (35,379 rows, on the full check):**
- Every sent position runs six full checks: minutes each, by the operator's report. This phase does not change that.
- Its hold now cannot lapse unsaved for an uncut attempt, so a first save always comes. Until then new writing waits.
- Its reduction is now protected and sized. Whether its live V (3,999 received positions, installed snapshots, near 32 MiB) lets it finish in a few windows is not measured.

**Both devices:**
- The per-cycle repeat: every attempt re-reads every row and re-hashes every saved receipt (REDUCE-CYCLE-REPEAT).
- `PREPARATION_MAX_CHUNKS` (256 saves): reached at 157 attempts held to the floor in the owner test's history size, and more slices than that at the live size.
- Content compaction making a saved checkpoint stale (REDUCE-COMPACTION-STALE).
- The banner showing for saves and routine receives (BANNER-NOT-INPUT).
- No "verified N of M" line (REDUCE-PROGRESS-LINE).

## Fixed bounds on the reduction path

Ordered with the ones that can still silently keep reduction from finishing at the top. The columns give the value, whether it was measured or chosen, what a device beyond it experiences, and whether this phase changes it.

| Bound | Value | Measured or chosen | Beyond it | This phase |
|---|---|---|---|---|
| Interruption by activity: hints from another device, input, a hidden page | event-driven | design | a peer that publishes continuously, or a person who keeps typing, cuts every attempt; "Maintenance paused to let editing or sync finish" repeats; progress only while quiet | no |
| `PREPARATION_MAX_CHUNKS` (256 chunks and deltas in the saved journal) | 256 | chosen | after about 255 saves the journal is full and the rest runs uncached with no pauses. If priority-only work then cuts it, the device parks with "History maintenance was interrupted by other work on this device and had no saved progress to resume from…" until new history or Check again; online it now has a growing window, so only hints or input cut it | no |
| Content compaction (`CONTENT_MAINTENANCE_RECORDS` 128, `CONTENT_MAINTENANCE_IDLE_MS` 750 ms) | 128 changes | chosen | compaction rewrites rows below the saved prefix, so the next attempt finds the checkpoint `stale` and starts over, silently (code; not seen in the lab) | no |
| `PREPARATION_VALUE_BYTES` and `PREPARATION_VALUE_NODES` for the coverage basis | 32 MiB, 131,072 nodes (≈ 26,214 content records) | chosen | coverage checks run uncached in every attempt: silently slower | no |
| `LOCAL_RETENTION_POLL_HOLD_MS` | 60 s | chosen, unmeasured (phase 540) | before: an online device with a setup over about 55 s never saved, silently. Now: the first window only, then measured and growing | **yes** |
| `LOCAL_RETENTION_HOLD_MS` | 5 min | chosen, unmeasured (phase 539) | before: a full-check device needing more than 5 min to save once could not save while sending. Now: unchanged after a window's first save, and grows before it | **yes, before first save only** |
| Phase 556 "never planned past the moment routine sync resumes" | the window | design | before: offline slices held to the 2 s floor. Now: no window when routine sync cannot run | **yes** |
| `PREPARATION_SLICE_MS` (floor) | 2 s | chosen, unmeasured | slower (many cycles at the floor); after any cut, the next slice keeps the floor until one saves | no |
| `PREPARATION_SETUP_RATIO` | 2 | measured (phase 556 tried 4) | slower | no |
| `LOCAL_RETENTION_HOLD_YIELD_MS` | 60 s | chosen | later | no |
| `LOCAL_RETENTION_QUIET_MS` | 10 s | chosen | later; continuous typing defers attempts | no |
| `LOCAL_RETENTION_RETRY_MS` | 60 s | chosen | later | no |
| `LOCAL_RETENTION_COOLDOWN_MS` | 30 min | chosen | later (after a completion) | no |
| `LOCAL_RETENTION_FOLD_STREAK` | 3 | chosen | a fold that does not clear waits for the cooldown | no |
| `LOCAL_RETENTION_MIN_RECORDS` | 1,024 records | chosen | below it no automatic reduction starts (nothing to gain) | no |
| Idle receive poll interval | 15–20 s healthy, 5 s otherwise | chosen | decides how soon an unprotected attempt is cut | no |
| `SLICE_ROWS` | 32,767 pending results | derived from the value node cap | a slice pauses early: more slices | no |
| `PREPARATION_ENTRIES` | 131,072 receipts | chosen | journal full: rest uncached, no pauses (as for the chunk cap) | no |
| `PREPARATION_MAX_BYTES` | 32 MiB of saved receipts | chosen | parks with the named `resume-progress` capacity message | no |
| Preparation head size (`PREPARATION_CHUNK_BYTES` − 16) | 256 KiB | chosen | parks with the named `resume-index` capacity message | no |
| Local baseline write ceiling | 4 MiB (draft-3), 8 MiB (draft-4, phase 542) | chosen | parks with the named `snapshot-size` capacity message ("The smaller history snapshot would need …") | no |
| Local baseline read ceiling | 32 MiB | chosen | refusal on read | no |
| `MAX_SOURCES` in a baseline | 4,096 unsent sources | chosen | parks with the named `snapshot-sources` message | no |
| `MAX_PUBLISHERS` in a baseline | 128 | chosen | parks with the named `snapshot-publishers` message | no |
| Installed service snapshot check limit (phase 544) | as recorded there | chosen | parks with the named `installed-snapshot` message | no |
| Allocated but unaccepted positions | any | design | parks with "This device’s history is not ready for a safe reduction…" until new history | no |
| `INDEX_MAX_ROWS` and `INDEX_MAX_BYTES` (ledger indexes) | 32,768 rows, 32 MiB | chosen | not a reduction bound: every ledger change runs the full check (six per sent position) and the device gets the hold | no |
| CPU yield in preparation | every 8 ms | chosen | slower | no |

## Bookkeeping

Following [development.md](../../../development.md#release-bookkeeping); details in [evidence.json](./evidence.json).

**Planning inventory** (`check.mjs --record`), recorded four times: after the tests, after the denominator edit, after the census and registry, and after the last test edits (a timer reset in `retentionSliceBudget`'s `afterEach`, which a failing scheduler case had skipped at `76aade840`, and two guard assertions in `retentionSliceWindows`).
- `test/retentionReductionHold.test.ts` and `test/retentionSliceBudget.test.ts` changed hash.
- `retentionSliceBudget`'s declarations went from 9 to 11.
- `test/retentionSliceWindows.test.ts` is new and required, with 5 declarations. `it.each` is counted once; it runs 12 cases.
- Test files went from 772 to 773, and required files from 766 to 767.
- The last recording moved only the hash of `docs/account-crypto/constructions.json`.

**Manifest** (`plan.mjs --record`).
- `inventoryDigest` changed.
- The `retentionSliceBudget` row's expected cases went from 9 to 11, and two `retentionReductionHold` case titles changed.
- The denominator case's title went from "3095-case" to "3097-case".
- Obligations went from 1,136 to 1,137 and unresolved from 561 to 562. The new test file is blocked pending review of its runtime denominator, as new literal test files are.

**Registered counts.** `test/retentionSliceBudget.test.ts` is in the reviewed general-test selection. Its two new cases move the general-test case denominator from 3,095 to 3,097. Three registry lines moved, as in phase 563: in `test/release-validation/general-tests.test.mjs`, the case title and the count, and in `generated-tests.test.mjs`, the count. `retentionReductionHold`'s case count is unchanged (19).

**Runtime census** (`node scripts/account-crypto-prep/run.mjs --record`), once, after review.
- Exactly the four changed product sources' hashes moved, plus one site's line: `done/account-ledger-reference-mismatch` in `src/crdt/accountReceive.ts`, from 973 to 974, after one added import line.
- No label, template, group or entrypoint changed: 526 sources, 201 labels or templates, 36 groups and 15 manual entrypoints.
- No changed line holds a domain label or a cryptographic call.

**Construction registry.** The same site moved from line 973 to 974 in `docs/account-crypto/constructions.json` (the registry follows the census, as in phase 540). `retentionPreparation.ts`'s registered site (line 17) did not move.

**Decision and notes.**
- A 2026-11-27 entry in `docs/decisions.md` amends phase 540's sixty-second deferral and phase 556 change A, and states what changes in phase 539's hold.
- In `docs/product-backlog.md`:
  - SEND-ROW-BOUND gains the live counts and the six checks per position;
  - REDUCE-FURTHER notes the reserve;
  - REDUCE-CYCLE-REPEAT, REDUCE-PROGRESS-LINE, BANNER-NOT-INPUT, REDUCE-COMPACTION-STALE and REDUCE-MAX-CHUNKS are added.

`docs/progress.md` and `docs/completed.md` are left to the coordinating session.

## Decided without asking

- **The deferral ends at the run's first save.** This is the operator's rule ("after a save, the existing yield runs before the next window"). It replaces phase 540's continuing-slice clause.
- **A device whose measured need exceeds what is left of the yield waits for the yield to end.** This is part of sizing the window to the device. Without it, attempts that routine polls cut in the yield set phase 556's after-a-cut floor on the next protected slice, and a long-setup device advanced 2 s per window.
- **The window's growth is twice the last or the measured need, whichever is larger,** with no estimate from elapsed time. Using elapsed time overshot a parked sender's hold by up to six times.
- **An unmeasured save is reserved at the attempt's setup.**
- **The hold grows only for an attempt that nothing cut in its window.**
- **Measurements are kept per scheduler, which means per open,** and cleared by a completed removal.
- **`diagnostics` exposes `setupMs`, `saveMs` and `windowEndsAt`.** They are kept anyway, and phase 565 can read them.

## Limits

- **Not run on a phone, on the affected account, or on a seed past 32,768 real rows.**
- **Simulation:** the composed tests model the owner's budget law; the real owner's law is tested separately.
- **The full unit suite** and the packaged browser step were not run for this phase.
- **Overlap:** another agent's packaged-account Playwright run overlapped the diagnosis runs, but none of the patched runs.

## At review

The coordinating session read the four product diffs on 2026-11-27, applied the delegated agent's patch (sha256 `fdc50abf…5afea`; the agent's session could not write to this worktree) and ran the following on the final tree, on this Mac under Node 26.13.1, with no other test process running.

- **Its own controls,** each restored afterwards with the file's hash checked:
  - the idle-poll window made never to grow (`expirePoll` always ends the window): `test/retentionSliceWindows.test.ts` fails 10 of 12, every online case with a setup above sixty seconds among them;
  - an offline slice still planned against a window (`protectedUntil` given even when routine sync cannot run): the offline case in `retentionSliceWindows` and *the scheduler tells each attempt…* in `retentionSliceBudget` fail, the other 21 pass.
- **Unit files:** the three files of this phase and ten neighbours (`automaticLocalRetention`, five `retentionPreparation*` files, `retentionPriorityRetry`, `localRetentionProgress`, `localRetentionStatus`, `accountSyncDriver`, `retentionFenceCollision`): 13 files, 138 cases passed. Typecheck passes.
- **Registered at review, which supersedes the figures under Bookkeeping:** `test/retentionSliceWindows.test.ts` is now a reviewed Vitest selection. Its property case's setups are written as literal milliseconds, because the inventory's census could not resolve the computed list; the 12 cases and their assertions are unchanged. Reviewed Vitest files go from 122 to 123, the case denominator from 3,097 to 3,109, and the planning inventory stands at 1,137 obligations with 561 unresolved.
- **Not repeated:** the lab runs, the simulations and the base-tree failures. Their results above are the delegated agent's.
- **Not run:** the full unit suite, by the operator's decision of 2026-11-27, and no browser suite.
- **An exposure this phase introduces,** filed as REDUCE-WINDOW-LIVENESS: with no ceiling before a run's first save, an attempt that hung would keep routine polls deferred, or on a full-check device keep sending parked, until the workspace is reopened. The old ceilings bounded that. No hang is known, and the operator's rule chose completion over the ceiling.
- **Softened:** the decisions entry said the phone's setup "is about 90 s". It is inferred to exceed 60 s and was not measured.
- **Run last,** after these record edits and required before the commit: build, the contract checks, the release inventory and plan, the release adapters, the crypto-prep check and the trace check.

