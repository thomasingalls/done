# Non-deleting Account baseline owner — focused evidence

Base: signed `13b265a3` (`G`). [Contract](../../account-local-baseline-owner.md).
The implementation and this packet are uncommitted. The manifest identifies the final changed
sources; no runtime/profile fixtures or credentials are copied here. No release campaign or publication.

Results:

- **171 Vitest cases in nine files**, with one worker. Carrier/authentication, baseline replay,
  pointer-preserving allocation/caller isolation, warm reads, compatibility, sessions, genesis,
  startup and compaction regressions.
- **10 distinct enabled native Account cases**: nine in `native.log.gz`, with the exclusion check
  strengthened and rerun in `close.log.gz`; one additional actual ordinary-reader refusal and
  compatible reopen in `fence.log.gz`. The close rerun is not an eleventh distinct test.
- **One ordinary-build native case**: no installer is exposed; normal input is admitted.
- **One packaged original/joined journey**, with anchors on both devices, bidirectional later edits,
  checkpoint sequence 1, original-owner continuity across invitation/cancellation epochs 4/5, and
  both cold opens. The replay comparisons still use all retained history.
- TypeScript, changed-source format/lint, Yjs patch, ordinary Vite build, budget/origin checks and
  whitespace checks passed. The ordinary build's compressed initial JS is 138.0 kB against 350 kB.

Commands (from repository root):

```sh
node node_modules/vitest/vitest.mjs run --maxWorkers=1 test/localBaselineAnchor.test.ts test/localBaseline.test.ts test/warmContent.test.ts test/storageCompatibility.test.ts test/contentRecord.test.ts test/writeSession.test.ts test/localGenesis.test.ts test/ownedStartup.test.ts test/contentCompaction.test.ts
ACCOUNT_BASELINE_INSTALL=1 node --test test/local-baseline/owner.native.mjs
ACCOUNT_BASELINE_INSTALL=1 node --test --test-name-pattern='closing during installation' test/local-baseline/owner.native.mjs
ACCOUNT_BASELINE_INSTALL=1 node --test --test-name-pattern='ordinary Account opener' test/local-baseline/owner.native.mjs
ACCOUNT_BASELINE_INSTALL=0 node --test --test-name-pattern='ordinary Account workspace' test/local-baseline/owner.native.mjs
ACCOUNT_BASELINE_INSTALL=1 node node_modules/@playwright/test/cli.js test -c playwright.local-baseline.config.ts transition-owner.spec.ts
node node_modules/typescript/bin/tsc -b --noEmit
node scripts/check-yjs-patch.mjs
node node_modules/vite/bin/vite.js build
node scripts/check-budget.mjs
node scripts/check-origin-isolation.mjs
```

The native full run preceded the extra ordinary-reader test and the stronger close/contender check.
Those test-only additions were run separately against the same runtime. Native fixtures use real
Chromium/WebCrypto/IndexedDB/Web Locks and disposable generated content. No private app handle is
included in the ordinary build; the packaged journey injects its handle only through its test plugin.

During integration the native cold open exposed a missing scoped inventory adapter. The packaged
checkpoint creation exposed the separate history-source reader, which needed the same authenticated
entry. Both are repaired and included in the final passing runs. Early test corrections fixed the
fixture DB lookup and input API. The journal case correctly returns skipped after unsuccessful cleanup;
it does not throw merely because cleanup retained a row. The authority-fault case initially waited
for a blocked FIFO ticket to reject; it now observes the blocked queue/storage before closing to settle
that ticket. These earlier exploratory outputs were not retained as a complete run history.

`unit-concurrent-timeout.log.gz` records one five-second multi-chunk unit-test timeout while other checks
were running. The unchanged test passes with one worker; no timeout/acceptance threshold was relaxed.
Other logs record final passing checks. Timing on this busy host is not performance evidence, and
renderer death does not establish power-loss behavior. Generation rotation/replacement, restored
journal pairing, deletion and public rollout remain unqualified.
