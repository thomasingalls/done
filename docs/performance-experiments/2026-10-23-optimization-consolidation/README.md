# Optimization consolidation review — cumulative31, 2026-10-23

The working changes already contain meaningful consolidation. Stable inbound reads and publications use the same authority-proof producer and cache; discovery and catalog reuse the same cache mechanism under a separate complete-history producer identity. The client also already shares its verified-ledger owner and incremental extension machinery, and its two batching timers already use one state machine.

There are two concrete remaining code-sharing candidates in the inspected slice: (1) the storage kernel of the client/service positive crypto memos, and (2) a synchronous IndexedDB paired bulk-read helper used at five concrete sites. Neither supports a claim of additional runtime speedup merely by extraction. The service row memo is bypassed in the default publisher-tip path, and bulk reads already use the efficient primitive. These would primarily consolidate contracts and maintenance.

Do not merge the larger cache/lane owners into one generic optimization. Their keys, authoritative inputs, allowed corruption-detection delays, disposal behavior, concurrent outcomes and refusal rules differ.

## Scope and counting

This is a read-only static architecture comparison of selected current mechanisms in `account-service/`, `src/crdt/`, protocol proof/framing code, and the client scoped transport where its single-flight boundary is relevant. The unit is a named comparison group, not a function, cache, callsite or commit. The 13 groups below are a finite reviewed set; they are not an exhaustive repository count.

- 3 groups already share their substantive mechanism.
- 2 groups have a concrete, narrow common primitive supported by source correspondence.
- 6 groups intentionally keep different policy/authority/lifecycle semantics.
- 2 groups are plausible housekeeping/contract consolidation but remain uncertain.

Thus 4 groups are duplicate in spirit among separate implementations, of which 2 have a strong narrow extraction case and 2 need more justification. There are 0 unimplemented drop-in replacements proved by a refactor and regression run in this review. The 3 actual shared families are direct implementation evidence; the 2 candidates are architectural conclusions from code, not tested changes.

The earlier map was found at `docs/performance-experiments/2026-10-22-publication-prelude/static-analysis/README.md` and `opportunities.json`. Its 22 findings concern the older frozen phase21 source. It is useful background, not a current count: S01/S02/S03/S11 have since been partly addressed. For example, v1 `readAccepted` still calls the full producer at `account-service/delivery.ts:1341`; that is an adoption opportunity, not another implementation of a cache.

Source is the cumulative31 working tree reported stable by the parent while HEAD advances through patch signing. `inventory.json` records SHA-256 for inspected files and the HEAD observed at report creation. No repository files, artifacts, build inputs or Git state were changed. No benchmarks or tests were run. Existing test bodies were read as evidence of intended contracts, not claimed passing results.

## Comparison matrix

| Group | Mechanisms | Disposition |
| --- | --- | --- |
| G01 | Service request/core stable and complete authority evidence | Already one cache/reuse engine; stable proof identity shared where compatible |
| G02 | Ordinary receive and baseline incremental ledger | Already common verified-record owner, memo and extension algorithms |
| G03 | Publication and local flush batch deadlines | Already common `createBatchWindow` |
| G04 | Client/service positive crypto memos | Strong narrow shared storage kernel; operation policies stay local |
| G05 | LRU/charge/eviction plumbing | Uncertain low-payoff utility extraction; no common authority cache |
| G06 | Service public proof vs client custody authentication | Intentional distinct authority/input/output boundaries |
| G07 | Service witnessed prefix vs local exclusive warm content | Intentional distinct corruption detection/ownership contracts |
| G08 | Foreground prefix vs independent audit worker | Deliberate independent re-establishment of proof |
| G09 | Cold FIFO, exact duplicate refusal, grant single flight | Different keys, outputs and cancellation/accounting policies |
| G10 | Wire batches, local receive groups, service sequence/client prefetch | Distinct framing, ownership and scheduling policies |
| G11 | Native conflict, explicit capacity and sync-driver retry | Distinct refusal and replay semantics |
| G12 | Stable header/publisher/purpose projections | Overlapping field transforms; common equivalence not established |
| G13 | Full-store IDB paired bulk reads | Strong narrow synchronous read-pair helper across five sites |

## Already consolidated, with the boundaries that matter

### G01 — Authority and complete history

`account-service/inboundAuthorityReuse.ts:120–228` is the shared engine. Request-local `createInboundAuthorityReuse` at 99–108 supplies a single sequential lease; `createInboundAuthorityCache` at 58–78 supplies the core lifetime. There are not two independent proof caches to refactor into one: both paths converge in this function. `account-service/inboundBatch.ts:18–44` owns/closes the read-group lease in `finally`. `account-service/core.ts:245–258` creates the core verifier; `core.ts:763` closes it.

