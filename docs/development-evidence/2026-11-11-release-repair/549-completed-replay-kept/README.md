# Phase 549 — a reduced device's completed background replay is kept, not discarded

The operator chose "Finish uninterrupted" on 2026-11-12, from investigation 16 ([report](../investigations/16-slow-catch-up-and-stalled-save.md)) and the phase 548 preparation report: from the point a reduced device's oracle replay has completed until the semantic oracle is recorded done, queued work does not interrupt the pass. That choice is the approval for the amendment recorded below. No stored format, wire, limit or proof changes.

## What was wrong (reproduced)

On a device that has reduced its history, the warm audit runs a full semantic oracle every 256 rows or five minutes: it replays the whole local baseline and compares the result with the incremental view. The replay runs inside one storage-queue job, so everything else waits. Most of it is one long synchronous stretch, so work that arrives while it runs reaches the owner only at the first event-loop turn after the replay returns. The warm audit's guard then stopped the pass at its next guarded step because foreground work was queued (`queuePriority`). The replay was thrown away, the oracle stayed due, and the scheduler started it again as soon as the queue drained. During catch-up the receive lane almost always had work waiting by then, so the device replayed again and again.

On the phase 548 source (`d1a4a653e`), in the browser runs below:
- **Without network delay** (two runs), the returning device caught up in 24.1 s and 27.6 s. Each run discarded one oracle replay of about 3.7 s, 6–7 ms after it returned. The spiral investigation 16 measured (147 s at phase 546, under host load rising to 28) did not form.
- **With a 300 ms round trip** on the returning device's account requests (two runs), it had not caught up when either run ended at 180 s. All 20 and all 46 of their oracle replays, 3 to 6 s each, were discarded 2–42 ms after returning. The Worker was blocked 118 s and 106 s of the 180 s, and 199 and 110 of A's markers had not arrived.

This also corrects the throw position named in investigation 16 and the preparation report. They inferred the authority re-check right after the replay, from a probe that set the queued flag at the replay's return. The browser trace now shows the stop comes at the first guarded step after the first event-loop turn following the replay: 2–42 ms after it returned, in every discarded replay. In these runs it never came during the replay.

## The change

- **The owner marks the window** (`src/crdt/contentStore.ts`). `auditWarm` marks its oracle load (`oracleLoad`). When that load's full replay returns, the mark becomes `recordingOracle`, and it is cleared once the new reuse view (`createBaselineReuse`) has recorded the oracle, before the final step of the read. Every refusal or interruption also clears it (the read's `finally`). The oracle load's own mark is consumed by its first completed replay, so a second full read in the same load (a return to the app arriving meanwhile) gets no window, and it is cleared when the load ends, however it ends. The owner exposes `recordingOracle()`.
- **The guard ignores only queue priority inside it** (`src/crdt/contentMaintenance.ts`, `warmAuditInterruptible`). This is the warm audit's existing check moved out of `accountCapture.ts` so that tests run the same code. It takes the content owner as a required argument, and while the owner records an oracle it does not count queued foreground work. Suspension and new local input still interrupt. The owner closing still aborts through the signal `maintenanceTask` observes.
- **`src/crdt/accountCapture.ts`** builds the audit task with it, passing `owner.carrier`. The priority token, scheduler, per-owner FIFO and task stack (`maintenanceTask(budgetedTask(...))`) are unchanged.
- **The design note** `docs/account-local-retention-reuse.md` ("Reference oracle and interruption") now names the window.

**Inside the window, still unchanged:**
- both authority checks: the fresh baseline authority after the replay, and the reduced owner's pin (`Baseline authority changed during replay.`);
- the comparison with the retained view;
- validation and the new reuse view.

**What still interrupts or discards a replay:**
- queued work before the replay starts, or seen by the replay's own checks while it runs;
- new local input or suspension, anywhere, including the window;
- the owner closing;
- a refused authority check.

A return-to-app read and a maintenance reference read get no window, so they keep the phase 545 rules: an interrupted return-to-app read stays due, and an interrupted reference read does not move onto foreground work.

## Decision context: what this amends

