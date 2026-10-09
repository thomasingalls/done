# Recovery, promotion, activation and handoff fixture evidence

Base: signed and verified `5334a7c1aea698c926a626c8618daa527ef42f58`.
The new implementation is uncommitted. Prospective packet ceiling: **150 kB**.

Two disposable selections ran at **identical frozen inputs**:

| Selection | Files | Cases | Elapsed, including snapshot/fingerprints |
| --- | ---: | ---: | ---: |
| `account-fixtures` | 22 | 112 | 127.643 seconds |
| `generated-tests` | 14 | 222 | 129.785 seconds |

All **36 files / 334 cases** passed; every group drained. The `service-fixtures` subset adds eleven
Node files / 56 cases, all executed inside `account-fixtures`. Existing Account and generated cases
were rerun because the finite data reader is shared. Other general file receipts remain earlier
evidence; these runs are not the complete immutable aggregate.

## Reviewed fixture scope

| Family | Files / cases | Effects and process ownership |
| --- | --- | --- |
| Recovery | controls, core, crypto, properties, restart: 5 / 24 | Synthetic recovery/passkey proofs; temporary core SQLite; copied-source mutants; inherited Account-core IPC crash worker |
| Promotion | core: 1 / 6 | Temporary authority/core databases; signed observation and abandonment histories; copied-source live-state control; inherited Account-core crash worker |
| Activation | controls, core, restart: 3 / 20 | Admission core fixtures and independent challenge oracle; temporary databases; copied-source assertion/expiry/target mutants; inherited admission crash worker |
| Handoff | core, ES256: 2 / 6 | Synthetic admitted core/authority fixtures; copied-source credential-integrity control; in-memory OpenSSL DER/P1363 property checks |

These files neither import their native sibling fixtures nor launch browsers or HTTP listeners.
Core/admission workers close/disconnect normally and remain in the bounded inherited process group
through crash tests. Temporary databases and copied mutants have cleanup hooks. Optional
`ACCOUNT_REPORT_DIR` exports are disabled for file selection: wrapper artifacts, historical-source
reproductions, native suites and ordered prerequisites remain separate obligations.

The new passing properties retain **660 histories**: recovery 160 (seed 9162026), promotion 120
(9202026), activation 120 (9110401), handoff issuance 60 (9252026) and DER conversion 200 (9262026).
Activation also requires a deliberately failing stale-proof property to shrink (9110402, requested
run budget twelve); that budget is not claimed as twelve passing histories. Its wrapper-specific
counterexample export is not credited here. All product source, test bodies, titles, assertions,
seeds, populations and deadlines remain byte-identical to the base.

## Parser extension and controls

The activation core's two existing names use `changed ? 'different' : 'same'`. The before-census
artifact records its earlier refusal. The finite reader now selects a branch only when its guard
resolves to a boolean. Numeric/string/object truthiness, active helper calls and conditional test
registration still refuse. It evaluates no helper or module during planning; unreachable data
branches are not evaluated. Existing product names remain unchanged.

All **111 non-native runner/control tests** pass: 88 pure tests, eighteen owner tests, five actual
Vitest controls. They include **3,200 generated control histories**; the added 160 histories compare
Node and Vitest branch identities against independently constructed expected names and loop order.
Actual Node and Vitest reporters reconcile boolean names. Existing skip/omission/deadline/leak
controls also pass. Thirteen complete Vitest control receipts retain three expected passes and ten
required failures. The first pure check used `Duplicate` where the existing refusal says `duplicate`;
it is retained along with the corrected passing check. No product test required repair, retry or a
longer deadline.

## Retained evidence

`summary.json` records counts, both timings, identical source/dependency/runtime inputs, artifact
hashes and raw output paths. Each selection archive retains every stage contract, receipt, case
report, log and ownership event. `source-patch.diff.gz` is exact and unnormalized and reverse-checks
against current code/test bytes. Selected source/helper pins match the frozen inputs; all 36 product
test files match signed `5334a7c`. Before-census and old-population comparison artifacts are retained.
The complete raw input archives remain in the recorded ignored output directories; this packet
retains their hashes and actual input digests.

Typecheck, scoped lint/format, inventory/manifest, signature, authority and whitespace checks pass.
The full release planner correctly refuses its **289 unresolved obligations**. Typecheck and lint
logs are separate from the seven-command `final-gates.json`. All previous 117 general stage contracts
and 1,150 identities are unchanged. General selections now cover 128 files / 1,206 cases: all 96
Vitest files and 32 Node files. Remaining test adapters: 114 Node and sixteen Playwright.

The 21 personal/package files, 31 prior vectors and frozen L-2 hash remain unchanged. No personal
server, profile, Account or root build was used. Prior archives, formal debts and signing backups
are retained. Eleven native ownership controls retain earlier evidence. Later documentation/evidence
updates do not turn these bounded runs into a release, loaded-host or platform qualification.
