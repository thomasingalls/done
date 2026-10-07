# Combined enrollment and remembered login

2026-10-07 · sessions/subscriptions phase **3b** · implemented behind the existing session opt-in.
Preceding client/grant work is signed at `a2060547`. This follows
[the session/subscription plan](./account-sessions-subscriptions.md) and
[scoped grants](./account-session-grants.md). The live `:8443` preview is unchanged;
browser grant transport and host cutover remain pending. Release validation remains paused.

## One fresh assertion, two explicit purposes

The operator approved using the joining device's already-required enrollment passkey check to
establish its remembered network login. No additional prompt or user-managed code is introduced.
An ordinary enrollment proof or historical receipt cannot mint a login.

For new opt-in attempts, the browser retains a separate random login-retry capability alongside the
enrollment-retry capability in factor-sealed ceremony progress before requesting a challenge. The
signed enrollment context adds `login: { purpose: 'enrollment-and-login-v1', attemptId, retryHash }`.
Its assertion challenge hashes a length-prefixed `done/enrollment-and-session-assertion/v1` domain
and the complete normalized context. This binds the service pin, account, passkey, candidate device,
current authority, both attempt identities, login retry hash, nonce and expiry. Candidate possession
also covers that complete context. The client checks the expected account/passkey from the verified
bootstrap authority and the retry hash before asking for the assertion.

Ordinary enrollment encodings and their original assertion domain remain unchanged. Retained ordinary
attempts continue on their old path; they are not upgraded by adding a capability to finish. The
ordinary session endpoint explicitly refuses combined enrollment attempts, even if their linkage row
is missing. Account login still provides neither device membership nor content keys.

## Atomic service result and recovery

The enrollment preparation, session attempt and link are created in one account-database transaction.
After fresh passkey and candidate-possession verification, issuance reserves and commits a nonce in
the existing session-custody domain. The subsequent enrollment transaction rechecks authority and
credential eligibility, then commits the signed receipt, exact proof hashes, credential observation,
network session and encrypted issuance result together. An aborted commit burns the reservation.
An exception or process death cannot commit just one half of that result. Authority signing does not
require a transaction spanning the separate authority database.

Only exact `finish`, with both retry capabilities and both original proofs, can return login secrets.
`begin` and `resume` return enrollment progress without them; signed receipts contain no login bearer.
Concurrent exact retries converge on the same login and original 30-day deadline. Changed proof or
purpose refuses. The existing ten-minute issuance-retry seal, acknowledgement, cancellation, account
eligibility and revocation rules apply. Expired or acknowledged copies never remint credentials.
The historical receipt can still be returned with a structured login refusal. Cancelling an
unconsumed combined preparation also cancels/revokes its linked login in the same transaction.

Session-enabled databases now use **schema 14**: an explicit attempt purpose (`login` or `enrollment`)
and an enrollment/session link table. Upgrading schema 13 requires `upgradeFromV13: true`; existing
schema 11/12 upgrades retain their explicit options. Existing ordinary challenges and session custody
survive. Missing combined linkage is refused, never inferred from an old receipt. The unconfigured
service stays at schema 11. Live upgrade commands and launchers have not been changed or run.

## Client persistence order

The ceremony owner saves the exact proof and challenge before finish. It verifies the signed reply
against that retained context, then:

1. Seals the issued login through the existing auxiliary session vault under the actual slot's
   mandatory-factor root, pin, account and root identity.
2. Saves the enrollment receipt in the existing sealed ceremony progress.
3. Acknowledges the service's retry copy only after both saves succeed.

The joined editor opens the same carrier and can resume network access without another online
assertion. Root bytes remain inside the existing custody callback. Closure fences late completions;
signed-out state or an unresolved login cannot be overwritten by an old enrollment response. A
different valid remembered login for the same selected account/passkey is preserved.

If the receipt save fails after the login save, retry can use that carrier even if the service's exact
issuance copy has since been retired. If the login save fails, no acknowledgement is sent. Lost finish
replies retry the saved proof. An unavailable server copy with no usable local carrier reports that
a fresh online check is needed; it cannot silently regenerate credentials. Completing that explicit
reconnect journey before approval is part of the remaining browser grant integration, not a new prompt
added by this phase. Admission/content approval still enforce their own authority and deadlines.

## Focused evidence and limits

The new service file has **15 cases**, including both Ed25519/ES256 assertions, concurrent retry and
restart, wrong purpose/capability/proof, legacy receipt refusal, commit abort, counter exhaustion,
cancellation, account retirement during verification, expiry before commit, retired issuance copies,
explicit schema 13 upgrade, missing linkage and actual SIGKILL immediately before/after commit.

The **seven client cases** exercise the bundled production completion helper, session vault and
`NetworkLogin`, with WebCrypto, disposable SQLite service state and fake IndexedDB. They cover save
ordering, encrypted storage, resumed editor access, failed seals/receipt saves, lost replies, closure,
signed-out/unresolved/different login state and context/identity refusal. They are not a native browser
enrollment walkthrough. The final expanded session/core/runtime group passes **101 tests**; another
**90 affected enrollment/approval/content-transfer regressions** pass. TypeScript and scoped lint and
format checks pass.

```sh
node --test --test-timeout=20000 test/account-sessions/*.test.mjs test/account-core/core.test.mjs test/account-application/runtime.test.mjs
node --test --test-timeout=30000 test/account-enrollment/*.test.mjs test/account-successor/service.test.mjs test/account-successor/discovery.test.mjs test/account-ceremony/development-service.test.mjs test/account-ceremony/content-transfer.test.mjs
node node_modules/typescript/bin/tsc -b --noEmit
```

Next: owned browser grant acquisition/renewal and exact-request retry, then bootstrap-host composition
without the shared bearer and a quiet-point backup/cutover. Live notifications and the real two-device
walkthrough follow. No live upgrade, release campaign or broader lifecycle/recovery work was included.
