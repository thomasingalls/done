# Exact-coverage content trim

`JournalSession.compactContent()` is explicit maintenance inside the existing shared writer lifetime. The
host supplies no document, state vector, sequence watermark or deletion set. Custody still verifies its
scoped authority and mandatory generated factor before the journal-capable session opens. The original safety checkpoint
covers the generation-one encrypted carrier; it does not schedule maintenance, change the default app,
archive application days, retire keys, or implement Account checkpoint/receive authority.

## Construction

1. Authenticate the scoped synchronous journal without removing it. Read the counter and all content,
   heads and outbound records in one IndexedDB snapshot. Validate layout/allocation and authenticate every
   record; unreadable retained heads/outbound also refuse the whole operation.
2. Decode and apply content `update`/`state` bytes to a private validation document. Malformed encodings refuse. If any Yjs struct or deletion dependency remains unresolved, return
   `retained` with no reservation, publication or deletion. The generated cross-client counterexample in
   [storage properties](./storage-properties.md) demonstrates that merging an incomplete union can strand
   text even after dependency delivery in pinned Yjs. Once the content union integrates fully, merge its
   actual wire updates with `Y.mergeUpdates`. The validation document is never the snapshot source.
   No application repair, garbage collection of persisted updates or editor/transport mutation occurs.
3. Reserve one state record through the existing authenticated global allocator. The replacement is
   limited to the existing 4 MiB record/batch budget; oversize refuses before reservation. Publish the
   encrypted state and await native transaction completion. Failed or abandoned encryption consumes its
   committed reservation. A state kind or high sequence still grants no deletion authority on its own.
4. Reread and authenticate all current records and validate content bytes again. Check that the published
   replacement and every initially covered content record retain their exact header, nonce and ciphertext.
   A changed record refuses. Missing coverage or replacement can be another compactor's completed work:
   return `retained`, performing no deletion from this invocation.
5. In one readwrite transaction spanning every content store, recheck the entire authenticated counter and
   record census. A changed census retries authentication before any deletion. Recheck the scoped journal
   synchronously, then delete only the initial covered content sequences. Await transaction completion
   before returning `compacted`. Heads/outbound, the journal, later records and concurrent replacements
   remain untouched. Counter/reservation history is never reduced.

A cold disk union, not one tab's view, supplies coverage. A late commit into reserved sequence 2 survives
when the replacement at 4 covers only 1 and 3. Concurrent compactors can leave two replacement records;
a later fresh invocation can merge both. Eight conflicting deletion censuses return `retained` with safe
duplication, rather than extend maintenance indefinitely under contention. Incomplete content returns `retained` without another reservation. Empty content or a single
validated complete state returns `unchanged`. Dependencies present only in the journal do not authorize
content deletion; a later flush and fresh compaction can make progress.

## Failure and lifetime

Publication and deletion are separate committed transactions. A crash before publication retains every
input; a crash after publication can leave replacement plus inputs; a crash after deletion has the committed
replacement. There is no persisted trim watermark to trust on resumption. Reopen, authenticate and begin a
fresh compaction. Every deletion request in an aborted transaction rolls back, including when earlier
requests already reported success. A retry can compact the safe duplicates.

Damage discovered after publication retains both replacement and old inputs. A typed `repair-required`
closes and drains that session so it cannot continue ordinary admission; persisted key/custody references
remain. Missing initialized content metadata is normalized to that same repair refusal; a changed generation
also closes the stale session and requires reopening. Storage aborts or the bounded size limit permit explicit retry. Close/cancellation stops further
publication/deletion and drains pending crypto/native work before releasing the shared permit to an
exclusive transition. This operation never upgrades its lock.

## Foreground interruption (2026-10-11)

Automatic admission maintenance now supplies an interruption signal to `compactContent`.
New local/remote input or a durability barrier requests interruption; the queue remains exclusive
until the current owned flight has settled. `maintenanceTask` checks interruption before effects
and async operations, and periodically yields before starting async work. Its lifetime signal is
still the writer's signal: foreground input does not close the workspace or release its permit.
An already running crypto job returns its output to its cleanup scope. A transaction whose guarded
callback observes interruption aborts; an already completed transaction remains completed.

Only `MaintenanceInterrupted` restores the scheduling threshold for a fresh attempt after durable
idle. Storage/size failures, incomplete unions, integrity failures and generation changes retain
their existing dispositions. A cancelled reservation remains consumed; a published replacement can
remain beside its covered inputs. Retrying always begins with a new authenticated census.

The final deleting transaction collects all keys and values with paired `getAll`/`getAllKeys`
requests instead of cursor round trips. It still checks every row's placement and exact bytes,
the complete counter, and the synchronous journal before deleting the original exact coverage.
No stored-format, journal-flush timing, authority, nonce or durability rule changes.

This is cooperative interruption, not concurrent admission or a split prepare/commit design.
Synchronous Yjs work and a native operation already in progress can still delay input. Continued
typing can defer compaction until idle. See the [bounded measurement packet](./performance-experiments/2026-10-11-foreground-maintenance/README.md)
for measured scope and remaining limits.

The final journal check and IndexedDB commit span different browser storage APIs. It authenticates the
journal visible at that synchronous check; it is not an atomic cross-storage observation against arbitrary
external tampering. Participating writers append immutable journal identities, and compaction never removes
journal entries or their keys. Raw origin deletion, rollback/cloning, old non-participating writers and
malicious same-origin execution remain outside this protocol's protection.

## Evidence and limits

`node scripts/content-trim/run.mjs` freezes production and harness bytes, uses actual IndexedDB, WebCrypto,
Web Locks and WASM journal encryption in disposable Chromium contexts, and records bounded schedules and
source mutants. The fixture supplies synthetic identity and other-carrier creation checks, while enrollment,
content initialization, journal access and compaction use production owners. Native callback delivery is
held at named boundaries; native transactions are aborted after request success; CDP kills renderers.
One adversarial fixture uses its known test factor to replace a record with differently authenticated bytes
at the same identity, proving that an exact-byte check is necessary even beyond tag validation.

Unit tests use fake IndexedDB and immediate-grant lock doubles for wiring only. Browser schedules cover
exclusion and crash behavior on the recorded host, not power loss or a supported-platform population.
The entire disk union is read, authenticated and merged in memory; its resource cost, low-end latency and
large-state chunking remain open. Automatic admission scheduling now has the foreground interruption
described above. The 4 MiB output bound does not imply
bounded input memory. No independent crypto/storage review or release debt is paid by this checkpoint.
