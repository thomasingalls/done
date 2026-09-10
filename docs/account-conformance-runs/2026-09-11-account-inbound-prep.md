# Authenticated inbound replay preparation evidence — 2026-09-11

Committed the owned sender as `8dd06fb`. This phase adds the [receive contract](../account-inbound.md),
synthetic independent wire fixtures and an executable candidate. Production receiver, service and Local
runtime code are unchanged.

Campaign: `test-results/account-inbound-prep/2026-09-10T23-34-41.486Z`, executed as `node scripts/account-inbound-prep/run.mjs`.
[Summary](./2026-09-11-account-inbound-prep/summary.json),
[sources](./2026-09-11-account-inbound-prep/sources.json),
[fixture bytes](./2026-09-11-account-inbound-prep/fixtures.json),
[generated histories](./2026-09-11-account-inbound-prep/generated.json),
[findings and limits](./2026-09-11-account-inbound-prep/findings.json),
[manifest](./2026-09-11-account-inbound-prep/manifest.json).

| Check | Evidence |
| --- | --- |
| Preparation | 25 cases pass: independently framed Node/OpenSSL envelope, acceptance and proposed page bytes; held baseline/prefix, membership/actor, duplicate/gap/conflict, pending replay, expiry, bounds, close and commit cuts |
| Generated histories | 300, seed 9142026, 4–24 actions each over two synthetic streams; external source/receipt oracle checks each cut/restart/compaction and complete drain |
| Effective controls | Seven shortcuts fail: unheld prefix, state-vector-only deletion coverage, split cursor commit, discarded pending deletion, early remote promotion, global cursor and relabeled source capture |
| Candidate defect | A caller could change retained bytes during crypto. Failing reproduction and repaired exact-byte test are saved; closure during duplicate verification is also checked |
| Existing primitives | 43 cases across network envelopes, position decisions, source capture and pinned Yjs delivery, including 5,040 saved delivery permutations and generated existing histories |
| Full suite | 906 tests in 80 files pass |
| Build and static gates | Isolated build at `test-results/account-inbound-prep/app-build`, TypeScript, scoped lint/format and 13 repository gates; adjacent artifacts record results |

The planned receive commit stores original content, signed evidence, derived progress and witness together.
Received does not mean materialized: missing Yjs dependencies retain original structs/deletions without
resetting a publisher cursor. A 512 KiB/255-update first-receiver cap and final 4 MiB/256-record batch check
avoid treating a maximum network page as a locally committable batch. Exact duplicate responses are stale
observations with no new durable knowledge; a fresh request starts from the current durable cursor.

The new candidate's mutable-input failure is a test-only composition defect, not evidence of a broken
shipping receiver. No receiver is enabled. The final generated campaign demonstrated no additional defect.
The model's atomic assignment and synthetic hash witness do not establish IndexedDB/AEAD correctness. Its
restart operates on prior verified event objects; runtime must reauthenticate original stored bytes. The
fixture authority assumes independently admitted membership and genesis; it does not implement issuance.
The proposed v2 fixture parser is not a complete malformed-frame conformance implementation.

No browser is used, so no async Playwright wait is counted as evidence. Native receiver tests must explicitly
await bounded predicates when built. The pnpm wrapper emitted no output and had not launched its runner;
only that process was stopped, and the exact registered Node runner completed. The wrapper's cause was not
diagnosed. No successful full pnpm check or whole-protocol debt payment is claimed. Personal release,
predecessor, browser/factors, server state and L-2 remain unchanged.

Next: production closed codecs and first-epoch verification, before native v9 activation/batch storage,
editor promotion, v2 service integration and two-gate enrollment.
