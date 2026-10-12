# Focused checks

Runtime change: `contentStore.appendRecords` retains only the authenticated counter of a completed
owned reservation whose exact predecessor matches the retained view. It does not add any rows,
advance semantic identity, reset audit progress, or clear resume invalidation. All existing load
checks and detached-return contracts remain. No crypto, wire, stored-format or scheduling change.

The new directed regression first failed against `008b2fa9`: the pre-commit load called `getAll`
three times. The first test draft accidentally called ordinary `load` with a selector instead of
`select`; that harness failure is retained separately. After correcting it, the expected full-read
control failed, and the runtime repair passed. Five added tests cover:

- load and selective projection during reservation, detached caller erasure, no speculative rows,
  no full read on an exact owned transition, final commit and full-read equality;
- changed shape, counter MAC and interior ciphertext refusal during pre-commit checks;
- resume and another owner's unknown transition forcing full reads;
- reservation transaction abort versus record-commit abort, no early reuse and burned sequence ranges;
- 20 generated small receive/abort/erasure histories, each checked against complete physical reads.

The test carrier uses real AES-GCM and HMAC with synthetic payloads. Semantic Account verification
is exercised separately by the existing native owner tests; the synthetic payload tests do not
claim to prove the whole Account protocol.

Commands:

```sh
node node_modules/vitest/vitest.mjs run test/warmContent.test.ts \
  test/contentInterruptedReuse.test.ts test/verifiedRecords.test.ts \
  test/verificationOwnership.test.ts test/incrementalLedger.test.ts \
  test/accountConsumerPrimitives.test.ts
ACCOUNT_LEDGER_AUDIT=every node --test --test-concurrency=1 \
  --test-name-pattern='one owner advances|reference audit disagreement|concurrent Account readers|generated incremental ledger histories' \
  test/account-sync/native.test.mjs
```

Initial results: **46 unit tests pass; four native checks pass**. Native checks include source
capture, submit/decision evidence, compaction, cold continuation, mandatory reference disagreement
refusal and serialized concurrent readers. TypeScript initially caught two exact-optional-property
errors in test scaffolding; correcting the optional fields passed typecheck without runtime changes.

The first packaged setup omitted `VITE_ACCOUNT_LEDGER_PROFILE=1`, so it stopped before typing
when the numeric metrics hook was absent. It is retained as `setup-no-metrics`, excluded from timing.
Both arms were rebuilt with the same profiling flag; the reference loader uses the exact base
`contentStore.ts`, avoiding working-tree rewrites between builds. The source/bundle hashes identify
those final instrumented arms. No failed typing result is silently replaced.

Release validation remains paused. This work does not launch a new conformance or mutation campaign.

## Final results

| Check | Result |
| --- | --- |
| Final focused units | 46 passed in six files |
| Native owner checks with audit-every | 4 passed |
| Unprofiled matched typing sessions | 12 passed; all 120 frame samples resolved per session |
| Separate diagnostic typing profiles | 2 passed |
| TypeScript and pinned Yjs check | Passed |
| Ordinary production build, JS budget and origin isolation | Passed; initial JS 136.7 kB gzip / 350 kB budget |
| Scoped lint, formatting and whitespace | Passed |

All fourteen browser observations pass undo/redo, convergence and offline cold replay. The two
diagnostics are not pooled with timing repetitions. Full release qualification remains paused.

## Measurement reproduction

Disposable paired fixtures are intentionally private and external to Git. Their hashes and locations
are in `source-identity.json`. The service snapshot named inside each fixture must remain paired
with its browser states; combining states from different runs is invalid.

```sh
mkdir -p /tmp/done-owned-reservations-20261012
git show 008b2fa9:src/crdt/contentStore.ts > /tmp/done-owned-reservations-20261012/reference-contentStore.ts
RESERVATION_REFERENCE_SOURCE=/tmp/done-owned-reservations-20261012/reference-contentStore.ts \
  VITE_ACCOUNT_LEDGER_PROFILE=1 node node_modules/vite/bin/vite.js build \
  --config docs/performance-experiments/2026-10-12-owned-reservations/probe/build.config.ts \
  --outDir /tmp/done-owned-reservations-20261012/reference --emptyOutDir
VITE_ACCOUNT_LEDGER_PROFILE=1 node node_modules/vite/bin/vite.js build \
  --config docs/performance-experiments/2026-10-12-owned-reservations/probe/build.config.ts \
  --outDir /tmp/done-owned-reservations-20261012/candidate --emptyOutDir
python3 docs/performance-experiments/2026-10-12-owned-reservations/probe/run.py matrix
```

The runner refuses existing observation names. Use fresh output names/directories when repeating;
do not overwrite the retained attempts. The base and candidate differ only in the recorded runtime
patch; the service, dependency lockfile and numeric instrumentation are shared.
