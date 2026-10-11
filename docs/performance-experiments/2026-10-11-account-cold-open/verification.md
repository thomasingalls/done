# Focused verification

This is bounded performance repair evidence. Release validation was not resumed.

- `node --test --test-timeout=60000 test/account-ledger-contract/cold-open.test.mjs test/account-membership/retry.test.mjs test/incremental-ledger/controls.test.mjs`: **9 pass**. Independent signed histories agree with the old prefix walker; exact hash growth is asserted through 1,000 positions. Correctly signed wrong-chain responses and missing/reordered evidence refuse. Existing retired-generation retry/interrupted-step tests and stale/aborted/late verified-view controls pass. See `unit-final.log` and the two `cold-prefix-*.json` reports.
- Native selected run used `ACCOUNT_LEDGER_MODE=incremental ACCOUNT_BATCH_MODE=coordinated-2000`, `--test-concurrency=1`, and `--test-name-pattern='cold replay refuses missing|pending remote deletion|one owner advances|lost reply and unavailable|hidden-page batch close|abort during a pending passkey'` over `test/account-{receive,receive-editor,sync,editing}/native.test.mjs`: **6 pass**, 2 reached final report output but failed because the report directory did not exist (`native.log`). After creating the directory, reran only `cold replay refuses missing or changed (content|event)`: **2 pass** (`native-retry.log`). These include effective existing coverage/completeness omission controls, ciphertext authentication, pending structs/deletion through compaction/reopen, local journal death, receipt progress, exact lost-reply retry and pending-passkey cancellation. Do not count the first run as fully passing.
- Five alternating deep-history pairs, three receiver pairs and three fresh pairs: **22 measured opens pass**, each with visible editor and first locally accepted card. Offline assets were installed before network was disabled. Native counters/phase snapshots and heap are retained per open.
- Candidate profile run: deep cold open and its first offline card survive lock/reopen (`candidate-profile.log`). Ordinary (diagnostics-disabled) build: online deep-history opening and edit/reopen, plus approved second-device offline opening and edit/reopen pass. Both assert absence of `__doneLedgerMetrics` and `__doneOpenMilestones` (`ordinary-online.log`, `ordinary-receiver-offline.log`). These functional checks are not extra samples in the paired estimates.
- TypeScript, targeted oxlint/oxfmt, patched-Yjs check, ordinary Vite build, initial bundle budget and built-origin scan pass. Initial compressed JS is 136.6 KiB against 350 KiB. Git-free scratch build provenance is explicit for the candidate/ordinary build; the baseline was built from the recorded parent plus instrumentation. Origin scan reports the absence of scratch Git metadata but successfully scans built assets.

## Existing control failure

The broader initial node selection included `test/account-ledger-contract/controls.test.mjs`. Its
`delivery ordering and received-content coverage controls accept otherwise authentic but invalid histories`
case fails when the ordering-guard mutant is expected to accept: later envelope decoding still refuses
it (`Malformed network envelope`). The same case fails from the unchanged parent-plus-instrumentation
checkout with its own working directory (`baseline-control.log`). No normal-path acceptance regression
was observed. `unit.log` retains the candidate result and the initial new wrong-link test's overly narrow
error-message expectation, which was corrected to assert the actual refusal.

The independent new missing/reordered-history test and native coverage/completeness controls provide
working refusal evidence for this slice. The stale older mutant is left unchanged and is not credited
as passing. No generalized mutation/fault campaign, full suite, phone campaign, container publication
or service rollout was performed.
