# Delivery evidence oracle campaign — 2026-09-12

Baseline: signed `77b0bb6239f7b7a48c4a52c74d3e3f39e39994a3`. Command: `node scripts/account-delivery-oracle/run.mjs`
(also `pnpm account:delivery-oracle`). Node `v26.8.2`.
UTC execution: `2026-09-11T23:02:39.125Z` through `2026-09-11T23:08:21.568Z`.

**Passed: 43 stages, 79 Node tests, 24 selected unit cases, 893 unchanged source pins.**
Types, all 30 vector commands, census/map/registry, lint and format pass. No skips, failed current-code
case or stage timeout. No production code, protocol format, registry or vector changed.

| Stage | Executed tests |
| --- | ---: |
| registry | 13 |
| oracle | 13 |
| native | 6 |
| ledger-contract | 12 |
| transport-contract | 13 |
| delivery | 19 |
| composition-order | 3 |
| unit | 24 |

[Source pins](./2026-09-12-account-delivery-oracle/sources.json),
[summary](./2026-09-12-account-delivery-oracle/summary.json), all per-stage logs/JUnit and structured
reports are in [the archive](./2026-09-12-account-delivery-oracle/). Its 110 original JSON/log/XML files
are byte-identical to `test-results/account-delivery-oracle/2026-09-11T23-02-38.969Z`. This new phase is complete, unstaged/uncommitted.

## What changed in the evidence

The named `test/accountDelivery.test.ts` now has 12 cases. Its generated case checks **500 histories**,
each forward, reversed and shuffled: **1,500 orderings and 9168 prefix comparisons**, seed
`1121060`, no failure/shrink. [Full fast-check result](./2026-09-12-account-delivery-oracle/unit/unit-histories.json)
is retained. This includes every `DeliveryState` field, status, sentinel-map reference/byte preservation
and proof immutability. Fixed cases pin first-value order differences, duplicates and conflict precedence.

The new reference intersects possible outcomes at observed positions. A separate enumeration checks
all **2,197 proof triples** against **80 complete service worlds**; 1,801 triples are contradictory.
This is exhaustive over that finite domain, not all protocol histories or cryptographic authority.

All twelve source controls fail the complete oracle. Four still satisfy every old observed field at
every tested prefix: overwrite first refusal ID, overwrite first final cutoff, clear submissions,
clear responses. The old oracle is executed from the signed baseline source. Reports distinguish
controls where this old-oracle comparison was performed from those where it was not assessed.

Six new native tests retain exact first IDs/cutoffs and original proof/submission/source/envelope bytes
through compaction and cold page/owner restart, in both arrival orders. Two inject retention faults;
status stays `conflict` but the full state is wrong. They use the existing synthetic acceptance signer
for contradictory claims, not a real finalization issuer. The copied observation occurs after the
real owner's authenticated census; no production test API or bypass was added.

The existing full native delivery suite, D3/C byte contracts and F-21.7 service-issued order campaign
also pass. F-21.7 executes twelve generated actual refusal/successor arrival histories with its original
seed/scope and verifies exact retained proofs. This is distinct from pure reducer histories that keep
folding after conflict; the actual owner refuses new proof writes after its first contradiction.

No production defect or unexplained test failure was found. Full Vitest, aggregate crypto audit,
broader Account/storage campaigns, supported-platform/power-loss qualification and actual provisioning
were not rerun or performed. Test bundles stayed in memory; no personal server started.

[Preservation](./2026-09-12-account-delivery-oracle/preservation.json) verifies 21 personal package hashes,
31 prior vector files, historical review and L-2. All fourteen recent signatures verify `G`. The parser
phase's 884 source pins agree with its commit; only the current package script and named unit test drift.
Unrelated root files and the personal Local installation remain unchanged.

See the [model and scope](../account-delivery-oracle.md) and
[current F-21.6 disposition](../review/implementation/account-delivery-oracle.md).
