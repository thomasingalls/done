# Private service acceptance and permanent refusal decisions

This bounded phase follows [the v8 delivery owner](./account-delivery.md). It adds the in-process
`PrivateAuthority.decideSubmission(core, { workspaceId, bytes })` operation, with service-owned membership,
fixed-purpose acceptance signing and durable ciphertext/response retention. There is no new HTTP route,
relay dispatch loop, inbound editor delivery, public Account UI or personal Account provisioning.

## Authority and request classification

The caller supplies an exact bounded signed submission and a workspace route, never a verification key,
credential membership, accepted head or decision setter. The service takes a coherent SQLite snapshot of
the admitted promotion, active account, confirmed passkey/recovery, completed registration and decision
ledger. It verifies the original creating-device certification and recovery-origin endorsement against
the retained confirmed draft; rechecks the root-signed offer, first epoch and receipt against its configured
pin; binds account/workspace/lineage/request digest; and opens the original acceptance-key seal. It resolves
the only certified signing member from that receipt. No replacement key is minted on failure.

The first private epoch remains immutable: epoch 1 certifies generation 1 and one creating credential.
This is not a general lineage/rotation verifier. Submission signatures bind the exact v2 envelope, lineage
and refusal parent; envelope signatures and ciphertext digest are verified under that certified member.
The service does not possess a content key and does not attest to plaintext validity or truthful actor tags.

Unsigned `unknown` results grant no re-mint authority:

- Malformed framing, invalid signatures, foreign route/credential/lineage and unsupported versions fail
  without a decision write. Unknown epochs remain unsupported; their policy is not guessed.
- An otherwise verified position beyond the next contiguous position remains out of order. It does not
  permanently close a gap. Storage/authority failure, changing state or bounded retry exhaustion is unknown.
- A supplied parent must verify under current authority **and** resolve by refusal ID in the service's
  own earlier issued ledger for that position. A valid signature alone does not establish issuance.
- After closure, another zero-parent attempt is unknown (`parent-required`). Repeated attempts may share
  an issued parent; there is no one-successor cap. A parent from another position is never sufficient.

The one implemented permanent refusal policy is `epoch-generation-mismatch`: a validly signed envelope
references the known epoch but declares a generation different from that epoch's immutable certified
generation. The service closes that exact `(workspace, credential, position, digest, envelope epoch)`.
Even a later validly signed restamping of that ciphertext cannot reopen the subject. Future epochs and
transient failures are not this policy. Conforming v8 clients currently emit the certified generation;
these refusals primarily exercise the malformed signed request boundary in this first-epoch composition.

## Immutable outcomes and retry

At a new next position, a policy-valid verified request is accepted; an epoch-generation mismatch is
permanently refused. The service reconstructs the accepted prefix from its retained decisions, calculates
row 5's next link, and signs the existing response framing without changing the selected head/refusal
messages. Heads here always have `final=false`; finalization needs another owner.

One subject has one immutable stored response. A retry of a closed subject returns its original refusal,
including after another digest is accepted at that position. A request at an already accepted position
returns that position's original accepted head. A competing digest therefore obtains evidence of the
winner, never a second acceptance or a replacement ciphertext. Exactly one accepted row per position is
also enforced by a partial unique index. The service records each exact successful submission and signed
response; there is no overwrite, expiry, pruning or cleanup transition in this phase.

The service can validate a successor wrapper against its own issued refusal and current certified
route. This adds no client successor-minting capability. The current v8 owner still halts on closure;
client successor preparation, changed epoch/generation authority and fresh network encryption grants
remain separate work. The first-epoch test can correct an invalid generation using an issued parent
without pretending that general lineage advancement exists.

## Transactions and reader fence

Account schema 4 adds `delivery_decisions` and nullable `promotions.delivery_witness`. Fresh databases
create v4. V3 requires explicit offline `upgradeFromV3`; existing explicit v1/v2 upgrades also reach v4.
The additive schema change commits with the version marker in the constructor's existing transaction.
Prior v3 readers reject v4. Test fixtures that manufacture old schemas remove the new table as well;
no real account database was upgraded during this work.

Decision rows contain account ID, contiguous event ordinal, position, digest, envelope epoch, kind,
exact submission BLOB and exact response BLOB. The sole credential/workspace is resolved through the
bound promotion. The primary key fixes one response per subject, while the accepted-position index fixes
one winner. Any future multi-member schema must explicitly expand these boundaries.

Async cryptographic verification holds no SQLite transaction. Immediately before commit, `BEGIN IMMEDIATE`
rereads and compares the entire authority and ledger snapshot, including exact BLOBs. A concurrent winner
causes a fresh verification pass (at most four passes); it cannot be overwritten by a previously computed
answer. Acceptance custody is checked again after async work. Fixed-purpose synchronous signing then
constructs the new response and witness; row insertion and witness replacement commit together under
`WAL` and `synchronous=FULL`. Bytes return only after `COMMIT`. A thrown/lost post-commit reply is unknown;
retry finds and returns the stored response. No database lock is held across an await or signature request.

## Completeness witness

A null witness is legal only with no decision rows. Every appended row extends a SHA-256 chain:

```
H_n = SHA256(LP("done/service-delivery-chain/v1", H_(n-1), String(n),
               SHA256(exactSubmission), SHA256(exactResponse)))
H_0 = 32 zero bytes represented as lowercase hex
```

All hashes in LP fields are lowercase hex. The stored ordered JSON witness is `{events, hash, signature}`.
Its separate acceptance-key signature authenticates:

```
LP("done/service-delivery-witness/v1", workspace, credential, lineage, authorityHead,
   admissionRequestDigest, String(events), hash)
```

The custody component exposes only fixed-purpose response and witness signing. The seal still binds its
original service pin, admission request digest and public key. Raw signing seeds are not persisted outside
that seal, returned to callers or reported in evidence.

Each census validates contiguous ordinals, all original device signatures and response signatures,
subject/route fields, policy, issued parents, contiguous acceptance and permanent closures, then checks
the signed event count and chain hash. Missing final/all rows against retained witness, altered columns,
changed ciphertext/proofs, tampered witness or unreadable custody refuse without repair or new signatures.
This does not detect coordinated rollback of both the authenticated witness and its matching ledger, nor
restoration of the entire account/authority state. Unrewound, unbranched service history remains required.
The null genesis sentinel is not evidence against such coordinated rollback. Full scans and indefinite
retention deliberately leave backlog performance and pruning to later work.

## Evidence and following boundary

Independent Node/OpenSSL fixtures construct and verify envelope/wrapper/response bytes; 80 generated
histories model permanent subjects, contiguous accepted positions and exact retry across unknown commits.
Separate service processes test competition and SIGKILL before/after accepted and refused commits. The
actual v8 browser owner consumes service-issued heads through a test bridge, retaining a pending submission
across a lost reply and recording exact recovered acceptance. This is not a shipped relay transport.

Actual-module controls remove commit durability, generation policy, fresh membership comparison and
completeness verification. Their bad outcomes include a signature without a persisted decision and
acceptance of a previously closed subject after a deleted ledger row. Old-reader rejection uses the
committed schema-3 source. Shared service and codec regressions accompany the result.

Next is a private authenticated submission transport and bounded ciphertext/proof readback, followed by
one-device delivery/reconnect integration. Two-device enrollment/adoption, inbound replay authorization,
lineage advancement, revocation, rotation, finalization, pruning, production authority/restore, supported
platform coverage and independent review remain separate. Personal preview/relay stay stopped and the
verified Local release and predecessor build remain intact.
