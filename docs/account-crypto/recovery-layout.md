# Private recovery payload and digest contract

2026-09-11; private v1 contract, aligned with TRD §13.8, row 14, the runtime and current vectors.
Group B preserves existing wire bytes and adds strict exported-key format checks. The fixed corpus is
`test/vectors/account-recovery.json`; the amended row-14 corpus is `test/vectors/recovery-code.json`.

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
Fresh salt and nonce come from the platform RNG. One message per derived key depends on nonrepeating
randomness across seals, including restored or cloned histories; these vectors do not prove that host assumption.

Opening requires authenticated decryption, exact 96-byte length, equality of the sealed root to the
recomputed expected root, and correspondence of both private keys to the draft public keys. Current
runtime checks X25519 by comparing DH results with a fresh peer, and Ed25519 by sign/verify over
`LP("done/recovery-key-check/v1", hex RootCommitment)`. Generation accepts only a 48-byte PKCS#8 export:
16-byte prefix `302e020100300506032b656e04220420` for X25519 or
`302e020100300506032b657004220420` for Ed25519, followed by exactly 32 raw bytes. Wrong algorithm,
length or prefix refuses before sealing. Both export buffers and the payload are cleared in `finally`.
This is a format assertion, not a claim that JavaScript can erase every provider copy of key material.
The opener passes only non-extractable handles to its private callback after all checks succeed.

## 2. Commitments and confirmation

The draft's ordered fields are `principalId,workspaceId,lineageId,authRoot,v,rootCommitment,rPub,
bootstrapSigner,envelope`. Recovery context has exactly four fields: principalId, workspaceId and lineageId each match
`[A-Za-z0-9_-]{1,128}`, and authRoot is 32 bytes in canonical lowercase hex; embedding it
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

## 3. Service challenges and hash encodings

The account challenge is SHA256 of LP fields, in this exact order:
`done/account/{operation}/v1, attemptId, accountId, rpId, origin, freshNonce`.
The closed service operation set is `register`, `confirm-registration`, `authenticate`.
Finalization uses §2's different domain and inserts recoveryId and draftDigest before RP/origin.
The service generates 32 nonce bytes per call, encodes them as unpadded base64url text inside LP,
and emits the SHA256 result as unpadded base64url. There is no caller-supplied nonce argument.
Challenge encoders operate on the owner's validated state; they do not themselves grant authentication.
The service's retained attempt and expected credential, RP/origin, UP/UV and embedding checks remain
required. These challenges are account authority only, never workspace signing authority.

Confirmation signs the exact 43-character challenge string retained by the owner and the recomputed
hex draft digest. The client requires that length/alphabet and digest agreement; the service emits
canonical base64url. There is no alternative binary challenge representation inside the signature.
`verifyRecoveryProof` checks possession under the retained draft's bootstrap public key; that public key
alone does not certify an honest re-entry UI or authorize account activation. The separate account
assertion must pass, and the factor-opening owner checks both key pairs and the root before signing.

Service proof hashes use SHA256 of compact recursively sorted-key JSON; array order and exact
base64url strings inside a proof remain significant. Retry hashes use SHA256 of **decoded** canonical
base64url retry bytes (exactly 32), not of the text. Their broader service-ledger use remains group D.

## 4. Generation recipient bridge

The recovered X25519 key opens a recovery generation wrap with:
`info = LP("done/gen-wrap/v1", workspaceId, lineageId, authRoot, decimal generation)`.
This is RFC 9180 base mode: DHKEM(X25519, HKDF-SHA256)=0x0020, KDF=0x0001,
AEAD(AES-256-GCM)=0x0002. The standard `HPKE-v1`, `KEM` and `HPKE` suite/label bytes are used;
no application prefix is inserted in the standard schedule. Each fresh sender context seals one
32-byte generation key at sequence zero with empty AAD; enc is 32 bytes, ct including tag is 48.
The recipient public key is supplied from authenticated custody/recovery state. HPKE base mode
provides no sender authority; the first candidate's separate signature supplies that authority.
Fresh sender randomness and unbranched histories remain assumptions. The fixed corpus pins sender
and recipient keys, info, key/nonce and ciphertext, and drives both the actual sealer and opener.
Checkpoint subkey/AAD and Account startup qualification stay explicitly open for group D.

## 5. Compatibility and evidence obligations

Select the current strict v1 format: 96 plaintext bytes, 112 ciphertext bytes. Do not accept both lengths
under one parser. The old published scalar-only vector is independently reproducible but is not a current
positive. It is retained at `test/vectors/historical/recovery-code.scalar-only.json`; the adjacent README pins
its original file and generator hashes. No current generator overwrites it.
No production migration or real Account artifact is implied by this selection.

The current corpus publishes deterministic scalar/seed/public-key inputs, root, normalized code, salt/nonce, KDF info and key,
AAD, full plaintext/ciphertext, envelope/state/draft digests and confirmation bytes/signatures. Tests reconstruct
them independently and drive the runtime generator and opener, as well as native recovery regressions. Negative cases isolate
code, salt, nonce, principal, version, public keys, sealed root, payload length/order, envelope bytes,
state counter, request scope and challenge purpose. Authentic wrong private/public pairs
and resealed wrong commitments reach semantic checks. Encoded-field controls are independent primitive
controls; separate production-source mutants remove four context/root/key-pair checks and the export
format assertion and must rescue their counterexamples. Existing replacement step-up vectors remain
construction tests; they do not demonstrate a built replacement or total-loss recovery machine.
