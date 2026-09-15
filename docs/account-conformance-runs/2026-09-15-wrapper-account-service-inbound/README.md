# Account service-inbound wrapper integration — 2026-09-15

Signed base: `21278b15`. Bounded integration, not immutable release qualification.


## 2026-09-15 — Account service-inbound wrapper integration

Composition is signed and verified as `21278b15`. Service-inbound retains the three original commands:
typecheck (`tsc -b`, 60 seconds), four-file Node service suite (20 cases, concurrency=1/spec/JUnit,
120 seconds), and browser HTTP fixture (one case, concurrency=1/spec, 90 seconds). Owned execution adds
a 270-second aggregate/five-second grace, disposable CDP fixture, two distinct child case reports and
20 required files. Owned children inherit the runner group; standalone detached groups remain.
Typecheck is exit-only. The invoked historical `account-service/delivery.ts` at
`4bb09042f37f68ec31f0d82587af608f599eb096` is pinned by revision/path/bytes; no vector input is invoked.

Eight actual omission controls now retain normal pages, baseline refusals and mutated pages, including
separate requests when expiry changes the clock. Registration retains both refusals from independent
activation binding before isolating the older registration guard. Sixty generated histories (9112031)
retain commands, completed observations, original envelope/acceptance bytes, query/page results,
read-only inventory fingerprints, temporary ledger corruption and final one-entry prefix replay.
Independent reconciliation checks query binding, pagination, exact originals, replay identity, inventory
continuity and page signatures against the observed public keys. These keys establish internal report
consistency, not external trust. Existing independently framed service/oracle assertions remain mandatory.
Reports save completed generated observations incrementally; incomplete active work cannot pass.

The two SIGKILL cuts retain actual signal/reply counts, inventory hashes and recovered signed originals.
The native HTTP fixture retains six refusal statuses, two original pages and byte-identical HTTP retries,
duplicate receipt, cold progress and final empty page. Its receiver remains the cryptographic admission
authority; HTTP report reconciliation does not replace it. Inventory fingerprints corroborate the existing
full serialized-inventory assertions rather than claiming a whole-profile residue census.

Five focused tests pass after correcting two scaffold filesystem-symbol errors. The first owned epoch
stopped after 69/70 manifest cases: one stale assertion still expected service-inbound to be unresolved.
It now checks service-inbound's concrete contract and keeps activation explicitly blocked. The failing
source, logs, cases, receipt and epoch remain preserved. No Account campaign ran in that failed epoch.
The repaired epoch passes **189 cases in seven executions**: 136 planning cases, 21 service-inbound cases
and 32 unchanged service-delivery cases, then exact reuse. Service-inbound takes **63.507s /270s**;
service-delivery takes 21.788s /95s. Every group drains; 20 files survive checkout removal in 21 inventory
entries within 4 MiB /32 entries /two levels. Manifest passes in 59.108s /60s; the earlier
58.674-second observation and loaded-host headroom debt remain. Two 160-run corruption tests use
150973/150974; eight synthetic zero-exit runs and two omitted semantic/census hooks discriminate.
Synthetic controls are not additional Account executions. All original deadlines remain.

Totals stay **629 obligations /292 required files** and 272 general files /2,198 dispositions (11 not
applicable). Unresolved integration falls from 114 to **112: zero test-file /72 command /40 campaign**.
Runtime, package/dependencies, vectors/crypto census, F-17 debt, earlier archives and L-2 remain unchanged.
Next: bounded manifest-headroom repair, then Account activation wrapper integration, remaining families/qualification repairs, immutable
aggregate and private human rehearsal. No personal browser/server/relay/device/deployment operations.



The schema 3 archive retains **425 payloads in 794,624 bytes**, using lossless
UTF-8/base64 chunks and XZ within the one-million-byte cap. Contracts, selected source snapshots,
reports/logs/receipts, both invoked historical source files and faults are retained. Full input inventories are
external hash references.

```sh
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-service-inbound/verify.py
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-service-inbound/verify.py --current --raw
```

The verifier checks archive bytes, contracts/nonces, exact child case/module domains, traces, inventories
and selected service-inbound/delivery observations. The owned Node reconciler checks page signatures; this portable verifier checks retained framing and signature sizes without crypto dependencies. It does not rerun campaigns or authenticate signatures.
Optional flags require current/external files.
