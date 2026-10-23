# Static optimization map — frozen runtime20 working tree

The user's hypothesis is **partly supported**. The code repeatedly uses a successful family of techniques: keep immutable verified evidence behind a private owner, preserve fresh authorization/commit checks, then reduce repeated parsing, scanning or copying. Some remaining paths visibly reconstruct the same kinds of evidence. But many superficially similar calls protect different lifecycle, storage, publisher or realm boundaries. A blanket cache or removal of repeated checks would change the security model.

**The most consequential caveat:** the inbound authority cache deliberately includes live witnesses; only decision rows are excluded. Simply using that cache for submissions would commonly miss after each write. Runtime20's more permissive *stage comparison* excludes the live witnesses, but that projection is not automatically a valid *cache-equivalence contract*. Normalizing the cache key requires a separate proof that fresh ledger verification covers every omitted dependency. This is a design prerequisite, not an implementation recommendation to omit fields.

No runtime changed, tests ran, benchmark ran, security scan ran, qualification resumed or publication action occurred in this analysis. The source was frozen before the parent's new diagnostic/implementation. Line numbers below name that frozen source; [source identities](source-identity.json) disambiguate the cumulative checkout from signed HEAD.

## Coverage and reproducibility

The census parses **all 296 runtime TypeScript/TSX files** under `account-service/`, `src/crdt/`, `src/account/` and `src/editor/`, excluding `*.test.*`, `*.spec.*` and `__tests__`. Babel 8.0.1 parsed every file without errors. It records every matching call and every lexical loop/await, rather than just `rg` imports or type references:

| Explicit syntactic category | Matching call sites |
| --- | ---: |
| Named authority-evidence producers/consumers | 98 |
| Named state reconstruction or complete-validation helpers | 203 |
| Snapshot, storage and capture helpers | 350 |
| Named scheduling/admission helpers | 87 |
| Explicit copy, serialization and bulk-byte helpers | 791 |
| Qualified WebCrypto primitive calls | 162 |
| Wider structural name inventory | 3,497 |

Categories overlap: there are 4,543 distinct retained calls, 764 loop statements and 3,380 await expressions. The census also records 256 `.prepare(...)` expressions, retaining static SQL and marking unresolved/dynamic arguments. These are **not 256 demonstrated database scans**: some `prepare` methods belong to other owners and some keyed SQL is constant-size. SQL with no `LIMIT` is not automatically unbounded because schema/row validation may bound it.

The exact finite name sets/regex, exclusions and parser version are in [census.json](census.json); [census.mjs](census.mjs) is the reproducible enumerator. Its `source/` tree contains the frozen input bytes and SHA-256 per file. Running it with the recorded local Node 24 runtime reparses those same frozen bytes. It requires the repository's installed Babel package and original path; change the explicit `repo` variable to rerun elsewhere. It intentionally prefers existing frozen sources, so use a **new output directory** to census a later working tree.

This is exhaustive **for those syntax categories over that source set**, not exhaustive for semantic opportunities. It does not resolve alias/dynamic dispatch, external protocol implementation internals, React UI outside `src/editor`, native SQLite/IndexedDB/query plans, cryptographic implementations, server deployment flags, or actual call frequency. Lexical loop ancestry is not a dynamic execution count, and call counts are not cost. The protocol `admissionHistory.ts` was consulted for branded timeline semantics and is separately hashed under `support/`.

Every one of the 98 authority sites has an explicit runtime/contract group disposition in [opportunities.json](opportunities.json). The 22 reviewed findings below are selected hypotheses or retained boundaries, not 22 proven bottlenecks. Each contains exact frozen sites, trigger, growth, analogous mechanism, lifetime/authority/corruption prerequisites and a meaningful measurement/falsifier. Non-authority syntactic sites remain raw inventory unless a named finding explicitly reviews them.

## Established patterns and the evidence behind them

These precedents are recorded in the frozen [performance journal](support/docs/performance.md); none predicts additive savings at a new call site:

- Linear retained-prefix reconstruction reduced a deep cold-open median 11.62→4.21 seconds; source parse-once reduced a subsequent 4.07→3.44 seconds. These established incremental reconstruction and one-parse-per-census, while retaining independent full checks.
- Preparing one source-coverage baseline per synchronous owner call reduced its measured coverage span 615→376 ms, keeping all 2,355 independent original-update checks. The shared setup, rather than each check, was redundant.
- Warm exclusive-owner loads, owned verification results and authenticated selections reduce IO/copy work. Their guarantees differ: warm ledger reuse has a specifically accepted delayed interior-corruption window; custody authentication reuse still freshly compares the complete inventory on every check.
- Phase17 reuses the complete branded membership timeline and captures live history heads after immutable request authentication. Phase18's diagnostic attributed median 755 ms of a 769 ms ordinary read to authority verification; exact-context reuse reduced heavy replay time but **regressed live peer latency**. Phase20's late capture removed observed read409s, but peer p95 still missed 2.5 seconds.
- The fast exact-byte comparison initially made catch-up slower by producing more contending work. Scoped exact concurrent duplicate-read exclusion made the combined result useful. This directly argues against treating CPU microbench gains as server throughput or fairness gains.
- Client custody memoization, prepared remote handoff, final immediate-use permission, source batching, limit-one reply grouping, own-stream suppression and owner-local text preparation already exist. Several parked publication/buffer/IO experiments failed their thresholds; their presence in documents is not default activation.

