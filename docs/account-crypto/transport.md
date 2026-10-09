# Private encrypted transport byte contract

2026-09-11; group C. These are the current private codecs, not a new protocol version. The executable
corpus is `test/vectors/account-transport.json`; existing `envelope.json` and `private-envelope.json`
remain unchanged. This home complements the ownership/state machines in account-outbound,
account-decisions, account-service-delivery, account-transport and account-inbound-verification.

## 1. Encodings and authority boundaries

`LP(a,b,...)` concatenates each UTF-8 string preceded by its unsigned 16-bit big-endian byte length.
`U32(n)` is four unsigned big-endian bytes; `||` is byte concatenation. `hex` is lowercase, even-length
ASCII hexadecimal without a prefix. `H` is SHA256, yielding 32 bytes; hashes inside LP or JSON are
64 hex characters. `J(array)` is UTF-8 `JSON.stringify(array)`, with exactly the order and types shown.
Integers in LP are canonical decimal strings; integers in JSON remain numbers, booleans remain
booleans. There is no sorting of arrays. A signature is Ed25519 over the stated message, without an
additional application hash. Raw signatures are 64 bytes, their JSON/LP encoding 128 hex characters.

Binary readers require exact end, printable ASCII LP fields, canonical positive decimal numbers and
the matching label/version. JSON wire parsers require fatal UTF-8 decoding, exact array lengths and
byte equality with compact re-encoding; BOM, whitespace, alternate escapes, exponents and literal
negative zero refuse. These are wire rules: ordinary input objects are projected into these arrays,
not uniformly closed-object parsers. The v1 read object encoder normalizes `after: -0` to zero;
the v2 object encoder rejects it. Neither accepts a wire spelling of `-0`.

The owner supplies authenticated workspace/lineage/head, current acceptance key and certified member
keys. A workspace signing credential is not an account passkey ID. Member signatures attribute
envelopes and requests; service signatures provide bounded acceptance/read/completeness evidence.
Neither a valid carrier nor a bare digest grants authority. The acceptance service cannot certify
content authors or recipients, release a factor, or make an incoming update durable merely by signing.
Client owners must check active membership, scope, held prefix, content semantics and lifecycle before
commit. A valid accepted history is not a fresh authority-discovery result.

## 2. Network key, encryption and signature

Let header fields be `v, workspace_id, credential_id, epoch, gen, seq`, where v is 1 or 2; IDs match
`[A-Za-z0-9_-]{1,128}` and epoch/gen/seq are positive safe integers. Let `F` be those six fields as
strings, in that order. The generic codec permits these IDs; private transport further requires its
16-byte hex workspace and credential IDs.

```
info1 = LP("done/envelope/v1", workspace_id)
info2 = LP("done/envelope/v2", workspace_id, credential_id, decimal gen)
K_net = HKDF-SHA256(K_g[32], empty salt, info[v], 32)
AAD = LP("done/env/v" + v, ...F)
ct = AES-256-GCM(K_net, nonce[12], body bytes from §3, AAD) || tag[16]
digest = H(ct)
message = LP("done/env-sig/v" + v, ...F, hex nonce, hex digest)
sig = Ed25519(member private key, message)
```

The tag is included once in ct and in its digest. The signature binds the digest, not a second encoding
of the body. New private sealing requires v2; v1 remains a reader/vector compatibility format. Epoch
and position are authenticated but are not v2 KDF inputs. The v2 key separates workspace, credential
and generation. Signature verification requires the caller-held version/workspace/credential/epoch/gen
route, recomputes the ciphertext digest and uses the caller-resolved member key. Position is handled
by the owner's acceptance chain. Opening additionally authenticates/decrypts and parses the body.

The codec grants no allocation or transmission authority. The existing NetSealCounter owner must
durably reserve every invocation, including abandoned attempts and refusal successors, before crypto
and refuse before the 2^32nd reservation. This remains conditional on unrewound, unbranched credential
history. Fixed nonce test vectors do not qualify invocation-grant power-loss accounting or profile clones.

## 3. Body, envelope and submission carriers

```
body = LP("done/env-body/v1", actor_id, actor_kind) || U32(update count)
       || for each update in order: U32(update byte length) || raw update
envelope = LP("done/envelope-wire/v" + v, ...F)
           || nonce[12] || digest[32] || U32(ct byte length) || ct || sig[64]
submission = LP("done/envelope-submission-wire/v1", "1", lineage)
             || U32(envelope byte length) || envelope
             || U32(parent proof byte length) || parent proof || wrapper signature[64]
submit body = J(["done/private-submit/v1", 1, workspace, hex submission])
```

