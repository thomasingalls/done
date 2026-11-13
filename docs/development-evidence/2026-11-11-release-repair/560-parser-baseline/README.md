# Phase 560 — the parser baseline runs as the whole graph at its signed commit

The coordinating session asked on 2026-11-13 for `test/account-parser-conformance/baseline.test.mjs` to be diagnosed and repaired. It had failed since before the release repair. Phase 542's record had said, in one sentence of its limits, that it swaps in a frozen `spoolRecord.ts` from `f0b6acd2` that lacks exports current modules import, that it fails independently and that it is not in CI; that was to be treated as a lead. The repair had to keep the baseline frozen and prove it in the test, change no product code, and leave the inputs, seeds and assertions alone.

Base: phases 557 to 559, tree `3daa3e4d2e07135206df1c50645a721009c01a2d`, uncommitted on commit `bfb512c70`.

## Result

**What the test is for.** It is a differential against a frozen, signed baseline. F-21.1 (2026-09-12, commit `77b0bb623`) found that the parsers accepted a singleton-array promotion stage and spool source hash, singleton-array Account index fields, and sparse credential, genesis actor and wrap arrays. It repaired four files. The test shows that the parsers at the parent commit `f0b6acd2` accept those inputs, that the original generated failures still fail and shrink to one-element arrays against them, and that the current parsers refuse the same inputs.

