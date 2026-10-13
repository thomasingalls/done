# Local Account retirement evidence — 2026-10-13

The non-deleting [lifecycle phase](./account-local-baseline-lifecycle.md) is committed signed as
**`cf16e61a`** (`G`). This document settles the evidence policy before implementing retirement.
It is a design contract, not a claim that the current private carrier enforces these new rules.
All logical history remains stored. No new format writer, deletion, key retirement, product control,
publication or release-validation campaign is enabled here.

## Decisions

1. **Retire volatile network work at the boundary.** Invalidate and refetch old requests rather than
   keep an accumulating archive of request/response proofs. Finish any already committed receive
   promotion before taking the cut; cancelling a fetch must never discard committed writing.
2. **Retain exact, bounded checkpoint evidence.** Keep current frontiers and the latest locally
   installed checkpoint's authenticated identity and complete cut vector. An unknown older cut
   requires history; a signature or larger sequence number alone cannot make it comparable.
   Outstanding durable maintenance/lifecycle attempts postpone retention rather than lose evidence.
3. **Fence the journal with an authenticated retirement era.** An era changes atomically with a
   transition that retires source-identity evidence, after the scoped journal is flushed and empty.
   A journal from another era is preserved and refused, never treated as fresh local writing.
4. **Do not promise arbitrary browser-backup restoration.** Era equality establishes a retention
   boundary, not that an older database contains every dependency or every burned encryption
   invocation. A known partial restore is not an ordinary writable restart. Whole-profile rollback
   remains outside the locally detectable threat model; no service anti-rollback log is introduced.

## Why these distinctions are necessary

The current baseline authenticates a snapshot, terminal own/peer receipts, unconsumed sources,
allocation counters, spool witness and authority cuts. It intentionally does not retain every old
source ID or every accepted link. These are different kinds of evidence:

| Evidence | What it proves | What it does not prove |
| --- | --- | --- |
| Snapshot with verified insertions/deletions | Covered CRDT state | Original capsule identity, attribution/retry ancestry, or an arbitrary past acceptance link |
| Terminal receipt and predecessor link | That exact accepted position and continuation anchor | Every earlier link without the intervening chain |
| Authenticated checkpoint installation | Its exact checkpoint, historical authority and cuts already checked at installation | Compatibility of a different old checkpoint or unknown old cut |
| Counter reservations | Burned local encryption invocations in that copy | Row coverage, completion of a reserved write, or that a restored copy is the latest copy |
| Empty scoped journal under exclusive ownership | No conforming local append crosses this transition | That an old journal cannot be copied back later |

`capturedRecovery` / `capturedSourcePresence` deduplicate by capsule ID **and exact original bytes**.
The added characterization in `test/localBaseline.test.ts` takes an already accepted capsule,
builds/replays a valid reduced baseline, then presents its exact journal bytes to the legacy recovery
helper. The full catalogue suppresses both originals; the reduced catalogue returns both as pending,
although applying them changes no Yjs state. This unsupported composition is the counterexample the
new journal fence must prevent. The current real owner remains safe from this particular composition
because it still supplies the full catalogue. The test does not claim an implemented pairing fence.

## Old network reads

The owner keeps a private **retention operation generation**, separate from membership epoch,
encryption generation and durable baseline revision. Every prepared receive/history fetch captures
that generation and the current baseline identity. It grants no authority on its own.

Before a retirement candidate is captured, suspend new fetch preparation, advance that generation,
invalidate outstanding single/group requests and any unused final-apply permissions, and cancel their
transport waits. A late promise must still check the generation; aborting the transport is not the
fence. Check again before storage mutation and final application. Resume with new signed requests
from the newly verified frontiers and fresh complete authority, even if an old request's cursor
would happen to remain valid. Discard/refetch is expected scheduling, not an integrity error.

The current four-flight prefetch / grouped single-position receipt format stays unchanged. A fetched
but uncommitted group may be discarded in full. A receipt group already committed on the storage
tail is part of the cut: drain its prepared promotion, or abandon retention and leave normal cold
replay to recover it. Never advance a cursor because an HTTP response arrived. An unresolved own
submission, retained refusal/retry attempt, or unknown acceptance still makes this settled-cut
baseline ineligible; its evidence may not be treated as a disposable receive request.

