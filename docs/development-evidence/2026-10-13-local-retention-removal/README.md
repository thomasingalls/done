# Private atomic local retention evidence — 2026-10-13

Base: signed **`7a48b86b`** (`G`). The implementation is uncommitted; `manifest.json` identifies
its source files and compressed logs. [Contract](../../account-local-retention-removal.md).
All writing, credentials, accounts, failures and deleted history are disposable test data. The
ordinary application has no removal entry point. No personal/public profile, deployment or service
was changed. General release validation remains paused. Durations are not performance evidence.

## Final checks

- `node node_modules/vitest/vitest.mjs run --maxWorkers=1 test/localRetentionStorage.test.ts test/localBaseline.test.ts test/localBaselineAnchor.test.ts test/localBaselineLifecycle.test.ts test/retentionFences.test.ts test/journalCodec.test.ts test/journalSnapshot.test.ts test/sourceCapture.test.ts test/finalApplyGate.test.ts test/admissionQueue.test.ts`
  — **194 tests / ten files pass** (`unit-final-combined.log.gz`). Eleven new storage tests use
  actual encryption and fake IndexedDB to check exact atomic removal, baseline-only replay with
  received/checkpoint evidence, empty repeated cuts, prefix reappearance refusal, closed v5 mode and
  authenticated format binding, rollback after delete, late key/changed row/journal/authority/seal
  faults after reservation, forged/disposed/wrong-owner plans, and rotation with zero physical rows.
  The latter retains the v5 pointer, old encrypted chunks/opener and reservation totals and seals
  no synthetic row. Existing generated partial-capsule/rebase/planner controls, journal controls,
  final-apply permissions and admission/undo tests remain in the run.
- `ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 ACCOUNT_RETENTION=1 node --test test/local-baseline/removal.native.mjs`
  — **12 cases pass** (`native-final.log.gz`). This full-file run precedes addition of the thirteenth
  unpublished-originals case. The same command with `--test-name-pattern='unpublished originals'`
  passes that additional case (`unsent.log.gz`). Thus all **13 native cases have passing evidence**;
  there was no subsequent full-file rerun. These use native Chromium, strict four-store transactions
  and real WebCrypto, with actual removal of the enumerated encrypted rows.
- Native cases cover live undo/redo and absolute publication after repeated cuts; death after
  reservation and after final commit/lost reply; exact retry without reallocation; abort after a
  logical deletion; queued input and journal-before-apply; ownership exclusion while crypto settles
  after close; journal-only and committed-before-cleanup crash recovery; stale-flight refusal and
  a fresh signed read; disabled-v5-reader refusal without writes; failed committed readback closing
  the owner; restored old-era journal refusal preserving bytes; and cold replay/publication of the
  exact unpublished source identities carried inside the baseline.
- `ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 ACCOUNT_RETENTION=1 node node_modules/@playwright/test/cli.js test -c playwright.local-baseline.config.ts lifecycle-owner.spec.ts removal-checkpoint.spec.ts`
  — **three packaged journeys pass** (`lifecycle-third.log.gz`): first handoff, additional admission,
  two rotations, interrupted custody activation, offline survivor publication, repeated removal,
  both original/joined detached copies, and the checkpoint journey with bidirectional edits,
  undo/redo, unfinished-attempt refusal, verified installation carried through another cut and cold
  reopening. The lifecycle test still requires observation of all seven real adapter/rebase seams.
  Actual deletion is performed by the private owner; tests do not manufacture a reduced store by
  deleting its prefix themselves.
- `ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 node --test --test-name-pattern='actual Account installs|restored.*across an era|era journal renderer death|private reduced cold/live|exact dry run is' test/local-baseline/owner.native.mjs`
  — **seven complete-history regressions pass** (`complete-regression.log.gz`), with the removal flag
  absent: v3 installation/undo, both mismatched journal/database restores, both journal crash points,
  complete-history logical owners and the read-only dry run.
- `node --test --test-name-pattern='ordinary Account workspace exposes' test/local-baseline/owner.native.mjs`
  — **one ordinary-owner case passes** (`ordinary.log.gz`): no private installer, replacement, era,
  dry-run or removal method; ordinary input persists.
- TypeScript, changed-source/test lint and formatting, Yjs patch checks, ordinary Vite build,
  bundle budget, origin isolation, documentation links and `git diff --check` pass. Initial JS is
  **138.3 kB gzip / 350.0 kB budget**. `build.log.gz` and `static.log.gz` retain the output.

## Failures and corrections retained

The initial one-case native smoke test removed history and exercised live behavior, but cold startup
refused the new counter because `localGenesisStorage.localCensus` still constructed the old private
metadata parser. That classifier now permits v5 only with all required flags. The second smoke run,
full native controls and packaged cold openings pass. The default and older private readers still
refuse without mutation.

The first unit run had a fixture-cleanup typo (`close` instead of `clear`) and expected a specific
MAC error when relabelling the carrier; the encrypted chunk prefix refused even earlier. Tests now
require refusal and separately assert that the counter MAC message and chunk prefix bind the mode.
The new closed codec also rejects string version tags and a v5 era created at another revision.

The first lifecycle run encountered the intentionally retired pre-commit receive flight at the
immediate idempotent retry's durability barrier. The harness retries only that exact message while
admission remains **active**; it does not retry a blocked/closed owner or suppress integrity failure.
The next run then found the test-only `journalOnly` injector used era framing for v4 alone, producing
an invalid fixture journal for v5. It now reads the v5 era too. The production pairing fence correctly
refused that malformed fixture and was not weakened. The third run passes all three journeys.

Two added native checks initially expected the wrong refusal surface: committed readback failure
closes admission before the underlying error reaches the ticket, and an already blocked journal
cleanup makes `whenDurable()` reject before a maintenance skip can occur. The corrected tests require
the injection to fire, require closed admission/exact committed bytes in the first case, and require
the earlier blocked refusal with unchanged bytes in the second. The final 12-case run passes.

All intermediate failure logs above are included alongside passing logs; the manifest records
compressed and uncompressed sizes/hashes. Ignored browser profiles, build outputs and service DBs
remain outside this compact packet. The final source hashes identify the implementation tested;
intermediate logs necessarily describe earlier fixture/code revisions documented here.

## Limits and next boundary

This is private current-cut atomic reclamation, not a supported public conversion or a general
restore proof. The baseline is limited to 4 MiB and the existing source/publisher bounds. A cut can
skip when unsettled or too large; unaccepted writing is carried, not claimed accepted. Old keys and
custody proofs remain. No service pruning, backup deletion or whole-profile residue claim follows.
The new reduced native restore case tests an old journal with a newer database; the inverse restore
case remains covered here by the existing complete-history era regression, not by a new v5 native
case. Arbitrary coherent rollback remains outside the guarantee.

The activated typing/handoff paths remain unchanged for ordinary accounts. Reduced owners still
use reference baseline-plus-suffix verification, bypass warm/incremental reuse and retain a possibly
long maintenance fence. Cold-open, online-typing, catch-up, memory and maintenance growth must be
measured before enabling conversion; no speedup is inferred from these tests. Baseline-aware warm
reuse and public reader-first/rollback preparation remain later work. `docs/progress.md` and the
unrelated untracked root notes are untouched.
