# Private enrollment-preparation bytes

2026-09-16. Current implementation contract for [backend phase one](../account-enrollment-prep.md).
These objects prepare a request. They do not establish an authorization successor, certified recipient,
slot binding, network session or content-key delivery. The four domains are inventoried separately from
first promotion. Their full authority-map/published-vector qualification remains open; passing the
focused product tests does not extend the historical crypto-closure claim.

## 1. Closed encodings

All objects reject unknown or missing fields. Parsers reconstruct the property order below, recursively.
`J(x)` is UTF-8 `JSON.stringify` of that parsed object. `LP` is the existing concatenation of unsigned
16-bit big-endian byte lengths and UTF-8 fields. Hashes are SHA-256; hex strings are lowercase with exact
lengths. IDs for accounts, attempts and receipts are canonical unpadded base64url of 32 bytes. Retry
capabilities use the same encoding but are secrets; only their SHA-256 hashes enter service storage.

| Object | Ordered fields |
| --- | --- |
| Candidate | `v, workspaceId, lineageId, head, credentialId, sPub, wPub` |
| Context | `v, pin, accountId, attemptId, candidate, epoch, certifiedSetDigest, recoveryStateDigest, passkeyId, nonce, expiresAt` |
| Challenge | `v, kind, context, signature` |
| Receipt | `v, kind, context, receiptId, preparedAt, expiresAt, assertionHash, possessionHash, signature` |

Versions are integer `1`. Candidate workspace/device credential IDs are 16-byte hex; lineage, head,
public keys and digests are 32-byte hex. `sPub` is Ed25519; `wPub` is X25519. A valid possession proof is
required for `sPub`; this phase neither delivers to nor proves installation of `wPub`. The pin uses the
existing closed `{v,serviceId,origin,rpId,authRoot}` encoding. Passkey IDs decode to 1–1023 bytes. They
are separate from candidate workspace credential IDs. This first version accepts only epoch `1`.

`certifiedSetDigest` is SHA-256 of `J` of the verified first-epoch certification, including its signature;
it is not an authorization roster or a newly certified set. `recoveryStateDigest` is the digest already
bound by that certification. The service derives both from its verified promotion records, never from
request fields. The candidate's public locator/head selects a target but does not authenticate it.

Timestamps are nonnegative safe-integer Unix milliseconds with room to add 600,000. A challenge expires
600,000 ms after creation; a receipt expires 600,000 ms after preparation. Preparation must occur before
challenge expiry. The deadline comparison is `now >= expiresAt`. These are private ceremony-availability
policies, not writer-permit lifetimes. Expired authorization is never renewed by reading a receipt.

## 2. Purposes and authority

| Domain | Exact message or challenge | Authority |
| --- | --- | --- |
| `done/enrollment-preparation-challenge/v1` | `LP(domain, J(context))` | Ed25519 under independently pinned service `K_auth` |
| `done/enrollment-preparation-assertion/v1` | `SHA256(LP(domain, J(context)))`, represented as base64url in WebAuthn options | Fresh assertion under the selected account's retained, confirmed passkey; configured origin/RP and UP/UV checks |
| `done/enrollment-preparation-possession/v1` | `LP(domain, J(context))` | Ed25519 under the exact candidate `sPub`; proof of possession only |
| `done/enrollment-preparation-receipt/v1` | `LP(domain, J(receipt without signature))` | Ed25519 under pinned service `K_auth`; historical evidence only |

Ed25519 signatures are 64-byte hex. The receipt hashes the canonical assertion response using the
existing recursively key-sorted JSON encoding, preserving the original base64url authenticator/client
bytes. `possessionHash` hashes the decoded 64 signature bytes. The private row's `proof_hash` hashes the
UTF-8 concatenation `assertionHash + possessionHash`; it binds exact finish retries to both proofs.
This hash is a local equality check, not a fifth grant or signature domain.

The service root has two fixed-purpose signing methods, invoked only through the preparation owner.
There is no HTTP endpoint for signing arbitrary contexts. Client challenge verification checks the
expected pin and exact candidate before invoking a passkey callback. Receipt verification authenticates
historical bytes; the unsigned returned stage cannot grant membership or establish current authority.

## 3. Private API and retained state

All routes retain the existing loopback, exact Host/Origin, operator bearer, JSON and `no-store` gates.
The bearer is only the private adapter gate; it cannot replace either proof.

| POST route under `/account/enrollment/` | Closed request |
| --- | --- |
| `begin` | `{retryKey, candidate}` |
| `finish` | `{retryKey, attemptId, response, possession}` |
| `resume` / `cancel` | `{retryKey}` |

Success is `{ok:true, stage, challenge, receipt}`. Stage is `challenge`, `prepared`, `admitted`, `cancelled`,
`expired` or `stale`; receipt is null until successful preparation, and then retained through terminal
states. A `challenge` stage cannot carry a receipt; `prepared` and `admitted` require one; both embedded contexts
must agree. Refusal is `{ok:false, refusal}` with the closed vocabulary in `enrollment.ts`.

Request bodies, including direct core calls, are at most 131,072 bytes. Results are at most 16,384 bytes.
Schema 6 adds `enrollment_preparations` and a unique workspace/candidate index for successfully prepared
rows. New files create it; an existing schema-5 file requires explicit `upgradeFromV5`. Existing older
explicit upgrade paths remain unchanged in purpose. No implicit repair, rekey or authority conversion
is performed. The private additive upgrade creates no preparation history.

The subsequent [successor owner](./admission-successor.md#5-durable-service-consumption-and-delivery-chunk-b)
uses schema 7 and an explicit `upgradeFromV6`. It preserves live genesis preparation tokens across that
upgrade. Its unique successor record consumes preparation; post-consumption views report `admitted`
without changing the immutable preparation receipt or letting cancellation revoke the successor.

There are at most **64 retained requests per workspace and 4,096 globally**, including terminal rows.
There is no automatic pruning in this phase; capacity returns a typed refusal. These finite bounds are
not public-service rate limiting. The operator-only adapter must remain private. Unauthenticated
challenges take bounded request capacity but never reserve a candidate identity. On successful
preparation, the exact candidate ID is reserved within that workspace, even after cancellation or
expiry. Retrying after terminal preparation uses a fresh candidate ID and assertion. This is a private
preparation tombstone, not the later SAS-mismatch spending mechanism.

## 4. Commit and recovery boundary

The preparation owner and delivery share the original authority snapshot/verifier. The enrollment
comparison token additionally includes the account passkey's actual retained key bytes and state. It
excludes ciphertext decisions, the delivery witness and observed authenticator counters. Thus ordinary
sync and independent sign-in observations do not stale the request. A changed authority/key does.

Read the challenge, authority and credential coherently; verify outside the SQLite transaction; then
reread under `BEGIN IMMEDIATE`. Challenge consumption, receipt, candidate reservation and observed
passkey counter commit together under the existing WAL/FULL policy. No successful result escapes
before commit. A lost reply recovers the retained result; changed proof bytes conflict. Cancellation
may invalidate prepared eligibility while preserving the immutable receipt. Terminal stages never
revert. First-epoch damage or unsupported future states fail closed; coordinated service backup rollback
and filesystem power-loss guarantees are outside this evidence.

Tests use real Ed25519/ES256 WebAuthn-shaped assertions, independent Node encoding/signature checks,
generated histories, two service processes, SIGKILL on both sides of begin/finish/cancel commits,
HTTP boundary checks and effective possession/current-authority omissions. They show a candidate
cannot publish or read and the creating device still can. They do not perform a new-device content
ceremony, real successor transition or production provisioning.
