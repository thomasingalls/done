# Local Account baseline format and replay — 2026-10-13

First-slice record describing draft 1, committed signed as `c50e3741`.
The [transition/reader phase](./account-local-baseline-transitions.md) documents current draft 2. The subsequent
[owned shadow integration](./account-local-baseline-shadow.md) adds an explicit opt-in caller and
corrects identity parsing to match the real custody contract; no persisted baseline or deletion.

**First implemented as an experimental, pure codec/builder/reader. No history is deleted.** At that
boundary the application did not import the new modules, recognize their tag, create or open one.
No IndexedDB schema, sealed-record format, network receipt, service API, journal or custody record
changes. General release validation remains paused. This phase makes no latency or storage-saving
claim about the running application; host load precludes reliable comparative timing for now.

This is the first implementation slice of [local retention](./account-local-retention-design.md),
not a retention installer. Code: `src/crdt/localBaselineRecord.ts` and `localBaselineReplay.ts`.

## Authority and trust

The input is **one settled, authenticated owner census**: detached opened rows, authenticated counter,
verified custody/lineage and membership context, retained generation keys and a lifetime assertion.
This helper does not open a browser database, authenticate a supplied counter MAC, unlock custody,
acquire a Web Lock, inspect the journal or decide whether native transactions have settled. The
eventual owner adapter must establish those facts before calling it. A caller-supplied “verified”
boolean is not a substitute. Stored rows and counters remain authenticated by the existing carrier.

Construction runs the existing full spool witness, installed authority-boundary, source/envelope,
delivery, receipt/checkpoint and exact content-coverage verifiers. All source originals must be
covered, including unallocated ones. Self receive progress is derived from signed accepted decisions.
The snapshot must have neither pending structs nor pending deletions. A state vector alone is not
coverage evidence. Document content can include locally durable writing not yet accepted by the
service; its source bytes must survive separately.

The baseline is a **local authenticated summary** of this completed verification. Its MAC uses the
owner's metadata authenticator with the distinct `done/account-local-baseline-auth/draft-1\0` domain.
It does not create a service decision or a membership proof. Independently retained frontier envelopes
and signed acceptance heads are checked again on baseline replay, including envelope contents and
coverage; retained checkpoint proof/decryption is also checked again. Older, summarized local facts
are vouched for by the local MAC rather than reconstructed from discarded ciphertext.

The codec returns **plaintext bytes** plus a MAC, for private in-memory use only. These are not an
export format and must not be stored unencrypted. A future installer needs an encrypted carrier,
authenticated active-baseline pointer and reader fence. Counter v2 does not contain that pointer.
The draft reader takes an independently trusted `(revision, payload SHA-256)` anchor. Deriving that
expected anchor from the blob being checked would defeat rollback protection. Revisions and predecessor
hashes do not themselves detect a restored matching old database/metadata pair; that remains a restore
policy issue. No durable rollback guarantee is established by this pure reader.

## Closed draft format

The tag is `done/account-local-baseline/draft-1`, tuple version 1. Canonical UTF-8 JSON uses exact-length
arrays, lowercase even-length hex, safe integers and deterministic ordering. Unknown fields, trailing
fields, versions, noncanonical bytes and malformed bounds refuse. It is deliberately **not a persisted
`AccountLedgerView`**.

| Field | Meaning |
| --- | --- |
| Identity | Bounded custody identity strings for slot/principal/workspace; hexadecimal content store/root IDs (corrected during native shadow integration) |
| Generation/revision/predecessor | Local content generation, positive baseline revision, predecessor payload hash; revision one has the zero predecessor |
| Authority digest | Canonical digest of owner-supplied public route, service, original baseline/cuts, current authority, reader/publisher, verified history and installed membership boundaries; no secret key bytes |
| Cut | Creation intent, greatest retained physical sequence, next reserved sequence, all per-generation reservation counts and spool event-count/hash anchor |
| Snapshot | Complete Yjs v1 state with deletion information, generated without GC; no live document or undo stack is replaced |
| Own prefix | Last accepted position/link, total invocation grants including burns, terminal envelope/acceptance proof and predecessor link |
| Retained sources | Exact original capsule bytes and original physical placement, plus sorted already-consumed indexes for partially used capsules |
| Streams | Sorted publisher IDs, prefix position/link, observed-through, checkpoint starting point and available terminal envelope/acceptance proof |
| History | Latest retained history-install record, independently reverified; absent when there was none |

The draft caps total encoded payload at **4 MiB**, retained capsules at **4,096**, publishers at
**128**, reservation generations at **1,024**, and consumed indexes at the existing **64** per capsule.
These are refusal bounds, not a claim that one record fits months of writing. Large snapshots,
unaccepted tails or checkpoint evidence can exceed the bound. Chunking and a final persistent format
remain open; no bound was increased in the live carrier. Invocation counts retain the existing
strictly-below-2^32 limit. Local content and network generations are distinct.