| Decision | Text | Amended? |
|---|---|---|
| Phase 469 (2026-11-06) | "Arbitrate maintenance arrival instead of relaxing priority interruption … Preserve the original priority-token mutation and refusing guard" | Yes, for the window only: priority interruption is relaxed there. The FIFO, the priority token and its refusing guard, and every due and forced rule are unchanged. |
| Phase 416 (2026-11-04) | "retain all comparison/interruption/native guards" | Yes, for the window only: the queue-priority interruption is not applied there. Comparison and native guards are unchanged. |
| Phase 417 (2026-11-04) | "A hard cap forces an attempt only; interruption still wins. Reduced and unreduced oracle lifetimes remain separate." | Yes, for the window only and only for the reduced oracle. The unreduced oracle is untouched. |
| 2026-10-27 (phase 122) | a completed baseline proof is reused only by explicit opt-in; live warm reference audits stay separate | No. Nothing is retained across jobs; the pass simply finishes. |
| Phase 545 | an interrupted reference read does not move onto foreground work; a return to the app stays due until a full read completes | No; tested below. |
| 2026-10-12 | after a row or time trigger, complete audit slices even during activity | No change. |

## Tests

**New:** `test/oracleReplayWindow.test.ts`, 19 cases. The fixture is a reduced owner at the catch-up size of investigation 16: a 1,000,000-character baseline, then 20 own capsules and 120 peer receipts, so each full read opens 381 records (the returning device read 285 rows). The oracle runs under the Worker's own task stack, `maintenanceTask(budgetedTask(warmAuditInterruptible(...)))`, with the reduced validator `accountReceive.ts` uses. Two observation seams (`vi.mock`) only report the replay's start and return and the index pass's start; the code under test runs unchanged.
- The oracle at that size reads 381 records and completes.
- Queued work arriving as the replay returns, at the authority re-check, during validation, or during the continuation index pass: the oracle is recorded from that one replay. Queued work interrupts again at the very next step, as a priority-only interruption. The queued job then takes the warm path, and a later attempt replays nothing.
- **Continuous receive (the catch-up shape):** five attempts, each meeting queued work as its replay returns. One replay in all; the oracle is not due after any of them.
- **Controls that must behave as before:**
  - queued work before the replay starts interrupts before any replay;
  - queued work seen inside the replay interrupts it (no replay completes);
  - new local input seen inside the replay, or as it returns, interrupts and discards it.
- **The window is the oracle's only:**
  - a return-to-app read absorbed by the audit still yields to queued work after its replay, and the next load reads in full (phase 545);
  - a return to the app during the oracle's window gets no window for its own read;
  - an interrupted oracle leaves no mark behind;
  - a foreground full read never opens the window.
- **Inside the window:**
  - new local input, suspension and the owner closing each still interrupt, with queued work already waiting so that only the condition under test can be the cause;
  - a replaced authority still refuses with "Baseline authority changed during replay";
  - a handoff still fails the authority check;
  - the window is closed afterwards in every case.
- The guard itself, step by step: queued work interrupts outside the window and not inside it; input and suspension interrupt inside it.

**On the phase 548 source** ([base-tree-run.txt](./base-tree-run.txt)). The new interface was added with the base behaviour so the file loads: accountCapture's original check, an owner that never marks a window ([base-shim.py.txt](./base-shim.py.txt)).
- 10 of 19 fail; the 9 that pass are the controls.
- **The four arrivals:** the oracle is still due after the attempt. For the index-pass arrival, the window observation fails first; the base interrupts inside the index pass, after the view was replaced, so the next load would replay in full.
- **Continuous receive:** 5 replays instead of 1.
- **The three in-window stops and the replaced authority:** queued work interrupts first, as a priority-only interruption.
- **The guard case:** it never ignores queued work.

**Mutation controls** ([mutation-controls.txt](./mutation-controls.txt), each applied alone to a copy of the final tree, the new file run in full):

| Removed piece | Cases that fail |
|---|---|
| M1 the window never opens after the oracle replay | 9 of 19: the four arrivals, continuous receive, the three in-window stops and the replaced authority |
| M2 the window stays open past the recording | 4 of 19: the four arrivals (queued work no longer interrupts right after the recording) |
| M3 a refused or interrupted window is not closed | 6 of 19: the three in-window stops, the replaced authority, the handoff, and input seen as the replay returns (the window is left open) |
| M4 any completed full replay opens the window | 4 of 19: the return-to-app read, the return to the app during the oracle, the interrupted oracle’s mark, and the foreground full read |
| M5 an oracle load that ends early leaves its mark | 1 of 19: the interrupted oracle leaves no mark behind |
| M6 the mark is not consumed by the first completed replay | 1 of 19: the return to the app during the oracle gets no window of its own |
| M7 the audit guard ignores the window | 10 of 19: the guard case, the four arrivals, continuous receive, the three in-window stops and the replaced authority |
| M8 the oracle load is not marked | 9 of 19: as M1 |

