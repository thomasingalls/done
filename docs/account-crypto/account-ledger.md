# Account capsule and ledger byte contracts

D3 pins the private runtime at `1897848`. This is the plaintext layout inside existing encrypted
carriers, not a new wire protocol or authority grant. Runtime bytes, versions and acceptance predicates
are unchanged. Only `remaining-local-account-ledger` is closed here; counter-v2 key/MAC framing and the
inherited Local custody/store/journal qualification remain the following bridge.

## 1. Representation, route and authority boundary

Every carrier below is compact UTF-8 `JSON.stringify` of an array, without whitespace or a byte-order
mark. Binary fields are lowercase even-length hex strings. Decoders require the exact array arity,
known tag/version and byte-for-byte canonical JSON: whitespace, alternate number/escape spellings,
trailing fields, truncation and invalid UTF-8 refuse. Source/spool/delivery decoders reconstruct and
compare the encoding; inbound uses the canonical-array parser before validating its values.
Typed encoder input objects are not themselves closed JSON wire objects: unspecified object properties
are not serialized. Shape guarantees apply to the encoded arrays and specified checks.

Route tuple `R` means `[workspace, credential, principal, epoch, generation]`. The IDs are lowercase
hex16; epoch is a positive safe integer and this private generation is 1. Source/spool encoders validate
these fields. Delivery takes a held route/authority and compares their workspace; its decoder requires
all five supplied route fields plus lineage/head to match. It does not independently establish that
the supplied route is current. Account passkey IDs, workspace signing credentials, principal IDs,
network positions and physical Local sequences are different namespaces.

`StoredRecord` v1 authenticates type/generation/sequence/scope under the existing store key. The journal
authenticates synchronous source capture under its existing key. Their selected formats and invocation
budgets remain [row 3](../selections/row-3-record-format.md) and the inherited Local contracts. A JSON tag,
valid payload or public hash supplies no authentication by itself. Caller-held authority must already be
established through factor custody, admission, current route and membership checks.

The maximum stored payload is `MAX_BATCH_BYTES = 4 * 1024 * 1024`. Low-level record inspectors consume
already opened records: the content owner checks physical sequence uniqueness and reservation bounds.
Inspectors sort ledger events by these authenticated Local sequences; they do not manufacture authority
for arbitrary caller-supplied `OpenedRecord` objects.

## 2. Source capture and source identity digest

```
["done/source-capture/v1", 1, id, workspace, credential, principal, epoch, generation,
 [[actor, kind, hexOriginalYjsUpdate], ...]]
```

There are exactly nine outer items, 1–64 source tuples of arity three, and a fresh hex16 capsule ID.
A human source must use the route principal; a system source must use actor `system` and kind `system`.
Each original is a nonempty Uint8Array on encode, canonical lowercase hex on decode, and must pass
Yjs update decoding. Pending but well-formed dependency-bearing frames remain valid; this parser does
not establish visible content or dependency completeness. Originals are kept separately and in order.

Total original bytes may not exceed 1 MiB; the encoded capsule may not exceed 2 MiB. Both bounds are
checked. These capsules reside in encrypted `outbound` rows, or in the encrypted synchronous journal
before flush. They are not network envelopes and are not spool witness events.

`captureCatalog` deduplicates only exact ID plus identical canonical bytes. Reusing an ID with different
bytes refuses; two IDs carrying equivalent or identical updates remain separate sources. `capturedRecovery`
applies the same rule across retained database and journal capsules, returning detached original updates
only for journal identities absent from the catalog. It is not state-vector or snapshot deduplication.

A position source reference commits the **whole canonical capsule**, including its ID, route, all source
actors and all original updates:

```
source.hash = lowercaseHex(SHA256(canonicalSourceCapsuleBytes))
```

There is no added prefix, LP, omission of unselected sources or separate serialization in this hash.
Source identity/digest are checked against retained bytes before a network envelope can be exposed.

## 3. Spool entries and serial transition grammar

```
["done/account-spool/v1", 1, ...R, type, position, detail]
```

Exactly ten array items. Position is a positive safe integer. Detail and placement are:

| type | detail | Physical kind |
| --- | --- | --- |
| `position` | `[capsuleId:hex16, sourceIndex:integer 0..63, hash:hex32]` | `heads` |
| `attempt` | global positive safe invocation count, strictly below 2^32 | `heads` |
| `envelope` | `[attemptCount, hexCanonicalV2EnvelopeWire]` | `outbound` |

