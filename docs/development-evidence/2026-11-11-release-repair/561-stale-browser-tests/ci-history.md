> Written on 2026-11-13 by a read-only agent of the coordinating session, for the investigation in [investigation.md](./investigation.md) (it read CI data and ran no tests), and filed below unchanged. Its saved job logs and lists (`ci/logs`, `ci/clean`, `ci/near-*.txt`, `ci/over3000.txt`) were not kept.
# CI history, 2026-10-16 to 2026-11-12: "Build and regression gates"

Read-only. Sources: `gh run view --json jobs`, check-run annotations, full job logs (saved under `ci/logs`, ANSI-stripped copies in `ci/clean`), and `git show`/`git log` at 3b8394590. No tests were run.

## Headline

1. **No run since the green 38885857436 can finish inside 20 minutes, whatever happens to the unit case.** Every later run that passed the unit step ended at the job's `timeout-minutes: 20` (16 runs) or was superseded (1 run). 11 of the 16 timeouts struck in "Run onboarding, account compatibility and device-removal browser regressions". The other 5 struck elsewhere:
   - trace:check (1)
   - native sync step (1)
   - Chromium install during an apt mirror stall (2)
   - source-artifacts step after a 162 s checkout (1)

   The browser step grew from 35 tests (2.8 min, last green run) to 54 tests. The 19 new tests include 13 `enrollment-*` cases at 24-43 s each, about 430 s in total. The `enrollment-batch` spec entered ci.yml in 465c5e07c (10-16) and `enrollment-state-retry` in 2e388f5cc (10-17). A further 2.2-4.4 min came from the "Check native sync authority" step that 51d8550d3 added on 10-23. On the fastest runner seen (43072060806), the browser step started at 11.4 min and had passed 41 of 54 tests when the job was killed at 20.2 min. Finishing would take about 25 min: roughly 1.5 min for the remaining browser tests, about 2.4 min for account-setup and about 1.3 min for trace:check.
2. **Of the 17 "cancelled" runs, 16 hit the 20-minute timeout, 1 was superseded and none was cancelled by hand.** Annotations say "The job has exceeded the maximum execution time of 20m0s" for the 16, with job walls of 20.2-20.4 min. 39992803591 says "Canceling since a higher priority waiting request for ci-refs/pull/57/merge exists". All 7 pushes to main since 10-16 are timeouts.
3. **The all72 case was already near the limit when it was added (6ae3e49ca, 2026-11-05); it did not get slower.** On fast runners it takes 3.1-3.3 s. On slow runners it takes 5.5-5.8 s and fails. Hosted runner speed falls into two groups, and about half the runners since 10-16 were about 1.9x slower. Its first CI run (11-07) was already over 5 s. No commit between 10-16 and 11-12 plausibly made it slower. The likely main cost is 480 Vitest `toEqual` comparisons on Uint8Arrays (240 of them on an ~11.6 KB page). The 10-16 repair faf465f72 fixed the same pattern. This is inferred from the code, not profiled.

## 1. Runs

