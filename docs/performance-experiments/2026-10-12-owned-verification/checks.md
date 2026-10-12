# Focused checks

Completed 2026-10-12; no generalized qualification campaign.

| Check | Result |
| --- | --- |
| Five focused Vitest files below | 34 tests passed |
| Three final matched CPU-4x pairs | 6/6; each 120-key undo/redo and offline reopening passed |
| Candidate pilot and separate baseline CPU profile | Both passed; excluded from final paired timings |
| Native compaction/submit/cold replay, independent audit refusal, existing generated histories, concurrent reader serialization | 4/4 passed with ownership enabled and reference audit on every changed view |
| Default packaged two-device text journey | Passed; remote-preserving undo, both-way delivery, journal-only offline reopening and later delivery |
| Production TypeScript, pinned Yjs, Vite build, budget and origin isolation | Passed; initial JS 136.7 kB gzip / 350 kB |
| Scoped lint/format and `git diff --check` | Passed |

Unit command:

```sh
node node_modules/vitest/vitest.mjs run \
  test/verifiedRecords.test.ts test/verificationOwnership.test.ts \
  test/incrementalLedger.test.ts test/warmContent.test.ts test/accountConsumerPrimitives.test.ts
```

The generic and owned verifier both run the existing mutation, projection, late completion and
overlap controls. New tests exercise actual private prefix identity, caller erasure isolation,
subarray backing-buffer lifetime, failed proofs, late invalidation and 40 seeded small generated
append/replacement histories against the cloned reference. Primitive tests retain the detached
typed-array behavior. The first typecheck caught test options explicitly passing `undefined` under
`exactOptionalPropertyTypes`; the options construction was corrected and the rerun passed.

Native command:

```sh
ACCOUNT_RECORD_OWNERSHIP=1 ACCOUNT_LEDGER_AUDIT=every \
  node --test --test-concurrency=1 \
  --test-name-pattern='one owner advances|reference audit disagreement|concurrent Account readers|generated incremental ledger histories' \
  test/account-sync/native.test.mjs
```

The generated native check is the existing three short histories, not a new exhaustive campaign.
It covers inserts/deletes, compaction and cold continuation. The audit disagreement control must
refuse the owner and preserve cold-replay writing. Serialization must prevent two reader jobs from
borrowing/erasing the same predecessor concurrently.

After enabling the new default, the ordinary production build passed this packaged command:

```sh
node node_modules/@playwright/test/cli.js test \
  --config playwright.packaged-account.config.ts test/packaged-account/text-admission.spec.ts
```

Build commands were run directly through the installed Node binaries, as in the previous slice:
`scripts/check-yjs-patch.mjs`, TypeScript `-b`, Vite `build`, `scripts/check-budget.mjs`, and
`scripts/check-origin-isolation.mjs`. No package-manager configuration or dependencies changed.
The final source differs from the comparison candidate only in default selection; runtime hashes
record both states. The generic cloned verifier and explicit override remain available.
