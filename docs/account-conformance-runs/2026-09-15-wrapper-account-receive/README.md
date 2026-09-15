# Account receive wrapper integration — 2026-09-15

Signed base: `70788d4e`. Bounded integration, not immutable release qualification.

The original three-file Vitest command retains 45 cases, maxWorkers=2, verbose output and its one-minute
limit. The original Node command retains 17 native cases, spec/JUnit and its five-minute limit. Owned
execution adds a 360-second aggregate/five-second grace, disposable CDP fixture, separate child reports
and 24 retained report files. The invoked old marker reader is pinned at
`8378596:src/crdt/promotionRecord.ts`, with its existing five-second/two-MiB Git read bound.

Five planning suites pass 111 cases; receive passes 62 in 145.872s /360s;
unchanged codecs pass 114 in 21.493s /135s. **287 cases in seven executions**,
then exact receive reuse. All groups drain. Twenty-four files survive checkout removal in a 25-entry
inventory within 4 MiB /40-entry /two-level limits. The original 70-case manifest suite passes in
53.706s /60s. These timings do not qualify loaded-host headroom.

Four native mutation controls retain actual normal/cold/readback refusal and altered receipt progress,
including each single coverage omission versus their joint removal. Twelve histories retain original
frames/envelopes, commit-cut cursors, retry outcomes, recovered status, the request/page that really
committed, and final inbound events/content rows/text/pending status. The JS adapter independently checks
exact framing, ordered links, stored bytes, recovery dispositions and plaintext Yjs coverage. Applying
originals must preserve snapshots and leave no new pending data. Native owners still authenticate local
AEAD, completeness witnesses and service signatures; the report oracle has no keys.

Two hundred unit ledger histories now retain insert/deletion/merged bytes and actual refusal reasons in
a distinct report. Codec mutation, 400 generated recovery and 500 wire-fault reports remain required.
Reports save completed steps/cases and final rows; active interrupted work may be absent.
Five new infrastructure cases include two 160-run corruptions (150963/150964). Eight synthetic zero-exit
runs and two omitted semantic/native-census checks discriminate incomplete reports. These are not additional
native receive executions; the synthetic browser fixture only exercises process ownership.

The first focused controls overflowed Node's async-resource map by recreating identical Yjs unit fixtures
hundreds of thousands of times synchronously. Exact input-tuple caching within one report reconciliation
fixes that allocation problem while checking every observation; the same five controls pass in 4.32s.
The complete plan also crossed its previous 1,000,000-byte limit (1,005,453 compact bytes). A prospective
four-MiB planning-file cap retains all contracts, with round-trip/overflow controls. The first owned epoch
stopped at a missed duplicate cap assertion in generated-registration planning; it is aligned before the
complete rerun. The Account campaigns had not started. Original source/logs/partial receipts remain.
Runtime report limits, campaign deadlines and the one-million-byte archive limit are unchanged.

The schema 3 archive retains **438 payloads in 496,004 bytes**, using lossless
UTF-8/base64 chunks and XZ below its fixed archive limit. It includes contracts, source snapshots, old-reader
bytes, reports/logs/receipts, faults and earlier failures. Full input inventories are external hash links.

```sh
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-receive/verify.py
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-receive/verify.py --current --raw
```

The verifier checks retained bytes, contracts/nonces, exact case/module domains, traces, inventories,
selected codec/native observations and stored event/receipt accounting. Python does not replay Yjs;
plaintext coverage belongs to the archived JS adapter's owned execution. Optional flags require current/
external files. Neither invocation reruns campaigns or authenticates signatures.

Totals remain **629 obligations /292 required files** and 272 general files /2,198 dispositions
(11 not applicable). **122 unresolved: 0 test-file /77 command /45 campaign**. Runtime/dependencies,
vectors/crypto census, F-17 debt, previous archives and L-2 remain unchanged. Next: Account receive-editor,
remaining families/qualification repairs, immutable aggregate and private human rehearsal.
No personal browser/server/relay/device/deployment operation occurred.
