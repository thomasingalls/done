# Enrollment ceremony: primitives and authenticated exchange

2026-09-16. **Chunks A/B implemented; durable owners and qualification open.**
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

Chunk B adds authenticated framing and an ordering model below. Service/client durable state,
native crash/race checks and two private owner integration remain C/D. Delivery and certification
are later gates. This group remains open for full authority-map/construction qualification.
No release campaign evidence or frozen inventory is refreshed by these checks.

## 5. Exchange context and trust inputs

`account-protocol/ceremonyExchange.ts` accepts only the existing private epoch-2 admission. The
context's fixed JSON order is `v, pin, accountId, principalId, workspaceId, lineageId, epoch, head,
certifiedSetDigest, recoveryStateDigest, existing, candidate, attemptId, createdAt, expiresAt`.
Pin order is the existing authority parser's order. Each participant is `{id,wPub,sPub}`. IDs here
use the current private protocol's 16-byte hex credentials/workspace/principal, 32-byte lineage and
canonical account ID; keys/digests/attempt ID are 32-byte lowercase hex. Version is 1, epoch is 2.

The existing owner chooses a fresh random 32-byte attempt ID and its start time once. Both signed
commitments bind the same context. The pending owner checks proposed context against its held
admission and local keys, then retains its own exact commitment. Both signed commitments must
verify before disclosure; service stage labels do not fix an attempt. `expiresAt = createdAt +
600000` exactly. Timestamps are nonnegative safe integers
and use decimal JSON numbers; overflow, future start and the expiry instant refuse. There is no
deadline renewal or tolerance that silently creates another attempt. This ten-minute policy starts
at the content ceremony, independent of the already-consumed preparation receipt's old deadline.

`verifyCeremonyContext` verifies the original admission and signed successor against an independently
held epoch-2 anchor, derives the approver's key from the original **certified** object, derives the
candidate from the admitted preparation, and checks the caller's locally owned identity/key tuple.
The original certified recovery digest is retained. New roster keys, reply-supplied roots and account
proofs cannot replace these inputs. The local tuple is a caller trust input, not a new proof of private
key custody. Both roles use the same context; the selected local role is retained separately.

The result is deeply frozen and privately WeakSet-branded. A JSON copy is no authority handle.
Cold owners must reverify their authenticated saved records; a service-fetched context cannot
replace an already-fixed local attempt. Verification supplies historical cryptographic agreement
with the caller's held anchor, not a fresh online service eligibility check. C/D must compare the
current head, attempt, cancellation and deadline again at each durable transition and before send.

## 6. Signed exchange bytes and bounds

Define `M(label,body) = LP(label) || LP(hex SHA256(UTF8(ordered JSON(body))))`, using the existing
private ordered-JSON convention. Closed parsers reconstruct field order recursively; reordered JSON
properties are the same canonical message. All `done/` labels below are fixed, not caller inputs.

| Message | Ordered body | Authentication |
| --- | --- | --- |
| Context identity | Context from §5 | `SHA256(M("done/enrollment-ceremony-context/v1", context))` |
| Commitment | `v, kind:"ceremony-commitment", context, role, commitment` | Ed25519 over `M("done/enrollment-ceremony-commitment/v1", body)` using that role's exact device key |
| Reveal | `v, kind:"ceremony-reveal", contextHash, role, existingCommitHash, newCommitHash, nonce` | Ed25519 over `M("done/enrollment-ceremony-reveal/v1", body)` using that role's exact device key |

Commitment and reveal objects append a final `signature` field, 64-byte hex. `role` is `existing`
or `new`. The commitment is row 11's role-bound nonce commitment; each reveal's nonce is 32-byte
hex. Each commit hash is SHA256 of the **complete canonical signed commitment JSON**, including
its signature. Reveal verification requires both exact hashes, exact context identity and role,
the device signature and a matching nonce opening. Root signatures cannot substitute for device
signatures. Context, commitment and reveal JSON limits are respectively 8192, 9216 and 2048 UTF-8
bytes; future HTTP adapters must enforce corresponding ingress bounds before JSON materialization.

`verifyCeremonyPair` requires both independently verified commitments under one verified context.
It returns a frozen, privately branded pair. `prepareCeremonyReveal` requires that pair and the
local nonce opening; it returns a proposal with a zero signature placeholder to be replaced by the
owner's device signature. The placeholder verifies as no valid signature. Pure encoders themselves
sign nothing and grant nothing. Neither a pair handle nor a reveal proposal proves a storage commit.

`deriveCeremonyExchange` authenticates both signed reveals and derives the **unchanged** row-11
transcript/SAS/wrap info from their openings. Attempt ID, deadline and expanded scope are fixed in
the signed outer exchange; the historical SAS format is unchanged. Owners must not regenerate
nonces or vary outer attempts for the same credential. Exact retries return the same retained
canonical messages; neither these helpers nor a successful derivation reset a comparison budget.

## 7. Ordering evidence and what remains

The specification model uses actual runtime verifiers and independent Node signatures. It separates
preparation, atomic local saves, publication, verified pair retention and nonce reveal, then clears
volatile state at each crash. A reveal is published only from a saved signed pair and saved reveal;
exact resumption revalidates those bytes. Competing head, expiry and abandonment terminally stop
the attempt while retaining its record. Unsigned relay errors do not erase it, and a second signed
peer commitment cannot replace its first retained commitment. There is no SAS input/comparison or
certification transition in this model.

Both roles complete after a modeled crash at every save/exchange boundary. Eighty generated histories
(seed 16091609) interleave real progress with disorder/crashes and competing-head termination;
the retained run reaches completion in 19 histories, stops 61 and reaches disclosure in 30.
Sixty independently generated attempt/nonces cases (seed 16091608) agree on signed framing and SAS.
Mutation controls demonstrate forged-peer commitment acceptance, cross-attempt transplantation and
stale-pair reveal acceptance when their runtime guards are omitted. A separate **model** control
discloses a nonce before pair persistence when that modeled storage predicate is removed.

Atomic saves, non-rollbackable retained attempt choice and per-credential uniqueness are still
model assumptions. C must establish them with the real factor-protected local owner, service state,
cross-tab exclusion, transaction races, expiry/cancellation during crypto and native crashes.
The model neither proves these native properties nor claims the pending device is a content reader.
