# Exact local Account deletion plan — 2026-10-13

Design boundary: signed **`bcca1aa1`**. Read with the [reader inventory](./account-local-retention-readers.md),
[retained-evidence policy](./account-local-retention-evidence.md) and [implemented empty-deletion fences](./account-local-retention-fences.md).
**No deletion implementation, format activation or migration is added by this document.**
The subsequent [non-writing planner](./account-local-retention-dry-run.md) implements the exact
inventory/projection checks below. The later [private atomic-removal phase](./account-local-retention-removal.md)
implements reservation and physical removal behind a separate opt-in; this document records its design.

## Selected first cut

Take a **settled current cut**, not an opportunistic numeric prefix. Own allocated positions must all
be accepted and publication ready; conflicts, closures, unresolved replies/refusals/retries or pending
CRDT dependencies make the attempt ineligible. Unallocated and partly consumed original capsules are
allowed only when their exact bytes and consumed indexes fit in the baseline. Local content can
include this unaccepted writing; the baseline is not a claim that the service accepted it.

Settle the ordered admission/storage tail, drain durable receive promotion, flush exact journal
originals and finish their removal, require the scoped journal empty, retire old network flights and
unused final-apply permissions, and check authenticated durable attempts as already implemented.
Keep the slot Web Lock and admission/journal fence through commit, readback and publication of the
new era. Detached owners do not initiate retention. Any ineligible boundary keeps all history.

The first planner summarizes **all logical physical rows in this verified current census**. It does
not choose a historical sub-cut that splits a reservation, position, retry or checkpoint installation.
If the 4 MiB encoded baseline or existing source/publisher bounds cannot represent this cut, skip it;
do not trim less evidence opportunistically or raise limits implicitly. A later bounded partial-cut
design would be separate work. The transaction may be large at first use; this plan does not promise
a bounded foreground duration or authorize deleting in resumable batches.

## Exact inventory and coverage proof

Let `P` be the independently authenticated predecessor baseline, if any; `C` the authenticated
allocation counter before the new reservation; and `R` the complete physical logical-row census in
`content`, `heads` and `outbound` at that boundary. Keep exact store, key and sealed record (including
kind, generation, sequence, nonce and ciphertext), not only a hash, range or maximum sequence.
Preserve the exact old counter/MAC and metadata chunk inventory separately.

Construct candidate `B` from full replay for the first cut, or from authenticated `P` plus verified
physical suffix for later cuts. Its cut records `C.next_seq`, all reservation totals and the exact
protocol witness. It must carry the complete content state and every retained obligation below.
Reopen/authenticate `B` independently and compare **next behavior**, not just visible writing.
For a rebase, the logical cut sequence is the maximum of the prior logical cut and the last new
physical logical-row sequence (zero only when neither exists). It cannot reset to zero when all old
rows have already been removed. Reservation/chunk holes are not logical rows and do not acquire
coverage merely from that maximum; the exact census and witness remain the evidence.

| Physical class in the captured census | Evidence required before its old physical row may enter the plan |
| --- | --- |
| `content` / `update` or `state` | Every insertion and deletion is covered by `B.snapshot`; complete state has no unresolved dependencies. Do not infer this from a state vector, row order or latest `state` record. Preserve the existing `gc: false` snapshot semantics. |
| `outbound` / `done/source-capture/v1`, fully consumed | Every source index has a verified accepted allocation at or before the settled own frontier. Snapshot covers its writing. Identity retirement is protected by the atomic era transition and empty journal. |
| `outbound` / source capsule with any unconsumed index | `B.sources` contains the **whole exact original capsule**, its original placement metadata and sorted consumed bitmap, including inherited consumption from `P`. These bytes survive encrypted inside the baseline; deletion concerns the redundant old physical row only. Never reconstruct a new capsule from the snapshot. |
| `heads` / spool allocation, grant and retry; `outbound` / spool envelope | The entire position/attempt history is verified and settled. `B.own` preserves absolute accepted position/link, all invocation grants including burns and terminal envelope/proof; source consumption is preserved. No unresolved position can disappear. |
| `heads` / delivery submission and response | Verify exact attempt/decision chain before summarizing. Preserve terminal accepted proof/link and its predecessor; any unfinished/refused/final/conflicting publication prevents this cut. Old response maps are deliberately not an indefinite archive. |
| `heads` / inbound receipt | Verify request/page/acceptance, historical authority, decryption and original coverage before summarizing. Keep each publisher's frontier, observed-through, starting point and available terminal receipt. Fetched data alone does not count as committed input. |
| `heads` / history installation | All installed transitions verify. `B.history` retains the exact latest installation record and the proof/ciphertext needed to verify it; per-publisher cuts remain independently comparable with terminal/starting evidence. If one latest record is insufficient to replay the state, skip the whole cut. |
| Unknown tag, placement mismatch, duplicate physical sequence, unverifiable row | No plan. Integrity/compatibility refusal preserves all bytes; it must not be relabelled a harmless capacity skip. |

