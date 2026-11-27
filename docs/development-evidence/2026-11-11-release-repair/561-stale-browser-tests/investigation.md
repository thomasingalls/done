> Written on 2026-11-13 by a read-only agent of the coordinating session, as the diagnosis behind phase 561, and filed below unchanged. Its scratch logs, traces, probe spec and CI copies were not kept, so the scratch paths it names no longer resolve; the CI history it cites is [ci-history.md](./ci-history.md).
## Read this first

The harness refused to let me write `561i/report.md`: subagents are not allowed to write report files. The full report is this message.

Supporting files are in `/private/tmp/claude-502/-Users-thomasingalls-Code-done--claude-worktrees-l2-onboarding-863db1/a2cb3ea1-c2ed-4b47-b08f-dc5bb9d6e506/scratchpad/561i/`:
- `runs/`: logs, traces and error contexts for every run.
- `probes/zz-probe.spec.ts`: the probe spec.
- `ci/ci-report.md`: the CI history, from a subagent that only read CI data and ran no tests.

**Result.** None of the failures comes from phases 557 to 560. All eight browser failures:
- reproduce on main (e9ec1e697), 1 run each;
- pass at the last green commit faf465f72 on this Mac under Node 26, 2 runs each. That rules out Node 26, this Mac and a stale build.

There are two causes, both from October, plus a CI budget problem.

| # | Test | Class | First failing commit | Operator needed? |
|---|---|---|---|---|
| 4, 5, 7, 8 | setup.spec.ts :210, :284, :962, :1031 | (b) test defect | 81c75e93b (10-23); current form since dc8f09727 | No product decision; fixture repair |
| 6 | setup.spec.ts :486 | (b) test defect | 81c75e93b; current form since dc8f09727 | No product decision; fixture repair |
| 3 | welcome.spec.ts :252 | (b) test defect; product behaviour verified correct | 98de7c303 (phase 226, 10-29) | Review of the new fault injection only |
| 1, 2 | removal-regressions.spec.ts :6, both variants | **(a) product defect**, plus (b) for the test | 98de7c303 (phase 226) | **Yes** |
| C | inboundReceiptViews all72 (CI only) | (c) runner speed, from an expensive assertion | its first slow runner, 11-07 | Yes for any deadline or CI change |

## Failures 4, 5, 7, 8: setup.spec.ts :210, :284, :962, :1031

**Mechanism.** Each test calls `openMenuSection(page, 'Account')` right after `page.goto(...)`.
- The helper (test/geometry/openApp.ts, added by dc8f09727) starts with `if (!(await menu.count())) return;`. `count()` does not wait.
- In the Vite-served setup app, React mounts the shell after the load event, because startup goes through a Worker. The tip trace for :284 shows: goto finished at 3.55 s, `#menu` count returned 0 at 3.59 s, then the click waited until the timeout.
- So the helper returns without opening Account. "Use another account" exists only inside the Account `<details>`, which starts closed, so the click waits out the whole 90 s.
- The page itself is fine: the snapshot shows the menu rendered with all four sections closed.

**Class: (b), a test defect left behind by an intended change.**
- Phase 40, 81c75e93b "group controls in collapsed sections", made all four sections start closed.
- The phase 41 adaptation (dc8f09727) introduced the racy helper.
- The same race was found and fixed in three packaged specs the same day: d1c2784be, "Three navigation sites wait for the existing writing shell before opening a collapsed sidebar section". setup.spec.ts never got that fix.
- The phase 41 README says those campaigns were "adapted and source-reviewed, but … not rerun".

**Since when.**

| Commit | Result | Runs |
|---|---|---|
| faf465f72 | pass | 2 |
| fa26d5225 (parent of 81c75e93b) | pass | 1 |
| 81c75e93b | fail; tests not yet adapted, so the button is simply hidden | 1 |
| dc8f09727 | fail, current form | 1 |
| e9ec1e697 | fail | 1 |
| tip | fail | coordinator's runs, plus 1 traced run of :284 |

**Evidence strength.** The mechanism is deterministic, since count() is always 0 before mount, and the trace confirms it. A probe in the main scratch copy made the helper wait for `.shell, .account-setup` before counting; all four tests then passed (1 run each).

