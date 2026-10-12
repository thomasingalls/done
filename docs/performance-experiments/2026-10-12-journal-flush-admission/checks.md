# Focused safety checks

Release validation remains paused. These tests support one admission scheduling change.

## Unit checks

```sh
node node_modules/vitest/vitest.mjs run \
  test/admissionQueue.test.ts test/workspaceAdmission.test.ts test/warmContent.test.ts
```

Controlled flush gates distinguish the reference and candidate: candidate input journals and
promotes while the old copy is held; the reference waits. Tests cover the newer journal suffix,
remote/barrier fencing, forced content after journal refusal, failure before a forced commit,
retry, new batch deadlines and draining on close. Existing generated flush/idle schedules run
in both modes (24 histories each), preserving acknowledged state and bounding maintenance.
Workspace tests retain actual text/undo/admission semantics; warm-store checks keep isolation.

## Actual browser storage

```sh
ACCOUNT_BACKGROUND_FLUSH=1 node --test --test-concurrency=1 \
  --test-name-pattern='timed Account flush' test/account-sync/native.test.mjs
```

The fixture inserts awaitable gates in the real journal owner, just before content commit and
just after content commit/before journal cleanup. At each gate another local edit must complete
without releasing it. Both normal continuation and renderer death then recover the full writing,
with exactly two extra source capsules and no duplicate capsule ids. The Account owner, custody,
crypto, source capture and native IndexedDB/localStorage remain real. An actual renderer crash
is used rather than a mock exception. The manual Account editor isolates this from unrelated
network polling. No storage or credential state is retained in the evidence archive.

## Product and build

The final default will also run the existing packaged two-device text-admission journey and the
focused native own-submit/compaction/replay regression. The packaged journey covers two-way
updates, local undo retaining a peer's edit, journal-only offline reopen and subsequent delivery.
TypeScript, production build, pinned Yjs, initial-JS budget, origin isolation, scoped lint/format
and whitespace checks remain required. Final outcomes and exact retained logs are in the README.

## Final results

| Check | Result |
| --- | --- |
| Three unit files | 264 passed; one existing skipped test |
| Native flush gates, explicit candidate | 4/4 passed |
| Native final default, no switch, gates plus own-submit/compaction/replay | 5/5 passed |
| Initial diagnostic and six matched sessions | 7/7 passed, including undo/redo and cold replay |
| Packaged ordinary default, two-device text journey | Passed |
| TypeScript, pinned Yjs, Vite, JS budget, origin isolation | Passed; initial JS 136.7 kB gzip / 350 kB |

For the final native run, omit `ACCOUNT_BACKGROUND_FLUSH` and use
`--test-name-pattern='timed Account flush|one owner advances'`. The packaged command is:

```sh
node node_modules/@playwright/test/cli.js test \
  --config playwright.packaged-account.config.ts test/packaged-account/text-admission.spec.ts
```

The final runtime differs from the measured candidate only by default switch activation.
No focused test or timed run failed. The first unit command also named a nonexistent
`test/accountTextPreparation.test.ts`; Vitest selected the three real files reported above.
The actual text preparation/undo checks run in `workspaceAdmission.test.ts` and the packaged
journey; no fourth unit file is claimed. Scoped lint/format and Git whitespace checks pass.
