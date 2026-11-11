# Phase 546 — the sync hold ends when reduction cannot use it; a busy handoff slot no longer halts reduction

Both parts were asked for by the coordinating session on 2026-11-11 after two read-only investigations. Slice sizing and the cached opened rows (changes A and D of the reduction-slicing investigation) are not part of this phase; they wait for a measurement.

## Part 1: holding sync without progress

**What was wrong (measured).** Phase 539 lets a device on the full ledger check hold routine sync while a reduction attempt is due: at most five minutes once sync is quiet, then a sixty-second yield. Only `capacity` and `history-required` spent the hold, and only those two, `ineligible` and a completed removal released it. Every other refusal kept it and retried behind the sixty-second clock. A saved account attempt (a history snapshot, a device approval or a rotation still in progress; `retentionAttemptsSettled` in `src/crdt/retentionAttempts.ts`) makes every attempt return `durable-attempt` at once, before any preparation. Such a device held send and receive for five minutes, yielded one minute and held again, for as long as the saved attempt existed, which can be days. On the base source the new test reproduces the sibling investigation's figure exactly: 18,000,000 ms held in six simulated hours, 83.33%, with 360 attempts. `pending-promotion`, `activity-or-journal`, `already-preparing` and a skip reason the build does not know gave the same figure on unchanged history ([base-tree runs](./base-tree-runs.txt)).