| Read relative to retained publisher frontier `p` | Disposition |
| --- | --- |
| Issued before the retirement boundary | Discard without persistence; refetch using the new owner generation |
| Fresh read after `p` | Normal signature, chain, authority, decryption and coverage verification |
| Duplicate of `p` with its exact terminal receipt retained | May verify as duplicate; no new receive event or content application |
| Older position without an independently retained receipt/chain | `history-required`; never obtain the missing expected link from the reply |
| Conflict at a retained position | Existing authenticated conflict handling; never erase evidence to retry |

`retainedHistory.canVerifyRetainedRead` and `inboundLedger.contextAt` already enforce the pure
replay distinction between retained terminal evidence and unavailable older evidence. Live
generation fencing of `outstanding` / `outstandingGroup` in `accountReceive` remains to implement.
Expiry is not a substitute: a response can outlive its request's nominal 30-second lifetime in memory.

## Checkpoint cuts and durable attempts

Retain, under baseline authentication:

- This publisher's accepted position/link, terminal receipt and invocation origin, and every peer's
  receive frontier, terminal receipt when present, and independently verified starting point.
- The latest installed history checkpoint record: exact checkpoint hash/sequence, admission,
  installation reader and authority, complete publisher cut vector, source inventory, and ciphertext
  needed by its cold verifier. Keep its required openers and historical membership proofs.
- Every unaccepted or partially consumed original with its exact capsule bytes and consumed indexes.
  The baseline snapshot may contain such writing, but it remains unaccepted for publication purposes.

One latest installed checkpoint supplies at most one additional cut per publisher. It is not a
general sparse index of all old links. `draft-2` already carries that record and stream starting
points; its current own-cut verifier still refuses an older cut even when this record could prove it.
The future adapter must resolve the exact retained cut explicitly, not weaken the refusal generally.

For each candidate checkpoint cut `(publisher, position, link)`:

1. A scope-correct zero origin is known independently and never rewinds a frontier.
2. At a retained frontier, retained starting point, or the **exact retained installed checkpoint's**
   cut, compare the link exactly. A different link is an integrity/conflict refusal.
3. Above the retained origin, verify against available suffix receipts or reconstruct the exact own
   attempt at the installation boundary. Preserve the existing rules for a checkpoint establishing a
   new receive starting point beyond what this device has received; do not fabricate receipt evidence.
4. Below the retired frontier with no exact evidence, return `history-required`. Neither a newer
   checkpoint sequence, its service/admitter signatures, a larger `observedThrough`, nor snapshot
   inclusion proves that missing chain link.

Compare cuts independently per publisher; vectors can be incomparable. Do not sum positions, take
the largest sequence as coverage, reset a cursor, or silently omit one publisher's cut. Duplicate
installation of the exact retained checkpoint is a no-op, not a new durable installation event.
Keep normal signature/eligibility, generation/key, snapshot/deletion coverage, sequence and applicable
parent checks for every genuinely new installation.

If evidence is absent, leave any previously retained candidate and current local state intact;
reject a newly fetched candidate without persisting it. Do not advance cursors or stop unaffected
local editing. Do not repeatedly fetch the same incompatible
checkpoint as a network retry. Re-evaluate when its identity or authority changes, or during explicit
maintenance with new evidence. A checkpoint with sufficiently recent cuts can resolve the condition;
the present wire protocol does not ask the service to manufacture an old-link proof. If service
pruning prevents incremental continuation too, catch-up requires that new compatible checkpoint or
an explicit recovery path. Safety wins over silently accepting unknown ancestry. This availability
limit must be surfaced when the reduced reader is integrated; no new UI wording is selected here.

The existing independent checkpoint producer/admitter (`historyOwner` → `readHistorySource`) still
replays admitted service history through exact cuts. A local baseline containing unaccepted writing
must not replace that independent accepted-history source, or turn verification into self-admission.
Local retirement does not authorize service pruning, and service pruning does not authorize local
retirement. The service's existing checkpoint/retention protocol is unchanged.

