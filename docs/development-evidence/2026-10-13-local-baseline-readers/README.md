# Private owned logical-reader evidence — 2026-10-13

Base: signed **`bce612c3`** (`G`). The implementation above it is uncommitted and identified by the
source hashes in `manifest.json`. [Implementation contract](../../account-local-baseline-readers.md).
Disposable accounts, credentials and writing only; no personal profile, service or logical history
was removed. Release validation and publication remain paused. These are focused correctness checks,
not a performance comparison on this busy machine.

## Executed checks

Commands use the installed tools directly, following the previous phase's pnpm launcher limitation.
No package installation or package-manager verification bypass was attempted in this phase.

1. `node node_modules/vitest/vitest.mjs run --maxWorkers=1 test/localBaseline.test.ts test/localBaselineLifecycle.test.ts test/retentionFences.test.ts test/localBaselineAnchor.test.ts test/journalCodec.test.ts test/journalSnapshot.test.ts test/sourceCapture.test.ts`
   — **107 tests / seven files pass**. Existing generated cuts, transition/rotation/checkpoint replay,
   framing and crash controls plus logical read opt-in/era requirements, partial originals, absolute
   continuation, returned-buffer isolation and altered-prefix refusal. The new 35-capsule omission
   control reauthenticates a candidate missing its last original: its pure replay and next 32-source
   selection still succeed/match, while the full catalogue comparison refuses it.
2. `ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 node --test test/local-baseline/owner.native.mjs`
   — **23 enabled cases pass**, ordinary-build case skipped. Actual non-deleting storage, stale
   read invalidation, fresh authority refusal, close/cancel, reservation/final-commit renderer death,
   both mismatched restore directions and matching journal crash recovery remain covered. The added
   logical-owner case observes accepted sources/positions absent from the logical catalogue, exact
   physical rows preserved, a subsequent absolute position, journal-before-apply, undo/redo and both
   cold-classification/live-recovery calls using the logical seam.
3. `ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 ACCOUNT_LEDGER_MODE=reference node --test --test-name-pattern='private reduced cold/live|era journal renderer death' test/local-baseline/owner.native.mjs`
   — **three pass**: the same logical-owner and two journal crash controls under reference mode.
   These are additional configurations, not three newly distinct tests.
4. `ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 node --test --test-name-pattern='separate v9 receive-store' test/local-baseline/owner.native.mjs`
   — **one passes** after strengthening that existing case to use an era-bearing replacement and
   compare its absolute receive frontier with the authenticated accepted head. No database row changes.
5. `node --test --test-name-pattern='ordinary Account workspace' test/local-baseline/owner.native.mjs`
   — **one passes**: the ordinary application exposes no installer/replacement/era method and still
   journals and persists input. The enabled suite separately checks ordinary-reader refusal of private
   v3/v4 profiles followed by successful private reopening.
6. `ACCOUNT_PREPARED_RECEIVE=1 node --test test/account-receive-editor/prepared.test.mjs`
   — **seven pass**: durable undisplayed work, later local edits, undo, changed custody, early authority
   permission, renderer death and intervening owned tasks retain their existing checks.
7. `ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 node node_modules/@playwright/test/cli.js test -c playwright.local-baseline.config.ts transition-owner.spec.ts`
   — **one packaged original/joined journey passes** in the final run. Both devices install/advance
   anchors and exchange edits; joined undo/redo preserves received writing; checkpoint producer/admitter
   and durable-attempt fences run; membership reaches epochs 4/5; both owners reopen. Test-only probes
   require at least two actual logical recovery reads per cold opening, with fewer logical than physical
   rows. Every captured pre-anchor physical row is still present byte-for-byte on both devices.
8. `node node_modules/typescript/bin/tsc -b --noEmit`, changed-file `oxlint --react-plugin`,
   changed-file `oxfmt --check` and `git diff --check` pass. The ordinary build components pass:
   Yjs patch check, `tsc -b`, Vite production build, bundle budget and origin isolation. Initial JS is
   **138.3 kB gzip / 350.0 kB budget**; no product opt-in was set. Build completion was observed in tool
   output; the retained checks log includes the subsequent budget/origin checks against that output.

## Failures and limits

The first enabled native invocation had four timeouts in the existing `settled` helper. It compared
absolute accepted/received positions with `spool.positions.length`, which stops being the absolute
head after a retained prefix. The corrected helper compares against the last actual position (when
present) and checks equal accepted/received absolute frontiers while still checking exact source
allocations and idle sending. The complete corrected suite passes. No runtime refusal, timeout or
crash boundary was relaxed. The initial native failure details remain in the task transcript; the
final raw run is retained here.

The first packaged run unexpectedly locked during the existing five-second “Check history” UI
assertion. This same symptom is recorded in the preceding signed fences packet. A diagnostic rerun
passed without reporting a custody-refresh mismatch. The diagnostic transform was then removed,
joined undo and physical preservation assertions were added, and the final run passed. The precise
cause remains **unestablished**; these passes do not prove that intermittent lifecycle issue fixed
or harmless. Initial failure, diagnostic pass and final pass logs are retained separately.

All history remains physically present and is authenticated/compared on anchored loads. Prospective
lifecycle checks, detached prefixes, rotation, handoff, membership source and rebase still require
full history. The four full-spool guards remain. This evidence does not establish physical deletion,
reduced-only reopening, public reader/rollback compatibility, arbitrary backup restore safety,
power-loss persistence, capacity/unavailable-history UX, or any cold-open/typing improvement. It does
not change service checkpoints or service pruning. `docs/progress.md` remains untouched.

Compressed logs and SHA-256/size metadata are listed in `manifest.json`. Disposable build/service
artifacts remain ignored under test-results; no service key/database or browser profile enters this
packet. Logs from repeated configurations are not pooled into a qualification count.