`delivery.ts:1073–1093` defines `authenticateStableHeader` and publication reuse. Inbound reads call that very same function at 1494–1500 when the core cache is present. Interleaved submit/read work can therefore hit the same proof identity, rather than just use similarly named helpers. The existing test body at `test/account-service-delivery/publisher-commit-races.test.mjs:684–706` specifically asserts one proof across interleaved real publications/reads and independent-core appends.

Complete-history consumers use `authenticateCompleteHeader`/`reuseWorkspaceAuthorityHistory` at `delivery.ts:653–678`; discovery calls it at `membershipLocator.ts:154`, catalog reads at `historyCheckpoint.ts:220–222`. This is the same cache engine and budget, not a second LRU. The separate verifier identity is intentional: complete-history proof may carry an `AdmissionHistory` brand where early delivery authority must omit `history` to preserve its ledger dispatch. `delivery.ts:668–678` returns the early or history-bearing form according to the captured input's `needsMembershipHistory` predicate. Do not force the two producers into a single result shape merely to increase hits.

The exact key is process-local V8 serialization of pin plus all native snapshot fields except rows (`inboundAuthorityReuse.ts:135–143`), with verifier-function identity namespace and collision-checking exact bytes (`168–179`). It retains at most 128 entries/16 MiB with at most 2 MiB context (`7–9`, `199–213`). A hit replays every captured `issuer.check` then validates live/revision/input identity (`149–158`, `179–187`). Mutable projections are detached while branded immutable history/rotation membership identities survive (`110–118`). This cannot become a JSON-only or shape-only memo: `AdmissionHistory` is backed by private WeakSet/WeakMap identities (`account-protocol/admissionHistory.ts:53–76`).

Reuse remains mathematical evidence. The read still authenticates reader signature/scope/time (`delivery.ts:1503–1520`), captures the live ledger after proof work and checks stable header equality (`1533–1541`), verifies served bytes, then performs native snapshot, expiry, custody and transaction authorization fences around signing (`1567–1602`). Cache `clear` is specially retryable only for unchanged live input; mutation/closure remain hard errors (`inboundAuthorityReuse.ts:149–155`, `delivery.ts:1604–1617`). A generic retry abstraction must preserve that distinction.

### G02/G03 — Existing client cores

`accountReceive.ts:206–222` and `localBaselineReuse.ts:75–78` both instantiate `createVerifiedRecords` and the same crypto memo. Both call `extendAccountLedger` (`accountReceive.ts:634–644`; `localBaselineReuse.ts:183–192`). The shared owner already handles complete record equality, identity leases, detached projections, guarded async install and optional owned-buffer adoption (`verifiedRecords.ts:114–144`, `146–245`). Its prefix sharing has explicit subarray-aware erasure (`verificationOwnership.ts:16–25`). A second generic cache would duplicate this work rather than consolidate it.

The baseline adapter still proves unallocated sources, checks authority capabilities, compares a full replay and clears operation-local crypto memo after advance (`localBaselineReuse.ts:23–64`, `137–145`, `195–212`, `251–252`). Ordinary receive has its own audit/coverage/installed-membership work (`accountReceive.ts:512–611`). Those checks are not redundant merely because the extension core is shared. Additional indexes are bounded at 32,768 rows/32 MiB (`incrementalAccountLedger.ts:74–77`) and require exact prefix bytes (`87–102`).

Publication and local flush already use `createBatchWindow` (`accountSyncDriver.ts:73–75`; `admissionQueue.ts:203–205`). Its bounded quiet/max due logic lives once at `batchWindow.ts:6–38`. `accountBatchPolicy.ts:8–15` shares timing values while callers retain persistence/send/retry policy. This is a good existing model for sharing mechanism while leaving meaning local.

## Strong remaining candidates

### G04 — Share the positive-memo storage kernel, not its authority owner

`account-service/deliveryVerification.ts:25–96` and `src/crdt/verificationMemo.ts:3–51` implement the same recognizable kernel: slot lookup, context equality, exact ordered byte-input equality, copied input retention, detached positive result and erasure. This is substantive source correspondence, not a keyword match.

A neutral module could own exact-input entry matching and owned entry install/remove/clone/erase, with a browser/Node-safe byte comparator. Keep its instances separate in each runtime/owner; do not share an in-memory cache or add a cross-owner pool. Keep the result domain explicitly structured-cloneable plain data. The authority-history engine is a counterexample: its branded values cannot pass through this generic copier.

Policies that must remain at adapters:

