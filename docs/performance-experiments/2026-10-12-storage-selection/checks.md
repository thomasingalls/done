# Focused checks

This is a bounded performance/caller-isolation repair. Release validation remains paused.

The focused unit command is:

```sh
node node_modules/vitest/vitest.mjs run \
  test/warmContent.test.ts test/contentInterruptedReuse.test.ts \
  test/verifiedRecords.test.ts test/verificationOwnership.test.ts \
  test/incrementalLedger.test.ts test/accountConsumerPrimitives.test.ts
```

It covers full-load and selected-result mutation/erasure, forged/expired/foreign leases,
thrown and async selectors (including late async rejection), invalidation during validation or
selection, close during an awaited proof, counter/shape/audit refusal, and 20 seeded small generated
append/erase/resume histories comparing selections with full detached reads. Existing verifier
ownership and incremental/reference controls remain in the same run.

Native checks use:

```sh
ACCOUNT_SELECTIVE_LOADS=1 ACCOUNT_LEDGER_AUDIT=every \
  node --test --test-concurrency=1 \
  --test-name-pattern='one owner advances|reference audit disagreement|concurrent Account readers|generated incremental ledger histories' \
  test/account-sync/native.test.mjs
```

The existing native generated check contains three short histories; it is not a new exhaustive
campaign. It exercises source capture, submissions/decisions, compaction and cold continuation.
Reference-audit disagreement must refuse the owner and preserve cold-replay writing. Concurrent
readers must remain serialized. The packaged check uses:

```sh
node node_modules/@playwright/test/cli.js test \
  --config playwright.packaged-account.config.ts test/packaged-account/text-admission.spec.ts
```

The first typecheck found that a generic selection result could not be returned directly through
`SessionTask.step`'s synchronous type restriction. Selection now uses its own guarded synchronous
lease, retaining `step` for ordinary load results. Subsequent typechecks passed. This was a compile
failure, not a failed typing observation. Probe bundles were rebuilt after the async-selector guard
and preservation of authority-check placement; only the final hashed bundles enter the comparison.


## Final results

| Check | Result |
| --- | --- |
| Six focused unit files, final source | 41 tests passed |
| Native candidate checks, selection explicitly enabled | 4/4 passed |
| Native final default, selection flag omitted and audit every changed view | 4/4 passed |
| Final matched typing observations | 6/6 passed, including full block undo/redo and offline reopening |
| Packaged ordinary default build, two-device text journey | Passed; both-way delivery, remote-preserving undo and offline reopening |
| TypeScript, pinned Yjs, Vite production build, JS budget, origin isolation | Passed; initial JS 136.7 kB gzip / 350 kB budget |
| Scoped oxlint/oxfmt and Git whitespace check | Passed |

The native command was repeated with `ACCOUNT_SELECTIVE_LOADS` omitted after activation. The final
runtime differs from the timed candidate only in the default selector. Build commands ran through
installed Node binaries (`tsc -b`, `vite build` and the three existing build checks), with no changes
to dependencies or package-manager configuration. No release inventory or generalized campaign ran.
