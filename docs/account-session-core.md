# Account session core — phase 1

Phase 1 historical construction: schema 12 at signed commit `57bcba5f`.
[Phase 2](./account-session-client.md) adds explicit combined challenges and schema 13, with a separate
`upgradeFromV12` opt-in. The ordinary session operations and guarantees below remain in effect.
[Phase 3b](./account-enrollment-session.md) adds atomic combined enrollment/login and schema 14,
with an explicit `upgradeFromV13` option. The schema 12 descriptions below record phase 1.

2026-10-07. Implements the first increment of [sessions and subscriptions](./account-sessions-subscriptions.md).
This is an opt-in service component and separate HTTP handler. The packaged client and running private
service still use the existing development adapter. No live database upgrade or restart occurred.

## Boundary and activation

`AccountCore` accepts explicit `sessions: { pin, operatorKey }` configuration. A new database with this
configuration is schema 12. Existing schema 11 requires the separate `upgradeFromV11: true` option;
the operator must first obtain the same offline/exclusive quiet point as other service upgrades.
The live upgrader does not yet offer this transition. Opening without session configuration preserves
the existing schema 11 behavior; opening schema 12 without it is refused. Session tables and their
custody metadata are installed in the account database's initialization transaction. A different pin,
operator key or missing retained custody prevents opening rather than creating replacement custody.

The service owner exposes `core.sessions`. Its `createSessionHandler` serves only POST operations under
`/account/session/v1/`; it has no development-token fallback and mounts no existing account/content
routes. The handler is available for composition, not wired into either running launcher. Service-side
session identity is not a relay grant, device membership proof or content opener.

## Requests and results

All request bodies are exact-field JSON objects. IDs, retry capabilities and bearer secrets are
canonical base64url encodings of 32 random bytes. The selected `accountId` constrains login; the
passkey credential and user handle must resolve to that same active account at verification and commit.

| Operation | Request fields | Successful result |
| --- | --- | --- |
| `begin` | `accountId`, `retryKey` | `challenge`: attempt ID, deadline and WebAuthn request options. Same request reuses the pending challenge. |
| `finish` | `retryKey`, `attemptId`, `response` | `issued`: account, credential and session IDs, issuance/absolute expiry, renewal and revoke-only secrets. |
| `cancel` | `retryKey`, `attemptId` | `cancelled`: prevents issuance, or revokes the session already issued for that attempt. |
| `acknowledge` | `sessionId`, `renewalToken` | `acknowledged`: retire the encrypted issuance retry copy after client persistence. |
| `renew` | `sessionId`, `renewalToken` | `access`: a fresh short bearer, account/session IDs and bounded expiry. |
| `revoke` | `sessionId`, `revokeToken` | `revoked`: invalidate only that session; repeatable after reply loss. |

The fresh challenge hashes a versioned session-login domain, pinned service context, random attempt
ID, selected account, retry-capability hash and service nonce. It is checked with the existing WebAuthn
verifier, including exact RP/origin, presence, user verification and retained credential binding.
Historical `account-proof` receipts, offline challenges and another account's valid assertion cannot
mint a session. Client request bytes are copied before awaiting verification. The commit rechecks the
attempt, account and credential. Passkey counters remain observations, not the replay gate.

The first successful commit sets the 30-day deadline. Exact finish retries return the original
session and secret bytes, with no deadline extension; conflicting proof is refused. `begin` cannot
retrieve issued secrets. Retrieval requires both the original proof and retry capability. An acknowledged,
cancelled, revoked, expired or unrecoverable attempt cannot mint replacement credentials.

Access lasts up to five minutes, capped by parent-session expiry. Access records are memory-only and
are lost on restart; the durable renewal credential remains usable. Renewal does not rotate it or
slide the parent deadline. The independent revoke capability cannot renew or authenticate. Revocation
does not alter account/device credentials or another login. A deleted/nonexistent random session ID
has no grants to revoke; IDs are never intentionally reused.

## Custody, transactions and retention

The account database retains hashes of renewal/revoke secrets. During the ten-minute finish-retry
window it also holds one encrypted exact issuance result. `session-custody.ts` derives a separate
AES-256-GCM key with HKDF-SHA-256 from the operator key, a per-database random 32-byte salt and canonical
`done/account-session-issuance/v1` context containing the full service pin. A separately derived HMAC
key under `done/account-session-key-check/v1` detects a wrong operator key on open. The authority
signing-key seal is not reused.

