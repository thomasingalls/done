# Inherited factor custody and v2 credential/metadata byte bridges

D6 qualifies the current custody implementation based on `add6fd7`: v1 factor seals and generation
envelopes, v2 private credential seals, key-pair correspondence and authenticated metadata. The sole
runtime change rejects nonprimitive custody states at parsing. Existing valid formats and inherited
vectors are unchanged. These are Local custody owners used by Account composition, not Account
membership issuance, PRF enrollment, general rotation or a total-loss recovery machine.

## 1. Code and factor-seal contract

Public fresh enrollment generates 25 independent random bytes, maps each with `byte & 31` into
`0123456789ABCDEFGHJKMNPQRSTVWXYZ`, and displays five groups of five separated by hyphens. This has
125 bits under the fresh uniform RNG assumption. Normalization removes `-` and JavaScript Unicode
whitespace, uppercases, maps O to 0 and I/L to 1, then requires exactly 25 alphabet symbols. It produces
**25 UTF-8 ASCII bytes**, not packed Base32 bits. It is not a user-chosen password KDF. Confirmation
must match the generated value; the ceremony consumes its display/comparison references before awaiting
persistent work. Privileged composition seams require their enclosing enrollment owner to supply the code.

LP below is uint16 big-endian UTF-8 byte length followed by bytes. Fields are at most 65,535 bytes;
lone surrogates refuse and there is no Unicode normalization. Admitted slot/principal/workspace identities
are nonempty strings of at most 1,024 UTF-16 code units, validated before owner acquisition/use as applicable.

```
factorInfo = LP("done/devicelock/v1") || LP(principalId) || LP(workspaceId) || LP(factor)
K_factor = HKDF-SHA256(factorIKM, salt[16], factorInfo, 32)
factorAAD = LP("done/devicelock/v1") || LP(principalId) || LP(workspaceId)
         || LP("1") || LP(factor) || LP(id)
ct = AES-256-GCM(K_factor, nonce[12], factorAAD, root[32], tagBits=128)
LockSeal = {v:1, factor, id, salt:Uint8Array[16], nonce:Uint8Array[12], ct:Uint8Array[48]}
```

Salt and nonce are separate fresh random draws at sealing. The generated-code owner uses factor=`code`,
id=`code`, normalized ASCII code as IKM and a fresh random 32-byte custody root as plaintext. The generic
helper also reproduces inherited `prf` byte vectors from supplied IKM; no authenticator ceremony or PRF
input derivation is implemented by these helpers. Current custody parsing admits exactly one code seal;
it rejects PRF, extra seals and alternate IDs. Slot ID is not a factor KDF/AAD field; the trusted scope
resolver and later metadata authentication bind the slot. Salt is KDF input, not a separate AAD field.

Factor keys are non-extractable AES keys with encrypt/decrypt usages. They are fresh derived keys per
seal under the fresh-salt assumption and do not spend the root's invocation grant. The low-level helpers
consume typed inputs; they do not themselves enforce the stored root/IKM widths or all versions. Owner
parsing and the generated-code boundary establish those requirements. A non-extractable key alone is not
a filesystem-confidentiality guarantee; the saved factor must remain outside a copied profile.

## 2. Generation envelope and private credential seals

Generation envelopes use the custody root directly as a non-extractable AES-256-GCM key:

```
envelopeAAD = LP("done/keyenv/v1") || LP(principalId) || LP(workspaceId)
            || LP("1") || LP(decimal(gen)) || LP("content-key")
ct = AES-256-GCM(root[32], nonce[12], envelopeAAD, K_g[32], tagBits=128)
KeyEnvelope = {v:1, gen, nonce:Uint8Array[12], ct:Uint8Array[48]}
```

Nonce is fresh per call; ciphertext includes the final 16-byte tag. No HKDF or salt occurs here.
`openEnvelope` reconstructs the fixed v1/purpose AAD; its typed helper does not validate the supplied
envelope version. Custody parsing admits only v1/gen=1 and the exact widths before opening. Inherited
generation-2 and legacy-root vectors qualify unchanged byte syntax, not current rotation or promptless
custody support. Successful open checks a 32-byte generation secret before deriving operational keys.

The two v2 credential carriers also use this same counted root directly:

```
credentialAAD = LP("done/custody-credential/v2") || LP(principalId) || LP(workspaceId)
              || LP(role) || LP(id) || LP(lowercaseHex(publicKey[32]))
ct = AES-256-GCM(root[32], nonce[12], credentialAAD, privateRaw[32], tagBits=128)
credential = {role, id, publicKey:Uint8Array[32], sealed:{v:2, nonce:Uint8Array[12], ct:Uint8Array[48]}}
```

