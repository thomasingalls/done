# Private service acceptance and permanent refusal decisions

Current exact byte formats and their authority limits are pinned in the
[group C transport contract](./account-crypto/transport.md). This document retains its phase context.

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

New decisions require an envelope wire of at most 512 KiB, exactly matching the current receiver.
This check runs after authentication and resolution of existing decisions, before any new acceptance
or refusal is issued. Oversize returns unsigned `unknown: envelope-size` without changing the ledger
or witness. It is a terminal retry diagnostic, not a signed refusal or permission to re-mint.
Historical decoders, witnessed census, bounded read pages and exact decision retries keep their
original limits. A historical oversized accepted position remains readable by the service but cannot
be consumed by today's receiver; see [R-01's recovery limits](./review/implementation/service-receiver-bounds.md).

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

## Current verified-tip integrity policy (2026-10-11)

The operator has approved the [verified-tip design and measurement protocol](./performance-experiments/2026-10-11-service-verified-tips/plan.md).
It supersedes the per-request full-census/fresh-BLOB comparison policy above for the current
service delivery, discovery and history-read paths. First use/invalidation still performs a full verification. Warm
operations compare the stored witness and indexed row count, verify new suffixes and freshly
verify each served entry. New signatures extend only authenticated cached chain state.

External-connection writes and authority changes invalidate reuse. Full audits run off the request
path after 256 new rows and on backup cycles. Mismatches refuse the affected publisher with fixed
`ledger-integrity`, signal the operator and attempt no repair. Cache lifetime and asynchronous
audits must not resurrect invalidated evidence. The row-count query may scan an index; it does
not load historical ciphertext and is not a claim of constant-time SQLite counting.

Unread old-byte changes that preserve count/witness and evade SQLite change tracking wait for an
audit. Consequently the earlier blanket statement that altered rows get no new signatures becomes:
**detected** alteration gets no new signatures; undetected alteration cannot change the verified
prefix used to sign an extension. Coordinated rollback remains outside this mechanism. This
implementation is covered by the [focused tests and measurements](./performance-experiments/2026-10-11-service-verified-tips/README.md).

The owner retains at most 128 publisher tips with a 16 MiB accounting ceiling. Each contains only
chain scalars, witness, service pin and a SHA-256 digest of the exact authority snapshot; no old
submission, response, checkpoint content or process-local membership object is retained. Eviction
requires a full census at next use. An unfinished refusal tail and historical decision retries use
the full verifier, preserving issued-parent/closure checks without retaining unbounded maps.

Audits use one read-only SQLite worker snapshot at a time. The worker explicitly enables the
same membership readers and reconstructs verified public authority in its own realm. Neither
signing issuer nor operator wrapping key is supplied. Completion checks current authority in a
short read transaction; stale results cannot reinstate evidence. Backup ticks request/coalesce
audits independently of upload success; they do not certify that each uploaded snapshot is free
of latent semantic corruption.

Quarantine survives cache invalidation and byte restoration until owner restart; the new owner
must perform a full census. No automatic repair occurs. Other lifecycle paths keep their complete
census and honor the same quarantine. Operator diagnostics always use `ledger-integrity`; ordinary
delivery and history-read responses use that unsigned reason. Older closed lifecycle refusal
envelopes retain their generic unavailable/storage refusal. No refusal grants client remint authority.

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
