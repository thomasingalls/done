# Private first-authority byte contract

2026-09-11; runtime baseline `2ba50aa`, prep committed as `9cf5c98`. Phase A specifies these private
formats and their bounded vector/map evidence. Broader Account construction groups remain open.
The ordered schema is [first-authority.json](./first-authority.json); the prep probe reconstructs its bytes
independently of the production parsers. Changing a field order or signed body requires a compatibility
decision, not an automatic snapshot update.

## 1. Primitive encodings and nested object order

`LP(s)` is a two-byte **unsigned big-endian byte length**, followed by printable ASCII bytes of `s`
(U+0020–U+007E); maximum 65,535 bytes per field. Hex means lowercase ASCII, two characters per byte.
Digests and Ed25519 public keys are
32 bytes; signatures 64; workspace/principal/device signing IDs 16; service account/attempt IDs are
canonical unpadded base64url of 32 bytes. The actual WebAuthn credential ID is a separate base64url
namespace (1–1,023 bytes). Fixed protocol integers use decimal ASCII inside LP and JSON numbers inside
objects. They are not interchangeable encodings.

`J_T(x)` means: enforce the protocol's value predicates and closed fields, reconstruct **all nested objects** in the
field order in first-authority.json, retain array order, then UTF-8 encode compact JSON with no whitespace
or BOM. Strings use JSON escaping; no Unicode normalization or locale collation is applied. Input property
order is immaterial; output order is fixed. Current protocol string fields are constrained by their parsers
(hex/base64url IDs, exact origin/RP, fixed ASCII tags). This is **not** the service's recursively sorted-key
`canonical()` representation, which is used for proof hashes and equality checks elsewhere. The schema
file pins field order and nesting; it is not a standalone validator for all value and cross-object predicates.

For the six messages in the schema's `messages` array:

```
body = reconstructed object T, omitting only the named top-level signature field (if any)
message = LP(label) || LP(hex SHA-256(UTF8(compact JSON(body))))
proof = Ed25519(resolved signing key, message)
```

Inner signatures are retained. A receipt body includes its offer signature, both completion signatures
and epochSignature. The request origin body includes the candidate and certification signatures. The
activation-challenge signature hashes the **context**, not the challenge carrier. Do not recursively
strip properties called `signature`.

## 2. Concrete objects and dependency order

The schema file lists every field recursively; these top-level summaries are for orientation:

| Object | Exact order |
| --- | --- |
| Pin | v, serviceId, origin, rpId, authRoot |
| FirstEpoch | v, kind, pin, requestDigest, accountId, principalId, workspaceId, lineageId, epoch, parent, generation, certification, owner, capabilities, acceptancePublicKey, heads |
| Offer | v, kind, epoch, head, signature |
| Completion | manifest, admission |
| Receipt v2 | v, kind, offer, completion, epochSignature, activation, signature |
| Activation context | v, pin, accountId, requestDigest, offerHead, completionDigest, credentialId, nonce, expiresAt |
| Activation authorization | context, proofHash |

The private FirstEpoch requires `v=1`, `kind="first-authorization-epoch"`, `epoch=1`, `generation=1`,
`parent=00…00` (32 bytes), exactly one certified member, owner equal to that member's **signing** ID,
capabilities exactly `["read","write","admit","manage"]`, and `heads=[]`. The candidate uses version 1;
manifest and SemanticAdmission use version 2; receipt version 2 is independent of the cipher version.
Offer `head = SHA256(epochMessage)`. This differs from SHA256(J_epoch) by an entire LP/domain layer.

The order breaks the apparent cycle:

1. Factor-opened recovery state, prepared keys, local coverage and encrypted checkpoint create the
   candidate. The device signs the candidate and certification; the bootstrap signer endorses the request.
2. `requestDigest = SHA256(J_request(full signed request))`. The root constructs an epoch containing that
   digest and the acceptance public key. Its message hash becomes the offer head; the root signs the offer.
3. The device derives and signs manifest/admission for that offered head. The service fixes
   `completionDigest = SHA256(J_completion(full signed completion))` in the activation context.
4. The root signs the context challenge. WebAuthn challenge bytes are
   `SHA256(LP("done/promotion-activation/v1") || LP(hex SHA256(J_activationContext)))`, base64url encoded.
5. The service verifies the account assertion, consumes it and commits the epoch signature and receipt.
   `proofHash = SHA256(UTF8(sorted-key canonical JSON(entire assertion response)))`.