**Repair.** Wait for the shell before opening the menu: either `await expect(page.locator('.shell')).toBeVisible()` after the four `goto` calls (the d1c2784be pattern), or make the shared helper wait for first render. The shared helper also serves unlock and recovery screens, so the per-call-site fix is the narrower one. Test-only; no product decision.

## Failure 6: setup.spec.ts :486

**Mechanism.** The last assertion checks visibility of "Account connected. Approved devices can sync writing."
- That note lives in the **Sync** section (src/ui/Menu.tsx:374-377, inside `<MenuSection title="Sync">`), not Account. After the offline reopen all four sections are closed by design, so the paragraph is in the DOM but hidden.
- dc8f09727 added `openMenuSection` calls only before actions, not before this visibility check.

**Class: (b).**

**Since when.**

| Commit | Result | Runs |
|---|---|---|
| faf465f72 | pass | 2 |
| fa26d5225 | pass | 1 |
| 81c75e93b | fail, earlier in the test | 1 |
| dc8f09727 | fail | 1 |
| main | fail | 1 |
| tip | fail | coordinator 3 or more, plus mine 1 |

**Evidence strength.** Adding `await openMenuSection(page, 'Sync')` before the assertion made it pass (probe, 1 run).

**Repair.** That one line. Test-only.

## Failure 3: welcome.spec.ts :252

**Mechanism.** The test simulates a refused deletion by patching the page's `indexedDB.deleteDatabase`.
- Since phase 226, LocalApp uses `createWorkerLocalStartupRuntime`, so the deletion in `protectLocalWorkspace` (src/crdt/localProtection.ts:310) runs inside the `localStartup` dedicated Worker. That Worker has its own `indexedDB`.
- The injected refusal never fires, protection completes ("Protection is enabled"), and the "Finish enabling protection" screen never appears.

**Class: (b).** The injection point went stale because of an intended architecture change, recorded in docs/decisions.md:6292, "phase226: default Local and public setup worker activation".

**The product behaviour is correct.** Probe in the main copy:
- Page-only injection reproduces the failure, 2 of 2 runs. This is the negative control.
- The same one-shot refusal injected into the Worker realm (patched on Worker start) gives "Finish enabling protection", which survives a reload. After entering the code, the writing opens and the menu shows "Unlock code enabled.", 3 of 3 runs.

**Since when.**

| Commit | Result | Runs |
|---|---|---|
| faf465f72 | pass | 2 |
| 700087b07 (phase 225) | pass | 2 |
| 98de7c303 (phase 226) | fail | 2 |
| main | fail | 1 |
| tip | fail | coordinator 2, plus mine 1 |

**Repair.** Inject the refusal into the Worker realm. Use a deterministic method, such as patching every `localStartup` worker script fetch or a test-only hook. My probe's patch-on-start approach is racy in principle. This changes how the test injects the fault, not what it proves. Review is advisable; no product decision.

## Failures 1 and 2: removal-regressions.spec.ts :6, both variants

**Mechanism.** Since phase 226, public setup runs its coordinator inside the `firstDeviceOwner` Worker (`createWorkerFirstDeviceSetup`).
1. When local data is removed in another tab, the coordinator gets the retirement notice in its own realm. `onRetirement` opens a `BroadcastChannel('done/slot-lifecycle')` inside the Worker (src/crdt/runtimePorts.ts), which the test's window-only patch cannot suppress.
2. The coordinator closes itself (src/account/firstDeviceSetup.ts:660 and :633) and publishes its closing screen to the window: "Locking and finishing storage operations…" with "Your writing stays in this workspace."
3. Nothing then tells the window-side owner (src/ui/windowCeremonyUi.ts) to finish. The Worker stays alive and its channels stay open, so no `setupClosed` message arrives and the worker-lifetime watch does not fire.
4. In an instrumented build of the main copy, the window never called `fail()` or `drain()` in 20 s.
5. The window therefore mirrors the closing screen indefinitely, and the alert the test waits for ("removed" or "retired") never appears.

The property the test exists for still holds: the attempt row stays null before and after reload. Reload shows "This workspace was removed", or "Add protection before sync" after Start fresh. Back goes to "Choose an account".

