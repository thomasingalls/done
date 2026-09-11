# Local promotion authentication and deterministic identities

D2 pins the private runtime at `d24ca66`. The unit of compatibility is the retained promotion
carrier, not an Account grant. No bytes, versions, production encoders or acceptance predicates change.
This closes only `remaining-local-promotion`; capsules, counters and inherited Local bridges remain open.

## 1. Scope, versions and structural requirements

The IndexedDB structured-clone carrier lives in `done.custody/entries` at
`[slotId, "application-upgrade"]`. It is not a JSON wire object. Its exact keys are:

```
v, kind, id, source, claimMac, pin, account, retryHash, custodyMac,
sealReserved, credentialIds, stage, credentials, mac
```

Add `genesis` for v2–v9, `admission` for v3–v9, `handoff` for v4–v9. Unknown, missing and extra
keys refuse, recursively through the enclosed parsers. Current owners still write the earlier stages;
they are not merely a historical v1–v8 reader. This is the exact accepted version/stage matrix:

| v | stage | Added fields and conditions |
| --- | --- | --- |
| 1 | `reserved`, `prepared` | Reserved credentials must be null; prepared has both sealed credentials. |
| 2 | `genesis-prepared` | `genesis` is a parsed v1 candidate. |
| 3 | `admission-requested` | Request; offer, completion, receipt are null. |
| 3 | `admission-offered` | Request, offer and completion; receipt is null. |
| 3 | `admission-receipted` | All four admission fields, with retained offer/completion equal to receipt copies. |
| 4 | `handoff-prepared`, `handoff-selected` | Receipted admission and parsed handoff. |
| 5 | `account-active` | Same nested carriers as v4. |
| 6 | `account-capturing` | Same nested carriers as v4. |
| 7 | `account-spooling` | Same nested carriers as v4. |
| 8 | `account-delivering` | Same nested carriers as v4. |
| 9 | `account-receiving` | Same nested carriers as v4. |

`kind` is `local-promotion`. `id`, principal/workspace/store/root/genesis-intent and credential IDs
are lowercase hex16. `source.slotId` is a nonempty, well-formed UTF-16 string of at most 1,024 code
units. `source.generation` is exactly 1. `claimMac`, `retryHash`, `custodyMac` are lowercase hex32;
`mac` is a Uint8Array of exactly 32 bytes. The seal reservation is a safe integer in [5, 2^32).
The two credential IDs are distinct. Each credential has exactly role/id/publicKey/sealed:
wrapping then signing, matching those IDs, a Uint8Array public key of 32 bytes, and a closed
`{v:2, nonce:Uint8Array[12], ct:Uint8Array[48]}`. These checks do not open the seals or prove a keypair.

The closed authority pin and pending state inherit [first-authority.json](./first-authority.json)
and [first-authority.md](./first-authority.md). Pending status must be eligible; its draft's authRoot,
principalId and workspaceId must equal the pin/source. Structural parsing does not verify pending
service signatures or recompute recovery commitments. Genesis actors have strict ascending IDs;
wraps are exactly device then recovery; the first-genesis accepted-head vector is empty.

## 2. Exact MAC key and payload bytes

Let `U(s)` be UTF-8 without normalization, rejecting unpaired surrogates. Let
`LPu(s) = u16be(byteLength(U(s))) || U(s)`, with at most 65,535 bytes per field.
`fields` concatenates LPu fields. The key is a non-extractable WebCrypto HMAC key, sign/verify usages:

```
info = fields("done/local-promotion/v1", source.slotId, source.principalId,
              source.workspaceId, source.rootId)
K = HKDF-SHA256(IKM = raw Local custody root[32], salt = empty bytes, info, L = 32)
mac = HMAC-SHA256(K, UTF8(JSON.stringify(payload)))
```

There is no nonce, padding, terminator or JSON whitespace. Empty HKDF salt has the standard HMAC
zero-padding semantics; a one-byte zero salt is not a discriminating salt mutation. Store identity,
genesis-intent and generation are in the payload, not the key info. The MAC field itself is excluded.
The payload is this array (indexes are normative):

| Index | JSON value |
| --- | --- |
| 0 | `"done/local-promotion/v1"` for **every** carrier version |
| 1–3 | numeric v, kind, id |
| 4 | `[slotId, principalId, workspaceId, storeId, rootId, genesisIntentId, generation]` |
| 5 | claimMac |
| 6 | `[pin.v, serviceId, origin, rpId, authRoot]` |
| 7 | **String** containing compact JSON of reconstructed PendingState, including nested draft/confirmation |
| 8–12 | retryHash, custodyMac, sealReserved, credentialIds (array), stage |
| 13 | null, or two `[role, id, lowercaseHex(publicKey), sealed.v, lowercaseHex(nonce), lowercaseHex(ct)]` tuples |
| 14 | v>=2: reconstructed GenesisCandidate **object**, including signature |
| 15 | v>=3: reconstructed `{request, offer, completion, receipt}` **object**, including nested signatures |
| 16 | v>=4: reconstructed `{binding, destination}` **object**, as specified in §3 |

Pending property order is v/accountId/attemptId/status/draft/confirmation. Confirmation order is
recoveryId/receiptId/draftDigest/recoveryStateDigest. Recovery, candidate, request, offer, completion,
receipt and all nested fields use the reviewed ordered objects in the linked field schema. The pending
object is serialized once into a string and escaped again inside the outer array. Enclosed objects at
14–16 are not stringified separately. Numeric versions/budgets/generation stay JSON numbers.

