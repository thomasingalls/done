# Private Account position allocation and persisted envelopes

Current capsule, ledger and witness bytes are pinned in the
[Account ledger contract](./account-crypto/account-ledger.md); this phase narrative retains its original scope.


Implementation contract for the private v7 owner. Relay submission, acceptance and refusal/successor
handling remain separate phases. This owner retains every source and every envelope.

## Lifecycle and activation

The spool extends the existing exclusive source-capture lifecycle. It requires verified v6 capture (or its
own v7 restart), authenticates the same factor, passkey, Account pin, prepared credentials, genesis and slot,
and installs authenticated promotion **v7, `account-spooling`** before admission or allocation. V6-only
readers and the ordinary source-capture factory refuse v7. V4 first needs capture activation; v5 still
needs a separately verified catch-up checkpoint. No actual personal Account exists today.

The owner opens the prepared certified Account signing key and generation key under the same permit.
Every native crypto call checks the current task; close cancels continuations, drains already-started
native work, erases raw key/source copies and revokes handles before releasing the permit.

## Append-only ledger on the existing encrypted carriers

Physical IndexedDB stores and outer StoredRecord v1 encryption stay unchanged. The private spool uses
a v2 authenticated content counter; ordinary content owners refuse it. Source capsules retain their
v1 format in `outbound`. The new semantic layout uses encrypted `heads` records for position/invocation
grants and tagged encrypted `outbound` records for persisted network envelopes. No accepted head is implied
by using the physical `heads` store. V7 is the reader fence for this union.

Each ledger entry is canonical UTF-8 JSON with no whitespace:

```
["done/account-spool/v1",1,workspace,signingCredential,principal,epoch,generation,
 type,position,detail]
```

- `position`: detail is `[capsuleId,sourceIndex,hexSHA256(canonicalCapsuleBytes)]`, stored in `heads`.
- `attempt`: detail is the next global invocation count, stored in `heads`.
- `envelope`: detail is `[invocationCount,hexCanonicalV2EnvelopeWire]`, stored in `outbound`.

The verified route has generation 1 and the certified current epoch. IDs and integers follow source
capture's closed rules; position and invocation are positive safe integers, sourceIndex is 0–63. Unknown
tags, noncanonical framing, wrong record placement, route mismatch and inconsistent transitions refuse.
A ledger entry must fit the existing 4 MiB content-batch cap. This first serial policy seals one original
source transaction per envelope, hence every body is homogeneous in actor, credential, epoch and generation.
A mixed-actor capsule has a distinct retained reference for each source index. Nothing removes the capsule.

A position entry is **both** allocation-counter advancement and its staged row in one completed IndexedDB transaction.
The network counter is derived from the append-only contiguous grant ledger, starting at 1. The same
transaction advances an authenticated ledger witness in content metadata; neither may survive alone. Original sources must already be on disk, must precede the
grant and must match its capsule hash/index. No source index may be allocated twice. Local record sequences
remain independent: a gap in the local sequence allocator is not a network position.

An attempt entry likewise advances the single invocation counter for this workspace/credential/generation
key domain. Counts must be contiguous, starting at 1, and remain strictly below 2^32. It belongs to the
latest unresolved position. The owner must commit a **new** attempt before every AES invocation.
Only that live acknowledged continuation may seal once. Cancellation, crypto failure or a crash abandons
permission but retains its count. Restart at an unresolved position consumes another attempt. The outer
StoredRecord encryption consumes its existing, separate local-store budget too.

Persist the exact resulting v2 wire in one encrypted envelope entry tied to that attempt and position.
Before allocating another position, finish the earliest unresolved position. A persisted envelope is
immutable; readback verifies its route, digest, prepared-key signature, actor and exact original source
bytes. Only persisted, verified bytes may be returned for later submission. A lost commit answer must
reread storage; it never grants remint permission for an already-persisted envelope.

## Authenticated completeness witness

An append-only grammar alone cannot distinguish an unfinished position from a previously exposed envelope
whose final record disappeared. A native counterexample reproduced that defect: delete the final envelope,
reopen, and the initial owner returns different wire bytes for the same position. Contiguous grant counters
and individually authenticated records did not prevent it.