Role is `wrapping` for X25519 or `signing` for Ed25519. The fixed v2 AAD label binds the selected format;
the typed opener itself does not read `sealed.v`. The enclosing parser rejects other versions. IDs are
distinct lowercase hex16 strings, checked by custody parsing. Public keys enter AAD as lowercase hex
text, not raw bytes. Slot, store and root IDs are absent from this AAD; metadata binds their enclosing
placement and the factor-opened root supplies the key. This is distinct from the inherited factor-derived
wrapping-credential replacement fixture. That historical carrier is not a v2 compatibility vector.

Creation generates an extractable pair, exports PKCS#8, requires exactly 48 bytes and the exact prefix,
then seals its final 32 bytes. The prefixes are:

```
X25519: 302e020100300506032b656e04220420
Ed25519: 302e020100300506032b657004220420
```

The 32 bytes are X25519 private scalar bytes or the Ed25519 seed, not a whole DER envelope. The public
export is raw. The helper does not independently assert the public export width; parser/import and
key-pair verification establish the accepted width before completed custody is published. Opening
requires 32 decrypted bytes, reconstructs the corresponding prefix, and imports a non-extractable
private key with deriveBits-only or sign-only usage. Public and private correspondence must pass before
the key is returned. Exported private buffers are cleared in finally, including later export/randomness/
encryption failure. Opened private bytes and reconstructed PKCS#8 are cleared on success and failure.

## 3. Local key-pair correspondence

For signing, the actual opener signs the **plain UTF-8** bytes of `done/custody-key-check/v2` with the
opened Ed25519 key and verifies with the advertised raw public key. No LP prefix, JSON or appended scope
appears in that challenge. A false verification refuses. The fixed signature vector pins the local
probe, not an externally accepted authorization message. Choosing a different shared challenge would
still test key correspondence; its exact bytes alone do not confer membership or content authority.

For wrapping, the opener generates an ephemeral X25519 peer, imports the advertised raw public key and
compares both 256-bit shared secrets:

```
X25519(openedPrivate, peerPublic) == X25519(peerPrivate, advertisedPublic)
```

Both native results must agree; native import/derive rejection also refuses. Temporary shared-secret
buffers are cleared even if the second derivation or comparison fails. The returned private key is
non-extractable. The fixed independent probe uses a fixed peer only for reproducibility; the runtime
uses an ephemeral peer. This is a local mathematical key-pair check, not an HPKE recipient ceremony,
certificate check or acceptance of another member's identity. Authenticated ciphertext containing a
different private seed must still fail here. These two checks are registered as local predicates.

## 4. Metadata key, tuple and closed structured-clone parser

```
K_metadata = HKDF-SHA256(root[32], salt=empty,
  info=LP("done/custody-metadata/v2") || LP(slot_id) || LP(principal_id)
     || LP(workspace_id) || LP(root_id), length=32)
MAC = HMAC-SHA256(K_metadata, UTF8(JSON.stringify(tuple)))
```

The non-extractable HMAC key has sign/verify usages. Store ID is deliberately absent from info and
present in the tuple. The exact 14-item tuple, with numbers/booleans/null preserved as JSON types, is:

```
["done/custody-metadata/v2", 2, state, slot_id, principal_id, workspace_id, store_id, root_id,
 [[1, "code", "code", hex(salt), hex(nonce), hex(ct)]], seal_reserved, false,
 intent ? [id, storeId, rootId, wrappingId, signingId] : null,
 envelope ? [1, 1, hex(nonce), hex(ct)] : null,
 credentials ? [["wrapping", id, hex(publicKey), [2, hex(nonce), hex(ct)]],
                ["signing", id, hex(publicKey), [2, hex(nonce), hex(ct)]]] : null]
```

Hex is lowercase, object insertion order is immaterial, array order is significant, and the MAC is
excluded from its own message. There is no JSON wire decoder for this tuple: the stored carrier is a
plain structured-clone object with exactly `v, state, slot_id, principal_id, workspace_id, store_id,
root_id, seals, seal_reserved, rotation_owed, creation_intent, envelope, credentials, mac`.

The parser requires v=2, primitive string state `creating` or `protected`, rotation_owed=false, exact
scope equality, lowercase hex16 store/root IDs, one code seal and Uint8Array[32] MAC. Reservations are
safe integers in [0,2^32), with at least three for protected state. Negative zero is accepted and
serializes identically to zero. No multiple-of-three rule is inferred from the count. Nested objects
have exact keys and the widths above; byte arrays are copied. Arrays require the specified lengths/order;
the parser reconstructs them, rather than authenticating arbitrary array properties.

