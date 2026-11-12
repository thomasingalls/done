# Phase 555 — what the start-up pre-verification costs on a normal open; the one-owner path is held

The coordinating session asked on 2026-11-12 for two things from [investigation 06](../investigations/06-start-up-double-verification.md):
- measure what the temporary custody owner's pass ("pass A") costs on a normal open, on the path the operator uses;
- build the one-owner path of the investigation's section 3, but only if the measurement passed a gate.

The gate passed by a wide margin. The path was **not built**. Reading the code to build it turned up a required release-validation control that depends on pass A. The investigation had said the two passes call the same functions; for inbound coverage they do not. The coordinator's rule for that case is to say so and stop, so this phase is the measurement, the finding and the options. No source file changed.

## Result

**Pass A is half of an open on the large original device.** On the 3,000-position original device that has not reduced, medians of 5 opens through the packaged application:
- pass A took 5.48 s of an 11.08 s open (49.5%) online;
- offline it took 5.39 s of 10.80 s.

The network accounts for about 0.3 s of the whole open.

**The gate said build.** The rule was: build if pass A's median is at least 20% of click-to-first-frame, or at least 1 s.

**Why it was not built.** On a device that has not reduced, pass A is the only place where verifyInboundLedger's second coverage implementation runs on a normal open (the fallback branch, used when no reuse state is passed). The required case "cold replay refuses missing or changed content" in `test/account-receive/native.test.mjs`, and the release wrapper's reconciliation of its `control-coverage.json`, assert that the two branches each refuse a missing content row at open. With one owner, only the live owner's branch would run at open. The background audit uses that same branch, so a fault in it would never be caught.

