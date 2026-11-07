# Phase 525 — Undo admission diagnostic: eventual success and an immediate-read race

**Date:** 2026-11-07. **Conclusion (a), within this bounded diagnostic:** Undo applied in all three busy tries and all three idle controls. The frozen immediate read can race admitted Undo. No press had zero Undo depth, no press remained unchanged for10 seconds, and every Redo restored the exact pre-Undo Goals text. This is outside Stage 5, earns no gate credit and does not clear the earlier failed cell.

Six standalone tries ran on unchanged plain 510 assets, using the same fictional H2 fixture and522 Goals prelude. Order declared before execution: A1, B1, B2, A2, A3, B3. No traffic was injected, delayed or withheld; no queue was held or private command sent. The frozen Goals spec, assertions, waits, app code, gates, limits, wire format and release flags are unchanged. There is no profiler or new Goals gate rerun.

## Operator correction, preserving524

The operator corrected the literal trigger in524: the Account Window mirror has no `compactContent`, so Window admission never runs maintenance. `appendLocal` is synchronous. A remote owned-receive job can hold the Window queue head during its commit; the pending count includes that head. `admissionQueue.ts` keeps `queue[0]` until the owned operation settles, and its journal-fence path uses a remote job through the same FIFO. Worker local-history maintenance is a separate published status.

The 524 precondition attempt remains immutable: it never pressed Undo and cannot be classified as(a), (b) or(c). This continuation uses the explicitly approved `pendingItems > 0` trigger. It does not rewrite the failed precondition as an app failure or silently substitute Worker maintenance.

## Trigger and observation protocol

A dispatches Mod-z from the first positive public Window admission-status sample after post-resume sync traffic begins, inside the fixture’s existing20 second post-return observation window. The public `onStatus` subscriber records the sample and immediately notifies the standalone driver to send the normal keyboard shortcut. The actual keydown gets a second passive status/depth capture, so any queue-freeing race between sample and key is visible. All three A tries hit the first eligible sample and still had positive pending counts at actual keydown. No busy condition was forced and no try was unexposed.

B retains the original20 second post-return settling wait, then uses the idle public-status control. All three B keydowns had zero pending items. A’s state-driven intervention occurs within that original observation horizon, per the operator amendment; no frozen spec wait was edited or extended to manufacture a condition.

Each press records `snapshot.undo`, the public `workspace.read().undo`, the snapshot-derived Undo availability, focus/visibility, status fields, and the Worker local-history status already exposed by the app’s public roster view. Reading that getter needs no Worker hook or whole-history clone. The keyboard dispatch and immediate text read use the same ordering as the frozen assertion. Goals text is then sampled with a10 ms timer for up to10 seconds. Public status transitions remain subscribed. Redo uses the same keyboard path and must return the exact pre-Undo text.

## First-sample status

| Try | State | Pending items / bytes | Durable | Pressure | Published Worker local-history phase / last stage | Snapshot / public Undo depth |
|---|---|---:|---|---|---|---:|
| A1 | active | 1 / 1 | false | null | idle / complete | 781 / 781 |
| A2 | active | 1 / 1 | false | null | idle / complete | 781 / 781 |
| A3 | active | 1 / 1 | false | null | idle / verifying (preparation-saved) | 781 / 781 |
| B1 | active | 0 / 0 | true | null | idle / coverage (activity-or-journal) | 781 / 781 |
| B2 | active | 0 / 0 | true | null | idle / coverage (activity-or-journal) | 781 / 781 |
| B3 | active | 0 / 0 | true | null | running / verifying (activity-or-journal) | 781 / 781 |

Worker `idle` with a retained progress stage describes its published last progress, not current execution of that stage. Window admission `maintenance` was absent in every sample. Full progress counts, attempts, sample/keydown timestamps and statuses remain in the raw records. These scheduling presentations grant no trust or admission permission.

## Eventual Undo and the frozen immediate read

Times below start at the actual Mod-z keydown in the page’s clock. “First changed sample” is an observation upper bound; the interval starts at the last unchanged sample. The 10 ms timer can be delayed by a key handler or other main-thread work. This is not an input-latency gate measurement or an estimate of a general A/B speed effect.

