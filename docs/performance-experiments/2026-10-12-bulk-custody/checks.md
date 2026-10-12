# Focused correctness checks

Base signed `902806c9`. No generalized conformance or release-validation campaign.

- `node node_modules/vitest/vitest.mjs run test/custodyBulkRead.test.ts test/accountAuthority.test.ts test/ownedStartup.test.ts test/writeSession.test.ts test/workspaceAdmission.test.ts`: **269 pass, one existing workspace-admission skip**. Includes 100 seeded bulk-versus-cursor inventory comparisons, UTF-16 prefix boundary strings, row-limit refusal, detached caller results, next-check changed/missing/extra inventory, authentication invalidation and existing text/undo tests.
- `node --test --test-timeout=60000 test/custody-bulk/native.test.mjs`: **5 pass**. Actual IndexedDB empty binary/nested-array suffixes, 32/33 rows, neighboring slots, one-snapshot reads against a concurrent write, abort/drain/permit ordering, version change and missing-database preservation.
- `VITE_ACCOUNT_BULK_CUSTODY=1 ACCOUNT_PREPARED_RECEIVE=1 node --test --test-timeout=90000 test/account-receive-editor/prepared.test.mjs`: **3 pass**. Local journalled text and undo/redo during durable remote preparation, crash before display, and a changed custody inventory blocking final promotion.

## Corrections retained in evidence

The first generated run shrank to an empty binary suffix inside a nested array. `fake-indexeddb`
6.2.5 explicitly treats a zero-byte view as possibly detached and rejects it at fixture insertion.
The unit generator now uses nonempty binary keys; the native case retains and passes empty binary
keys. No runtime code was changed for that emulator limitation. Original failure and seed/path remain.

The first native abort observer was registered after `contentTransaction.onabort`, so its notification
could run after promise reactions had already disposed the owner. Setting its capture flag did not
change that observed ordering. Registering the observer at transaction creation, before the production
settlement handler, establishes native abort before disposal and the next owner. Both unsuccessful
observer versions' logs are retained. This was a harness timing correction; no production lifetime or
settlement code was changed to make it pass.

Comparison-session guardrails, build/type/lint checks and exact identities are recorded with the final
results. Diagnostic service/browser fixtures stay in scratch storage and are excluded from the archive.

## Final opt-in disposition

The unit inventory/authentication case passes with both the default cursor and the explicit bulk
flag. Native custody cases define `VITE_ACCOUNT_BULK_CUSTODY=1` in the bundle; the final prepared
receive repeat also sets it explicitly. Final TypeScript and scoped lint/format checks pass, as do
the ordinary production build and every HTML entry's initial-JS budget. The ordinary build retains
the cursor. All eight comparison sessions pass undo/redo, convergence and cold replay, with no
unexpected typing-window HTTP refusals. Performance failed the adoption threshold; correctness
results alone do not justify enabling the experiment.
