# Private first-epoch admission and retained receipt

This bounded phase consumes the authenticated version-2 Local genesis candidate. It creates service
admission and retains the verified result in the existing promotion carrier. Index handoff, slot binding,
ordinary account UI, relay publication and device enrollment are subsequent owners. This API requires
online authority availability; offline Account startup is not established by this component.

## Commit boundary

A client first replays Local database plus journal and reopens both generation wraps under both saved
factors, using the preceding genesis verifier. It approves exactly one certified member: the prepared
signing credential ID, exact prepared W_pub and S_pub. The wrapping key's local custody ID remains the
candidate's device-wrap ID; the network credential is the signing credential ID. The member approval
uses TRD §13.5's CertifiedSet bytes with parent epoch 0, next epoch 1 and the exact confirmed recovery-state
digest, signed by the creating credential from factor-authenticated Local custody. Neither a service
supplied key nor a root signature substitutes for this approval.

The recovery-code-sealed bootstrap signer additionally endorses the full request, including the candidate,
CertifiedSet approval and exact confirmed RecoveryState. Its signature uses
LP("done/genesis-origin/v1", SHA256(fixed-order request JSON excluding originSignature)). The service
checks this signature against the bootstrap public key in its current confirmed recovery draft. The
client checks against its independently retained, factor-opened draft. This binds the creating device
for later recovery; a root-signed replacement self-certification is insufficient. A future code-only
receiver must first authenticate that bootstrap signer by opening the recovery envelope. Trusting a
request-supplied bootstrap key alone does not establish the original recovery authority.

Before any admission request is sent, strict IndexedDB replacement advances the single promotion
carrier to version 3, stage `admission-requested`, retaining the exact request. Older readers refuse.
A service offer fixes an immutable first-epoch header and a fresh, independently generated acceptance
signing key. The header binds the candidate digest, approved certified set, account/principal/workspace/
lineage/root, generation 1, epoch 1, zero parent, owner credential/capabilities and empty accepted heads.
The offer is signed in a proposal-only domain. It is not a signed epoch and cannot establish admission.
The client verifies it against the independently configured root, saved request, exact recipients and
recovery state before retaining the offer and completion in stage `admission-offered`.

The client derives separate opaque SV and DS from its reopened checkpoint/source verification. SV is
Y.encodeStateVector(doc); DS is Y.encodeSnapshot(Y.createSnapshot(Y.snapshot(doc).ds, new Map())). The
DS encoding includes an empty-vector suffix; `yjs-13.6.31-sv-ds-v1` pins that representation. Neither
contains document text. Their hex LP fields must each fit the existing u16 bound; larger descriptors
refuse before a request, without discarding Local data. The checkpoint plaintext remains bounded at 16 MiB.
The client signs row 7's exact manifest and SemanticAdmission bytes for the offered head. The accepted
head baseline is SHA256(LP("done/headvec/v1")), the decision parent is the all-zero 32-byte genesis
sentinel, and self_admitted is exactly 1 because the certified set contains only the creating client.
Signatures cannot prove truthful replay to the content-blind service: semantic authority here is the
explicitly identified sole eligible client, and a receiver still must decrypt and rederive coverage.

Finalization rechecks live pending registration, confirmed passkey, confirmed recovery, exact offer,
client certification, manifest/admission signatures and the retained acceptance-key seal. A single
SQLite FULL-synchronous transaction stores the complete receipt and marks the account active. Only
then is the first epoch's root signature returned. The receipt also signs the exact completion; there
is no digest cycle because the header binds the pre-existing candidate and certified set while the
manifest binds the resulting header hash. The client verifies all bytes and independently rederived
coverage before strict replacement to `admission-receipted`. No other Local carrier is changed.

## Persistence, retries and custody

Account schema 3 adds one promotion row per account and unique non-cancelled workspace/lineage. Cancelled rows retain audit evidence while permitting a new
registration to propose the same retained workspace. Existing schema 2
requires explicit offline upgrade. A fresh database creates the current schema. A proposal retains its
exact request, offer, encrypted acceptance seed, state and optional final receipt. The seed is sealed
under a distinct operator-derived acceptance-custody key with a fresh 16-byte per-seal salt and 12-byte
nonce; AAD binds the service pin, request digest and exact public key. It is never sent to the client or
stored unsealed. Lost proposal replies recover the same key and offer. An unreadable seal refuses;
there is no replacement key. Randomness/rollback assumptions remain as in the private root owner.

Service proposal and finalization serialize through BEGIN IMMEDIATE. Checks performed around async
signature verification are rechecked against the current rows inside the commit transaction. Exact
retries return the stored result; altered requests/completions conflict. A cancelled pending attempt
cannot be admitted. Abandonment cancels any pending proposal with the registration/recovery in the same
transaction; after admission it refuses. Consequently a lost final reply never authorizes unilateral
Local rollback. Existing authenticated Local abandonment may remove the version-3 carrier only after
the fresh signed service abandonment proof verifies; active accounts retain the carrier for handoff.

Cancellation drains native work before releasing the slot. Before-request abort leaves version 2;
after-request/offer/receipt interruption resumes the corresponding exact bytes. Service and renderer
death, competing proposals, abandoned attempts, altered signed replies and replay are conformance
boundaries. No timer chooses a competing winner or expires a durable promotion owner.

## Encoding and transport

`account-protocol/admission.ts` owns closed ordered objects, bounded fields and fixed-purpose bytes.
Row-7 and CertifiedSet signatures retain their selected LP encodings. Private offer/first-epoch/receipt
objects use separate versioned LP domains over the SHA256 of their fixed-order JSON body, excluding only
that object's signature. The epoch head is SHA256 of the epoch signing message. The request digest binds
the full closed request including candidate ciphertext, certification, recovery state and origin endorsement. Trusted callers compare full
parsed objects as well as their digests; signatures never choose their own verification key.

Private POST routes `/account/promotion/begin` and `/account/promotion/finish` keep exact Host/Origin,
operator token, JSON and no-store rules. Only these ciphertext-bearing routes accept up to 72 MiB of
JSON; existing small ceremony routes retain 128 KiB. No plaintext document, factor, content key or device
private key is in either request. No personal service is provisioned or started in this phase.

The following [service decision phase](./account-service-delivery.md) advances the private service to
schema 4 with an explicit offline v3 upgrade. It preserves these admission receipts and their original
acceptance-key seals while adding permanent content-decision storage.
