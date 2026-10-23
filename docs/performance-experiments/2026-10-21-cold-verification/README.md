# Cold concurrent verification and queued write burst — phase07

Final candidate clears the original bounded cold workload in both fresh processes; this is local acceptance, not a capacity certification or rate promotion. Base is cumulative patch06 tree `dd5755a91faf940c9c99a3e6516f2aaf9ff70967`, original signed source `27dc7d78`. No staging, signing, commit, push, preview change, merge or deployment. General qualification stays paused.

## Contract and intervention

Read protocol.md and its append-only addenda. A FIFO lane starts only with no matching extendable prefix, drains its admitted cold group before normal warm concurrency resumes, and is independent per account/publisher. It shares ordering only. Authorization is checked before entering; a waiter recaptures and independently authenticates on its turn. Four native guard attempts stay exact. A short native transaction captures the scheduling header; it ends before waiting. Max128 lanes/128 total waiters,10s queue wait cap, idempotent owned releases, close rejection/cleanup. No shared authority, rows/maps, signed result or automatic progress. Original proof/custody/grant/native freshness, quarantine/audit/version/clear/eviction, body/work/burst/concurrency/rate/deadline guards and all wire/storage bytes remain. Warm concurrency remains. See docs/account-receive-transport.md.

## Fixed final cold workload

1024 initial hot rows, six genuine scoped sessions each fetching256 limit-one positions with four-request batches, hot writes offered500ms, other-account writes1000ms and peer reads250ms. Existing429 backoff and budgets apply;409 aborts. Same120s replay/10s HTTP/1GiB RSS ceilings and additional2.5s hot-write p95 guard. Fixed reference,candidate,candidate,reference, no warmup; separate fresh services and independently framed OpenSSL proofs. Each process is the analysis unit, not each correlated request.

| Arm | Outcome | Positions | Replay ms | Hot writes verified | Other writes verified | First hot proof ms from offer | Hot proof p95 ms from offer |429s |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| reference 1 | failed | 450 | not completed | 6 | 3 | 2452 | 2452 | 0 |
| candidate 1 | passed | 1536 | 20574 | 41 | 20 | 286 | 1014 | 93 |
| candidate 2 | passed | 1536 | 20068 | 40 | 20 | 289 | 574 | 94 |
| reference 2 | failed | 474 | not completed | 6 | 3 | 2522 | 2522 | 0 |

Both final candidates verify every offered write, exactly two full censuses (one per account), no state-change refusals/quarantine, and no remaining lanes/waiters. Sampled RSS346/396MB; CPU8.73/9.16s. Capacity refusals remain. References stop after450/474 positions with state-change replies. Reference2 also misses the extra write guard. Failed references prohibit a completed paired percentage-speedup claim. Two replications do not establish a population interval or unrestricted liveness. All eight stores across the initial and final blocks pass independent read-only original-wire/link/proof audit, with no stored unacknowledged writes.

## Actual packaged-client checks

Exact unchanged patch02 build110 assets; encrypted synthetic121 cards,13,000-character Goals,600 missing updates. Two disposable Chromium contexts use actual scheduler, HTTP, IndexedDB, editing and service-worker paths. Final normal catch-up34.246s and duplicate-reader pressure139.577s both pass complete export equality, two-way writing, Undo/Redo and locked offline document reopen. These are functional checks, not matched performance estimates or evidence for physical Android/Firefox/WAN, independent installations, full browser-process cold reopen or production adoption. New fault injection is not claimed; preceding patch06 retains that separate evidence.

## Failures retained and changes in understanding

1. Original source repeats all eight rows six times; initial explicit future-write burst reports out-of-order.
2. First candidate admitted before authority verification and broke an unchanged paused-authority/concurrent-append regression. Move admission after each request's authority/request checks. Preserve failed affected-suite predecessors and original source.
3. First-epoch native comparison passes on that narrowed implementation, but membership-enabled browser capture refuses outside a transaction: normal run fails at600s; duplicate-pressure repeat is deliberately interrupted at102s once the deterministic cause is identified. They receive no functional/timing credit. Preserve source maps, raw results and interruption receipt. Keep the store's transaction guard; fix only admission's coherent header capture.
4. New fixture mistakes (wrong schema constant, incomplete table subset, forbidden implicit upgrade) and a flaky demand that future network writes be authenticated in caller order remain in logs. Final membership regression uses full production initialization; final burst uses a serial publisher actor matching the app/native probe. Admission FIFO is after authentication, not a promise about asynchronous call invocation order. Final close check waits for actual queue entry. No old test/assertion is removed.

Final143 affected cases pass;16 new cases cover coalescing/FIFO/burst/warm exit/independent keys/bounds/close/copied input/signature/expiry/custody-grant/clear/external/tamper/timeout/transactional membership. Ten deliberate omissions fail their intended assertions. Independent AST comparisons preserve every original delivery security/guard/commit statement and publisher verifier/audit/fence after removing only added scheduling, plus all23 old assertion ASTs and registrations/options in two indentation-only omission-anchor fixtures.109 planning cases pass. Every880 prior obligation and97 construction statuses/contracts remain exact;881 obligations/337 unresolved, with the new native file explicitly blocked from aggregate credit.

## Evidence and reproduction

SHA256SUMS pins every artifact except itself; artifact-provenance.json pins raw/stored bytes. identity.json pins sources, unchanged client assets, current browser executable, fixtures and probes; separate source maps retain earlier candidate variants. Numeric logs/JSON are deterministic gzip; reproduction scripts/source snapshots are .txt. Private DBs, fixture secrets, browser storage, vault credentials and dependency trees are excluded. The privacy audit checks35 known raw/escaped private values and is not a general secret detector.

For replay, apply immutable patches01→07 to the signed base in order with `--whitespace=nowarn` (global whitespace-fix must not rewrite frozen evidence). Reconstruct frozen source variants from mapped sources/snapshots. Private synthetic fixtures remain outside Git and their hashes are pinned; obtaining or regenerating them is necessary for native/browser load replay. Never use personal data. Run run-native-final.py under recorded Node24, then wait for terminal completion before browser runner. Keep default rate/budget literals, original fixtures/assertions/deadlines and fixed order. Run audits and final checks serially after measurements, retain stopped arms and any contaminated results. The browser recipe expects the same restored fixture origin/ports and exact client build; run in source-candidate, not the current directory.

Remaining scope: safe policy/capacity promotion, larger/diverse authority histories, multiple distinct installations, hardware/Firefox/Android/WAN and production observations, and general release/security qualification. None is discharged here.
