# Phase 554 — measure the send path, then stop walking the whole retained graph on every ledger change

The coordinating session asked on 2026-11-12 for the first steps of [investigation 09](../investigations/09-send-path.md). The order was:
- timers and counters on the send path (step 0);
- a baseline on the path the operator uses;
- F1 and F1b;
- the same measurement again.

F2 and F3 are the next two phases. F4 to F9 need the operator and were not touched.

What was built:
- **Step 0.** Timers and counters for the send path. Like the existing ledger metrics, they record only in a build made with `VITE_ACCOUNT_LEDGER_PROFILE=1`.
- **A measurement harness** (`scripts/performance/send-cost/`). It runs the real composed Worker owner with sync on, two devices and the release build flags.
- **F1.** The ledger index is gated on its row bounds alone. Retained ownership is computed only when asked for.
- **F1b.** A receipt turn that captured nothing skips its escape check and its erasure, which had nothing to find.

One check is narrowed, for a turn that captured nothing: its result is no longer searched for the turn's own handle (see [What is amended](#what-is-amended-and-what-is-not)). No other check is removed or weakened. Nothing changes the stored format, the wire, a limit or the outcome of any gate.

## Result

**On a device that has not reduced, a sent position costs 12 to 18% less.** Medians of local cost per sent position, with the peer idle:

| Seed | Before | After |
|---:|---:|---:|
| 300 | 242 ms | 210 ms |
| 1,000 | 587 ms | 515 ms |
| 3,000 | 1,836 ms | 1,510 ms |

- The two removed walk sites took 32, 103 and 350 ms per sent position at those three sizes. Whole-graph walks per sent position fall from 38 to 12.
- The 12 that remain are the adoption erase (F7, held for the operator).
- With the peer typing, the change is about the same.

**A reduced device does not change, as expected.** It costs 185 to 270 ms per sent position at every size, because its walks cover about 750 objects, not 9,700 to 91,000.