**A cheap way to keep the control looks available.** The profile puts the fallback check's own work at about 0.1 s of pass A's 5.5 s, because the census it needs already exists in the live owner. It is an operator decision; see [Options](#options-for-the-operator).

## Milestone tables

Opens of copied phase 554 snapshots, built with the release flags plus `VITE_ACCOUNT_LEDGER_PROFILE=1`. Each cell is the median of 5 opens with its range, in ms. Milestones are read from the Worker realm and converted to the page clock by `timeOrigin`. The first frame is the second animation frame after the editor shell appears. This is the quiet set ([summary](./summary-quiet.json)).

| Segment | A, 3,000, online | A, 3,000, offline | B (joined), 3,000, online | A reduced, 3,000, online |
|---|---:|---:|---:|---:|
| Page load to unlock form (not in the open) | 944 [939–959] | 941 [937–951] | 432 [414–440] | 943 [938–965] |
| Click to authorized | 135 [123–170] | 130 [115–145] | 282 [276–329] | 117 [116–179] |
| Authorized to classified (pass A) | **5,478** [5,432–5,506] | **5,386** [5,339–5,825] | **4,639** [4,606–4,749] | 160 [154–217] |
| Classified to owner (pass B and activation) | 5,129 [5,075–5,216] | 5,025 [4,977–5,518] | 3,549 [3,479–4,038] | 42 [42–48] |
| Owner to editor (stream, Window replay, fork, compare) | 210 [205–214] | 212 [203–217] | 106 [103–121] | 26 [26–30] |
| Editor to first frame | 115 [113–129] | 62 [54–69] | 56 [54–65] | 57 [56–64] |
| **Click to first frame** | **11,085** [11,025–11,141] | **10,799** [10,716–11,769] | **8,663** [8,519–9,183] | 401 [396–537] |
| Pass A's share | 49.5% [48.9–49.8] | 49.7% [49.3–50.0] | 53.6% [51.0–54.2] | 40.0% [38.9–40.4] |

**Work inside each pass**, from the ledger metrics captured at each milestone. Every open showed the same counts:

| | Pass A | Pass B | Owner to editor |
|---|---|---|---|
| A, unreduced | 2 full physical reads (43,204 rows), 1 start-up validation, 1 inbound verification | 1 full physical read (21,602 rows), 1 full check (median 4,374 ms) | 1 warm load |
| B, unreduced | 2 full physical reads (16,216 rows), 1 inbound verification | 1 full physical read (8,108 rows), 1 full check (3,154 ms) | 1 warm load |
| A, reduced | 1 baseline full replay, 1 exact baseline reuse | 1 baseline full replay, no full check | 1 warm load |

The reduced device's pass A is 40% of its open, but only 160 ms of 401 ms.

## Where the open's time goes

On the large unreduced original device, online (ratios of the medians above):

| Segment | Share of the open |
|---|---:|
| Pass A | 49.4% |
| Pass B | 46.3% |
| Click to authorized | 1.2% |
| Owner to editor | 1.9% |
| Editor to first frame | 1.0% |

Page load to the unlock form (setup Worker boot and inspection, 0.94 s) comes before the click and is not counted.

**What fills pass A.** Two sampled Worker profiles from an unminified build of the same source ([attribution](./profile-attribution.json)) give these synchronous inclusive times. The windows are 6.1 and 7.0 s with the profiler on, against 5.5 s without it:

| Work in pass A | Synchronous inclusive time |
|---|---:|
| Census (`inspectInbound`), built twice | 2.1–2.4 s |
| `verifyDelivery` | 0.96–1.09 s |
| Garbage collection | 0.44–0.47 s |
| `validateContentUpdates` | 0.21–0.26 s |
| Decrypting reads (`openSnapshot`) | 0.20–0.25 s |
| `verifySpoolWitness` | 0.11 s |
| `verifyInboundLedger`, including its receipt checks | 0.09 s |
| Its coverage view (`contentCoverage`) | 0.02–0.03 s |
| `capturedRecovery` | 0.07–0.08 s |
| The ancestry replay and comparison (`replayRecovery`, `coversGenesis`) | about 0.02 s |

Hexadecimal conversion is the largest single self cost, 0.86 s.

**What fills pass B:**

| Work in pass B | Synchronous inclusive time |
|---|---:|
| `checkFull` | 1.8–2.0 s |
| Census, built once | 1.2–1.4 s |
| `verifyDelivery` | 1.0–1.2 s |
| `indexVerifiedLedger` | 0.39 s |
| `advanceSelfReceive` | 0.24–0.25 s |

These are attributions of overlapping stacks, not separable timings. Native crypto and IndexedDB time is not on these stacks.

## The control pass A carries

**What the control is.** `verifyInboundLedger` (`src/crdt/inboundLedger.ts:819-821`) checks each received update's coverage in one of two ways:
- with a caller's reuse state: `reuse.coverage.check`, an incremental coverage view with a prepared baseline and direct proofs;
- without one: its own fallback, `localCoverage!.check`, a fresh fork-and-compare view.

On a normal v9 open of a device that has not reduced, pass A calls it without reuse state (`src/crdt/accountStartup.ts:320`). The live owner's full check always passes reuse state (`src/crdt/accountReceive.ts:805-812`), and so does its background semantic audit, which hands in an isolated coverage view as the reuse (`:733-734`).

A reduced device is different: both passes verify its baseline through `replayLocalBaseline`, which calls the fallback branch itself (`src/crdt/localBaselineReplay.ts:819`). The control's fixture has not reduced.

**What depends on it:**
- The case "cold replay refuses missing or changed content" deletes a received content row, then removes each branch in turn with a build control (`coverage-without-reuse`, `coverage-without-fallback`). Each single omission must refuse at open; only the joint omission admits.
- Its artifact `control-coverage.json` names the omitted guards as `['startup fallback', 'owner reuse']`.
- `reconcileReceiveEvidence` in `scripts/release-validation/account-receive-wrapper.mjs` asserts both single refusals.
- The suite is a required stage in `docs/release-validation-manifest.json`.

**Where it came from.**
- It dates from the Q-01/Q-04 validation-control repair of 2026-09-12 (024664d9b). `docs/completed.md` records: "The first repair attempt disproved the review's reuse-only fix: startup also calls full coverage. Each guard now independently refuses the missing-content history; only their joint omission admits it."
- Its scope was preserved by the 2026-11-04 decision "Preserve the receive mutation scope while refreshing its indentation" (patch 433).

**What the one-owner path would change:**
- Only the reuse branch would run at open. With the reuse branch faulty, missing content would be admitted at open and stay admitted, since the audit takes the same branch.
- The single "reuse" omission in that case would stop refusing, and the release reconciliation would fail.
- Other verifiers (spool witness, spool, delivery, successor) only wrap the same check in a memo, so coverage is the one place where pass A is a second implementation.

**Correction to investigation 06.** It said the strongest case for the design, an independent second opinion at every open, "fails, because both passes call the same functions". That is wrong for inbound coverage. Its "Guarantees kept" list did not include this control. It also said the periodic semantic audit is the designed reference oracle. That holds for the coverage algorithm (non-incremental, fork-and-compare) but not for the branch: the audit never runs the fallback.

## Options for the operator

1. **Build as reported, and amend the control.**
   - Saves about 5.4 s on this device, less one warm load and the ancestry replay (about 0.1 s in the profile).
   - Amends the Q-01 coverage control and the required release expectation: a fault in the live owner's coverage branch would no longer be caught at open, or later.
2. **Build the one-owner path and keep the control.**
   - Also run the fallback coverage branch once at open, on the live owner's already verified census and records.
   - The profile puts that branch's own work (verifyInboundLedger with its receipt checks, and the coverage view) at about 0.1 s of pass A. Pass A's 2.1–2.4 s of census would not be repeated. Estimated at a few hundred ms at most at 3,000 positions; unmeasured.
   - Needs one narrow hook to read the live verified census. Leaves the release expectation unchanged.
3. **Keep pass A as it is.**

## The harness

**Where it is.** `scripts/performance/open-cost/` (new; not a test).

**What one open covers.** It goes through the packaged application exactly as a person would:
- the root page;
- the setup Worker it boots;
- the unlock form;
- the passkey, through a virtual authenticator;
- the setup-to-account handoff;
- both Worker passes;
- the Window's stream, replay, fork and comparison;
- the first rendered frame.

**What it reuses.**
- It copies one device's profile and the service from a phase 554 snapshot for each open and deletes the copy afterwards. The snapshots were not modified.
- The page is controlled by the packaged service worker before the click, as a returning device's page is; the offline variant needs that.

**Why not the send-cost harness.** Its driver opens through `openAccountWorkerSession` directly, so it skips the setup Worker and the handoff. It was not used here.

**What each segment covers:**
- **Page load to unlock form:** setup Worker boot and its inspection.
- **Click to authorized:**
  - the unlock command and the setup controller's reads;
  - the handoff and the account owner's start;
  - rotation observation, receipt and binding checks, the census;
  - the passkey.
  - On the joined device this also includes booting the enrollment Worker, which starts only after the click.
- **Authorized to classified:** pass A, which is all content verification plus the ancestry check.
- **Classified to owner:** pass B and the extension's activation.
- **Owner to editor:** the Window mirror, the paged stream, the Window replay, the fork and the comparison.
- **Editor to first frame:** rendering.

**Options.** `OPEN_COST_QUIET=1` waits, up to 15 minutes, until no other Vitest or Playwright process runs, and records `pgrep` before each open and at its first frame. `OPEN_COST_PROFILE=1` samples the opening Worker through the page's own CDP session.

**Files in this record.**
- The run script, [run-open.sh.txt](./run-open.sh.txt).
- The summariser, [summarise.py.txt](./summarise.py.txt).
- The profile attribution script, [profile.py.txt](./profile.py.txt).
- The two summaries and the attribution.

The builds came from `scripts/performance/send-cost/vite.config.ts` at `8d83e19c6`. The profiled one also used `--minify false`.

## Host and overlap

**Host.**
- Apple M1 Pro, 10 cores, 32 GB, macOS 26.5.1, headless Chromium (Playwright 1.62.0), under `caffeinate -d`.
- Load average 7 to 9 from other sessions throughout.

**Overlap.**
- The first set of 20 opens ran without the quiet guard ([summary](./summary-first.json)). Another project's Playwright runs appeared at three of its 30-second samples.
- The quiet set (the tables above) waited before each open:
  - one joined-device open waited 15 s;
  - one original-device open (online, r4) found another project's run present at its first frame; its 11,141 ms is inside the range and it is kept.
- The two sets agree within 3%: pass A 5,510 against 5,478 ms, click to first frame 11,318 against 11,085 ms.
- No other run of this seat overlapped either set.

## Bookkeeping

No runtime source or test changed:
- the release inventory records the two harness files;
- the plan is unchanged at 1,132 obligations and 561 unresolved;
- the runtime census is unchanged (`pnpm account:crypto-prep` passes).

The CI contract commands, the nine adapter test files (178 of 178), `pnpm build` and `pnpm trace:check` pass on this tree.

There is no decisions entry or progress section, because nothing was built. START-ONE-OWNER in the product backlog holds the choice.

## Not done or not verified

- Part 2: no source change, tests, mutation controls or paired before-and-after.
- The time to the first completed background audit after open. That was asked for only if the path was built.
- The joined-device slice and the "semantic audit due at open" option: out of scope as asked.
- The cost of option 2. The estimate rests on the profile attribution above, not on a build.
- Whether any other existing test besides the coverage control would change under the one-owner path. Only the start-up controls were read; none was run against a prototype.
- A real device, the affected account, WebKit, Firefox, a phone.
- The raw results, profiles, builds and fixtures stay outside the repository; their hashes are in [evidence.json](./evidence.json).

## At review

- **Read again:** the three coverage branches in `verifyInboundLedger`, the start-up caller that passes no reuse state, the required case that omits each branch in turn, and the release wrapper's reconciliation. The reason for not building stands.
- **Run on the final tree:** the full unit suite (`pnpm test --maxWorkers=1`), 355 files, 3,690 passed and 1 existing skip, in 383 s; then `pnpm typecheck`, `pnpm build`, the ten contract checks, `pnpm validation:inventory` and the plan check, `pnpm account:crypto-prep`, the nine CI adapter files, `test/account-application/*.test.mjs`, `pnpm trace:check` after the build, the history, service delivery and service inbound node tests, and the CI session, authority and quarantine steps.
