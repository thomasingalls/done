# Remaining parser conformance evidence — 2026-09-12

Baseline: signed `f0b6acd2e624d89034c88706d4053a830ab50cc6`. Command: `node scripts/account-parser-conformance/run.mjs`
(also `pnpm account:parser-conformance`). Node `v26.8.2`.
UTC execution: `2026-09-11T22:35:54.657Z` through `2026-09-11T22:39:30.918Z`.

**Passed: 46 stages, 141 Node tests, 44 selected unit cases, 884 unchanged source pins.**
All 30 vector commands, types, runtime census, authority map/registry, lint and format pass.
No test was skipped, stage timed out or current-code failure left unresolved.

| Stage | Executed tests |
| --- | ---: |
| registry | 13 |
| parser | 33 |
| parser-native | 1 |
| first-authority | 6 |
| promotion-contract | 10 |
| ledger-contract | 12 |
| transport-contract | 13 |
| admission-core | 12 |
| genesis | 17 |
| spool | 24 |
| unit | 44 |

The [source pins](./2026-09-12-account-parser-conformance/sources.json),
[summary](./2026-09-12-account-parser-conformance/summary.json), per-stage logs/JUnit and structured
reports are preserved in [the archive](./2026-09-12-account-parser-conformance/).
159 original JSON/log/XML files are byte-identical to the completed run. The original run remains at
`test-results/account-parser-conformance/2026-09-11T22-35-54.498Z`. This phase is complete, unstaged/uncommitted.

## New evidence

The 34 new tests comprise 33 Node parser/control tests and one native IndexedDB readback test.
They execute 14,491 incompatible nested-type cases and 3,350 generated cases across eleven properties
(seeds 112101–112111). Two additional expected-failure properties substitute the four original source
files from the signed baseline into an in-memory bundle. Each fails on its first run, shrinks once to
`[1]`, path `0:0`, and the current parser rejects that minimized input. Full fast-check details are
preserved, including [stage](./2026-09-12-account-parser-conformance/parser/baseline-promotion.json)
and [hash](./2026-09-12-account-parser-conformance/parser/baseline-spool.json) failures.
No generated counterexample remains in the repaired implementation.

Eight repaired predicates/traversals address string coercion in stage/source-hash/index metadata and
sparse credential/genesis arrays. Twelve omission controls accept the same malformed inputs after
removing the intended check. This includes a labelled dual-guard submission control. The original
nested matrix exposed 24 accepted type mutations and the sparse matrix 79 accepted hole variants;
these count repeated manifestations across stages, not separate vulnerabilities.

A real Yjs capsule parses at exactly 2,097,152 wire bytes; the next larger capsule in that fixture
(2,097,154 bytes) refuses. Direct admission checks accept the declared maximum snapshot/ciphertext
lengths and reject the next byte. These are parser edges, not a measurement of production UI latency
or proof of arbitrary-input complexity. Native readback confirms IndexedDB retains holes while the
repaired parser refuses, and accepts the valid record. No renderer death is claimed for that new test.

Existing A/C/D2/D3 byte and authority contracts, admission service histories, native promotion/genesis
and spool owners, selected startup/capture/spool/delivery unit checks all pass. The spool campaign
includes durable allocation, invocation, corruption, owner shutdown and restart behavior. The complete
Vitest suite, aggregate crypto audit, broader storage campaigns and all other Account owner suites were
not rerun. This result does not qualify platforms or power loss.

## Diagnostic history and preservation

The three initial logs under `diagnostics/` preserve development history; their evolving test source
is not claimed to have separate exact run pins. Initial failures exposed the coercions and sparse
arrays above. One harness-only failure passed a hex public key to Node's verifier as though it were a
KeyObject; the fixture now constructs the proper KeyObject, and an invalid signature returns false.
The final immutable-baseline controls supply reproducible before/after evidence independently of
those initial logs.

[Preservation](./2026-09-12-account-parser-conformance/preservation.json) verifies all 21 personal package
hashes, 31 prior vector files, the historical review and L-2. The prior phase's 875 source pins agree
with its signed commit; only the seven intentional current source/package/registry changes drift.
The 13 signed C/D1–D8/audit/F-15/isolation/composition commits remain recorded. Personal servers stayed
stopped. No real Account, browser, secrets, origin, routing or package deployment changed.

See the [inventory/contract](../account-parser-conformance.md) and
[current F-21.1 disposition](../review/implementation/account-parser-conformance.md).
