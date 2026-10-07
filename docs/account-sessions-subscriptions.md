# Account sessions and live subscriptions

2026-10-07 · design checkpoint · **phase 1 core implemented; application integration pending**.
See [phase 1 implementation and focused evidence](./account-session-core.md).
Follows the independent packaged application
and account service in [packaged-account-development.md](./packaged-account-development.md).
The product rules below include the operator's two decisions made during this design. The engineering
construction is the implementation plan, not evidence that the running service provides it.
Release validation remains paused. The target is the existing two-device development flow at `:8443`.

## 1. Product contract

Account login, local unlock, device authorization and content-key possession remain separate axes
([PRD §6.6](./PRD.md#66-sign-out-remove-from-this-device-reset-for-handoff), TRD §§7.1/13.2/13.4).

| Action or event | Local effect | Network effect |
| --- | --- | --- |
| Lock workspace | Close the owner and discard live keys, tokens and continuations; preserve encrypted custody and writing. | Close live connections. Preserve this slot's sealed remembered login for use after unlock. |
| Unlock | Existing mandatory factor and local verifier rules still apply. Open and edit without waiting for the service. | If a remembered login is eligible, resume it in the background. No automatic online passkey prompt. |
| Sign out | Close this person's slot, retain encrypted writing and device credentials, and durably disable automatic login resumption. Other people's slots are unaffected. | Revoke this installation's selected login and its derived access/relay grants. This is not device revocation or sign-out on other devices. |
| Login reaches 30 days | Keep the open editor and local work functioning. | Require a fresh online passkey check before further network access. Renewal and background activity cannot move the deadline. |
| Service or notification connection fails | Continue local reading and durable editing. | Retain queued work, show disconnected status and retry within bounds. |
| Verified device revocation | Follow the existing detached-copy contract. | Stop authorized sync. An HTTP denial or expired login alone is not evidence of device revocation. |

The **30-day absolute lifetime starts at the first successful sign-in commit**, using service time.
There is no additional idle-expiry policy in this increment. Locking does not reset the deadline.
Local-only workspaces acquire no account session. Fresh online authentication must match the selected
account; discovering another person's passkey cannot silently relabel or open the selected slot.

Sign-out can close the local slot while offline. It must say server sign-out is pending until the
service acknowledges revocation. Reopening retained local writing with its existing factors remains
possible offline; that cannot silently restore the signed-out network login. Session expiry likewise
must not send the person back through account creation or device enrollment.

## 2. Current seams and missing pieces

The private service currently issues one process-wide development bearer through
`/__account-setup/access`. `src/account/packagedConfig.ts` can renew it after service restart. This
solves private transport continuity, not account authentication or session isolation.

`account-service/core.ts` verifies fresh WebAuthn assertions and retains exact ceremony outcomes.
Its historical `account-proof` receipt is **not** an exchangeable session credential. Likewise,
the client-generated offline slot-verification challenge is not an online login challenge.
`development-http.ts` has operation-specific signature/authority checks behind its shared bearer;
adding sessions supplements those checks, never replaces them.

The current gateway forwards Authorization, not cookies. It has a 15-second upstream inactivity
timeout and bounded request/response shutdown behavior. A live stream needs its own lifecycle.
`accountSyncDriver.ts` already owns serialized send/receive scheduling; enrollment also has an owned
polling loop. Those are the integration points, not a new document provider or a server-side Y.Doc.

## 3. Recommended credential construction

Use a **stateful, opaque, account-specific session** with a long-lived renewal credential sealed in
that person's local factor custody, and short-lived access credentials held only in memory. Use
explicit Authorization headers with `credentials: 'omit'`; no access or renewal bearer in a URL,
public config, chooser metadata, service-worker cache or unsealed browser storage. These are internal
credentials, not another code for the person to copy or save.

Each service session records a random ID, authenticated account and passkey credential, issuance and
absolute expiry times, active/revoked status, and hashes of independent random renewal and revoke-only
secrets. Generate bearer secrets with the platform CSPRNG with at least 256 bits of entropy. A local
slot ID is a routing hint, not service proof of identity. Device/attempt scopes require separate
possession and authority checks (§5), even after a successful account login.

The client carrier binds service pin/origin, account, local slot, session ID, expiry and local login
generation. Seal it through the existing custody owner with a new domain and the existing reserved
nonce/counter discipline; never add a parallel write path to custody. It is additional account state,
not a content key or recovery factor. It is unavailable to a locked runtime.

An access credential lasts at most **five minutes**, capped by the session's absolute expiry. Its
server record references the live session; it is not a self-contained JWT that bypasses revocation.
Access records may be ephemeral: an API restart can invalidate them and cause one background renewal
without expiring the durable login. Each request checks session eligibility again. Starting values
such as five minutes are engineering limits, not a change to the operator's 30-day product policy.

For the first increment, the sealed renewal secret is stable within one session and expires or is
revoked with it. Access renewal does not rotate it or slide expiry. This avoids a lost-rotation-reply
trap, but means theft of the unlocked renewal secret can enable impersonation until revocation or the
30-day deadline. Factor sealing protects its stored representation; it does not contain hostile live
origin code. Adding refresh rotation later needs an explicit retry/reuse contract.

### Why recommend this over an ambient login cookie?

HttpOnly/Secure cookies reduce JavaScript token extraction and are a valid alternative. They still
need explicit account selection and server-side revocation; a single “current account” cookie would
break this application's multi-person slots. Cookies are also shared across ports of a host, which
matters for the separate `:443` and `:8443` installations. Distinct names/scopes can accommodate that,
but port separation alone cannot. The proposed sealed carrier fits the existing origin- and
slot-owned custody model and explicit-header gateway. The tradeoff is exposure of unlocked bearer
bytes to JavaScript, not a claim that cookies cannot support offline use.

References: [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
[cookie port isolation limits](https://www.rfc-editor.org/rfc/rfc6265#section-8.5).
The cookie discussion in [sessions.md §2.3](./sessions.md#23-cookies-and-offline-first-less-funny-than-it-sounds)
was architectural exploration, not a selected wire protocol.

## 4. Issuance, retry, renewal and sign-out

### Fresh sign-in

Add a purpose-bound **online session login** challenge to the existing passkey verifier. Bind the
service, session purpose and durable login-attempt identity; derive the account from the verified
credential, not a caller's claimed account ID. Retain the existing RP/origin, user-verification,
challenge, credential-eligibility and transaction-time rechecks. A saved historical receipt or an
offline assertion cannot enter this operation. See the
[WebAuthn assertion verification procedure](https://www.w3.org/TR/webauthn-3/#sctn-verifying-assertion).

Prepare the client attempt under the selected slot owner, including a random retry capability whose
hash is bound into the challenge context. Retrieving an issuance result requires that capability as
well as the original proof; a public attempt ID or copied assertion alone is insufficient. Retain the
capability in encrypted attempt state until resolution. Commit the service session and its exact
finish outcome atomically after proof verification. A repeated identical proof and capability return that session
with its original issuance/expiry; it cannot create another session, resurrect a revoked one, or
extend the deadline. Changed proof under the same attempt is refused.

The service must be able to recover a lost finish reply. Hashes alone cannot reproduce an opaque
renewal secret. Retain a bounded, encrypted issuance result using a **new**, purpose-separated service
custody component, written in the same transaction as the session. This is not a facility currently
provided by the authority signing-key owner. Retire this recovery copy after the client durably seals
the result and acknowledges it, or after a ten-minute issuance-retry window. An acknowledged or expired
attempt never mints replacement credentials. If the result was never saved and can no longer be
retrieved, a fresh online sign-in is required. Delete the recovery copy on revocation, too.

The first service implementation must specify and test this component's exact AEAD domain, key
derivation, nonce allocation, retention and restart behavior before persisting secrets. Session
issuance and replay bookkeeping belong in the account database transaction; do not assume an atomic
transaction spanning the separate authority database. Service backups contain session metadata and,
within the retry window, sealed login credentials. Session-secret logs are forbidden.

The client saves the returned carrier before reporting login remembered. Every completion checks the
slot's live owner and login generation. A late response after lock cannot reopen it; after sign-out it
cannot reinstall the old session. A service-side session whose response was never installed grants
nothing to the browser without its credential.

Initial registration/enrollment remains usable during staged implementation. Do not reinterpret
already completed registration proofs to mint sessions. Combining a future session login with an
already necessary online passkey ceremony requires that purpose in the original fresh challenge and
atomic commit; changing the number or timing of user prompts needs an explicit product walkthrough.

### Renewal and request failures

The unlocked owner exchanges its renewal credential for bounded access, checking service pin, account,
session and deadline. Deduplicate concurrent renewals per owner. A lost renewal response may create
another short-lived access record on retry; it cannot change writing, extend the parent session or
invalidate the retained renewal credential. Bound outstanding access records per session and request
rates. A restart retains session/revocation state while discarding ephemeral access grants.

Use structured outcomes: expired/unknown short access may trigger **one** renewal and retry of the
same already-prepared request; expired/revoked parent session requests online sign-in; insufficient
scope refuses the operation. Neither generic 403 nor an operation's authenticated refusal triggers
blind renewal. A timeout has an unknown outcome and stays with the existing durable operation owner.
Do not retry semantic writes with new IDs or discard the outgoing spool on an authentication failure.

### Sign-out and cross-tab lifetime

One selected login spans that slot's cooperating tabs, not every account on the origin. Sign-out
retires that login in all of those tabs. Use the existing slot coordination and exclusive transition
to stop admission/network work, invalidate live continuations and durably record a signed-out local
generation before reporting success. Remove the renewal carrier. Other slots keep their logins.
Storage failure during this transition must remain visible; memory-only disposal is not a durable
sign-out claim. Lock follows existing owner teardown without this durable login invalidation.

For offline sign-out, preserve only a **revoke-only** outbox item outside the closed factor carrier:
service pin, session ID and its independent random revocation capability. It can end exactly that
login and cannot read, renew, enroll or impersonate it. The service stores its hash and makes repeated
revocation idempotent. This limited capability can be sent after restart without unlocking writing.
It is still excluded from logs and chooser data. A corrupt/missing outbox must not undo the local
signed-out generation; server completion remains unconfirmed. No unsealed renewal secret is retained
to accomplish “background sign-out.” A later sign-in uses a distinct session and is unaffected by an
old queued revocation.

The service serializes revocation against authorization of requests and closes derived streams.
Requests already committed before revocation retain their results; sign-out cannot undo accepted
writing. Async proof verification must recheck session eligibility at the operation's existing
commit boundary. The first implementation uses the single service owner to order this with session
revocation; an earlier HTTP middleware check alone is insufficient. Server restore must invalidate
restored sessions before serving, rather than reviving logins revoked after a backup was taken.
That restore procedure belongs to the later operations work and is not claimed by the current backup.

## 5. Relay and subscription authorization

Mint short-lived relay/subscription grants from a live account session **plus** proof for an exact
scope. Bind account, service, parent session, workspace or attempt, participant/device credential,
permitted operations and expiry. The service derives eligibility from current records. Never accept
the UI's account/room label as authorization. The same scope check applies when opening a stream;
later requests keep the existing signatures, authority proofs and accepted-history rules.

| Scope | Additional proof and authority | May notify about |
| --- | --- | --- |
| Setup | This account's authenticated, retained setup attempt. | Only that attempt's progress. |
| Enrollment/content approval | Authenticated participant and its signed candidate/device proof for this exact attempt. | Only that participant's permitted ceremony/delivery progress. |
| Certified workspace | Device possession, current membership and read capability for this account/workspace. | Changes requiring authenticated authority/content catch-up. |

An invitation can route a candidate into bootstrap; it cannot subscribe to live workspace activity.
Admission and content certification remain different gates. Pending candidates get no workspace
grant; account authentication alone does not grant content history access or future keys.
Each sensitive operation continues to check its own current authority, including after a grant is
issued. Membership changes invalidate or re-evaluate affected grants; they never silently broaden one.
Session, account or credential invalidation closes affected connections and blocks renewal.

Classify the HTTP surface before removing the private bearer: public pin and bounded fresh auth
challenge/finish; attempt-authorized setup/bootstrap routes; account-session routes; and scoped relay
routes. Invitation/proof endpoints retain their narrower authority. None may fall through to a
shared token in the session-enabled host. Keep the development adapter explicitly separate until all
callers are migrated. Fail closed for an old client; do not silently downgrade to shared access.
Same-origin Host/Origin checks, strict body limits, no CORS and no-store remain defense in depth.

## 6. Notifications: fetch streaming with SSE framing

Recommend a same-origin authenticated **POST stream using `fetch` and SSE framing**. The request sends
the short-lived scoped bearer in its Authorization header; use an explicit bounded parser and owned
reconnect loop. Native `EventSource` does not expose custom Authorization headers. This keeps content
submission on the existing HTTP APIs and adds only server-to-client wakeups. It does not introduce
WebSockets, presence, Redis or server-side CRDT processing in the first implementation.
See [the SSE interface and framing](https://html.spec.whatwg.org/multipage/server-sent-events.html).

One active slot owner multiplexes its authorized scope(s) on a bounded stream. A hint says only
“this scope may have changed,” with a connection-local revision if useful for coalescing. It carries
no plaintext, title, device display name, content key or authoritative approval/acceptance result.
Stream IDs and revisions are not durable receive cursors or proof. Heartbeats carry no activity data.
The initial scope is one workspace or one pending attempt; expanding that bound is later work.

**Commit before notify.** Emit only after the existing domain transaction commits. Start with an
in-process advisory broker behind an interface separate from durable storage. A crash between commit
and notification is allowed: authoritative data is already available to catch-up. A future Redis
adapter can fan hints across service instances; it cannot become durable history or authorization.
Redis Pub/Sub itself provides [at-most-once delivery](https://redis.io/docs/latest/develop/pubsub/#delivery-semantics).

**Subscribe before catching up.** Register the authorized subscription and its dirty flag before
sending `ready`. On `ready`, always run authenticated authority reconciliation then durable catch-up
from local cursors. Hints arriving during catch-up set one dirty bit so another pass follows. This
covers the read/subscribe race. Duplicate or reordered hints cannot advance a cursor or change state.
Every reconnect repeats this sequence, even if the client supplies an old event ID.

**Keep a repair path.** While unlocked and eligible, periodically reconcile from durable state even
with a healthy stream (initially 60 seconds plus jitter). Reconnect with capped backoff and jitter;
online/foreground transitions expedite a check. Mobile suspension does not require a live background
connection. While streaming is unavailable, retain a bounded polling fallback. This reduces ordinary
polling without claiming lossless notification delivery.

Add a distinct `remote` wake to the existing sync scheduler: coalesce while busy and respect gates,
backoff and sticky evidence/storage halts. It must never map to manual `retry`, which clears a halt.
Enrollment hints schedule its serialized status read and preserve current focus, inputs and view
state; no page refresh or replacement coordinator. UI jitter needs this behavior even with a stream.

**Bound lifetime and pressure.** Cap stream life at the grant/access expiry and parent session expiry.
Renew while eligible and reconnect through `ready`; an expired stream never extends itself by traffic.
Start with 4 KiB event/partial-frame bounds, one coalesced pending hint per authorized scope and a
bounded output queue. A slow client is disconnected and catches up later. Rate-limit authentication,
grant creation and active streams per session as well as unauthenticated ingress. Exact limits belong
with the first route implementation and its focused boundary tests.

Use a heartbeat shorter than the proxy inactivity deadline (initial proposal: 10 seconds) and a
stream-specific gateway policy. Do not reuse the current 10-second total request timeout. Forward
without buffering/caching, propagate cancellation and close streams explicitly during gateway/service
shutdown before draining bounded requests. Never make shutdown wait for clients to end a stream.
Verify this through the actual packaged gateway, not just a direct backend connection.

## 7. Bounded implementation sequence

Each increment records focused evidence and can be reviewed independently. This is product work,
not a new generalized conformance or release campaign.

1. **Durable session core and HTTP boundary.** Implement purpose-bound fresh login, durable session
   state, sealed exact issuance retry, bounded access renewal and idempotent revocation in a separate
   session-enabled adapter. Cover reply loss/restart, absolute expiry, historical/offline proof
   refusal, wrong-account binding and revocation racing verification. Do not switch the live service.
   **Completed:** [phase 1 implementation and evidence](./account-session-core.md); the live adapter
   still uses its existing development token.
2. **Client ownership and ordinary login.** Add the factor-owned carrier and login generation,
   background renewal, expiry state, Lock/Sign out integration and revoke-only outbox. Walk through
   prompt placement before changing it. Cover two people on one origin, cooperating tabs, offline
   reopen/sign-out and a late renewal reply after sign-out. Keep local admission independent.
3. **Scoped grants and route cutover.** Bind certified devices and pending participants to their
   permitted operations, classify every current route and remove the shared-token bypass in this
   host. Cover wrong-account/workspace/attempt, pending-vs-certified and revoked grants. Switch the
   retained development installation only after a quiet point and backup, preserving its origin/pin.
4. **Live notifications and real use.** Add the broker, authenticated stream, gateway lifecycle and
   scheduler/ceremony wakeups. Cover the commit/subscribe race, dropped hints, restart/reconnect,
   backpressure and lock/sign-out teardown with focused checks. Then use the existing two-device
   flow over Tailscale and stop for the operator to try it.

The completion claim will be remembered account access plus responsive authenticated catch-up across
the existing two-device path. It will not imply additional membership epochs, usable recovery,
revocation/key-rotation journeys, multi-instance hosting or public production readiness. Those remain
the next lifecycle/operations work; history pruning and the current activation checkpoint limit remain
separate. Release qualification resumes only when the intended product exists and the operator asks.