All classes require the representation, source scope, installed authority boundaries, protocol witness
and allocation checks—not just the row-specific condition in this table. Cross-store protocol events
stay ordered by their original physical sequence. Prefix authority is vouched for by authenticated
baseline state; every suffix event is checked at its exact installed epoch and cut.

The candidate plan is an ephemeral owner-private value with:

```text
scope + initialization intent + owner/authority/retirement-generation identity
expected predecessor pointer, counter/MAC, exact old encrypted metadata chunks
candidate authenticated anchor, current-cut witness/reservation snapshot, successor journal era
deleteRows: exact (store, key, sealed record, coverage disposition) entries
survivors: exact physical rows intentionally left outside this candidate
```

For this settled-current-cut design, `deleteRows = R` and logical `survivors = []` at capture time,
**only after every member of R has the proof above**. The equality is an outcome of exhaustive
verification, not “delete everything below the new state sequence.” Old metadata chunks are a separate
replacement set. No durable per-retired-row manifest or tombstone archive is introduced.

The final transaction must still compare the entire census. A row that appears after planning causes
an abort/replan; it is neither deleted by a range nor silently excluded from the coverage proof.
Future appended rows start after the new baseline's reserved chunk range and form its suffix. A
previously reserved low sequence arriving late is not permitted to cross this settled boundary.

For later cuts, old evidence carried **inside P** must also receive a disposition even though it has
no current physical row: retain unconsumed capsule bytes/consumption, latest history when no new
installation exists, terminal receipts/starting points, authority cuts and invocation totals, or
retire it only under the same settled proof and new era. `deleteRows` alone is not the evidence policy.

## Closed reduced representation

The planned initial encoding is **counter v5 / `done/local-baseline-carrier/draft-3` /
`history: baseline-plus-suffix`**, with mandatory journal era. These are proposed private labels,
not accepted codecs in this commit. Keep the existing era-bearing baseline payload draft-3 if the
adapter/rebase controls establish it contains all required evidence. If they reveal a missing field,
revise the closed payload before any deletion writer rather than adding an ignored optional field.

The counter MAC domain and encrypted chunk prefix must bind the new carrier tag and history mode.
Current v3/v4 `history: complete` retains its meaning forever. No database schema/store change is
needed for this design, but it **is** an on-disk compatibility change. Ordinary readers and earlier
private readers must reject before admitting, flushing, rotating or clearing this representation.

In reduced mode, logical physical rows below `B.cut.nextSequence` are forbidden. Rows in the current
baseline chunk reservation range are also forbidden in logical stores. Missing allocated numbers
remain legitimate burns, not gaps to fill. Existing placement/authentication and protocol completeness
checks apply to the suffix. Do not fabricate source rows at their historical keys on disk to make an
old consumer work. Allocation APIs may use a semantic counter internally but must always persist and
authenticate v5 with its exact pointer.

Old keys and historical custody proofs remain retained. Rotation advances local generation without
discarding the opener of the baseline or any retained checkpoint/receipt. Local baseline retention
does not authorize key retirement, membership-proof compaction, service pruning or backup deletion.

## Atomic installation and retry

1. **Establish the fence and candidate.** Complete the selected-cut checks, authenticate `P/C/R` and
   fresh complete custody, then prepare and independently replay `B`. Bind it to the exact predecessor,
   revision, current cut and a new random era whose predecessor is the old era. No live content change.
2. **Reserve durably in the old representation.** Reserve the exact baseline chunk count, committing
   only advanced allocation metadata with the old pointer/era/history mode intact. Preserve all
   invocation burns. A failed encryption or later abort leaves this readable predecessor; never reuse
   that range. For an already reduced predecessor this reservation remains v5.
3. **Prepare ciphertext and authentication outside the final transaction.** Seal chunks under the
   current retained opener, validate their headers, build the next pointer/counter MAC, and perform the
   complete fresh authority check. Do not await WebCrypto inside a native IndexedDB transaction.
