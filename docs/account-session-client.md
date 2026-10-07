# Account session client — phase 2

2026-10-07. Builds on signed phase 1 commit `57bcba5f` and the
[session/subscription plan](./account-sessions-subscriptions.md).

Implemented as an opt-in application integration. **The running :8443 installation is unchanged.**
`SetupConfig.networkSessions` is deliberately absent from the packaged configuration loader. Do not
enable it on the shared-token host as a substitute for phase 3's scoped route authorization. The
client obtains only account-session access; it does not yet obtain relay or subscription grants.

## Agreed prompt behavior

- The device-lock code is unchanged. With a remembered eligible login, the normal local passkey
  check opens writing and renewal happens in the background.
- Without an eligible login, the unlock screen prepares an online challenge in the background from
  a public slot hint. If ready when needed, one new passkey assertion serves both local unlock and
  network login. The real startup owner rechecks the authenticated binding; the hint grants nothing.
- An offline, slow, invalid or unavailable challenge falls back to the existing offline assertion.
  There is no network wait or surprise later passkey prompt. The menu offers Connect/Reconnect sync.
- A signed-out slot always takes the local path until an explicit Connect action. Lock preserves
  the remembered login; sign-out closes the runtime after durably disabling automatic resumption.
- Online finish failure does not invalidate successful local verification. Reconnect does not replace
  the editor with a setup screen. Sign-out cancels an outstanding reconnect passkey request.

## Explicit combined assertion

`account-protocol/sessionUnlock.ts` defines the new `done/account-session-and-slot-unlock/v1` domain.
Its SHA-256 challenge length-prefixes the version, full service pin, account, principal, credential,
service attempt ID, retry-capability hash, browser nonce, service nonce and attempt expiry. The browser
nonce is 32 fresh random bytes. The client checks every expected identity and recomputes the challenge.

The local verifier still verifies the service-signed stored binding, bound credential, exact origin,
RP hash, same-origin embedding, UP/UV and assertion signature. A server response alone cannot open
writing. Ordinary offline assertions remain invalid for session login, and ordinary service login
assertions remain invalid for local unlock. Both Ed25519 and ES256 are covered by the combined-path
checks. The browser preserves the authenticator's original signed bytes and optional user handle.

The service retains combined context beside its attempt and pins the assertion's credential to that
context. Reusing a retry capability with changed context refuses. This is **schema 13**: upgrading a
phase 1 schema 12 database requires `upgradeFromV12: true`; a schema 11 upgrade still requires
`upgradeFromV11: true`. Existing plain session challenges remain usable after the upgrade. Neither
transition is mounted in the live launchers or live upgrader yet.

## Owned client custody

`src/account/sessionVault.ts` stores the login in `done.account-login.v1`, separately from document
records. Initialization runs under the actual Account slot writer, using the authenticated mandatory
factor root; subsequent reads/writes use that writer's task capability and a serialized storage queue.
Original and joined-device owners both attach cleanup to their lifetime. No code, root bytes or access
bearer is persisted in chooser metadata or application configuration.

HKDF-SHA-256 derives a non-extractable AES-256-GCM key using the existing factor root, a fresh persisted
32-byte carrier salt and `done/account-login-carrier/v1` context binding the complete pin, account,
slot and root identity. The raw root stays within the existing root-opening callback. This is a new
key/counter domain; it does not mutate the content owner's cached custody record or its MAC.

Each seal first reserves and commits its counter under the slot owner, then encrypts, then publishes
with an exact prior-record comparison. Nonces are eight zero bytes followed by a big-endian uint32
counter, starting at one and refusing at `2^32 - 1`. AAD additionally binds generation and sequence.
An interrupted publication burns the reservation and preserves the previous complete value. Sign-out
advances the generation. Wrong root/account/pin, tampered ciphertext and stale concurrent writers
refuse. Corrupt login custody reports a reconnect/storage problem; it does not deny a valid local
passkey or modify writing. Strings/JS key objects are discarded on closure; this is not a forensic
memory-erasure claim.

The client saves the exact assertion and retry capability before sending finish. It seals the returned
session before acknowledging it. A crash or lost reply can retry the same proof without another login
or an extended expiry. Access renewal is deduplicated, held in memory, retried on an online event or
the next consumer request, and checked against account/session/deadline. Parent expiry offers
Reconnect; it does not relock writing. The service remains the authority on expiry.

## Sign-out and retries

Sign-out immediately retires live login continuations, cancels an outstanding reconnect prompt and
orders its storage transition behind any already-started carrier write. It atomically replaces the
carrier with a sealed signed-out generation and adds an independent revoke-only outbox entry. If an
issuance reply is still unknown, the outbox instead holds the attempt's cancellation capability;
without the discarded assertion that capability cannot finish login or retrieve its credentials.
An issued session receives only its independent revoke secret in the outbox. Neither case retains an
unsealed renewal secret. A failed durable transition is visible and cannot claim sign-out completed.

The UI closes the selected workspace only after this durable transition. Its chooser retries the
outbox on entry and when connectivity returns, without requiring factor unlock. It reports server
completion only after acknowledgement. Lost replies retain the item; unknown already-pruned cancelled
attempts are terminal. Every delivery checks the exact configured pin, operation and capability shape.
Other people's slots are unaffected. The existing exclusive Account slot lifetime means a queued tab
rereads the signed-out generation when it acquires ownership; it cannot reuse the old login.

These are logical storage/lifetime guarantees. Profile rollback/clone restore is not supported by this
nonce construction. Account removal/reset must retire this auxiliary carrier along with its factor
custody; a complete removal/restore product flow is still later lifecycle/operations work. Missing or
corrupt revocation outbox entries cannot establish server sign-out completion.

## Focused evidence

- 59 Node cases pass: 41 session cases (including 15 new client histories, the explicit schema 12
  upgrade, both existing process-kill checks and HTTP checks), plus 18 existing account-core/runtime
  regressions. The client histories use real signatures, the service implementation and IndexedDB's
  in-memory test implementation; they are not a physical-device UI trial.
- One disposable Chromium test passes with two directed native controls: aborting publication burns
  its nonce while preserving the previous value, and a queued exclusive-lock tab reads signed-out
  state after acquiring ownership. It uses intercepted localhost pages and no retained profile.
- 46 existing slot-verifier/index tests pass. TypeScript and scoped lint/format checks pass.

Commands:

```sh
node --test --test-timeout=15000 test/account-sessions/*.test.mjs test/account-core/core.test.mjs test/account-application/runtime.test.mjs
node --test --test-timeout=35000 test/account-sessions/client.native.mjs
node_modules/.bin/vitest run test/slotUnlock.test.ts test/slotIndex.test.ts
node node_modules/typescript/bin/tsc -b --noEmit
```

The native check also has `pnpm test:account-session-client-browser`. These are focused implementation
checks, not release qualification. No live database, server, saved writing or physical device was
changed. Next: scoped grants and protected-route cutover, then live notifications and the real
two-device walkthrough. Public deployment and broader lifecycle/operations remain separate.