Inspect authenticated `HistoryMaintenanceProgress` and lifecycle attempts under the slot permit
before making a candidate. A retained proposal/admission, unresolved discard/publication, enrollment,
rotation or recovery attempt that depends on old evidence postpones retirement. Do not automatically
cancel/rewrite it or retain an unbounded set of proof pins. Volatile maintenance reads can be refetched;
durable attempts finish/resume under their existing contract. On capacity/4 MiB baseline overflow,
skip retention and keep history. A later replacement may remove the previous checkpoint proof only
after all remaining references and the replacement's independent cold replay succeed.

## Journal/database pairing

### The additional representation needed before deletion

Introduce a closed, versioned **Account journal payload wrapper**, inside the existing synchronous
AEAD. It binds the local store identity/initialization intent, an unpredictable 256-bit retirement
era and the exact existing source-capsule bytes. The corresponding era is authenticated in the
database metadata and baseline. A plain localStorage marker, timestamp, writer ordinal, encryption
generation, or revision number alone is insufficient. A random era also separates divergent
retirement transitions that happen to choose the same revision.

Keep source capsules and network envelopes unchanged; strip the journal wrapper only after scope/era
verification, before exact source deduplication. This avoids changing published source hashes or
retry identities. Bind a successor era to its predecessor in the authenticated transition. It is
neither a key derivation input nor permission to reset any nonce/reservation counter.

The first era transition drains legacy journal payloads **using intact source history**, removes
only entries covered by completed commits, and proves the scoped journal empty. A legacy entry
reappearing after retirement has no matching era and refuses. Even if it seems covered by the
snapshot, do not silently delete it or assign it a new capsule identity. Keeping every retired
capsule ID forever is not the chosen alternative.

Use explicit new reader/writer format fences for both metadata and journal payloads. Do not quietly
add optional fields to counter-v3/draft-2 or reinterpret `history: complete` as trimmed. Earlier
private and shipped readers must refuse before admitting input or flushing an unknown journal.
Finalize canonical bytes/version numbers in the next non-deleting implementation; these conceptual
fields are not an already supported codec. Reader-before-writer rollout and a compatible rollback
image remain prerequisites for public activation.

### Atomic era transition

1. Acquire the existing exclusive slot Web Lock and serialize storage/admission. Settle earlier
   input, flush exact originals, and require complete dependency coverage and an empty scoped journal.
   Flush/removal failure, pending promotion or a durable attempt makes the cut ineligible.
2. Fence network work as above. Prepare/reverify the candidate from the complete authenticated state,
   including all unaccepted sources and predecessor evidence. Hold the existing admission/journal
   exclusion through native transaction settlement; this design grants no new input-overtaking rule.
3. Reserve encryption invocations durably while retaining the old pointer/era. In the final strict
   IndexedDB transaction, compare fresh authority, expected pointer/counter, exact retained/deleted
   record identities and metadata. Recheck journal emptiness synchronously before mutation. Commit
   baseline, successor era and eventual exact deletion set atomically. Reservations alone are not a cut.
4. Only after successful commit and verification publish the new era to the synchronous journal
   writer, then release admission. No append can occur between the last emptiness check and that
   publication. Unknown/lost completion closes the owner and reopens metadata; do not guess an era.

Before deletion is implemented, exercise this exact transition with an **empty deletion set**.
Non-deleting baseline replacement need not change an established era when it retires no source
identity evidence. Key rotation may retain an era only while retaining those originals and required
openers; encryption generation and retirement era are different dimensions.

Crash before commit retains the old era/anchor and burned invocations. Crash after commit but before
in-memory publication reopens the new era with an empty journal. Crash after a normal new-era append
replays it. Crash after flush commit but before exact journal removal deduplicates against retained
originals. A subsequent retirement is prohibited until that removal finishes. These are ordinary
same-storage crashes, not an arbitrary two-part backup restore.

### Restore dispositions and limits

