# Ledger-contract runtime fixture evidence

Base: signed and verified `01c44471e06898ad8bceab822e237128ede3cb69`.
This new phase remains uncommitted. Prospective packet ceiling: **150 kB**.

The disposable `ledger-fixtures` selection passes **three files / 14 cases** in **29.743 seconds**,
including snapshot and fingerprint work. Every selected process group drained. Product code,
test bodies, names, assertions, seeds, populations, vectors and deadlines are unchanged.

## Reviewed scope

| File | Cases | Required behavior |
| --- | ---: | --- |
| `batch.test.mjs` | 2 | Original two-update batch correspondence, historical reader refusal, and actor/order/byte-budget mutation controls |
| `controls.test.mjs` | 5 | Capsule identity, authenticated source correspondence, witness count/hash, ordering/coverage, and previous-hash omission controls |
| `formats.test.mjs` | 7 | Fixed bytes, leaf binding/omission, canonical framing, capsule bounds, combined ledger checks, witness chain and 200 generated spool histories |

`runtime.mjs` builds the actual ledger modules and reviewed mutants with Vite using
`configFile: false` and `write: false`. It evaluates the resulting IIFE in Node with the installed
Yjs instance supplied explicitly. Builds and source overlays remain in memory; no browser, HTTP
listener, root build, personal profile or service is used. The inherited process owner keeps its
unchanged three-minute file deadline, log/report bounds and five-second drain grace.

The checked-in corpus has **twenty entries, ten of them carriers**. Its bytes enter the ordinary
source fingerprint. Runtime checks compare production encoders/verification with independent
test-owned framing, Node cryptography and a spool-history oracle. The property retains **200 runs
at seed 5110917**, including missing rows, changed witnesses and honest partial prefixes. It explicitly
does not claim detection of coordinated rollback of both rows and their witness.

The standalone vector generator check, optional `ACCOUNT_REPORT_DIR` exports, whole wrapper and its
ordered native/vector prerequisites remain separate obligations. This selection executes all three
files, including the batch file, without granting whole-wrapper credit.

## Historical batch input

The batch fixture loads
`284a97a27dc3344fcb7c55a8757a2a41c74fe0b9:src/crdt/spoolRecord.ts` through its runtime helper.
Historical metadata now permits that exact source path in addition to the previously reviewed
Account-service paths. Siblings, other source directories, absolute paths and traversal remain
unsupported. The original reference, full revision, path and SHA-256 enter its stage contract/key
and are checked before launch/reuse and after execution. The existing five-second read timeout and
2 MiB output ceiling are unchanged; cooperative pre/post checking retains its transient/hostile-change
limitations. Using an old reader as a negative control does not re-admit retired product support.

Actual synthetic Git replacement controls now exercise both `account-service/core.ts` and the
new CRDT path. They change historical bytes without changing checkout identity, reject stale launch
and reuse, give explicitly replanned bytes a different receipt key, and fail/drain an otherwise
passing fixture whose historical input changes during execution.

## Ownership observation and validation

The first unfiltered owner run passed twenty tests and failed one historical-input control on the
**existing Account-service path**, reporting `orphaned-child` for its expected-positive execution.
That log is retained. Its first receipt was removed by the then-existing teardown and is unavailable.
The cause remains unresolved; neither a leak nor a transient classification has been established.

The historical control helper now optionally captures its output before cleanup. The focused
two-test rerun and full unfiltered **21-test owner rerun** pass, including both source paths. The
owner implementation, acceptance rules and time bounds are unchanged. Twelve complete historical
control receipts are retained across the two reruns: eight expected passes and four required drift
failures, all drained. This observation remains open for owner/loaded-host aggregate reliability;
the later passes do not erase the first failure or prove that it cannot recur.

All **88 pure census/adapter tests** pass. Direct TypeScript, scoped lint/format, exact generated
manifest layout, inventory, authority, signature and whitespace checks pass. No product selection
failed or needed repair, retry, fewer histories or a larger deadline. Five unchanged Vitest process
controls and eleven native ownership controls retain prior evidence and were not rerun.

## Preserved evidence and remaining scope

`summary.json` records actual input digests, elapsed time, raw output path and artifact hashes.
The selection archive retains each stage contract, receipt, case report, log and ownership event.
The packet also retains the historical pin, 23 selected source/helper/vector pins, exact source patch,
prior contracts, product-test preservation, and both successful and failed owner logs.

The first packer assumed copied control output was all UTF-8 and encountered macOS `xcrun_db`
files. The corrected archives preserve those binary files as hashed base64 alongside the text
receipts/logs. No tests were rerun for packaging. Full raw input bytes remain at the recorded ignored
output path, with their archive hash retained here. Source pins match frozen execution and the patch
reverse-checks against current code.

All **141 prior general contracts / 1,281 identities** are unchanged and retain earlier execution
evidence. General selections now contain **144 files / 1,295 cases: 96 Vitest and 48 Node files**;
the Account subset has 38 files / 201 cases. There are 612 manifest obligations and **273 unresolved
rows**: 114 test-file (98 Node, sixteen Playwright), 96 command and 63 campaign. The 597,511-byte
manifest stays below its unchanged 700 kB ceiling. Full release planning correctly refuses.

All 21 personal/package files, 31 prior vectors and L-2 remain unchanged. Historical reviews/evidence,
formal debts and signing backups are retained. Subsequent documentation/evidence edits do not turn
this bounded run into an immutable aggregate, workload/platform qualification or release approval.
