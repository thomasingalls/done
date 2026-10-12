# Focused checks

Base signed `08a82089`. This slice remains local and uncommitted; no publication or release campaign.

- 277 units pass, one existing workspace test skipped: admission queue, workspace/undo, CPU budget,
  verified-buffer ownership, authority authentication. New controls include late local pressure,
  refused-head retry/discard, forced-write deadlock, close/drain, stale authority and changed old bytes.
- Three new native controls pass: edits and undo/redo during committed-undisplayed receive, actual
  renderer death with a later journalled edit, and changed custody inventory before final apply.
- Three existing native receive cases pass with prepared mode explicitly enabled: remote attribution/
  duplicates, invalid signature/authenticated conflict, pending structs/deletion through compaction
  and repeated cold opening.
- TypeScript, pinned Yjs, ordinary production build, initial JS budget (136.7/350 kB gzip), and origin
  isolation pass. Scope-specific lint passed before the final pressure guard change; repeat at close.

The first added workspace unit used an unimported comparison function; its 202 existing peers passed,
and the corrected cold comparison passes. The initial typecheck found an unchecked indexed byte in
one new test; its non-null assertion is corrected. Neither changed product behavior.

Before the final comparison, code review caught a pressure race: a page arriving after a local
storage refusal must prepare and wait behind that head, rather than halt receiving. A new regression
covers it. The preliminary comparison was stopped after its two silent sessions passed and during
its first active reference session. Those partial observations remain in the pilot directory and
are excluded from the final table. The final build also exposes budget checkpoints through the
existing cooperative full census and receipt checks. This was not a measurement-driven scope expansion.

```sh
node node_modules/vitest/vitest.mjs run test/admissionQueue.test.ts test/cpuBudget.test.ts \
  test/workspaceAdmission.test.ts test/verificationOwnership.test.ts test/accountAuthority.test.ts
ACCOUNT_PREPARED_RECEIVE=1 node --test --test-concurrency=1 \
  test/account-receive-editor/prepared.test.mjs
ACCOUNT_PREPARED_RECEIVE=1 node --test --test-concurrency=1 \
  --test-name-pattern='owned remote publication|invalid page|pending remote deletion' \
  test/account-receive-editor/native.test.mjs
```

Both targeted packaged journeys pass on the ordinary build: two-device history maintenance/delivery
and a joined device inviting a third, followed by writing on all three. Expected authority/grant
refusals during membership transitions recover inside that journey. All twelve **typing** sessions
have only HTTP 200 responses during their measurement windows.

```sh
node node_modules/@playwright/test/cli.js test --config playwright.packaged-account.config.ts \
  history.spec.ts membership-connection.spec.ts \
  --grep 'two native device owners|joined device invites a third'
VITE_ACCOUNT_LEDGER_PROFILE=1 VITE_ACCOUNT_PREPARED_RECEIVE=0 VITE_ACCOUNT_CPU_YIELD=0 \
  node node_modules/vite/bin/vite.js build \
  --config docs/performance-experiments/2026-10-12-prepared-receive/probe/build.config.ts \
  --outDir /tmp/done-prepared-receive-20261012/reference
VITE_ACCOUNT_LEDGER_PROFILE=1 node node_modules/vite/bin/vite.js build \
  --config docs/performance-experiments/2026-10-12-prepared-receive/probe/build.config.ts \
  --outDir /tmp/done-prepared-receive-20261012/candidate
python3 docs/performance-experiments/2026-10-12-prepared-receive/probe/run.py matrix
```

The final **native close/permit control passes**, bringing native coverage to seven focused cases.
Its initial run correctly refused the late capability but expected only the words “closed” or
“inactive”; the actual WriteSessionError says “write capability is no longer live”. That exact
cancellation message is now accepted. The repeat also confirms the second owner cannot acquire
its Web Lock until the held commit settles, and cold replay restores the remote content.
The failed assertion log remains alongside the successful one; no runtime repair was needed.

Both separate candidate diagnostics pass; they are excluded from `summary.json` and included in
`diagnostics.json`. Final typecheck, scoped lint and formatting pass. No application source changed
between the final matched matrix, diagnostics and final checks.

```sh
ACCOUNT_PREPARED_RECEIVE=1 node --test --test-concurrency=1 \
  --test-name-pattern='close drains a committed receive' test/account-receive-editor/native.test.mjs
python3 docs/performance-experiments/2026-10-12-prepared-receive/probe/run.py candidate active diagnostic profile
python3 docs/performance-experiments/2026-10-12-prepared-receive/probe/run.py candidate backlog diagnostic profile
```
