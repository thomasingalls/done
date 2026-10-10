# Focused verification

This is implementation checking for the incremental ledger slice, not a resumed release campaign.
All commands run from the repository root with the existing dependency installation.

- Final native subset: **five tests pass**, including three generated histories (eight operations
  each), full audit on every delta, both precommit abort boundaries, lost reply and cold continuation.
- Default reference-mode native delivery/compaction/cold-reopen regression: **one test passes**.
- TypeScript `tsc -b --noEmit`, targeted `oxlint --react-plugin`, and `git diff --check`: pass.
- Five Vitest files: **27 tests pass**, including 35 generated coverage histories, 40 prefix mutations,
  explicit child/delete-before-parent delivery, negative reconsideration and stale-bound-checker refusal.
- Three executed fault controls: removing abort invalidation, removing the late-result revision guard,
  or removing old-row byte comparison each exposes the corresponding prohibited reuse. Unmodified
  code exposes none of them. These are three targeted controls, not a generalized mutation campaign.
- Incremental native Account sync: normal submit/compaction/cold continuation, submission abort,
  response abort, lost reply, unavailable reconciliation, committed acceptance before renderer death,
  legacy self-inbound compatibility, empty self checks and retained signed conflicts pass in focused
  subsets. With `ACCOUNT_LEDGER_AUDIT=every`, candidate execution/audit counters are asserted, and
  every tested delta agrees with full reference replay.
- A focused Node differential fixture appends sources, allocation/invocation records, independently
  encrypted envelopes and signed acceptances across generations 1 and 2. Every delta agrees with
  full replay; both accepted positions remain available.
- Packaged application with incremental validation and audit on every delta: **two tests pass**:
  two-device delivery/independent snapshot verification, and returning-editor catch-up after service
  history pruning with unsent local writing preserved. These use disposable accounts and native
  IndexedDB/crypto, not production data.

Commands (repeated subsets were used while implementing; counts above are not summed as unique tests):

```sh
node node_modules/typescript/bin/tsc -b --noEmit
node node_modules/vitest/vitest.mjs run test/incrementalLedger.test.ts test/verifiedRecords.test.ts test/accountDelivery.test.ts test/accountSelfReceive.test.ts test/accountReceiveLedger.test.ts --maxWorkers=2
ACCOUNT_LEDGER_MODE=reference node --test --test-name-pattern='one owner advances' test/account-sync/native.test.mjs
node --test test/incremental-ledger/controls.test.mjs
node --test --test-name-pattern='incremental replay matches' test/account-membership/generations.test.mjs
ACCOUNT_LEDGER_MODE=incremental ACCOUNT_LEDGER_AUDIT=every node --test --test-name-pattern='one owner advances|native (submission|response) abort|generated incremental|lost submit answer' test/account-sync/native.test.mjs
ACCOUNT_LEDGER_MODE=incremental ACCOUNT_LEDGER_AUDIT=every node --test --test-name-pattern='one owner advances|lost submit answer|legacy self-inbound' test/account-sync/native.test.mjs
ACCOUNT_LEDGER_MODE=incremental ACCOUNT_LEDGER_AUDIT=every node --test --test-name-pattern='one owner advances|acceptance committed|lost reply and unavailable|verifying an empty self|retained signed receive conflict' test/account-sync/native.test.mjs
VITE_ACCOUNT_LEDGER=incremental VITE_ACCOUNT_LEDGER_AUDIT=every node node_modules/vite/bin/vite.js build
node node_modules/@playwright/test/cli.js test --config playwright.packaged-account.config.ts test/packaged-account/history.spec.ts --grep 'two native device owners|returning editor'
```

The audit shares some primitive decoders and cryptographic verification with the candidate; it is
independent full sequencing/reconstruction, not an independently written cryptographic implementation.
Passing these checks does not prove the entire protocol correct or qualify a release.
