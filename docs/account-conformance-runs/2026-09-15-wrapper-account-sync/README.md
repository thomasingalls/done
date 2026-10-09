# Account sync/composition wrapper integration — 2026-09-15

Signed base: `50bb2d2c`. Bounded integration, not immutable release qualification.


## 2026-09-15 — Account sync/composition wrapper integration

Receive-driver is signed and verified as `50bb2d2c`. Composition retains six original commands:
typecheck (60 seconds), three-file Vitest (30 cases, maxWorkers=2/verbose, 60 seconds), native
(12 cases/600 seconds, including R-01 historical sealed/submitted size cases), scheduler controls
(5/90 seconds), native controls (4/150 seconds) and generated (1/450 seconds). Node retains
concurrency=1/spec/JUnit. Owned execution adds a 1,410-second aggregate/five-second grace, disposable
CDP fixture, five distinct child case reports and 28 required files. Owned children inherit the runner
group; standalone detached groups remain. Typecheck is exit-only with its log retained. The invoked
`4bb09042f37f68ec31f0d82587af608f599eb096` versions of `accountEnvelopePreparation.ts` and
`accountDelivery.ts` are pinned by full revision/path/bytes. No vector input is invoked by this wrapper.

The five actual scheduler mutations retain measured lane choices/calls/timers and before/after-disposal
status: fairness, overlap, halt, resume and wake. Native offline/pressure controls retain submit counts
and held/closed statuses. The witness control now saves actual refusal/error and successful mutated
cold-open state instead of hardcoded result rows. Self-stream and failure-classification controls save
actual receiver progress and editor state; the shared baseline must agree across their reports.

Eight native actual-service histories (9112062, 5–7 actions with forced edit/restart) retain exact detached
submission bytes, observed network-encryption nonces, received server responses and whether the client
reply was lost or delivered; read queries record continued/aborted transport. Per-action windows retain
transient offline/lost-reply status, source capsules, position/source assignments, attempts, text and
both durable lane counters through cold reopen. Independent bounded binary framing/ciphertext-digest
checks bind the envelope position/nonce to the actual submission; retries must preserve first-observed
bytes and source assignments. Source identities and full original bytes remain checked throughout;
only edit actions allocate a new capsule. Reports save completed observations incrementally and before
final assertions. Interrupted active work may be absent and cannot pass.

Original unit-generated scheduler/queue campaigns and native assertions remain intact. Report checks do
not authenticate signatures, decrypt writing, rerun timers, or infer delivery from a response discarded
before reaching the client. Those authorities remain in the actual service/native tests. Read response
bodies are not newly recorded; query progress and lost-read status corroborate the existing assertions.
One network seal per observed position remains required; a lost submit need not cause a retry if the
self-stream independently recovers acceptance.

The owned epoch passes **219 cases in seven executions**: 131 planning cases in five suites, 52 composition
cases and 36 unchanged driver cases. Composition takes **563.242s /1,410s**; driver takes
187.132s /750s. Every group drains; exact reuse passes. Twenty-eight files survive checkout removal in
29 inventory entries within 4 MiB /44 entries /two levels. The unchanged 70-case manifest suite passes
in 57.162s /60s; its earlier 58.674-second observation and loaded-host headroom debt remain.
Five new infrastructure cases include two 160-run corruptions (150971/150972). Eight synthetic zero-exit
runs and two omitted semantic/native-census hooks discriminate; these are not additional Account runs.

Totals stay **629 obligations /292 required files** and 272 general files /2,198 dispositions (11 not
applicable). Unresolved integration falls from 116 to **114: zero test-file /73 command /41 campaign**.
Runtime, package/dependencies, vectors/crypto census, F-17 debt, earlier archives and L-2 remain unchanged.
Next: Account service-inbound wrapper integration, then remaining families/qualification repairs,
immutable aggregate and private human rehearsal. No personal browser/server/relay/device/deployment
operations occurred. 


The schema 3 archive retains **491 payloads in 523,188 bytes**, using lossless
UTF-8/base64 chunks and XZ within the one-million-byte cap. Contracts, selected source snapshots,
reports/logs/receipts, both historical writer files and faults are retained. Full input inventories are
external hash references.

```sh
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-sync/verify.py
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-sync/verify.py --current --raw
```

The verifier checks archive bytes, contracts/nonces, exact child case/module domains, traces, inventories
and selected composition/polling observations. It does not rerun campaigns or authenticate signatures.
Optional flags require current/external files.
