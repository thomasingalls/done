# Private Account response evidence and submission proofs

This bounded phase authenticates evidence and defines concrete transport bytes. It does not persist
accepted/closed state, license an in-memory result to mutate a spool, mint successors, submit requests,
issue service decisions or advance the authorization lineage. The existing v7 source/envelope ledger is
unchanged. No personal Account or server has been provisioned or started.

## Authority and owned inspection

`openOwnedAccountSpoolWorkspace().inspectResponse(position, bytes)` reads a persisted envelope under the
same exclusive Account lifetime. It authenticates the complete content census and ledger witness, derives
the subject from saved v2 wire, and reconstructs every prior link from the retained envelopes back to the
fresh credential's zero baseline. The caller supplies no digest, predecessor link, lineage or key. Inspection
performs no writes, no network encryption and no admission flush. Missing/unminted positions are unknown.

The owner obtains workspace, lineage ID, current epoch/head and `K_accept` from the retained admission
receipt already authenticated by `verifyAccountUnderPermit`, including the pinned authorization root and
creating proofs. Today's private lineage contains only its first epoch. It cannot accept a replacement
key or advance its tip based on a response. General epoch advancement and authenticated checkpoint baselines
remain separate work. Lower-level codec/verifier functions require an independently authenticated context;
passing an arbitrary context to them cannot establish its authority.

Inputs are captured before async crypto. Every composed crypto invocation checks its lifecycle task;
closing cancels continuations and drains started work before releasing exclusion. Even though malformed or
unverifiable responses produce `unknown`, a cancelled owner withholds the result. Evidence values are detached
read-only descriptions, not capabilities that future persistence may trust without rechecking authority.

## Canonical response carrier

The existing selected refusal/link/head **signed messages stay byte-for-byte unchanged**. LP means u16be
byte length plus printable ASCII. New private wire is canonical UTF-8 JSON with the exact array shapes below,
no whitespace or alternative numeric/string encodings, and a 4096-byte bound:

```
["done/position-response/v1",1,"refused",workspace,credential,position,
 refusedDigest,envelopeEpoch,reason,parentRefusal,signature]

["done/position-response/v1",1,"accepted",workspace,credential,position,
 link,signingEpoch,final,envelopeEpoch,digest,signature]
```

IDs are 1–128 ASCII letters/digits/underscore/hyphen. Positions and epochs are positive safe integers;
digests, links and parent IDs are 32 bytes as lowercase hex; signatures are 64 bytes as lowercase hex.
`final` is a boolean. `reason` is 1–64 lowercase letters/digits/hyphens, starting with a letter, and is
informational: it never weakens the permanent-closure meaning. Unknown versions/tags, extra fields,
invalid UTF-8, noncanonical JSON and malformed lengths refuse. No response contains a verification key.

A refusal signs:

```
LP("done/position-refuse/v1","1",workspace,credential,dec(position),
   refusedDigest,dec(envelopeEpoch),reason,parentRefusal)
```

All five subject fields must match the retained envelope: workspace, credential, position, ciphertext
digest and **its own referenced epoch**. The refusal's parent must also match the attempt (zero for every
v7 first attempt). Verify under the currently held certified acceptance key; never choose a key from the
refusal's epoch. That epoch may be older than the verifier's current tip. `refusalId = SHA256(message)`
excludes the signature, so the same permanent closure can be re-signed after key rotation without changing
its ID. Retired/forked-key signatures, unrelated subjects and mismatched parents are unknown.

A signature authenticates the service's permanent-closure **claim**. Its durable decision store must still
ensure the named digest was never accepted and can never be accepted afterward. This verifier cannot prove
that behavior and supplies no deletion or remint authority on its own.

Acceptance uses the selected link and head:

```
link = SHA256(LP("done/accept/v1",workspace,credential,dec(position),
                dec(envelopeEpoch),digest,previousLink))
Head = LP("done/accept-head/v1",workspace,credential,dec(position),link,
          dec(signingEpoch),"true"|"false")
```