Each encoded entry fits 4 MiB. The envelope's decoded route, generation, epoch and network sequence must
match the supplied route and position; decode also limits its hex-decoded bytes to 2 MiB. Member signature,
AEAD opening and original-source correspondence are later checks, not implied by this codec. Actual
network wire/body bytes remain [group C](./transport.md).

Replay requires positions 1,2,... with no next position while the previous lacks a persisted envelope.
The referenced capsule must exist earlier in physical Local sequence order, contain that source index,
and not have allocated the same capsule/index already. Attempt grants belong to the latest unresolved
position and advance one **global** count by one. An envelope requires the latest committed attempt;
after it exists, no further transition at that position is permitted. Attempt gaps do not represent
valid burn records; retries append the next count. Local reservation gaps are a different mechanism.

`verifySpool` recomputes each whole-capsule hash, opens/verifies each persisted network envelope using
the held generation and member keys, and requires exactly one update with identical original bytes,
actor and kind. A newly and correctly encrypted/signed different original must refuse. The owner must
commit a fresh invocation grant before each new network encryption and persist the envelope before
exposure; the native spool regressions exercise those boundaries. Syntax or a reconstructed count alone
does not license encryption or prevent rollback.

## 4. Delivery entries and acceptance reconstruction

```
["done/account-delivery/v1", 1, ...R, lineage, head, type, position, hexWire]
```

Exactly twelve items. `type` is submission or response, stored in `outbound` or `heads` respectively;
position is a positive safe integer. The encoded record fits 4 MiB. Submission bytes use group C's
submission decoder; response bytes use its bounded position-response decoder (`RESPONSE_LIMIT`).
Decode bounds submissions to 2 MiB. The codec does not prove its outer position equals the enclosed
subject, that a response is authentic, or that publication is eligible.

The census separates source/spool entries, enforces kind placement, and orders delivery entries by
Local sequence. A delivery entry must follow its persisted envelope. Submission is allowed only while
ready, at acceptedThrough+1, and once per position; signature verification must bind the exact retained
first-attempt envelope with no refusal parent. Responses are verified against the held authority and
recomputed envelope prefix/link. Unknown evidence and identical duplicate responses refuse. Accepted
heads advance the proven prefix; incompatible refusals/finality produce conflict. No allocation may
follow a delivery halt. A response can arrive without a saved submission, as through the read path;
these bytes are not an acknowledgement setter.

The serialized carriers contain already signed inner wire bytes unchanged. Those signatures confer
only their original authority. Service acceptance evidence does not supply membership, factor possession
or received plaintext coverage.

## 5. Inbound records and the held baseline identity

```
["done/account-inbound/v1", 1, baseline, lineage, head, reader, publisher, kind,
 position, previous, link, hexSignedRequest, hexSignedPage]
```

Exactly thirteen items, stored as encrypted `heads`. Baseline/lineage/head/previous/link are hex32;
reader/publisher are hex16; kind is received or conflict; position is a positive safe integer.
The record fits 4 MiB. Request/page framing and limits inherit group C v2. The request limit and page
entry count must both be one; envelope wire is at most 512 KiB. Route, read extent, publisher, position,
accepted proof shape, accepted link and envelope digest/epoch correspondence are checked by the codec.
Those checks do not verify signatures, the independently held baseline/previous link or conflict truth.
The owner also caps decoded updates at 255 originals / 512 KiB and enforces the whole native batch limit.

`heldInboundContext` names its already verified receipt using:

```
baseline.id = lowercaseHex(SHA256(UTF8(JSON.stringify(parseReceipt(receipt)))))
```

This is the entire reconstructed receipt object, including its signature and all nested signed fields.
It is not the receipt signing message or a service identifier. The ordered first-authority schema supplies
the nested property order; input object reordering is immaterial. The helper's additional first-epoch,
creating-credential and public-key correspondence checks do not replace prior receipt verification.
A supplied receipt hash is not independent baseline authority. The fixed fixture also checks this
unlabelled digest rather than relying only on `done/` source-label discovery.

