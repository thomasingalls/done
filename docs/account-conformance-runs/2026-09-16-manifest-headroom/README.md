# Manifest planning headroom


## 2026-09-16 — Manifest planning headroom without changing execution authority

Service-inbound is signed and verified as `a55ae626`. Profiling found 70 Git subprocesses per manifest
compilation, including repeated historical source reads. A synchronous per-compilation snapshot now
shares pins by absolute root, exact reference and path, returning defensive copies. Nested scopes start
fresh and restore their parent; completion, exceptions and rejected asynchronous callbacks release the
scope. `assertHistoricalInputs` bypasses the planning snapshot: pre-launch, receipt reuse and post-run
checks still read the actual Git expression, including replacement objects. No persistent cache or
cross-execution trust is introduced.

The same-input differential comparison against the signed implementation produces the exact same
manifest. Git launches fall from 70 to 42 per compilation. Three local repetitions are diagnostic, not
a controlled performance campaign or a new release qualification. The original 70-case manifest suite
passes in **38.171s /60s**, compared with the prior 59.108-second owned observation; the 45-case
wrapper infrastructure suite passes in **39.798s /60s**. Deadlines, cases, selectors, report limits
and historical checks are retained. This repairs observed single-host headroom; it does not guarantee
loaded-host timing or qualify the whole release.

The final owned epoch passes **172 cases in six complete executions**, then exact manifest receipt
reuse: 70 manifest, 45 wrapper infrastructure, five general-selection, 12 generated-registration, four
Account fixture and 36 runner-stage cases. Every process group drains. Runner-stage takes
30.559s /120s and includes the existing before-launch/reuse/during-execution Git-replacement
controls. Three new cases cover scoped freshness, root/reference/path separation, defensive copies,
nesting/error unwinding and fresh execution checks. Both deliberate faults (cached execution and a
persistent planning snapshot) are detected. The first owned epoch stops on stale general-census
expectations after passing manifest and wrapper suites; its evidence is retained. The exact counts are
refreshed for the three new cases, and the complete affected selection passes. Initial scratch baseline
setup and unavailable ESLint invocation are retained; repository Oxlint and scoped formatting pass.

Totals remain **629 obligations /292 required files**. General files remain 272, with dispositions
increasing from 2,198 to **2,201 (11 not applicable)**. Unresolved integration stays **112: zero test-file
/72 command /40 campaign**. No wrapper is newly resolved in this repair. Runtime, package/dependencies,
vectors/crypto census, F-17 debt, prior archives and L-2 remain unchanged. Next: Account activation
wrapper integration, remaining wrappers/qualification repairs, immutable aggregate and private human
rehearsal. No personal browser/server/relay/device/deployment operation occurs.
[Evidence and verifier](./account-conformance-runs/2026-09-16-manifest-headroom/README.md).

The archive retains 115 complete payloads in 287,636 compressed bytes, using schema-3 lossless
chunk deduplication and XZ. It includes complete owned receipts, logs/case reports, failed census epoch,
source snapshots, profiles, differential outputs, mutation code/results and bookkeeping scripts. No
report is truncated to fit. Full input inventories remain external by SHA-256 and byte length in
`raw-artifacts.json`; they are not self-contained in the archive. Profile timings are local diagnostic
observations, with no calibrated loaded-host or release performance claim. The earlier inventory-only
differential mismatch is explained in the retained differential record; the final comparison is exact.

Run `python3 docs/account-conformance-runs/2026-09-16-manifest-headroom/verify.py` from the repository.
Add `--current --raw` to check the current source snapshots and the original external inventories.
The portable verifier checks retained bytes, contracts, exact case populations, deadlines, nonce binding,
reuse and mutation/differential evidence. It does not rerun tests or establish independent runtime truth.
