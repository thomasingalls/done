# Private service key custody byte contract

2026-09-11; group D1. This specifies `PrivateAuthority` and `AcceptanceCustody`, their existing v1
seals and the exact provider key formats. The fixed corpus is `test/vectors/account-service-custody.json`.
It closes only the service-custody portion of group D. Valid seal, signature and database bytes remain
unchanged; stricter export checks and acceptance-creation cleanup are implementation repairs.

## 1. Inputs, encodings and authority

Use [group C's LP/hex conventions](./transport.md#1-encodings-and-authority-boundaries): each UTF-8
string has a u16 big-endian length prefix; hex is lowercase without a prefix. Concatenating two LP
lists does not insert an extra length. Empty salt means zero bytes. HKDF is SHA256 with 32 output
bytes. AES-256-GCM uses a 12-byte nonce and appends its 16-byte tag exactly once to ciphertext.

The operator supplies an independently generated random 32-byte wrapping secret from outside the
authority database. It is not any user's device-lock code, account passkey, recovery code or generation
key. `PrivateAuthority` validates its byte type/length and parses the pin before use. The internal
`AcceptanceCustody` constructor relies on these validated owner inputs; it does not independently
parse the pin or enforce the operator key's length. Its methods validate proposal/public/seal fields.
There is no public constructor endpoint or new key-provisioning operation in this phase.

`AuthorityPin` is the closed object `{v:1,serviceId,origin,rpId,authRoot}`. serviceId is hex[16], authRoot
is raw Ed25519 public hex[32]. Origin is an exact HTTPS origin, at most 2048 characters; rpId equals
its hostname. HTTP localhost is allowed for disposable tests. The independent expected pin comes from
trusted operator/build configuration, never from the same reply it verifies. The service's signing
authority remains bounded to serialization/availability: wrapping its signing seed does not grant
content-author, recipient, client factor, membership or admission authority.

## 2. Root seal and persisted root classification

```
info = LP("done/service-authority-seal/v1", serviceId, origin, rpId, hex authRoot)
K_root_seal = HKDF-SHA256(operator key[32], fresh salt[16], info, 32)
pin bytes = LP("done/service-authority-pin/v1", "1", serviceId, origin, rpId, hex authRoot)
ct = AES-256-GCM(K_root_seal, fresh nonce[12], Ed25519 seed[32], pin bytes) || tag[16]
```

ct is exactly 48 bytes; stored salt/nonce/ct are 32/24/96 hex characters. The database uses schema
version 1 and one authority table/row with id=1, pin TEXT, salt TEXT, nonce TEXT and ct TEXT. Creation
writes recursively key-sorted compact JSON for the pin. Cold opening parses/normalizes that JSON
before comparing the complete pin with the caller's expected pin; alternate JSON property order is
not itself a different authority. The SQL row is not a new signed JSON carrier or a portable database
file format. Version/table/row classification and field validation are separate from AEAD.

Initialization validates policy/operator inputs, creates an owned mode-0600 regular file exclusively,
generates a root and service ID, seals, and commits the row and schema under SQLite WAL/FULL before
returning the pin. Failure before commit retains a non-reinitializable artifact; failure after commit
can cold-recover the same pin. It never silently generates a replacement for an existing path.
Opening is read-only and requires the expected pin, correct operator key, exact seal widths and
authenticated decryption, then rederives the public key from the decrypted seed and compares it to
authRoot. A genuinely authenticated wrong seed still refuses. `recoverPin` first reads a candidate
pin and then performs that complete authenticated opening; it is an operator recovery utility, not
client trust discovery. File-race resistance assumes an operator-controlled parent directory.

## 3. Acceptance custody schedule and seal

```
K_accept_custody = HKDF-SHA256(operator key[32], empty salt,
                            LP("done/acceptance-custody/v1", serviceId, hex authRoot), 32)
K_accept_seal = HKDF-SHA256(K_accept_custody, fresh salt[16],
                         LP("done/acceptance-seal/v1"), 32)
AAD = pin bytes || LP("done/acceptance-seal/v1", proposal ID, acceptance public key)
ct = AES-256-GCM(K_accept_seal, fresh nonce[12], Ed25519 seed[32], AAD) || tag[16]
seal = {v:1, publicKey, salt, nonce, ct}
```

Proposal ID is the hex[32] first-authority request digest, not a read-request hash or credential ID.
publicKey is hex[32]; salt/nonce/ct widths match §2. Origin and RP are absent from the first KDF layer
but remain bound in the full pin AAD. Proposal and acceptance public key are AAD fields, not KDF
inputs. Each generated acceptance seed gets a fresh salt and nonce. The derived custody root is held
as a Node secret KeyObject; the owner's temporary derivation buffer is cleared.

The seal API accepts exactly its five fields, with property order irrelevant. Its fixture JSON is an
inspectable representation, not an added canonical-wire requirement. The opener requires v=1 and
equality to the caller-held public key, validates proposal/public/salt/nonce/ct, derives/decrypts, imports
the seed and checks its derived public key before executing a fixed-purpose callback. Valid tags for
the wrong seed, mismatched expected public key or a different proposal do not pass. The surrounding
promotion/delivery owner still establishes which proposal/public key and operation are authorized.

## 4. Provider key formats and lifecycle cleanup

The exact allowed DER exports are:

```
PKCS#8 = hex 302e020100300506032b657004220420 || Ed25519 seed[32]  (48 bytes total)
SPKI   = hex 302a300506032b6570032100         || public key[32]   (44 bytes total)
```

The private segment is the 32-byte seed, not an expanded 64-byte signing secret. Both root and
acceptance creation assert the complete PKCS#8 prefix and total length before taking its suffix.
All public-key extraction in these owners asserts SPKI prefix/length before taking its suffix,
including opening's correspondence checks. Wrong algorithm, header, truncation or extra bytes refuse
instead of relying on suffix extraction. This is a provider-format correctness/portability assertion;
these exports are not shown to be attacker-controlled inputs.

Acceptance creation checks closed custody before key generation. Every operation after receiving the
private export—including format validation, public export, random draws and derivation—is inside its
cleanup block. The exported buffer and any returned derived key are cleared on success or failure.
Root initialization's exported buffer and derived key, and both openers' plaintext/import buffers, have
the same `finally` cleanup discipline. This does not promise erasure of Node/provider/GC copies or a
caller-owned operator key. If export itself throws before returning a buffer, the owner has no buffer
to clear. Close drops the root/acceptance handles; subsequent opening/signing/creation through that
closed owner refuses. It does not delete persisted seals or revoke previously returned signatures.

## 5. Fixed-purpose use and cryptographic limits

The root owner issues only the bootstrap/pending/promotion/activation/slot purposes exposed by its
owner API, with the core performing operation authorization. The acceptance owner checks its seal
before signing group C's accepted/refused response, service event witness, v1 page or v2 page. It has
no general arbitrary-message signing method. Witness scope.request must equal the custody proposal;
other subject/prefix/membership relationships belong to the caller's service state machine. Merely
checking a seal is not evidence that such a state-machine decision was correct.

These AES constructions seal one seed per fresh salt-derived key, using a fresh random nonce. They
do not add persisted invocation counters. Their uniqueness premise depends on nonrepeating randomness
and unrewound/unbranched histories, including restore/clone behavior; this phase does not qualify those
host assumptions or operator secret distribution. No service-key rotation/replacement, root restore,
whole-profile protection, content-key custody or production hosting guarantee follows from these vectors.

## 6. Executable scope and repair evidence

Eight fixed cases publish synthetic seed/public/operator inputs, pin and proposal, DER formats, all
three KDF input/output pairs, both AAD/ciphertexts and the acceptance seal representation. Independent
Node/OpenSSL construction imports no production encoder. Actual initialization and cold opening match
the root row and proof; actual acceptance creation/opening and captured KDF calls match the same bytes.
Each fixed-purpose acceptance signature still matches the retained group C corpus.

Per-input substitutions and encoded-field omissions distinguish primitive authentication from semantic
checks. An authentically encrypted different plaintext is valid AEAD: owner key correspondence, not
the tag alone, must reject the wrong seed. Empty HKDF salt and a salt containing one zero byte happen to yield the
same HMAC-padded key; the isolating test uses a nonzero salt, not an invalid claim that every spelling
of an absent/zero salt yields a different derived key. Two hundred shrinking-enabled histories generate
independent keys/scopes/seals, cold-open real disposable SQLite roots, and reject authentic wrong-seed
acceptance payloads and changed proposals.

The initial tests reproduced unchecked PKCS#8 OIDs in both creators, generation after close and an
uncleared exported acceptance seed when RNG failed before derivation. Repairs preserve valid bytes.
Sixteen directed export mutations, failure cleanup and close checks exercise the new guards. Eight
production-source omission controls remove expected-pin, root/acceptance correspondence, proposal AAD,
private/public export assertions, cleanup or early-close guards in disposable copies and recreate their
specific bad outcomes. Wrong-key output is not falsely reported as passing the client verifier. These
are bounded owner tests, not complete security or cryptographic-library qualification. Other D and
inherited Local records stay explicitly open; group D1 alone cannot close F-05/F-06.
