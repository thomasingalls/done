# Service-issued decision composition campaign

Base: signed `2bbb4c6be75f93b3516b57605cf7b13770f5e3b6`. Recorded 2026-09-12 (Europe/Paris); execution timestamps are UTC in
[summary.json](./2026-09-12-account-decision-composition/summary.json).
[Contract and fixture scope](../account-decision-composition.md),
[current F-21.7 disposition](../review/implementation/account-decision-composition.md).

**Passed: 47 stages, 112 Node tests, 40 selected unit cases and 875 matching source pins.**
No stage timed out and no test was skipped. Types, all 30 vector commands, census/map/registry,
lint and formatting also pass. All 24 new tests passed. No production defect was found and no
production source, valid protocol format or vector changed.

| Test stage | Executed tests |
| --- | ---: |
| registry | 13 |
| composition-native | 9 |
| composition-restart | 8 |
| composition-controls | 3 |
| composition-generated | 1 |
| composition-order | 3 |
| service-delivery | 32 |
| decisions | 6 |
| delivery | 19 |
| driver | 11 |
| sync | 7 |
| unit | 40 |

The affected service decision, response verification, durable delivery, automatic sender and composed
sync regressions accompany the new tests. The five unit files cover decision validation, delivery,
sender and both scheduler implementations. Full Vitest, the aggregate crypto audit, broad storage
campaigns and inherited generated sync campaigns were not rerun for this test-only phase.

## Genuine issuance and exact retained outcomes

The synthetic admitted device signs a generation-2 restamp of its original ciphertext. Actual
`decideSubmission` issues and persists a matching permanent refusal. An original generation-1 retry
returns it byte-for-byte. For conflict, a fresh valid encrypted alternative from the same synthetic
credential is accepted first, and the browser receives the service's persisted winning head. This is
an intentionally faulty/branched test writer, not a supported credential-cloning or successor API.
No fixture acceptance signer mints the tested response.

Direct HTTP, automatic sender and shared sync paths preserve exact submissions, ciphertext, source
capsules and decision bytes. Duplicate and invalid answers write no proof. Lost HTTP replies retain
pending work; cold retry does not reseal. Later Local edits and content compaction retain the original
writing and proof rows. Four service SIGKILL and four renderer-death cases cover both sides of actual
service decision and IndexedDB response commits, including the atomic spool witness.

The [native retry/reopen campaign](./2026-09-12-account-decision-composition/composition-generated/generated.json)
uses seed `112107`: 16 histories, shrinking enabled, no production counterexample. Commands include
43 restarts, 15 lost replies, 31 deliveries, 38 duplicate attempts, 16 invalid responses, 15 edits and
16 compactions (including forced terminal delivery/restart checks). History/state/hash evidence is
preserved; no random-only coverage claim substitutes for the directed commit cuts.

The [arrival-order campaign](./2026-09-12-account-decision-composition/composition-order/generated-order.json)
uses seed `112108`: 12 histories, shrinking enabled. The service first issues a refusal and then accepts
an alternative carrying that issued parent. The browser receives those two real proofs in varied order.
Refusal-first retains both proofs; conflict-first retains only the head because new proof writes are
blocked after conflict. Seven generated histories end with just the winner, five with both proofs.
Both directed orders also pass. The oracle compares full proof sets and exact persisted bytes, not only
a common final state. Service retries retain both original outcomes unchanged.

All three browser source omission controls are effective: skipping response persistence produces a
false recorded result, omitting refusal retention leaves publication ready, and omitting conflict
classification leaves publication ready. Their parsers, crypto and service issuer stay intact. See the
[control reports](./2026-09-12-account-decision-composition/composition-controls/control-persist.json)
and accompanying closure/conflict reports and JUnit.

## Interpretation, reproduction and preservation

The initial focused run had harness mistakes: assuming reopen adds no empty Yjs capture, calling a raw
pending API intentionally hidden by the sender, and assuming a send refusal must halt both sync lanes.
The [initial log](./2026-09-12-account-decision-composition/focused-initial-harness.log) is diagnostic only;
its temporary test source was not separately pinned. Final campaign source pins and commands identify
the corrected reproducible tests. These initial failures are not production counterexamples.

Capture checks require every old capsule exactly; otherwise unexplained additions must contain only the
canonical `[0,0]` Yjs no-op with the same route/actor. Send closure leaves receiving available. A competing
self-stream is refused before inbound persistence with Local editing still active; receive reports the
existing `operation-failed` diagnostic while send reports `conflict`. No diagnostic repair is claimed.

Run `pnpm account:decision-composition`. It creates a timestamped result directory with per-stage
logs/JSON/JUnit, 15-second heartbeat output, explicit deadlines and process-group termination on timeout.
The archive preserves 109 original files byte-for-byte, the initial diagnostic log and a separate
[preservation receipt](./2026-09-12-account-decision-composition/preservation.json).

All 21 personal package hashes, 31 prior vector files, historical review and L-2 are preserved. All twelve
C/D1–D8/audit/F-15/isolation signatures verify. Personal servers remain stopped; no real browser action,
Account, factor, operator key, pin, origin or routing change occurred. All new bundles stayed in memory.

This closes F-21.7 at the current private first-epoch boundary. It does not close F-21.6's named unit-oracle
assessment, general lineage/successors, enrollment, revocation, finalization, residue scanning, platform
qualification or independent review. Fixture alternative encryption is outside production allocation;
no-reseal assertions begin after that setup. Native death is not physical power loss.
