# Phase 550 — verify a snapshot cut inside reduced history, and fold the installation at once

The operator chose "Verify the cut" and then "Fold at once" on 2026-11-12, after the reduced-peer investigation and the older-build compatibility runs below. Those choices are the approval for the two amendments recorded here. No stored format, wire message, service route or limit changes.

## What was wrong (reproduced)

A device that has reduced its history keeps no link for positions below its retained frontiers. When a history snapshot arrived whose cut for some stream fell inside that range, the install refused as `history-required` (the 2026-10-13 rule) and was skipped as a whole. That is harmless while the device can still read the history it lacks. Once that history is pruned, the device cannot catch up: its reads come back `unavailable`, and nothing lets it through until a newer snapshot happens to have cuts at or past its frontiers.

Three devices on the tip `7e6aff636` ([verify-browser-runs.txt](./verify-browser-runs.txt), R1): device C reduced while it was behind on A and ahead of the snapshot's producer on B; snapshot 3 was admitted and A's history pruned. C fetched the catalog and the snapshot and skipped it. A's reads came back 409 `unavailable`, the notice said "network-unavailable" and was gone after reopening, and A's writing reached C only after a fourth snapshot.

## The change

**Verify, only when the snapshot is needed** (`src/crdt/retiredCutVerification.ts` new; `retentionCheckpoint.ts`, `inboundLedger.ts`, `retainedHistory.ts`, `contentStore.ts`, `accountReceive.ts`).
- *Needed* means the snapshot moves at least one receive cursor forward, this device's own stream included (`historyAdvances`). Both sides are authenticated: the cuts are signed, admitted and verified at install, and the cursors come from the verified ledger. A snapshot that is not needed is skipped quietly, as before. A cursor never moves back and a snapshot's cuts never change, so a skipped snapshot can never become needed later.
- The retained-baseline gate names every cut below a retained frontier that it cannot pin, together with the exact frontier link it holds (`RetiredHistoryRequired.needs`).
- **The read.** Outside the storage queue, the device reads that publisher's accepted entries from the cut to the frontier with read-v2. It verifies them with the existing `verifyHistoryPage`, starting from the snapshot's cut link and requiring the chain to end at the frontier link this device kept. Neither link comes from the reply. The read is bounded like a snapshot replay: 4,096 positions and 64 MiB of pages.
- **Outcomes.**
  - The chain matches: the install proceeds with the gate's map of authenticated cuts.
  - Any served entry fails verification: the install is refused as integrity, which halts receive as any integrity failure does.
  - The service answers `unavailable`, `out-of-order` or `ledger-integrity`, or the read would exceed a bound: the snapshot is skipped until a newer one, and receive names `history-unverified`.
  - Timeouts and expired requests: retried like any other network failure.
- **Replay of a committed installation.** Cold open, state reload and the next reduction replay the committed installation and accept a retired cut the installation already checked (`'committed'`). This relies on the evidence table's "authenticated checkpoint installation … cuts already checked at installation". A conflict with a link the device still holds is still refused.

**Fold at once** (`automaticLocalRetention.ts`, `ledgerHints.ts`, `accountReceive.ts`).
- Replaying such an installation sets `InboundState.foldDue`. The flag is derived, never stored, so it is seen again on every open of this build. It reaches the scheduler as `fold` in the retention hint.
- A due fold skips the 1,024-record growth threshold and the 30-minute cooldown, and nothing else. These still apply: the 10 s quiet window, readiness and sync quiet, holds, parking, the retry clocks, and the removal path with phase 546's fences (a busy handoff slot is an interruption to retry; the hold is bounded by progress).
- A fold reported again after it completed is spaced by the 60 s retry clock and capped at three in a row; after that only the cooldown applies (`LOCAL_RETENTION_FOLD_STREAK`). A correct fold carries the installation into the baseline, and the report clears.

**Hold the commit until a fold can follow.** An installation that would set `foldDue` is committed only when a reduction can follow at once. Otherwise the checked snapshot stays uncommitted, so older builds can still open the store, and receive names `history-waiting`. Each catalog check re-tests the condition cheaply, without downloading the snapshot again. The commit is held when:
- automatic retention is off or halted;
- the last reduction attempt hit capacity;
- the page is hidden;
- this device has a saved account step (read from storage, as reduction reads it);
- this device has unsent writing: an allocated position not yet accepted, or captured writing not yet allocated.