**The stop condition is far off on the unreduced device.**
- At 3,000 positions it costs 7.2 times what it costs at 300 (7.6 before), and 1,510 ms against a target of about 250 ms.
- What remains of the slope is listed under [Toward the stop condition](#toward-the-stop-condition).
- F2 and F3 together address at most about 250 ms of the 1,299 ms slope. The target needs the SEND-FURTHER decisions as well.

**The reduced device already meets the slope condition** (3,000 at 0.71 times 300). It meets 250 ms at 1,000 and 3,000 positions, but not at 300: there it costs 266 ms, because of an 84 ms shape check that is not explained.

**Investigation 09's estimate was too high.** It put the walks F1 and F1b remove at about 1 s or more per sent position at 3,000. Measured, they are 0.35 s: 19% of the cost.
- That estimate was read from code. The measured share is lower, but the walks are still the largest item that needed no decision.
- No measurement contradicted the ranking, so F1 and F1b were built.

## Step 0: what is observed, and that it is inert without the flag

**Timers** (per call: count, total and maximum ms):
- `verifyCompare`: the unchanged-load byte comparison.
- `verifyPrefix`: the prefix comparison on change.
- `selectProjection`: the detached clone of a verified selection.
- `indexUsage`: the reported ownership walk.
- `receiptTurnWalk`: a receipt turn's escape check and erasure.
- `extendLedger`: a whole continuation.
- `proposalCheck`: the delivery `beforeCommit`, with its unselected load and speculative check.
- `expectedChain`: the expected-position chain in `record`.
- `sendNetwork`: the HTTP submit wait.
- Per driver operation: `opDeliveryStatus`, `opSpoolStatus`, `opPrepareEnvelope`, `opPrepareSubmission` and `opSubmit`.
- `sendStep`: a step that got a new position accepted.

**Counters:**
- Whole-graph walks by site: `indexUsageWalks`, `receiptTurnWalks` and `adoptionEraseWalks`.
- `graphWalkObjects`: objects those walks visited.
- `verifyCompares` and `verifyPrefixes`.
- `acceptedSends`.

**Per position:** a bounded `acceptedSends` list (up to 4,096 entries) of step time and HTTP wait, which gives per-position local cost.

**When the observation runs:**
- Every new site calls `ledgerWorkStart`, `measureLedgerWork` or `countGraphWalk`, which do nothing unless the module was built with the flag.
- The two wrappers that would add a promise hop (`extendAccountLedger` and the driver's op timer) call straight through without it.
- The walk observers pass the traversal's own seen count, so no extra walk is added.

**The profile flag reaches the Worker bundle** ([check](./worker-define-check.txt)). Two builds were made from the same source and release flags, one with the flag and one without:
- In the profiled build, the Account owner Worker chunk carries `VITE_ACCOUNT_LEDGER_PROFILE:"1"` in its compiled `import.meta.env`. The unprofiled chunk has the same inert code, with the key absent.
- The harness reads `__doneLedgerMetrics` from the Worker realm (`page.workers()`), and every run below did so. Existing tests read only the page realm.

**Shown inert by test** (`test/sendPathMetrics.test.ts`, case 1). With the flag unset, a scenario runs every instrumented path:
- verifier compare, prefix and selection;
- five send-only continuations with their receipt turns;
- a captured receipt turn;
- an on-request ownership report;
- a driver step that gets a position accepted;
- a paused submit;
- an acceptance recorded through `record`.

During that scenario `performance.now` is never called, `costs` stays empty and every new counter stays 0. Case 2 runs the same scenario with the flag set, and every timer and counter records.

## F1: the index gate no longer walks the retained graph

Phase 401 compared the whole retained graph's bytes with the 32 MiB ceiling, on every ledger change. Phase 538 turned that comparison into a report, but the walk still ran:
- twice per adopted continuation: inside `extendAccountLedger` and in the owner's recheck after replay;
- once per speculative check;
- once per complete check.

That is 14 walks per sent position. At 3,000 positions each walk visits about 91,000 objects.

**Nothing in a production path read the result.** Read at `42f9e88b7` and again on the final tree:
- the three production callers (`accountReceive.ts:929`, and `incrementalAccountLedger.ts` 216 and 336 at the base) read only `eligible` and `logicalRows`;
- `ownedBytes` from this call is read only by tests.

The memo's own `ownedBytes()` is a running total and was never a walk.

**The change** (`incrementalAccountLedger.ts`, `accountReceive.ts`):
- **`accountLedgerIndexBounds`** applies the logical and physical row bounds, with the same input validation and messages, and no walk.
- The **three production callers** use it: the continuation, the complete check's index build and the owner's recheck.
- **`accountLedgerIndexUsage`** is unchanged in result. It still validates, applies the same bounds, walks and reports `ownedBytes`, now only when it is called: by tests, and by any diagnostic that asks.

The raw record byte bound and both row bounds stay in force exactly where they were.

## F1b: an empty receipt turn skips work that had nothing to find

Phases 409 and 412 run every continuation inside a receipt turn. On completion the turn walks the whole adopted result for escaped parser objects, and on disposal it walks the result again to protect what it keeps while erasing its own syntax and outputs.

A turn captures a row only for a receipt record. A send-only continuation therefore always ends with no rows, no parsers and no outputs. Both walks then search for objects that cannot exist and erase an empty list.

`accountInbound.ts`: when the turn has no rows, parsers or outputs, `complete` records the retained value and `dispose` clears the input map, without walking. A turn that captured anything runs exactly as before. The `api` self-reference check is skipped with them: an empty turn owns nothing a retained reference could reach.

## The harness and the seeds

**Set-up** (`scripts/performance/send-cost/`):
- **Account.** Two fictional devices of one Account: A original, B joined. They run on the in-process development service behind the packaged-application gateway, and the account is made through the real setup and enrollment screens.
- **Driver.** A driver page opens the real composed Worker owner with sync on (`openAccountWorkerSession`, as the continuation tests do).
- **Positions.** Each insert into A's master text is one Yjs update, so one source and one sent position.
- **Build.** `harness.ts` runs one step per invocation: `seed`, `grow`, `reduce` or `measure`. The bundle is built by `vite.config.ts` beside it.
- **Storage.** Seeds, snapshots and raw results stay outside the repository; their hashes are in [evidence.json](./evidence.json).

**Builds.** Every measurement build uses the released flags with profiling added:
- `RETENTION_AUTO=1`, `RETENTION_RESUME=1`, `RANGE_RECEIVE=1`, `HISTORY_AUTO=0`;
- `BATCH=coordinated-2000`;
- `VITE_ACCOUNT_LEDGER_PROFILE=1`.

The growth build had automatic reduction off, so no unreduced snapshot could reduce itself.

**Seeds.** A wrote up to 3,000 positions and B wrote every tenth.

| Seed | A's positions | B's positions | A's physical rows | B's physical rows |
|---:|---:|---:|---:|---:|
| 300 | 300 | 31 | 2,160 | 818 |
| 1,000 | 1,000 | 101 | 7,202 | 2,708 |
| 3,000 | 3,000 | 301 | 21,602 | 8,108 |

**The 3,000 seed is still indexed.** It holds 21,602 physical rows. Received positions add one logical row each beyond the first in a receipt, so the logical count is at most 21,902, against the 32,768 bound. No full check ran during any unreduced idle run.

**Reduced snapshots.** One local reduction (`removeLocalHistory(0)`, step-0 build) completed on a copy of each seed. It removed 2,162, 7,202 and 21,602 rows.

**Measurement:**
- Each run starts from a fresh copy of a snapshot and opens both devices.
- A then sends 5 warm-up positions and K = 30 measured ones.
- Each of the 12 configurations ran 3 times: 2 devices × 3 seeds × peer idle or typing (B inserting every 1.5 s).
- Repetitions were interleaved: step 0 r1, F1 r1, step 0 r2, F1 r2, step 0 r3, F1 r3.

**Definitions:**
- **Local cost** is the Worker-side wall time of the send step that allocated the position and got it accepted, minus its HTTP submit wait. It includes storage queue waits behind receive work.
- **Per-send timers** are totals over the 30 measured sends divided by 30. With the peer typing they include the receive lane's work in the same window.

**Host:**
- Apple M1 Pro, 10 cores, 32 GB, macOS 26.5.1, headless Chromium (Playwright 1.62.0).
- Runs were under `caffeinate -d`. No other Vitest or Playwright process ran during either measurement stage (checked with `pgrep` before each); only short summary scripts ran alongside.
- The seed growth overlapped this seat's unit tests for its first 25 minutes. Its curve is informational only ([grow-log.json](./grow-log.json)): A's median local cost per position rose from 179 ms at 100 positions to 2,164 ms at 3,000.

## Before and after

Generated from the summaries ([tables.md](./tables.md), [step 0](./summary-step0.json), [after](./summary-f1.json)).

### Unreduced device

| Seed | Peer | Median local ms, before → after | p95 local ms, before → after | Whole-graph walks per send, before → after (objects per walk) | Runs × sends |
|---:|---|---|---|---|---|
| 300 | idle | 242.5 → 210.4 | 281.9 → 252.3 | 38.0 → 12.0 (9,678) | 3×30 and 3×30 |
| 300 | typing | 244.2 → 224.6 | 301.7 → 292.7 | 40.4 → 13.56 (9,745) | 3×30 and 3×30 |
| 1,000 | idle | 587.4 → 514.8 | 657.9 → 637.0 | 38.0 → 12.0 (30,807) | 3×30 and 3×30 |
| 1,000 | typing | 597.0 → 503.6 | 671.7 → 611.9 | 41.72 → 14.26 (30,867) | 3×30 and 3×30 |
| 3,000 | idle | 1,836.3 → 1,509.5 | 1,999.8 → 1,696.3 | 38.0 → 12.0 (91,176) | 3×30 and 3×30 |
| 3,000 | typing | 1,852.8 → 1,526.4 | 2,089.8 → 1,738.3 | 44.21 → 16.4 (91,049) | 3×30 and 3×30 |

**Repetition medians do not overlap at 3,000:** 1,816, 1,853 and 1,839 ms before; 1,491, 1,583 and 1,476 ms after.

**Per send, walks by site with the peer idle** (the same at every size):
- index usage: 14 → 0;
- receipt turn: 12 → 0;
- adoption erase: 12 → 12.

With the peer typing, receipt turns that capture a received page still walk.

**Edit to accepted** (median, including the 300 ms batching window and the network) at 3,000: 2,226 ms before, 1,897 ms after.

**Opening A** takes 1.3 s, 3.6 s and 10.9 s at 300, 1,000 and 3,000 positions, unchanged.

Step-0 timers per sent position, peer idle, ms (before → after):

| Timer | 300 | 1,000 | 3,000 |
|---|---|---|---|
| indexUsage | 20.13 → 0.0 | 61.82 → 0.0 | 214.54 → 0.0 |
| receiptTurnWalk | 12.92 → 0.0 | 40.73 → 0.0 | 135.0 → 0.0 |
| extendLedger | 17.74 → 5.75 | 48.22 → 11.85 | 163.84 → 34.53 |
| loadElapsed | 155.69 → 128.19 | 433.56 → 365.25 | 1464.04 → 1177.05 |
| proposalCheck | 31.83 → 28.86 | 94.99 → 93.27 | 353.31 → 309.03 |
| installOwned | 13.45 → 13.79 | 47.57 → 48.7 | 160.1 → 157.81 |
| verifyCompare | 24.59 → 25.18 | 79.0 → 82.77 | 251.86 → 253.13 |
| verifyPrefix | 12.54 → 12.34 | 39.26 → 41.32 | 127.09 → 126.61 |
| selectProjection | 11.34 → 11.35 | 36.54 → 39.98 | 130.5 → 134.05 |
| warmShapeCheck | 30.19 → 31.12 | 65.42 → 70.78 | 281.88 → 296.24 |
| expectedChain | 7.02 → 7.22 | 23.1 → 24.26 | 75.89 → 80.26 |
| envelopeSelection | 8.31 → 8.41 | 23.93 → 26.88 | 63.96 → 66.07 |

**How to read the timers:**
- **They nest:**
  - `loadElapsed` (about 19 loads per send) contains the compares, the selection clones, the shape checks, continuations, receipt walks and the adoption erase.
  - `proposalCheck` contains two unselected loads, which are also in `loadElapsed`.
  - `extendLedger` contained 8 of the 14 index-usage walks before F1. What remains in it, 35 ms at 3,000, is the continuation itself.
- **Why `indexUsage` and `receiptTurnWalk` are 0 after:** with the peer idle, no turn captures anything and no ownership report is requested.

### Reduced device

| Seed | Peer | Median local ms, before → after | p95 local ms, before → after | Whole-graph walks per send, before → after (objects per walk) | Runs × sends |
|---:|---|---|---|---|---|
| 300 | idle | 256.4 → 266.4 | 296.3 → 335.3 | 42.0 → 24.0 (754) | 3×30 and 3×30 |
| 300 | typing | 260.5 → 261.0 | 325.7 → 389.2 | 45.11 → 26.67 (872) | 3×30 and 3×30 |
| 1,000 | idle | 204.8 → 199.7 | 265.4 → 257.8 | 42.0 → 24.0 (754) | 3×30 and 3×30 |
| 1,000 | typing | 186.1 → 191.6 | 297.7 → 265.5 | 44.73 → 26.4 (854) | 3×30 and 3×30 |
| 3,000 | idle | 187.2 → 188.1 | 239.8 → 262.1 | 42.0 → 24.0 (754) | 3×30 and 3×30 |
| 3,000 | typing | 195.8 → 200.3 | 269.8 → 264.1 | 44.8 → 26.46 (870) | 3×30 and 3×30 |

**Walks.** A reduced device extends through the baseline reuse, so it has two verifier instances and 24 adoption-erase walks per send. Its walks visit about 750 objects, and every walk timer is near 1 ms, before or after.

**Why seed 300 is the slowest:** its shape check took 84 ms per send against 15 ms at the other two seeds, in both builds. That was not investigated.

**Opening A** takes 0.4 to 0.6 s at every size.

**No reduction ran inside any measured window**, on either device or in either build (no `retentionPreparation` call between the snapshots).

## Toward the stop condition

The stop condition for the send-path work is that, on both devices, a sent position at 3,000 positions costs:
- at most 1.2 times the cost at 300;
- at most about 250 ms;

with the (a) counters as unit tests.

**After this phase:**

| Device | 300 | 3,000 | Ratio | Meets the condition? |
|---|---:|---:|---:|---|
| Unreduced | 210 ms | 1,510 ms | 7.2 | No. The slope is 1,299 ms |
| Reduced | 266 ms | 188 ms | 0.71 | Slope and 3,000 yes; 300 misses 250 ms (the unexplained shape check) |

Counter (a), "no whole-graph walk in a send-only continuation", is a unit test now (`test/sendPathMetrics.test.ts`, case 3). The adoption erase still walks twice per adoption (F7, held), so (a) holds for the continuation and its receipt turn, not for adoption.

**What the remaining 1,299 ms slope on the unreduced device is made of,** by timer, 3,000 minus 300, peer idle, after F1 and F1b:

| Timer | Slope | Inside | Held work it belongs to |
|---|---:|---|---|
| `loadElapsed` | 1,049 ms | about 19 loads | |
| `warmShapeCheck` | 265 ms | loads | IndexedDB count and key cursors on every load; F9 |
| `verifyCompare` | 228 ms | loads | about 13.8 unchanged-load byte compares; F5 |
| `installOwned` | 144 ms | loads | adoption erase, 12 walks of 91,000 objects; F7 |
| `selectProjection` | 123 ms | loads | detached clones; F2 and F3 |
| `verifyPrefix` | 114 ms | loads | 6 prefix compares; F5 |
| `extendLedger` | 29 ms | loads | continuation copies; F6 |
| rest of `loadElapsed` | about 146 ms | loads | |
| `proposalCheck` | 280 ms | its own 2 unselected loads, also counted in `loadElapsed` | F4. Includes `readProjection`, the whole-view clone (120 ms), and `copyRecords` (20 ms) |
| `expectedChain` | 73 ms | | F2 |
| `envelopeSelection` | 58 ms | | F3 |
| `storageQueueWait` | 40 ms | | |

**What follows:**
- **F2 and F3 reach at most about 250 ms of the slope:** all of `expectedChain`, `envelopeSelection` and `selectProjection`.
- **That would leave about 1,050 ms**, made of the shape checks, compares, proposal clone and adoption erase, which are F4, F5, F7 and F9 in SEND-FURTHER.
- **The constant part is about 190 ms on either device**, so 250 ms at 3,000 allows a slope of only about 60 ms.
- **The result that ends the work is unchanged:** the condition above, measured with this harness on these seeds.

## Tests

Two new files, a fixture, and one test of each kind for every condition.

**`test/sendPathFixture.ts`** is one publisher's own sent history from the independent Node wire oracle:
- capsules, positions, attempts, envelopes and signed acceptances;
- verified with the owner's complete check, then indexed;
- continued one step at a time exactly as the owner's validate callback continues it, including the recheck after replay.

**`test/sendPathWalks.test.ts`, 5 cases.** These cases do not depend on the step-0 counters. A walk is seen by a getter on one retained object that only a whole-graph traversal enumerates: an early source index, read by name and never spread by a continuation.
1. **A send-only continuation on a 1,024-position history walks no retained graph (F1).**
   - Five steps run: capture, position, attempt, envelope, acceptance. No step trips the getter.
   - The extended view equals the complete check of the same rows.
   - Ownership on request still equals a direct walk.
   - At this size one walk visits 25,628 objects and charges 3.4 MB.
2. **A complete check builds its indexes without a walk (F1).**
3. **The owner's recheck is the bounds call (F1).** A static check of `accountReceive.ts`, whose validate callback cannot run outside a native owner.
4. **A turn that captured nothing completes and disposes without walking a 1,024-position result (F1b).** Nothing it retains is erased.
5. **A receipt turn walks and erases exactly when it captured something (F1b).** On a real dense receipt continuation:
   - An empty turn completing that result walks nothing and erases nothing.
   - A turn with a row, its parsers and a verified output walks once on completion and once on disposal. It erases its captured syntax and outputs, through the real `eraseUnretained`, while the adopted view keeps its bytes.
   - The same turn refuses an escaped parser, and the refusal erases every buffer it owned.
   - A turn that captured a row it never verified refuses completion and erases.

**`test/sendPathMetrics.test.ts`, 3 cases:**
1. Inert without the flag (above).
2. Every timer and counter records with the flag.
3. **Stop condition (a).** Ten send-only continuations on a 1,024-position history add 0 index-usage walks and 0 receipt-turn walks.

**On the phase 553 source** (`42f9e88b7`, with the eight changed sources reverted and the new tests kept): all 8 cases fail ([script](./base-run.sh.txt), [run](./base-tree-run.txt)).
- Case 1 sees 2 walks per continuation; the empty turn sees 1 on completion; the reporting call is still on the owner path.
- The metrics cases fail because the instrumentation is absent.

**On step 0 alone** (the recorded step-0 patch, without F1 and F1b): 7 of 8 fail ([script](./step0-run.sh.txt), [run](./step0-tree-run.txt)).
- Stop condition (a) counts 20 index-usage walks for 10 continuations.
- The profiled case counts 22 where the on-request report alone should give 1.
- The gating case passes, as it guards step 0 itself.

**Mutation controls** ([script](./mutation-controls.py.txt), [output](./mutation-controls.txt)). Each mutation was applied alone to the final tree and restored byte for byte (checked by sha256). All 16 are detected.

| | Mutation | Detected by |
|---|---|---|
| F1-a | the continuation gates on the reporting call again | walks 1; metrics 2 and 3 |
| F1-b | the complete check's index build gates on the reporting call again | walks 2 |
| F1-c | the owner's recheck walks again | walks 3 |
| F1-d | the bounds gate walks to report ownership | walks 1 and 2 |
| F1b-a | completion walks an empty turn again | walks 4 and 5; metrics 2 and 3 |
| F1b-b | disposal walks an empty turn again | walks 4 and 5; metrics 2 and 3 |
| F1b-c | completion skips when there is no output, though a row and its parsers were captured | walks 5 |
| F1b-d | disposal skips when there is no output, though a row and its parsers were captured | walks 5 |
| F1b-e | completion always skips | walks 5 |
| F1b-f | disposal always skips | walks 5 |
| S0-a | the unchanged-load compare reads the clock without the flag | metrics 1 |
| S0-b | the submit wait reads the clock without the flag | metrics 1 |
| S0-c | walk counts are kept without the flag | metrics 1 |
| S0-d | the driver takes an accepted-send sample without the flag | metrics 1 |
| S0-e | driver op timers run without the flag | metrics 1 |
| S0-f | the expected-chain timer is dropped | metrics 2 |

**One equivalent mutant was replaced.** A first S0-d removed the flag check inside `recordAcceptedSend`. Its only caller is already behind the flag, so nothing could detect it. S0-d now removes the caller's check, which reads the clock without the flag.

**Existing tests, unmodified** ([run](./related-run.txt)): 38 Vitest files, 607 passed and 1 existing skip. They include:
- the phase 552 schedule control (`test/syncRefusal.test.ts`);
- the timing tests of phases 539, 540 and 546: `reductionSyncHold`, `retentionReductionHold`, `reductionHoldDutyCycle`, `ledgerHints`, `workspaceAdmission`, `automaticLocalRetention`, `retentionFenceCollision` and `workerWorkspaceQueues`;
- the budget, index, turn, delivery, verifier, warm-load and driver tests.

## What is amended, and what is not

Recorded in [decisions](../../../decisions.md) on 2026-11-12.

**Amended: phase 538's "keep measuring and reporting retained ownership"** (2026-11-11). Retained ownership is now measured when a caller asks for it (tests and diagnostics), not on every ledger change. The phase 401 accountant that computes it is unchanged.

**Narrowed, for a turn that captured nothing: the search for the turn's own handle** (phase 409, found in review). The escape check refuses a result that contains a captured parser or the turn's own handle. A turn that captured nothing now skips the whole check, so its own handle inside its result is no longer refused.
- Why this is accepted: such a turn owns no row, parser or output, and after completion its handle can capture nothing, because every capture requires an open turn.
- No test covered the handle condition before this phase, and none does now, for an empty or a captured turn.
- A turn that captured anything still refuses both.

**Not amended, and still shown by tests:**
- the logical-row bound, the physical-row bound and the raw record byte bound;
- the exact retained-row comparisons, both on unchanged loads and before borrowing;
- the speculative delivery check;
- detached projections;
- the erasure of every buffer a captured receipt turn owns and does not keep;
- the escape check of a turn that captured anything;
- the full-reference fallback and the semantic oracle;
- every authority, witness and commit check.

**The observation adds no check and removes none.** Without the flag it reads no clock, keeps no count and adds no promise hop on the send path.

## Not verified

- **No real device, no affected account and no deployed service.** The account's own row counts and its rows per position are still unknown. The fixture writes one source per position, the fewest rows a position can have.
- **WebKit and Firefox.** Only headless Chromium on one Mac was measured.
- **The reduced device's 84 ms shape check at the 300 seed.**
- **A phone.** The constant part of about 190 ms was measured on an M1 Pro.
- **Typing in the real editor.** The harness types through the composed Window workspace's text surface without the React editor. Window-side editor work is not in the local cost, which is the Worker's.
- **Wall time on the page's main thread.**

## Runs on the final tree (this seat)

- **The new tests:** 8 of 8 ([run](./candidate-run.txt)).
- **Related existing tests:** the 38 Vitest files above.
- **Type, lint and format:**
  - `pnpm typecheck`;
  - `oxlint --no-ignore` on every changed code file;
  - `oxfmt --check` on every changed file.

  All clean, except `src/crdt/accountSpool.ts`, which `oxfmt` flags on the base as well and this phase does not touch.
- **Inventory and plan:**
  - `pnpm validation:inventory`: 10 of 10;
  - `node scripts/release-validation/plan.mjs`: 1,132 obligations and 561 unresolved.
- **The nine CI adapter files:** 178 of 178.
- **The ten contract checks** (CI step "Check security contracts and published vectors"): all pass.
- **Crypto:**
  - `pnpm account:crypto-prep`: census matched, 6 of 6;
  - `pnpm account:crypto-audit`: passes the census step and stops at the 16 open constructions.
- **Build and traceability:** `pnpm build`, then `pnpm trace:check`, which passes.
- **At review, on the final tree:** the full unit suite (`pnpm test --maxWorkers=1`), 355 files, 3,690 passed and 1 existing skip, in 393 s; then `pnpm typecheck`, `pnpm build`, the ten contract checks, `pnpm validation:inventory` and the plan check, `pnpm account:crypto-prep`, the nine CI adapter files, `test/account-application/*.test.mjs`, `pnpm trace:check` after the build, the history, service delivery and service inbound node tests, and the CI session, authority and quarantine steps.
- **Changed at review:** this record and the decisions entry now state the narrowed handle condition (see [What is amended](#what-is-amended-and-what-is-not)). No source or test file was changed at review.

## Bookkeeping

Per [development.md](../../../development.md#release-bookkeeping):
- **Denominator.** Unchanged at 3,035. The two new Vitest files join the planning inventory as required and blocked, like other new literal test files, and are not yet reviewed into the denominator.
- **Planning inventory.** It moves from 1,130 to 1,132 obligations, and from 559 to 561 unresolved. The inventory graph goes from 766 to 768 test files. The harness is named `harness.ts`, not `*.spec.ts`, so it is not a test family.
- **Runtime census.** New hashes for the eight changed sources. No changed line adds a domain label or a cryptographic call.
- **Construction registry.** Six labelled sites in `incrementalAccountLedger.ts` moved down by 23 to 31 lines (eight registry lines). `pnpm account:crypto-audit` passes the census step and stops at the 16 open constructions, as on `origin/main`.