**Class: (a), a product defect a person can hit, confirmed with no fault injection at all.**
- Steps: start Set up sync and reach "Create your passkey". In a second tab, go to Remove local data and confirm.
- Result: the first tab shows "Locking and finishing storage operations…" and "Your writing stays in this workspace." with only Back. I watched it for 90 s with the Worker still alive; it ends only with Back or a reload.
- The message is misleading, since the writing was just removed. Nothing is lost or recreated.
- Also (b): the test's simulation of a coordinator that misses the cooperative notice no longer isolates the durable fence, because the coordinator now lives in the Worker.
- Phase 230's README (baa252694) already recorded the "forever-closing presentation" as open for the recovery trace. It fixed only the path where the window does drain.

**Since when.**

| Commit | Result | Runs |
|---|---|---|
| faf465f72 | pass | 2 |
| 700087b07 (phase 225) | pass | 2 |
| 98de7c303 (phase 226) | fail, same screen | 2 |
| main | fail | 1, plus 7 probe runs |
| tip | fail | coordinator 3, plus mine 1 |

**Repair.** Tell the window when the Worker coordinator has closed itself (for example, a terminal message from the Worker after its own retirement close, or the window owner reacting to slot retirement), then show a terminal "removed / retired" alert. Note the current failure copy, "The passkey step could not finish … Your saved setup and writing have been kept", would also be wrong after a removal. Likely files: src/crdt/workerCeremonyUi.ts, src/account/firstDeviceSetup.ts, src/ui/windowCeremonyUi.ts, src/ui/firstDeviceSetupWorker.ts, and the test.

**This needs the operator.** It changes product behaviour and copy, and the test's simulation has to be redefined, which changes what the test proves.

## C: the CI unit timeout and CI generally

**How long the case takes here and why.**
- On this Mac the all72 case takes 2,824-2,886 ms (5 runs, `--maxWorkers=1`, Node 26).
- About 98% of that is two Vitest `toEqual` byte comparisons per entry view: ~12 KB page and request bytes, 240 views.
- With `assert.deepStrictEqual` the case takes 56-60 ms, and with the two lines removed 58 ms (3 runs each, HEAD scratch copy).
- A flipped-byte negative control still fails under strict equality.
- This is the same pattern the 2026-10-16 decision fixed (docs/decisions.md:4757).

**When it crossed 5 s on the runner.** It never got slower.
- It was added on 11-05 (6ae3e49ca). It takes 3.1-3.3 s on fast hosted runners and 5.5-5.8 s on slow ones, and it failed on the first slow runner it met (11-07).
- About half of hosted runs since 10-16 land on a slow runner; runner speeds fall into two groups (1.0-1.5x and 1.7-2.1x).
- The same code passed 3 minutes later on main at 3,085 ms.

**What the runs from 10-21 to 10-30 failed on.**
- A unit fixture with a hard-coded date that aged out.
- `authority:check` census not re-recorded.
- Release inventory and manifest drift, twice, on the Node 24.22.1 branch.
- pnpm's minimum-release-age check rejecting a dependabot lockfile.
- Every "cancelled" run since 10-16 except one is the **20-minute job timeout**, not a superseded run.

**Cases next to trip** (latest log, default 5 s deadline, worst share):

| Case | Worst share of 5 s |
|---|---|
| inboundStaleTurnControl:4 | 85% |
| inboundPageCodec:26 (same 72-extent `toEqual` loop) | 76% |
| inboundMixedReplay seed407 | 73% |
| workspaceAdmission:1256 | 68% |
| inboundMixedReplay seed406 | 63% |
| inboundMixedReaders:124 | 63% |
| inboundMixedReplay seed408 | 58% |
| preparationReceiptJournal all72 | 55% |

Every other case above 3 s has an explicit deadline. I did not measure whether those inbound cases share the `toEqual` cost; they use the same pattern.

