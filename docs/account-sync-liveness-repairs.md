# Sync-liveness repair sequence

The user authorized unsigned commits at each verified boundary and continuing through all sync-liveness
tasks. The signing reminder is active and tracks unsigned descendants of signed `1372c39`; it only
reminds, and does not rewrite history. Measurement/preparation is committed as unsigned `0e07fe4`.

## 1. Unchanged complete view — complete

Private v9 custody opts into owner-local opened-record reuse. Every load still enumerates and parses
all rows, checks placement/allocation, authenticates the counter, and checks the active generation.
Only an exact match of the authenticated counter and all stored record headers/nonces/ciphertexts reuses
plaintext. A new candidate has a new private view identity. The v9 validator reuses its detached
inbound/delivery results only for the same identity and complete plaintext record set. Legacy/Local
owners do not opt in. Current task and authority/projection guards remain; no schema/crypto bytes change.

Cold/changed views take full verification; candidates publish after verification and final task checks.
Copies isolate caller erasure, and disposal/failure invalidates retained data. Compaction continues through
the full authenticated census and exact-coverage transaction. Proposed delivery transitions retain full
verification before commit.

[Recorded campaign](./account-conformance-runs/2026-09-12-account-liveness-view/README.md): eight stages
passed. Unit controls cover ownership, erasure, stale async completion and 60 generated metadata/content/
placement/rollback histories; 40 real inbound coverage histories reject missing content with the same
witness. Native controls reject ciphertext/nonce changes, missing required content/source, placement and
counter/generation tampering, followed by cold recovery. The full unit suite passed 995 tests.
The 24-job growing run took about 128 seconds versus the earlier 256-second run on this host. Warm
three-call status sets perform no full inbound or delivery ledger verification. This is not a population
speedup estimate, and growing-history work remains.

## 2. Incremental events and content coverage — complete

Phase 1 is unsigned `280221e`. Private v9 now reopens only changed ciphertext rows after authenticating
all counter/placement/allocation fields. Owner-local memo entries bind exact input bytes to the full
verification context/predecessor; keys are fixed for that owner. Every new view still parses its complete
census, checks the completeness witness, and replays semantic ordering/conflict reducers. Successful
crypto results are detached, erased on disposal/failure, overwritten when inputs change and pruned to
the current census. Proposed delivery transitions reuse only crypto results, never commit authority.

Inbound content is reconstructed once per exact current content set. Every evidenced original still
must be present verbatim or leave the complete Yjs state unchanged, including pending/deletion data.
A changed or missing content set rebuilds this coverage check. Full verification remains the default
oracle; the [recorded differential/native/generated campaign](./account-conformance-runs/2026-09-12-account-liveness-incremental/README.md)
passes. The 24-job workload took about 59 seconds. Native timing remains descriptive, and growing census
parsing/replay and storage scans remain. Unchanged source-census reads also reuse detached parsed data.

## Remaining boundaries

3. Separate owned fetch waiting from the carrier task, retaining cancellation/drain and stale-response
   checks. Classify actual expiry for bounded fresh retry; preserve corruption/conflict halts.
4. Wake receive on durable send-prefix progress and avoid remote-only publication wakes, preserving
   fairness, backoff and offline/closure behavior. Verify the combined workload and service-side costs.

The broader residue/platform/Account-release work remains outside this sequence. Personal Local,
historical packets, prior vectors and L-2 remain unchanged; v8-only product paths stay retired.
