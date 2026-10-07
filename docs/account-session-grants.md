# Scoped network grants and transaction authorization

2026-10-07 · sessions/subscriptions phase **3a** · service foundation implemented;
browser transport and live cutover remain pending. Combined enrollment/login is now implemented in
[phase 3b](./account-enrollment-session.md), which also adds opt-in schema 14.
Follows [the owned client login](./account-session-client.md) and
[the session/subscription design](./account-sessions-subscriptions.md). Release validation remains paused.

## Construction

`AccountCore` owns `ScopedGrants` alongside `AccountSessions`, on the same SQLite connection.
After a live account access check, the service verifies retained workspace authority and issues a
fresh, 60-second device-possession challenge. Its length-prefixed Ed25519 purpose binds the complete
service pin, authenticated account and parent session, scope, device credential, current head,
permitted actions, random challenge identity and deadline. Account login alone cannot finish it.
The signing key comes from verified retained membership or the exact signed enrollment preparation.

| Scope | Eligibility | Permitted operations |
| --- | --- | --- |
| Workspace | A currently certified device for this account/workspace | Submit, read, checkpoint exchange, authority discovery |
| Enrollment | The candidate or original participant in one retained, prepared enrollment attempt | Admission, ceremony exchange, content transfer; individual operation roles still apply |

A pending candidate cannot get a workspace grant. Admission remains gated by the exact preparation
capability and receipt, and the grant target uses that preparation's candidate identity. Inbound read
authorization uses the **reader**, even when it requests another publisher's history. Existing
request signatures, custody checks, membership verification and complete-history interlocks remain.

The resulting opaque 256-bit grant is retained by hash in memory for at most five minutes, capped by
the parent login and, before admission, preparation expiry. Challenges are single-use; a lost grant
reply requires another device signature, not a passkey prompt or a new content operation. Restart
discards grants/challenges; it preserves the durable login. Bounds are 1,024 challenges and 4,096
grants per owner, at most 16 of each per session. Expired entries are pruned on issuance/finish.

Grants retain a fingerprint of the verified authority snapshot. Ordinary ciphertext appends do not
invalidate it: the changing delivery witness is excluded. Admission, retained content delivery,
certification, cancellation or changed authority evidence requires reacquisition. A pending grant
never changes into a workspace grant. The domain still validates each requested action independently.

## Transaction boundary

The trusted service adapter passes an explicit `OperationAuthorization` to the domain operation.
After asynchronous proof verification, the domain supplies its verified workspace/actor/attempt and
operation inside its own transaction. The guard checks the exact scope, current authority fingerprint,
grant deadline and parent session eligibility. A final check immediately before COMMIT rechecks
the grant/session deadline and retirement, while allowing this operation's own authorized authority
transition. A refusal rolls back the domain write and remains a structured authorization refusal.
The guard cannot begin, commit or roll back another owner's transaction, or run against another DB.

Both empty and populated ceremony reads take this boundary. The old empty-progress response had an
early success return; this integration moves it through a coherent snapshot and the same guard.
Read replies are withheld after retirement; a write committed before sign-out remains committed.

## HTTP composition and route disposition

`createScopedAccountHandler` is a separate, **unmounted** adapter. It accepts only exact-origin/host
POSTs, bounded JSON or binary bodies, explicit bearer headers, no content encoding, no cookies and
no query credentials. It has a ten-second request bound, 16 concurrent requests and a bounded rate
budget. It exposes the session endpoints, two grant endpoints and the protected domain routes below.
It has no shared-token fallback and no `/__account-setup/access` endpoint. The currently running
development handler remains separate until the browser and remaining bootstrap routes are ready.

| Route family | Authority and current disposition |
| --- | --- |
| `/account/session/v1/*` | Fresh login proof or exact retry/renew/revoke capability; existing phase 1 handler |
| `/account/grant/v1/begin`, `/finish` | Live access plus exact fresh device proof; implemented here |
| `/account/delivery/submit`, `/read`, `/read-v2` | Workspace grant plus existing signed request; implemented here |
| Both `authority/discover` aliases | Workspace grant plus signed locator; implemented here |
| `ceremony/exchange`, `ceremony/transfer`, `enrollment/admit` | Enrollment grant plus existing role/attempt proof; implemented here |
| `content/checkpoint` | Certified workspace grant plus signed checkpoint operation; implemented here |
| `config`, `authority/prove` | Public pinned configuration/nonce proof; bootstrap-host composition remains pending |
| `begin`, `resume`, `finish`, `cancel` | Fresh account ceremony and attempt retry capabilities; bootstrap-host composition remains pending |
| `preparation/inspect`, `/abandon`, `recovery/*`, `promotion/*` | Existing retained setup capabilities, passkey/recovery/device proofs; bootstrap-host composition remains pending |
| `ceremony/bootstrap` | Signed invitation yields bounded historical admission proof, not a live workspace grant; bootstrap-host composition remains pending |
| `enrollment/begin`, `/finish` | Fresh passkey plus candidate-possession proof; combined login issuance implemented in phase 3b; bootstrap-host composition remains pending |
| `access` | Retire in the session-enabled host; never route to the development handler as a fallback |

The protected adapter returns `kind: authorization-refused` separately from a domain refusal.
`access-required` can trigger one access renewal; `grant-required` requires a fresh device proof;
`sign-in-required` requires online login. Scope/authority refusal must not blindly retry a new write.
The client must retain and retry the exact prepared semantic request through its existing owner.
No setup subscription grant is implemented yet; no subscription endpoint is exposed in this phase.

## Focused evidence

`test/account-sessions/grants.test.mjs` contains 18 directed cases and
`test/account-sessions/scoped-http.test.mjs` adds two HTTP cases. They cover independent challenge
framing; wrong key/account/session/attempt; pending versus certified authority; reader versus publisher;
revocation during verification; expiry before commit with rollback; restart; capacity/expiry; empty
ceremony responses; and a complete approval/delivery/certification transition through the guards.
The HTTP checks reject renewal/access/private-shaped bearers as operation grants and distinguish
authorization refusals from content refusals. The expanded session/core/runtime group passes 79 tests. Another 84 affected delivery, read,
successor, discovery, ceremony and content-transfer regressions pass. TypeScript and scoped
lint/format checks pass.

Commands:

```sh
node --test --test-timeout=20000 test/account-sessions/*.test.mjs test/account-core/core.test.mjs test/account-application/runtime.test.mjs
node --test --test-timeout=30000 test/account-service-delivery/core.test.mjs test/account-transport/service.test.mjs test/account-service-inbound/core.test.mjs test/account-successor/service.test.mjs test/account-successor/discovery.test.mjs test/account-ceremony/development-service.test.mjs test/account-ceremony/content-transfer.test.mjs
node node_modules/typescript/bin/tsc -b --noEmit
```

This is focused implementation evidence, not a generalized conformance campaign, release inventory,
native two-device walkthrough or public deployment claim. Live data and the retained preview have not
been changed. These grants add no persisted schema; the preceding phase's session schema remains 13.

## Next bounded work

The approved combined **fresh** enrollment/login challenge, atomic issuance, exact retry and
factor-sealed client retention are implemented in [phase 3b](./account-enrollment-session.md).
An old receipt remains insufficient. Next connect the browser's owned grant acquisition/renewal and exact-request retry, compose bootstrap
routes without the shared bearer, and perform a quiet-point backup and live cutover. Notifications
follow that cutover; the eventual two-device walkthrough remains the product milestone.
