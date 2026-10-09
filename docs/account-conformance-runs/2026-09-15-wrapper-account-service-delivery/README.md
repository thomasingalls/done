# Account service-delivery wrapper integration — 2026-09-15

Signed base: `6ca643f5`. Bounded integration, not immutable release qualification.

The wrapper preserves **32 cases across four service files**, their exact Node invocation/default file
concurrency/spec/JUnit and 90-second child bound. Its already-retired v8 browser child is removed;
all six product-test exclusions and required v9 interoperability remain. The service stage takes
23.776s under its new 95-second aggregate bound and acquires no browser.
The invoked `2cb42a2:account-service/core.ts` reader is pinned and its Git read gains five-second/2-MiB
limits. Delivery regression retains `81a4655` and uses its own disposable CDP fixture.

Five full planning suites pass 96 cases; delivery regression passes 31 in
269.083s. **159 real cases in seven executions**, then exact service reuse.
Every group drains. Ten files survive checkout removal in an eleven-entry inventory. A new five-case
campaign-wrappers infrastructure file avoids adding cases to the old manifest suite, which keeps all 70
cases and its one-minute limit (56.718s here). No loaded-host reliability claim.

Four actual mutation controls retain normal-code outcomes alongside accepted bad outcomes and actual row
counts/account state. Eighty generated histories retain every command's inventory/ledger/result, commit-cut
rows and cold retry bytes. Reconciliation checks exact responses, subject/framing agreement, permanent
row identity and contiguous acceptance. Ledger projections cover ordinal/kind/position/digest; reports do
not independently verify signatures, reproduce ciphertext, replay the database or regenerate schedules.
Existing Node/OpenSSL proof assertions and directed exact-submission checks remain execution authority.
Inventory scope is promotions and delivery decisions. Baselines use distinct synthetic workspaces except
the witness control's same damaged ledger.

Two 160-run corruption campaigns and eight synthetic process runs distinguish incomplete successful-looking
reports. Omitting semantic reconciliation or child census admits the corresponding fault; both controls
discriminate. Synthetic reports are not additional service executions. No new planning or native failure
occurs. Earlier failures, reporter/experimental API diagnostics and owner/headroom observations remain.

The schema 3 archive retains **249 payloads in 528,828 bytes**, below its
1,000,000-byte budget. Content-addressed 16 KiB chunks preserve original bytes through UTF-8/base64 and XZ.
The first gzip packaging attempt exceeded the fixed budget; its script and failure note are retained.
The larger compression dictionary preserves every payload without raising the limit.
Contracts, source snapshots, receipts, reports/logs, historical readers and fault programs are retained.
Large full input inventories remain external hash references.

```sh
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-service-delivery/verify.py
python3 docs/account-conformance-runs/2026-09-15-wrapper-account-service-delivery/verify.py --current --raw
```

The verifier checks retained bytes, contracts, nonces, case domains, ordered traces, inventories and selected
semantic/control observations. Optional flags require current/external files; it does not rerun campaigns
or independently authenticate signatures/storage.

Totals are **629 obligations /292 required files**, with **128 unresolved: 0 test-file /80 command /48 campaign**.
General coverage stays 272 files/2,198 dispositions (11 not applicable). Runtime/dependencies, crypto census/
vectors, F-17 debt, prior archives and L-2 are unchanged. Next: transport wrapper disposition/integration,
remaining wrapper families/qualification repairs, immutable aggregate and private human rehearsal.
No personal browser/server/relay/device/deployment operation occurred.
