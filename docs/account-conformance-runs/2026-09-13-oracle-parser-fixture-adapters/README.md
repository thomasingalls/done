# Delivery-oracle and parser-conformance fixture evidence

Base: signed and verified `950fe83399d5624520838cd73b73aa88de582adf`.
This phase is uncommitted. Prospective packet ceiling: **150 kB**.

The disposable `oracle-parser-fixtures` selection passes **seven files / 46 cases** in
**54.046 seconds**, including fingerprint work. Every selected worker group drained. All seven
test files, fixture helpers, product sources, assertions, populations, seeds and per-test deadlines
are unchanged. Each new Node stage uses the standard 180,000 ms file bound and 5,000 ms drain grace.
Vite builds run in memory, with configuration loading and output writes disabled. No selected fixture
uses a browser or personal service.

| File | Cases | Evidence and limits |
| --- | ---: | --- |
| `account-delivery-oracle/controls.test.mjs` | 12 | Effective reducer mutations compare full state at every affected prefix; four still match the reduced historical oracle |
| `account-delivery-oracle/oracle.test.mjs` | 1 | Independent constraint interpretation cross-checked against 80 complete worlds and all 2,197 three-proof histories in the declared three-position domain |
| `account-parser-conformance/baseline.test.mjs` | 3 | Two historical properties must fail and shrink to one-element arrays; six historical sparse/coerced-field defects reproduce, while current parsers refuse |
| `account-parser-conformance/controls.test.mjs` | 12 | Six parser-family mutations and six repaired type/sparse-array guards admit the same malformed inputs refused by current code |
| `account-parser-conformance/objects.test.mjs` | 7 | Direct nested types, sparse arrays, omissions/extras/prototypes/cycles, independent positives and declared genesis byte edges |
| `account-parser-conformance/submission.test.mjs` | 3 | Generated internal lengths, parent/canonical framing and detached signature bytes; structural acceptance is explicitly separate from signature validity |
| `account-parser-conformance/wires.test.mjs` | 8 | Direct decoder mutations, numeric/count/attempt boundaries, independent positives and real Yjs frames around the 2 MiB wire limit |

The eleven parser properties retain **3,350 inputs**: 750 object, 1,850 wire and 750 submission
inputs, with seeds 112101–112111. Two additional historical properties use seeds 112101 and 112104,
require failure and shrinking, and assert the minimized `[1]` counterexample. Their requested maximum
of 250 each is **not** 500 passing examples. The earlier 500 full delivery histories retain their
separate unchanged `accountDelivery.test.ts` Vitest evidence and were not rerun here.

The twelve delivery mutations operate on the actual reducer inside in-memory bundles. The fixture
starts after verification with placeholder signatures; it cannot establish signature authority.
Four faults (first refusal ID, first final cutoff, submissions and responses) match the old reduced
oracle at every prefix while failing the complete-state check. The finite cross-check is exhaustive
only over its stated small domain, and both interpretations share protocol assumptions.

Parser fixtures reconstruct inputs independently before invoking the actual parsers. Positive wire
checks compare independent encodings. The submission mutation removes both redundant consumption
and re-encoding guards. The real Yjs source boundary does not independently reach the raw-update
sum bound when outer canonical hex framing is already stricter. These are bounded contract checks,
not CPU/memory complexity, large-workload or device-capacity qualification. Native data-shape
readback, authentication, recovery and interrupted persistence remain separate obligations.

## Declaration and historical inputs

The saved pre-change census refused the imported delivery control table. Planning now reads only
the exact reviewed `controls` export from `test/account-delivery-oracle/helpers.mjs`, restricted to
literal keys and two nonempty string patch values. It parses and pins all helper bytes without
importing dependencies, executing the module body or invoking functions. Unknown consumers/imports,
dynamic tables, mutable exports, invalid/duplicate keys and symlinks refuse.

A 160-population property (seed 130925) checks independently derived case order and names, table
removal and same-name helper changes. Changed module bytes refuse before launch, before reuse and
after execution. Three retained synthetic owner receipts show two passes and one required drift
refusal, all drained. The fixtures deliberately omit this nested helper from their synthetic source
fingerprint so the explicit metadata checks must discriminate. Existing Vitest JSON inputs retain
their path scope and also receive a final byte check in addition to full source fingerprinting.

Historical inputs enter the receipt contracts as reference/revision/path/hash tuples:

- Delivery controls: `test/accountDelivery.test.ts` at `77b0bb6239f7b7a48c4a52c74d3e3f39e39994a3`.
- Parser baseline: `src/crdt/promotionRecord.ts`, `src/crdt/spoolRecord.ts`,
  `src/crdt/startupClassification.ts` and `account-protocol/genesis.ts` at
  `f0b6acd2e624d89034c88706d4053a830ab50cc6`.

The locator validator adds four exact paths; the spool path was already supported. Twenty-one
captured historical control receipts cover all seven tested locators: fourteen passes and seven
required drift refusals, all drained. Checks cover before launch, receipt reuse, changed Git
replacement bytes during execution and replanning to a new identity. Other historical contracts
remain byte-identical.

## Validation and retained scope

All **92 pure adapter tests**, **23 Node ownership tests** and **five Vitest process tests** pass.
Direct TypeScript, scoped lint/format, exact manifest layout, inventory, authority, signature and
whitespace checks pass. Complete release planning correctly refuses with unresolved obligations.
The twelve unchanged native ownership controls retain the preparation packet evidence and were not
rerun; browser fixture code and contracts are unchanged.

The [ledger packet](../2026-09-13-ledger-fixture-adapters/README.md) retains an initial expected-pass
historical service-path control classified `orphaned-child`. Its cause remains unresolved despite
later passing runs. These results do not establish a fix; preserve the observation for owner and
loaded-host aggregate reliability work.

All **157 prior general contracts / 1,357 identities** remain unchanged and retain earlier evidence.
General selections now contain **164 files / 1,403 cases: 96 Vitest and 68 Node files**. Account has
58 files / 309 cases. The 624,464-byte manifest retains 612 obligations / **253 unresolved rows**:
94 test-file (78 Node, sixteen Playwright), 96 command and 63 campaign. All eleven catalogues remain
resolved. These counts describe integration work, not a count of product defects.

`summary.json` records run identities and artifact hashes. The packet retains complete selected
receipts/logs, 24 historical/registration control receipts, the exact source patch including its new
reader, 225 source/helper/schema pins and all prior general contracts. Binary auxiliary outputs use
hashed base64. Full raw source/dependency inputs remain at the recorded ignored output path; their
archive hash and actual source/dependency/runtime identities are retained here.

Optional `ACCOUNT_REPORT_DIR` reports are disabled. Saved JSON postconditions, whole wrappers,
ordered vector prerequisites and native siblings remain blocked. Subsequent docs/evidence changes
do not turn this selection into an immutable aggregate. All 21 personal/package files, 31 prior
vectors and L-2 remain unchanged. Personal profiles, servers, the packaged root build, historical
archives, formal debts and signing backups were not changed.

Next review the three transport service fixtures (controls, generated histories and service cases),
then browser-backed receive fixtures and the remaining owners/wrappers before release qualification.
