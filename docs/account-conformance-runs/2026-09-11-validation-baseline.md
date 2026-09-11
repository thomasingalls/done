# Aggregate validation baseline evidence — 2026-09-11

Editor integration was committed separately as `19586b6`; the unchanged annotated review was archived
as `500630f` in [docs/review/implementation](../review/implementation/README.md). This phase addresses
F-01, F-02 and F-20 and the four further harness defects found while validating them.

**The actual `pnpm check` command passed**, exit 0, in 73.2 minutes. It ran in
`/private/tmp/done-validation-500630f` at `500630f` with the recorded working patch and added lifecycle test.
The isolated checkout preserves the author's personal bundles while allowing the aggregate's builds.
[Summary](./2026-09-11-validation-baseline/aggregate/summary.json),
[complete command output](./2026-09-11-validation-baseline/aggregate/check.log),
[tested sources](./2026-09-11-validation-baseline/aggregate/sources.json),
[patch](./2026-09-11-validation-baseline/aggregate/working.patch), and
[added harness test](./2026-09-11-validation-baseline/aggregate/lifecycle.node.mjs).

| Check | Result |
| --- | --- |
| Private v2 vectors | Five existing positive cases unchanged; 20 new isolated HKDF/AAD/signature negatives; WebCrypto consumption in the unit suite |
| Field-elision audit | 225 bound fields isolated by published negatives |
| Full unit suite | 958 tests in 84 files pass |
| Native startup-error regression | Four deliberately occupied ports produce exit-2 harness reports promptly, within the 20-second limit; no mutation credit |
| write-session | 13 baseline cases pass; 5 effective mutations detected |
| custody | 13 baseline cases pass; 5 effective mutations detected |
| content | 13 baseline cases pass; 5 effective mutations detected |
| journal | 17 baseline cases pass; 6 effective mutations detected |
| Native carrier properties | Six saved regressions and 120 generated histories pass; 11,461 recovery comparisons; all four mutations detected and independently replayed; no missing required coverage |
| Remaining aggregate stages | Migration capture/export/import/selection/cleanup/coordinator/host fixtures, application startup/geometry/packaging/upgrades/compatibility, traceability, and all Account stages through ordered remote editor pass |
| Scoped static checks | Lint, formatting and diff checks pass; TypeScript and vector generation/checks ran inside the aggregate |

The command retains its configured skips: geometry reports 84 passing tests and ten skips; upgrades
report seven passes and one skip. The optional predecessor-specific upgrade case is skipped because no
personal predecessor bundle is supplied. Synthetic upgrade cases still execute; this run is not a new
personal-upgrade walkthrough.

[Implementation notes](../validation-baseline.md) explain the isolation rules, source snapshots and
lifecycle oracle. [Findings](./2026-09-11-validation-baseline/findings.json) distinguish the port collision,
resource leak, escaped mutation, fixture readiness race, refusal assertion and runner preflight mistake.
The early lifecycle mutation
[survived in a preserved failed aggregate](./2026-09-11-validation-baseline/escaped-lifecycle-mutation/summary.json).
Its [report](./2026-09-11-validation-baseline/escaped-lifecycle-mutation/report.json) shows the inadequate
observation. The repaired test records work-release/disposal order locally and explicitly awaits native
predicates; the inspected Playwright polling behavior is retained in
[polling verification](./2026-09-11-validation-baseline/polling-verification.json).

The compatibility startup failure and the failing Account suffix are preserved separately under
[compatibility-startup-failure](./2026-09-11-validation-baseline/compatibility-startup-failure/) and
[account-suffix-before](./2026-09-11-validation-baseline/account-suffix-before/). A deliberately delayed
fixture passes with the readiness wait and fails under an actual wait-removal mutation, recorded in
[compatibility-control](./2026-09-11-validation-baseline/compatibility-control/). The repaired editor test
checks typed refusals for both malformed hex and an altered canonical signature, with no visible or
source-capture change; its focused result is retained in
[editor-refusal-repair.log](./2026-09-11-validation-baseline/editor-refusal-repair.log).

A first aggregate was deliberately superseded to include server-start cleanup. Another inventory attempt
failed before executing `pnpm check` because the dependency symlink was treated as a file. Neither is a
passing gate. Earlier focused reports are retained with their own source hashes; the final aggregate is
the result for the complete repair. The isolated checkout retains the other detailed campaign artifacts;
the [raw-result index](./2026-09-11-validation-baseline/raw-result-index.json) hashes their reports.

The Account delivery native stage completed in 166.4 seconds under its new 480-second limit. The two large
spool properties retain all 150 runs with explicit 30- and 15-second deadlines. These measurements do not
establish performance on other hosts. Other historical harnesses were executed,
not comprehensively audited for assertion strength or every timing failure.

[Verification](./2026-09-11-validation-baseline/verification.json) confirms all 2204
recorded files in the tested checkout remained unchanged and all 21 files
in the retained Local release and predecessor `dist/` matched their before-run hashes. No personal browser,
factor, Account, relay, preview server, host policy or deployment was changed. The review archive itself
remains unchanged. No production protocol code or whole-protocol debt was changed/paid.

The next bounded phase is the v2 service read route with explicit reader/publisher resolution and
credential/member identity agreement. Receive transport/reconnect, v9 sender composition, real enrollment
and adoption follow separately. Accepted protocol, capacity, recovery, activation, power-loss and product
findings remain open as recorded in the checkpoint.
