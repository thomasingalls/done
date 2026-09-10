# Authenticated inbound replay preparation

This is an executable design checkpoint, not a receive implementation. The private v8 sender and
schema-4 service remain unchanged. The next implementation starts with a bounded receive verifier and
ledger under the existing lifetime; editor integration and enrollment follow their own checks.

## Authority and starting state

The current `readAcceptedPage` reconstructs a prefix from the caller's own spool. It cannot bootstrap a
receiver. Its request also uses one credential for both read authorization and the only publisher stream.
Keep that v1 contract closed. Do not remove the spool comparison and trust a returned acceptance head.

A receive owner must already hold the service/origin/root pin, authenticated lineage and epoch head,
certified publisher signing keys and actor bindings, permitted generation openers, and a locally retained
baseline. Neither an operator token nor an acceptance signature installs any of these facts.

The first supported baseline is the exact admitted promotion genesis: original candidate, creation and
recipient certification, admission manifest/receipt and root/epoch evidence, wrapped generation key,
decrypted checkpoint, and independently rederived Yjs state-vector **and deletion-set** coverage. It has no
accepted publisher positions. Each certified stream starts at position zero and the selected zero link.
Hash the canonical retained admission receipt to name this baseline; a response cannot choose its ID.
An empty document, a bare state vector, or a service-provided link at position N is not a baseline.

Later checkpoint baselines require admitted semantic coverage and retained per-publisher `(position,link)`
proofs as selected in row 7/S0-5, with pending dependencies resolved. A signed snapshot alone does not
suffice. The first owner refuses non-genesis baselines and epoch/generation advancement. It must not invent
a shortcut for already-edited v5 histories or restore a cloned publisher's signing key/counters.

| Authority | Source and check |
| --- | --- |
| Reader | Current service admission plus possession of that reader's certified signing credential |
| Publisher | Credential named by the envelope, independently resolved in held certified membership |
| Content opener | Generation key delivered through the client-authenticated recipient gate, sealed under fresh factor custody |
| Actor | Decrypted actor ID/kind must be one of the exact bindings authorized for this publisher; no arbitrary `agent` or relabeling |
| Acceptance | Current held `K_accept`, held tip, exact ciphertext subject and locally reconstructed predecessor |
| Starting content | Admitted semantic genesis/checkpoint, never the current response or read credential |

Private first-epoch runtime supports only the creating publisher, epoch 1, generation 1, human-principal
and system actors already bound to it. The preparation's two-publisher/fresh-reader fixtures are synthetic
authority inputs, not evidence that production enrollment or multiple writers exist. Retired, foreign,
future-epoch and unsupported generation input is refused without changing progress. Historical replay
across revocation/rotation needs its own authenticated history policy; do not silently treat old records
as currently authorized. A finalized head is an unsupported transition in this first receiver.

## Separate reader and publisher in the next wire version

Proposed canonical UTF-8 JSON, no whitespace, with the existing closed numeric/hex/size rules:

```
["done/private-read/v2",2,serviceId,origin,workspace,readerCredential,publisherCredential,
 lineage,epochHead,epoch,after,limit,nonce,expires,readerSignature]

["done/private-read-page/v2",2,hash(exactSignedRequest),through,next,
 [[hex(exactEnvelope),hex(exactAcceptanceProof)],...],acceptanceSignature]
```

Each signature covers its array without the final signature field. Limits remain 4096 request bytes,
10 MiB response bytes and at most eight entries at the codec boundary. The first receive request uses
`limit=1`. The service must resolve the reader's membership independently of the selected publisher and
recheck both plus the authenticated ledger before issuing a page. Its existing one-credential database
query is not a multi-member resolver. These v2 bytes are test fixtures only in this phase; v1 has no new
meaning and neither route nor schema is upgraded here.

