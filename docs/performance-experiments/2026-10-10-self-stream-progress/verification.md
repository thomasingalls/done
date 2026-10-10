# Focused verification — 2026-10-10

These are observed tool-run results, recorded as a summary rather than raw test transcripts.
No generalized campaign, mutation suite or release-validation gate was run.

| Check | Result |
| --- | --- |
| `accountSelfReceive`, `accountReceiveLedger`, `accountDelivery`, `accountSyncDriver`, `accountReceiveDriver` Vitest files | 45 tests passed; includes 35 generated insert/delete histories |
| `test/account-membership/generations.test.mjs` | 3 tests passed; includes acceptance/source reconstruction across rotation |
| Nine selected `test/account-sync/native.test.mjs` cases, run in focused subsets | All passed |
| Two packaged-account history journeys | 2 passed |
| TypeScript project check | Passed |
| oxlint on the six changed source/test files | Passed |
| Yjs patch/pin/runtime check | Passed |
| Packaged Vite build | Passed |

The nine selected native cases are ordinary submit progress without self content readback;
lost submit reply reconciled through the delivery ledger; submission and response commit aborts;
renderer death after acceptance commits; unavailable reconciliation followed by exact cold retry;
a held empty-self-page signature check that does not block editor admission; retained signed
conflict; and legacy self-inbound evidence across new submissions, compaction and cold open.

The packaged cases are `two native device owners independently admit snapshots and keep two-way delivery` and
`a returning editor installs admitted cuts after service pruning and keeps its local writing`. They exercise
actual peer delivery, independent snapshot verification, interrupted installation, offline reopen,
and service pruning. Existing product behavior outside this bounded change was not requalified.

Reproduction commands (run from the repository root with its installed dependencies):

```sh
node node_modules/vitest/vitest.mjs run test/accountSelfReceive.test.ts test/accountReceiveLedger.test.ts test/accountDelivery.test.ts test/accountSyncDriver.test.ts test/accountReceiveDriver.test.ts --maxWorkers=2
node --test test/account-membership/generations.test.mjs
node --test --test-name-pattern='one owner advances|lost submit answer|native (submission|response) abort|acceptance committed|lost reply and unavailable|verifying an empty self|retained signed receive conflict|legacy self-inbound' test/account-sync/native.test.mjs
node node_modules/@playwright/test/cli.js test --config playwright.packaged-account.config.ts test/packaged-account/history.spec.ts --grep 'two native device owners|returning editor'
node node_modules/typescript/bin/tsc -b --noEmit
node node_modules/oxlint/bin/oxlint --react-plugin src/crdt/accountReceive.ts src/crdt/accountSyncState.ts test/accountSelfReceive.test.ts test/account-sync/native.test.mjs test/account-membership/generations-entry.ts test/account-membership/generations.test.mjs
node scripts/check-yjs-patch.mjs
node node_modules/vite/bin/vite.js build
```

The generation fixture initially failed to load after its new imports caused the bundler to emit
multiple chunks. It now uses the existing history fixture's single-chunk bundling option. A renderer
crash test initially used a helper requiring an unrelated `window.work` promise; it now waits on its
actual commit hook. Both test-harness problems were corrected and their focused reruns passed.