- Service LRU promotion, 512-entry/16 MiB charge/eviction and concurrent same-slot replacement (`deliveryVerification.ts:5–12`, `68–90`). Service clear during an awaited verifier suppresses installation but still returns its computed detached value; native caller fences decide whether it may be used.
- Client `current()` before lookup and after verification, strict revision-change refusal, owner serialization assumptions and `retain(slots)` (`verificationMemo.ts:13–18`, `27–45`). Its `clear` during work throws; silently adopting service behavior would weaken client cancellation/owner invalidation.
- Domain-specific slot/context construction and complete semantic reducer checks. Service context includes authority/boundary/predecessor and fresh row metadata still checks afterward (`delivery.ts:889–923`). Client slots and retention are chosen from the actual census (`accountReceive.ts:599–610`). Neither memo keys producer code identity, so a new common store must not accidentally pool two verifier purposes under the same slot/context.
- Error policy, verification callback execution and all fresh authority checks. Cache no negative results or responses and do not introduce promise coalescing as part of extraction.

The current byte equality is exact in both places, but the client comparator has aligned word optimization and detached-view behavior (`verifiedRecords.ts:7–33`). Moving it to a neutral kernel requires explicit offset, empty/detached input and mutation controls, not a blanket import of a CRDT module into the service.

Practical limit: the only inspected service row-memo use is conditional on `reuse && !reuse.tips` (`delivery.ts:889–897`). The actual `AccountCore` creates tips (`core.ts:245–258`). Consolidation therefore removes maintenance duplication; it is not evidence of a new default hot-path speedup. `test/verificationMemo.test.ts:4–47` documents clone/context/retain/current/revision behavior, but a combined refactor would need its own differential controls before calling it proved.

### G13 — Share a synchronous paired IDB bulk-read helper

Five concrete full-store sites repeat the same native optimization:

1. Ordinary encrypted content census: `contentStore.ts:243–255`.
2. Raw retention inventory: `contentStore.ts:272–285`.
3. Baseline compare-and-exchange: `localBaselineStorage.ts:124–185`.
4. Retention compare-and-exchange: `localRetentionStorage.ts:85–98`.
5. Content compaction comparison: `contentCompaction.ts:128–147`.

Each queues `getAll()` then `getAllKeys()` on one store in an existing transaction, consumes aligned results under `guard`, and refuses unequal lengths. A helper such as a synchronous `queueStorePairs(store, guard, mismatch, onRows)` could own request pairing and alignment validation. It should enqueue immediately and invoke the consumer during the success callback. It must not return an independently awaited promise inside the native transaction.

Callers keep: store set/range/limit; raw physical key preservation; ordinary semantic counter parsing; baseline chunk identity/comparison; retention plan completeness; compaction journal checks; per-store remaining count; final `owner.checkCommit`; write/delete operations; strict durability and cleanup. Baseline and retention exchanges explicitly request strict durability (`localBaselineStorage.ts:188`, `localRetentionStorage.ts:139`). `contentTransaction` resolves only at transaction completion, uses guarded task checks and abort/drain (`contentDatabase.ts:76–141`). A helper must not claim completion at the read request event or move writes into a new transaction.

The concrete counterexample is `startupStorage.ts:136–150`: it intentionally asks for 33 keys and 32 values to detect overflow before shape equality. A generic helper that normalizes limits or only zips the shorter array would change refusal semantics. Keep that path outside the initial full-store helper or expose explicit independent limits and its overflow predicate. Likewise, raw retention metadata must not be replaced by ordinary parsed counter state: the exact encrypted chunks/pointer/keys are part of its transaction proof.

This is one bulk-read optimization separately spelled at five reviewed sites, not five proved speed improvements. It can become a common implementation without merging the readers' security decisions. No runtime gain is asserted; the paired bulk IO optimization already exists at every site.

## Strong counterexamples to broad consolidation

### G06/G07 — Fresh authority is different from a warm row cache

Client `createAuthorityAuthentication` freshly reads the complete detached slot inventory on every check and only skips reauthentication when the supported structured values exactly match (`accountAuthority.ts:43–104`). It retains no result capability, erases inventories and invalidates on failure. `accountReceive.ts:274–299` binds authentication to expected custody payload/record. This is not the service's serialized native header plus branded public proof and replayed live custody checks. Their equality domains and authority consequences must remain explicit.

The service publisher-tip cache retains only compact verified prefix metadata, scopes it to account/publisher/context, checks witness count and native data_version, fences captures with owner and commit object identities, rechecks served rows and quarantines detected corruption (`publisherTips.ts:369–530`; `delivery.ts:977–1071`). The local `warmContent` relies on an exclusive owner, authenticates current metadata and checks count/first/last shape; interior ciphertext equality is audited in bounded rotating slices (16 rows/128 KiB, after 256 appended rows or five minutes; `warmContent.ts:24–27`, `61–165`). Ordinary local loads can also compare all ciphertext exactly before reusing opened values (`contentStore.ts:364–385`). These are different accepted detection windows and threat boundaries, not interchangeable memo implementations.

