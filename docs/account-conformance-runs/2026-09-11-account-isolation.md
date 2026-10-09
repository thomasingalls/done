# Cross-account admission isolation campaign

Base: signed `c10dee3c850c5e56ced82657fe0dbb8b2ac3d053`. Executed 2026-09-11, Node v26.8.2,
21:37:11–21:41:58 UTC. [Scope and contract](../account-isolation.md),
[current F-21.3 disposition](../review/implementation/account-isolation.md).

**Passed: 44 stages, 205 Node tests, 865 matching source pins.**
The [summary](./2026-09-11-account-isolation/summary.json) records exact commands, exit statuses,
per-stage counts and timeouts. All nine Node stages contain executed tests with no skip, failure or
timeout. Types, 30 vector commands, census/map/registry, lint and formatting also pass.

| Node stage | Tests |
| --- | ---: |
| Construction registry / prep contracts | 13 |
| New account isolation | 23 |
| Admission | 34 |
| Activation | 25 |
| Account core | 28 |
| Recovery | 24 |
| Handoff | 21 |
| Service delivery | 32 |
| Admission bounds | 5 |

The affected shared-fixture consumers and their owning suites were selected, including native admission,
activation, handoff and service-delivery tests. A full Vitest/unit sweep, full crypto audit and broad
storage campaigns were not rerun for this test-only change. No production source or valid format changed.

## New execution and effective controls

The five [directed matrices](./2026-09-11-account-isolation/isolation/matrix-active.json) total 148 mixed
requests, covering both directions across pending/offered/challenged/active/cancelled accounts.
[Live recovery](./2026-09-11-account-isolation/isolation/live-recovery.json) adds eight genuine proof/token
swaps before either confirmation. Negative checks require non-malformed refusal and exact whole-database
invariance. Positive controls verify legitimate activation, account-bound bindings and exact cold retry.
Both accounts use the same service and authority, with distinct identities and Ed25519/ES256 passkeys.

[Generated evidence](./2026-09-11-account-isolation/isolation/generated.json): seed `112103`, 160
histories, arrays of 5–35 commands, shrinking enabled, no production counterexample. The runner preserves
actual histories, terminal states and executed-command counts. It observed 108 cross-offers, 121
cross-abandonments, 147 cross-inspections, 7 cross-challenges, 8 cross-finishes and 38 cross-bindings;
117 restarts and 86/21/3 offer/challenge/finish loss commands executed. Pure foreign-proof substitutions
are covered by the directed matrix, not claimed from this random sample. Separate complete histories
exercise all three operations at both commit cuts with a live neighbor and end with both accounts active.

The oracle predicts durable account/recovery/attempt state, activation proof hashes, credential counters
and exact retained receipts from commands and cut placement. It observes random offer/seal bytes once
and then requires immutability. Every legal action preserves the neighbor's full rows; every mixed-input
refusal preserves all rows, including authority/global state. It does not import the production reducer.

Six [process-death cases](./2026-09-11-account-isolation/isolation/admit-promotion-after-commit.json)
SIGKILL before/after each offer, challenge and admission commit. Cold retries preserve committed bytes,
roll back uncommitted work, reject a neighboring token and allow both accounts to activate. Another test
uses two live service processes for independent offers/completions and exact receipt readback.

| Control | Observed bad outcome when the real check is omitted |
| --- | --- |
| [Capability owner lookup](./2026-09-11-account-isolation/isolation/control-selector.json) | The unknown key still refuses, but a recognized B capability obtains A's genuine signed offer. |
| [Explicit pending target](./2026-09-11-account-isolation/isolation/control-pending-target.json) | A crossed abandonment request is accepted and cancels the capability owner's registration/recovery. |
| [Scoped cancellation SQL](./2026-09-11-account-isolation/isolation/control-scope-generated.json) | A's abandonment cancels B's proposed promotion. Full-row oracle detects it; seed `112104`, five shrinks, path `0:1:1:2:2:2`. |

Controls change temporary source copies, preserving actual parsers, signatures and SQLite transactions.
The shrunken cancellation suffix is `abandon A; offer A` after two offers; the first command already
changes B's row. This is a counterexample to the intentional mutant, not a production defect. Earlier
focused-run mistakes (binding-kind expectation and a fast-check callback returning a non-boolean result)
were harness errors, corrected before this final campaign. They are not classified as protocol findings.

## Reproduction and preservation

Run `pnpm account:isolation`. It writes a timestamped `test-results/account-isolation/` directory with
source pins, per-stage logs, JSON reports, JUnit, heartbeat output and bounded process-group cleanup.
This archive preserves 126 original files byte-for-byte, plus a separate
[preservation receipt](./2026-09-11-account-isolation/preservation.json). Original absolute paths in
commands identify the execution location; they are not paths required to replay the tests elsewhere.

All 21 personal package hashes, 31 prior vector files, historical review and L-2 suffix match their
pre-phase values. The latest eleven commits have valid signatures; the prior F-15 phase is signed as
`c10dee3`. Personal app/relay remain stopped; no root build, real browser action, Account provisioning,
factor, operator key, pin, origin or routing change occurred. Temporary bundles stayed in memory.

This closes F-21.3 at the tested private admission boundary. The synthetic service fixtures do not prove
all encrypted-content semantics, multi-device enrollment, general recovery, HTTP exposure or platform
qualification. Service-issued refusal/conflict composition and the other review obligations remain.