| Observed state | Disposition |
| --- | --- |
| Normal crash; matching era, authenticated database, required openers and complete journal dependencies | Existing ordered recovery and exact capsule deduplication, then normal admission |
| New database plus old-era journal; old database plus new-era journal; forked same-revision eras; legacy journal after retirement | Preserve both; refuse before replay, allocation, network publication or cleanup |
| Era matches but scope, opener, source bytes, known witness/allocation floor or dependencies disagree | Preserve and refuse; equality of era does not override another check |
| Known manually restored partial or older database, even with a matching-era or empty journal | Not an automatic writable restart; quarantine for explicit recovery, keeping all available copies |
| Coordinated rollback of custody, database, journal and counters with no surviving newer witness | Not reliably detectable locally; no automatic anti-rollback or nonce-safety guarantee |

Era equality is **necessary, not a general restoration certificate**. Within one era, an older
database can still omit a committed remote dependency or have stale encryption reservations.
`next_seq` is a reservation high-water mark, not proof that the reserved writes committed. The
spool witness covers protocol events, not every local source/content commit. Neither substitutes
for complete pairing evidence. Do not resume encryption under known rolled-back counters or
reclassify unverifiable sources as new publications.

This selects refusal/preservation for unsupported raw restore, not a new backup/import UI or a way
to discard acknowledged work. A supported browser restore would need its own authenticated coherent
capture, dependency and key/nonce reconciliation protocol (and potentially fresh keys/identity).
Its implementation is separate. In the table, **known restore** means an explicit restore procedure
or surviving evidence of mismatch. A same-era partial rollback that passes all remaining local
checks is not reliably distinguishable from a crash; the era does not promise to detect it.
The server's [operator-required SQLite restore](./public-restore.md)
does not establish browser pairing and is unchanged by this decision. An external monotonic witness
is still absent; cloned/rolled-back copies must not be described as safely concurrent writers.

## Undo, ownership and implementation gates

Retirement changes the disk representation and replay origin only. It must not replace the live
Y.Doc, garbage-collect structs retained for undo, recreate the UndoManager, increment the displayed
document revision, or publish baseline bytes as an edit. A later undo/redo produces a normal new
capsule in the active era, journals it synchronously, and only then applies it. All existing fresh
authority/lifetime checks, immutable caller copies and close/drain rules remain in force.

The next bounded phase is **non-deleting enforcement of these fences**: journal wrapper/era reader
and writer, metadata pairing, atomic empty-deletion transition, receive-flight invalidation, and
checkpoint/attempt eligibility. Keep full-history replay as the independent oracle. Required focused
controls before actual retirement include:

- Old single/group replies and final-use permissions completing on both sides of the boundary;
  committed-but-not-displayed receive work drains or makes retention skip, without lost writing.
- Terminal duplicate/conflict, unavailable old receipt, exact old checkpoint cut, unknown/forked cut,
  incomparable publisher vectors, and independent checkpoint admission with unaccepted local edits.
- Restored journal in both cross-era directions, same-revision divergent eras, legacy framing after
  migration, wrong scope/key, same-era missing dependencies, and explicit known rollback refusal.
- Renderer death after reservation, final commit, first new append, flush commit and before cleanup;
  removal failure and lost reply. Check source/position identity, not merely visible text.
- Unaccepted and partially consumed sources survive; live undo/redo, subsequent publication and
  reopen agree with the full-history oracle. Unsupported readers preserve every byte on refusal.

Then adapt all remaining full-spool readers and test the exact atomic deletion transition separately.
No current marker asserts that those adapters or restore guards exist. Retained membership/source
proofs, unaccepted/offline tails and workspace size remain growth limits; this decision does not
establish constant cold-open cost or a new performance result.

## Evidence for this decision

[Focused evidence](./development-evidence/2026-10-13-local-retention-evidence/README.md) records the
source audit and characterization run. Existing signed fixtures cover terminal duplicate rejection,
unknown old checkpoint links, replacement/rotation crashes and live undo. They do not validate the
new era/flight/restore policy until its owners are implemented. `docs/progress.md` remains untouched.