The owner captures its exact signed request before dispatch and copies the bounded response and all caller
buffers before any crypto await. Persist only those verified owned copies, including on a duplicate check.
Recheck the lifetime before returning a duplicate as well as before staging a new event.
Verify request hash, page signature, scope,
nonce/request binding, live expiry and count/extent before interpreting entries. The request starts at
the owner's durable received position for that publisher. A continuation is computed from received
contiguous entries; a returned `through` is only an authenticated advertised high-water mark. Each committed
receive event retains it; reject later fresh pages below the largest such retained mark, including after
restart. A stale duplicate response contributes no new durable knowledge: re-fetch from the current cursor
to observe further progress. This does not claim retention of every discarded response. An end page does
not prove global convergence, cross-stream completeness or absence of withheld remote dependencies.

Expired requests cannot authorize new receipt. Already committed evidence remains usable offline after
its request expires: cold replay verifies its original signatures and scope, not a fresh wall-clock claim.
Freshly replayed old responses fail the active-request binding. If progress changed during a fetch, recheck
against current storage; exact already-retained entries are idempotent, not a new commit or cursor reset.

## Receive transition and retained bytes

Receive progress is per `(baseline,lineage,publisher)`, separate from outbound accepted-through, local
record sequences, invocation grants and Yjs clocks. The value means **all envelopes through N have been
authenticated and durably retained**, not that all their edits are visible. No caller may set it.

For each entry, require the next contiguous position or an exact retained duplicate. Verify the publisher
signature/digest and exact v2 route, then the acceptance proof against the held previous link. Decrypt
under the matching generation opener, check actor binding and decode every original Yjs update. A valid
signature over a different prefix is unknown, not a baseline. A different accepted digest at an already
retained position is a conflict only if its proof verifies from that position's independently held prior
link. Preserve both original evidences and halt Account networking; keep Local writing available. Unknown,
unsigned, malformed or unrelated input supplies no progress and no remint authority.

Use a new authenticated promotion reader fence, provisionally **v9 `account-receiving`**. Earlier factories
must refuse it before opening admission. Activation under exclusion validates the full v8 census and
original baseline first. An interrupted activation is either intact v8 or resumable v9; never a partially
enabled receiver. Do not change Local formats. No physical IndexedDB upgrade is required for this layout:

```
heads / encrypted StoredRecord plaintext (canonical JSON):
["done/account-inbound/v1",1,baselineId,lineage,epochHead,readerCredential,
 publisherCredential,"received"|"conflict",position,previousLink,resultingLink,
 hex(exactSignedReadRequest),hex(exactSignedReadPage)]
```

The page retains the exact envelope/proof; do not reconstruct or re-sign them. Derive progress and observed
high-water marks from these original witnessed events. Extend the existing metadata witness over the
ordered union of spool, delivery and inbound events under v9, so deleting a final event is detectable.
Do not put a separately mutable receive cursor in a settings key. A conflict event does not advance it.
The first implementation retains all such evidence; pruning is not part of content compaction.

Require envelope wire at most **512 KiB**, at most 255 original updates and at most 512 KiB total decoded
update bytes. Check the canonical local event plus content byte count against the actual 4 MiB/256-record
batch limits before reserving any local seals. Each original update is one unchanged raw `update` content
record, followed by one inbound event. The 256-update network bound does not permit 257 local records;
this first receiver explicitly refuses such an envelope. Unsupported size leaves the cursor intact
and reports a bounded reason; never skip, truncate, split an authenticated envelope into accepted positions,
or request a new seal to work around a local limit. Current private publisher slices are much smaller.

The owned receive commit strictly writes **original content carriers + inbound event + witness update**
in one IndexedDB transaction after fresh local seal grants. Recheck the permit, factor/custody, promotion
fence, epoch/membership/generation, baseline and prior witness immediately before commit. A queued receive
does not retain authority across a close or membership change. No crypto await holds the native transaction.
The current `appendSpool` is a one-record API; a checked atomic batch extension is required, not two calls.

