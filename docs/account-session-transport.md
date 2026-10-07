# Owned browser grants and reconnect

2026-10-08 · sessions/subscriptions phase **3c** · implemented behind the existing session opt-in.
The preceding combined enrollment/login phase is signed at `a22011af`. Follows
[service grants](./account-session-grants.md), [combined enrollment](./account-enrollment-session.md)
and [the session/subscription plan](./account-sessions-subscriptions.md).

The running `:8443` preview is unchanged. Bootstrap-host composition, explicit upgrade/configuration
and a quiet-point cutover remain pending. Release validation remains paused.

## Ownership and retries

`ScopedTransport` belongs to an unlocked runtime. Its binding supplies the actual login owner, exact
workspace or enrollment scope, and a signer held by that slot's custody owner. Before signing, it
checks the challenge's full pin, account, parent session, scope, actions, deadline and framing. The
service still verifies current authority/device eligibility. Grants never install membership or
turn a network denial into device-revocation evidence.

The cache is memory-only, keyed by account/session/scope, bounded to four entries. Concurrent requests
share acquisition. Routes are a closed list: enrollment grants cannot call workspace content routes.
The editor uses its verified reader identity, independently of the requested publisher. Lock/closure
and the start of sign-out abort grant work and clear the cache. Late replies cannot reinstall it.
Access invalidation compares the rejected token so a late denial cannot clear a newer access token.

The supported editor uses grants for submit, inbound receive and discovery. Approval uses enrollment
grants for admission, ceremony and content transfer, then a separately acquired workspace grant for
certified checkpoint/read operations. Session mode has no private-bearer fallback on these paths.
The existing private adapter remains selected when the opt-in is absent; account-creation/bootstrap
host composition is still next.

Each call captures its body before awaiting credentials. Structured `grant-required` permits one
reacquisition/resend; `access-required` permits one access invalidation/renewal during acquisition.
Retries preserve identical captured bytes, including after service restart. Scope/authority refusal,
ordinary HTTP denial, malformed response, timeout or reply loss does not automatically replay an
operation. Control returns to the existing durable operation owner. Following an authority transition,
a later owner-driven retry can acquire fresh scope and retry its retained semantic operation.

Requests use same-origin URLs, explicit Authorization, no cookies/cache/redirects and a ten-second
deadline. Grant/error bodies have a 4 KiB streamed bound. Content responses retain existing bounded
readers. Tokens never enter URLs, chooser records or the service-worker cache. Network waits stay
outside the supported editor's storage queue. The older delivery readback helper likewise separates
preparation, network wait and fresh-state verification, avoiding a queue cycle when login finish must
save its carrier. This does not reinstate v8 as a supported product path.

## Approval login and exceptional recovery

The approval coordinator retains access/grants for its unlocked lifetime while reopening the sealed
login under each actual short-lived ceremony permit. It releases the factor-derived vault and task
after each callback. Polling reuses access rather than exhausting service capacity. The editor later
opens the same carrier under its account owner. Reconnect identity comes from verified bootstrap
evidence checked against retained local account/approval state before prompting.

Normal enrollment still has its one combined passkey check. If the receipt is verified but the login
issuance copy is unavailable before local retention, the client preserves that receipt and offers
**Reconnect sync**. It neither acknowledges the unavailable login nor derives new credentials from
the receipt. Signed-out state requires explicit reconnect too. An unresolved ordinary login is first
resolved through its saved exact proof.

Reconnect obtains a fresh ordinary session challenge for the selected account/passkey. It seals the
proof before finish and the result before acknowledgement. Lost replies resume without another
prompt/session; closure cancels the prompt and fences late results. Storage failures retain their
original retry path; wrong identity remains a refusal. Local unlock, membership and content approval
retain their independent checks.

## Focused evidence

Fourteen new cases cover ten browser-transport scenarios against the real protected HTTP adapter
and four ceremony-login scenarios using WebCrypto, fake IndexedDB and disposable SQLite. They cover
protected binary delivery, concurrent acquisition, restart/expiry, body mutation across retries,
denial/lost-response bounds, wrong challenge identity, pending admission, authority change, late
replies, response bounds, repeated short permits and missing/lost/cancelled login recovery.
A stale test vault initially failed its generation check after another owner wrote; the fixture now
reopens it as production does.

The expanded session/core/runtime group passes **115 tests**; affected transport/scheduler Vitest
files pass **37 tests**. Two selected Chromium regressions pass: composed edit/send/receive,
compaction and cold replay; and exact submission/readback with retained acceptance after restart.
Those browser regressions use the existing private host, not a newly mounted session-enabled
two-device app. The affected login-owner subset also passes after the final callback-lifetime guard.
TypeScript and scoped lint/format pass. No generalized campaign or live profile was used.

```sh
node --test --test-timeout=20000 test/account-sessions/*.test.mjs test/account-core/core.test.mjs test/account-application/runtime.test.mjs
node_modules/.bin/vitest run test/privateDeliveryHttp.test.ts test/privateDiscoveryHttp.test.ts test/accountReceiveDriver.test.ts test/accountSyncDriver.test.ts
node --test --test-timeout=70000 --test-name-pattern='one owner sends and reads back actual service bytes' test/account-sync/native.test.mjs
node --test --test-timeout=70000 --test-name-pattern='actual HTTP send uses exact persisted bytes' test/account-transport/native.test.mjs
node node_modules/typescript/bin/tsc -b --noEmit
```

Next is phase **3d**: compose public and attempt-authorized bootstrap routes with the protected
adapter, remove the shared bearer from the session-enabled host/client configuration, and expose an
explicit quiet-point schema upgrade. Check that host with disposable state, then switch the retained
preview after backup and a quiet point, preserving origin/pin. Notifications and the actual two-device
trial follow. Broader lifecycle/operations remain later work.
