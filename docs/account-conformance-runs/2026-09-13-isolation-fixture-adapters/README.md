# Account isolation service fixture evidence

Base: signed and verified `dbf5eb5bde96930c3a56daddeaf70969f3996c35`.
This new phase remains uncommitted. Prospective packet ceiling: **150 kB**.

The disposable `isolation-fixtures` selection passes **five files / 23 cases** in **56.245 seconds**,
including snapshot and fingerprint work. Every process group drained. Product source, test bodies,
names, assertions, seeds, populations and deadlines remain byte-identical to the signed base.
Only explicit file selection, policy checks, census expectations and planning snapshots change.
The existing finite census, stage runner, reporters and historical-input checks are unchanged.

## Reviewed fixture scope

| File | Cases | Required behavior |
| --- | ---: | --- |
| `core.test.mjs` | 8 | Cross-account capability/proof matrix in five lifecycle states; independent neighboring abandonment; cold offered/active authority |
| `recovery.test.mjs` | 2 | Crossed live recovery capabilities/proofs refuse without writes; cancelling one ceremony leaves the other confirmable |
| `generated.test.mjs` | 3 | 160 shared-service histories plus directed before/after-commit reply-loss histories |
| `controls.test.mjs` | 3 | Real selector, pending-target and abandonment-scope guard omissions expose forbidden neighboring effects |
| `restart.test.mjs` | 7 | Six SIGKILL commit boundaries and two concurrent service processes, with neighbor preservation and exact retry |

Two synthetic accounts, using Ed25519 and ES256 credentials, share one temporary Account-core
database and one temporary authority database. Helpers create fresh recovery ceremonies and use
test-owned cryptographic framing/challenge checks. The isolation transition oracle checks complete
durable rows after executed commands; it snapshots some initial offer fields from the implementation
and verifies their bindings. It does not independently derive every field of the initial offer.

Generated histories use per-history cleanup, closing databases and authority handles and removing
temporary directories before the next history. Copied-source mutants live in disposable output
directories. The existing admission IPC worker handles crash and concurrent-process cases; normal
close shuts both service handles and disconnects, and teardown kills workers still alive. Workers
remain in the inherited process group under the unchanged three-minute file bound and five-second
drain grace. No browser, HTTP listener, root build or personal service is used.

## Property and mutation evidence

The passing property retains **160 histories at seed 112103**, with commands for each account's
legal transitions, crossed capabilities/proofs, restart and before/after-commit reply loss.
Its original operation-coverage assertions remain. Directed histories exercise all three loss
boundaries on both commit sides while a neighbor remains live.

The abandonment-scope mutant has a separate property at seed **112104**, requested budget 80.
That property must fail, shrink, and report a neighbor-row or full-durable-oracle discrepancy.
Its passing test establishes those assertions; eighty is not claimed as eighty passing histories.
The other controls show why an unknown-token refusal alone misses a valid-but-unbound selector,
and why crossed abandonment needs its explicit pending-target binding.

Optional `ACCOUNT_REPORT_DIR` exports are disabled in this selection. The wrapper's saved histories,
metrics and shrunken-counterexample artifacts are not credited by ordinary case success. The whole
`scripts/account-isolation/run.mjs` obligation remains blocked with its ordered vector/native
prerequisites; its existing call to the retired delivery-v8 native fixture needs disposition before
wrapper certification. This phase does not revive that fixture.

## Validation and retained evidence

All **88 pure runner/census/adapter tests** pass. The existing generated policy-change control now
includes the five isolation files, and exact-selection checks retain all older file contracts and
the separate wrapper obligation. Direct local TypeScript, scoped lint/format, exact generated
manifest layout, inventory, authority, signature and whitespace checks pass. The complete release
planner correctly refuses. No product selection failed or needed repair, retry, fewer histories or
a larger deadline.

The unchanged owner's 26 non-native process controls and eleven native ownership controls retain
previous evidence; they were not rerun. All **136 prior general contracts / 1,258 case identities**
are unchanged and retain earlier execution evidence. General selections now contain **141 files /
1,281 cases: 96 Vitest and 45 Node files**. The Account subset has 35 files / 187 cases.
The manifest has 612 obligations and **276 unresolved rows**: 117 test-file (101 Node, sixteen
Playwright), 96 command and 63 campaign. Its 593,705 bytes remain below the unchanged 700 kB ceiling.

`summary.json` records the actual input digests, elapsed time, raw output path and artifact hashes.
The selection archive retains every stage contract, receipt, complete case report, log and ownership
event. The packet also retains the exact source patch, 45 selected source/helper pins, all prior
general contracts and product-test preservation checks. Raw full input bytes remain in the recorded
ignored output directory; their archive hash is retained here. The patch reverse-checks and source
pins match the frozen execution bytes.

All 21 personal/package files, 31 prior vectors and L-2 remain unchanged. Historical reviews/evidence,
formal debts and signing backups are retained. Subsequent documentation/evidence edits do not turn
this bounded run into an immutable aggregate, workload/platform qualification or release approval.