4. **Compare and exchange in one strict content-database transaction.** Include `meta`, `content`,
   `heads`, `outbound`. Compare the expected post-reservation counter/MAC, exact old pointer/chunks,
   and every physical key/sealed row against the captured census. Recheck synchronous owner lifetime,
   activity/authority invalidation and authenticated journal emptiness immediately before writes.
   Then put the new chunks and v5 pointer/counter, remove only surplus old metadata chunks and the
   individually enumerated logical keys. Any mismatch/abort rolls back **all** these changes.
5. **Verify before releasing admission.** Reopen using only the new baseline plus surviving suffix,
   compare expected replay/next-operation state, publish the authenticated new journal binding, and
   invalidate/rebuild warm views, indexes, coverage/memo state, selectors and one-use permissions.
   Keep the live document, UndoManager and editor content revision. Release network/admission fences
   only after success. Uncertain commit or failed readback closes the owner; no stale-era append.

Fresh custody lives in a separate database, so this is not a claim of a cross-database atomic
transaction. It retains the current complete fresh check plus exclusive Web Lock, owned task and
synchronous invalidation contract; a concurrent authority/lifetime change refuses. Do not silently
weaken that contract while implementing the transaction.

| Interruption | Required restart/retry result |
| --- | --- |
| Before reservation | Old representation and era; no cut |
| After reservation or during encryption | Old representation/era plus burned invocations; all logical rows remain |
| Final transaction abort, including late row, metadata or journal change | Old representation with reservation burns; no partial logical deletion |
| Commit succeeds but reply or renderer is lost | New reduced baseline/era and exact survivors; cold replay succeeds without old rows |
| Retry with expected predecessor revision after that commit | Authenticate the committed successor and its predecessor/era creation revision; return already completed, without a fresh reservation or deletion |
| Any other revision, corrupted anchor or inconsistent successor | Refuse/preserve; do not guess a completed cut from visible content or maximum sequence |
| Crash after first new-era journal append, or after its database flush before journal removal | Matching-era replay/deduplication keeps original IDs/bytes and dependencies; next retention waits for exact removal |
| Copied-back old-era, legacy or cross-scope journal | Refuse before replay/allocation; preserve the entry |

Matching eras still cannot certify a coherent arbitrary restore, fresh counters or whole-profile
anti-rollback. The existing [restore policy](./account-local-retention-evidence.md#restore-dispositions-and-limits)
continues to apply.

## Focused controls before enabling a deletion writer

The non-deleting planner should prove the projected result using detached copies; the later native
phase must establish that the real transaction has the same result. Keep controls aimed at these
boundaries, without restarting general release validation:

- Exact row-set coverage with interleaved stores, reserved holes and a late lower-numbered append;
  changed ciphertext/key/kind, missing/extra row or changed baseline chunk aborts the whole exchange.
- Same document text with different deletions, capsule identity, consumed bitmap, attempt burns,
  predecessor link or authority cut must fail comparison. Include a capsule partly consumed before
  the first cut and fully consumed between first and second cuts.
- Two successive rebase/cut cycles, empty suffix, source-only suffix after a later epoch, old baseline
  generation plus new suffix, latest-history inherited without a new install, and a capacity skip.
- Original/joined cold opening, normal send/current-key retry, received group, known/unknown old
  checkpoint, first handoff, later membership, two rotations, detached editing/export and recovery
  destination opening—all using reduced logical reads rather than hidden full rows.
- Preserve current logical journal fencing controls on both custody and rotation readers, flight
  invalidation and committed promotion. Add real final-transaction abort, renderer death, lost reply,
  repeated retry and post-cut source publication checks once deletion itself is authorized.
- Live undo/redo across both cuts with peer edits: same Y.Doc/UndoManager, no installation content
  event, exact new capsule journalled before application, subsequent delivery and cold replay agree.
- Old reader, private flag disabled and unsupported generic Local readers refuse without mutation.
  Index loss/marker inconsistency must not make the reduced store look fresh.

Initial reduced owners used the baseline-aware full reference path with warm reuse/ordinary
compaction disabled. The subsequent [reuse phase](./account-local-retention-reuse.md) extends only
live v5 warm/incremental verification; ordinary compaction remains fenced. These are correctness
milestones, not the final performance result.
On a suitable machine, later measurements should compare equal workspace and pending suffix across
different retired history depths. Reader-first publication, compatible rollback image and supported
`history-required`/capacity behavior are separate gates before converting personal/public profiles.
