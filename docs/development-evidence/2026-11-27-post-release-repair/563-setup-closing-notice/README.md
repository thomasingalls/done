# Phase 563 — a sync setup ends on a final notice when another tab removes its data

The coordinating session asked on 2026-11-27 for SETUP-CLOSING-STUCK to be repaired on the released tree. A first pass confirmed the mechanism, found a second layer and an earlier start, tried enrollment and recovery, and stopped before changing anything: the existing test's "removed"/"retired" wording cannot hold on the path the defect takes (see "Why the cooperative path has its own notice"). The coordinating session then gave the operator's decisions:
- new copy on that path;
- a named cause on the internal `setupClosed` message;
- both layers repaired;
- enrollment and recovery left unchanged and recorded.

Base: `5d0705fc2` (the merge of PR #65, which production serves since 2026-11-27), tree `7a770006bf39e5288c3158cf36ad6da0aeba284c`, clean.

## The new product string

> Sync setup stopped because another tab began removing this device’s data. Reload this tab to continue.

- It is the only new or reworded product string. It is defined once, as `setupStoppedByRemoval` in `src/account/firstDeviceSetup.ts`; the build includes it in the setup Worker's bundle and in the page-hosted setup's chunk.
- It is the coordinating session's wording, with one change made here: the apostrophe in "device’s" is the typographic one (U+2019) that the app's other copy uses ("browser’s", "account’s"), not the straight one in the request. The browser test asserts the exact text.

## Cause, as confirmed

**The defect, seen live.** Setup was waiting at "Create your passkey" and another tab removed local data ([setup-mechanism.spec.ts.txt](./setup-mechanism.spec.ts.txt), [setup-mechanism-base.log.gz](./setup-mechanism-base.log.gz)). Instrumentation prepended to the setup Worker's script showed:
- The Worker received `{"kind":"retire","slotId":"local"}` about 20 ms after Remove was clicked.
- Within about 35 ms the page showed "Locking and finishing storage operations…" and "Your writing stays in this workspace.".
- For the next 20 s the Worker never posted `setupClosed`, the page never terminated it, and `page.workers()` still listed it.

The same happened with setup waiting on its held registration reply.

**Two layers.**
1. **The coordinator never left its closing screen.** Its close on a slot-retirement notice (`onSlotRetirement` in `src/account/firstDeviceSetup.ts`) published "Locking and finishing storage operations…" and nothing after it, whichever realm hosts it.
2. **In the Worker host, nothing ended the page's incarnation.** Nothing connected that close to the Worker host (`src/crdt/workerCeremonyUi.ts`) or to any message to the page's owner (`src/ui/windowCeremonyUi.ts`). So the Worker stayed alive and the page kept mirroring the closing screen.

**Since when (this corrects phase 561's dating).**
- Phase 561's investigation dated the defect from phase 226 (`98de7c303`, 2026-10-29). That is when the test began to fail, not when the screen began.
- The coordinator's retirement close was added in `42ebdd12d` (2026-10-15), in the same commit as `test/packaged-account/removal-regressions.spec.ts`. That spec suppressed the notice from the start, so its cooperative path never ran.
- Phase 226 moved the coordinator into a Worker, where the page-side suppression no longer reached it. That only stopped the suppression from hiding the screen.
- **Ran:** phase 225 (`700087b07`, coordinator still in the page), built in a scratch copy, with no suppression anywhere. The same stuck screen stayed for 15 s, both waiting on the held reply and idle at the passkey step ([phase225-cooperative.spec.ts.txt](./phase225-cooperative.spec.ts.txt), [phase225-cooperative.log.gz](./phase225-cooperative.log.gz)).
- **Inferred, not run:** `42ebdd12d` itself. Its retirement close has the same body, and its parent has no `onSlotRetirement`.
- The phase 561 record is not edited.

## Why the cooperative path has its own notice

The existing test asserted "removed" for a plain removal and "retired" after Start fresh. Those are the durable fence's two refusals:
- "This workspace was removed from this device" comes from the removal marker.
- "This setup owner was retired by device removal" comes from the epoch, once Start fresh has deleted the marker.

They run only when a coordinator that missed the notice later tries to save. A coordinator that hears the notice closes at once. That is before the removal commits (the order is not guaranteed) and always before any Start fresh, which is a later choice in the other tab, and nothing reaches the setup tab afterwards. So neither fence message can be shown truthfully at that moment. The new sentence is true whether the removal commits, refuses or is followed by Start fresh.

## The repair

**Layer 1, `src/account/firstDeviceSetup.ts`.**
- A close caused by the retirement notice sets the final state at once: `{ kind: 'unlock', error: setupStoppedByRemoval }`. That is the unlock screen with one `[role=alert]`, the screen the durable fence's refusal already uses. It never shows the closing screen.
- An explicit close still shows "Locking and finishing storage operations…".
- Such a close no longer writes a remembered display name into the setup metadata it is retiring. Before, a connected account renamed in the open editor would have saved the new name during its retirement close, which a committed removal's fence refuses. *Decided here; see "Decided without asking".*
- The coordinator reports a retirement close once through `onRetired(listener)`, with its closing promise.
- This layer alone fixes the page-hosted mode (`networkSessions` false), where the coordinator is the page's owner.

**Layer 2, the Worker host and the page.**
- `src/crdt/workerFirstDeviceSetup.ts` wires `onRetired` to a new `slotRetired(closed)` on the host context (`src/crdt/workerCeremonyUi.ts`).
- On `slotRetired(closed)` the host publishes the final display and waits for the page to acknowledge it over the existing `setupState` path. It then posts `{ v: 1, kind: 'setupClosed', owner, ok, cause: 'slot-retired' }`, where `ok` is the coordinator's own close result. Its native lifetime stays open.
- On that message with `ok: true`, `src/ui/windowCeremonyUi.ts` drains through its ordinary close:
  - the request to close, the cohort close, the channel close and the Worker's termination;
  - it keeps the final display instead of switching to the closing screen and then to `failure(...)`;
  - it then marks the incarnation failed, so a new command starts a fresh inspect-only Worker (phase 230).
- The host's ordinary cleanup acknowledgement, a `setupClosed` without a cause, still arrives after the drain closes the channels. The cause message is not taken as that acknowledgement.
- A `setupClosed` without the cause (a channel failure) and one with the cause and `ok: false` (the coordinator's own cleanup failed) take the existing path unchanged.
- Neither side uses the cause while an account opening is handing off.
- `src/ui/firstDeviceSetupWorker.ts` only leaves `onRetired` out of the page owner's type.

**Unchanged.** No stored format, service message, limit or recorded decision changes. The internal Worker-to-page `setupClosed` message gains one optional field; the page and the Worker script come from one build. Enrollment's and recovery's own code is untouched. They share the two ceremony files changed here, but their controllers never call `slotRetired`, so they never send the cause.

## What the final screen does after each outcome

[reload-outcomes.spec.ts.txt](./reload-outcomes.spec.ts.txt), [reload-outcomes.log.gz](./reload-outcomes.log.gz), one run each on the repaired build, setup waiting at "Create your passkey":

| Removal in the other tab | Setup tab | Saved attempt | After reloading the setup tab |
|---|---|---|---|
| commits | "Unlock your workspace", the alert, Worker gone | null | "This workspace was removed" (Check again, Choose an account) |
| refuses before any erasure (first removal write refused in that tab by an injected `IDBObjectStore.put` failure; the tab shows "Removal could not finish…") | the same final screen | present | "Unlock your workspace": setup resumes with the unlock code |
| commits, then Start fresh | the same final screen | null | "Add protection before sync" |
| commits, page-hosted mode (`networkSessions` false, no Worker) | the same final screen | null | "This workspace was removed" |

The final screen keeps the unlock screen's own elements under the heading "Unlock your workspace":
- the line "Enter the unlock code you saved for this workspace.";
- the code field with Continue;
- Use another account, Remove from this device and Back to local workspace.

What happens if a code is entered there depends on the host:
- In the Worker host, a code starts a fresh inspect-only Worker.
- In the page-hosted mode the form does nothing, because the retired coordinator accepts no command. A reload continues, as the notice says.

## Tests

Every test added or changed, with what it proves. Each was run against the unfixed product source or under a recorded product mutation, and with the repair.

How the base runs were made:
- The five product files were written from `HEAD` ([product-state.sh.txt](./product-state.sh.txt)), and the saved repaired copies were put back afterwards.
- The browser base and mutation builds were `pnpm exec vite build`. `pnpm build`'s `tsc -b` also typechecks the new unit tests, which do not compile against the old product.
- The repaired build was `pnpm build`.

### `test/packaged-account/removal-regressions.spec.ts`

**"removal in another tab ends a waiting setup on its final notice", plain and "after Start fresh"** (new; the cooperative path).
- No suppression anywhere. Setup waits at "Create your passkey", as in the reported steps.
- After the removal, and after Start fresh in the second variant, the case requires:
  - the alert's exact text, checked before and after the Worker ends;
  - the setup Worker gone from `page.workers()` within the default 5 s;
  - the saved attempt null;
  - "Your writing stays in this workspace." and the passkey-failure display never shown. A `MutationObserver` installed at the passkey step records any appearance of either sentence.
- Unfixed product: both fail at the alert (element not found; the tab is on the closing screen), 8.4 and 9.0 s ([spec-base.log.gz](./spec-base.log.gz)).
- Repaired: both pass, 3.5 and 4.0 s ([spec-after.log.gz](./spec-after.log.gz)).
- Mutation M2, the Worker host's notice removed (`user.onRetired(context.slotRetired)` deleted): both fail at the Worker poll, expected 0 and received 1. The alert had already passed, because layer 1's display still reaches the page ([spec-M2.log.gz](./spec-M2.log.gz)).
- Mutation M3, the page drains with its ordinary closing display and puts the final display back afterwards: both fail at the recorder with `["Your writing stays in this workspace."]` ([spec-M3.log.gz](./spec-M3.log.gz)).
- Diffs of all three mutations are in [mutations.txt](./mutations.txt).

**"a delayed registration reply cannot recreate removed setup", plain and "after Start fresh"** (title kept; the missed-notice path).
- The page-only `BroadcastChannel` patch is gone. The setup Worker's script is served with a prefix that drops every `done/slot-lifecycle` message in that realm and counts the notices it withheld and any that still reached a channel's `onmessage`.
- These two cases run with service workers blocked, as phase 561's welcome case does, so every Worker script request reaches the route.
- **Control, after the removal (and Start fresh):** the withheld count goes above 0, polled within 5 s; the delivered count is 0; and the tab still shows "Preparing encrypted sync…". Together these show the coordinator never received the notice.
- The held registration reply is then released. The case requires "removed" or "retired" in the alert, as before, neither untrue sentence on the page, and the saved attempt null.
- These cases pass on the unfixed product too (3.7 and 4.0 s, [spec-base.log.gz](./spec-base.log.gz)). The durable fence works without the notice, which is what they guard.
- Their proof is mutation M1: the durable fence disabled in `src/account/setupProgress.ts`, two lines (in [mutations.txt](./mutations.txt)):
  - line 105, `if (value !== undefined) await assertSetupNotRemoved(slotId);`, commented out;
  - line 125, `else if (epoch !== current)`, made never true.
- With M1 both fail at the alert (element not found), 8.9 and 9.5 s ([spec-M1.log.gz](./spec-M1.log.gz)).
- The same build under the earlier probe, which reads the attempt after the release, shows the reply recreating the saved attempt (registration ceremony saved) and the tab on "Create your passkey" ([missed-notice-probe-M1.log.gz](./missed-notice-probe-M1.log.gz)). Without M1 the probe shows the fence's alerts and a null attempt ([missed-notice-probe-base.log.gz](./missed-notice-probe-base.log.gz)).
- `src/account/setupProgress.ts` was restored from `HEAD` and rebuilt. `git diff` shows no change to it, and no `MUTATION` text remains under `src`.
- Repaired: both pass, 3.6 and 3.9 s ([spec-after.log.gz](./spec-after.log.gz)).

### Unit cases

Runs: [unit-base.log.gz](./unit-base.log.gz) (unfixed product: 7 failed, 14 passed in the three files), [unit-after.log.gz](./unit-after.log.gz) (repaired: 21 of 21), [unit-neighbours-after.log.gz](./unit-neighbours-after.log.gz) (the final test text: the four changed unit files, the 14 other files that import the changed modules or their importers, and `setupWorkerProtocol`, `ceremonyWorkerLifetime` and `workerCeremonyPhase`; 21 files, 96 of 96).

`test/firstDeviceSetupAccess.test.ts` covers layer 1 in the page-hosted coordinator, with fake IndexedDB and the retirement notice delivered directly:
- **"a slot retirement ends a waiting setup on its final notice at once, never on the closing screen, and the retired owner accepts nothing".**
  - What it requires: the final state synchronously, as the only notification; unchanged after the in-flight request drains and the close settles; a later unlock reaching no network; the saved attempt unchanged.
  - Unfixed: fails, because the state is the closing screen.
- **"reports its own retirement close once, with that close".** Unfixed: fails (`onRetired` is not a function).
- **"an explicit close still shows the closing screen and is not reported as a retirement".** This is a guard that the explicit path is unchanged. Unfixed: fails only because `onRetired` does not exist.
- On the first unfixed run the first case also hit Vitest's 10 s teardown timeout, because it left its request pending when its first assertion failed. It now releases the request in `finally`. The log kept is the rerun.

`test/nativeFirstDeviceController.test.ts` covers the Worker host. The native lifetime, phase, environment and provider are stand-ins; the channels and the presentation are real.
- **"reports the coordinator closing itself on slot retirement to the shared host"**: the controller wires `onRetired` to `slotRetired`. Unfixed: fails.
- **"a slot-retired controller is reported with its cause only after the Window acknowledged its final display, and the host waits for the Window to drain it"**:
  - nothing is posted while the page holds back its acknowledgement;
  - the message is then exactly `{ v: 1, kind: 'setupClosed', owner, ok: true, cause: 'slot-retired' }`, after the final display;
  - the host lifetime is not closed until the page closes its channel, after which it closes and posts the ordinary `setupClosed` without a cause.
  - Unfixed: fails.
- **"a slot-retired controller whose own cleanup failed reports failure with its cause"**: `ok: false`. Unfixed: fails.
- The file's fixture gained `onRetired` and `slotRetired` stand-ins.

`test/windowCeremonyUi.test.ts` covers the page. The native cohort, journal, provider and lifetime watch are stand-ins. Fake Workers answer on the real channels and acknowledge a closed root channel as the host does.
- **"a Worker whose controller closed itself on slot retirement keeps its final display through the drain, and only a new command starts a fresh Worker"**:
  - the final display is never followed by the closing or failure display;
  - the Worker is asked to close and is terminated, and the cohort is closed;
  - `requiresUnlock` becomes true;
  - the next command builds a second Worker with no initial code, which receives the retry command and then that command.
  - Unfixed: fails (the failure display replaces the final one).
- **"a setupClosed without that cause still drains to the failure display exactly as before"**: final, closing, failed; `failure(false, undefined)`. Passes on both texts, as intended.
- **"a slot-retired close whose own cleanup failed takes the ordinary failed-cleanup path"**: final, closing, poisoned; `failure(true)`. Passes on both texts, as intended.

`test/firstDeviceInspectionPresentation.test.ts` is a neighbour whose fake coordinator lacked `onRetired`. Its two cases failed on the repaired product (`user.onRetired is not a function`) until the fake gained `onRetired: vi.fn()`. No assertion changed.

## Enrollment and recovery: different, not changed

[ceremonies.spec.ts.txt](./ceremonies.spec.ts.txt) is the version of the third run; the first two lacked the follow-up actions, and the first looked for the enrollment slot in the path, not the query string, and timed out without a result ([ceremonies-run1.log.gz](./ceremonies-run1.log.gz), [ceremonies-run2.log.gz](./ceremonies-run2.log.gz), [ceremonies-run3.log.gz](./ceremonies-run3.log.gz)). Release product, one run each.
- **Enrollment, existing device, at "Connect devices"** (invitation link, Copy link, Check again). Removing that account slot's local data in another tab completed ("Removed from this device"). The tab kept the invitation screen for the 20 s watched. Check again was then refused, with the alert showing the raw reason code "device-data-removal".
- **Recovery, new device, at the review step** ("Recover on this device and disconnect the previous devices"). The same removal completed, and the tab kept the review screen for 20 s. The Recover button was refused with the same raw code, and "Start a new recovery attempt" appeared.
- Neither ceremony Worker received a retirement message; by the code, neither opens a `done/slot-lifecycle` channel. No database reappeared, and the removal page still said "Removed from this device".
- At recovery's earlier save-code step there was nothing to remove ("Nothing to remove").

It is a different mechanism: no self-close, so no closing screen; a stale live screen and a raw reason code instead. Nothing was changed, as asked. It is recorded as CEREMONY-STALE-AFTER-REMOVAL. Not tried: enrollment's new-device side, other steps, reloading either tab.

## Results

All bounded with `timeout` and run one at a time from this worktree; the Playwright runs' output went to scratch, except the two whole-suite runs, which wrote `test-results/` as CI does.

| Command | Result |
|---|---|
| `pnpm exec playwright test --config playwright.packaged-account.config.ts test/packaged-account/removal-regressions.spec.ts --reporter=list --output <scratch>`, release text and build | 2 failed at the alert expectation (8.8 and 9.3 s); the page shows the closing screen ([removal-regressions-release-text.log.gz](./removal-regressions-release-text.log.gz)) |
| the same spec, new text: unfixed product / repaired / M1 / M2 / M3 | 2 failed, 2 passed / 4 passed / 2 failed (missed-notice) / 2 failed (cooperative) / 2 failed (cooperative), as above |
| `pnpm exec vitest run` on the three changed unit files: unfixed / repaired | 7 failed, 14 passed / 21 passed |
| `pnpm exec vitest run` on 21 files: the four changed ones, the 14 others importing the changed modules or their importers, and `setupWorkerProtocol`, `ceremonyWorkerLifetime`, `workerCeremonyPhase` | 21 files, 96 passed (two failed before `firstDeviceInspectionPresentation`'s fake gained `onRetired`) |
| `pnpm typecheck`, and `pnpm exec tsc -b --noEmit --force` | exit 0, exit 0 |
| `pnpm exec oxfmt --check` and `pnpm exec oxlint --react-plugin` on the ten changed source and test files | pass, pass |
| **CI's packaged browser step**, the exact command in `.github/workflows/ci.yml` | **56 passed, none failed (10.1 min)**; the four `removal-regressions.spec.ts` cases are tests 45 to 48, 3.3 to 4.1 s ([packaged-step.log.gz](./packaged-step.log.gz)) |
| **`pnpm test:account-setup`** | **20 passed (1.8 min)** ([account-setup.log.gz](./account-setup.log.gz)) |
| `node scripts/release-validation/check.mjs`, `plan.mjs` after recording | pass; 1,136 obligations, 561 unresolved |
| `pnpm validation:inventory` | 10 passed |
| CI's release execution adapter files (`node --test --test-concurrency=2 …`, as in `ci.yml`) | 178 passed, including the 3,095-case denominator |
| `pnpm account:crypto-prep` after recording | matched, 6 passed |
| the ten CI contract checks, `vectors:check` to `wasm:verify` | all exit 0 (before these records; run again after the final build) |

- **Before:** the packaged step was 52 of 54 at phase 561. It is now 56 of 56: the two failures pass, and two cases are new.
- **What these runs used:**
  - The whole-suite runs used `dist/` from `pnpm build` of the final product source (its setup Worker is `firstDeviceOwner.worker-DI2Oek7-.js`).
  - The tree changed after them only in these records and the two bookkeeping recordings.
  - `pnpm build`, the ten contract checks and `pnpm trace:check` run after the records, last. Their results are in the handoff report, because editing this record afterwards would move the tree their receipts are tied to.
- **Overlap** ([overlap.log](./overlap.log)): another agent's worktree started a Playwright run (`scripts/performance/send-cost/playwright.config.ts`) at 13:03:01Z.
  - It overlapped about the last five minutes of the packaged step (12:58 to 13:09Z) and all of `test:account-setup`.
  - Both passed, in times close to phase 561's (10.0 and 1.7 min).
  - Before every earlier run, a count of other Playwright, Vitest and `node --test` processes found none.
  - Two long-lived done services from other worktrees listen on 127.0.0.1:53219 and 53220; these suites use 53221 and 53222.
- Node 26.13.1 locally; CI pins 24.22.1.

## Bookkeeping

Following [development.md](../../../development.md#release-bookkeeping); details in [evidence.json](./evidence.json). Each recorder ran once, after its would-be output had been written to scratch and compared with the recorded file ([inventory-preview.mjs.txt](./inventory-preview.mjs.txt), [manifest-preview.mjs.txt](./manifest-preview.mjs.txt), [census-preview.mjs.txt](./census-preview.mjs.txt)).

**Planning inventory**, `check.mjs --record`, run twice.
- First run: exactly five input hashes changed, for the five test files above. Four declaration counts rose: `firstDeviceSetupAccess` 4 to 7, `nativeFirstDeviceController` 5 to 8, `windowCeremonyUi` 3 to 6, and `removal-regressions.spec.ts` 1 to 2 (a second `test` loop; `test.describe` and `test.use` are not counted).
- Second run, after the denominator edit below: only the hashes of `test/release-validation/general-tests.test.mjs` and `generated-tests.test.mjs` changed.

**Manifest**, `plan.mjs --record`, run twice. Against the base it changes in three places:
- `inventoryDigest`;
- the `test/firstDeviceSetupAccess.test.ts` row's expected cases, 4 to 7;
- the denominator case's title, "3092-case" to "3095-case".

Obligations stay at 1,136 and unresolved at 561. The other four test files stay blocked pending review of their runtime denominator.

**Registered counts.** `test/firstDeviceSetupAccess.test.ts` is in the reviewed general-test selection, so its three new cases move the general-test case denominator from 3,092 to 3,095. Three registry lines moved, as phase 559 did: in `test/release-validation/general-tests.test.mjs` the case title and the count, and in `generated-tests.test.mjs` the count. No Playwright adapter registers a count for `removal-regressions.spec.ts`.

**Runtime census.** `node scripts/account-crypto-prep/run.mjs --record` once, after review. Exactly the five changed product sources' hashes moved; no label, template, group or entrypoint changed (526 sources, 201 labels/templates, 36 groups, 15 manual entrypoints). `pnpm account:crypto-prep` then matched, 6 of 6 passed.

**Construction registry.** Not affected: `docs/account-crypto/constructions.json` and `registry.json` name none of the changed files.

**Decision and notes.** A 2026-11-27 entry in `docs/decisions.md` records the repair and the corrected dating. It amends nothing; it keeps phase 230's rule that only a new command starts a fresh Worker. In `docs/product-backlog.md`, under "Worker and page boundaries":
- SETUP-CLOSING-STUCK is rewritten as resolved, with the corrected dating and what remains;
- CEREMONY-STALE-AFTER-REMOVAL is added;
- CI-JOB-LIMIT notes the step's two new cases.

`docs/progress.md` and `docs/completed.md` are left to the coordinating session, as asked.

## Decided without asking

- The apostrophe in the new sentence is U+2019, matching the app's copy.
- A retirement-caused close skips the remembered-name write to setup metadata (layer 1, above). Without it, that write is the one step of the close that a committed removal's fence refuses, which would end on "Native cleanup could not finish…" instead.
- The cooperative cases wait idle at "Create your passkey", the reported steps. The held registration reply stays with the missed-notice cases, whose subject it is.
- The missed-notice cases suppress in the setup Worker only; the page-side patch is removed, because nothing in the setup page listens for the notice.
- A `setupClosed` with the cause is ignored while an account opening is handing off, on both sides. That path's behaviour is unchanged and was not tested.

## Limits

- Every run was on this Mac under Node 26.13.1 with Playwright 1.62.0's Chromium. CI pins Node 24.22.1; no hosted run was made.
- The reload outcomes, the page-hosted browser run, the enrollment and recovery probes and phase 225 are one run each.
- `42ebdd12d` is inferred from code, not run.
- The removal refusal in the reload table was injected (the removal's first write refused in its tab). A natural refusal (older-version writing, another saved workspace referencing the data) was not set up.
- The cooperative cases' saved-attempt check cannot trip on its own there, since the removal deletes the attempt; the missed-notice cases and M1 cover recreation.
- The scratch copy of phase 225 (1.1 GB with its dependencies, made with `git archive` before the coordinating session's "no more whole-tree copies") was deleted after use.

## Not run

- The full unit suite. The operator decided on 2026-11-27 that it runs once before merge, not per phase.
- Any hosted CI run.

## At review

The coordinating session read the product diff on 2026-11-27 and ran the following on the final tree, on this Mac under Node 26.13.1.

- **Its own control:** with the page's new branch disabled in `src/ui/windowCeremonyUi.ts` (the `cause === 'slot-retired'` test made never true), `test/windowCeremonyUi.test.ts` fails its retirement case and passes its other 5. The file was restored and `git diff` shows only this phase's change to it.
- **Unit files:** the four test files this phase changed or extended, `test/firstDeviceInspectionPresentation.test.ts`, and the neighbours `setupWorkerProtocol`, `ceremonyWorkerLifetime`, `firstDeviceSetupWorker`, `workerCeremonyPhase` and `workerCeremonyOpening`: 9 files, 48 cases passed.
- **Browser:** `test/packaged-account/removal-regressions.spec.ts`, 4 of 4 in 15.2 s. Another session's Playwright run (a lab reproduction in its own worktree) was active at the time.
- **Not repeated:** the whole packaged step, `pnpm test:account-setup`, mutations M1 to M3, the reload outcomes and the probes. Their results above are the delegated agent's.
- **Not run:** the full unit suite, by the operator's decision of 2026-11-27.
- **Read in the diff, not tested:** when the retired coordinator's own cleanup fails (`ok: false`) or the page's drain fails after a retirement, the page shows the existing failure display, whose "Your writing has been kept" is untrue after a committed removal. No case reaches it.
- **Corrected:** the decisions entry as drafted called the copy, the message field and the scope "the operator's decisions". They were the coordinating session's; the sentence awaits the operator's review. The entry now says so.
- **Run last,** after these record edits and required before the commit: build, the contract checks, the release inventory and plan, the release adapters and the trace check.

