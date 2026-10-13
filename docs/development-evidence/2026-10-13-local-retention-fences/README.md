# Private retirement-fence evidence — 2026-10-13

Base: signed **`8c694d55`** (`G`). The implementation above it is uncommitted; the accompanying
source hashes identify it. [Implementation contract](../../account-local-retention-fences.md).
All browser work uses disposable accounts, credentials and writing. No personal profile or service
was changed. These are focused implementation checks; release validation remains paused. This busy
host and overlapping checks provide no comparative performance evidence.

## Commands and results

- `node node_modules/vitest/vitest.mjs run --maxWorkers=1 test/retentionFences.test.ts test/localBaseline.test.ts test/localBaselineAnchor.test.ts test/localBaselineLifecycle.test.ts test/journalCodec.test.ts test/journalSnapshot.test.ts test/sourceCapture.test.ts`
  — **104 tests / 7 files pass**. Closed framing, exact original capsules, scope/era mismatch,
  malformed payloads, late generation tokens, close/release races, independent checkpoint cuts,
  exact duplicate verification versus duplicate durable events, predecessor checks, seal/transaction/
  journal failures, burned reservations, counter/payload correlation and era-preserving rotation.
- `ACCOUNT_BASELINE_INSTALL=1 node --test test/local-baseline/owner.native.mjs`
  — **21 enabled cases pass**, one ordinary-build case intentionally skipped in that invocation.
  Existing baseline tests plus a real late signed reply refused before persistence, successful fresh
  retry, journal-before-apply and undo, era reservation/final-commit renderer death, both mismatched
  restored-pair directions with exact storage preservation, matching journal-only replay and native
  commit-before-cleanup replay without a second source record. Retry does not allocate twice, and an
  ordinary replacement cannot masquerade as an era-transition retry.
- `ACCOUNT_BASELINE_INSTALL=1 node --test --test-name-pattern='ordinary Account opener' test/local-baseline/owner.native.mjs`
  — **2 pass**, covering v3 and v4 separately. The v4 case was added after the full owner invocation
  above: there are **22 distinct enabled cases** in the final owner file, not 23 independent checks.
  An ordinary reader refuses without mutation; a compatible private reader still opens the profile.
- `node --test --test-name-pattern='ordinary Account workspace' test/local-baseline/owner.native.mjs`
  — **1 passes**. No installation, replacement or era-transition method is exposed; ordinary input
  journals and becomes durable.
- `ACCOUNT_PREPARED_RECEIVE=1 node --test test/account-receive-editor/prepared.test.mjs`
  — **7 pass**. Durable undisplayed receipt recovery, later journalled edits, undo, changed custody
  refusal, the early fresh-authority read, renderer death and intervening owned tasks remain covered.
- `ACCOUNT_BASELINE_INSTALL=1 node node_modules/@playwright/test/cli.js test -c playwright.local-baseline.config.ts lifecycle-owner.spec.ts transition-owner.spec.ts`
  — **3 packaged journeys pass** with actual era-bound original and joined owners. Initial handoff,
  two rotations, retained journal recovery, aborted final custody activation and retry, detached
  original/joined editing, ordinary baseline replacement retaining the era, authenticated checkpoint
  installation, refusal while the producer's durable attempt remains, completion through its existing
  retry, subsequent era advance, membership epochs 4/5 and cold reopening. Hidden status-control text
  in the log is not a blocked-state assertion: the journey explicitly checks active/durable admission.
- TypeScript, changed-file lint/format and whitespace checks pass. Direct execution of the build
  script's component commands passes: Yjs patch check, `tsc -b`, `vite build`, bundle budget and
  origin isolation. Ordinary initial JS: **138.2 kB gzip / 350.0 kB budget**.

Logs are compressed, checksummed and listed in `manifest.json`. Native build/service artifacts remain
under ignored test-results directories; disposable service keys/database files are **not** in this
packet. No new general release inventory is created.

## Failures investigated

The real two-rotation journey found an implementation omission: `accountRotation` constructs a
separate journal owner. It initially lacked the content owner's authenticated binding and refused a
correctly wrapped crash-left journal. Supplying the same verified binding fixes it. The final packaged
journey exercises the native content-rotation/custody-commit interruption and recovery with that binding.

One initial checkpoint expectation was wrong: peer admission does not automatically clear the
producer's encrypted saved attempt. The guard correctly skipped retention. The test now resumes
through existing authenticated maintenance, then advances the era; retention never clears the attempt.
Another intermediate run timed out at the existing five-second history-inspection UI assertion and
its error snapshot showed a locked workspace. A subsequent run with a diagnostic for custody mismatch
passed without triggering that diagnostic. Its precise cause is **not established**; no timeout or
runtime guard was relaxed. The diagnostic-only transform was removed after that pass.

Early native fixtures incorrectly used raw receive methods stripped from the polling facade, then a
manual owner that does not expose the composed installer. A test-only handle now reaches the composed
owner's existing internal methods; production APIs did not expand. Other fixture corrections explicitly
handle injected journal cleanup failure and the closed-owner error following an invalid retry. The
storage-preservation and refusal assertions remain. Initial and final logs are retained separately.

`pnpm build` could not verify the pinned package-manager distribution against the npm registry in this
sandbox (`ERR_PNPM_PNPM_ENGINE_IDENTITY_UNVERIFIABLE`) and exited before running the project script.
No verification setting was bypassed or package installed. The already-installed Node tools ran the
same project build steps directly, successfully; both outputs are retained.

## Limits

Every logical history row remains. This does not establish deletion safety, reduced-only owner
activation, arbitrary browser backup recovery, nonce freshness after coordinated rollback, power-loss
persistence, or product `history-required` UX. It does not change the independent service checkpoint
or pruning protocol. Required openers and the 4 MiB baseline limit remain. Public reader-first rollout
and rollback, and the remaining baseline-plus-suffix reader work, are later gates. `docs/progress.md`
is untouched.
