# Account receive-transport wrapper integration — 2026-09-15

Signed base: `d178d349`. Bounded integration, not immutable release qualification.

Five original commands remain: typecheck (60s), two-file Vitest (15 cases, maxWorkers=2/verbose, 60s),
then native (9 cases/120s), controls (4/90s) and generated (1/330s), each with Node concurrency=1/spec/JUnit.
Owned execution adds a 660-second aggregate/five-second grace, disposable CDP fixture, four child case
reports and 19 required files. Owned children inherit the supervising group; standalone detached groups
remain. Successful empty typecheck output is permitted. No historical reader or vector input is invoked.

Five planning suites pass 121 cases; receive-transport passes 29 in 202.259s
/660s; unchanged receive-editor passes 151 in 148.047s /570s. **301 cases in
seven executions**, then exact reuse. All groups drain. Nineteen files survive checkout removal in a
20-entry inventory within 4 MiB /32 entries /two levels. The unchanged 70-case manifest suite passes in
58.674s /60s. Only 1.326 seconds of observed manifest margin remain; its headroom needs review before immutable qualification. Timings do not qualify loaded-host reliability.

Sixteen generated histories (9112042) retain all 6–9 actions, including forced lost/receive/restart
boundaries: initial text/capsules, original wires, actual requests, candidate signed pages, chosen
response bodies, operation outcomes, visible text, receipt status and full source identities/bytes.
Aborted transport records no response body; corrupt transport records malformed bytes. A generated
candidate page is not claimed delivered merely because it was constructed. Completed observations save
incrementally and final cold-reopened observations before closing; unfinished work cannot pass.

The independent report checker requires durable request positions, canonical request/page framing,
request hashes and exact wire binding, correct lost/corrupt/receive dispositions, ordered text/receipt
progress and first-observation source continuity. Only a local action may allocate one source. Native
owners retain signature/authentication and CRDT verification authority. The original unit assertions
and native seed/count/endOnFailure/context-closure behavior remain.

Queue controls now retain actual initial/published text and results; cancellation controls retain
settlement before and after cancellation completes. Flight/response-bound measurements remain. Original
compiled mutations must still apply exactly once. Five infrastructure cases include two 160-run report
corruptions (150967/150968). Eight synthetic zero-exit runs and two omitted semantic/native-census hooks
discriminate. These are process/report controls, not additional Account executions.

The schema 3 archive retains **368 payloads in 445,944 bytes**, using lossless
UTF-8/base64 chunks and XZ within the unchanged one-million-byte cap. Contracts, selected source snapshots,
reports/logs/receipts and fault controls are retained. Full input inventories are external hash references.

```sh
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-receive-transport/verify.py
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-receive-transport/verify.py --current --raw
```

The verifier checks archive bytes, contracts/nonces, exact child case/module domains, traces, inventories
and selected transport/editor observations. It does not rerun native tests or authenticate signatures.
Optional flags require current/external files.

Totals stay **629 obligations /292 required files** and 272 general files /2,198 dispositions
(11 not applicable). **118 unresolved: 0 test-file /75 command /43 campaign**. Runtime/dependencies,
vectors/crypto census, F-17 debt, earlier archives and L-2 remain unchanged. Next: Account receive-driver,
remaining families/qualification repairs, immutable aggregate and private human rehearsal.
No personal browser/server/relay/device/deployment action occurred.