actor_id has the generic ID grammar; actor_kind is `human`, `agent` or `system`. Updates are 1–256
nonempty byte strings, body total at most 4 MiB. The body codec treats updates as opaque; the inbound
owner separately validates Yjs and authorized actor tags. The envelope limit is 4 MiB + 2048 bytes,
with ct length 16 through 4 MiB + 16 inclusive. Readers return detached bytes for ordinary Uint8Array
inputs; callers must use that byte type, not assume Node Buffer has identical slicing semantics.

Submission lineage is hex[32]. It contains a v2 envelope and either zero bytes for no parent or the
canonical refused response from §4; an accepted response cannot be a parent. Its total limit is
envelope limit + 4096 + 512. Decoding round-trips the exact binary frame. The outer submit carrier
requires workspace hex[16] and nonempty submission bytes within that bound, but does not authenticate
or parse those nested bytes. Its total limit is twice submission limit + 256.

## 4. Refusals, acceptance links, heads and wrappers

Let a subject be workspace, credential, position, digest, epoch. Generic IDs use §2's grammar;
position/epoch are positive safe integers, digest is hex[32]. Parent and previous-link sentinels are
64 zero hex characters. Refusal reason matches `[a-z][a-z0-9-]{0,63}`.

```
refusal message = LP("done/position-refuse/v1", "1", workspace, credential,
                     decimal position, digest, decimal epoch, reason, parent)
refusal ID = hex H(refusal message)
link = hex H(LP("done/accept/v1", workspace, credential, decimal position,
                decimal envelope epoch, envelope digest, previous link))
head message = LP("done/accept-head/v1", workspace, credential, decimal position,
                  link, decimal signing epoch, "true" or "false")
wrapper message = LP("done/envelope-submission/v1", "1", lineage,
                     hex H(exact envelope wire), parent refusal ID or zero)
```

The service acceptance key signs refusal/head messages. The member key signs the wrapper message.
The refusal ID deliberately excludes its signature; replacing that signature leaves the ID unchanged
but does not exempt it from verification. Wrapper verification checks the held lineage, authenticated
envelope/member signature and wrapper signature. A successor parent must be a genuinely signed
refusal under the held acceptance key, at the same workspace/credential/position for a different digest;
the new envelope references the current tip and the parent cannot be from a future epoch. Durable
issuance/closure and permanent conflict checks belong to the service ledger, not this codec.

The two complete response wire arrays, at most 4096 bytes, are:

```
J(["done/position-response/v1", 1, "refused", workspace, credential, position,
   digest, epoch, reason, parent, refusal signature])
J(["done/position-response/v1", 1, "accepted", workspace, credential, position,
   link, signing epoch, final boolean, leaf epoch, leaf digest, head signature])
```

The response carrier adds no signature. For acceptance, the client verifies the head signature under
the current held key/tip, checks subject position and leaf epoch, then recomputes link from the returned
leaf and its own previous link. The leaf is bound indirectly by that reconstruction. A matching digest
is accepted, a different valid leaf is conflict, and invalid/unqualified evidence is unknown. A signed
future head or a head connected to a different previous link does not advance the prefix. Refusals
must match the exact expected subject and parent. A returned final bit is evidence, not execution of
the separate finalization machine. Response parsers alone do none of those authority checks.

## 5. Signed read requests and exact request hashes

The v1 self-readback and v2 reader/publisher requests sign these unsigned arrays:

```
J(["done/private-read/v1", 1, serviceId, origin, workspace, credential,
   lineage, head, epoch, after, limit, nonce, expires])
J(["done/private-read/v2", 2, serviceId, origin, workspace, reader, publisher,
   lineage, head, epoch, after, limit, nonce, expires])
```

Append the member signature as the final array element to produce the complete wire (14 or 15
elements). For v2 it is the reader's signature; the publisher is a separate field and key role.
serviceId/workspace/credential/reader/publisher are hex[16]; lineage/head/nonce are hex[32]. Origin
is at most 2048 characters and must equal `new URL(origin).origin`. Epoch and expires are positive
safe integers; after is a nonnegative safe integer and limit is 1–8. Total request limit is 4096 bytes.

The owner checks exact held service/origin/workspace/credential or reader/publisher/lineage/head/epoch
and the active certified signing key. A live request requires `now < expires <= now + 60000`, checked
across asynchronous boundaries. This expiry window permits replay within the window; the nonce is
not a promise of one-use service storage. The request hash is `hex H(complete signed request wire)`,
including its signature. It is not the hash of the unsigned message. The caller must keep those exact
request bytes. The lower-level hash helper itself accepts bytes without granting their authority.
Both parsers reject the other version's namespace. Transport v1 here does not imply envelope v1.

