# Phase 561 — six stale browser tests wait for, and inject into, the right place

The coordinating session asked on 2026-11-13 for six browser tests that went stale in October to be repaired, test-only, after a read-only investigation diagnosed eight failing browser tests and the state of CI. The investigation is filed here as [investigation.md](./investigation.md), and its CI history as [ci-history.md](./ci-history.md), each unchanged apart from a first line. `test/packaged-account/removal-regressions.spec.ts` fails on a product defect and was to be left as it is.

Base: phases 557 to 560, tree `619798eacad4be6fb68731fa93b6e436cbe38d62`, uncommitted on commit `bfb512c70`.

## Result

### `test/first-device-setup/setup.spec.ts`: four cases that timed out

The cases at base lines 210, 284, 962 and 1031 open the Account section right after loading the page, then click "Use another account".

- `openMenuSection` (`test/geometry/openApp.ts`, since `dc8f09727`) starts with `if (!(await menu.count())) return;`. A count does not wait. Startup goes through a Worker, so React mounts the shell after the load event, and the count is 0.
- Since phase 40 (`81c75e93b`, 2026-10-23) every menu section starts closed, and "Use another account" lives inside the closed Account section.
- So each case waited out its 90 s on that click. On the base text all four do, at the click (base-tree-run.txt). The page snapshot at the timeout shows the menu rendered with all four sections closed.

Each case now waits for `.shell` to be visible before `openMenuSection`. That is the pattern `d1c2784be` used on 2026-10-23 for three packaged specs ("wait for the existing writing shell before opening a collapsed sidebar section"), and the one this file's own Back-navigation case already uses. `#menu` is the first child of `.shell` in the same render (`src/ui/App.tsx`), so once the shell is visible the menu is mounted and the helper opens the section. The shared helper is unchanged: it also serves the unlock, recovery and account-choice screens, which have no `#menu`, and returning early is right there.

### `setup.spec.ts`: the case that asserted a hidden note

The case at base line 486 ends by asserting "Account connected. Approved devices can sync writing." is visible. That note is in the Sync section (`src/ui/Menu.tsx`, inside `<MenuSection title="Sync">`), which is closed after the case's offline reopen; on the base text the locator resolves and stays hidden. The case now calls `openMenuSection(page, 'Sync')` before that assertion.

### `test/packaged-account/welcome.spec.ts`: the interrupted protection transition

"an interrupted protection transition resumes after reload with the saved code" (base line 252) simulates a refused deletion of the source database during protection by patching the page's `indexedDB.deleteDatabase`. Since phase 226 (`98de7c303`, 2026-10-29) `LocalApp` uses `createWorkerLocalStartupRuntime`, and protection (`protectLocalWorkspace`, `src/crdt/localProtection.ts`) runs in the `localStartup` dedicated Worker, which has its own `indexedDB`. The patch never fired, protection completed, and the case failed at its first "Finish enabling protection" expectation.

The case now injects the same one-shot refusal into the Worker:

- After the writing is added, where the page patch used to be installed, a Playwright route on `/localStartup.worker-*.js` fetches the real script and serves it with the refusal prepended, for the first such request only. Later requests pass through unchanged.
- The case runs without a service worker: `test.use({ serviceWorkers: 'block' })` in an anonymous `test.describe` around this one case, as `bootstrap-compatibility.spec.ts` already does for its routed fixture. The title is unchanged.

**Why the service worker is blocked.** An active precache worker answers dedicated Worker script requests from its own cache, and a route never sees them. A probe of the base flow showed the script for the Worker protection opens reaching the network only because the service worker was still installing; about 150 ms later the next Worker's script came from the service worker. Two controls show it: with the service worker allowed and awaited before arming, the script is served from its cache, unpatched, and the case fails at the first expectation; allowed and not awaited, it passed once, by the margin of the service worker's installation. That is a race, so the case blocks it.

