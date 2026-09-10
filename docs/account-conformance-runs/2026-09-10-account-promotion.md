# Local promotion preparation — bounded evidence

Parent: signed `e96107b` (`Add private authority root and verified Local promotion preflight`). The
[implementation contract](../account-promotion.md) defines the new private APIs and exact carrier/proof
bytes. This result prepares device custody while the index stays Local; it does not activate accounts
or establish complete encrypted sync. The personal preview and relay stayed off.

## Passing evidence

The final `account:promotion` campaign ran from
`test-results/account-promotion/2026-09-10T16-01-14.780Z`:

- **18 tests pass**, 26.58 seconds, no failed/cancelled/skipped tests.
- **120 generated service histories**, seed `9202026`, combine current-state reads, abandonment,
  restart, wrong capabilities and historical receipts against an independent cancellation ledger.
- **45 generated native browser histories**, seed `9192026`, combine preparation, owner restart,
  wrong factors, authenticated-marker corruption/restoration, aborted reservation, writing and
  abandonment against stable-key and consumed-budget expectations. Failures stop without shrinking.
- Independent LP/signature reconstruction; wrong pin/nonce/account checks; current eligibility refuses
  after cancellation even when the historical recovery receipt still reports success. Missing,
  expired and cancelled recovery ceremonies can be explicitly abandoned, never recycled.
- Two actual SQLite **SIGKILL** boundaries around abandonment; two actual renderer deaths after
  reservation/key commits; two request-success-before-commit aborts. Uncommitted encryption attempts
  burn a fresh reservation on retry; committed prepared keys retain the exact public identity.
- Native journal survival, unchanged original custody/content/index, synthetic authenticated imported
  provenance, missing-counter refusal, exhausted seal budget, competing tabs and cancellation with a
  pending transport. Lost service replies and aborted local removal retain retryable preparation.
- Recovery owner coverage includes unsaved/cancelled codes, lost abandonment response, exact draft
  handoff into preparation, retained recovery capability while promotion exists, and refusal of an
  unknown Local reference before any service request.
- Two **observed acceptance controls**: disabling promotion MAC rejection admits an altered intent ID;
  removing current attempt/recovery checks admits an already-abandoned account. Both baselines refuse.
  The preserved control JSON contains the actual observed outcomes, not inferred mutation labels.

Additional affected regressions pass:

| Campaign | Evidence |
| --- | --- |
| Private authority/preflight | 14 tests; 160 generated root histories and 40 generated browser histories; process death and acceptance controls |
| Account core | 30 tests; 240 generated histories, process death, virtual passkeys and acceptance controls |
| Recovery preparation | 25 tests; 160 generated histories, process death, browser restart and acceptance controls |
| Writer lifetime | 13 native cases, all five deliberate faults detected |
| Local genesis | 17 native cases, all four deliberate faults detected |
| Storage compatibility | Five native cases, including an actually admitted incompatible writer with the refusal check removed |
| Existing unit suite | 825 tests in 73 files, 34.50 seconds |

TypeScript, focused lint/format checks and all 13 final repository/build gates pass. The isolated
application build is at `test-results/account-promotion/2026-09-10T15-53-05.391Z/app-build`; initial JS
is **328.0 / 350.0 kB** under the project's budget check and origin isolation passes. No build overwrote
`dist/` or `.dev/releases/17d87c2/app`. Build checks used the isolated output through a `dist` symlink in
the final campaign's `build-checks` directory.

[Preserved files](./2026-09-10-account-promotion/manifest.json) include source hashes, logs, JUnit and
summaries, observed controls, the affected regression reports, unit/build logs and final gate output.
The compatibility source hash inventory was captured after its passing run; its listed sources were
unchanged during that run. No full `pnpm check` invocation or complete platform/device matrix is claimed.

## Findings while constructing the campaign

The initial crash harness awaited the CDP command's response after killing its renderer, causing two
30-second timeouts. It now waits for the crash event and closes the dead page. The first MAC-control
build ran its transform after source conversion and missed its guard anchor; it now targets the original
source before conversion and demonstrates actual bad acceptance.

Three older regression fixtures copied incomplete dependency lists: the account/recovery control copies
omitted the new shared protocol imports, and the writer-lifetime copy could not resolve the promotion
module. Those were harness errors, not passes or production refusal evidence. The corrected fixtures
include/pin the dependencies; their final campaigns pass, including their deliberate controls. The
unresolvable writer run was stopped instead of waiting through each identical fixture timeout.

Final review also found a production regression introduced in the preflight refactor: the public
wrapper read caller-owned options after waiting for a slot permit. Changing those options could make
it inspect slot B while holding slot A's permit. The retained focused browser reproduction fails with
`actual: snapshot-b` / `expected: snapshot-a`. The wrapper now copies its options and independently
parsed pin before requesting the lock. The added native regression and all refreshed affected campaigns
pass on that source. This was found by review plus a directed test, not by the generated histories.

A manual inventory review tightened recovery reset to require the full Local census, preserving its
capability when an unknown Local reference is present. The added native case verifies that refusal and
that it happens before a service request. The generated histories did not yield a production
counterexample in this campaign; that is a bounded observation, not proof that none exists.

## Limits and next work

These tests cover the represented single-generation Local preparation protocol in disposable Chromium
and SQLite on this host. They do not certify power loss, rollback/cloned profiles, hostile in-process
code, production service-key distribution, all browsers/devices or the full protocol. Historical root
and Local imported-selection tests retain their existing stated assumptions.

Next: prepare a journal-inclusive genesis checkpoint and exact device/recovery key wraps under the
retained owner, with authenticated progress and crash coverage. Current service eligibility, certified
recipients, authorization/acceptance head, activation and verified Local-to-Account index handoff must
then be committed by their own owners. No whole-protocol debt or matrix status is changed here.
