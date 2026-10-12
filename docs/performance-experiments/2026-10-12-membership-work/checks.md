# Focused checks and retained non-passes

Base signed `b656553a`. Product work only; release validation is still paused.

- Four Vitest files (`cpuBudget`, `accountAuthority`, `workspaceAdmission`, `writeSession`):
  **230 pass, one existing skip**. Includes lifetime checks on both sides of a yield and existing
  unchanged-inventory, invalidation, text/undo and ownership cases.
- Membership locator/history/adoption/rotation/cancellation: **20 pass**. New locator cases yield
  inside nested verification, mutate caller inputs at the first yield (captured input still wins),
  cancel at a nested checkpoint, retry freshly, and reject bad reply/request/nested signatures and
  expired requests. Existing tests cover signed forks, reader eligibility and ancestry.
- Focused rotation-history, recovery-transition and ceremony-exchange files: **17 pass**.
- Prepared receive native cases: **3 pass**, preserving local journalled text and undo/redo while a
  remote receipt is committed but undisplayed, crash replay, and fresh changed-authority refusal.
- Six disposable packaged handoff controls: **6 pass**. One unchanged discovery uses the private
  verified result. A replaced inbound context, changed expected-payload identity, expired request,
  closed owner, or extra native custody row refuses at the boundary, with no transfer on that attempt.
  Controls are test-build-only and are absent from measured/ordinary bundles.
- Two complete-operation diagnostics pass: unchanged discovery checks authority three times in both
  arms, while the private transfer removes duplicate proof work and two full custody authentications.
- All eight matched typing sessions preserve exact text, undo/redo, peer writing, convergence and
  cold offline replay. Completed account requests during typing are HTTP 200 in all eight.
- TypeScript, scoped lint/format, ordinary build and JS entry budgets pass. The archive manifest is
  checked against every retained entry. No general validation campaign was run.

## Harness corrections

The first control build required a disposition anchor to be globally unique, but it also occurs in
older discovery. Scoping the match to the membership branch corrected the transform. The mistakenly
started run against the missing bundle failed all six setup cases; both logs remain.

The next control run passed four of six. The context case read the counter after a legitimate new
retry had already succeeded; it now snapshots the counter at the refused attempt. The close case
closed the owner before the opening helper could assert a visible editor; controls now arm only
once opening and a prior complete discovery have finished. The final six-case run passes. No product
code was altered to make these controls pass. Keep the unsuccessful and final logs separately.

## Unintentionally broad legacy regression selection

An initial regression command included the 6,600-line `account-ceremony/content-transfer.test.mjs`
file. That selected far more service/schema/browser work than intended, with sandbox `EPERM` errors
alongside existing failures. The exact identified processes were stopped; the partial log is retained.
This was not a release campaign and is not passing evidence. Do not report the broader suite as green.

The observed names were then narrowed and compared under the needed native permissions against a
scratch checkout of signed `b656553a` and this candidate. Both report **20 tests: 5 pass, 15 fail**,
with the same failing names and assertion-value pairs. Several expect schema 25 where the runtime
is at 26; others report existing continuation/fixture outcomes. This comparison establishes no new
failure in that selected set; it does not repair or dismiss the baseline failures. The initial
baseline attempt lacked required `docs/account-crypto` vectors and failed setup; the corrected copy
uses the unchanged repository vectors. All logs and the name comparison are retained. No unrelated
service tests or schema expectations were changed.