**Why the injection is deterministic.**
- With no service worker, every Worker script request reaches the network, where the page's route intercepts it (shown in the instrumented run: the script was routed, not served from a service worker).
- The route is installed, and awaited, before the click that starts the protecting Worker, so that Worker's script request is intercepted.
- The refusal is the first code in the script. In the build the Worker is one IIFE bundle, so the patch runs before any of its code. It would also run before any message is handled if the bundle were an ES module with imports, since messages are delivered only after the script has run.
- `protectLocalWorkspace` looks up `indexedDB.deleteDatabase` when it calls it; nothing captures it earlier.
- The protecting Worker is the first `localStartup` Worker started after the writing is added: the startup Worker is released when the workspace opens, and the next one is created by `protect`. The instrumented run shows exactly one patched Worker, started after "Confirm and protect" and closed by the reload, and an unpatched one after it. If another Worker took the patch first, the case would fail at its first expectation rather than pass.

The case proves what it proved before: an interrupted protection transition shows "Finish enabling protection", survives a reload, and finishes with the saved code. Its assertions are unchanged. The refusal's body is the old page patch, as a named function the route stringifies.

## What runs differently

- `welcome.spec.ts` › "an interrupted protection transition…" runs without a service worker. The old form ran with the precache worker installing in the background and, after the reload, serving the page. Protection and its resume do not use the service worker; it only serves static files.
- The refusal is in the first `localStartup` Worker started after the writing is added, instead of the page realm. In both forms it refuses the first matching deletion once in one realm, and the reload discards it.
- The four setup cases wait for `.shell` before their first menu action, and the fifth opens Sync before its last assertion.
- No assertion, deadline or retry changes. No case is added, removed or skipped. No product code, stored format, wire message, limit or recorded decision changes. `test/geometry/openApp.ts` and `removal-regressions.spec.ts` are unchanged.

## Controls

[controls.txt](./controls.txt); the copies were written by [make_controls.py.txt](./make_controls.py.txt). Each runs a copy of `welcome.spec.ts` with one change (and absolute imports), filtered to this case, against the same `dist/`. The repository is not modified.

| Control | Change | Outcome |
|---|---|---|
| unchanged copy | none | passes |
| base text | the old page-realm patch, service worker allowed | fails at the first "Finish enabling protection" (protection completes) |
| injection removed | the route deleted | fails at the first "Finish enabling protection" |
| page realm only, service worker blocked | the old page patch in place of the route | fails at the first "Finish enabling protection" |
| service worker allowed and awaited | `serviceWorkers: 'block'` removed; `navigator.serviceWorker.ready` awaited before arming | fails at the first "Finish enabling protection"; the script came from the service worker, unpatched |
| service worker allowed, not awaited | `serviceWorkers: 'block'` removed | passed in the one run (the service worker was still installing) — the race the block removes |
| permanent refusal | every `localStartup` Worker patched, every matching deletion refused | passes both "Finish enabling protection" expectations; after the code is entered the page shows "Could not open your workspace" ("Browser storage is unavailable or setup did not finish"), and the case fails at the writing check |
| one refusal in every Worker | the one-shot patch on every `localStartup` Worker | fails at the writing check: the resume deletes again, in a new Worker |
| permanent in the first Worker only | every matching deletion refused, in the first patched Worker only | passes: the resume runs in a new, unpatched Worker after the reload |

The last two show that the final expectations depend on the resume's own deletion succeeding.

## Runs

Every browser run was bounded with `timeout`, run one at a time, and preceded by a check for other Playwright, Vitest or `node --test` processes ([overlap.log](./overlap.log)). Results are in [runs.txt](./runs.txt) and [base-tree-run.txt](./base-tree-run.txt).

| Case (base line → final line) | Base text | Final, alone, three rounds | Whole suite |
|---|---|---|---|
| setup :210 → :210 "password-manager app switching…" | fails: 90 s timeout at "Use another account" | 3 of 3 pass (4.7 to 4.9 s) | passes |
| setup :284 → :285 "homepage opens the app…" | fails: 90 s timeout at "Use another account" | 3 of 3 pass (9.1 to 9.2 s) | passes |
| setup :486 → :488 "existing writing survives…offline Account reopen" | fails: the Sync note resolves and stays hidden | 3 of 3 pass (9.6 to 9.7 s) | passes |
| setup :962 → :965 "browser Back redisplays recovery…" | fails: 90 s timeout at "Use another account" | 3 of 3 pass (5.1 to 5.2 s) | passes |
| setup :1031 → :1035 "Back during registration drains the owner…" | fails: 90 s timeout at "Use another account" | 3 of 3 pass (4.5 to 4.6 s) | passes |
| welcome :252 → :272 "an interrupted protection transition…" | fails at the first "Finish enabling protection" | 3 of 3 pass (2.2 s) | passes |