Creating state has a five-ID creation intent whose store/root IDs match the enclosing record; envelope
and credentials must be null. Protected state has null intent, one gen-1 envelope and exactly two
credentials ordered wrapping then signing, with distinct IDs. Legacy v1 or state `migrating` produces
migration-required before ordinary parsing; other malformed data produces repair-required. Typed
payload/sign/authenticate helpers assume this parse and the held identity preconditions.

**D6 repair.** Previously the state-domain check used String(state). Arrays and boxed strings could
pass that check. A boxed `"protected"` also serialized to the authentic primitive's JSON bytes, so the
parser and MAC check accepted it. Ordinary open still refused it with creation-pending because its
separate state comparison was strict. A shrinking-enabled test reduced this to boxed state with three
reservations. The parser now requires the primitive strings directly; native IndexedDB tests preserve
the counterexample and confirm both the repair and the old owner's refusal. This is a parser-contract
defect, with no reproduced disclosure, successful unlock or authority bypass. Valid bytes are unchanged.

## 5. Native owner, invocation accounting and disposal

The `done.custody` version-1 database contains `entries`, keyed by the exact array
`[slotId, principalId, workspaceId]`. Under the granted slot permit, the owner checks pending clear/import
state, resolves current principal authority, reads and parses custody, and requires protected state for
ordinary open. It factor-opens the root, authenticates metadata, opens the generation key and both
credentials, then publishes a public descriptor/capability. A wrong or damaged factor seal is
unlock-failed; metadata or retained-key failure is repair-required. Nothing is removed on refusal.
Neither a missing entry nor an authentic creating state permits ordinary open to invent a replacement.

Fresh creation requires an enclosing other-carrier census under exclusive ownership. It commits a
factor-sealed root and MACed creating intent, with zero root reservations. It then MACs and commits
three reservations **before** the generation-envelope and two credential AES invocations. Equality at
2^32 refuses. A failed final batch leaves its reservations burned. Resumption authenticates the same
root/intent, repeats the census and reserves three more; it does not infer usage from surviving keys.
Completed keys are reopened/checked before the protected record is installed atomically. These three
root invocations share one counted key; the factor-derived seal is a separate construction.

Transactions settle at native completion, not request success. Before replacing custody, the transaction
compares both the previous reconstructed tuple and exact MAC with the authenticated/held expected
record. The native control changes only the stored MAC before reservation commits: baseline refuses
before root encryption, while omitting the MAC comparison overwrites the changed record and completes.

F-15 now requires custody writes to request and report strict IndexedDB durability before executing
the transaction body. Completion precedes root-key AES; unsupported capability refuses and drains native
work. See [reservation persistence](../account-reservation-durability.md) for the exact platform/loss
assumptions and tests. Browser-reported strict is not physical power-cut evidence. Accurate initial counts
and an unrewound, unbranched history remain required; MACs do not detect replay of older authentic state.
Fresh factor salts/nonces and root nonces require nonrepeating randomness. No general rotation proof follows.

Guarded native crypto calls check lifetime ownership before each invocation. Closing invalidates work,
drains tracked calls, clears owned raw buffers/key references and closes databases before releasing the
permit. Tests retain references to temporary exported/imported/decrypted/encrypted private buffers and
observe logical clearing. This is not JavaScript-engine/OS zeroization, private CryptoKey destruction,
or whole-profile forensic qualification. Caller-owned input buffers and successful returned content have
their separate ownership contracts.

## 6. Evidence and remaining boundary

`pnpm account:local-custody` checks fifteen independent constructions, unchanged inherited factor and
key-envelope cases, exact current builder bytes, input mutations and encoded omission witnesses.
One hundred generated state cases retain the pre-fix counterexample; 200 shrinking-enabled metadata
histories cover reservation/completion, reparsing, property reordering and tampering. The corpus models
metadata bytes; native lifecycle/crash schedules separately test storage ownership.

Source controls remove credential identity binding, signing/wrapping correspondence, metadata count
binding, metadata KDF slot input, exact MAC comparison, private export-format and cleanup guards, and
restore the old state coercion. The KDF-slot control is detected by independent expected bytes even
though the metadata payload still binds slot: local round-trip success alone is insufficient evidence.
Native tests exercise genuine wrong-private-key ciphertexts and actual owner verification/comparison
omissions, not forced crypto-success results. Existing custody genesis, interrupted-creation, abort,
scope, lifetime, cancellation and synthetic profile-copy regressions retain their original limitations.

The oracle uses independent Node encoders and Node/OpenSSL primitives, sharing D5's independent primitive
utilities but no production codecs. This is independent byte reconstruction, not fully independent crypto
libraries. PRF enrollment, arbitrary factors/rotation, Account checkpoint/startup, migration-only
provenance, F-05/F-06, F-15 and broader release/independent-review gates remain separate.