**Named states** (`accountSyncDriver.ts`, `accountSessionBridge.ts`, `SyncNotice.tsx`). A standing condition is read after each receive step. Progress from other devices does not clear it, and it outranks retry reasons, which the R3a run showed are otherwise caused by the very reads it explains. The Retry button is not offered for it.
- `history-unverified`: "Changes from your other devices may stop arriving here, because a history snapshot saved on the service could not be checked against the history this device kept. This clears when your other devices save and check a newer snapshot. Your writing on this device is kept."
- `history-waiting`: "Changes from your other devices may stop arriving here until this device can finish history maintenance, for example once its unsent writing is sent or an unfinished account step on it is completed. A history snapshot saved on the service is checked and installs then. Your writing on this device is kept."

## Decision context: what this amends

| Decision | Text | Amended? |
|---|---|---|
| 2026-10-13, local retirement evidence, rule 4 | "Below the retired frontier with no exact evidence, return `history-required`." | Yes: a read of the accepted chain from the snapshot's cut to the retained frontier, verified link by link and ending at the frontier link this device kept, counts as exact evidence. It is used only when the snapshot moves a receive cursor forward. Replay relies on the committed installation, per the evidence table. |
| 2026-10-13, the same contract | "This availability limit must be surfaced when the reduced reader is integrated; no new UI wording is selected here." | Fulfilled: the two sentences above. |
| 2026-10-26, phases 73 and 75 | "The 1,024-record/10-second/30-minute policy" | Yes, for a due fold only: no growth threshold and no cooldown. The 10 s quiet window and every other check stay. |
| 2026-10-13 rule 4, otherwise | a signature, a sequence number, `observedThrough` or snapshot inclusion proves nothing; never learn an expected link from a reply; do not refetch the same incompatible checkpoint as a retry | No. A held snapshot is fetched again only once its block clears; an unverifiable one only when a newer snapshot appears, the authority changes, a reduction commits, or the app reopens. |
| Phase 546 | a saved account step blocks reduction and its hold | No; a verified installation is held behind it as well. |
| Phase 549 | the oracle recording window | No; the fold's work waits behind it like any queued work (tested). |
| 2026-10-15 | optional receiver discovery stays separate from required history | No. |
| Phases 544 and 547 | install and replay bounds | No. The verification read uses the replay bounds. |

## Measured

**Older builds.** [older-build-runs.txt](./older-build-runs.txt): the same browser profile and service, with the app server swapping builds and each load's script list checked.
- **Unfolded verified installation, opened by tip `7e6aff636` and by released `759890ca0`:** the unlock screen shows "Worker operation could not finish." and the workspace does not open, so the device cannot read, write, send or receive. A digest of every IndexedDB record was unchanged by the attempt. Returning to the new build restored everything, and all three devices converged in text and exact Yjs state.
- **After a fold:** both older builds open, write, send, receive and reduce.
- On 422ff6c36 the content owner itself refuses such a store with `LocalBaselineError: history-required` at load ([base-tree-run.txt](./base-tree-run.txt), `historyFoldOracle`).

**The window**, from commit to the baseline revision moving ([fold-browser-runs.txt](./fold-browser-runs.txt); production quiet window, retry clock and cooldown):
- 10.18 to 10.32 s in five runs: the 10 s quiet window plus a fold of about 0.3 s on this fixture.
- After a reopen of the new build, the fold followed 11.7 to 11.9 s after opening (unlocking included).
- What bounds it: the quiet window (10 s after the last input or workspace change, received writing included), idle sync lanes, and the reduction's own time. An interrupted attempt retries after 10 s or 60 s.

**Each case** (copy-only probes on a `7e6aff636` copy carrying this patch; the rebase changed no line they exercise):

| Case | Store meanwhile | Older build meanwhile | Resumes | Person sees |
|---|---|---|---|---|
| Nothing blocks | committed, folded 10.2 s later | locked out for those seconds | — | nothing |
| An older build opened inside the window (`window`) | committed, unfolded | **locked out** | the next open of the new build folds after 11.9 s | nothing until then |
| Closed mid-fold, at "Finishing saved writing…" (`midfold`) | committed, unfolded (revision unchanged) | **locked out** | the next open of the new build folds after 11.7 s | nothing until then |
| Unsent writing (`submission`) | held, not committed | opens | installed 7.9 s after the writing was accepted, folded 10.2 s later | the send notice, and the waiting notice after 30 s |
| Saved account step (`step`, an unfinished device approval) | held | opens | not exercised (below) | waiting notice |
| Hidden page (`hidden`) | held | — | installed 5.9 s after the page became visible, folded 10.3 s later | waiting notice |
| Capacity first met by the fold (`capacity`, seam) | committed; fold parked as capacity | **locked out** | retries on new history after the retry clock, and on reopen; persists while the ceiling does | the capacity sentence in History on this device; no notice |
| Writing entered after the commit while sending fails (`submission`, round 1, before the hold existed) | committed; fold waits for acceptance | **locked out** | folded 10.3 s after the writing was accepted | the send notice |