An offer signature is a proposal endorsement, not the committed epochSignature. The independent root
pin resolves serialization authority. It does not replace factor-origin endorsement, eligible-client
certification, actual registration binding or independent plaintext coverage rederivation. K_accept is
resolved from the verified epoch and authorizes acceptance/readback; it cannot issue an epoch.

## 3. Selected genesis head-vector ruling

**Select the empty vector for this first-epoch genesis only.** No Account envelope position has been
accepted; imported/pre-existing Local writing is represented by the checkpoint, not retroactively assigned
network positions. The sole member is present in certification; absence from `heads` does not erase it.

Thus candidate coverage heads, FirstEpoch heads and the manifest/admission baseline all use `[]` and
`SHA256(LP("done/headvec/v1"))`. Position one's predecessor is still row 5's 32-zero-byte `link_0`.
An explicit `(member, 0, zero link)` vector encodes a different digest and is **not** an accepted alternate
serialization. The prep probe computes both digests and demonstrates the distinction.

Rows 5/7 and the TRD state this initial exception alongside the general per-credential rule. Do not infer a general sparse-vector
rule for successor epochs, retired members, nonempty accepted history or pruning. Those machines remain
separate work; dropping an existing stream is not permitted by this genesis ruling.

## 4. Compatibility and phase-A falsifiers

Preserve current private bytes. Reject receipt v1, unknown/mixed completion versions, reordered **arrays**,
extra fields, wrong scope, wrong key namespace and a substituted head-vector baseline. Parser-accepted
JSON property reordering must reconstruct identical bytes. Never silently relabel old signatures or
rewrite historical fixtures as if they exercised v2. No real Account receipt exists.

The phase-A corpus publishes fixed inputs and intermediate JSON/LP/hash/signature bytes, reproduced by
runtime code and an independent implementation. Its required falsifiers include each field, nested field and nested
signature; signature swapping among message purposes; genuinely signed wrong-operation values; empty
versus zero-position vector; and old/current readers. A positive signature round trip alone is inadequate.
An omitted bound field must cause a corresponding negative to be rescued, with exact identity of that
field recorded. The evidence distinguishes encoded-field controls from composite verifier tests; §8 states their limits.

## 5. Bootstrap observation and creating endorsement bytes

The independent authority pin is configured before any service reply. Its exact LP bytes are
`LP("done/service-authority-pin/v1", "1", serviceId, origin, rpId, authRoot)`; its fingerprint is the
SHA-256 of those bytes. A fingerprint displayed by the same untrusted reply establishes no trust.
Bootstrap signs `LP("done/service-authority-bootstrap/v1", "1", serviceId, origin, rpId, authRoot, nonce)`.
Both nonce and key are 32-byte lowercase hex; serviceId is 16-byte hex. The closed proof carrier is
`{v:1,pin,nonce,signature}`. Require the expected pin and fresh requested nonce before trusting the proof.

Pending observation signs the following **unhashed** JSON-containing LP message:

```
LP("done/pending-account-observation/v1", hex(pinBytes), nonce, J_pendingState)
pendingState = {v,accountId,attemptId,status,draft,confirmation}
confirmation = null | {recoveryId,receiptId,draftDigest,recoveryStateDigest}
draft = null | RecoveryDraft in first-authority.json's recovery order
```

`status` is `eligible` or `abandoned`. Eligible requires both draft and confirmation; confirmation requires
its draft. The proof carrier is `{v:1,pin,nonce,state,signature}`. The client verifies the root signature,
recomputed recovery root and draft/state digests. This observes one transaction; it reserves no future
eligibility. The JSON state is inside one u16-length LP field; it does not use the digest-body format of §1.

The creating set's exact bytes are:

```
member = LP("done/certified-members/v1", signingCredentialId, W_pub, S_pub)
set = LP("done/certified-set/v1", "1", workspaceId, lineageId, "0", "1",
         hex SHA256(member), recoveryStateDigest)
approval = LP("done/certified-set-approval/v1", approvingSigningCredentialId) || set
```

The single member is the prepared device; approver equals that signing ID. The zero and one are parent
and next epoch, not envelope counters. The device signs `approval` and the candidate; the factor-opened
bootstrap signer endorses the complete origin request in §1. The service cannot introduce a recipient by
changing only its own signature. Creating keys must also match the authenticated Local preparation; the
standalone public parser cannot prove that local provenance. The recovery ciphertext and wraps embedded
in these messages remain opaque to the root signer. Recovery/HPKE vector qualification is a later group.

