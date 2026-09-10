# Private account ceremony core

This is sequencing §3.5 item 1's service boundary, built after the [account/sync prep](./account-sync-prep.md).
The personal application and relay do not mount it. `account-service/` imports no editor, custody, journal,
index or content code. Ordinary account creation is not enabled. The personal preview is stopped at the
author's request; test listeners have their own temporary ports and data directories.

## Authority and durable states

`begin(register)` creates a service-owned random pending account and attempt. A verified registration
stages one globally unique credential; a fresh `confirm-registration` assertion must prove possession
before the credential becomes confirmed. The account remains **pending**. A separate discoverable
`authenticate` ceremony can produce an account-proof receipt only for an already active account and a
confirmed credential. Tests seed active accounts directly in disposable SQLite databases; no activation
method or endpoint exists in the service.

Every result is either a typed refusal, the next ceremony, or an immutable completion receipt. An
`account-proof` receipt records a past verification. It is **not a session, bearer token, relay grant,
lineage admission, slot binding or content-key delivery**. Reading a receipt again does not renew or
revalidate account authority. Future session/operation owners must bind and consume their own authorization
under current account state; they cannot treat possession of this historical receipt as current login.

The core generates no service signing key. The first lineage/binding issuer must own explicit bootstrap,
durable private-key custody, pinned public authority and epoch selection. Its public key must arrive via
an independently authenticated authority path before a slot binding can be used. There is no self-trust
of a key delivered beside its signature here. Rechecking the offline slot verifier against issued bindings
belongs to that later issuer phase; this phase creates no real binding or authority epoch.

## Wire and replay contract (version 1)

The private adapter accepts only JSON POSTs under `/account/`, an exact localhost Host and Origin, and a
separate random 32-byte adapter bearer secret. It binds loopback only, emits no CORS permission, caches
nothing and serves only an inert disposable harness page. Bodies are capped at 128 KiB, with bounded
header/request timeouts. The adapter secret is supplied by the test owner, never embedded in the page or
written to the account database. It is not the user's account credential.

| Endpoint | Request fields | Result |
| --- | --- | --- |
| `begin` | `operation: register | authenticate`, `retryKey` | Existing progress or a committed new ceremony |
| `finish` | `retryKey`, `ceremonyId`, `operation: register | confirm-registration | authenticate`, `response` | Next ceremony, immutable receipt or refusal |
| `resume` | `retryKey` | Current committed progress or terminal refusal |
| `cancel` | `retryKey` | Terminal cancellation; completed attempts refuse cancellation |

Unknown request fields and operation values refuse. No endpoint accepts an account ID, Local principal,
workspace ID, promotion target, client challenge, replacement key or service authority as a selector.
Pending target attachment is a later authenticated owner operation, not an untrusted field added to this
API. The calling owner must save a CSPRNG-generated 32-byte `retryKey` before beginning. Its SHA-256 hash
is the database lookup key; knowledge of a public attempt ID does not permit resumption or cancellation.
The retry key is a sensitive attempt capability but grants no content or account session.

Service-generated account, attempt, ceremony and receipt IDs are independent random 32-byte values.
All binary wire strings are canonical unpadded base64url. Challenges are SHA-256 over fixed-order
uint16-big-endian-length-prefixed UTF-8 fields:

```
LP("done/account/" + operation + "/v1") || LP(attemptId) || LP(accountId-or-empty)
  || LP(rpId) || LP(origin) || LP(base64url(fresh-service-nonce[32]))
```

Registration and confirmation bind the pending account; discoverable sign-in selects its account only
from the retained credential record and matching `userHandle`. Its challenge binds the sign-in attempt,
with an empty account field. No slot-unlock or recovery-replacement challenge can satisfy this boundary.

Each ceremony expires ten minutes after its durable creation, checked again at commit after crypto.
This is an explicit ceremony availability policy, additional to purpose binding and single use. Expiry
does not affect a storage writer permit; the core owns none. Expired or cancelled attempts cannot restart;
the owner begins with a fresh retry key. Invalid proofs do not consume a pending ceremony. A completed
ceremony retains the canonical JSON proof hash and result: an identical retry returns that result, while
changed bound bytes refuse. JSON member order is normalized for this digest, but the base64url-encoded
client-data and authenticator bytes are never reconstructed for signature verification. Completed
receipts remain readable after their ceremony deadline. Pending attempts, receipts and credential-ID
tombstones have no pruning policy in this slice.

