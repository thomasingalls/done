# Synchronous encrypted journal — implementation phase four

**Scope:** the locally originated byte journal, attached to mandatory-factor custody and the
[content carrier](./content-store.md). This component has no canonical document, editor, transport,
admission queue or flush timer. Those remain the next owner. The application still uses its earlier
persistence, and this checkpoint does not pay a release debt.

## Public boundary

`openJournalSession(authority, code)` holds the same shared slot permit through key derivation,
journal operations, content commits and disposal. Current custody and content must already exist.
It authenticates their state and the current scoped journal before returning a capability. An unavailable
journal or an unreadable entry refuses normal open; it is never treated as recovered empty storage.
The authority/cross-carrier startup checks remain required integration work, as in the earlier phases.

`appendLocal(update)` is synchronous. A `journalled` result contains the entry key and generation and
arrives only after `localStorage.setItem` returns successfully. It invokes no promise-based crypto.
Oversize, quota/watermark and unavailable storage return `refused` with a cause. Refusal neither queues
the input nor mutates a document; the future admission owner must retain ordered private input, force
the content batch and withhold canonical promotion until that commit. No method accepts a caller's
assertion that some journal bytes have already been persisted.

`loadRecovery()` captures and authenticates the journal **before** reading a consistent content snapshot.
It returns all captured journal updates plus all authenticated content records. The order prevents a
concurrent flush from falling between an earlier content read and a later empty journal read. Duplicate
updates across carriers are expected and Yjs replay must preserve their idempotent semantics. The inherited
`loadRecords()` remains a content-only primitive; full recovery uses `loadRecovery()`.

`flushJournal()` attempts an exact private journal snapshot synchronously at invocation. Transient capture
churn can move that snapshot to a bounded later retry before any content write. It commits those authenticated
bytes as content `update` records in batches of at most 256, using the actual content owner's durable
allocator and transaction-completion receipt. Only after each batch completes does it compare each
captured entry's current key/value and attempt removal. A late appended suffix is outside the captured
set and remains. A changed value is retained and marks the journal repair-required; an unavailable cleanup
retains the affected entry. The result distinguishes completed content receipts from removed/retained
entries. A cleanup failure does not undo content durability. A failed content batch clears none of its
entries; completed earlier chunks can already have cleared theirs.

The coordinator owns the 250 ms batching window, forced flushes, `whenDurable()` and queue-wide ordering.
The carrier schedules only bounded read-retry delays; it does not retry content writes. A flush covers its
successful capture, including entries that arrived before a replacement capture if the invocation-time
attempt changed. Later entries remain outside that set. The raw byte interface does not validate Yjs,
guarantee causal closure of caller inputs, or turn an arbitrary memory-only remote dependency into durable state.

## Selected bytes and ownership

The construction remains row 2's:

- `K_journal = HKDF-SHA256(K_g, empty salt, LP("done/journal/v1") || LP(workspaceId))`, 32 bytes.
- `AAD = LP("done/jrnl/v1") || LP(workspaceId) || LP(decimal generation) || LP(storageKey)`.
- `"2:" || base64(u32be(generation) || randomNonce[24] || XChaCha20-Poly1305 ciphertext || tag[16])`.

Derivation happens once under the live task using guarded WebCrypto calls. The journal subkey is the
selected narrow raw-byte exception; roots, generation keys and private credentials remain private to
custody. The raw journal key is cleared before releasing its lifetime permit. Only generation 1 is
currently supported: another generation is a retained, repair-required reference, not an absent entry.

The existing RustCrypto WASM module now exports authenticated `open` as well as `seal`. No second cipher
dependency was added. The generated wrapper clears its staged key, nonce, AAD and data buffers after every
operation, including authentication failure. `dispose` zeros the entire instance memory and permanently
refuses future operations. Custody closes admission and drains work before clearing the raw key, disposing
the instance and releasing the permit. This is logical disposal of owned memory, not an engine/OS forensic
zeroization guarantee. Returned plaintext belongs to the caller's document/recovery owner.