## Actionable bounded order

| Order / finding | Concrete remaining work | Confidence and falsifier |
| --- | --- | --- |
| 1. **S01, S11** | Attribute submission/v1 read-back authority reconstruction at `delivery.ts:1022/:1223` and distinguish immutable proof work from witness-dependent decisions. | Static publication hypothesis; measured read precedent only. Reject as first repair if safe context misses after each write or this span is minor. Preserve all fresh custody, member-signature, ledger and transaction checks. |
| 2. **S02, S03** | Discovery's `membershipLocator.ts:95/:97` and `:152/:156` reconstruct authority then verify a membership chain again; catalog `historyCheckpoint.ts:236` rebuilds authority before publisher/history work. | Explicit repetition, unmeasured savings. Count chain extensions/signatures per request and prove exact native-row→canonical-proof correspondence. The pending ceremony needs its precise historical prefix, not current membership. |
| 3. **S05** | `accountEnvelopePreparation.ts:60/:70` rebuilds used references and decodes old sources for each new envelope, while `incrementalAccountLedger.ts:56/:58` already owns bounded source/used metadata. | Strong static client candidate. Grow consumed history with fixed pending work; measure visited positions/decodes and prelude CPU. Preserve exact originals, capsule digests, order, actor/epoch/size limits and durable retries. |
| 4. **S06** | Receive preparation at `accountReceive.ts:1041` selects the whole inbound state, clones it, then chooses one publisher. Project only that publisher's required prefix/conflict/observed-through plus pending-self from the current lease. | Concrete data-shape repetition; clone cost unmeasured. Measure retained receipt/peer clone size and request prelude. Mutation/erasure and fairness checks must falsify aliasing or omitted pending-self state. |
| 5. **S04, S07** | Measure repeated native header loads/serialization and exact old-byte comparison passes within one unchanged owner task. | Static. These costs can persist on a crypto cache hit; however the comparisons join authenticated memory to actual current input. Elide only a demonstrably redundant same-owner check, preserving accepted corruption windows and cold/audit checks. |
| 6. **S08, S09** | Cold/reference reducers still repeatedly `.find` positions; canonical and retry checks still allocate hex strings for equality. | Static, lower immediate priority for live sync. Profile cold/audit lookup slope and conversion bytes, then use independent reference/differential controls. Default warm paths already bypass much full reconstruction. |
| 7. **S14–S17** | After service proof cost is known, measure send-due waiting behind receive discovery/history, empty-publisher sweeps, batch truncation and failure retry pacing. | Scheduling hypotheses. Faster prelude may resolve observed delay without concurrency/rate changes. Measure offered→peer p95, all tenant progress and durability; zero429 falsifies rate causation for a run. |

The machine-readable map preserves the other sites and restrictions. In particular:

- **S10:** freshly authenticate every actually served row and predecessor. Exact immutable signature/key-import evidence might be reusable, but the prefix cache does not authenticate changed served bytes on its own. Measure these bounded crypto costs first.
- **S12–S13:** grant/setup/removal/recovery/rotation calls are often cold or staged authority boundaries. Measure frequency and user-visible delay before applying a hot-path cache. A cold reopen cannot inherit a previous live owner's proof merely because the JSON matches a head.
- **S18:** retain the independent audit worker's full authority and native-input reconstruction. Sharing the foreground proof would remove the independent detector the optimization relies upon.
- **S19:** default client discovery already transfers `answer.history` into installation. The fallback verifier at `accountReceive.ts:1946` is not simultaneous duplicate default work. Complete fresh custody inventory authentication is also already reused safely.
- **S20–S22:** ordinary text fast paths, authenticated-baseline readers and small bounded bookkeeping loops are present. Retention writer activation is a separate gated protocol/product action. The status JSON comparison, 16-entry duplicate admission and 1,024-session cleanup are not credible priorities without profile evidence.

## Would a shared abstraction help?

Yes, narrowly. A **service-owned verified authority evidence result** could provide branded history, exact canonical proof bundle and required historical memberships to submission, discovery and catalog consumers. A single authoritative definition of its input/equivalence and invalidation contract would prevent drift. Consumers would still independently check their signed request, grant/session, expiry, requested publisher prefix, current native state and final commit. The definition and consumer agreement should be checked in both directions, consistent with RC-8C; a helper and a test generated from the same omitted-field list would not establish correctness.

Also useful: extend the existing private verified-ledger selection interface to obtain bounded envelope-source metadata and one publisher's receive prefix. This fits current ownership instead of introducing a second history cache. A documented optimization checklist could prompt new paths to ask about reused setup, full-history loops, copy volume, volatility capture and control-plane gating before adding mechanisms.

A single generic memo across server/client/worker realms, custody/ledger evidence or lifecycle stages would be counterproductive. Their brands, native snapshots, corruption-detection windows, input shapes and capability lifetimes differ. Likewise a global "ignore volatile fields" projection would risk silently omitting a new authority field. Preserve separate explicit contracts and reuse only a primitive whose full assumptions really match.

## Limits of this result

No new timing estimate, aggregate qualification or security conclusion follows. Histories, keys and code sites were inspected statically; real data was never opened. Previous measurements describe their own fixtures/versions and limitations. This report establishes where to measure and which existing mechanisms might apply; each optimization still needs a bounded contract, discriminating controls, failure-boundary regressions and a coupled client/server fairness comparison before adoption.