Wall = job start to completion. Unit = "Run all unit regression tests" step seconds (Vitest's own Duration agrees within 2 s). Speed index = median ratio of per-file durations against run 43072060806 for files ≥200 ms in both. It is approximate across eras because the code changed.

| Run | Created (UTC) | SHA | Branch (event) | Conclusion | Failing / last step | Cause | Wall | Unit s | Speed |
|---|---|---|---|---|---|---|---|---|---|
| 38874119686 | 10-16 08:30 | 1849721ee | codex/improve-task-scheduling-ux (PR) | failure | Unit tests (259 s) | "Test timed out in 5000ms": pendingProjection.test.ts:325, localBaselineAnchor.test.ts:91 (2 file workers then) | 8.3m | 259 | 3.41* |
| 38879680534 | 10-16 09:19 | 58b1a12e3 | same (PR) | failure | Check development onboarding (199 s) | 3 failed in test/first-device-setup/setup.spec.ts (90 s timeout, then locators not found). Packaged browser step passed 35/35 (127 s) | 12.8m | 148 | 1.78* |
| 38883271712 | 10-16 09:51 | dbae813ca | same (PR) | failure | Unit tests (258 s) | same two 5 s timeouts | 8.3m | 258 | 3.38* |
| **38885857436** | 10-16 10:14 | faf465f72 | same (PR) | **success** | all | passed. compiler-loading 36 s; packaged 166 s (35 passed, 2.8m); account-setup 146 s (20 passed, 2.4m); trace 77 s | 19.1m | 312 | 1.93 |
| 38888505702 | 10-16 10:37 | 89eac0e84 | main (push) | cancelled | Check security evidence traceability (69 s) | **timeout**. Both browser steps green: packaged 170 s (35 passed), account-setup 144 s (20 passed) | 20.4m | 339 | 2.06 |
| 39678186301 | 10-21 21:21 | c11775758 | codex/improve-task-scheduling-ux (PR) | failure | Unit tests (202 s) | onboardingStorage.test.ts:206 "expected undefined to be defined". Hard-coded day '2026-10-14' had aged out; 51d8550d3 added `today: () => '2026-10-14'` | 6.2m | 202 | 1.10 |
| 39907557852 | 10-23 05:45 | 51d8550d3 | same (PR) | cancelled | Packaged browser (149 s, 16/54 passed) | timeout | 20.4m | 324 | 1.96 |
| 39911652572 | 10-23 06:28 | b54d9fb8a | same (PR) | cancelled | Packaged browser (459 s, 26/54) | timeout | 20.3m | 223 | 1.24 |
| 39912086995 | 10-23 06:32 | 6d1baffc5 | main (push) | cancelled | Packaged browser (283 s, 20/54) | timeout | 20.4m | 262 | 1.52 |
| 39972700274 | 10-23 14:47 | d1c2784be | codex/improve-task-scheduling-ux (PR) | failure | Check security contracts and published vectors (21 s) | `authority:check`: "authority map: 1 failure(s) - Runtime census changed. Review source changes and classification, then explicitly run --record." | 1.3m | - | - |
| 39992803591 | 10-23 17:09 | d8b3f22b0 | same (PR) | cancelled | Packaged browser (541 s, 43/54) | **superseded**. 39995511985 was created 17:29:41, 12 s before this job's 20-min mark | 20.3m | 201 | 1.11 |
| 39995511985 | 10-23 17:29 | 0a01b7151 | same (PR) | cancelled | Check native sync authority (252 s) | timeout. Chromium install took 360 s (apt 25.9 MB at 77 kB/s) | 20.3m | 329 | 2.00 |
| 39995685474 | 10-23 17:30 | 1b10823f9 | main (push) | cancelled | Packaged browser (389 s, 23/54) | timeout | 20.3m | 240 | 1.33 |
| 40358989317 | 10-26 16:25 | 2aa6bc994 | codex/improve-task-scheduling-ux (PR) | cancelled | Install Playwright Chromium (608 s) | timeout. apt downloads from azure.archive.ubuntu.com stalled (a 5.6 MB package took about 4 min) | 20.3m | 336 | 1.98 |
| 40360132185 | 10-26 16:32 | 67288576b | main (push) | cancelled | Install Playwright Chromium (631 s) | timeout. Same apt stall | 20.3m | 327 | 1.94 |
| 40724349821 | 10-28 16:16 | 8d6d42c1c | codex/reduce-goals-context-overhead (PR) | cancelled | Check source artifacts and historical owner (100 s) | timeout. Checkout took 162 s | 20.2m | 328 | 1.80 |
| 40724733899 | 10-28 16:18 | f74478783 | main (push) | cancelled | Packaged browser (284 s, 20/54) | timeout | 20.3m | 281 | 1.50 |
| 41047410516 | 10-30 11:20 | 2473cb57c | node-24.22.1 (PR) | failure | Check the complete release inventory (2 s) | "Planning inventory drifted; review changed inputs/dispositions before --record" | 1.0m | - | - |
| 41048173844 | 10-30 11:27 | 356263a69 | node-24.22.1 (PR) | failure | Check the complete release inventory (7 s) | "Execution manifest drifted; review before --record" | 1.2m | - | - |
| 41048971362 | 10-30 11:33 | 263caeada | node-24.22.1 (PR) | cancelled | Packaged browser (517 s, 41/54) | timeout | 20.3m | 218 | 1.10 |
| 41049229307 | 10-30 11:35 | ed4923893 | main (push) | cancelled | Packaged browser (82 s, 14/54) | timeout | 20.3m | 364 | 1.94 |
| 41049546188 | 10-30 11:38 | 714fe2728 | dependabot setup-node-7.1.0 (PR) | cancelled | Packaged browser (74 s, 14/54) | timeout. Checkout took 207 s | 20.3m | 280 | 1.50 |
| 41050456109 | 10-30 11:46 | b0fe91f42 | dependabot npm_and_yarn (PR) | failure | Install locked dependencies (7 s) | ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION: @types/estree 1.0.10, magic-string 1.4.5 and postcss 8.5.32 were too new | 0.6m | - | - |
| 42425248962 | 11-07 23:26 | 24ca73c0a | codex/reduce-goals-context-overhead (PR) | failure | Unit tests (470 s) | all72 timed out (5840 ms) | 12.6m | 470 | 1.95 |
| 42425485009 | 11-07 23:29 | e9ec1e697 | main (push) | cancelled | Packaged browser (362 s, 22/54) | timeout. 1 browser failure before the kill: enrollment-progress "rejected-reply" (29.4 s; log shows "Joining state: locked", "Worker operation could not finish."; no stack because the step was cancelled before the summary) | 20.3m | 288 | 1.13 |
| 42566759458 | 11-09 05:20 | 0216bdcc0 | dependabot pnpm/action-setup-6.1.1 (PR) | failure | Unit tests (485 s) | all72 timed out (5551 ms) | 13.0m | 485 | 2.00 |
| 42703650046 | 11-09 21:33 | e04879704 | codex/record-worker-release-759890ca (PR) | cancelled | Packaged browser (113 s, 15/54) | timeout | 20.3m | 374 | 1.53 |
| 43072060806 | 11-11 17:50 | 6a8de4bac | claude/done-card-ux-patches-1e566a (PR) | cancelled | Packaged browser (529 s, 41/54, all passed) | timeout | 20.2m | 260 | 1.00 |
| 43214467976 | 11-12 12:03 | 3b8394590 | same (PR) | failure | Unit tests (604 s) | all72 timed out (5545 ms) | 13.5m | 604 | 1.73 |

\* Runs before faf465f72 used two file workers, which inflates the index.

All runs are attempt 1. The saved list is the complete CI history since 10-09; `gh run list` returns the same 54 runs. Supersession check: no other run on the same ref started during any cancelled run's lifetime, except 39992803591.

**Browser steps.** Since 10-16, 12 runs were stopped inside the packaged step: 11 by the timeout, plus the superseded 39992803591. 38888505702 passed the packaged step. 39995511985, 40358989317, 40360132185 and 40724349821 were killed before reaching it. Every test that reported before a kill passed, except the one failure in 42425485009. No run since 38888505702 reached "Check development onboarding and service shutdown". Before 10-16 there were no browser steps: 10-09 to 10-14 had only an "Application build" job of about 45 s, and the 09-14/15 "Quality" job ran `pnpm check`. The only green browser-step runs are therefore on 10-16:

| Run | Compiler loading | Packaged (35 tests) | Account setup |
|---|---|---|---|
| 38879680534 | 24 s | 127 s, 35 passed | 199 s, 3 failed / 16 passed |
| 38885857436 | 36 s | 166 s, 35 passed | 146 s, 20 passed |
| 38888505702 | 43 s | 170 s, 35 passed | 144 s, 20 passed |

The 13 `enrollment-*` tests took 427-435 s in total on the fast runners (39992803591, 41048971362, 43072060806), with a maximum of 43 s per test.

## 2. Duration of `test/inboundReceiptViews.test.ts`

The file first exists in CI on 11-07: it was created 11-05, and no CI ran between 10-30 and 11-07. Unit tests have only run in CI since 10-16, so no earlier history exists.

| Run | Date | File (8 tests) | all72 | Speed idx | all72 / idx | Unit step |
|---|---|---|---|---|---|---|
| 42425248962 | 11-07 | 6045 ms | **5840 x** | 1.95 | ~2995 | 470 s |
| 42425485009 | 11-07 | 3197 | 3085 | 1.13 | ~2730 | 288 s |
| 42566759458 | 11-09 | 5754 | **5551 x** | 2.00 | ~2776 | 485 s |
| 42703650046 | 11-09 | 4423 | 4268 | 1.53 | ~2790 | 374 s |
| 43072060806 | 11-11 | 3379 | 3274 | 1.00 | 3274 | 260 s |
| 43214467976 | 11-12 | 5746 | **5545 x** | 1.73 | ~3205 | 604 s |

- The case crossed 5 s on its first slow runner (11-07). It fails when the speed index is above about 1.6.
- 11 of the 22 one-worker runs since 10-16 had an index between 1.73 and 2.06, so about half of hosted runs would fail it.
- The 11-07 PR run (failed, 5840 ms) and the main push 3 minutes later (passed, 3085 ms) carry the same code.
- The unit step itself doubled on 11-12 (260 to 604 s). That run added 14 new files worth 163 s, including oracleReplayWindow (54 s), localBaselineLargeCarrier (48 s) and oversizedActions (42 s), and common files ran 1.7x slower.

## 3. Near-limit cases (Vitest reporter prints file totals and every case ≥300 ms)

**Default 5 s deadline, ≥2.5 s in any failing run.** Values are for 43214467976 / 42566759458 / 42425248962 (all ms):

| Case (file:line at 3b8394590) | 11-12 | 11-09 | 11-07 | worst % of 5 s |
|---|---|---|---|---|
| inboundReceiptViews.test.ts:41 all72 admitted extents | 5545 x | 5551 x | 5840 x | 117% |
| inboundStaleTurnControl.test.ts:4 permanent dense-to-legacy stale-turn negative control | 3340 | 4263 | 4184 | 85% |
| inboundPageCodec.test.ts:26 round trips every contiguous admitted extent for two publishers (same 72-extent loop) | 3317 | 3426 | 3818 | 76% |
| inboundMixedReplay.test.ts:117 seed407 | 3200 | 3653 | 3588 | 73% |
| workspaceAdmission.test.ts:1256 generated master and card selection snapshots (top of 6 parametrizations) | 2738 | 3266 | 3385 | 68% |
| inboundMixedReplay.test.ts:116 seed406 | 2668 | 3138 | 3016 | 63% |
| inboundMixedReaders.test.ts:124 replacement replay mixes both accepted publishers | 2768 | 3032 | 3149 | 63% |
| inboundMixedReplay.test.ts:118 seed408 | 2501 | 2900 | 2870 | 58% |
| preparationReceiptJournal.test.ts all72 bounded extents | 2310 | 2479 | 2736 | 55% |

**Other cases above 3,000 ms all have explicit deadlines, so they are not at risk against 5 s.** In 43214467976 (ms, with deadline):

| Case | ms | Deadline |
|---|---|---|
| localBaselineLargeCarrier draft-4 baseline between ceilings | 32303 | 120 s |
| accountInboundCodec 400 generated signed updates | 12769 | 30 s (43%, the highest share) |
| legacyImportReceipts | 10579 | 60 s |
| accountInboundPrep 300 histories | 10367 | 60 s |
| oversizedActions 200 KiB cases | 6.3-6.5 s | 60 s |
| workspaceAdmission generated account-text / local-snapshots | 6410 / 5531 | 30 s |
| baselineReplayCoverage | 6254 | 240 s |
| historyReplay | 4629 | 30 s |
| yjsDelivery concurrent-handoff | 4589 | 30 s |
| localBaseline generated cuts | 4297 | 30 s |
| legacyImport | 4324 | 60 s |
| historyInstallBound | 4799 | 120 s |
| legacyCoordinator | 3894 | 60 s |
| oracleReplayWindow (11 cases) | 2.9-4.1 s | 60 s |
| legacyCleanup | 3253 | 60 s |

**Files above 3 s in 43214467976 (tests):**

| File | Tests | Time |
|---|---|---|
| oracleReplayWindow | 19 | 54.3 s |
| localBaselineLargeCarrier | 11 | 48.2 s |
| oversizedActions | 286 | 42.1 s |
| workspaceAdmission | 239 | 30.3 s |
| accountInboundCodec | 37 | 14.3 s |
| localBaseline | 43 | 11.4 s |
| accountInboundPrep | 25 | 10.6 s |
| legacyImportReceipts | 1 | 10.6 s |
| yjsDelivery | 5 | 8.9 s |
| inboundMixedReplay | 3 | 8.4 s |
| preparationReceiptJournal | 16 | 7.5 s |
| baselineReplayCoverage | 3 | 7.1 s |
| historyInstallBound | 3 | 6.1 s |
| inboundReceiptViews | 8 | 5.7 s |
| legacyImport | 13 | 5.3 s |
| pendingProjection | 17 | 4.8 s |
| legacyCoordinator | 10 | 4.8 s |
| inboundReplacementPage | 9 | 4.7 s |
| inboundMixedReaders | 3 | 4.6 s |
| historyReplay | 2 | 4.6 s |
| inboundAppendIndex | 7 | 4.6 s |
| legacyCleanup | 11 | 4.3 s |
| inboundMembershipPage | 7 | 4.3 s |
| syncProperties | 17 | 3.9 s |
| localBaselineAnchor | 32 | 3.8 s |
| inboundPageCodec | 12 | 3.7 s |
| inboundStaleTurnControl | 1 | 3.3 s |
| unreducedBaselineExactReuse | 23 | 3.3 s |
| localBaselineWarm | 21 | 3.1 s |

Full lists: `ci/near-43214467976.txt`, `ci/near-42566759458.txt`, `ci/near-42425248962.txt`, `ci/over3000.txt`.

## 4. Repository conventions for test deadlines

- **Config.** No vitest.config.*. `package.json` has `"test": "vitest run"`. The `test:` block in `vite.config.ts` (lines 154-160) sets `maxWorkers: 2`, `environment: 'jsdom'`, `setupFiles: ['./test/setup.ts']` and `include`. It carries the comment "keep each case's concurrency and deadlines unchanged". **It sets no `testTimeout` or `hookTimeout`, so Vitest's defaults apply: 5000 ms per test and 10000 ms per hook.** CI adds `--maxWorkers=1`.
- **Per-test overrides.** There are 82 explicit numeric timeouts in 31 of 352 Vitest files (2,843 `it`/`test` call sites, which expand to 3,675 tests). Values: 60000 x42, 30000 x15, 120000 x12, 300000 x8, 15000 x3, 20000 x1, 240000 x1. Examples:
  - `accountInboundCodec.test.ts:581 }, 30000);`
  - `accountInboundPrep.test.ts:418 }, 60_000);`
  - `baselineReplayCoverage.test.ts:394 }, 240000);`
  - an `it.each` third argument of `30000` (yjsDelivery.test.ts:62-94) and of `60000` (oversizedActions)

  There is no `vi.setConfig` and no `{ timeout: }` test option; the only `{ timeout: 1000 }` is in a `vi.waitFor` at store.test.ts:358. `describe.configure` appears only as Playwright `mode: 'serial'` in test/latency/*.spec.ts.
- **Recorded rules:**
  - ci.yml comment on the unit step, added by faf465f72 on 10-16: "Keep each case's workload and deadline; avoid two heavy files competing on this runner."
  - docs/decisions.md:4757, "2026-10-16 — Keep unit deadlines and exact bytes while bounding hosted contention". It says to "preserve every case workload, the five-second default and the 20-minute job limit". It replaced only five large binary comparison sites in the two timed-out cases with Node's `assert.deepStrictEqual`. Evidence: docs/development-evidence/2026-10-16-hosted-unit-budget/README.md, which notes "The two cases repeatedly compare large Uint8Arrays through the general JavaScript matcher."
  - docs/development.md:219, "Unit-suite resource budget": "Every case and existing case deadline remains". The same section says CI pins Node 24.18.0, which is stale: ci.yml uses 24.22.1.
  - docs/decisions.md:2451 (2026-09-13) gave explicit 60 s limits to five generated properties and says "No automatic retry or deadline increase may turn a failure into credit."
  - docs/decisions.md:2590 (2026-09-13): preserve "individual test deadlines; do not derive a new bound from a passing or failing timing observation."

## 5. Why all72 is expensive, and the commits behind it

**What the case does** (`test/inboundReceiptViews.test.ts:41-79`, unchanged since it was created):

- For publishers A and B it builds `pageFixture(publisher)`: 8 signed entries, each with AES-256-GCM encryption, SHA-256 and two Ed25519 signatures; the request and page are then re-signed. This happens once per publisher, so the crypto cost is small.
- It then loops over all 36 contiguous extents per publisher (first 0-7, count 1 to 8-first), 72 receipts in total. For each one it:
  - builds `referenceBytes(record)`: a 239-byte header plus the request (~0.6 KB) and the page. From the fixture's field sizes, the page holds 8 hex-encoded envelopes of about 320 bytes and 8 proofs of about 390 bytes, so it is about 11.6 KB of JSON.
  - calls `inspectInboundReceipt`. This copies the bytes, parses the request and page JSON once, and runs per-entry structural checks (`checkInboundExtent`, `decodeNetworkEnvelope`, `decodePositionResponse`, the last one again in `entries()`). It verifies no signatures.
- Across those extents there are 240 entry views. For each view the test makes one `toMatchObject` call, two `toBe` identity checks, and **`toEqual` on `event.page` (~11.6 KB) and on `event.request` (~0.6 KB)**.
- In @vitest/expect 4.1.10, `iterableEquality` (node_modules/.pnpm/@vitest+expect@4.1.10/.../dist/index.js:482-575) runs every byte through `equals()`. It then builds `Object.entries()` of both arrays (one [key, value] array per byte) and deep-compares those as well. That comes to about 2.9 M element comparisons plus millions of small allocations.
- This is the same pattern the 10-16 precedent fixed. It is most likely the majority of the ~3.2 s fast-runner cost. I did not profile it, because running tests was ruled out.
- The 76%-of-deadline case `inboundPageCodec.test.ts:26` runs the same 72-extent loop with `toEqual` on bytes and records.

**Commits.** Search covered `git log --follow` on the test, its fixtures, `src/crdt/inboundRecord.ts` and the `account-protocol` modules it calls.

- `6ae3e49ca` (2026-11-05, phase 389) created the test file; nothing has changed it since. Its fixture `test/inbound-page/fixtures.ts` came from `0ffce1265` (2026-11-05, phase 375) and is also unchanged.
- Changes to `src/crdt/inboundRecord.ts` after the test, all committed between 12:08 and 12:09 (+0100) on 2026-11-05, before the first CI run of the case:
  - `6dd4577fe` (390): moved request/page decoding out of the per-entry loop. Each extent now decodes the page once instead of count+1 times, so this made the case **cheaper**.
  - `dcc3087ba` (392): adds one ~12 KB `slice()` copy per receipt, which is negligible.
  - `6c513d352` (391), `caeb14441` (396), `01af3ec77` (398), `c62ee626c` (404) and `19c401d96` (413): scopes, work bounds and owned originals, all off the per-entry path of inspect.
- After 11-05, only `ff8578cd0` (2026-11-11, phase 542) touched this path. It replaced the hex regex plus `unhex` with a single char-code loop (`lowerHexBytes` in account-protocol/recovery.ts and inboundTransport.ts). Only 3b8394590 includes it, and the speed-normalised all72 (~3.2 s) is not above 6a8de4bac's 3.27 s, so it shows no measurable slowdown.
- Conclusion: no commit between 10-16 and 11-12 made the case slower. It was added with a cost that fits only the faster half of hosted runners.

## 6. Not determined

- Runner CPU models. Logs print region and image version only (image ubuntu24/20261101.360 on all November runs), so speed groups are inferred from file durations.
- The exact split of all72's time between `toEqual` and decoding. It was not profiled.
- Real durations of the last 13 packaged tests and of account-setup since the 54-test expansion, because no run reached them. The ~25 min estimate uses 10-16 timings.
- The stack for the 11-07 enrollment-progress "rejected-reply" failure, because the step was cancelled before Playwright's summary.
- Whether the release inventory/manifest drift and the authority census change were re-recorded later. The next run on those branches got past those steps, so presumably yes.
