# Focused verification

Release validation stayed paused. These commands exercised the changed scheduling/receive boundaries;
no full suite inventory, generalized fault matrix, new mutation campaign or production deployment ran.
Direct installed binaries were used after `pnpm exec` attempted a package-manager metadata refresh and
an unattended install, which refused. Dependencies were not replaced.

- `vitest run test/accountBatching.test.ts test/accountSyncDriver.test.ts test/admissionQueue.test.ts`:
  **50 passed**, including the existing generated scheduler/admission histories. New checks cover both
  maximum windows, quiet extension, lifecycle close, force-flush barriers, journal-only recovery,
  failure-backoff independence, delayed preparation reads and persisted-envelope retry bypass.
- Opt-in `ACCOUNT_BATCH_MODE=coordinated-2000` receiver native selection: **7 passed** — before/after
  commit death, local input ordered after receive, invalid/conflicting evidence, pending structs and
  deletions after compaction/cold open, observer close, and one compare/publication for a three-frame page.
- Opt-in syncing native selection: **6 passed** — receipt-derived progress, lost-answer reconciliation,
  submission/response aborts, death after receipt commit, and exact submission retry after reopening.
- Hidden-page listener and death before the next batch: **1 passed**, rerun after adding a post-barrier
  wake for input that was queued when the page hid. Ordinary batch timers are deliberately held in this
  case, proving that the lifecycle wake runs; renderer death then proves the journal-only boundary.
- With the flag absent, the selected default's native selection: **3 passed** — ordinary round trip,
  receipt-commit crash, lost answer/exact retry. **3 additional existing batch tests passed** for death
  before/after envelope commit and lost batch replies with later local sources. The native observer-close
  test passes with the default's completed-page publication and cold replay.
- Explicit `ACCOUNT_BATCH_MODE=reference`: the ordinary round trip and observer-close native cases both
  pass. A separate pre-integration baseline observer-close check also passes. The observer expectations
  differ deliberately: reference exposes frame A before a closing subscriber, batching exposes BA;
  both cold-replay all committed original frames.
- TypeScript, targeted lint and formatting, patched-Yjs check, ordinary and reference packaged builds,
  bundle-budget and origin-isolation checks pass. `VITE_ACCOUNT_BATCH=invalid` refuses configuration as
  intended. The Dockerfile forwards the rollback build argument; no container was published here.
- The bounded baseline/candidate paired application probes both pass (whole-text convergence, 300 keys
  per device). Both diagnostic sessions and all five fixed-history arms complete without a text mismatch.

Native commands use `node --test --test-name-pattern=...` directly on
`test/account-sync/native.test.mjs`, `test/account-sync/batch.test.mjs` and
`test/account-receive-editor/native.test.mjs`. Their retained logs list every selected test title;
unselected cases are not credited as passing. No browser test here used a real account or authenticator.

The default integration retains the explicit reference override. Its format compatibility follows from
unchanged persistent/wire codecs plus cold replay and exact-retry checks; this is not an exhaustive
mixed-version compatibility campaign. Absolute phone latency and rare suspension/transport behavior
remain outside this desktop sample.
