# Private lifecycle-reader and rebase evidence — 2026-10-13

Base: signed **`3ba73cb3`** (`G`). The new implementation is uncommitted and identified by the
source hashes in `manifest.json`. [Contract](../../account-local-baseline-lifecycle-readers.md).
All browser writing/accounts/credentials are disposable. No personal service or profile was changed.
No logical history was deleted. This is focused implementation evidence; publication and general
release validation remain paused. No performance numbers are claimed on this busy host.

## Checks

Commands use installed tools directly, as in the preceding phase. No install, package-manager
verification bypass or dependency update was needed.

- `node node_modules/vitest/vitest.mjs run --maxWorkers=1 test/localBaseline.test.ts test/localBaselineLifecycle.test.ts test/retentionFences.test.ts test/localBaselineAnchor.test.ts test/journalCodec.test.ts test/journalSnapshot.test.ts test/sourceCapture.test.ts`
  — **111 tests / seven files pass**. New generated successive-rebase control (12 histories,
  seed `131026`) keeps partial source consumption and absolute positions through repeated/empty cuts,
  then compares state and next source selection against full history. Directed controls cover
  inherited checkpoints and authority with no later events (original/joined), generation-two rebase
  after retry, tampered predecessor, missing suffix, replayed prefix, unsettled positions, input
  mutation during crypto and owner retirement before signing. Existing framing, authority/cut,
  checkpoint, anchor transaction, journal and source controls remain.
- `ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 node --test test/local-baseline/owner.native.mjs`
  — **23 pass; one ordinary-build case skipped**. Rebase is used for replacement/era advancement.
  Includes physical row preservation, fresh authority change, pending journal, close during crypto,
  damaged anchor/counter/history refusal, original logical cold/live recovery, separate receive
  owner, journal-before-apply and undo, reservation/final-commit renderer death, idempotent retry,
  both mismatched restore directions and matching journal-only/commit-before-cleanup crash recovery.
- `node --test --test-name-pattern='ordinary Account workspace' test/local-baseline/owner.native.mjs`
  — **one passes**: no private installation/era/replacement method in the ordinary application;
  input still journals and persists.
- `ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 node node_modules/@playwright/test/cli.js test -c playwright.local-baseline.config.ts lifecycle-owner.spec.ts`
  — **two packaged journeys pass**. First handoff from an anchored original, subsequent admission,
  exact journal preservation, two rotations, lost/interrupted final custody activation, repeated
  baseline replacement, surviving-device exchange/reopen and detached joined editing/reopen. The
  second journey removes the original and checks its local writing while the joined survivor rotates.
  A test-only transform observes the real prospective, catch-up, membership-source, rotation,
  rotation-journal, detached and rebase branches; the first journey requires all seven observations.
  It does not replace their validation/storage implementations.
- `ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 node node_modules/@playwright/test/cli.js test -c playwright.local-baseline.config.ts transition-owner.spec.ts`
  — **one passes**: original/joined logical cold/live recovery, checkpoint producer/admitter and
  durable-attempt fences, membership epochs 4/5, bidirectional edits, joined undo/redo, exact retained
  physical rows and both cold reopenings.
- TypeScript (`tsc -b --noEmit`), changed-file `oxlint --react-plugin`, `oxfmt --check` and
  `git diff --check` pass.

The ordinary build's Yjs patch check, `tsc -b`, Vite build, bundle budget and origin isolation pass.
Initial JavaScript remains **138.3 kB gzip / 350.0 kB budget**. Build completion was observed directly
in tool output; the retained static log includes budget/origin rechecks against that output.

## Harness corrections and scope

The first lifecycle invocation stopped during its build: a test-only observation hook matched
indentation that the React/Babel build had reformatted. A diagnostic edit briefly introduced an extra
parenthesis, also stopping before browser execution. The corrected hook matches whitespace flexibly,
requires exactly one anchor, and records only enumerated branch names. The build-failure logs and
subsequent passing runs are retained. No product guard, test timeout or crash boundary was relaxed.

After the first two journeys passed, plaintext reuse for these separate lifecycle owners was scoped
to the existing private installation flag, preserving the ordinary path. The final lifecycle run
uses that exact scoped implementation. Repeated runs/configurations are not counted as new cases.

The full physical history remains present and every anchored read compares against it. This evidence
establishes lifecycle computation from a privately filtered baseline-plus-suffix view, not reduced
physical storage, power-loss persistence, arbitrary backup restoration, a public migration/rollback
path, capacity UX, or a performance improvement. The four full-spool guards remain. Independent
service-history trust and pruning are unchanged. `docs/progress.md` is untouched.

Compressed raw logs and source SHA-256/size metadata are in `manifest.json`. Generated builds,
databases and browser profiles remain ignored under test-results; none is added to this packet.