## 6. Signed pages and inbound qualification

For version v=1 or 2, the acceptance key signs:

```
J(["done/private-read-page/v" + v, v, request hash, through, next,
   [[hex envelope, hex position response], ...]])
```

Appending its hex signature gives the seven-element wire array. Request hash is hex[32]; through/next
are nonnegative safe integers. There are at most eight entries; each envelope and proof is nonempty
and respects §3/§4's byte limit. Total page limit is 10 MiB. Entry order, exact envelope bytes and
every nested proof/signature byte are covered by the page signature. Empty and full pages have
separate fixed cases. Extent requires entry count <= requested limit, next = after + entry count,
through >= next, and a nonempty page if next < through.

The v1 `verifyReadPage` checks canonical framing, extent, exact request hash and page signature. It
does not itself verify the request's member signature, membership or each entry's acceptance proof.
Those remain the surrounding service/client owners' obligations. The v2 `verifyInboundPage` also
checks held reader/publisher scope, expiry, reader signature, retained observed-through/prefix and
each accepted envelope. It checks the v2 route, member signature, reconstructed acceptance link,
decryption, authorized actor tag and Yjs update syntax before returning detached updates for admission.

The current inbound client is bounded to a promotion-genesis baseline, epoch/generation one, the
creating publisher and one entry per page; the wire permits eight. An empty page must fit the held
prefix. The synthetic two-key reader/publisher fixture exercises distinct roles in that verifier,
not an implemented enrollment or multi-member authority installer. Rechecking lifecycle/authority and
committing the encrypted record are subsequent owner operations. Fresh requests and retained proof
replay are distinct: reopening a previously qualified stored record need not make its old request
fresh again, but must revalidate the retained proof and current opening context.

## 7. Service event chain and completeness witness

```
chain[0] = 64 zero hex characters
chain[n] = hex H(LP("done/service-delivery-chain/v1", chain[n-1], decimal n,
                   hex H(exact submission bytes), hex H(exact response bytes)))
witness message = LP("done/service-delivery-witness/v1", workspace, credential,
                     lineage, head, request, decimal events, hash)
```

n is the contiguous positive event ordinal, including accepted and refused decisions. Hash is the
last chain value. Scope workspace/credential are hex[16]; lineage/head/request are hex[32], with request
the retained first-authority request digest, not §5's network read hash. The witness is the closed
ordered object `{events,hash,signature}`: positive safe event count and hex[32]/hex[64]. The acceptance
key signs only that witness message. A null witness is valid only for zero events and zero commitment.

Service census reconstructs exact ordered event bytes and checks count/hash/scope/signature against
the retained witness, in addition to its existing submission, issued-parent, closure and accepted-prefix
checks. The witness provides completeness evidence for that ledger under held service custody; it is
not an accepted head, refusal, member signature or authorization to decrypt. Omission/reordering or
replacement of rows disagrees with a retained witness. Coordinated rollback of the ledger and witness
to a formerly consistent state is not detected by this construction: unrewound, unbranched histories
remain required. Group D still owns custody, local capsule and counter-witness bridge qualification.

## 8. Executable coverage and retained limits

The independent Node/OpenSSL oracle specifies every ordered field, raw frame and intermediate byte
string for 37 constructions. It does not import production encoders. Tests compare actual codec,
signer, KDF, seal/open and verifier behavior; existing v1/v2 envelope positives remain executable.
The fixed v2 full page contains two valid Yjs updates which the inbound verifier opens and replays as
`AB`. Generated histories independently reconstruct accepted prefixes and nested signed pages.

Each encoded leaf has a changed-input vector and an omission control which collapses the changed and
original message to the same bytes. These are encoding/primitive controls, not claims that every source
guard was mutated. Separate controls omit envelope hash, parent ID, head final, v1/v2 page through and
witness request at the actual verification-message boundary; the baseline rejects and a verifier fed
the omitted bytes accepts the corresponding independently signed bad claim. Cryptographic verification
still runs; no boolean success stub is used. Internal service chain/witness seams are exported only
in a disposable in-memory source copy, without changing bodies; service regressions separately drive
the durable call paths. All truncated carrier prefixes and appended bytes, size/version/canonicality,
wrong-purpose/key namespace, nested signature and context mutations are exercised.

These checks establish bounded byte agreement and tested guard behavior, not full protocol correctness,
all parser/admission negatives, first real Account activation, onboarding, second-device adoption,
power-loss accounting, restoration safety, general lineage transitions or service deployment. Remaining
group D/Local registry records stay open. F-05/F-06 cannot close from group C alone.
