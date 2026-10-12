# Focused checks and reproduction

The reservation repair was committed signed as `9bf9f3c6` before this phase. No publication or
general release campaign is part of this work.

## Correctness

- **54 unit tests pass** in `accountAuthority`, `custodyRecord`, `warmContent`, and
  `verificationOwnership`. The new memo has 17 directed/generated tests, including 30 generated
  nested-byte/key/shape mutations. They exercise exact-positive reuse, fresh reads on every task,
  unchanged-MAC damage, valid-but-unexpected authority, separate owners, failure clearing,
  concurrent-check refusal, detached input, and late completion after invalidate/dispose/close.
- **Eight native checks pass** across two completed runs. Three new cases authenticate after
  visibility/resume/pageshow, reuse the next unchanged check, then immediately refuse changed
  custody, malformed clear, or pre-active import records. Five existing owner checks cover resume
  full reads, own-submit progress/compaction/cold continuation, reference-audit disagreement,
  generated ledger histories and serialized concurrent readers. Audit-every remains enabled.
- **Three packaged journeys pass**: two-owner history checkpoint admission with interrupted
  installation and two-way delivery; a joined device admitting a third; and original/joined
  custody preserving interrupted progress and installed keys. These exercise allowed authority
  and custody transitions as well as ordinary reads.
- TypeScript, pinned Yjs checks, ordinary production build, origin isolation and scoped lint pass.
  Initial JavaScript remains 136.7 kB gzip against the 350 kB limit.

The generated test initially used `toEqual`, which treats an added `undefined` property as equal.
It correctly failed its expected-refusal assertion. The strict oracle is now `toStrictEqual`;
the implementation already detected the difference. The first native probe mistakenly called
`listCaptures`, which does not perform this authority check; it now calls `receiveStatus`. Its
second run passed the assertions but failed cleanup because the fixture's `editor` global was
unset. The corrected cleanup passes. All these logs are retained separately.

The extra custody journey initially stopped before its assertions. A diagnostic run with reuse
disabled reproduced HTTP 404 on `/account/history/v1/checkpoint`: its test service disabled
membership continuation, which also disables the history endpoint now required by activation
(`account-service/scoped-http.ts`). Enabling that endpoint in the fixture passed the unchanged
custody assertions. This is a fixture correction, not a runtime workaround or a discarded timing run.

```sh
node node_modules/vitest/vitest.mjs run test/accountAuthority.test.ts \
  test/custodyRecord.test.ts test/warmContent.test.ts test/verificationOwnership.test.ts
ACCOUNT_AUTHORITY_REUSE=1 ACCOUNT_LEDGER_AUDIT=every node --test --test-concurrency=1 \
  --test-name-pattern='authority reuse|exclusive warm loads|one owner advances|reference audit disagreement|concurrent Account readers|generated incremental ledger histories' \
  test/account-sync/native.test.mjs
node node_modules/@playwright/test/cli.js test --config playwright.packaged-account.config.ts \
  history.spec.ts membership-custody.spec.ts membership-connection.spec.ts \
  --grep 'two native device owners|original and joined native custody|joined device invites a third'
```

## Performance method

Both instrumented bundles use this phase's shared source. Reference sets
`VITE_ACCOUNT_AUTHORITY_REUSE=0`; candidate takes the default. Thus this is a direct switch
comparison, not a byte-for-byte rebuild of `9bf9f3c6`. The shared full-reader refactor retains
the existing authentication bodies. The test runner, service, fixtures and all other switches
are identical. The ordinary production build is checked separately, without instrumentation.

```sh
VITE_ACCOUNT_AUTHORITY_REUSE=0 VITE_ACCOUNT_LEDGER_PROFILE=1 \
  node node_modules/vite/bin/vite.js build \
  --config docs/performance-experiments/2026-10-12-authority-reuse/probe/build.config.ts \
  --outDir /tmp/done-authority-reuse-20261012/reference --emptyOutDir
VITE_ACCOUNT_LEDGER_PROFILE=1 node node_modules/vite/bin/vite.js build \
  --config docs/performance-experiments/2026-10-12-authority-reuse/probe/build.config.ts \
  --outDir /tmp/done-authority-reuse-20261012/candidate --emptyOutDir
python3 docs/performance-experiments/2026-10-12-authority-reuse/probe/run.py matrix
```

The runner requires the external disposable paired fixtures recorded by hash in source identity.
It refuses to overwrite observations. Service state and browser snapshots must remain paired.
Profiles use separately named runs and are excluded from the timing comparison. No personal writing
or credential fixtures belong in the retained packet.

All **12 unprofiled comparisons and two separate CPU diagnostics pass**. No timing run failed or
was replaced. Each preserves text, last-key undo/redo, both-device export equality and offline
cold replay. All typing responses are HTTP 200. Final typecheck, scoped lint and whitespace pass.

```sh
python3 docs/performance-experiments/2026-10-12-authority-reuse/probe/run.py candidate active diagnostic profile
python3 docs/performance-experiments/2026-10-12-authority-reuse/probe/run.py candidate backlog diagnostic profile
# For each diagnostic directory, decode CPU samples and attribute long tasks:
node docs/performance-experiments/2026-10-12-authority-reuse/probe/profile.mjs <run-dir> <candidate-bundle-dir>
node docs/performance-experiments/2026-10-12-authority-reuse/probe/attribute.mjs <run-dir> <candidate-bundle-dir>
```