| Try | Pending at actual key | First changed sample ms | Change interval ms | First pending→0 ms | Immediate read changed? | Redo exact? |
|---|---:|---:|---|---:|---|---|
| A1 | 1 | 57.4 | (15.0, 57.4] | 53.9 | false | yes |
| A2 | 1 | 61.9 | (9.5, 61.9] | 59.4 | false | yes |
| A3 | 1 | 29.6 | (6.5, 29.6] | 25.4 | false | yes |
| B1 | 0 | 241.3 | (0.0, 241.3] | 237.8 | true | yes |
| B2 | 0 | 56.0 | (0.0, 56.0] | 52.9 | true | yes |
| B3 | 0 | 30.4 | (7.6, 30.4] | 26.3 | false | yes |

In all three A tries, the immediate read was unchanged while the command remained behind the owned head. Pending became zero before the first changed-text observation. For example, A1 had one pending item at keydown, two immediately after Undo queued, one at+15.6 ms, zero at+53.9 ms, and changed text observed at+57.4 ms. The same immediate assertion ordering therefore can fail even though Undo correctly applies once admitted.

**B3 is an important qualification:** pending was zero at actual keydown, but the immediate read was also unchanged. Its first-sample status was durable; durable became false about3.3 ms before the key, still with pending0. Worker history verification was published as running. Undo then occupied one pending item and text changed by the 30.4 ms observation, with exact Redo. This shows the immediate-read race is not exclusive to a positive pre-press pending count. An idle status sample is not a completion barrier for the subsequently dispatched command. The source of B3’s intervening work was not privately instrumented or isolated.

All six initial Undo depths were781. Each Undo removed exactly the synthetic return`!`, with depth 780 afterward; every Redo restored the exact text and depth 781. Neither(b), unchanged after10 seconds despite available history, nor(c), zero depth before the press, occurred. The241.3 ms B1 observation includes a delayed first poll/key dispatch and must not be called a 241 ms network wait or used to rank busy versus idle performance.

This reproduces a race in the frozen assertion’s immediate read, not a retrospective proof of the exact queue state in522-r2: that older run did not save the admission-status/depth/completion trace. No claim of permanent Undo failure, lost writing, global absence of Undo bugs or release clearance follows from six fictional-profile observations.

## Saved-only ERR_ABORTED trace retained

The 524 read-only result is retained without a new tracing build. In522r2 the post-resume submit starts at+640.490 ms and ends`net::ERR_ABORTED`22.939 ms later. In r1 the counterpart is200 after19.961 ms. The next non-submit sync requests start at+16149.358 ms and+3994.316 ms respectively.

Measured from each run’s previous receive completion, however, those next requests are19538.119 ms and17045.083 ms later. Both fit `idleReceiveInterval`’s healthy-stream15000+Math.random()*5000 ms cadence. The difference relative to resume is therefore consistent with the phase/jitter of that existing cadence; saved records do not contain scheduler due times or completion boundaries proving that explanation over queued/storage work.

Both saved service databases have58 accepted H2 positions and no refused rows, versus fixture position 1, alongside57 recorded browser submit calls; measured service response statuses are all 200. This argues against interpreting the browser label as proof of lost submission, but aggregate counts lack request-body/response pairing and do not prove which client reply was authenticated.

The exact22.939mscancellation reason remains **unknown from the saved evidence**. Parent/lifetime/login cancellation, transport deadlines and bounded body-cancellation paths exist, but no abort reason, initiator stack or response headers/body was preserved for that call. No specific abort cause, server rejection, rate-limit refusal, harmless-browser explanation or new16 second backoff is invented. Newly collected525trigger data is not used to relabel the old522network event.

## Stop and unchanged qualification

The operator’s bounded diagnostic is complete. No app fix, spec repair, assertion or wait adjustment, additional experiment, Goals gate rerun, commit, push or release preparation follows. The Stage 5matrix remains exactly as 523 recorded:21 operator-carried runs,11 passing reruns,1 failed Undo assertion,3 unrun. This diagnostic cannot waive that failed cell. The unmeasured 508 post-reduction typing/full-reauthentication debt remains; this is an Undo diagnostic, not sustained typing on a reduced owner.

Sequential documentation patch 525 records the operator correction and all six results. All old evidence, the 524 precondition and522/523failure stay immutable. The real index remains empty. **Stop for the operator.**
