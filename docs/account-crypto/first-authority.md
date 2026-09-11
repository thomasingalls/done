# Private first-authority byte contract

2026-09-11; current baseline `2ba50aa`. This records the implemented private formats to guide phase A's
normative-home/authority-map amendments and interoperable vectors. It does not declare that gate closed.
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

Rows 5/7 currently say "for every credential" without this initial exception. Phase A must amend those
homes and the relevant TRD paragraphs together with the vector. Do not infer a general sparse-vector
rule for successor epochs, retired members, nonempty accepted history or pruning. Those machines remain
separate work; dropping an existing stream is not permitted by this genesis ruling.

## 4. Compatibility and phase-A falsifiers

Preserve current private bytes. Reject receipt v1, unknown/mixed completion versions, reordered **arrays**,
extra fields, wrong scope, wrong key namespace and a substituted head-vector baseline. Parser-accepted
JSON property reordering must reconstruct identical bytes. Never silently relabel old signatures or
rewrite historical fixtures as if they exercised v2. No real Account receipt exists.

Phase A publishes fixed inputs and expected intermediate JSON/LP/hash/signature bytes, reproduced by
runtime code and an independent implementation. Cover each included field, nested field and nested
signature; signature swapping among message purposes; genuinely signed wrong-operation values; empty
versus zero-position vector; and old/current readers. A positive signature round trip alone is inadequate.
An omitted bound field must cause a corresponding negative to be rescued, with exact identity of that
field recorded. Current prep probes establish the selected baseline, not that complete field audit.
