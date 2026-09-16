# Enrollment ceremony: selected primitive bytes

2026-09-16. **Chunk A implemented; qualification open.**
[Phase definition](../account-content-approval-prep.md);
[selected construction](../selections/row-11-enrollment-ceremony.md).

## 1. Scope and authority

`account-protocol/ceremony.ts` implements the unchanged row-11 commitments, transcript, SAS and
wrap-info bytes. It parses and copies bounded public inputs; it does not resolve authority, own a
durable attempt, establish message order, perform a human comparison or release a key. Opening
both commitments after receiving all values cannot prove they preceded either reveal.

The later owner must derive context from its verified current authority and original certified
approver, hold the exact peer commitments before disclosure, enforce the one-comparison budget
and apply the competing-epoch restart policy. A primitive result is never a recipient grant.

## 2. Exact bytes

Length prefixes are two-byte big-endian byte lengths followed by ASCII bytes. Hashes, public keys
and nonces are canonical lowercase hex for 32 bytes. No decoding of hex precedes length-prefixing:
the selected formulas bind their 64-character representation. Epochs use positive safe-integer
decimal with no exponent, sign or leading zero. Fixed fields are parsed before encoding.

| Function/domain | Ordered fields after the domain |
| --- | --- |
| `ceremonyCommitment` / `done/enroll-commit/v1` | Role (`existing` or `new`), hex nonce; SHA-256 output |
| `ceremonyTranscriptBytes` / `done/enroll/v1` | Workspace ID, epoch, head, existing credential ID, new credential ID, new wrapping key, new signing key, recovery-state digest, existing nonce, new nonce |
| SAS / `done/enroll-sas/v1` | HKDF-SHA256: input key material is the complete transcript, empty salt, info is LP(domain), output five bytes; each byte masked with 31 indexes `0123456789ABCDEFGHJKMNPQRSTVWXYZ` |
| `ceremonyWrapInfo` / `done/enroll-wrap/v1` | Hex SHA-256 of the complete transcript; returned as HPKE info bytes |

The closed transcript object has ten camel-case fields in that same order. IDs are 1–128 ASCII
letters/digits/underscore/hyphen, so published historical identifiers and current hex identities
both encode unchanged. Existing/new credential IDs must differ. The primitive accepts positive
safe epochs to reproduce the epoch-9 historical vector; this does not broaden the private runtime's
epoch-2 ceremony eligibility. A closed two-field commitment object holds `existing` and `new` hashes.
Scalar bounds keep the largest encoded transcript below 1 KiB; HTTP ingress bounds remain separate.

`deriveCeremonyOpening` captures both objects before awaiting crypto, verifies each role's nonce
opening, then returns frozen strings `{transcriptHash, sas, wrapInfo}`. `wrapInfo` is hex of the exact
info bytes; `ceremonyWrapInfo` separately returns a fresh byte array. No mutable input is reread after
the first await. No caller-supplied domain or algorithm selects another protocol.

## 3. Code input

`normalizeCeremonyCode` accepts at most 64 ASCII input characters, strips ASCII whitespace/hyphens,
uppercases, folds O to 0 and I/L to 1, and requires exactly five alphabet symbols. U, non-ASCII case
folding tricks, invisible Unicode separators and other symbols refuse. This reuses row 14's alphabet
and confusable rules at five symbols; it does not change the recovery-code parser. Valid syntax has
no relation to the expected code. The owner must persist its single comparison outcome before
publishing the result or authorizing release; there is no comparison API in this chunk.

## 4. Focused evidence and remaining obligations

The existing `test/vectors/enrollment-ceremony.json` remains byte-identical. Tests reconstruct its
recovery digest and all honest bytes with independent Node SHA-256/HKDF/framing, and exercise all
15 named negative cases. Fixed substitutions differ in SAS; the generated property deliberately
does not claim a 25-bit string is collision-free. One hundred generated contexts (seed 16091607)
agree with Node and retain every transcript field. Inputs are also mutated during a suspended
digest to check capture before await.

Twelve runtime omission controls show actual forbidden outcomes: each of ten omitted transcript
fields makes a changed context derive identical output; dropping the role accepts an echoed
commitment; dropping opening verification derives a SAS from an uncommitted nonce. These test
primitive predicates, not durable approval, chronology, key release or browser custody.

Authenticated exchange framing, a transcript-aware state model, service/client durable state,
native crash/race checks and two private owner integration remain chunks B–D. Delivery and
certification are later gates. This group remains open for full authority-map/construction
qualification. No release campaign evidence or frozen inventory is refreshed by these checks.