Each encryption reserves and commits a counter before entering the issuance transaction. The nonce
is twelve bytes: four zero bytes followed by the big-endian eight-byte counter. Counter values start
at one and stop at `2^32 - 1`; exhaustion refuses issuance. Aborted issuance burns the reservation.
AAD binds the service context, counter, session/attempt/account/credential identities, credential
snapshot, both secret hashes and all issuance/retry deadlines. The session and ciphertext then commit
together. Neither hashes nor a regenerated result are used as a substitute for lost secret bytes.

Acknowledgement or revocation clears the retry ciphertext. At the retry deadline it immediately
becomes unusable; a once-per-minute, unreferenced maintenance timer and begin/renew transactions clear
expired copies. Sessions and their attempts are pruned after absolute expiry plus ten minutes; old
proofs cannot answer a newly generated challenge even if the client reuses a retired retry key.
These are logical retention bounds, not SQLite/WAL or backup forensic erasure claims. A stopped service
may retain expired rows until it runs maintenance again.

This nonce allocation assumes the service database is not rolled back under the same derived key.
An operations restore must invalidate restored sessions and use new session-custody salt/key context
before serving or issuing again. That restore flow remains future work; the ordinary development
backup procedure is not a session restore procedure.

`withAccess` is a trusted, synchronous service-composition boundary. It checks the live session,
current account and credential, expected account, and access expiry inside the transaction that runs
the callback. Async verification belongs before this boundary. Identity returned by an earlier read
is not a reusable authorization decision. The callback uses the supplied transaction; it must not
call existing operations that open their own transaction or retain the connection for later work.
Nested session transactions and async callbacks are refused. Integration of existing domain routes
with this boundary is phase 3, not accomplished by adding the HTTP handler.

## Bounds and failures

The initial development limits are 4,096 retained attempts, 1,024 retained sessions, 32 active sessions
per account and eight live access credentials per session owner. Hitting a bound refuses rather than
evicting somebody else's active login. Expired records return capacity through maintenance. These are
single-process limits; a future multi-instance/public host needs its own shared admission policy.

The HTTP handler enforces exact Host/Origin, POST/JSON framing, a 64 KiB body limit, 16 in-flight
requests, and a global 120-request burst replenished at two requests/second. Body/verification handling
has a ten-second deadline. All responses are no-store; error responses close the connection, and no
cookie or query-string credential is used. Disconnection never cancels a commit already in progress.

`sign-in-required` is HTTP 401; invalid proof is 403; malformed input is 400; conflicting/expired
attempt state is 409; capacity is 429; unknown storage/commit outcome is 503. None is an authenticated
device-revocation proof. Callers retain prepared operations and resolve unknown outcomes by their
existing retry identity. The new client behavior is phase 2.

## Focused evidence

25 new native tests pass: 21 core cases, two actual SIGKILL/reopen cases and two HTTP cases. They cover
both supported passkey algorithms, lost finish/revocation replies, exact retry, counter burning,
absolute expiry, wrong-account and old-proof refusal, cancellation/account/key changes during crypto,
caller mutation, cross-owner revocation, guarded commit rollback, malformed/missing custody, explicit
schema opening and private-token refusal. Thirteen existing account-core cases and five development
runtime cases also pass. TypeScript and scoped lint/format pass.

The first HTTP invocation was blocked from binding loopback by the execution sandbox. Its first
approval-review request failed because the reviewer model was at capacity; the subsequent approved
retry ran all seven HTTP/runtime checks successfully. This was an environment failure, not a failing
protocol assertion. Test state was disposable; the live service was not touched.

Run `pnpm test:account-sessions`, or directly:

```sh
node --test --test-timeout=15000 test/account-sessions/*.test.mjs
node --test --test-timeout=15000 test/account-core/core.test.mjs test/account-application/runtime.test.mjs
```

Next is phase 2: factor-owned client persistence and login generations, background renewal, Lock,
Sign out/offline revocation, expiry presentation and a walkthrough of prompt placement. Scope grants,
existing-route cutover, notifications and the real two-device trial follow. No release campaign resumed.