- **`pnpm test:account-setup`**, exactly as CI runs it: 20 passed, none failed (1.7 min).
- **CI's packaged browser step**, the exact command in `.github/workflows/ci.yml`: 52 passed, 2 failed (10.0 min). The two failures are `removal-regressions.spec.ts`'s variants, at their alert expectation, as expected. Playwright runs the files alphabetically, so they are tests 45 and 46 of 54 and `welcome.spec.ts` is 47 to 54.
- The base runs used copies of the base text in scratch with absolute imports, and for `setup.spec.ts` a scratch copy of its config with the same server, port, timeout and viewport.
- `dist/` was not rebuilt. It was built at 06:33Z and carries phase 559's hex routine (one marker checked). The nine product files phases 557 to 559 change were rewritten at 07:05Z, after the build, but their text equals the base, and this phase changed no product file.
- Other processes: before the first probe another project's Playwright run (certo) had just started and was gone at the next check; before every other run there was none. Two long-lived done services from other worktrees listen on 127.0.0.1:53219 and 53220; these suites use 53211, 53221 and 53222. Nothing of this phase is left running.
- The CI-exact runs wrote `test-results/account-setup` and `test-results/packaged-account` in the checkout, replacing the coordinating session's results from 07:04Z and 07:05Z; copies of its two `results.json` files were kept in the scratch folder.

## The investigation: what this phase checked

Checked against the code or a run:
- the helper's early return and its origin in `dc8f09727`; phase 40 (`81c75e93b`) closing the sections; `#menu` rendered as the shell's first child;
- the four timeouts and the hidden Sync note, on the base text (base-tree-run.txt), with the page snapshot showing the sections closed;
- the note's place in the Sync section of `src/ui/Menu.tsx`;
- `98de7c303` switching `LocalApp` to `createWorkerLocalStartupRuntime`, and the deletion in `src/crdt/localProtection.ts` running in the `localStartup` Worker;
- that the page-only injection fails and a Worker injection gives "Finish enabling protection", survives a reload and completes with the saved code;
- for SETUP-CLOSING-STUCK: the closing copy in `src/account/firstDeviceSetup.ts`, `src/ui/firstDeviceSetupWorker.ts` and `src/ui/AccountSetupApp.tsx`; `onSlotRetirement` and the `done/slot-lifecycle` channel in `src/crdt/runtimePorts.ts`; enrollment, recovery and setup all using `createWindowCeremonyUi`; phase 230's record of the "forever-closing presentation"; the test's page-only `BroadcastChannel` patch;
- for CI-UNIT-BUDGET: the case's two `toEqual` byte comparisons (`test/inboundReceiptViews.test.ts:74-75`), no `testTimeout` in `vite.config.ts`, the 2026-10-16 decision's wording, and `timeout-minutes: 20` in `ci.yml`.

Taken on trust (not re-run in this phase):
- the bisection results (`faf465f72`, `fa26d5225`, `81c75e93b`, `dc8f09727`, `700087b07`, `98de7c303`, main) and the trace timings;
- the removal-regressions mechanism beyond the code read above: that the window never calls `fail()` or `drain()` in 20 s, the 90 s watch, and what Back and a reload show;
- every CI figure (runner speeds, run outcomes, step durations, the 41 of 54 cut, the 25-minute estimate) and the all72 timings, including 98% of the case in `toEqual` and 56 to 60 ms under strict equality;
- that Node 26 against 24.22.1 is not a factor.

Corrections to the investigation: none of substance. Its suggested repair for the welcome case, routing the Worker's script, is right, but routing alone is not deterministic while the precache service worker is allowed; see above.

## Left failing

`removal-regressions.spec.ts` › "a delayed registration reply cannot recreate removed setup", both variants, is unchanged and still fails, at its alert expectation. By the investigation, the setup tab stays on "Locking and finishing storage operations…" after local data is removed in another tab. It is held as SETUP-CLOSING-STUCK (*decision*) in `docs/product-backlog.md`.