`signPromotion` computes these bytes and the MAC, then returns `parsePromotion` of the result.
It does not validate the complete carrier before the HMAC invocation; its owned callers supply prepared
objects. Parsing does occur before accepting a retained record on read. Do not infer parser validation
or authority merely from the low-level payload helper returning bytes.

## 3. Handoff property order is retained compatibility

The binding object is reconstructed as v/kind/requestDigest/epochHead/stored; stored is
binding/bindingSignature; its binding is v/accountId/principalId/rpId/epoch/credId/publicKey.
The destination is a validated **structured clone retaining input property order**, not a reconstructed
or sorted JSON object. Its fields are id/status/unlockBinding/account/stores, in the current writer's
order; the parser accepts other orders subject to the binding check below. Stores are retained from the Local route; fresh Local store entry fields are
principal/workspace/dbName. Their order is retained, not reconstructed. Account fields are v/promotionId/requestDigest/epochHead.
The destination must be active, have Account metadata and exactly one store, and have no Local metadata.

The destination's `unlockBinding` must equal the reconstructed binding's stored object by compact
`JSON.stringify` equality. Reordering that nested binding refuses even before MAC verification.
Reordering the remaining destination object fields can parse but changes authenticated bytes.
Outside the destination, input object property order is reconstructed or projected into tuples.
Array order is preserved or constrained, never implicitly sorted; reversing genesis actors refuses.
This behavior is intentionally retained. A future canonicalization change needs an explicit version or
compatibility decision, since it can invalidate existing MACs.

## 4. Authentication owner and authority limits

`readPromotion`, reached under the promotion-specific slot permit, authenticates the ready Local
claim, checks matching protected custody, opens the factor seal and authenticates current custody.
It parses the retained marker, derives its scoped MAC key and verifies its MAC. It then requires:

- source slot/principal/workspace/store/root/genesis-intent/generation equal the authenticated current
  claim/custody scope;
- marker claimMac/custodyMac/sealReserved equal the current authenticated claim/custody;
- prepared credential IDs do not collide with the retained Local credentials.

A correctly MACed different source or budget must still refuse. The factor and raw root buffers are
cleared by the existing root scope; D2 introduces no new key lifetime. It does not requalify all
underlying factor, AEAD, Web Lock, journal or power-loss behavior.

A MAC proves integrity under the opened Local root, **not** current pending eligibility, expected
caller retry capability/pin, nested service signatures, key correspondence, plaintext coverage, admission
or permission to switch the slot. Preparation, genesis, admission, handoff and later Account owners keep
those checks. In particular, the parser/reader may accept a structurally valid, correctly MACed candidate
from another context; downstream semantic verification must reject it before use. Native D2 fixed-stage
fixtures deliberately exercise the carrier reader, not thirteen complete service transitions.

## 5. Deterministic names and framing limits

These two names use the protocol's **ASCII** LP, `u16be(length) || ASCII(field)`, admitting only
U+0020–U+007E, not the Unicode custody fields used in §2. Results are lowercase SHA-256 hex32.

```
lineage = SHA256(LP("done/promotion-lineage/v1", pin.serviceId, pin.authRoot, accountId,
  source.slotId, source.principalId, source.workspaceId, source.storeId,
  source.rootId, source.genesisIntentId))
attempt = SHA256(LP("done/promotion-attempt/v1", retryKey))
```

The lineage does not include pin.v/origin/rpId or source.generation. Those remain constrained and
compared separately; a digest is a proposal identity, not an epoch, reservation, factor, membership or
freshness witness. The attempt name does not authorize a caller without the original retry capability.
Preparation and genesis independently use the same attempt expression. Public owners validate account
and retry identifiers as canonical 32-byte base64url (43 characters); the low-level hash helper does not.

A Unicode slot accepted by Local custody can therefore refuse at lineage derivation. Current generated
slot IDs are ASCII; D2 neither expands this admission policy nor aliases Unicode into ASCII. The fixed
MAC fixture uses `Local-é-🗝`; the fixed lineage fixture uses `Local-main` with the same other fields.
LP lengths prevent boundary concatenation aliases; Unicode normalization is never implicit in custody.

## 6. Executable evidence and residual scope

`test/vectors/account-promotion.json` contains 13 fixed stage MACs, one MAC-key vector, and the two
names, reconstructed by Node/OpenSSL without production encoders/parsers/KDFs. The oracle reuses the
independently constructed first-authority fixture and reviewed nested field schema, not service-generated
expected payloads. Payload/key info and every intermediate needed to reproduce each MAC are retained.

`pnpm account:promotion-contract` checks actual payload/parser/signing functions, every input leaf,
nested pending fields, encoded omission witnesses, malformed carriers, ordering, KDF/name mutations
and shrinking-enabled histories. Private pure seams are exported only in an in-memory test bundle;
production exports are unchanged. Browser tests use real factor-opened Local custody, all 13 reader
states, authentic source mismatches, actual source-guard removal and native HMAC message omissions.
The latter change verification bytes while leaving WebCrypto's verification operative.

The registry requires a MAC authority edge and omission evidence rather than treating MAC vectors as
unclassified carriers. Source pins and explicit negative controls keep these obligations executable.
The construction remains symmetric: any actor holding the Local root can make another valid MAC.
Restoring or branching a profile can replay authentic old claim/custody/marker sets; no anti-rollback
claim follows. F-05/F-06, the remaining group D constructions and independent review stay open.
