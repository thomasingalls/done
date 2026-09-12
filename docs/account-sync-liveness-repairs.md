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

## 3. Owned network wait and classified expiry — complete

Incremental verification is unsigned `879ce38`. V9 read/submission preparation runs in the serialized
carrier task; HTTP waiting runs in a separate task registered with the **same** writer lifetime.
Current authority, retained request/submission and prefix are checked again on ordered reentry. Closing
invalidates, aborts and drains network work before permit release. The retired v8 adapter remains
unchanged except for shared internal helpers. Transmitted buffers are erased on success/refusal/close.

Actual expiry has a distinct internal classification. The final check runs synchronously in the native
content transaction immediately before writes, after exact counter comparison. Expiry refuses that
receive job and feeds the scheduler's existing bounded backoff; the next pass signs a fresh request.
Other verification or lifecycle errors retain their halt. No clock tolerance was widened.

The [nine-stage campaign](./account-conformance-runs/2026-09-12-account-liveness-network/README.md),
21 ownership/mutation checks and full 996-test unit suite pass. Local flush completed while genuine
read/submission responses were held; late expiry recovered without manual retry after the refusal.
Cold replay, exact retry, conflicting evidence, cancellation/stream drain and tamper checks pass.

## 4. Scheduler wakes and bounded service verification — complete

Network/expiry is unsigned `902d352`. Durable send-prefix progress expedites an idle receiver, retaining
its backoff and evidence halt. Send wakes subscribe to successful, nonempty local outgoing admissions;
remote-only promotion no longer wakes send. Lifecycle teardown removes both subscriptions.

The service core owns a bounded crypto-evidence cache (512 entries, 16 MiB of accounted retained data,
not a measured heap bound). Each entry binds exact submission/response bytes to freshly authenticated
authority/member request and predecessor. Fresh SQL reads, every row's structural/semantic conditions,
parent issuance, completeness witness and final transaction/signing checks still run. Cache eviction,
oversize or cold restart takes full crypto; closing drops the cache. It retains no private keys or
content plaintext. Typed buffers are zeroed when discarded; this is not a forensic memory-erasure claim.

The [combined 12-stage campaign](./account-conformance-runs/2026-09-12-account-liveness-complete/README.md)
and 999-test full unit suite pass. It includes full/cached comparisons, generated histories, native
HTTP/expiry/ownership/tamper controls, process death and service races. Send wakes equal actual local
admissions in all three measured bursts, including the sliced large paste. At 35 positions the idle
service census takes about 1.5 ms versus 25.8 ms in the preceding phase, with 13 versus 118 signature
verifications in that request. The complete 24-job run takes about 61 seconds versus 256 seconds in
the initial run; terminal status-set median is about 88 ms versus 1,388 ms. These are descriptive
one-host observations with retained raw timings, not population estimates or capacity guarantees.

## Disposition and retained limits

The planned sync-liveness sequence is complete for the private v9 creating-member composition:
F-07/N-02/P-01's repeated verification multipliers, N-01's expiry halt, N-03's network/storage ordering,
and P-02/P-03's wake behavior are repaired within the recorded scope. Historical packet responses
remain unchanged; [the current review index](./review/implementation/findings.md) records this outcome.

This does not make the append-only Account proof ledger bounded or eliminate proportional scans,
parsing, semantic replay, byte comparisons, cold verification or editor projection/fork costs. Cache
bounds can reduce reuse on longer/larger histories. Long-history capacity, proof pruning, maintenance
scheduling, whole-profile/privacy and supported-platform evidence, onboarding and release qualification
remain separate. V8-only product paths stay retired. Personal Local and its packaged server are unchanged
and stopped. Resume the unfinished F-21.4 privacy-evidence extension after this completed sequence.

The signing reminder remains active and dynamically lists unsigned descendants of signed `1372c39`.
The older C–D6 history is already signed; it is not outstanding work. No commits are signed or rewritten
automatically by that reminder.
