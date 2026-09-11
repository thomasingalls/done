# Owned receive HTTP evidence — 2026-09-11

Private v2 service read was committed as `9598ca6`. The [recorded working patch](./2026-09-11-account-receive-transport/working.patch)
adds the next bounded [owned receive HTTP phase](../account-receive-transport.md) against that commit.
The new work remains uncommitted for review.

| Check | Observed result |
| --- | --- |
| Directed native HTTP | Nine cases pass: actual service bytes, refusal/truncation/overflow/redirect/lost/stale responses, superseded request, concurrent calls and local edits, close/drain, before/after native commit crash and cold retry |
| Generated native histories | 16 histories, seed 9112042; authored text, durable receive prefix and local source counts agree after each action and cold reopen |
| Stream property | 200 partitions, seed 9112041; exact detached bytes only within the bound and with complete declared lengths |
| Controlled admission regression | 200 generated interleavings plus directed ordering/close/capacity/source checks pass |
| Effective omissions | Four controls expose queue bypass, overlapping receive calls, stream overflow and premature completion before cancellation settles |
| Full units | 964 tests across 85 files pass |
| Affected campaigns | V1 transport, private v2 service and ordered receive editor pass, including their generated/mutation/native cases |
| Isolated build and trace | Yjs binding, TypeScript, Vite, budget, origin isolation and fresh prerequisite/trace chain pass; initial JS 329.6 KiB / 350 KiB, 101 claims, 28/28 named current-defect falsifiers, nine retained debts |
| Scoped static checks | TypeScript, lint, formatting and diff checks pass |

[Final campaign summary](./2026-09-11-account-receive-transport/campaign/summary.json),
[native log](./2026-09-11-account-receive-transport/campaign/native.log),
[generated histories](./2026-09-11-account-receive-transport/campaign/generated.json),
[omission results](./2026-09-11-account-receive-transport/campaign/controls.log),
[regressions](./2026-09-11-account-receive-transport/regressions/summary.json), and
[isolated build](./2026-09-11-account-receive-transport/build/summary.json).

The queue omission commits a receive position without publishing its remote text to the editor. The
flight omission dispatches two overlapping calls where the baseline returns busy for the second. The
stream bound omission returns 17 bytes against a 16-byte bound. The cancellation omission returns before
the stream's delayed cancel callback settles. Each control first checks a passing baseline and then observes
the forbidden result from the altered production source; no timeout or harness failure counts as detection.

The first native run correctly refused a truncated response, but a test asserted the wrong error text.
The initial campaign found a TypeScript mock-signature error; the failed run is retained. Static checks
also prompted an unused-import removal and a Node/browser test-variable rename. Final source review moved
response ownership outside the carrier task's final lifetime check so rejected late results still erase
their captured buffers. The final campaign includes an additional local-edit-during-fetch case and exact
final source hashes. Both complete generated campaigns found no counterexample. Earlier results and
[findings](./2026-09-11-account-receive-transport/findings.json) are retained.

**Build-directory incident.** A validation helper initially ran in the root and replaced predecessor
`dist/`. No server was started. The predecessor was restored from
`test-results/app-upgrades/2026-09-10T12-45-12.641Z/prior`; all eleven hashes match the saved pre-build
manifest. The ten-file retained personal release was unchanged. [Restoration evidence](./2026-09-11-account-receive-transport/build-directory-incident/dist-restoration.json)
records the source and comparisons. A separate complete build/trace chain then passed in
`/private/tmp/done-receive-transport-9598ca6`. The accidental output remains only in ignored test results.
Root trace receipts from that accidental build describe its temporary output; they do not validate restored
predecessor `dist/`. The archived isolated receipts describe the actual tested candidate.

[Verification](./2026-09-11-account-receive-transport/verification.json) compares final campaign code inputs
and isolated runtime inputs with current files, and verifies the unchanged historical review and L-2
checkpoint. Documentation was completed afterward. The earlier regression/build campaigns precede only
an added transport-native test and documentation; production code matches. The patch and
[artifact manifest](./2026-09-11-account-receive-transport/manifest.json) identify the retained evidence.

This is targeted phase validation, not another full `pnpm check`. The new command
`pnpm account:receive-transport` is appended to that aggregate. No personal browser, factors, Account,
route, deployment, reconnect scheduler or v9 outbound composition was activated. The first-epoch creating
publisher and existing receiver envelope/batch limits remain. No whole-protocol debt is paid; accepted
review gates before real Account use remain visible in the checkpoint.
