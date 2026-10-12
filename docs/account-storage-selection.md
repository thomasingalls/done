# Account storage selections — 2026-10-12

The previous verifier-ownership slice is signed as `f4f01228`. This slice lets private Account
operations ask for a detached answer without first receiving every opened carrier record.
It changes no stored format, counter authentication, journal ordering or audit policy.
The [measurement packet](performance-experiments/2026-10-12-storage-selection/README.md) records
comparison and activation evidence. Selections are now the branch default for incremental v9
Account owners after the focused checks; this slice is not deployed. Release validation remains paused.

## The boundary

`ContentCrypto.selectiveLoads` is an explicit private-validator contract. It requires warm loads,
opened-row reuse and a validation callback; only the v9 Account composition opts in. During a
warm selection, that callback receives retained carrier rows as immutable input. The Account
verifier copies any new/changed rows into its own ownership, as before, and never retains carrier
buffers. Generic/Local owners and ordinary full-record load callers retain their original contract.

A selection performs the same authenticated counter, count/first/last-key, rolling physical audit
and semantic validation as a normal warm load. Unexpected counters and resume invalidation still
force a complete physical read. Cold selection follows the normal full verification path and
cleans up its temporary opened records. No identity alone establishes verified content.

Only after validation succeeds does the carrier create a synchronous selection lease. Its payload
is hidden in a module-private WeakMap; callers see no rows, buffers or identity fields. The verifier
checks that the live lease belongs to exactly its validated view and clones the selected answer.
Thus callers may mutate or erase selected buffers without changing either retained cache. There is
one selected-result clone, not another clone of that detached answer in the carrier.

The lease expires in `finally`, including when selection throws. Promises/thenables are rejected;
a mistakenly asynchronous callback cannot retain authority while awaiting, and its eventual
rejection is observed. Each use checks the task and carrier lifetime/resume state. A stale,
foreign, forged, invalidated or closed lease cannot read the verified view. No public editor,
transport or `ContentSession` API receives selection authority. Selection callbacks over carrier
rows are deliberately absent.

This is a memory-isolation boundary within trusted code, not a sandbox against arbitrary code
running in the application origin. The private validator must not mutate or retain borrowed rows;
the existing callback/reducer ownership contracts continue to apply.

## Consumers

Journal persistence now decodes its small incoming capsule set and selects exact source-presence
answers from the verified catalogue. Conflicting identities still refuse. Existing capsules are
not persisted again; only missing original source frames and their capsules are appended.

Receive state, delivery/spool status and the publication check can select their verified projection.
The delivery owner also uses selections when preparing an existing submission or reading status/
submission bytes after committing a decision. Existing authority checks keep their positions;
selection adds no network operation. Network replies still re-enter serialized storage and obtain
a fresh checked view.

Operations that need actual records retain the detached full read: cold recovery, full export,
compaction, independent reference audits, envelope preparation and speculative commit verification.
This is not removal of all copies from every Account operation. Caller cleanup on those paths
continues to own and erase only its detached bytes.

## Scope and remaining work

`VITE_ACCOUNT_SELECTIVE_LOADS=0` retains the full-load path; disabling warm loads or selecting the
full reference ledger also prevents selection. The [warm-load detection window](account-warm-ledger-loads.md)
for old interior corruption is unchanged. No public format/reader fence or migration is needed.

Semantic prefix checks, container copying, selected results, graph cleanup and real full-record
consumers still grow with history. Local retention remains [design-only](account-local-retention-design.md).
Removing copies does not establish phone latency, cold-open or arbitrary-history-size budgets.
