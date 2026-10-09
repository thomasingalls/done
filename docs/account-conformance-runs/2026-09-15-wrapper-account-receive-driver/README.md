# Account receive-driver wrapper integration — 2026-09-15

Signed base: `a05369a1`. Bounded integration, not immutable release qualification.

Six original commands remain: typecheck (60s), two-file Vitest (19 cases, maxWorkers=2/verbose, 60s),
then native (9/180s), scheduler controls (5/90s), native controls (2/90s) and generated (1/270s), with
Node concurrency=1/spec/JUnit. The native cases include the four R-01 size controls. Owned execution adds
a 750-second aggregate/five-second grace, disposable CDP fixture, five case reports and 25 required files.
Owned children inherit the runner group; standalone detached groups remain. Typecheck stays exit-only.
No historical reader or vector input is invoked.

Five planning suites pass 126 cases; driver passes 36 in 186.877s /750s;
unchanged transport passes 29 in 190.284s /660s. **191 cases in seven executions**,
then exact reuse. Every group drains. Twenty-five files survive checkout removal in a 26-entry inventory
within 4 MiB /40 entries /two levels. The unchanged manifest suite passes in
55.025s /60s. Its earlier 58.674-second observation remains; loaded-host headroom
is not qualified. All original child/infrastructure deadlines remain.

Five actual scheduler mutations retain calls/timers and before/after-disposal status. They distinguish
overlap, missing idle polling, online erasing a halt, dispatch after observer close and stranded resume.
Disposal must report closed status with no timers. Two native dispatch controls retain held/closed status
and actual request counts for baseline versus omitted offline/pressure guards.

Ten histories (9112052, 5–7 actions, forced publish/restart) retain original wires, actual queries,
candidate pages/chosen response bodies, action query windows, transient offline/lost/halt observations,
text, status, full source identities/bytes and final cold-reopened state. Independent report accounting
checks durable query positions through data/empty/lost/corrupt replies, canonical framing/hash/wire
agreement and restart cursor, authored text and first-observation source continuity. Only local actions
allocate sources. Background empty polling may change idle/working state without changing progress.
Reports save completed observations incrementally; active interrupted work may be absent and cannot pass.

Original 400/100/80 generated unit campaigns retain their independent clock/authority/lifetime assertions
inside the 19 unit cases; no new per-history unit reports are claimed. Native owners retain authentication
and CRDT verification. Report checks do not rerun timers or authenticate signatures.
Five infrastructure cases include two 160-run corruptions (150969/150970). Eight synthetic zero-exit runs
and two omitted semantic/native-census hooks discriminate. These are report/process controls, not further
Account executions.

The schema 3 archive retains **438 payloads in 484,284 bytes**, using lossless
UTF-8/base64 chunks and XZ within the one-million-byte cap. Contracts, selected source snapshots,
reports/logs/receipts and faults are retained. Full input inventories are external hash references.

```sh
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-receive-driver/verify.py
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-receive-driver/verify.py --current --raw
```

The verifier checks archive bytes, contracts/nonces, exact child case/module domains, traces, inventories
and selected polling/transport observations. It does not rerun campaigns or authenticate signatures.
Optional flags require current/external files.

Totals stay **629 obligations /292 required files** and 272 general files /2,198 dispositions
(11 not applicable). **116 unresolved: 0 test-file /74 command /42 campaign**. Runtime/dependencies,
vectors/crypto census, F-17 debt, earlier archives and L-2 remain unchanged. Next: Account sync/composition,
remaining families/qualification repairs, immutable aggregate and private human rehearsal.
No personal browser/server/relay/device/deployment action occurred.