The response's leaf epoch/digest are authenticated by recomputing that link from the **locally held prior
link**, checking equality to the signed head, and verifying its signature under current `K_accept`.
Signing epoch must equal the held tip. A matching leaf yields `accepted`; a proved different digest/epoch
at the same position yields `conflict`, never remint permission. A foreign/unprovable prefix yields
`unknown`, even with a valid signature. A head's claimed link never substitutes for local reconstruction.

This first proof is restricted to a head at the queried position. Later heads, batched suffix proofs,
empty-credential finalization, finalization transitions and externally adopted checkpoint baselines are
not implemented. The `final` bit is signature-bound and returned as evidence, without changing editability.

## Signed submission wrapper and parent proof

V2 envelopes have no parent-refusal field. Keep their bytes unchanged and add a separate device-signed
wrapper. Its unsigned payload consists of lineage ID, the complete exact envelope bytes, and either no
parent or one canonical refusal proof. Its signature message is:

```
LP("done/envelope-submission/v1","1",lineageId,
   hex(SHA256(exactEnvelopeWire)),parentRefusalId)
```

The first attempt has zero parent ID. A successor uses SHA256 of the parent refusal **message**, not its
signature. Including the entire envelope-wire hash binds nonce, digest, ciphertext, routing and its device
signature, and including parent ID prevents replacing one valid refusal proof with another. Re-signing
the same parent message under the live acceptance key keeps the submission signature valid.

```
wire = LP("done/envelope-submission-wire/v1","1",lineageId)
       || u32be(envelopeLength) || exactV2EnvelopeWire
       || u32be(proofLength) || refusalResponseWire
       || deviceSignature[64]
```

Lineage ID is 32 bytes as lowercase hex. Zero proof length means no parent. Envelope length uses the
existing v2 codec bound; proof length is at most 4096; the total bound is envelope limit + 4096 + 512.
Truncation, trailing bytes, unknown versions, non-v2 envelopes and an acceptance response used as a parent
refuse. Parsers copy inputs; signing captures them before any crypto await.

Verification checks the independently resolved envelope route and certified device key, envelope digest
and signature, exact lineage, and the wrapper signature. A parent must verify under current `K_accept`,
name the same workspace/credential/position, close a different digest, and not name a future epoch. A
successor references the current epoch. Repeated refusal chains are representable; there is no fixed
attempt-number cap. This codec verifies only the immediate authenticated parent. The future service must
resolve that refusal ID in its own durable issued ledger and enforce permanent closure, position binding,
membership, generation policy and at most one accepted digest. A valid wrapper alone proves none of those.

`signSubmission` is a low-level primitive, like the envelope codec. It receives a signer only from internal
composition/test code; the Account owner currently exposes no signing or dispatch method for it. The next
phase must persist exact signed submission bytes before dispatch and retain them through unknown outcomes.
A re-signed parent proof may be verified without invalidating the wrapper signature, but it does not license
the owner to rewrite an already-persisted submission during an unknown outcome.

## Evidence and next boundary

The campaign uses existing selected vectors and an independent Node/OpenSSL framing/signature oracle,
generated signed chain and successor cases, and disposable Chromium with actual authenticated Account
custody, IndexedDB and Web Locks. Synthetic service acceptance keys are opened by a test-only oracle using
the disposable fixture factor; production acceptance custody still has no content-signing API. Actual
mutations remove signature, epoch, chain-link, parent-binding and successor-position checks and demonstrate
bad acceptance. Native readback confirms sources, envelopes and counters remain unchanged by every answer.

Next is lifecycle-owned persistence of verified decision evidence and exact signed submission bytes behind
an authenticated reader fence and ledger witness. Record conflicting evidence without discarding sources;
recheck authority at commit. Permanent service decisions, successors under changed epochs/generations and
relay dispatch require their own bounded work. No whole-protocol debt or multi-device correctness is claimed.