**The rule.** Holding sync is for progress, meaning a saved preparation slice or a completed removal. The scheduler (`src/crdt/automaticLocalRetention.ts`) now records the history (the owner's `revision:records` hint) that each held window was engaged on.

- A held window that ends without progress, by its budget or by an outcome, marks that history. The hold does not engage again on it.
- A `durable-attempt` outcome also blocks the hold on every history until an attempt returns anything else. No amount of quiet sync can finish another device's verification, an approval or a rotation; running sync may.
- Only `activity-or-journal` and `pending-promotion` keep a window open, because quiet lanes can help them: sync's own jobs stop interrupting the attempt, and a pending receive promotion settles while receive is held. Every other refusal ends the window at once.
- `capacity` and `history-required` still spend the hold until Check again or reopening, including when the budget lapsed first (phases 539 and 541). `ineligible` still only releases and parks until new history; it is never spent.
- `durable-attempt` now parks until the history changes, like the other refusals that retrying cannot help, so a device rechecks once per change of history instead of once a minute.

| Outcome from `removeLocalHistory` | Comes from | Can quiet sync help the next attempt? | Hold after this phase | Next attempt |
|---|---|---|---|---|
| `removed`, `already-removed` | commit, or already reduced | progress | released; every bound but a spent hold cleared | after the 30-minute cooldown |
| `preparation-saved` | a saved slice | progress | kept; bounds cleared | at once |
| `skipped`, `activity-or-journal` | an interruption: input, journal, queued storage, authority change; since this phase also a busy handoff slot | yes, it stops sync's own interruptions | kept for the window; a budget that ends without progress marks the history | 10 s if only queue priority interrupted, else 60 s |
| `skipped`, `pending-promotion` | a receive promotion still pending | yes, receive is held while it settles | kept for the window; same bound | 60 s |
| `skipped`, `durable-attempt` | a saved history, approval or rotation attempt | no | window ends; blocked on every history until another outcome; parked | on new history, Check again or reopening |
| `skipped`, `ineligible` | the cut cannot be summarized yet | perhaps, once history changes | window ends, history marked; parked; new history may hold again (unchanged) | on new history |
| `skipped`, `capacity` (also a thrown `PreparationCapacity`) | a size limit, or an uncached pass cut short | no | window ends; spent until Check again or reopening (unchanged) | on new history |
| `skipped`, `history-required` | missing history | no | as `capacity` (unchanged) | on new history |
| `skipped`, `already-preparing` | a manual removal already running | no | window ends; history marked | 60 s |
| `skipped`, any other reason | none today | unknown, treated as no | window ends; history marked | 60 s |
| any other kind, or a thrown error | — | — | halt, which releases (unchanged) | after reopening |

**What resets the bounds, and why each is safe.**

- *Progress* clears the history mark and the saved-attempt block: it is direct evidence that the hold is useful.
- *New history* (new writing, or sync changing this device's records, which changes the hint) clears the history mark. The cycle the operator saw needed no change at all. A changed history can let the next window succeed: an ineligible cut settles, or a promotion finishes. Each new window still needs a due attempt (ten seconds without input, the retry clock, and the yield after a budget) and is still bounded at five minutes. New history does not lift a saved-attempt block or a spent hold.
- *Check again* clears both bounds and a spent hold. The person asks for one check per tap, and it still waits for the retry delay, as the panel says.
- *Reopening* starts a new scheduler, so it is bounded by how often the person reopens.
- *A changed saved attempt* is not visible to the scheduler: there is no event for it. It surfaces through the next check on new history or after Check again. That check returns something other than `durable-attempt`, which lifts the block. When the block lifts falsely (an interruption before the saved-attempt check), the cost is at most one held check, on new history.

**Residual.** Where history keeps changing and every window is cut short, windows can still repeat once per change of history, as phase 539 allowed. The two cases are sustained writing on a device on the full check, and an ineligible cut that never settles on a busy account. A stricter rule is available: at most one window without progress between progress events, whatever the history. It would leave a device whose window was spent while the person wrote without the hold until an unheld slice saves. It is not done here.

**Telling the person.** `durable-attempt` now raises the Data menu's "Maintenance paused" notice, shows this sentence and offers Check again (`src/ui/LocalHistoryMaintenance.tsx`). The owner knows only that some saved attempt is unsettled, not which channel, so the sentence names the kinds as examples:

> An unfinished account step saved on this device, such as a service history snapshot, a device approval or a device removal, has to finish before history here can be reduced. Your existing history is still in place. It will check again after new writing or sync changes this device’s history, or when you choose Check again.

The three kinds are the three channels `retentionAttemptsSettled` reads: `history` (service history maintenance, `parseHistoryMaintenanceProgress`), `approval` (membership approval progress) and `rotation` (the selected rotation, which device removal archives).

**What phases 539 to 541 keep.**
- A device on the full check that can reduce still gets held windows, and gets them again after each budget's yield while each window makes progress. The new test runs 30 slices of 20 s through two budgets and completes held.
- A capacity refusal still spends the hold, after the budget lapsed too.
- `ineligible` still releases without spending, parks until new history, and may hold again on new history; the existing case asserting that passes unchanged.

Four existing assertions change:
1. `test/retentionReductionHold.test.ts`, "the budget starts when sync is parked under the hold, bounds even a running attempt, then yields". It expected the hold to engage again on the same history after the yield. That window held sync for five minutes through a pending promotion and an interruption without progress, so engaging again on the same history is the cycle this phase removes. It now stays released, and a new hint engages it.
2. `test/retentionReductionHold.test.ts`, "a hold that parked sync but cannot start its attempt yields after the same budget". Same reason. The person kept writing, so the next window waits for new history.
3. `test/automaticLocalRetention.test.ts`, "paces a transient refusal only after another event, even if the hint is unchanged". It used `durable-attempt` as its transient refusal. That reason now parks, so the case uses `pending-promotion`, and a new case pins the park.
4. `test/localHistoryMaintenance.test.tsx`, "keeps ordinary deferrals quiet and preserves native collapsed Data". `durable-attempt` leaves the quiet list; it now shows the sentence, the notice and Check again.

## Part 2: a busy handoff slot at reduction's fenced entries

**What was wrong.** The Worker workspace queues (`src/crdt/workerWorkspaceQueues.ts`) hold one handoff slot, shared by prepared receives and fenced operations. `begin` throws when it is taken, deliberately; `test/workerWorkspaceQueues.test.ts` pins this at 271 to 291. Reduction enters that slot twice: the progress save through the context queue (`accountReceive.ts`, `contextQueue.run(persist)`) and the commit (`enqueue`). The refusal was a plain `Error`, so `removeLocalHistory` rethrew it and the scheduler halted with `owner-error` until the workspace was reopened. On the base source, a probe that composes the real Worker queues, context queue and scheduler, with both entries called as the base composition calls them, halts at both sites ([probe](./base-collision.probe.ts.txt), output in [base-tree runs](./base-tree-runs.txt)).

**The change.**
- `WorkspaceQueueBusy` is a distinct error class with the same message. `begin` throws it only from its busy branch, after its input checks, so malformed input still gets the plain refusal.
- `enterRetentionFence` (`src/crdt/retentionFence.ts`, new) wraps reduction's two entries. It turns only that synchronous busy refusal into `MaintenanceInterrupted` with condition `other`. `removeLocalHistory`'s existing catch then skips the attempt as `activity-or-journal`, with the conservative sixty-second retry.
- Nothing has run when the refusal happens. Every refusal after a flight begins, and any other error, reaches the caller unchanged and still fails closed through `config.failed()`.
- The other fenced callers (receive, history install, authority adoption, manual baseline commands) are unchanged.

**The optional refinement is not included.** Waiting for the slot before the save is safe in substance, because the save re-checks the capture, the prefix and the delta at the head. But it needs a settle signal plumbed from the Worker queues through the workspace composition and the context queue, which is not small. A save refused this way loses one slice and retries.

## Tests and runs

**New tests.**
- `test/reductionHoldDutyCycle.test.ts` (13 cases): the real scheduler with fake clocks over six simulated hours, with the held time integrated exactly from the published hold.
  - Every no-progress outcome on unchanged history, plus `durable-attempt` while history changes every ten minutes, must hold for at most one budget.
  - Capacity and missing history while history changes.
  - Positive cases: a device that can reduce keeps its windows across budgets and completes; a settled saved attempt makes unheld progress and the hold returns; Check again holds once more.
- `test/retentionFenceCollision.test.ts` (4 cases): the real Worker queues, context queue and scheduler.
  - The typed refusal and the unchanged plain refusals.
  - An outstanding prepared receive at save time and at commit time: the attempt is skipped, not halted; nothing ran; the owner did not fail; it retries after a minute.
  - The mapped interruption is not priority-only, and a refusal after a flight begins is not mapped.
- Added to existing files: the park case in `test/automaticLocalRetention.test.ts` and the sentence in `test/localHistoryMaintenance.test.tsx`.

**On the base source** (`src/` restored to `ee211a6a6`, tests in place), 11 cases fail:
- six duty-cycle cases at 83.33%;
- the settled-attempt case;
- the park case;
- the sentence;
- the two restated assertions.

The collision file cannot load because `retentionFence` is absent there; the base-composition probe above shows the halt instead. Six cases in the duty-cycle file pass on base as controls:
- `ineligible`, `capacity` and `history-required` on unchanged history, which were already bounded;
- capacity and missing history while history changes;
- the device that can reduce;
- Check again.

**Mutation controls on the final tree** ([output](./mutation-controls.txt)). Each removes one piece:
- a fence that maps nothing fails 3 collision cases;
- a window that marks nothing fails 2 duty cycles and the 2 restated assertions;
- no saved-attempt block fails 2 cases;
- `durable-attempt` unparked fails 3 cases;
- an untyped busy refusal fails all 4 collision cases.

**Final tree.** The related files (20 retention, hold, scheduling, queue and maintenance files, 177 cases) pass. Typecheck passes, and `oxfmt --check` and `oxlint --react-plugin` pass on the changed files. The full unit suite passes with the CI command, `pnpm test --maxWorkers=1`: 346 files, 3,343 cases, one existing skip, 497.44 s, with the host load average near 11 to 12 and a Playwright run not started by this seat in progress. None of the four files known to time out under load failed. The ten CI contract checks, the inventory check and the nine adapter files (178 cases) pass. `pnpm build` and `pnpm trace:check` were not run.

**Bookkeeping** follows [development.md](../../../development.md#release-bookkeeping).
- Both new files join the reviewed Vitest selection. The case denominator moves from 2,687 to 2,704, reviewed files from 109 to 111, general stages from 294 to 296 and reviewed Vitest stages from 128 to 130. The planning inventory moves to 1,116 obligations with 552 unresolved.
- The runtime census gains `src/crdt/retentionFence.ts` and new hashes for the four changed sources. No changed line adds a domain label or a cryptographic call.
- One registered site moves one line: `done/account-ledger-reference-mismatch` in `accountReceive.ts`, 942 to 943. The construction registry follows it.
- Every string literal of 16 or more characters in `vite/`, `test/` and `scripts/` that occurs in the base versions of the four edited sources occurs the same number of times now (125 checked). Three exceptions are reason strings and this phase's message, none used as an anchor: `history-required` and `activity-or-journal` in the scheduler, and the handoff message in the queues.
- `remove: result.removeLocalHistory,` and `LOCAL_RETENTION_MIN_RECORDS = 1024;` are untouched.

## Limits

- No browser suite, native suite or device. The hold tests use the real scheduler with mocked owner outcomes and fake clocks.
- The collision tests use the real Worker queues and context queue with a stub Window channel. Reduction's own catch in `accountReceive.ts` is exercised only through the same `MaintenanceInterrupted` path it already had, not by composing the full Worker owner.
- Whether the affected phone's saved attempt exists, and which kind, is not known; a saved attempt is the sibling investigation's reading.
- No commit or deployment.

[Identities and results](./evidence.json).