## Verification choice and limits

`@simplewebauthn/server` is pinned to **14.0.0**, after reviewing its registration, assertion and
authenticator-data parsing paths. 14.0.1 and one of its required dependencies failed the repository's
seven-day release-age policy; no exception was added. The older selected release and transitive resolutions
passed that policy. The dependency stays outside the application bundle.

The library verifies ceremony type, configured challenge/origin/RP, UP/UV flags and assertion signatures
over the received client-data bytes. The wrapper adds strict same-origin embedding checks, canonical
binary bounds, outer/attested credential-ID agreement, discovery user-handle matching, and exact COSE
key-type/algorithm/curve/coordinate combinations for Ed25519 and ES256. The verifier retains COSE plus
derived SPKI from the attested credential key, ignoring supplemental browser `publicKey` fields.
[Reviewed registration source](https://github.com/MasterKale/SimpleWebAuthn/blob/v14.0.0/packages/server/src/registration/verifyRegistrationResponse.ts),
[reviewed assertion source](https://github.com/MasterKale/SimpleWebAuthn/blob/v14.0.0/packages/server/src/authentication/verifyAuthenticationResponse.ts).

Options require discoverable credentials and user verification, prefer Ed25519 (-8), and accept ES256
(-7). Registration requests and accepts only `none` attestation. It establishes no authenticator-vendor
or hardware trust, and supplies no attestation signature proving possession; the separate confirmation
assertion is therefore required before credential confirmation. Client extensions are not requested.
The signature counter is retained as an observation, with the library's stored-counter baseline set to
zero to implement TRD §13.9's counter-independent replay policy. Retained challenge consumption is the
replay gate. [WebAuthn registration and assertion verification](https://www.w3.org/TR/webauthn-3/#sctn-rp-operations).

## Persistence and crash boundary

Node's `DatabaseSync` owns one SQLite file, WAL mode, `synchronous=FULL`, foreign keys, a five-second
busy timeout and `BEGIN IMMEDIATE` transactions. A fresh database receives schema version 1 plus one
exact origin/RP policy row. Unknown existing schemas or a changed policy refuse opening. There is no
automatic schema migration. The private harness uses localhost; the real RP/hostname must be chosen
before any personal passkey ceremony and cannot silently change on restart.

The initial transaction snapshots the challenge and credential together; a competing process completing
confirmation between inspection and crypto must resolve to its stored receipt, not a spurious invalid-proof
refusal. Crypto runs outside the transaction. The commit re-reads attempt state, expiry, single-use progress,
credential ownership/key/state and active-account eligibility. It commits the verified key or receipt,
challenge consumption and next-stage progress together. Nothing is acknowledged before SQLite commit.
A failed write leaves prior progress; a response lost after commit is resolved through the stored
receipt. Instrumentation can observe or abort named boundaries in tests; it supplies no bypass flags.
[Node SQLite API](https://nodejs.org/api/sqlite.html), [SQLite durability settings](https://sqlite.org/pragma.html#pragma_synchronous).

Process restart tests kill a real child with SIGKILL on both sides of commit and reopen the file in a
new child. They do not certify filesystem power-loss behavior, malicious database modification, or
rollback to a historical service backup. Operational restore, pending-attempt cleanup, rate limiting,
production sessions/transport and account recovery remain future service-owner work. None is enabled
by exposing the private adapter to the public network.

## Repeatable evidence and next phase

Run `pnpm account:core` (or `node scripts/account-core/run.mjs` using the already installed runtime).
It records source hashes, streaming output, JUnit results and completion/timeout status under a fresh
`test-results/account-core/` directory. Generated counterexamples retain seed, command sequence and
error. Separate ledgers cover registration and active-fixture sign-in histories; tests include deliberate
replay, purpose and key-substitution controls. Native Chromium uses a fresh profile and virtual
authenticator, never the author's profile.

After this boundary passes, the next bounded phase is recovery sealing, saved-code confirmation and
restart-owned account finalization. Local promotion and the first authority/binding issuer follow with
an explicit authenticated connection to that result. The current device-lock code remains distinct from
the account passkey and newly generated content-recovery code. The author's second pre-encryption device
will adopt this workspace later; none of its old writing is imported by this core.
