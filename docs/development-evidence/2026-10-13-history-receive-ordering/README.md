# Checkpoint lifecycle ordering evidence

See the [analysis and repair](../../account-history-receive-ordering.md). Base is signed `f75a19e7`.
The manifest hashes the repair sources and retained evidence. These are disposable local Chromium
accounts and service processes, not the author's browser or deployed service. No timing comparison
or release qualification is claimed.

## Evidence interpretation

- `natural.log.gz` and the three `natural-*.json.gz` files: three diagnostic repetitions on the
  unmodified runtime passed. Diagnostic catches include normal capability closures during startup;
  not every caught exception is a product failure.
- `hold.log.gz`, `before-diagnostic.spec.ts.gz`, `before-owner-events.json.gz` and
  `before-error-context.md.gz`: the signed-base runtime with an empty prepared receive held before
  final application. History inspection completes, then releasing the receive closes the owner.
  The trace records the stale-context refusal and chooser navigation.
- `repair.log.gz`: initial **test-build failure**, caused by an indentation-sensitive probe anchor.
  No browser assertion ran. The corrected probe requires a unique anchor without indentation.
- `repair-2.log.gz` and `repair-repeat.log.gz`: repaired journey passes empty, content/local-edit,
  and late-arrival orderings. The repeat was started with the omission environment variable before
  its transform was implemented, so it is **not** negative-control evidence.
- `omission.log.gz` and `omission-context.md.gz`: actual test-only omission of the pending-promotion
  guard. Empty/content cases pass; late arrival fails the second-drain assertion (one, expected two).
  No timeout was raised to make this pass.
- `unit.log.gz`: 71 tests, including five new drain/retry/error-boundary tests and the existing
  final-apply and admission queue controls.
- `prepared-native.log.gz`: seven existing native receive controls covering final fresh authority,
  invalidation/fallback, undisplayed durable suffixes, renderer death, local journal and undo/redo.
- `lifecycle.log.gz`: the two reduced-history membership/replacement/detachment journeys and the
  repaired checkpoint journey, including all three forced handoff orderings, pass.
- `ordinary-history.log.gz`: two ordinary packaged history journeys pass on the default build,
  including lost publication replies, interrupted installation, repeated snapshots and editing.
- Build/typecheck/lint/format/Yjs/origin/budget logs record bounded implementation checks.

## Reproduction

Run from the repository root at the repaired source identified by the manifest:

```sh
node node_modules/vitest/vitest.mjs run test/historyReceiveFence.test.ts test/finalApplyGate.test.ts test/admissionQueue.test.ts
ACCOUNT_PREPARED_RECEIVE=1 node --experimental-strip-types --test test/account-receive-editor/prepared.test.mjs
ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 ACCOUNT_RETENTION=1 ACCOUNT_AUTHORITY_REUSE=1 node node_modules/@playwright/test/cli.js test -c playwright.local-baseline.config.ts test/local-baseline/removal-checkpoint.spec.ts test/local-baseline/lifecycle-owner.spec.ts
pnpm build
node node_modules/@playwright/test/cli.js test -c playwright.packaged-account.config.ts test/packaged-account/history.spec.ts -g 'sole device|two native'
```

The negative control deliberately fails:

```sh
HISTORY_HANDOFF_CONTROL=omit-pending-check ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 ACCOUNT_RETENTION=1 ACCOUNT_AUTHORITY_REUSE=1 node node_modules/@playwright/test/cli.js test -c playwright.local-baseline.config.ts test/local-baseline/removal-checkpoint.spec.ts
```

To repeat the original controlled closure, in an isolated checkout of `f75a19e7`, decompress
`before-diagnostic.spec.ts.gz` to `test/local-baseline/removal-diagnostic.spec.ts`. Run that file with
the same baseline/read/retention/authority flags and `RETENTION_DIAGNOSTIC_HOLD=1`. Without the hold
flag it runs the natural diagnostic journey. The held test expects an active owner and fails on the
old runtime; it is retained as evidence, not installed in the ordinary test set.

Packaged tests use local ports 53221/53222 and must run serially. Raw builds, test databases and traces
outside this packet are disposable; all quoted failures and results have retained logs here.
