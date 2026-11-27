# Phase 565 — the History panel says where reduction is, how long it has left and what is saved

On 2026-11-27 the operator watched the "History on this device" panel for a day on two real devices. It showed a stage name and "Reading saved history: N of M records", which restarts from zero on every pass, so progress in saved slices and an endless loop looked identical. The operator's request, verbatim:

> "it would be extremely useful to give the user an indication of the amount of time any one of these particular steps is left. and if it's a multi-step thing, it'd be really nice to be able to give an estimate of the whole thing in addition to an estimate for the active phase, and an indicator of progress through phases"

The operator confirmed a grouping into three steps. The coordinating session set the honesty rules this phase is tested against (estimates only from rates measured in this run; "about", in units a person reads; never zero while work continues; the percentage counts saved, reusable work only, and shows any fall; steps 2 and 3 sized honestly; say whether waits between passes are counted).

**Base:** the tree staged for phase 564 (`edaaecc314abfa1dde1cd63efc3982e8e442e2b1`) over `76aade840`. Built in the working tree of `claude/post-release-repairs`; nothing was staged, committed or pushed.

**Display and in-memory plumbing only.** No stored format, wire format, service message, limit or scheduling behaviour changes. Nothing added here is read to decide when or whether a reduction runs.

## The three steps

| Step | Stages | Seen |
|---|---|---|
| 1. Check saved history | durability, reading, opening, verifying | every pass: it re-reads every row, re-checks what earlier passes saved, checks fresh results until its budget, and saves them |
| 2. Build the smaller history | building, coverage, current | only in the final pass |
| 3. Save it | installing, readback | only in the final pass |

## What the panel says

### Product strings added or reworded

Every sentence below is new unless marked. No existing string was reworded; every refusal and capacity sentence renders exactly as before, also while a reduction is in progress (tested).

**Running** (the first paragraph is the status region):
- `Reducing saved history: step 1 of 3, checking saved history. {p}% checked (pass {k}).`
- `Reducing saved history: step 1 of 3, checking saved history (pass {k}).` (no total to measure against yet)
- `Reducing saved history: step 2 of 3, building the smaller history.`
- `Reducing saved history: step 3 of 3, saving the smaller history.`
- then one of:
  - `Estimating the time left…`
  - `About {t} left in this step, about {T} in all{q}.`
  - `About {t} left{q}.` (step 3, or when both figures read alike)
  - `About {t} left in this step; estimating the rest…`
  - prefixed, when the active part outlasted its estimate: `This step is taking longer than expected. `
- `{q}` is one of: ` if this device stays quiet` · ` if this device stays quiet, counting pauses that let sync run` · ` if this device stays quiet, not counting pauses that let sync run`.
- `{t}`/`{T}`: `about N seconds` (10 to 50, in tens, rounded up), `about 1 minute`, `about N minutes` (rounded up), `about N hours` (from two hours, rounded up).
- Under those, the existing stage sentence stays as a detail line (unchanged): for example `Reading saved history: 2240 of 14402 records…`, `Verifying saved history…`.

**Paused** between passes or after a cut, while a reduction is in progress:
- first paragraph, by reason:
  - `preparation-saved`, online: `Maintenance saved its progress and paused to let sync run. It will continue when this device is quiet.`
  - `preparation-saved`, offline: `Maintenance saved its progress. It will continue when this device is quiet.`
  - any other non-refusal reason (`activity-or-journal`, `pending-promotion`, `already-preparing`): the existing `Maintenance paused to let editing or sync finish. It will retry when this device is quiet.` (reused; before this phase `pending-promotion` and `already-preparing` showed the default sentence)
- second paragraph: `Step 1 of 3. ` then one of `{p}% of checking is saved.` · `No checking is saved yet.` · `Some checking is saved.`, then one of `About {t} of quiet still needed.` · `About {t} of quiet still needed, counting pauses that let sync run.` · `About {t} of quiet still needed, not counting pauses that let sync run.` · `Estimating the work left…`. Not a countdown: the figure does not move while paused.

**Either, when it applies:**
- `Some checking has to be redone: it went from {a}% back to {b}%.`
- `More history arrived, so there is more to check.`