Only commit acknowledgement may promote the prepared remote update into the accepted editor/history
document. An abort leaves old progress/content; death after commit but before acknowledgement cold-replays
the new state. A late completion after close may be durable but cannot publish into a closed document.
The permit remains held until native work drains. Transport cancellation never deletes retained evidence.

## Pending dependencies, content coverage and local edits

Replay exact original updates into a private candidate, preserving pending structs **and deletions**.
A well-formed authenticated input can be durably received while it awaits another stream. Persist those
originals, advance only that stream's contiguous receive position, and expose pending/incomplete status.
Do not repeatedly download the same envelope merely because no visible text changed. No snapshot or
state vector may replace pending originals; the existing compactor already refuses an incomplete disk union.

Remote promotion must bypass local source capture. The envelope retains the original publisher, position,
actor and proof; it neither consumes a network seal invocation nor becomes a new capsule under the reader.
Local edits may depend only on state already committed by receive or durably journalled locally. The
admission queue must order incoming commit/promotion and local preparation, including an edit pending
while a fetch completes. A transport callback cannot mutate the accepted document directly. The current
raw `workspace.receive(bytes)` and capture carrier are not the required authenticated batch path.

Cold open validates the complete event witness and original proof chain before exposing progress. Replay
baseline plus content/journal, retaining pending framing. Check that replay covers each retained inbound
event's original updates; content and progress must not become independently credible after omission.
Content trim uses exact authenticated physical coverage and retains all inbound/outbound evidence. It
does not trim by network cursor, a sequence range, visible text, or a state vector alone. If a pending union
cannot be compacted safely, leave it intact. Whole-state rollback/clone detection remains an external
continuity assumption; a same-profile witness does not defeat coordinated rewind.

## Enrollment handoff and the next bounded build

A real fresh second device needs service admission, fresh signing/wrapping keys, client-authenticated
ceremony and certified recipient-set successor, exact lineage/root and recovery-recipient bindings,
generation wraps, a verified semantic baseline and its publisher heads, plus fresh mandatory-factor local
custody/store/counters and an authenticated restart/install record. Account sign-in alone does not deliver
content keys. The author's actual old second device adopts that baseline; its previous writing is not a
source for the new workspace. No device is provisioned by these preparation tests.

Build next: closed inbound record codec, first-epoch verifier, v9 activation and atomic content/event/witness
storage under the existing owner, followed by native abort/crash/restart/old-reader cases. Preserve a
one-device self-stream test with the actual admitted owner; fresh-reader and multi-publisher fixtures remain
synthetic until enrollment/authority integration exists. Wire editor promotion and v2 service transport only
after the batch/reader boundary passes. The executable model uses arrays of original update records and
an atomic assignment in place of the required native transaction.

## What this preparation can demonstrate

Tests use independently framed Node/OpenSSL envelopes and accepted proofs against existing production
primitives, proposed v2 page fixtures, actual pinned Yjs replay, and an explicit atomic-store model with an
external receipt/content oracle. Generated histories cover duplicate/gapped and cross-stream delivery,
abort, lost acknowledgement, close, restart and compaction. Deliberately broken arms test whether the
oracles detect cursor-before-content, lost pending data, a self-chosen prefix, conflated streams and
remote relabeling. Authority fixtures assume independently certified membership; they do not test issuance.

The model does not test IndexedDB durability, AEAD record storage, native exclusion, enrollment, network
freshness against a real service, or a complete receiver. Its restart checks use previously verified event
objects and a synthetic hash witness; runtime cold replay must reauthenticate original stored wire and
membership under custody. Its parser is a fixture consumer, not conformance for every malformed v2 frame.
No browser harness runs here, so no async
`waitForFunction` is credited. Any later native harness must use explicitly awaited bounded predicates;
the driver polling reproduction is the reference. No whole-protocol debt is paid by this checkpoint.
