# Private recovery payload and digest contract

2026-09-11; prep against runtime `2ba50aa`. Phase B must amend TRD §13.8, row 14 and the current vectors
together. This file fixes the intended layout; it does not pretend the old generator already implements it.

## 1. Seal bytes

The normalized code is 25 ASCII Crockford symbols. Generation takes the low five bits of each of 25
independent random bytes. Display inserts a hyphen every five symbols. Normalization drops whitespace
and hyphens, uppercases, folds O→0 and I/L→1, then requires exactly 25 symbols in
`0123456789ABCDEFGHJKMNPQRSTVWXYZ`. The runtime bounds typed input to 256 characters.

Using the [LP conventions](./first-authority.md#1-primitive-encodings-and-nested-object-order):

```
RootCommitment = SHA256(LP("done/pkg-root/v1", workspaceId, lineageId, authRoot))
K_rec = HKDF-SHA256(ASCII(canonical code), salt[16], LP("done/recovery/v1", principalId), 32)
AAD = LP("done/recovery/v1", principalId, "1", hex R_pub)
plaintext = raw R_priv[32] || RootCommitment[32] || raw bootstrap seed[32]
ct = AES-256-GCM(K_rec, nonce[12], plaintext[96], AAD), followed by tag[16]
```

Here `LP(a,b)` abbreviates `LP(a) || LP(b)`; hex values in LP are lowercase ASCII. The middle plaintext
segment is **32 binary bytes**, not 64 hex characters. R_priv is the raw X25519 scalar; the bootstrap
segment is the 32-byte Ed25519 seed, not a 64-byte expanded secret or PKCS#8 wrapper. `envelope` is the
closed ordered object `{v:1,salt,nonce,ct}`, with lowercase hex lengths 32, 24 and 224 respectively.
Fresh salt and nonce come from the platform RNG; this prep does not resolve backup/clone/RNG assumptions.

Opening requires authenticated decryption, exact 96-byte length, equality of the sealed root to the
recomputed expected root, and correspondence of both private keys to the draft public keys. Current
runtime checks X25519 by comparing DH results with a fresh peer, and Ed25519 by sign/verify over
`LP("done/recovery-key-check/v1", hex RootCommitment)`. Phase B must assert the exported PKCS#8 prefix
and exact length before taking a raw suffix during generation; current code slices without that assertion.

## 2. Commitments and confirmation

The draft's ordered fields are `principalId,workspaceId,lineageId,authRoot,v,rootCommitment,rPub,
bootstrapSigner,envelope`. Recovery context permits its own bounded identifier syntax; embedding it
in a first-genesis request adds that request's exact workspace/principal/lineage binding requirements.

```
E = LP("done/recovery-envelope/v1", "1", hex salt, hex nonce, hex ct)
stateDigest = SHA256(LP("done/recovery-state/v1", "0", hex R_pub,
                       hex SHA256(E), hex RootCommitment, hex bootstrap public key))
draftDigest = SHA256(LP("done/account-recovery-draft/v1", "1", principalId,
                       workspaceId, lineageId, authRoot, hex stateDigest))
confirmation = LP("done/account-recovery-confirm/v1", challenge, hex draftDigest)
recoveryProof = Ed25519(bootstrap seed, confirmation)
```

The zero is the initial recovery-state counter, not the envelope version. Confirmation additionally
requires the account passkey assertion for the service's fresh finalize-recovery challenge. That challenge
hashes LP fields `done/account/finalize-recovery/v1, attemptId, accountId, recoveryId, draftDigest, rpId,
origin, freshNonce` and is base64url encoded. This is account creation's confirmation, not the future
replace-recovery or total-loss bootstrap operation; those domains and predicates remain distinct.

## 3. Compatibility and phase-B vector requirements

Select the current strict v1 format: 96 plaintext bytes, 112 ciphertext bytes. Do not accept both lengths
under one parser. The old published scalar-only vector is independently reproducible but is not a current
positive. Preserve it with its source hash as historical evidence before amending the generator/output.
No production migration or real Account artifact is implied by this selection.

Publish deterministic scalar/seed/public-key inputs, root, normalized code, salt/nonce, KDF info and key,
AAD, full plaintext/ciphertext, envelope/state/draft digests and confirmation bytes/signatures. Reconstruct
them independently and drive the runtime opener, not just a second generator. Negative cases must isolate
code, salt, nonce, principal, version, public keys, sealed root, payload length/order, envelope bytes,
state counter, request scope and challenge purpose. Include authentic but wrong private/public pairs
and genuinely resealed wrong commitments so rejection does not stop only at a broken tag. Use omitted
fields/checks as controls; retain the existing normalization/KAT/step-up coverage with accurate scope.