The module was rebuilt from the unchanged locked RustCrypto dependencies using installed Rust
`1.100.0-nightly (0ed41eb41 2026-09-04)`. The builder uses `--locked --offline`; the output records source
hashes and toolchain identity. The toolchain-free checker tests the published KAT, unchanged journal
vectors, opening/tag refusal, bounds and disposal. This does not discharge the existing toolchain
provenance/reproducibility debt or establish a new independent audit.

The namespace stays `done.pending-update.${encodeURIComponent(dbName)}.` using the existing derived
database name. The shared derivation was extracted into [storeName.ts](../src/crdt/storeName.ts) so the
slot index, content and journal agree. New entry suffixes contain the custody store id, a random 128-bit
runtime writer id, and a monotonic runtime ordinal. Conforming writers never overwrite or reuse an entry
identity. Generation lives in the authenticated `2:` framing; the namespace does not hide unknown or
legacy entries by introducing a separate format prefix.

## Reads, cleanup and pressure

Journal enumeration captures own keys, reads the scoped values and authenticates all of them, then
rechecks the scoped key set and exact values before returning. A changed key census or disappeared entry
refuses that attempt with `journal-changed`. Initialization, recovery and flush apply the [bounded read-only
retry policy](./journal-contention.md): three total captures, yielding between attempts, with cancellation
and a distinct `journal-busy` result on exhaustion. Only acquisition repeats; content writes and cleanup
do not. An observed immutable-value replacement latches repair. Authentication, unsupported/legacy versions, malformed/canonical
base64 failures and missing-generation openers refuse with `repair-required`, preserving entries.
No readable prefix is returned from an unreadable snapshot. Other database namespaces are left alone.

localStorage does **not** provide an atomic compare-and-delete operation. Cleanup's equality check is
safe among conforming writers because entry identities are immutable and never reused: another cleaner
can only remove the same already-covered entry. It detects replacement between capture/commit and
cleanup, but it does not exclude arbitrary hostile or older nonparticipating writers between individual
localStorage calls. Supported-version cutover and exclusive transition/retirement census remain owed.
The lifetime permit supplies no missing localStorage transaction.

`MAX_JOURNAL_UPDATE` is the existing interim **16 KiB** limit, checked before nonce generation and the
WASM buffer guard. The watermark is **1 Mi UTF-16 key/value characters observed across this origin**,
not an entry count. A full snapshot refreshes accounting; local appends/removals and storage events update
it. Reading all storage is kept off each keystroke. Events from other processes can lag and unrelated
same-window writes can make the estimate stale, so this watermark is advisory. The native synchronous
`setItem` result remains the authority; quota refusal cannot produce a saved receipt. The watermark does
not claim that an origin or platform has a particular quota or that concurrent tabs share an exact budget.

Neither old handset timings nor a desktop smoke run certify the changed wrapper and complete append
path against the under-1-ms low-end p95 target. Supported-population measurements, including the longer
storage keys, framing and buffer clearing, remain L-4 work. Oversize slicing and total queued-byte limits
remain admission responsibilities.

## Evidence and remaining work

Run `pnpm storage:journal` or `node scripts/journal/run.mjs`; options are `--output`, `--case` and
`--no-mutants`. The runner freezes the production modules and generated WASM wrapper, records their
source/build/test/contract hashes, rejects external browser requests, and uses strict loopback port 5178.
Results and limits are recorded in the [phase-four execution](./storage-conformance-runs/2026-09-08-journal.md).

Journal-only renderer death, mixed content/journal offline replay, real quota exhaustion, failed content
commit, cleanup refusal/replacement, concurrent handoff, close/disposal and multiple flush chunks are
separate scenarios. The post-content/pre-cleanup kill uses a deliberate debugger breakpoint in the
isolated fixture followed by actual renderer death. Tests use synthetic identity authorities and synthetic
profiles; no real application data or legacy routing is changed.

Next is the bounded ordered admission coordinator: private intent preparation, journal refusal forcing
content, and canonical promotion only after a carrier receipt. Editor/IME/undo/transport integration,
complete startup/clear/migration, exact content trim and generation/receiver/reference composition remain
subsequent work. This journal is not a completed encrypted-store product.