**Residual cases where an older build is still locked out:** capacity first met by the fold; a device closed during the ten-second window or mid-fold; writing entered after the commit while sending fails. A later needed installation is held once capacity has been seen.

**`VITE_ACCOUNT_RETENTION_AUTO=0`** (the Dockerfile default): no automatic retention exists, so a needed verified installation is never committed. The device stays where the tip leaves it, now naming `history-waiting`; that sentence's examples do not fit this build. Not run in a browser; read from the code (`foldReadiness` is never set, so `foldBlocked` returns `unavailable`).

**Verification read.**
- The three-device reproduction recovers 1.0 s after coming online, with one read of B (after 2, limit 2). Cold reopen is clean and all three devices converge (R2).
- Unverifiable (R3): the named notice shows, stays while B's writing arrives, and clears when a newer snapshot installs. The first unverifiable run, R3a, found the notice hidden behind a network retry reason; that precedence is fixed and has its own mutation control (M9).
- **Cost** ([verify-cost-probe.txt](./verify-cost-probe.txt), Node):

  | Positions | CPU | Requests | Page bytes |
  |---|---|---|---|
  | 4,096 | 2.8 s | 512 | 6.07 MB |
  | 512 | 0.36 s | 64 | 0.76 MB |

  The worst case is bounded at 4,096 positions and 64 MiB plus one page. The read takes no time in the storage queue; one extra snapshot verification and baseline read do.

## Tests

**New and changed unit tests** (all on the real protocol fixture of `test/local-baseline/fixtures.mjs`, which now also returns the own envelope it builds):

`test/retiredCutVerification.test.ts`, 7 cases:
- Verify, then install. Control: without the read the install refuses (the strand). Evidence for a moved frontier is not accepted.
- Full replay, the live verified install, a cold reopen and the next reduction reach the same state.
- An inconsistent peer or own cut is refused as integrity. Control: applied without evidence, as a skip would, it is accepted.
- Tampered entries in the read, each refused as integrity: altered envelope `record`, altered proof `unverified`, reordered `scope`, stream ending early `prefix`, a dropped entry whose position is still claimed `record`, entries from another publisher `scope`, a page signed by another key `unverified`. Control: short honest pages verify.
- Unverifiable: no answer from the service, and over the bound (no read made).
- Only a committed installation older builds cannot replay asks for a fold, and a fold clears it. A full replay, the store before installation, and an installation at exact cuts ask for nothing; a retired peer cut alone or an own cut alone asks.
- A snapshot is needed only when it moves a receive cursor forward.

