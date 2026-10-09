# Account UI integration at ea3a3ffb

2026-09-16. Integrated `codex/first-device-account-setup` (`ea3a3ffb`) locally on
signed ceremony primitives `0e7a88f8`. The three source commits are `9ba1e5aa`, `7dab01cc` and
`ea3a3ffb`, based on `d942cd1c`. Merge applied without conflicts. No personal preview database,
browser profile or server was used or upgraded. Release validation remains paused.

## Focused result

- All 12 distinct Account setup/browser cases pass. The first isolated-service run passed 11/12;
  its private-file refusal case used a hardcoded `.dev/account-setup-browser-tests` path even though
  the test override moved the service elsewhere. The nonexistent path returned the application's
  fallback page. Rerunning that unchanged case with its expected freshly created test directory
  passed all three private-file refusals. Both logs are retained; no runtime change was needed.
- One browser upgrade case passes from an archived `7dab01cc` schema-five checkout to the merged
  schema-seven service. It compares retained database rows/columns and authority bytes, then
  reopens the same writing/name with the original device code and virtual passkey and verifies
  the same account online. Upgrade retry is a no-op; ordinary startup refuses implicit migration.
- Five Node maintenance tests and one native recovery test pass, including committed WAL backup,
  live-preview exclusion, transactional failure, separate per-slot progress and legacy progress.
- Two affected Local startup browser regressions pass.
- 41 ceremony/registry tests pass. Typechecking, scoped lint/format, current crypto census and
  diff checks pass. The new upgrade Playwright configuration is included in node typechecking.

Current inventory has 186 sources, 100 labels/templates, 25 groups and 14 manual entrypoints.
Historical vectors, prior campaign evidence and frozen release inventories are unchanged.
The private preview remains without a sync driver; account verification does not grant content
access to a device created elsewhere. Its setup UI complements the pending ceremony backend.

## Commands

```sh
node node_modules/@playwright/test/cli.js test --config playwright.account-setup.config.ts
ACCOUNT_SETUP_UPGRADE_BASE=/path/to/disposable/schema-five-checkout node node_modules/@playwright/test/cli.js test --config playwright.account-upgrade.config.ts
node --test --test-timeout=90000 test/first-device-upgrade/state.test.mjs test/account-recovery/native.test.mjs
node node_modules/@playwright/test/cli.js test --config playwright.local-startup.config.ts test/local-app/startup.spec.ts --grep 'confirmation is required|verified content opens'
node --test --test-timeout=30000 test/account-ceremony/*.test.mjs test/account-first-authority/registry.test.mjs
node node_modules/typescript/bin/tsc -b --noEmit
```

The initial setup command used an ignored temporary config extending the checked-in config with
a fresh test state/output directory; the private-file rerun used the checked-in config directly.
The baseline archive shared installed dependencies with this checkout. A syntax error in constructing
the temporary config prevented its first launch; it was corrected before any browser tests ran.
The typecheck log is empty on success. No physical-authenticator coverage or release qualification
is claimed. Inputs are pinned in `inputs.json`; compressed logs contain synthetic test evidence only.
