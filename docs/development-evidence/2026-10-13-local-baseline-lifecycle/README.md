# Non-deleting baseline lifecycle evidence — 2026-10-13

Base: signed `bb9c7e82` (`G`), the real Account owner integration. The phase above that commit is
uncommitted; `source-sha256.txt` records its source state. [Contract](../../account-local-baseline-lifecycle.md).
All accounts, credentials and writing in these checks are disposable. No personal profile, public
runtime, or general release-validation campaign was used. Timings on this busy host are not comparative
performance evidence.

## Focused commands and results

- `node node_modules/vitest/vitest.mjs run --maxWorkers=1 test/localBaselineLifecycle.test.ts test/localBaselineAnchor.test.ts test/localBaseline.test.ts test/warmContent.test.ts test/storageCompatibility.test.ts test/contentRecord.test.ts test/writeSession.test.ts test/localGenesis.test.ts test/ownedStartup.test.ts test/contentCompaction.test.ts`
  — **183 tests / 10 files pass**, including 12 new carrier lifecycle controls. Covers exact predecessor,
  stale retry, input isolation, reservation-before-encryption, seal/journal/transaction refusal,
  old-chunk mutation, retained earlier-generation chunks/openers, fresh authority failure, generation
  bounds, and shrinking only the bounded metadata inventory. The framing-only shrink control explicitly
  does not claim semantic replay equivalence; the real owner performs that separate verification.
- `ACCOUNT_BASELINE_INSTALL=1 node --test test/local-baseline/owner.native.mjs`
  — **14 enabled cases pass**; the ordinary-build case is intentionally skipped here. Includes the 10
  previous installation/refusal/lifetime cases, replacement with input waiting and undo/redo, renderer
  death after reservation and final commit, expected-revision retry, and the independent v9 receive
  reader opening a replaced anchor without mutation.
- `ACCOUNT_BASELINE_INSTALL=0 node --test --test-name-pattern='ordinary Account workspace' test/local-baseline/owner.native.mjs`
  — **1 passes**, asserting neither installer nor replacement method is exposed and ordinary editing works.
- `ACCOUNT_BASELINE_INSTALL=1 node node_modules/@playwright/test/cli.js test -c playwright.local-baseline.config.ts lifecycle-owner.spec.ts transition-owner.spec.ts`
  — **3 packaged journeys pass**. First-device anchoring precedes the first admission/catch-up handoff;
  later original/joined owners retain offline writing through two rotations and replacement. A native
  custody activation commit abort after content rotation is resumed. Both removed-original and
  removed-joined local copies remain durable/editable without delivery/notification requests. A separate
  journey replaces both baselines after verified history checkpoint 1, continues through membership
  epochs 4/5 and cold-opens both owners. Live admission is asserted active and durable, not merely
  visible text. Log extraction includes hidden status-control text; those strings alone are not evidence
  of blocked admission.
- `node node_modules/@playwright/test/cli.js test -c playwright.packaged-account.config.ts content-rotation.spec.ts`
  — **1 ordinary-build native journey passes**, exercising seal, commit, journal and opener fault cases
  without any baseline enabled.
- TypeScript `tsc -b --noEmit`, changed-file `oxlint --react-plugin`, `oxfmt --check`, Yjs patch verification,
  ordinary Vite build, bundle budget, origin isolation and `git diff --check` pass. Initial JS is
  **138.0 kB gzip / 350.0 kB budget**. Type/lint/whitespace checks are silent on success; exit statuses
  are recorded in `checks.json`.

Compressed logs and their hashes are listed in `manifest.json`. Browser build/artifacts remain under
ignored `test-results/local-baseline-transitions/` and `test-results/packaged-account/`; they are not a
new release inventory. The three packaged lifecycle/checkpoint journeys rebuild their private bundles;
the ordinary rotation fixture builds a separate test-only probe with the flag absent.

## Investigation and limits

Two initial test assumptions needed correction. A journal-fault control reassigned an owner callback
*after* the primitive had correctly captured it; it now changes state read by the captured callback.
The shrinking-carrier test initially expected two chunks for a 300 KB snapshot; the encoded payload's
hex representation actually needs three. It now derives the expected superseded keys from the
independently read old pointer. Neither was repaired by relaxing an implementation guard or timeout.

Review tightened three boundaries before completion: copying the expected predecessor before any
await, repeating fresh authority immediately before the rotation transaction, and refusing local
allocation generations beyond the authenticated network generation. Current fixtures exercise those
checks. The earlier pure rotation test now advances local allocation/re-encryption as the real owner
does, rather than changing only the protocol generation.

All logical history is retained. Replacement overwrites the current encrypted baseline and, if smaller,
removes only surplus metadata chunk values in that same transaction. Rotation preserves history keys
and plaintext while re-encrypting their ciphertext, retaining the old anchor and required openers.
This phase does not establish safe logical-history deletion, whole-profile rollback resistance,
restored journal/database compatibility, power-loss guarantees, automatic installation, public reader
rollout, or a new recovery product journey. The 4 MiB candidate bound and full/reference comparisons
remain. `docs/progress.md` is untouched.