M5 survived the first pass: its case observed only outcomes that were the same either way. The case now records the window at the re-check after the replay, and M5 fails it. Both passes are kept. The accountCapture wiring cannot be removed without a type error, because the owner is a required argument of the guard.

## The measured window

**Node** ([window-probe.txt](./window-probe.txt), [probe source](./window-probe.ts.txt); fake IndexedDB, the Worker's task stack, the reduced validator, three repetitions). Queued work arrives as the replay returns, the earliest moment the browser can observe it.

| Opened records (baseline) | Replay | Base: queued work waited | Base: replays in 5 attempts, oracle still due | Final: window | Final: queued work waited | Final: replays in 5 attempts, oracle due |
|---|---|---|---|---|---|---|
| 381 (1,000,000 characters; catch-up size) | 233 ms | 0.4 ms | 5, due | **26 ms** [25–31] | 27 ms | 1, not due |
| 1,551 (3,000,000 characters) | 1,005 ms | 1.3 ms | 5, due | **125 ms** [124–139] | 127 ms | 1, not due |
| 4,401 (3,000,000 characters) | 2,235 ms | 3.1 ms | 5, due | **342 ms** [331–848] | 346 ms | 1, not due |

Inside each replay the probe counted only two event-loop yields against 6,831 to 82,671 guarded checks. That is why work queued during a replay is first seen as it returns. At 8,000,000 characters reduction now refuses (`capacity`, the baseline would need 16 MB against the 8 MiB writer ceiling of phase 542), so the larger sizes use 3,000,000 characters. Host load 4.1 to 10.4 (one repetition of the 4,401 base group ran at 10.4).

**Browser** ([browser-runs.txt](./browser-runs.txt)). The lost-phone spec of investigation 16 (send-first, large, C reduced while offline), with the service started the production way. Both builds were made from copies with `VITE_ACCOUNT_RETENTION_AUTO=1 VITE_ACCOUNT_LEDGER_PROFILE=1` and the same copy-only seams ([instrument549.py.txt](./instrument549.py.txt) plus the investigation's), so the two builds differ only in the phase 549 sources. "Round trip" adds 300 ms to every account request C makes in the catch-up phase, identically in both spec copies; the lab otherwise has no round-trip time.

| Run | Build | Round trip | C reduced | Positions C sent itself | Catch-up (received through) | Oracle replays discarded / recorded | Worker blocked over 1 s | Window | Queued jobs behind it |
|---|---|---|---|---|---|---|---|---|---|
| b1 | base | none | yes | 1 | 24.1 s (619) | 1 / 0 | 8.8 s | – | – |
| b2 | base | none | yes | 1 | 27.6 s (610) | 1 / 0 | 7.7 s | – | – |
| f1 | final | none | yes | 1 | 24.2 s (618) | 0 / 1 | 4.3 s | 95 ms | 89 ms |
| b3 | base | 300 ms | yes | 9 | **not caught up at 180 s** (522; 199 markers missing) | 20 / 0 | 118.3 s | – | – |
| b4 | base | 300 ms | yes | 1 | **not caught up at 180 s** (557; 110 markers missing) | 46 / 0 | 106.3 s | – | – |
| f2 | final | 300 ms | yes | 1 | **65.5 s** (620) | 0 / 2 | 8.5 s | 69, 93 ms | 69, 92 ms |
| f3 | final | 300 ms | yes | 22 | **135.5 s** (663) | 0 / 2 | 16.3 s | 74, 88 ms | 71, 84 ms |
| u1 | base | 300 ms | no (reference) | 18 | 90.1 s (642) | no oracle | 0 s | – | – |

- **In every base run, every discarded replay stopped after it returned**: 2 to 42 ms later, 68 replays in all, none during a replay.
- **With the round trip, the base never finished.** Its oracle replays were discarded one after another: 20 and 46 of them, each about 3 to 6 s of Worker time. That is the spiral investigation 16 measured. With the fix both runs finished, and the Worker was blocked for 8.5 and 16.3 s instead of 106 to 118 s.
- **The two final round-trip runs differ by how much C wrote while catching up.** C's automatic card-membership repair sent 1 position in f2 and 22 in f3, and each send also pays the round trip. The unreduced reference sent 18 and took 90.1 s. The 45 s left between f3 and u1 is not oracle replay (16.3 s of blocking in all); it is probably per-position reduced cost, which this phase does not touch and did not measure.
- **Host load** was 5.2 to 10.8 across the runs, from other sessions on this Mac; each run's load is in the raw output.

**How long queued input can wait behind the window in the browser:** the window lasted 69 to 95 ms in the final runs (`recorded` events, five oracles). The foreground jobs that were queued during one waited 69 to 92 ms (f1: 89; f2: 69, 92; f3: 71, 84). Without the window such a job waited 2–42 ms, but the discarded replay was then run again and held the queue for another 3 to 6 s, as often as 46 times in one run. The same post-replay steps after foreground and forced full reads, which never had a window, took 14 to 55 ms in all runs. A job queued at the start of a replay's last synchronous stretch waits for the rest of the replay in both builds; the window adds at most its own length to that.

## Runs on the final tree (this seat)

- **New and neighbouring tests:** 36 files, 455 cases, all passed, in 42 s.
  - New: `oracleReplayWindow`.
  - Importers of `contentMaintenance`: `accountReceiveLedger`, `admissionQueue`, `baselineProjectionInterruption`, `contentInterruptedReuse`, `contentCompaction`, `contentMaintenance`, `inboundAuditUnits`, `localBaselineWarm`, `localRetentionProgress`, `maintenanceFence`, `maintenanceTurns`, `preparationJournalObservation`, `reductionSyncHold`, `retentionPriorityRetry`, `retentionReductionHold`, `retentionFenceCollision`, `retentionPreparationOwner`, `warmAuditScheduler`, `warmContent`, `windowLocalTrim`, `warmAuditPressure`, `workerLocalTrim`.
  - Importers of `contentStore`: `baselineReplayBuilds`, `inboundIndirectReaders`, `initialAccountGeneration`, `localBaselineExactReuse`, `localBaselineLargeCarrier`, `multiEntryInboundReaders`, `unreducedBaselineExactReuse` (and several above).
  - The reduced-baseline and warm-audit files: `localBaseline`, `localBaselineAnchor`, `localBaselineLifecycle`, `localBaselineReuse`, `workerLocalBaseline`, `warmAuditStart`.
  - Left out: `accountCapture.ts` has no unit-level importer. Its warm audit runs only in the native browser fixtures (`test/account-sync/warm-audit.native.mjs`, `test/unreduced-audit/`), which were not run; the browser runs above exercise the same build path.
- `pnpm typecheck`; `oxfmt --check` and `oxlint` on every changed source and test file.
- The nine adapter files from CI: 178 of 178.
- `pnpm validation:inventory`: 10 of 10, after the manifest and plan were recorded again.
- `pnpm account:crypto-prep`: 6 of 6.
- At review, on the final tree: the full unit suite (`pnpm test --maxWorkers=1`), 350 files, 3,660 passed and 1 existing skip; then `pnpm typecheck`, `pnpm build`, the ten contract checks, the inventory and plan checks, `pnpm account:crypto-prep`, the nine adapter files, the packaged-application routing tests and `pnpm trace:check`.

**Bookkeeping** per [development.md](../../../development.md#release-bookkeeping):
- The new file joins the reviewed Vitest selection. The case denominator moves from 3,001 to 3,020, the reviewed files from 114 to 115, the general stages from 299 to 300 and the reviewed Vitest stages from 133 to 134.
- The planning inventory moves to 1,123 obligations, with 555 unresolved as before.
- The runtime census records new hashes for the three changed sources. No changed line adds a domain label or a cryptographic call, and the construction registry names `createContentOwner` by name only, so it is unchanged.
- **Source-text anchors:** every string literal of 16 or more characters in `vite/`, `test/` and `scripts/` that occurs in the base versions of the three sources occurs the same number of times now (65 checked), and so does every base literal used there (27 checked). That includes the warm-audit fixture hooks on `accountCapture.ts`.

## Limits

- No device was used; the browser runs are headless Chromium on a shared Mac (host load is recorded with each run).
- The round-trip delay is an emulation of a slower network applied by the test, not a measured phone. Chromium's CPU throttling does not reach dedicated Workers, so a slower CPU was not emulated.
- The window's length grows with the opened records (26 ms at 381, 342 ms at 4,401 in Node); the preparation report's matrix found it follows the record count, not the baseline size. Automatic reduction starts at 1,024 records.
- The 147 s figure of investigation 16 was not reproduced at phase 548 without the delay. Each such run still discarded one replay of about 3.7 s.
- An interruption by new input or suspension inside the index pass, after the retained view was replaced, still leaves no warm view, so the next load (possibly a foreground one) replays in full. That is unchanged and outside this phase; queued work no longer causes it.
- No deployment.

[Identities and results](./evidence.json).