Cold `verifyStoredInbound` rechecks original request/page signatures and exact scope, envelope/member
proofs, actor, link, prefix and recorded outcome; expiry alone is ignored for retained evidence.
The ledger starts from the admitted zero-link baseline and reconstructs prefix and retained entries.
Different authenticated accepted digests at a retained position create conflict; further events refuse.
Every received original must be present on disk or leave a detached replay fork unchanged, including
content/deletion/pending state. A vector-only comparison is insufficient. Conflict does not admit its
body as content. Received updates never become locally captured source capsules.

## 6. Shared completeness chain and counter dependency

The ledger witness starts at `{events:0, hash:hex32Zero}`. Each spool, delivery or inbound event,
in authenticated physical Local sequence order, extends it with these exact bytes:

```
D = UTF8("done/account-spool-chain/v1\0")  // includes one trailing zero byte
M = D || rawPreviousHash[32] || u32be(eventByteLength) || exactCanonicalEventBytes
next = {events: before.events + 1, hash: lowercaseHex(SHA256(M))}
```

The length is four-byte unsigned big endian. Previous hash is decoded bytes, not its hex text; neither
field is LP-framed. The label remains v1 across v7/v8/v9 owners. Event count is **not hashed into M**;
it is advanced and checked separately. `extendSpoolWitness` expects an already validated prior witness;
its low-level hex helper is not a replacement for the closed counter parser. Increment past the safe
integer range refuses.

Source capsules and ordinary content update/state rows are excluded. V8 adds submission/response to
spool events; v9 adds inbound evidence to that union. Delivery transition replay still sees its own
ordered sub-ledger. This choice is executable: source integrity is tied by source references, while
receive-content coverage is a separate predicate.

`verifySpoolWitness` checks both event count and recomputed `{events,hash}` equality against the
**authenticated retained counter**. Removing only the early count check leaves the final pair comparison
operative. Removing both count comparisons loses that protection. An interrupted activation may have a
v1 counter only when there are no ledger events; it does not authorize resetting a v2 witness.

`createContentOwner` reserves physical sequences/invocations first, preserving the witness. The final
strict transaction compares the exact previous authenticated metadata and atomically writes the event
and newly MACed witness. An inbound commit writes its original content updates plus one evidence event
and one witness advancement together; conflict writes only evidence. The source owner cannot merely
supply an arbitrary successful witness: semantic callbacks, current-state checks, cold re-verification
and exact readback remain required. Aborted final commits burn reservations without publishing a witness.

D3 qualifies this dependency and the ledger bytes, **not** all content-counter-v2 key/MAC layouts or
Local allocator correctness. The next bridge must pin counterPayload, metadata derivation and inherited
record/journal AAD and invocation ownership to their exact contracts. Matching old authenticated counter
and ledger sets can be replayed together after rollback; this chain does not establish external freshness,
clone safety or unrewound storage.

## 7. Evidence, controls and remaining scope

`pnpm account:ledger-contract` runs the bounded campaign. The 20 fixed vectors reconstruct ten carrier
variants, eight chain extensions, source identity digest and receipt baseline digest without importing
production encoders. They reuse independent transport/first-authority primitives and fixtures. The chain
vector sequence is a byte construction example; semantic histories are independently exercised by the
ledger tests rather than inferred from that sequence alone.

Actual encoders, decoders, inspectors and verifiers execute through an in-memory bundle, sharing one
Yjs library instance across control bundles. Field and framing matrices include malformed UTF-8, BOM,
noncanonical JSON, source bounds, nested wire checks and truncated prefixes. Generated durable spool
histories model contiguous position allocation, repeated burned attempts, unfinished positions, cold
reconstruction and missing events against a retained witness. Matching-prefix replay is also expected
to succeed, explicitly preserving the rollback limitation.

Effective controls remove source identity/digest checks, exact decrypted-original correspondence,
delivery order, received-content coverage, both witness count comparisons or witness hash comparison.
A separate control removes previous-hash bytes from the actual native digest input. No signature,
AEAD or digest success boolean is forced true. Existing native capture/spool/delivery/receive regressions
exercise actual strict commits, journal/compaction preservation, missing tails, valid local re-encryption
and a valid counter MAC around false service evidence, and effective source mutants.

This is one creating stream with held first-epoch authority. It does not finish current membership
advancement, successor baselines, general ledger compaction, backlog scaling, restore/clone support,
additional-device issuance, finalization/recovery or independent review. Migration-only Local provenance
needs its explicit later disposition. F-05/F-06 and the remaining D/Local records stay open.