Content counter v2 adds exactly `spool: {events, hash}`. The closed parser requires a nonnegative safe event
count and 64 lowercase hex digits. Its MAC payload uses `done/content-counter/v2`, the existing scoped
counter fields, and a final `[events,hash]` pair. V1 parsing and MAC bytes remain unchanged. Only the private
spool composition and its authenticated cold reader opt into v2.

The initial witness is zero events and 32 zero bytes. Each canonical ledger entry advances it:

```
SHA256(UTF8("done/account-spool-chain/v1\0") || previousHash32 || u32be(entryByteLength) || entryBytes)
```

The entry and signed next witness commit in the same content transaction, comparing the exact
previous authenticated metadata. Outer sequence/invocation reservations occur first and preserve the
witness; an aborted final transaction burns only that outer reservation. Ordinary source flush and
content compaction also preserve the witness. Every census checks the ledger event count and recomputed
hash before granting allocation, exposing wire, replaying startup or authorizing compaction. Deleting the
last envelope or all ledger rows while retaining metadata refuses without writes or network encryption.

Activation commits promotion v7 first, then initializes counter v2 before admission. Interrupted v7 with a
v1 counter may resume only with no ledger entries. A v2 counter is never reset. Native before/after tests
cover both activation writes. A control removing the actual witness verifier reproduces the original remint.

## Recovery, maintenance and authority limits

Replay the ledger in authenticated local-record order. Require contiguous positions and attempts, exact
source references, and legal position → attempt(s) → envelope transitions. Verify hashes and every persisted
network envelope against its original source and the certified signing public key before exposing it.
Source recovery ignores the ledger for Yjs replay but validates it; original content/journal behavior
remains intact. Compaction retains all source and spool rows and audits the semantic union on each census.

Allocation flushes observed source capsules first. New edits may continue into the synchronous journal
while async allocation runs; the next allocation flushes them. A failed or unknown operation retains its
journal, sources, grants and any committed envelope. This API supplies no acceptance, closed, deletion,
remint, send or successor setter. All retained envelopes have unknown delivery outcome.

Append-only history deliberately trades space for a small native atomicity surface. Full scans, ledger
compaction and large-backlog performance remain open. As elsewhere, this evidence assumes one unrewound,
unbranched local history for the credential; restoring an older authenticated counter together with its matching ledger is not solved by local
MACs or contiguous counters. The witness detects missing ledger rows against retained current metadata,
not coordinated restoration of both. Restore/clone must use fresh credentials or a separately established counter.

## Validation boundary

Use actual IndexedDB, Web Locks and WebCrypto in disposable browser profiles. Test activation, position
commit, invocation commit, encryption and envelope commit before/after acknowledgements, renderer death,
exact restart retry, unknown outcome, cancellation/drain, mixed actors, missing/changed sources, changed
spool bytes, bounds and old readers. Record external invocation observations so the test does not infer
crypto use from the implementation's own counter. Add generated crash histories and actual guard controls.
Keep the author's Local release and stopped personal servers intact. No default Account UI or relay cutover.

## Read-only decision inspection

The following [response/proof phase](./account-decisions.md) adds `inspectResponse(position, bytes)` to
this owner. It derives the subject, predecessor chain and current acceptance key from authenticated
retained state and returns evidence without writing accepted/closed records or changing the v7 format.
Sources and exact envelopes remain retained for every result, including contradictory signed answers.

The following [v8 delivery owner](./account-delivery.md) adds durable proofs and signed submissions to the
same completeness witness. V7 remains a separate reader and refuses that activated format.

D4 recorded that the earlier implementation used relaxed content transactions. The subsequent
[F-15 persistence repair](./account-reservation-durability.md) requires requested/reported strict completion
for both content reservations and final attempt-event/witness commits before network AES. Unsupported
capability refuses. Renderer recovery and API reporting still do not measure physical power-loss survival;
accurate initial budgets and an unrewound, unbranched history remain assumptions.