## Bookkeeping

Following [development.md](../../../development.md#release-bookkeeping); details in [evidence.json](./evidence.json).

**Planning inventory.** `check.mjs --record`, once, after reviewing the drift: exactly two rows changed, the hashes of `setup.spec.ts` (`210039ef…` to `ae349193…`) and `welcome.spec.ts` (`a78f63bf…` to `661e9f43…`). Their declaration counts stay at 20 and 7: the census counts `test`, `it` and `describe` calls, and `test.describe` and `test.use` are neither. `plan.mjs --record` then changed only the manifest's `inventoryDigest`. Obligations stay at 1,136 and unresolved at 561. Both files stay blocked in the manifest pending review of their runtime denominator.

**Registered counts.** None moves. No Vitest or Node case changed, and no Playwright adapter (`test/release-validation/playwright.test.mjs` and the rest) registers a count for either file. The general-test case denominator stays at 3,092. `test/geometry/openApp.ts` is unchanged.

**Runtime census and construction registry.** Not affected: no file under `src`, `account-protocol` or `account-service` changed.

**Decision and notes.** A 2026-11-13 entry in `docs/decisions.md` records the repair and amends nothing. The seat section of `docs/progress.md` carries phase 561 and states the browser suites' and CI's state. SETUP-CLOSING-STUCK (*decision*) is added under "Worker and page boundaries", and CI-UNIT-BUDGET and CI-JOB-LIMIT (*decision*) under a new "Continuous integration" subsection, in `docs/product-backlog.md` under "Held from the release repair". No existing item was made wrong, so none was changed.

**Checks after the edits.** `oxfmt --check` and `oxlint --react-plugin` on the two specs; `check.mjs` and `plan.mjs`; `pnpm validation:inventory` (10 passed); CI's release execution adapter files (178 passed); the typecheck (`tsc -b --noEmit`); the ten CI contract checks (`vectors:check` to `wasm:verify`, all exit 0). `pnpm trace:check`, last: 6 failures, each a receipt written against an earlier state of the tree. Five are contract gates this phase ran at 08:46Z, before the records were finished (`check-debts`, `check-retention`, `check-selection-status`, `check-update-limit`, `check-wasm-seal`); the sixth is `check-origin-isolation`, which runs inside `pnpm build` (06:33Z). Every receipt needs minting on the final tree.

Not run: the full unit suite and `pnpm build`.

## At review

The coordinating session found the eight failures with a local run of CI's remaining steps on the phase 560 tree, and ruled out phases 557 to 560 before the investigation: with the nine product files those phases touch put back to their phase 556 text, `setup.spec.ts` :486 failed the same way. It read both spec diffs on 2026-11-13 and ran the following on the final tree.

- **`pnpm test:account-setup`:** 20 of 20 pass.
- **CI's packaged step, the exact command:** 52 of 54 pass. The two failures are `removal-regressions.spec.ts` :6, both variants, at the alert expectation.
- **Full unit suite:** 359 files, 3,746 cases passed, 1 skipped, none failed.
- **Overlap.** Another project's Playwright run (Google Chrome, other ports) was in its first minute when the account-setup suite started. Nothing else was running for the packaged step or the unit suite.
- Also run: typecheck, build, contract and bookkeeping checks, the history, service delivery and service inbound node tests, and the CI session, authority and quarantine steps.

Not repeated at review: the controls on the welcome case, and the investigation's by-hand reproduction of the removal defect. The stuck closing screen itself was seen in the coordinating session's own runs of the removal test.

## Not verified

- Whether the device enrollment and recovery ceremonies show the same stuck closing screen (SETUP-CLOSING-STUCK).
- Any figure in CI-UNIT-BUDGET or CI-JOB-LIMIT; this phase ran no CI and did not time the unit case.
- The repaired cases under Node 24.22.1 or on Linux; every run here was Node 26.13.1 on this Mac with Playwright 1.62.0's Chromium.
- The welcome case's mechanism if the build emitted the Worker as an ES module with imports; the argument above covers it, but only the IIFE build was run.
