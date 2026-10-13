# Local Account retention — design and experimental replay

The [2026-10-13 baseline format/replay phase](./account-local-baseline-replay.md) implements an
experimental in-memory codec, authenticated candidate builder and pure reader. No application path
uses it; no persistent record, reader fence, migration, installer or deletion is enabled. The separate
warm-load repair changes owner-local reuse only. General release validation remains paused.

## Target and limits

After an authenticated local baseline is installed, ordinary per-task work and cold replay should
depend on the current workspace, unaccepted local tail, unincorporated received suffix and current
authority evidence—not on the number of already incorporated edits. This is not constant time in
workspace size, device count, membership changes or an indefinitely offline upload backlog.

The 2.3-second opening of a 2,320-edit fixture is one point, not an established millisecond-per-edit
slope. A future retention experiment needs several accepted-prefix lengths with the same final
workspace and same pending tail. Compare recovered state, not just elapsed opening time.

## What exists, and what it cannot yet delete

- `contentCompaction.ts` replaces only an exact verified set of content records. It retains source
  capsules, spool decisions, submissions, responses and receive evidence in `heads`/`outbound`.
- `spoolRecord.ts` starts with the original transition grammar, capsule identities, invocation
  counter and source references. `deliveryRecord.ts` reconstructs the acceptance/refusal chain.
- `historyInstall.ts` v2 establishes authenticated receive cuts from an admitted checkpoint.
  The existing installation does not authorize arbitrary deletion of local ledger predecessors.
- Service ciphertext pruning is already separate from local retention. Its retained refusal and
  decision evidence must not be mistaken for a client-local trim permission.

A Yjs snapshot alone cannot replace the ledger. It lacks the authenticated chain anchors, source
allocation/retry state, invocation accounting and authority transitions those readers require.

## Proposed retained baseline

Define a closed, versioned local baseline, bound to the existing store identity, generation and
monotonic baseline revision. Do not persist a JavaScript `AccountLedgerView` object as its format.
The baseline must bind, with bounded representations and exact coverage:

1. A complete Yjs state including deletion coverage, and the accepted/received cuts it covers.
   Pending dependencies prohibit claiming complete coverage. Unaccepted edits remain separate.
2. This publisher's last accepted position and signed chain/head evidence; next position, last
   invocation count and retry/refusal ancestry needed by any surviving unresolved position.
3. Each retained peer's authenticated receive cursor and applicable historical membership and
   checkpoint authority. Do not reset cursors when their old receipts are removed.
4. A spool witness prefix anchor (event count and hash), so full replay can continue from an
   authenticated baseline instead of recomputing removed events from zero.
5. The exact retained suffix and deletion set, including any source capsule referenced by a
   surviving position, envelope, refused attempt or journal entry. Partial-capsule acceptance
   cannot permit deleting a capsule whose other original updates remain unaccepted.

Local authentication can attest to a state obtained by a completed full verification. It does
not manufacture a new service acceptance, grant authority to another device or eliminate the
need to authenticate retained service/member proofs. Decide the precise baseline trust root
and proof-reduction rules before specifying bytes.

## Journal boundary and crash-safe installation

Journal entries use writer identity plus ordinal; source capsules use separate random identities.
Removing capsule bytes while a crash-retained journal copy can reappear would break exact source
deduplication and could republish already accepted work. An unbounded set of retired capsule IDs
would simply move the growth elsewhere.

Recommended first scope: under the exclusive Account owner, settle/flush the journal, remove only
exact covered entries, and confirm the scoped journal is empty before preparing a retention cut.
If removal fails or input arrives, abandon the attempt without deleting source evidence. If a
future design admits concurrent journalling, it needs an authenticated finite journal frontier;
a largest sequence number is not enough. Restoring a mismatched old journal/database pair must
be an explicit refusal/recovery case, not silently treated as a new edit.

Prepare and independently verify the baseline and candidate suffix before deletion. At the final
IndexedDB transaction, recheck the counter, authority, exact physical deletion set and baseline
predecessor; install the baseline/witness and delete only its covered rows atomically. Journal
emptiness is rechecked synchronously under exclusion immediately before that transaction's
mutation. No user input may enter between this check and commit. Preserve burned reservations,
encryption invocation counts and generation accounting. A failed/aborted transaction leaves the
old representation; a lost committed reply must reopen the new one without repeating allocation.

Do not garbage-collect live Yjs structs needed by undo merely because encrypted evidence is
trimmed. Prove undo/redo and subsequent publication across the retention boundary separately.

## Format and rollout decisions still needed

- A new baseline payload and readers that begin from it are required. The sealed-record envelope
  may stay v1; whether counter-v2 can anchor the new baseline without additional authenticated
  metadata remains to be decided. Do not choose version numbers prematurely.
- Install an authenticated reader/writer fence before any deletion. An old cached application
  must refuse the new store cleanly, not replay a suffix as a whole history.
- Ship reader capability before enabling writers, or explicitly require the application update
  that owns the migration. After conversion, an image rollback to an older reader is insufficient.
- Define bounds/chunking rather than assume the existing 4 MiB per-record limit covers months of
  writing. Bound the pending tail independently; retention cannot discard unaccepted work.
- Determine which authority/membership chains can be summarized. If those remain unbounded,
  describe the remaining growth instead of claiming full history independence.

## First implementation-sized step after design approval

The first codec and pure replay experiment is implemented with the narrower eligibility and
limitations recorded in the [phase contract](./account-local-baseline-replay.md). Differential tests
compare full history with baseline plus suffix and the next source/position selection. An unresolved
cut, new authority after the cut, or unsupported historical detail requires intact full history.

Next, integrate owned shadow construction/replay with all history retained. Before deletion, resolve
retention-aware transitions/consumers, the authenticated durable pointer, journal and old-read fencing,
and the exact atomic installer with crash/restart checks. Measure equal-workspace fixtures at multiple
prefix lengths when controlled timing is available. No deletion or format rollout is authorized solely
by this design note.
