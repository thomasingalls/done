# Private v2 service reader and publisher resolution

This phase adds `PrivateAuthority.readInbound(core, exactRequestBytes)` and the private binary
`POST /account/delivery/read-v2` route. It implements the existing
[v2 framing](./account-inbound-verification.md) without changing the v1 spool read route or database
schema. The private server is a disposable development adapter; the personal app and relay do not mount it.

## Held authority and separate roles

The service reconstructs admission from the active account, completed registration and recovery,
original candidate/certification, root-signed first epoch and receipt, configured authority pin and
original acceptance seal. Both reader and publisher are looked up by their own requested ID in that
verified membership. The reader signs the entire v2 request, including the selected publisher. The
publisher must own the witnessed ledger being scanned. Neither an operator token nor a request installs
membership, a signing key or a baseline.

Only the creating member of epoch 1, generation 1 is supported. Accordingly, the supported reader and
publisher resolve to the same member today, through separate lookups. Foreign readers and publishers
are refused independently. New-member enrollment and multiple publisher ledgers require another
authenticated transition and schema scope; this phase does not infer them from the more expressive wire.

**Correction to review F-11 and its initial response.** `credentials.id` identifies a WebAuthn passkey;
`certification.members[0].id` identifies a workspace signing credential. They intentionally differ.
The review's suggested equality would refuse valid accounts. The existing admission parser already
requires candidate signer and certified member identity/wrapping-key agreement, followed by verification
of the creating signatures and signed receipt. Those checks remain in place and have a mismatch negative.

The actual service improvement binds the confirmed passkey row to `attempts.result` from its completed
registration: successful credential confirmation, attempt ID, account ID and passkey ID must agree. This
shared authority check also strengthens submission and v1 readback. It does not claim to detect coordinated
database rewriting or replace the separately planned fresh assertion at initial service activation.
The [historical review](./review/implementation/af8941e-96a2040.md) remains unchanged; this is its later
disposition.

## Read and signing boundary

The service copies the bounded request before any crypto await, then checks the closed v2 parser,
service/origin/workspace/lineage/head/epoch, current roles, reader signature and expiry. Requests have the
existing 60-second maximum remaining lifetime. There is no persistent read nonce or cursor write.

Every original decision is reverified, including publisher signatures, acceptance/refusal proofs, issued
parents, contiguous positions and the signed completeness witness. Pages contain exact original accepted
envelopes and proofs, in order. The caller's cursor cannot exceed the authenticated prefix. The existing
eight-entry/10 MiB page limits apply; size pressure ends a nonempty page without skipping the next position.
A page that cannot fit its next entry is refused. The current receive owner still requests one entry and
enforces its narrower local batch bounds independently.

Asynchronous verification holds no SQLite transaction. Immediately before signing, `BEGIN IMMEDIATE`
rereads the complete authority/ledger snapshot and compares it to the verified snapshot. Concurrent changes
cause fresh verification, bounded to four attempts. The short synchronous signing section holds writer
exclusion so another service process cannot commit changed membership or ledger state during signing.
The acceptance owner signs only the exact v2 page purpose; expiry and custody are checked on both sides of
signing, and bytes return after transaction completion. Reads create no ledger, key, counter, nonce or
cursor records. A lost reply or process death is retried against fresh current authority.

The HTTP route retains the private operator/origin/host/content-type gates, 4096-byte request bound,
`no-store`, bounded failure responses and separate v1 dispatch. Passing those gates alone never yields a
page. No content decryption happens in the service, and an acceptance does not attest to plaintext validity.

## Validation and remaining boundaries

`pnpm account:service-inbound` records the tested source inventory, command outcomes, generated histories,
mutation evidence and native HTTP result. Independent Node framing checks signed request/page bytes and
exact original ciphertext/proofs. Generated histories exercise append, bounded read, replay, restart,
foreign reader/publisher and ledger corruption. Actual source omissions must produce a positively verified
prohibited page against a refusing baseline; timeout, import failure and harness errors are not detections.
Service processes are killed after verification and after signing; restart must return the original
accepted bytes without a read-side database change.

The disposable browser case uses the actual admitted self-stream, submits persisted v8 envelopes, then
consumes service-issued v2 pages under the existing owned receiver and cold-replays them. This tests the
service/receiver byte boundary; it does not install another device, transfer keys, compose the v9 sender,
or establish production multi-member enrollment. The browser receives through a test-owned HTTP call;
the next bounded phase is owned receive transport/reconnect and v9 outbound composition.

All real-Account gates recorded in the checkpoint remain open, including fresh activation assertions,
protocol capacity corrections, exact Account construction registration, recovery alignment, invocation
accounting across power loss and production provisioning/restore. Witnesses do not detect coordinated
rewind of both data and witness. No whole-protocol debt is paid by this phase.

## 2026-10-11 integrity-policy update

The [current service verified-tip policy](./account-service-delivery.md#current-verified-tip-integrity-policy-2026-10-11)
supersedes this phase record's full-history reread on every request. The selected entry and its
signed predecessor are read and verified afresh, witness/count and authority remain fenced, and
new suffixes are verified before signing a page. Old unread bytes follow the documented off-path
audit policy. No paging, scope, expiry, membership or wire-size limit changes.
