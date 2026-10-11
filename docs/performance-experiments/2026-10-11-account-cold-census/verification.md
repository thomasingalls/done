# Focused verification

Release validation remains paused. All references below are this slice's evidence, not credit for whole suites.

- **18 focused node tests pass across the recorded invocations.** `unit.log`: 12 passing cases in `source-census`, `cold-open`, membership `retry`, and incremental-ledger `controls`; the batch module initially fails to load. `batch.log`: both batch cases pass after the test-entry repair below. `format-guards.log`: four selected existing identity, source-digest/envelope, fixed-carrier and canonical-framing cases pass. These include real guard-omission controls for conflicting source identities, actor/order/size and signed envelope substitution. The historical-reader comparison checks equal complete spool states and exact parse growth at 1, 8, 32 and 128 positions, input-buffer preservation, earliest duplicate sequence, late/conflicting sources, missing indices and changed old bytes on a second census.
- **8 native browser cases pass** (`logs/native.log`). Run with `ACCOUNT_LEDGER_MODE=incremental ACCOUNT_BATCH_MODE=coordinated-2000 ACCOUNT_REPORT_DIR=<existing directory> node --test --test-concurrency=1 --test-name-pattern='cold replay refuses missing|pending remote deletion|one owner advances|lost reply and unavailable|hidden-page batch close|abort during a pending passkey' test/account-receive/native.test.mjs test/account-receive-editor/native.test.mjs test/account-sync/native.test.mjs test/account-editing/native.test.mjs`. Covers changed/missing content, event and ciphertext; pending Yjs data through compaction/open; journal death; receipt progress and exact retry; cancellation. Existing native coverage/completeness controls remain effective.
- **22 matched opens pass**, plus the separate profile run verifies a new offline edit through lock/reopen. The ordinary packaged build passes deep-history online and receiving-device offline edit/reopen and asserts both profiling globals absent. See the pair logs and ordinary/profile logs. They use disposable fixtures, not personal writing.
- TypeScript, targeted format/lint, patched Yjs, ordinary packaged build, bundle budget (136.6kB compressed initial JS / 350kB) and built-origin scan pass. The scratch origin check warns it has no Git metadata but successfully scans all 31 built files. Runtime hashes in `source.json` match both built candidate trees.

## Harness repair and attempts

The batch test's historical reader is pinned before `positionSources` existed. Bundling it through the current all-ledger test entry pulled in modern consumers requiring that export, so the module failed before tests could run. Its historical comparison now bundles only `spoolRecord.ts`, the API that test actually exercises. The historical implementation remains unchanged; no compatibility export or guard was added. The new prior-census control separately pins the signed batching commit. The initial failure and successful rerun are both retained.

Two initial scratch builds rejected an invalid revision label before compilation; retrying with the required full parent SHA plus `-dirty` succeeded. An initial archive patch attempt rejected an absolute path; applying from the archive directory succeeded. Neither was a measured browser attempt. There were no failed measured opens.

The stale delivery-order mutation described in the preceding packet remains out of scope and was not rerun or credited. No full test suite, generalized mutation campaign, phone campaign or release gate ran.

Node commands:

```sh
ACCOUNT_REPORT_DIR=<existing directory> node --test --test-timeout=60000 \
  test/account-ledger-contract/source-census.test.mjs \
  test/account-ledger-contract/batch.test.mjs \
  test/account-ledger-contract/cold-open.test.mjs \
  test/account-membership/retry.test.mjs test/incremental-ledger/controls.test.mjs
ACCOUNT_REPORT_DIR=<existing directory> node --test --test-timeout=60000 \
  test/account-ledger-contract/batch.test.mjs
ACCOUNT_REPORT_DIR=<existing directory> node --test --test-timeout=60000 \
  --test-name-pattern='capsule identity|source-digest|canonical framing|capture.*|twenty fixed' \
  test/account-ledger-contract/controls.test.mjs test/account-ledger-contract/formats.test.mjs
```