**Finished:** `History on this device was reduced at {time}.` (the person's locale, hour and minute; kept in memory for this open). It replaces the default idle sentence until a new reduction begins. The brief `complete` stage keeps the existing `History on this device has been reduced.`

**Progress element**, labelled: `Saved history checked` (value = the checked percentage while step 1 runs, the saved percentage while paused), `Reduction steps` (value 1 or 2 of 3 in steps 2 and 3). Without a figure the existing `Local history maintenance` element is unchanged (record count while opening, otherwise indeterminate).

**Unchanged:** every refusal and capacity sentence, the queued sentence, the halted sentence, `Checking and reducing technical history on this device…` (running before any report), and the default idle sentence when no reduction is in progress.

### The real thing (lab, packaged application)

[lab-transcripts.txt](./lab-transcripts.txt) is what the panel said, sampled every 200 ms, on the 2,000-position seed (14,402 rows) with the network off, built from this tree with the released flags. Two runs: one left alone, and one where the harness added a card when checking passed 40%. Condensed (the full sample is in the file, raw in `lab-*.json.gz`):

| t (s) | Left alone |
|---:|---|
| 0.0 | Automatic maintenance is on for this device. It reduces technical history while keeping your tasks and notes. |
| 10.1 | Reducing saved history: step 1 of 3, checking saved history (pass 1). Estimating the time left… / Reading history saved on this device… |
| 12.7 | … 0% checked (pass 1). Estimating the time left… / Verifying saved history… |
| 13.1 | … 16% checked (pass 1). About 10 seconds left if this device stays quiet. (the step and the whole both read "about 10 seconds") |
| 16.8 | … 90% checked (pass 1). (same figure) |
| 17.2 | Reducing saved history: step 2 of 3, building the smaller history. About 10 seconds left if this device stays quiet. |
| 17.6 | Reducing saved history: step 3 of 3, saving the smaller history. About 10 seconds left if this device stays quiet. |
| 18.0 | History on this device was reduced at 6:00 PM. |

| t (s) | A card added at 14.6 s, 49% into pass 1 |
|---:|---|
| 15.0 | Maintenance paused to let editing or sync finish. It will retry when this device is quiet. / Step 1 of 3. No checking is saved yet. About 20 seconds of quiet still needed. / Some checking has to be redone: it went from 55% back to 0%. |
| 25.1 | Reducing saved history: step 1 of 3, checking saved history. 0% checked (pass 2). About 10 seconds left in this step, about 20 seconds in all if this device stays quiet. / (the redo line stays) / Reading history saved on this device… |
| 28.7 | … 0% checked (pass 2). This step is taking longer than expected. About 20 seconds left if this device stays quiet. (the census read took longer than measured in pass 1) |
| 28.9–29.7 | 16% to 52% (pass 2). The figure switches between "About 10 seconds left" (this pass finishes) and "About 20 seconds left in this step, about 30 seconds in all" (one more pass) as the pass's plain 2 s slice runs out; one more pass was needed |
| 30.0 | … 56% checked (pass 2). (the redo line clears once past 55%) |
| 31.8 | … 68% checked (pass 3). About 10 seconds left in this step, about 20 seconds in all … / Reading history saved on this device… (68% stays while it re-reads) |
| 36.3–37.9 | 70% to 90% checked (pass 3). About 10 seconds left if this device stays quiet. |
| 38.1 | Reducing saved history: step 2 of 3, building the smaller history. About 10 seconds left if this device stays quiet. |
| 38.7 | Reducing saved history: step 3 of 3, saving the smaller history. About 10 seconds left if this device stays quiet. |
| 39.1 | History on this device was reduced at 6:01 PM. |

What the lab shows and does not show:
- The census estimate was about 10% high on this seed: checking reached 90% before step 2 began (the last figure published before it; publishing is coalesced to 250 ms).
- Steps 2 and 3 took about 0.4 s each against an allowance of one measured read (about 2 s each in these runs, from the pass's start to its checking): under-promised, as intended.
- Both runs are offline at desktop speed. Online, at phone speed, and past 32,768 rows were not run; the scaled runs of phase 564 needed its lab instrumentation, which this phase did not apply.
- No other Vitest or Playwright process ran during either run (checked with `pgrep` before, at the start and at the end).

The first lab build exposed three faults, fixed before these runs and each now pinned by a test: "less than a minute" beside "about 20 seconds" read badly (seconds now floor at ten); after a cut before any save the panel stayed "estimating" (the latest measured budget is now kept); and a pass's own first results made the estimate flip between "this pass finishes" and "one more pass" (an ended pass's rate is now used once one exists).

## The estimator

Pure functions in `src/crdt/reductionProgress.ts`, used by the scheduler (to fold facts) and the page (to estimate at the current time).

**Method.** Step 1: results left = the total (exact once a full check completed on this history, else the census estimate) less the results held. Fresh time left = results left / the fresh rate, which is the slower of this reduction's rate and a recent window (each earlier pass weighs 0.9), both over ended passes (pass 1 uses its own live rate until it ends). The active pass finishes its budget, then saves (the measured save; before one is measured, as long as a setup, which is what the owner reserves). Each later pass costs the measured read, the re-check of saved results (the slope between the first and latest measured prefix, at the midpoint of held and total) and a slice (the last saved slice, else the latest budget), with the shortest measured wait between passes. Steps 2 and 3, seen only in the final pass, are each allowed one measured full read (`readMs`), or the longest time seen in them if longer. A part that outlasts its estimate is re-estimated as half the time it has taken so far, never below 10 s; no figure shown while running is below 1 s, and none reads as zero. Paused, the figure is the quiet work from a new pass's start, plus measured waits between later passes.

**Percentages.** Checked = (saved + this pass's fresh results) / total, rounded down and capped at 99 until a full check completed. Saved = saved / total. Re-reading rows and re-checking saved results are hits in the journal and never move either. A cut pass falls back to what was saved and keeps the fall (`lostFrom`) until the next save or until the redone checking catches up; a pass that imports fewer saved results than the last one saved (a stale or refused checkpoint) shows the same fall.

**The census estimate** (`plannedResults` in `localBaselineReplay.ts`, told to the journal before the first check): one result per spool event, position (spool and link), retained delivery entry, inbound receipt record and installation, two for an installed successor or membership, and, with a reusable coverage basis, one per installation, received entry and own update. On the unit fixture (96 own and 96 received positions): 1,250 against an exact 1,249. On the lab seed: about 10% high.

**Where it can be wrong.**
- Checks come in families of different cost (cheap spool and delivery checks first, inbound pages and coverage later). An estimate made during a cheap family is optimistic until a slower family is measured; replay r06 shows a factor of about five early on. It re-estimates every pass.
- The census estimate can be low when a source capsule holds several updates (counted once), and high in the ways the lab seed shows. Low means the percentage sits at 99% while checking finishes and the time goes "longer than expected"; high means a jump from about 90% to step 2.
- After a cut, the owner keeps the next slice to the plain 2 s target until one saves; the estimator sizes it with the last budget, so that pass's figure is optimistic by about one pass, and switches between "this pass finishes" and "one more pass" as the short slice runs out (seen in the lab).
- Online, whether the next pass starts at once (unprotected, at the floor) or waits for the yield depends on the measured need against the yield; the estimate uses what the last saved slice and the shortest wait actually were.
- Interruptions, new history, the 256-save cap, refusals at Building and content compaction are not knowable in advance; the figures assume quiet, and say so.
- A reduction whose counter is already v5 verifies only its suffix without the journal: no counts, so step 1 shows no percentage and stays "estimating" in its (usually single) pass.

## Optional fields that cross from the Worker to the page

`LocalRetentionStatus.reduction?: LocalReductionFacts` (`src/crdt/automaticLocalRetention.ts`), admitted by the session bridge through `copyReductionFacts` (every field a non-negative safe integer, `stage` a known stage, `online` a boolean, `grew` only `true`; anything else drops the whole field and the page falls back to the stage sentences). Present from a reduction's first reported pass; replaced when a new reduction begins after one finished. Fields:

| Field | Meaning |
|---|---|
| `since`, `pass`, `passSince` | when the reduction's first pass began; passes begun; when the active or last pass began |
| `stage`, `stageSince`, `stepSince` | the latest stage and when it, and its step, began |
| `online` | routine sync could run when the pass began |
| `endedAt?`, `finishedAt?` | when the last pass ended; when the reduction completed |
| `saved?`, `held?` | results saved and reusable; results held in the active pass |
| `planned?`, `total?` | the census estimate; the exact count once a full check completed |
| `lostFrom?`, `grew?` | results held before the latest loss; the estimate grew at this pass |
| `freshSince?`, `countedAt?`, `fresh?`, `budgetMs?` | the active pass's first fresh check, latest count and fresh results; the latest budget reported |
| `readMs?`, `prefixMs?`, `prefixOf?`, `prefixBaseMs?`, `prefixBaseOf?` | measured read; latest and first measured re-check prefix and how many saved results each re-checked |
| `freshMs?`, `freshOf?`, `lastFreshMs?`, `lastFreshOf?` | fresh time and results over ended passes; the same over the decaying recent window |
| `sliceMs?`, `saveMs?`, `waitMs?` | the last saved slice; its save; the shortest wait between passes |
| `buildMs?`, `storeMs?` | the longest time seen in steps 2 and 3 |

Times are wall clock (`Date.now()`, shared by the Worker and the page); durations in milliseconds. `status.progress` is unchanged in shape.

Inside the Worker only (not crossing): `RetentionProgress` gains optional `saved`, `held`, `fresh`, `budget`, `planned`, accepted only at `verifying` by `copyRetentionProgress`; the preparation journal gains a `report` option and an `expect(checks)` method; `PreparationVerification` gains an optional `expect`.

## The change

- **`src/crdt/reductionProgress.ts`** (new): facts, the reducer (`beginReductionPass`, `recordReductionProgress`, `endReductionPass`), `copyReductionFacts`, `estimateReduction`, `readableDuration`, `reductionStep`. No dependency beyond `contentMaintenance`, so the page can import it.
- **`src/crdt/retentionPreparation.ts`**: the journal reports its counts at its first check, at its first fresh check (with the budget), every 32 kept or uncached fresh results (as opening reports every 32 records, so the verification loop stays cheap) and before a pause; `counts()` gives them on demand; `expect(checks)` takes the census estimate. Results the journal could not keep count as held in this pass. No check, budget or pause changed. The registered domain label stays on line 17.
- **`src/crdt/localBaselineReplay.ts`**: `full()` tells the journal the census estimate before its first check (again without coverage when no reusable basis exists).
- **`src/crdt/contentStore.ts`**: passes the journal's counts to the progress sink as `verifying` reports, and once per pass sends its exact counts when checking gives way to the next stage or the pass ends early (a cut), so the exact total and any fall are not off by the unreported results.
- **`src/crdt/contentMaintenance.ts`**: the optional counts on `RetentionProgress` and their copy.
- **`src/crdt/automaticLocalRetention.ts`**: each attempt that reports joins the reduction's facts; every report is folded in, and only publishing is coalesced (as before, 250 ms within a stage); the outcome folds how the pass ended. The published `progress` keeps its old shape.
- **`src/crdt/accountSessionBridge.ts`**: admits `reduction` through `copyReductionFacts`.
- **`src/ui/LocalHistoryMaintenance.tsx`**: the sentences above, the labelled progress element, and a display clock that re-renders a running estimate each second (it reads nothing from the Worker). Refusals and halts keep their sentences; while running, only the active pass's facts are used.

## Decisions amended

**Phase 124 (2026-10-27), "Show real local-maintenance stages and definite counts only for the record-reading subphase … keep an indeterminate indicator for work with no honest total."** Now an overall checked percentage across passes, against the census estimate until a full check makes it exact, capped below 100% until then; time estimates computed only from what this device measured in this reduction; the record count stays as a detail line. "Without adding polling" holds: the page's display clock re-renders, and nothing polls the owner. Diagnostic facts stay volatile (in memory, per open). Justification: the operator's request and the day on two devices where a saved slice and a lost one looked the same.

## Tests

Each new case was shown failing against a deliberately wrong variant and passing as built: 31 recorded mutations, each applied to one product file, run against the named unit file, and restored with the file's sha256 checked ([mutations.json](./mutations.json), driver [mutations.py.txt](./mutations.py.txt)). Every new case is failed by at least one of them; the only cases no mutation failed are the eight pre-existing panel cases.

**New, `test/reductionEstimate.test.ts`** (23 cases, 19 declarations; the estimator and reducer as pure functions):

| Case | Rule | Failed by |
|---|---|---|
| shows no time before this device measured reading, the prefix and a fresh rate | no number before a measurement | E1 (a rate assumed before one is measured) |
| computes each figure from the measured rates (a worked example) | figures from measurements, exact arithmetic | E2 (fixed 2 s slice), E11, E13 |
| a pass cut before any slice was saved still sizes the work left by its measured budget | estimating only until measured | E27 (budget discarded at a pass's end) |
| the active pass's own first results do not swing a rate earlier passes measured | steady estimate | E28 (live rate always counted) |
| re-reading rows and re-checking saved results on later passes does not move it | re-reads are not progress | E3 (each pass's imported results counted again) |
| a cut pass falls back to what was saved and says the rest is being redone | show the fall | E3, E4 (unsaved kept as saved), E5 (no redo shown) |
| saved progress that could not be reused (a stale checkpoint) shows the fall | show the fall | E3, E6 |
| more history arriving shows as more to check, not as lost work | honest denominator | E7 |
| stays below 100% until a full check completed, then the total is exact | no overstated percentage | E8 (100% allowed early) |
| an estimate never sits at zero … (5 cases: re-reading, fresh past the census estimate, saving, building, storing, each past its estimate) | never zero; overrun said and re-estimated | E9 (overrun reaches zero) |
| counts down without reaching zero across the final pass, its steps 2 and 3 included | never zero | E10 (plain countdown clamped at zero) |
| sizes steps 2 and 3 as one measured full read until seen, then by the longest time seen | steps 2 and 3 sized honestly | E3, E4, E5, E8, E11 (no allowance) |
| online: says waits are not counted until one is measured, then counts the shortest | waits stated; quiet assumed | E2, E3, E11, E12 (mean wait), E13 (always "included") |
| offline with no wait measured: no waits ahead are claimed | waits stated | E13 |
| rounds for reading: seconds under a minute in tens, rounded up, never zero; then minutes, then hours | units a person reads | E14 (minutes to nearest), E15 (no ten-second floor) |
| maps each stage to its step | the three steps | E16 |
| copies only well-formed facts across the Worker boundary | presentation-only boundary | E17 |
| replay r07 (online, ×20, 130 attempts, 104 cut): saved progress never falls, each lost slice shows | monotonic saved %, re-reads not progress, falls shown | E3, E4, E5 |
| replay r06 (offline, ×100, 156 passes): the percentage rises monotonically and the estimate converges | convergence | E2, E18 (overall rate only), E19 (last pass alone) |

**Replay data and tolerance.** Phase 564's per-attempt tables for lab runs r06 and r07 ([replay-extract.py.txt](./replay-extract.py.txt) turned the logs into the literal rows in the test). Both reduce the 1,000-position seed; they predate this phase, so their logs have no census figure, and the total is taken as 10,685 results (r06's last import, 10,296, plus its previous pass's 389 fresh results, an upper estimate). Events are reconstructed per attempt: stage times from the table at 0.1 s, the first fresh check at the measured setup, the pause at its budget, the outcome at the attempt's end. Stated tolerance for r06:
- the checked percentage never falls;
- from pass 5 on, no pass raises the whole-reduction estimate by more than 30% (largest rise seen: 24%, at pass 74);
- from pass 45 until a quarter of the run remains, the estimate stays between half and three times the time actually left (seen: 0.68 to 2.86); earlier it is optimistic, because the first passes checked a family about seven times faster than the one that followed, which nothing could measure before it;
- in the last three passes it falls each time (144, 65, 43, 21 s at passes 153 to 156, against 12.6, 9.4, 6.3, 3.2 s actually left; the rest is the steps 2 and 3 allowance and a setup).

For r07: the saved percentage never falls; attempt 1's 8,703 lost fresh results show as a redo from 81% to 0%; every pass starts at the saved percentage however often it re-read the rows.

**New, `test/retentionSliceBudget.test.ts`**, *phase 565: the owner's verification counts reach the published status through the real scheduler, across a saved slice and a cut* (the real content owner, real WebCrypto, fake IndexedDB, the real scheduler on fake timers): pass 1 publishes rising counts and saves 209 results; the status crosses `captureAccountSessionState` intact; pass 2 imports those 209, reaches 233, is cut by queued input, and the facts fall back to 209 with the fall from 233 kept; pass 3 imports 209 again; the reduction finishes in 5 passes with an exact total of 1,249 (asserted) against a census estimate of 1,250 (asserted within 5% above it). Failed by W1 (the scheduler folds no count-only report), W2 (the owner does not hand the counts to the sink), W3 (the bridge does not admit the facts), W4 (the journal reports no imported results), W5 (no exact counts when a pass ends early: the cut's fall is lost) and W6 (no exact counts when checking ends: the total is stale).

**New, `test/localHistoryMaintenance.test.tsx`** (15 cases): running in step 1 (exact sentence, status role, `Saved history checked` 10 of 100); steps 2 and 3 (`Reduction steps` 1 and 2 of 3); one figure when both read alike; estimating with no number; overrunning; paused with saved progress, offline and online; paused without saved progress; lost progress; finished; each refusal (capacity, history-required, ineligible, durable-attempt, owner-error) unchanged while a reduction is in progress, with Check again and the queued sentence; wording. Failed by P1 (facts ignored: the pre-565 panel, 9 cases), P2 (facts replace a refusal sentence, 5 cases), P3 (no singular units), P4 (both figures always stated).

No existing assertion was changed.

## Runs

| Command | Result |
|---|---|
| `pnpm exec vitest run` on 60 files: every unit file importing `automaticLocalRetention`, `accountSessionBridge`, `retentionPreparation`, `contentMaintenance`, `localBaselineReplay`, `contentStore`, `reductionProgress` or `LocalHistoryMaintenance` ([list](./unit-neighbours-files.txt)) | 60 files, 674 passed ([unit-neighbours.log.gz](./unit-neighbours.log.gz)) |
| the mutation driver (31 variants, plus the three target files as built) | as built: 23, 23 and 1 passed; every variant failed at least one new case; every file restored with its hash checked |
| `pnpm exec tsc -b --noEmit --force` | exit 0 |
| `pnpm exec oxfmt --check` and `pnpm exec oxlint --react-plugin` on the 11 changed or new source and test files | pass, pass |
| the packaged application on the 2,000 seed, offline, twice | transcripts above; 0 page errors; no overlapping test process |
| `node scripts/account-crypto-prep/run.mjs --record`, then `pnpm account:crypto-prep` | recorded once after review; 6 passed |
| `node scripts/release-validation/check.mjs --record` and `plan.mjs --record`, then both without `--record` | passed; 1,138 obligations, 561 unresolved |
| `pnpm validation:inventory` | 10 passed |
| CI's release execution adapter files (`node --test --test-concurrency=2 …`, as in `ci.yml`) | 178 passed, including the 3,133-case denominator |
| the ten CI contract checks, `vectors:check` to `wasm:verify` | all exit 0 |
| `pnpm build` and `pnpm trace:check` | run last, after these records, as the release bookkeeping asks; results in the hand-back |

**Not run for this phase:** the full unit suite (operator, 2026-11-27: it runs once before merge), the browser suites, `pnpm test:account-setup`, and the lab online, at phone speed or past 32,768 rows.

## Bookkeeping

See [evidence.json](./evidence.json) for the figures.
- `test/reductionEstimate.test.ts` is registered in the reviewed general-test selection (`scripts/release-validation/general-tests.json`). The case denominator goes from 3,109 to 3,133 (its 23 cases and the new `retentionSliceBudget` case), reviewed Vitest files from 123 to 124, general stages from 308 to 309 and reviewed Vitest stages from 142 to 143, in `test/release-validation/general-tests.test.mjs` and `generated-tests.test.mjs`.
- **Planning inventory** (`check.mjs --record`), recorded once: test files 773 to 774, required 767 to 768; `reductionEstimate` new (27 declarations as the inventory counts them, describe blocks included); `retentionSliceBudget` 11 to 12; `localHistoryMaintenance` 6 to 17. Of docs, only `docs/account-crypto/constructions.json` is an inventory input, and it did not change.
- **Manifest** (`plan.mjs --record`): obligations 1,137 to 1,138, unresolved 561 (unchanged: the new file is a reviewed selection, not blocked).
- **Runtime census** (`node scripts/account-crypto-prep/run.mjs --record`), once, after review: exactly the eight changed product sources' hashes moved, and `src/crdt/reductionProgress.ts` was added (no domain label or cryptographic call). No label, template, group, site line or entrypoint changed: 527 sources, 201 labels or templates, 36 groups, 15 manual entrypoints. The registered label in `retentionPreparation.ts` stays on line 17.
- **Construction registry:** unchanged, since no registered site moved.
- `docs/decisions.md`: a 2026-11-27 entry quoting the operator and amending phase 124.
- `docs/product-backlog.md`: REDUCE-PROGRESS-LINE resolved, with what remains; LONG-OPERATION-PROGRESS added for the other long operations.
- `docs/progress.md` and `docs/completed.md` are left to the coordinating session.

## Decided without asking

- **Seconds floor at ten; "less than a minute" is not used.** The brief's "'less than a minute' rather than 0" was built first; the lab showed it beside the seconds form ("Less than a minute left in this step, about 20 seconds in all"). Rounding seconds up in tens from ten keeps every figure above zero and reads consistently. If the operator prefers minute-only wording under a minute, it is one function (`readableDuration`).
- **Hours from two hours,** rounded up ("about 3 hours"), rather than minutes beyond 119.
- **A pass is an attempt that reported progress**, including one cut while reading. The pass number therefore counts every re-read, as r07's 130 attempts would show.
- **The percentage includes the active pass's fresh results** (checked) and falls back to saved when a pass is cut, with the fall shown; paused, the panel shows the saved percentage only.
- **Refusals keep their sentences unchanged** even while a reduction is in progress: no saved percentage is added beside them. (Conservative; it could be shown.)
- **Steps 2 and 3 are each allowed one measured full read**, which under-promised by about five times in the lab.
- **Rates:** the slower of the overall and a 0.9-decaying recent window, and an ended pass's rate once one exists. Chosen against replays r06 and r07 (variants recorded as E18, E19 and E28).
- **Waits:** the shortest measured wait between passes, so time a person kept the device busy does not become the estimate; online, before one is measured, the figure says it does not count them.
- **The display clock** ticks each second while a reduction is running and has facts; nothing ticks while paused.

## Limits

- Not run online, on a phone, on the affected account, or past 32,768 rows. The replays are reconstructed from per-attempt tables at 0.1 s.
- The census estimate was checked on the unit fixture (exact to one result) and the lab seed (about 10% high), not on the live devices with 3,999 received positions and installed snapshots.
- The full unit suite was not run.

## At review

The coordinating session read the eight product diffs and the new module on 2026-11-27 and ran the following on the final tree, on this Mac, with no other test process running. Where a figure here differs from one above, this one stands.

- **Changed at review.**
  - `src/crdt/contentStore.ts`: the owner's once-per-pass report of its exact counts (`reportFinalCounts`) now catches anything thrown while reporting. It runs first in the pass's error handler, ahead of the bookkeeping that decides the next slice, so a fault in presentation must not be able to skip that. Nothing in it is known to throw.
  - Two cases added, for the two controls below that no case caught: in `test/localHistoryMaintenance.test.tsx`, *running before the new attempt has reported: the ended pass is not shown as the running one*; in `test/reductionEstimate.test.ts`, *a pass after a finished reduction starts a new one: pass 1, nothing saved, nothing measured*. No product code changed for either: the code was right and untested.
  - `docs/product-backlog.md`, LONG-OPERATION-PROGRESS: the other operations it names are the coordinating session's reading of the request, not operations the operator named. The entry now says so.
  - `docs/progress.md`: the seat document now covers this phase.
  - **One sentence shortened, by the operator's decision.** As delivered, a paused reduction said "{p}% is saved and will not be redone." (and "Some checking is saved and will not be redone." without a total). The application can break that promise: saved checks that cannot be reused, for example after content compaction (REDUCE-COMPACTION-STALE), are checked again, and the panel then shows the redo line. The coordinating session put this to the operator with a recommendation and the question "Shorten 'is saved and will not be redone' to 'of checking is saved'?"; the operator answered "Yes, shorten". The sentences are now "{p}% of checking is saved." and "Some checking is saved.", in the panel, its three assertions and the list above. The packaged application was not built again after this change; the lab runs do not reach a pause with saved progress, and the rendered panel cases assert the new sentence.
- **Its own controls,** six wrong variants, each applied to one product file and restored with the file's hash checked:

  | Variant | File | Result |
  |---|---|---|
  | a saved pass is recorded as cut | `automaticLocalRetention.ts` | the real-owner case fails |
  | re-checks of saved results count as held | `retentionPreparation.ts` | the real-owner case fails |
  | the census estimate is half what a full check makes | `localBaselineReplay.ts` | the real-owner case fails |
  | the paused figure counts down with the clock | `reductionProgress.ts` | three estimator cases fail |
  | a running attempt that has not reported shows the ended pass as the running one | `LocalHistoryMaintenance.tsx` | no case failed; the added panel case now fails |
  | a new reduction after a finished one continues its facts | `reductionProgress.ts` | no case failed; the added estimator case now fails |

- **Unit files.** The 60 neighbour files: 674 passed, before the two added cases. The two files with the added cases: 48 passed (`reductionEstimate` 24, `localHistoryMaintenance` 24, of which 16 are this phase's).
- **The packaged application again, on the final tree.** Built with the same flags; the 2,000-position seed, network off, a card added once checking passed 40%; once at 1280 by 900 and once at 390 by 844. Both runs gave the sentences of the cut run above, in the same order, and finished ("reduced at 6:15 PM", "6:16 PM"); 0 page errors; no other test process at the start or end of either. Screenshots of the panel were read at both widths: every sentence wraps inside the menu column and the bar sits under them. They are not filed here.
- **Figures at review.** `test/reductionEstimate.test.ts`: 24 cases, 29 declarations as the inventory counts them. `test/localHistoryMaintenance.test.tsx`: 18 declarations as the inventory counts them. Case denominator 3,134 (from 3,109). Reviewed Vitest files 124, general stages 309, reviewed Vitest stages 143, obligations 1,138 and unresolved 561, as above. The runtime census was recorded again for the one changed source; nothing else in it moved.
- **Limits found at review, not changed.**
  - Saved checks that cannot be reused, for example after content compaction (REDUCE-COMPACTION-STALE), are checked again. The panel says so ("Some checking has to be redone: it went from {a}% back to {b}%"); it cannot say so in advance.
  - A removal that ends without any progress report (`already-removed`) leaves the facts of a reduction in progress unfinished. They are not shown while the device is idle, but a later reduction in the same open would continue their pass count and could show a redo line for the old progress.
  - "pass {k}" counts every attempt that reported, including those cut while reading. On the affected devices it could reach the hundreds.
  - The status paragraph changes with every percentage point and every change of the rounded time, and a screen reader announces each change. Before this phase it changed with every record count.
- **Not repeated:** the agent's 31 mutations, its replays and its left-alone lab run.
- **Not run:** the full unit suite, by the operator's decision of 2026-11-27, and no browser suite.
- **The wording** was put to the operator before the commit, with example sentences for each state and screenshots. The operator's one stated decision is the shortened sentence above; the coordinating session takes the rest as not objected to, which is its reading and not a sentence-by-sentence approval.
- **Run last,** after these record edits and required before the commit: formatting and lint on the six files touched last, typecheck, build, the contract checks, the release inventory and plan, the release adapters, the crypto-prep check and the trace check.