**What failed, and why.** The loader built the current parser graph and replaced the four repaired files with their `f0b6acd2` text. On 2026-09-12 those four were the only files that differed between the two commits, so the result was the old code: all 33 modules the old parsers use match `f0b6acd2` at `77b0bb623` except exactly those four ([frozen-graph.txt](./frozen-graph.txt)). Each later change to a module in the graph moved the "old" side away from the old code. The test kept passing for a month while that happened. Then:
- **The build broke at `f89ee3f9d`** (2026-10-13, "Prepare private history retention outside the input queue", merged on 2026-10-14 in PR #54). `deliveryRecord.ts` began importing `inspectSpoolSteps` from `spoolRecord.ts`, and the frozen `spoolRecord.ts` does not export it ([bisect.txt](./bisect.txt)).
- **By the base it failed with twelve missing exports** from six current modules ([base-tree-run.txt](./base-tree-run.txt)): `deliveryRecord`, `accountSyncState`, `localBaselineShadow`, `localBaselineReplay`, `accountEnvelopePreparation` and `incrementalAccountLedger`. Between them they import `inspectSpoolSteps`, `positionSources`, `nextSpoolPosition`, `MAX_POSITION_SOURCES` and `MAX_POSITION_BYTES`.
- **The graph had grown** from 34 modules to 177, and 17 of the 33 modules the old parsers use had changed. The missing exports were only the part that failed loudly.

Phase 542's sentence was right about the loud symptom. The cause is the overlay design: four old files among current modules. The failure dates from 2026-10-13, well before phase 542.

**The repair.** `loadBaseline` now builds the same entry with every repository module read from `f0b6acd2`. That is the four parser files together with the 29 unchanged modules they shipped with. They come from Git objects, in memory; nothing is checked out or written. The loader refuses:
- any loaded file whose text is not byte-identical to its blob at that commit (the Git blob id of the exact text handed to the bundler is compared with the commit's tree);
- any module from outside that tree, apart from the shared entry `runtime.ts` and npm packages;
- any npm package the graph reaches, yjs included, at a version that commit's `pnpm-lock.yaml` does not name, and a yjs patch that differs from the one that lockfile records.

Git replacement objects are ignored, so the baseline is the objects the commit id names. No frozen file is patched and nothing is stubbed. The current side (`load()`), the inputs, the seeds and every existing assertion are unchanged.

**It is the old code.** The repaired test reproduces the three reports it wrote on 2026-09-12 byte for byte: the fast-check result of each property, its counterexample, path, shrink count and error text, and the shapes list ([reports-compare.txt](./reports-compare.txt)). Every npm package in the frozen graph is at the same locked version in the base lockfile, with the same yjs patch hash. Only `y-protocols` 1.0.7's awareness module survives tree-shaking into the bundle, and yjs stays external as before.

**One case added.** "frozen baseline refuses a loaded file that differs by one byte from the signed commit" turns one space of `spoolRecord.ts` into a tab as it is loaded. That is still the same TypeScript, so only the identity check can refuse it, and the case requires the loader to reject it. The file now has 4 cases.

## What runs differently

- **The old side** runs on the complete parser graph at `f0b6acd2` (33 modules), not on four `f0b6acd2` files inside the current graph (176 modules at the base). It is the graph the test ran on when it was written.
- **The loader checks** each frozen file's bytes, the graph's closure and the reached packages' locked versions on every baseline load. The baseline file now takes about 1 to 1.5 s; the new case accounts for about 0.55 s of that.
- **The current side is unchanged.** It runs on the same inputs, with the same seeds (112101, 112104), 250 runs per property and the same assertions.
- **No check is weakened, narrowed, skipped or run less often.** No product code, stored format, wire message, limit or recorded decision changes.

## Controls

[controls.txt](./controls.txt), script [controls.py.txt](./controls.py.txt). Each control runs a copy of the test, and of `helpers.mjs` where stated, with one change. The repository is not modified. The copies load the same oracles, Vite and Yjs files as the originals. Case order: promotion, spool, shapes, one-byte.

| Control | Change | Outcome |
|---|---|---|
| base text | the phase 559 loader and test | file fails: the overlay does not build (missing exports) |
| unchanged copy | none | 4 pass |
| current side is the frozen graph | `real = await loadBaseline()` | promotion, spool and shapes fail ("Missing expected exception"); one-byte passes |
| frozen side is the current graph | `old = await load()` | promotion and spool fail (the property never fails: `false !== true`); shapes fails ("Malformed preparation") |
| promotion stage guard removed | `real = await load('promotion')` | promotion fails; the other three pass |
| spool hash guard removed | `load('spool')` | spool fails; the other three pass |
| credentials `Array.from` removed | `load('credentials')` | shapes fails at credentials |
| genesis actors `Array.from` removed | `load('actors')` | shapes fails at actors |
| genesis wraps `Array.from` removed | `load('wraps')` | shapes fails at wraps |
| `promotionId` string check removed | `load('promotionId')` | shapes fails at promotionId |
| `requestDigest` string check removed | `load('requestDigest')` | shapes fails at requestDigest |
| `epochHead` string check removed | `load('epochHead')` | shapes fails at epochHead |
| identity check removed | `if (false) throw` in the loader | one-byte fails ("Missing expected rejection"); the other three pass |
| graph escape | `src/crdt/storeName.ts` resolved to the checkout | file refused: "baseline bundle reached a module outside f0b6acd2…" |
| package not locked | `y-protocols@1.0.7` absent from the baseline lockfile | file refused: "y-protocols@1.0.7 is not locked at f0b6acd2…" |
| yjs patch differs | patch hash changed in the baseline lockfile | file refused: "yjs patch" |

In the shapes controls the failure message names the field: the copy adds the field name to the one `assert.throws` call, and that is its only other change. Each of the eight current-side guards the file covers trips its own case and no other. That is the effect of every mutation in `helpers.mjs`'s `controls` that this file's inputs reach. The other four (`admission`, `source`, `delivery`, `submission`) are covered by `controls.test.mjs`, not by this file.

## The suite, file by file

`pnpm account:parser-conformance` on the phase 560 test files passed: 47 stages in 3 min 51 s, and 2,104 source pins re-verified after the run ([campaign.txt](./campaign.txt)). It ran before the four registration files and the design note below were edited; none of those is a test the campaign runs.

| Stage | File | Cases |
|---|---|---|
| parser | `test/account-parser-conformance/baseline.test.mjs` | 4 passed |
| parser | `test/account-parser-conformance/controls.test.mjs` | 12 passed |
| parser | `test/account-parser-conformance/objects.test.mjs` | 7 passed |
| parser | `test/account-parser-conformance/submission.test.mjs` | 3 passed |
| parser | `test/account-parser-conformance/wires.test.mjs` | 8 passed |
| parser-native | `test/account-parser-conformance/native.test.mjs` | 1 passed (Chromium) |
| registry | `account-first-authority/registry`, `account-crypto-prep/contracts` | 12 + 1 passed |
| first-authority | `account-first-authority/formats` | 6 passed |
| promotion-contract | `account-promotion-contract/formats`, `native` | 7 + 3 passed |
| ledger-contract | `account-ledger-contract/formats`, `controls` | 7 + 5 passed |
| transport-contract | `account-transport-contract/formats`, `controls` | 9 + 4 passed |
| admission-core | `account-admission/core` | 12 passed |
| genesis | `account-genesis/crypto`, `native` | 3 + 14 passed |
| spool | `account-spool/native` | 24 passed |
| unit | `accountDelivery`, `ownedStartup`, `sourceCapture`, `spoolRecord` (Vitest) | 12 + 27 + 9 + 6 passed |
| inventory, authority, typecheck, 31 vector commands, lint, format | | all exit 0 |

No other file in the suite fails.

## Where the suite is registered

- **Release policy.** `account:parser-conformance` is in `scripts/release-validation/policy.json`'s required package commands; the graph records it as not reached from `pnpm check`.
- **Release inventory.** The five Node files are in the `oracle-parser-fixtures` selection and `native.test.mjs` is in `parser-conformance-native-fixture`. The baseline stage expects its cases to pass and pins the four parser files at `f0b6acd2` as history inputs. A release execution of that selection would have failed since 2026-10-13. Release qualification is paused, so none ran.
- **CI.** Not run. CI's "Check release execution adapters" step runs `test/release-validation/account-fixtures.test.mjs`, which checks the files' registration and pins but executes none of them.
- **docs/development.md.** Not named. Its release bookkeeping section points at the CI contract checks and the inventory.

So "not in CI" was right, but the suite is in the release inventory, and the inventory expected these cases to pass. Adding it to CI is held as TEST-PARSER-CI.

## Other frozen-source tests with the same weakness

A build-only survey ([survey.txt](./survey.txt), probe [swap-probe.mjs.txt](./swap-probe.mjs.txt)) rebuilt each overlay fixture's entry with its swap:
- **`test/account-ledger-contract/source-census.test.mjs` fails today.** Its `repeatedSourceReader` swaps `4bcac419`'s `spoolRecord.ts` into the current graph, which lacks `inspectSpoolSteps` and `nextSpoolPosition`. The file is blocked in the inventory, so no selection runs it.
- **The handoff fixture's `HANDOFF_SLOT_BASELINE=1` path no longer builds.** `beed8cf`'s `slotUnlock.ts` lacks `verifySessionSlotUnlock` and `verifyRecoverySlotUnlock`. It runs only when the variable is set.
- **Seven old-reader overlays of `promotionRecord.ts` still build:** the genesis, admission, editing, handoff, spool, capture and delivery native fixtures, at `a4e1c15`, `280f616`, `649925f`, `beed8cf`, `7210b7d`, `18ceb40` and `81a4655`. Each runs one old file among current modules, so a build that succeeds does not show that the old reader behaves as it did.
- **Workarounds and the whole-graph loader.** The ledger `oldBatchReader` builds the old `spoolRecord.ts` alone as its entry, a workaround for the same problem. The receive, sync and admission-bounds fixtures already use `scripts/lib/historical-bundle.mjs`, which builds the whole graph at the pinned commit.
- **Not probed:** the local-baseline reader rollout, and the service-side tests that write an old file next to current modules.

None of these was changed. They are held as TEST-FROZEN-OVERLAYS.

**Why not `historical-bundle.mjs` here.** It archives the commit into `test-results/`. It bundles yjs inside the reader and returns a browser `Harness` wrapper. This test runs in Node, shares the caller's yjs (`external`) and builds in memory. The new loader keeps all three, checks Git blob identities directly, and checks locked versions per package rather than declared ranges.

## Bookkeeping

Following [development.md](../../../development.md#release-bookkeeping); details in [evidence.json](./evidence.json).

**Registration.** The baseline stage now expects 4 cases. The counts move as follows:
- the parser selection's total, from 46 to 47 (`test/release-validation/account-fixtures.test.mjs`);
- the baseline entry in the per-file Account fixture list, from 3 to 4;
- the Account fixture selection, from 714 to 715, and its 122 Node files, from 702 to 703 (the test title says 703);
- the general-test case denominator, from 3,091 to 3,092 (`general-tests.test.mjs`, its title and `generated-tests.test.mjs`).

The baseline's history pins are unchanged (the four parser files).

**Planning inventory.** Recorded with `check.mjs --record` and `plan.mjs --record`, three times, after reviewing each drift. The first drift was the baseline file's declarations, from 2 to 3, and the hashes of `helpers.mjs`, `baseline.test.mjs` and `account-fixtures.test.mjs`, with the baseline row's expected cases. The second was the three release-validation test hashes and two case titles. The third was `account-fixtures.test.mjs`'s hash. Obligations stay at 1,136 and unresolved at 561.

**Runtime census and construction registry.** Not affected: no file under `src`, `account-protocol` or `account-service` changed. The campaign's census stage passed.

**Design note.** `docs/account-parser-conformance.md` says the baseline is now the whole graph at the commit.

**Decision and notes.** A 2026-11-13 entry in `docs/decisions.md` records the repair and amends nothing. The seat section of `docs/progress.md` now carries phase 560. TEST-PARSER-CI and TEST-FROZEN-OVERLAYS are added under "Held from the release repair" in `docs/product-backlog.md`.

## Runs

- The baseline file on the base text (failed: the build), and on the final text (4 passed), the second time with `ACCOUNT_REPORT_DIR` set so the reports could be compared with the 2026-09-12 records.
- The sixteen controls above.
- `pnpm account:parser-conformance` (passed).
- The overlay bisection and the survey (builds only).
- `test/account-ledger-contract/source-census.test.mjs` (failed, as described).
- After the registration edits:
  - `oxfmt --check` and `oxlint` on the five changed test files;
  - `check.mjs` and `plan.mjs`;
  - `pnpm validation:inventory` (10 passed);
  - CI's release execution adapter files (178 passed);
  - the ten CI contract checks (`vectors:check` to `wasm:verify`, all exit 0);
  - the typecheck (`tsc -b --noEmit`, passed);
  - `pnpm trace:check`, after the contract checks: one failure, `check-origin-isolation.mjs`'s receipt, which was written against an earlier tree. That gate runs inside `pnpm build`. Editing this record afterwards makes every receipt stale again, so they need minting on the final tree.

Not run: the full unit suite and `pnpm build`.

## At review

The coordinating session read the loader and the added case on 2026-11-13 and ran the following on the final tree.

- **Full unit suite:** 359 files, 3,746 cases passed, 1 skipped, none failed. The count is unchanged because the changed files are Node tests. No other test process was running when it started.
- **The repaired file:** 4 of 4 pass. The five Node files of the parser stage were run again after the record was written (see the commit message for the counts).
- **Its own control:** the loader was driven directly with a one-byte change (a space to a tab) to each of eight frozen modules in turn: four of the 29 outside the parser files, and the four parser files. All eight were refused with the identity error; an unchanged load reads 33 frozen modules.
- **The baseline commit:** Git reports a good signature on `f0b6acd2` in this checkout, and the commit is an ancestor of the branch.
- Also run: typecheck, build, contract and bookkeeping checks, the history, service delivery and service inbound node tests, and the CI session, authority and quarantine steps.

## Not verified

- **Whether the differential still passed between 2026-09-12 and 2026-10-13.** The bisection looked only for when the overlay stopped building. It did not check whether the assertions held while it still built.
- **The signature on `f0b6acd2`.** The test pins the commit by id; it does not verify the signature, which depends on local signer configuration.
- **The installed packages themselves.** The loader checks that each package's installed version is one the baseline lockfile names, and that the yjs patch hash is the same. It does not check that `node_modules` matches the current lockfile.
- **The seven `promotionRecord.ts` overlays.** They build, but no test body was run against a whole-graph baseline to see whether their old readers still behave as they did.