The baseline warm authority pin uses verifier-owned capability identities and captured scalar scope (`localBaselineReuse.ts:23–64`). `contentStore.ts:423–429` explicitly notes that one-shot rotation/custody readers reconstruct equivalent evidence while live warm owners promise stable identities. Equal JSON from a cold/reopened owner cannot safely inherit a warm lease.

### G08 — Reuse code, preserve independent evidence

The worker imports the same authority/census algorithms but opens its own read-only database snapshot, re-establishes public proof and performs full census (`publisherAudit.worker.ts:8–26`). Its realm cannot inherit protocol WeakMap brands; `publisherTips.ts:208–210` says so explicitly. Foreground and worker sharing a cached proof/result would remove the independent detector underpinning compact tip reuse. Legitimate committed append invalidates stale captures but preserves the active audit owner (`publisherTips.ts:463–478`); global invalidation instead would let continuous writes suppress detection.

### G09/G10/G11 — Waiting, refusing and sharing a result are not one single-flight primitive

Cold publisher admission is a bounded FIFO over account/publisher, returns a release token, times out after ten seconds and requires a fresh capture after waiting (`publisherTips.ts:320–364`; `delivery.ts:1523–1531`). It shares scheduling only. Exact batch duplicate exclusion instead compares full immutable body plus service-held budget scope and immediately refuses overlap; it charges original HTTP admission but avoids extra work top-up (`batchReadAdmission.ts:5–18`; `scoped-http.ts:230–241`, `313–323`). Client grant single flight shares the acquired expiring grant keyed by account/session/scope, bounded to a live unlocked transport, with token-matched stale refusal eviction (`scopedTransport.ts:107–129`, `321–359`). A universal coalescer would silently change output sharing, fairness, cancellation and accounting.

Wire batch framing uses a domain tag, count, per-item limits and copied decoded bytes (`account-protocol/inboundBatch.ts:5–79`). Local admission groups are private untagged length frames, return borrowed subarrays and use pending/record limits (`receiveGroup.ts:5–40`). Service batch reads are sequential, preserve every inner signed request and close the request-local proof lease in `finally` (`inboundBatch.ts:18–44`). Client prefetch can run two reads, keeps an ordered prefix, reserves bytes and drains/erases cancelled work (`receivePrefetch.ts:22–89`). Sharing a larger runner or decoder would require changing ownership or execution policy. Atomic work reservation/refund for never-started work is its own service accounting contract (`requestBudget.ts:82–109`).

Native read conflicts use at most four capture attempts. Clear-only invalidation can continue; owner closure, changed input, expired signatures and revoked authorization cannot inherit that permission (`delivery.ts:1604–1617`). Transport retries replay captured exact bytes only after explicit capacity refusal, at one/two-second waits and within the original deadline (`scopedTransport.ts:165–205`, `285–304`). The sync driver interprets semantic outcomes, owns exponential lane backoff and prevents typing from moving a failure clock (`accountSyncDriver.ts:168–172`, `271–299`). These are not duplicate retry loops that should share one decision policy.

## Uncertain/low-payoff candidates and limits

G05: bounded cache Map promotion, eviction and accounting repeat in `inboundAuthorityReuse.ts:51–89,199–213`, `deliveryVerification.ts:31–37,79–90`, `archiveProjection.ts:8–36`, and `publisherTips.ts:520–529`. A very small policy-injected map utility could be useful, but charge units differ (estimated graph bytes vs characters vs compact JSON), erasure differs, and tip eviction cannot revoke active audit ownership. Archive projection is derived UI text only and detaches arrays (`archiveProjection.ts:1–4,38–47`). A common LRU must not imply a common cache key, lifetime, size guarantee or authority contract. No profile establishes payoff.

G12: `workspaceAuthorityHeader` (`delivery.ts:1445–1453`), `publisherContext` (`publisherTips.ts:69–79`), catalog stage comparison (`historyCheckpoint.ts:231–241`) and discovery-purpose snapshot comparison (`delivery.ts:359–367`) all remove some volatile evidence. They are not currently the same equivalence: the proof cache includes pin and V8 distinctions; prefix context uses JSON and publisher identity; catalog has no selected publisher at its first stage; discovery omits only the first publisher's witness for an actual joined publisher. A common explicit projection could reduce field drift, but its contract must be proved independently for every consumer and must keep future fields. Never reuse a proof-cache projection for final ordinary native commit equality: those live witnesses are intentionally excluded only while separate fresh census/served proofs establish them.

Recommended bounded order if refactoring is later authorized: extract and differentially check the synchronous full-store read-pair primitive first; consider the plain-data memo storage kernel second; leave authority/prefix/coalescer owners explicit. Neither change belongs in the current signing/artifact task. This review makes no benchmark, scalability, security-audit, release-qualification or exhaustive-coverage claim.
