# Focused verification

No generalized campaign or release gate ran.

## Proof and ownership checks

`vitest run test/preparedCoverage.test.ts test/incrementalLedger.test.ts test/accountReceiveLedger.test.ts test/accountSelfReceive.test.ts test/runtimeForkStrings.test.ts`: **25 pass**.

Five new cases compare preparation against the independent prior `forkDoc → applyUpdate → sameDocState` algorithm. They include 120 deterministic generated mixed-type histories with partial/out-of-order delivery, GC, long strings, Unicode, binary/JSON values, missing dependencies and deletions. Directed cases cover independent checks after refusal, malformed update then retry, detachment from subsequent source changes, disposed probes, simultaneous baselines and repeated normalization fallback. A mutated shared fork would incorrectly accept the second missing-update check; the test explicitly requires both attempts to refuse. No production mutant was run in this slice.

Existing generated tests cover 35 incremental histories and 200 compacted content/deletion histories, invalidated views, positive/negative coverage behavior and self-receive continuity. These remain focused regression tests, not a new release campaign.

The first new generated run failed before testing the candidate because the fixture inserted `undefined` directly into `Y.Array`, which the public Yjs insertion API rejects. An attempted text replacement missed the formatter-expanded line, so a second run reproduced the same fixture error. Both logs are retained. Replacing that element with `null` fixes the fixture; all final checks pass. A directed legacy `ContentJSON` case separately exercises supported serialized `undefined` behavior.

## Native integration

**Eight pass** in `logs/native.log`, using real IndexedDB, journal, custody and browser Yjs:

```sh
ACCOUNT_LEDGER_MODE=incremental ACCOUNT_BATCH_MODE=coordinated-2000 \
ACCOUNT_REPORT_DIR=<existing directory> \
node --test --test-concurrency=1 \
  --test-name-pattern='cold replay refuses missing|pending remote deletion|one owner advances|lost reply and unavailable|hidden-page batch close|abort during a pending passkey' \
  test/account-receive/native.test.mjs test/account-receive-editor/native.test.mjs \
  test/account-sync/native.test.mjs test/account-editing/native.test.mjs
```

Missing/changed content, event and ciphertext refuse. Pending structs/deletions survive compaction and cold reopen. Hidden-page closure, journal death, self-submit receipts, lost replies/exact retry and pending-passkey cancellation pass. The stale older ledger-order mutation documented in the first packet was not rerun or credited.

## Browser and build checks

- All 22 paired opens pass, with first locally accepted edits. No failed measured browser attempt.
- One separate deep CPU-profile run preserves an offline edit through lock/reopen.
- Ordinary-build online/deep and offline/receiver edit/reopen checks pass with application diagnostic globals absent.
- TypeScript, targeted formatting/lint, the pinned Yjs check, ordinary build, initial bundle budget (136.6kB / 350kB) and built-origin scan pass. The scratch archive's origin scan warns about missing Git metadata but scans the built assets successfully.
- Candidate and ordinary runtime source hashes match the working tree. Prepared baseline cleanup is explicit in the helper and caller's `finally`; tests exercise disposal and independence but do not measure peak heap or prove forensic erasure of JavaScript-managed strings.