## 6. Initial checkpoint and structural digests

First-epoch completion retains the separate manifest-v2 and SemanticAdmission-v2 bytes in
[the descriptor contract](../account-admission-bounds.md) and [current implementation vectors](../../test/vectors/admission-coverage.json).
The full opaque SV and DS remain present, subject to their combined 16 MiB bound. Hashing them in the
signature lifts LP's hex-width ceiling; it does not make them self-authenticating coverage.

`requestDigest` hashes UTF-8 of the complete `J_request`, including all three signatures. `completionDigest`
hashes complete `J_completion`, including both signatures. These bare hashes are committed by the later
root-signed objects; a bare digest is not an authority token. The manifest's checkpoint digest hashes the
**decoded ciphertext bytes including the tag**, not JSON/hex text. Its own digest, used by SemanticAdmission,
hashes `manifestMessage`, excluding the signature. The first head vector is §3's empty vector.

A content-blind service may accept consistently signed SV/DS claims it cannot recompute. A consuming
client must decrypt and independently derive both descriptors, then compare them with manifest and
admission. Valid root/device signatures do not waive that comparison. Our byte fixture intentionally has
opaque dummy checkpoint/wrap/recovery ciphertext and is not a Yjs or encryption known-answer test.

## 7. Activation and slot-binding dependency

The activation challenge carrier is `{v:1,kind:"promotion-activation-challenge",context,signature}`.
Its context order, message, WebAuthn nonce and receipt proof hash are in §§1–2. Actual WebAuthn signed bytes
are authenticatorData followed by SHA-256 of the **original clientDataJSON bytes**. Never reconstruct that
JSON for signature verification. The separate proof hash uses recursively sorted-key JSON of the complete
assertion response, as implemented by `account-service/protocol.ts::canonical`. A fixed valid Ed25519
assertion is included in the new corpus; the existing activation campaign retains ES256, lifetime and
atomic-consumption coverage. The account authenticator key is not a workspace signing key.

Slot binding retains row 12's bytes:

```
LP("done/slotbind/v1", "1", accountId, principalId, rpId, "1", credentialId, hex SPKI)
unlockNonce = SHA256(LP("done/slotunlock/v1", "1", principalId, credentialId, freshNonce))
```

The second one is the initial binding epoch. SPKI is exact Ed25519 or uncompressed P-256 encoding;
credentialId is the actual registration WebAuthn ID. The root signs the binding. The closed proof carrier is
`{v:1,kind:"promotion-slot-binding",requestDigest,epochHead,stored:{binding,bindingSignature}}`.
Its outer routing fields are compared with the verified receipt; they are not extra fields inside the
binding signature. The binding must name that receipt's activated registration credential. Unlock proves
use of the bound account authenticator and still does not release the mandatory device-lock factor.
Retain row 12's full ES256/Ed25519 slot-verifier vectors; this corpus adds the private handoff dependency.

## 8. Authority-map edges and evidence limits

The new Account map entries give K_auth **availability/serialization** powers under an independently
configured pin. They do not relabel a service root as a client trust root. The factor-opened preparation
and recovery-bootstrap signer ground the creating key; its candidate and certification are separate
endorsements. Local coverage recomputation is structural. Platform assertion possession resolves to the
account-credential factor entry. These checks compose; none can be replaced by a root-signed receipt alone.

[constructions.json](./constructions.json) registers exact source sites, purpose/role, map entry IDs, pinned
sections/schema, executable vector cases and evidence requirements. Its source census includes open B/C/D
and inherited Local records rather than counting only completed work. A specified entry means its bytes
and stated map dependencies have this bounded evidence, not that all protocol or lifecycle gates are paid.
The source-hash check detects drift; manual review must still discover unlabelled primitives or new roots.

[Published vectors](../../test/vectors/first-authority.json) contain fixed synthetic seeds/public keys,
objects, intermediate JSON/LP fields/hashes and signatures. Generation compares each positive and accepted
mutation against production encoders; parser-refused mutations are reported separately. Encoded-field
omission controls act below value validation and do not claim a bypass of every composite predicate.
Six digest omissions additionally exercise the real message builders and signature verifier. The separate
integration tests exercise authentic wrong-purpose, root, owner and credential-namespace values, closed
objects/versions/array order, a signed coverage lie, and the rejected zero-position baseline. The generated
property campaign permutes nested input properties while retaining array order. No real account is minted.
