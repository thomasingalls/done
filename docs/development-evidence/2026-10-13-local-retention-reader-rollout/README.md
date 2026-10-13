# Reader-first local retention compatibility

Base: signed `e2e5337a`. See the [capability and rollback contract](../../account-local-retention-reader-rollout.md).
These checks use disposable local Chromium profiles and service databases. They are focused
implementation evidence, not a resumed release campaign or a performance comparison. No personal
profile, production service, container pin or infrastructure was changed.

## What the tests establish

- `unit.log.gz`: 58 tests covering reduced warm reuse, independent replay, lifetime/authority
  invalidation, lifecycle, checkpoint/receive ordering and the final-apply gate. Two new controls
  disable installation with retention both off and on: storage-level installation/removal refuse
  before authority callbacks, while authenticated reading remains available.
- `native.log.gz`: 18 native controls cover atomic abort, reserved/committed renderer death,
  exact retry, caller/authority/activity changes, journal-only and committed-before-cleanup recovery,
  old-flight refusal, incompatible readers, restored old-era journal refusal and live undo/redo.
- `rollout.log.gz`: the real packaged reader creates and syncs ordinary accounts; a separate private
  writer converts both; the normal waiting-service-worker mechanism returns them to the reader.
  Both edit and reopen offline, undo/redo, converge and install a verified history checkpoint without
  converters present or baseline/chunk replacement. A frozen predecessor refuses both profiles;
  exact content database and scoped journal inventories remain unchanged. A compatible reader
  subsequently opens and syncs them again.
- `lifecycle.log.gz`: the private fixture creates reduced original/joined profiles, then switches
  to the default reader with converters absent. An additional ordinary device joins; two removals,
  generation activation, offline survivor writing and detached editing continue. The second case
  removes the reduced original while its joined survivor rotates. The first case restarts the
  backend at a lost-reply boundary, preserving its durable SQLite/custody; see the limitation below.
- Build, TypeScript, focused lint/format and whitespace logs record bounded implementation checks.
  The ordinary build includes the Yjs patch check, origin scan and initial JavaScript budget.

## Failed attempts and limitations

`rollout-initial.log.gz` expected the build version in the splash text, which does not show it.
The fixture now identifies the real cached build using a test-only HTML meta tag.
`rollout-ui-assumption.log.gz` reached the predecessor refusal but expected a compatibility message;
that old UI instead reports a generic unlock error. Test-only observation of the unchanged refusal
constructors now checks `unknown-content-metadata` or `app-update-required`, independently of UI text.
No refusal, timer or runtime check was relaxed. `rollout-before-audit-dispatch.log.gz` records the
first passing journey, before narrowing the interruptible audit wrapper to actual reduced stores
and adding scoped journal inventory comparison. The final rollout log covers those changes.

`lifecycle-initial.log.gz` and its context retain the second removal remaining pending after a
deliberately lost commit reply; the other lifecycle case passed. The three diagnostic logs and the
retained diagnostic fixture trace the failure to `429 capacity` on `/account/session/v1/renew`,
before another removal request could be sent. The service's existing access-token allowance is eight
live tokens per remembered login, with five-minute access lifetime. Rapid reopens/short-lived owners
can consume that allowance. This is separate from the history representation and remains an open
[session-liveness follow-up](../../account-session-core.md#rapid-reopen-follow-up--2026-10-13).

The final fixture does **not** prove uninterrupted recovery from token-capacity exhaustion. It adds
a real backend restart at the lost-reply boundary, discarding volatile tokens but retaining all durable
account/session/removal state. No budget or assertion timeout is increased. This permits the
compatibility checks to continue and verifies cold-service recovery of the exact retained attempt.
Expected transient authority/grant refusals are logged; a logged refusal is not itself a test failure.

The predecessor bundle freezes every runtime module changed in this phase from `e2e5337a`, disables
all three baseline flags, and uses the otherwise unchanged application sources. Test transforms only
observe owners, refusal constructors and build identity. It is a reproducible predecessor behavior
check, not a deployed-image or every-historical-version claim.

The native log is from the final runtime; the ordinary packaged build uses reader on, installer off,
retention off. No compatible rollback image has been published yet. This packet does not establish
phone behavior, capacity beyond the existing 4 MiB carrier, conversion cadence or public activation.

## Reproduction

From this repository, using the source hashes in `manifest.json`:

```sh
node node_modules/vitest/vitest.mjs run test/localBaselineWarm.test.ts test/localBaselineReuse.test.ts test/localBaselineLifecycle.test.ts test/historyReceiveFence.test.ts test/finalApplyGate.test.ts
ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 ACCOUNT_RETENTION=1 ACCOUNT_AUTHORITY_REUSE=1 node --test test/local-baseline/removal.native.mjs
node node_modules/@playwright/test/cli.js test -c playwright.local-baseline.config.ts test/local-baseline/reader-first.spec.ts
ACCOUNT_BASELINE_READER_FIRST=1 ACCOUNT_BASELINE_READ=1 ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_RETENTION=1 node node_modules/@playwright/test/cli.js test -c playwright.local-baseline.config.ts test/local-baseline/lifecycle-owner.spec.ts
```

Run packaged suites serially: they use ports 53221/53222. Native controls use independent ephemeral
ports. For the diagnostic failure, temporarily restore `lifecycle-diagnostic.spec.ts.gz` as the
lifecycle fixture in an isolated checkout of the recorded source and run its `two rotations` case
with the same flags. That fixture observes swallowed network errors and has no backend restart.

The package-manager launcher stalled without starting the build and was stopped. The successful
build executes the exact script steps directly:

```sh
node scripts/check-yjs-patch.mjs
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
node scripts/check-budget.mjs
node scripts/check-origin-isolation.mjs
```

`manifest.json` hashes sources and retained files. Raw disposable bundles/databases under
`test-results/local-baseline-transitions/native` are not retained as publication artifacts.