Every returned candidate is authenticated, reopened by the new reader and compared with the full
reference for encoded document state, own acceptance/invocations, receive frontiers and installed
history. A valid full history can be ineligible for this draft. For example, if several old checkpoint
records are needed to justify its retained cuts, retaining just the latest cannot silently suffice.
Failure returns no usable candidate and has no storage effects.

## Eligible cuts and suffix replay

The first builder accepts a **settled cut**: all allocated positions at that cut are accepted,
publication is ready and no stream has contradictory evidence. An open position, refusal or final
closure makes that cut ineligible. An earlier eligible cut can still be replayed with a later,
verbatim unaccepted suffix. Fully consumed capsules disappear only from the hypothetical baseline;
unallocated and partially consumed capsules retain their complete bytes and exact source identity.

Replay seeds position numbering, acceptance link, consumed indexes, invocation count, receive
frontiers and the event witness from the baseline. It verifies every suffix transition through the
existing parsers and crypto verifiers and checks the extended witness against the current owner
counter. Pending updates are allowed in a later suffix under existing coverage rules, but cannot be
hidden in a new complete baseline. Caller buffers are copied before asynchronous work; no returned
view borrows them. Copied generation keys are erased after success or failure, and lifetime checks
surround verification and publication of the result.

Every suffix row must have a sequence **at or above the cut's next reserved sequence**, not just above
its last committed row. This preserves burned reservations and rejects a previously reserved row
arriving after a supposedly settled cut. Current counters cannot regress generation, intent, next
sequence or any retained generation's reservation count.

The draft permits only the **same authenticated authority** after the cut. A changed context, a new
history installation, or a receive request needing an older retired receipt refuses. It does not
reset a cursor, invent an old response, ignore an event or weaken a membership check. The caller can
then use the intact full history. This is intentionally a **pre-deletion** fallback: it is not a
solution once those predecessors have actually been removed. Authority transitions and old in-flight
reads must have a retention-aware disposition before deletion is enabled.

The shared readers now have an optional baseline origin. Ordinary calls still start at zero.
Delivery link extension, self receive projection, next-position selection and source selection honor
that origin. The live owner, its incremental indexes, audit reader, transitions and startup still
use full history; passing the draft result wholesale into them is not supported.

## A defect found by testing

Initial document/ledger comparisons passed, but a next-operation comparison failed. With original
index 0 accepted and index 1 unallocated in the same capsule, the reduced reader initially let the
source selector choose **both indexes**. The full reader chose only index 1. The consumed bitmap had
been checked during replay but was absent from the reconstructed selection state.

The origin now retains those consumed references, source selection consults them, and next-position
allocation adds the retained position offset. The failing test remains in `test/localBaseline.test.ts`.
This establishes why matching visible text alone is an insufficient retention oracle.

## Focused evidence and remaining work

[Check outputs](./development-evidence/2026-10-13-local-baseline/README.md) cover generated cut/replay
comparisons (fixed seed `13102026`, 30 histories), real signed certified-peer receipts, signed
refusals, accepted current-key retries across prior membership changes, checkpoint cuts, exact content
compaction, unallocated/partial capsules, burned reservations, unfinished positions, malformed and
tampered artifacts, wrong anchors/scopes, missing evidence, pending dependencies and caller/lifetime
isolation. Subsequent actor-scoped undo/redo after a replay and a peer update agrees with full replay.
This does **not** prove preservation of an already-live undo stack through a future installer, which
does not exist yet. Existing shared-reader and current-key retry regressions are also run.

No generalized validation inventory, release campaign, mutation matrix or performance campaign was
started. `docs/progress.md`, owned by the other seat, remains untouched.

The next bounded phase should connect **owned shadow construction/replay while retaining all history**:
prove settled journal/transaction eligibility under exclusion and compare results on the real owner
path. Before physical deletion, the following are still required:

- Retention-aware membership/checkpoint transitions, old-read fencing, startup, audits, warm indexes
  and outstanding-operation consumers; an intact-history fallback cannot remain their only answer.
- An authenticated durable baseline pointer and writer/reader compatibility fence, encrypted bounded
  storage/chunking, and atomic installation with an exact deletion set, including crash/lost-reply cases.
- Journal exclusion and exact clearing. The draft is not a retired-capsule tombstone set: it cannot
  detect an old original deliberately resealed as a new capsule after the cut. Installation must
  prevent old journal replay or explicitly reject a restored mismatched journal/database pair.
- Native undo continuity and restore/rollback handling; retention does not authorize opener removal.
- Equal-workspace measurements at several history depths when controlled timing is practical.

The long-term target remains work proportional to retained CRDT state, necessary evidence and the
outstanding suffix. It is not constant time in workspace size, Yjs structure/deletion state,
membership history or an indefinitely offline backlog.