**How slow cases are handled.**
- There is no `testTimeout` in vite.config.ts, so Vitest's 5 s default applies.
- 82 explicit per-test deadlines (15-300 s) across 31 files.
- Recorded rules:
  - The ci.yml comment "Keep each case's workload and deadline".
  - The 10-16 decision keeps "the five-second default and the 20-minute job limit".
  - decisions.md:2463 bans retries or deadline increases that turn a failure into credit.
  - decisions.md:2596: "do not derive a new bound from a … timing observation".

**Options.**
1. Swap the byte `toEqual` calls for strict equality, following the 10-16 precedent. Same proof, about 60 ms, keeps every rule. Possibly apply it to the near-limit inbound files too.
2. A per-test deadline. Against the recorded rules, so it needs the operator.
3. A global `testTimeout`. Broadest, and contradicts the 10-16 decision.
4. A faster runner. Costs money and does not fix the job timeout.
5. Retries. Banned.

**Separate blocker: the 20-minute job limit.** Fixing the unit case alone will not make CI green.
- The packaged step grew from 35 tests (2.8 min) to 54. The enrollment cases alone are about 430 s.
- The best recent run (43072060806) had passed 41 of 54 tests at the 20-minute mark. Finishing would take about 25 min.
- Options: split the browser suites into their own job, shard, or raise `timeout-minutes`. The last is a recorded limit, so it is an operator call.

## Which would a person using the released app meet?

Only failures 1 and 2: the setup tab stuck on "Locking and finishing storage operations…" after removing local data in another tab. Nothing is lost, and Back or a reload recovers. Failures 3 to 8 and the CI timeout affect only the tests and CI.

## Not determined

- Whether the enrollment and recovery ceremony screens show the same stuck closing screen. They share windowCeremonyUi; I did not test them.
- Where exactly the Worker-side close ends. I did not capture Worker console output; I established only that the window never drains.
- Why enrollment-progress "rejected-reply" failed on CI run 42425485009 ("Worker operation could not finish."). It passes locally.
- Whether the near-limit inbound cases share the `toEqual` cost.
- All72 timing under Node 24 locally.
- The fa26d5225, 81c75e93b and dc8f09727 results rest on single runs.

## Parts of the brief that turned out wrong

- Failure 6: the note is in the **Sync** section, not Account. All four sections start closed by design.
- "CI never reaches the browser steps": three unit-passing runs since 11-07 did reach the packaged step, but the 20-minute job timeout cut them at 15 to 41 of 54. The failing specs are at positions 45-54 in alphabetical order, and account-setup is a later step. No CI run has reached them since 10-23, and account-setup has not run since 10-16.
- Node 26 against 24.22.1 is not a factor.
- Two of these were known in part, though not tracked as failures: the phase 41 README said the account-setup campaign was not rerun, and phase 230's README noted the forever-closing screen.

## Environment, scratch copies and checkout state

**Other processes on this Mac.** I checked `ps` before each run.
- Another project's Playwright run (certo, using Google Chrome) overlapped my first setup probe run in the main copy. The tests passed and there was no port clash.
- Two long-lived done services from Codex worktrees listen on 127.0.0.1:53219 and 53220, since 10-09 and 11-10. These suites do not use those ports, and I left them alone.
- An unrelated Vite server is on [::1]:5173.

**Scratch copies**, each made with `git archive` plus `pnpm install --frozen-lockfile --ignore-scripts`, never more than two at once, all deleted:

| Commit | Size |
|---|---|
| e9ec1e697 (with dist) | 1.7 GB |
| faf465f72 | 0.77 GB |
| 700087b07 | 1.1 GB |
| 98de7c303 | 1.1 GB |
| fa26d5225 | 0.97 GB |
| 81c75e93b | 0.97 GB |
| dc8f09727 | 0.98 GB |
| bfb512c70 | 1.6 GB |

The scratch folder now holds 216 MB of logs and traces, and the disk has 62 GiB free. Probe edits and instrumentation lived only in those copies. My runs in the checkout wrote their output to scratch with the list reporter, so the coordinator's `test-results/` is untouched; its timestamps are still 08:04 and 08:05. No processes of mine are left running.

**Checkout confirmations.**
- `git status --short | wc -l` is 43, the same as at the start.
- `git write-tree` prints 44f4ba6abeda7ddd08f55ea0ab84ad4fe1b41a86.