`test/historyFoldOracle.test.ts`, 3 cases, on the real content owner (phase 549's harness): a reduced device whose suffix holds the unfolded installation.
- The oracle replays it, and the fold carries it.
- The fold's work queued as the oracle's replay returns waits for the recording (phase 549's window), then folds.
- A fold that reaches the queue first satisfies the oracle.

Also: `test/automaticLocalRetention.test.ts` (+2: a fold skips growth and cooldown and keeps quiet, readiness and the retry clock; a fold that survives is spaced and capped), `test/accountSyncDriver.test.ts` (+1: the standing condition persists through progress and retries, then clears), `test/syncNotice.test.tsx` (+1: both sentences, no Retry).

**On 422ff6c36** ([base-tree-run.txt](./base-tree-run.txt), with [base-shim.py.txt](./base-shim.py.txt) adding the new interface with the base behaviour): all 14 new cases fail, and the 45 existing cases in the changed files pass. In `historyFoldOracle` the base content owner refuses to load the store at all (`history-required`).

**Mutation controls** ([mutation-controls.txt](./mutation-controls.txt), each applied alone to a copy of the rebased tree): all 15 make a test fail. The pieces removed:

| | Piece removed |
|---|---|
| M1 | replay of a committed installation |
| M2 | the gate using verified evidence |
| M3 | the end-link comparison |
| M4 | the rejected skip draft, as a mutation |
| M5 | integrity normalisation |
| M6 | the driver reading the standing condition |
| M7 | the unverified sentence |
| M8 | the replay bound |
| M9 | standing over retry precedence |
| M10 | the fold flag |
| M11 | the scheduler honouring a fold |
| M12 | the streak cap |
| M13 | the retry clock for folds |
| M14 | the need test |
| M15 | the waiting sentence |

In the scratch copy, M10 first survived because the own-stream branch set the flag twice. The second line was removed and the case strengthened, and both kinds of cut are now tested alone.

**Browser** (copy-only probes, not in CI):
- The verified cut: R1 to R3 above.
- Folding: `fold-probe.spec.ts.txt` in modes compat, window, midfold, submission, hidden, step and capacity, with seams in [fold-probe-seams.diff.txt](./fold-probe-seams.diff.txt). That diff is against the copy that also carried the test hooks below.
- **Kept spec:** [kept-spec.patch.txt](./kept-spec.patch.txt), with its runs in [kept-spec-runs.txt](./kept-spec-runs.txt). It passed (window 10.28 s; tip and released open, send and receive; the three exports equal). Its control, a build that never reports the fold, fails at the window assertion. **Not applied:** it needs two hooks compiled into production code behind `VITE_ACCOUNT_TEST_HOOKS`, which is an undecided practice (HIST-TEST-HOOKS).

## Not verified

- **Releasing a held installation after a saved account step completes.** The hold itself was exercised (the `step` probe: held, and the tip opened the held store). Ending the step was not: the approving device offers no "Cancel connection" while its invitation waits, and the probe stopped there.
  - A unit test over the real owner was tried and could not be built. The receive owner (`openAccountReceiveOwner`) runs only in the packaged browser harness, and none of its Node or Vitest harnesses (`test/account-receive`, `test/accountWorkerReceive.test.ts`) host history snapshots, reduction and saved account steps together.
  - The release path is the same one the hidden-page and unsent-writing probes exercised: the held key is re-tested on each catalog check, and the installation follows when the block clears.
- A real capacity ceiling; the probe forced capacity with a seam, which also resets on reopen.
- `VITE_ACCOUNT_RETENTION_AUTO=0` in a browser.
- Any device; the probes are headless Chromium on a shared Mac.
- The account-liveness instrumentation test (`test/account-liveness/instrument.test.mjs`) fails on this tree and identically on 422ff6c36: one of its anchors is gone from `accountReceive.ts` there too, and its AST walker refuses a function form. It is not in CI and not caused by this phase.

## Runs on the final tree (this seat)

Listed in [evidence.json](./evidence.json) with counts. In brief:
- the relevant unit files;
- typecheck;
- `oxfmt` per file through stdin, because the worktree's location makes the CLI's ignore rules exclude every file;
- `oxlint`: 17 files, 0 diagnostics;
- the nine CI adapter files;
- `validation:inventory` and the plan check;
- `account:crypto-prep`;
- `node --test test/account-history/*.test.mjs`.

At review, on the final tree: the full unit suite (`pnpm test --maxWorkers=1`), 352 files, 3,674 passed and 1 existing skip, in 371 s; then `pnpm typecheck`, `pnpm build`, the ten contract checks, the inventory and plan checks, `pnpm account:crypto-prep`, the nine adapter files, the packaged-application routing tests, `pnpm trace:check`, `node --test test/account-history/*.test.mjs` and the CI session and history step. Not exercised and noted at review: a key rotation inside the range the verification read covers; the device keeps earlier generation keys, which is read from the code.

**Bookkeeping** per [development.md](../../../development.md#release-bookkeeping):
- The two new files join the reviewed Vitest selection. The case denominator moves from 3,020 to 3,031, the reviewed files from 115 to 117, the general stages from 300 to 302 and the reviewed Vitest stages from 134 to 136.
- The sync campaign wrapper moves from 85 to 86 cases (the new driver case).
- The planning inventory moves to 1,125 obligations, with 555 unresolved as before.
- The runtime census records the new source and new hashes. The new verification read signs with the existing reader key and frames with existing read-v2 labels; there is no new domain label.
- The construction registry's `done/account-ledger-reference-mismatch` site moves from line 943 to 966 of `accountReceive.ts`.
- **Source-text anchors** ([anchor-check.txt](./anchor-check.txt)): 225 fixture strings and 98 literals were checked. Four counts changed in `accountReceive.ts`: `'history-required'`, `} catch (cause) {`, ` as const, reason: ` and `history-required`. These are ordinary code and reason strings that tests use for their own purposes; no test or script anchors on them. The liveness instrumentation anchors are unchanged.

[Identities and results](./evidence.json).
