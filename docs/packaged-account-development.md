# Packaged account application — development integration

2026-10-07. The operator approved compiled account serving, cold offline reopening and update
continuity, with signed intermediate commits. Release validation remains paused.

## Serving and access

Build with `pnpm build`. Run `pnpm serve:account-service` for the retained account APIs and
`pnpm serve:account` for the compiled application and same-origin gateway, in separate processes.
Both use the existing `ACCOUNT_SETUP_PORT` / `ACCOUNT_SETUP_ORIGIN` for public identity and the same
`ACCOUNT_SERVICE_PORT` for the backend's loopback listener (default 53211, distinct from the app port).
Only the service needs `ACCOUNT_SETUP_STATE`. The app's `ACCOUNT_SETUP_DIST` defaults to `dist`; a
separate build directory may be supplied. Retain the exact origin, authority identity and service state.
The host reads its entire build into memory before listening: a running service never mixes releases.
It exposes only compiled assets and known app routes, plus the existing bounded account APIs.
It remains a loopback/Tailscale development service, not a public deployment entry.

The application obtains the public service pin through a same-origin POST and retains it in
`done.account-service.pin.v1`. This is a locator; existing factor/authority owners still authenticate
stored account bindings before exposing writing. A saved pin allows startup without any service request.
An installation without an account service retains the Local-only fallback.

Private adapter access is acquired when network operations first need it. The token lives only in
memory, never in the compiled build, application cache or saved account state. After a 403 the client
may reacquire it once and retry the identical prepared request; uncertain network outcomes are left to
the existing durable operation owner. Every acquisition compares the service pin with the retained pin.
No pin replacement, service identity reset or account membership change follows from a reconnect.
The private bootstrap remains restricted to the configured Host/Origin and JSON POST, without CORS;
it conveys no account authentication or device-membership authority.

The existing TanStack router and credential-owner lifetimes remain in use. Splash/chooser code loads
first, and Local editor/setup/connection modules load on navigation. The service worker precaches all
those modules, checks their integrity, and never caches account API responses. The account preview
label remains because recovery/revocation, general epochs/checkpoints and public operations are unfinished.

## Evidence and continuation

Phase 1: compiled browser signup/invitation survives a backend restart without refreshing the page;
private access renews and the same invitation resumes. API origin refusal, file boundaries and cache
contents are checked. Four focused access tests cover offline config, exact retry, changed pin refusal
and no automatic retry after uncertain results. The existing 45 affected HTTP/scheduler tests pass.
Build, initial-JS budget, origin scan and TypeScript pass.

Phase 2: the two certified accounts close their tabs while offline and with the backend stopped.
Fresh pages load the cached splash, chooser and lazy editor modules, verify the original local factors,
and retain new edits through another offline close/open at both deep editor URLs. Restarting the same
service and reconnecting converges the two additions. All three existing Local-only packaged tests pass;
a previously Local-only installation remembers that fallback while offline, and discovers an account
service when later online. A retained account pin takes precedence over the fallback.

The shell indicates offline availability. Service-dependent actions report the connection requirement
without treating a network failure as an incorrect code. Existing unlock factors are unchanged; a
passkey still has to be available from the user's authenticator/password manager while offline.

Phase 3: two compiled builds retain the same service identity/storage. The new worker waits while
both account editors remain on the previous build, including a further accepted edit while it waits.
After locking/closing, both accounts reopen offline into the new build with queued writing intact;
reconnecting delivers those original updates in both directions. A separate registration interrupted
after saving its passkey proof resumes after the update, retaining the same slot and credential and
finishing account creation. Chooser/ceremony routes display the waiting-update notice too.

The registration test first disconnected too early, before service preparation completed. An explicit
wait for the prepared passkey screen corrected that fixture; the rerun passed. No protocol repair or
release campaign was needed. The four packaged-account cases have passing focused results across the
three phases, alongside the three Local-only packaged regressions. Tests use disposable service/browser
state and tab cold-opens, not a physical-device or process-crash claim.

Run `pnpm build`, then `pnpm test:packaged-account`. The update tests make separate disposable builds;
they never replace the serving build or touch the operator's accounts. Existing storage/schema owners
and update activation policy remain unchanged. Only closing all controlled tabs activates a waiting
build; there is no forced reload or `skipWaiting`.

The live switch retains `https://mbp.tail0e0d4.ts.net:8443/` and internal port 53219. The operator
confirmed the two devices closed; a final built artifact and state backup precede switching serving.
Public deployment, production account sessions, additional membership epochs and key rotation/recovery
product work remain separate.


## Live serving checkpoint before process separation

Implementation commits are signed: `9bb46fde` (compiled serving/access), `d27dc540` (offline startup)
and `20547876` (update continuity). After the operator confirmed both devices closed, the Vite service
was stopped and both SQLite databases, operator key and pin were backed up offline under
`.dev/account-enrollment-tailnet/backups/packaged-20547876-5SQTQb`.

The exact compiled build is retained at `.dev/account-enrollment-tailnet/builds/20547876`. The original
combined process was launched from this worktree/session with the following command. This records the
old launch; after separation, use the two commands below instead:

```sh
ACCOUNT_SETUP_PORT=53219 \
ACCOUNT_SETUP_STATE=.dev/account-enrollment-tailnet \
ACCOUNT_SETUP_ORIGIN=https://mbp.tail0e0d4.ts.net:8443 \
ACCOUNT_SETUP_DIST=.dev/account-enrollment-tailnet/builds/20547876 \
node scripts/serve-account.mjs
```

The live HTTPS check verified all 21 precache URLs against the build and the exact worker bytes
(SHA-256 `08f34ea579aecd376f5499fe41966af92215ff55bb3cadeb0c7b510d739d5072`). Both runtime config and
private access return 200, with the original service pin. No database schema change, account reset,
credential replacement or browser-storage migration was performed. Port `:8443` remains required.
The account preview label remains deliberate. Open once online on each device to install the complete
cache; normal reopening can then use the cached application. The backend is still needed for account
ceremonies and exchanging edits. This serving check did not open personal writing.


## Service separation — phase 1

The private account service now has an explicit lifecycle independent of its application host:

- `account-service/development-runtime.ts` opens the existing retained authority/account owners and
  operator key, provides the public pin and per-open transport token, and owns the directory lock.
- `account-service/development-http.ts` retains the existing routes, Host/Origin checks, request
  framing, no-store responses and ingress bounds without listening or installing signal handlers.
- `scripts/lib/account-application.mjs` composes this runtime with Vite or immutable static serving.
  The two CLI entries select the serving mode; packaged serving no longer imports the Vite entry.
- `account-service/development-state.ts` supplies the exclusive lock shared with the offline upgrader.

Closing the runtime refuses new requests and waits for admitted service operations, even after client
HTTP disconnection, before releasing storage. Closing again returns the same completion. A host startup
failure closes any opened service owner and releases the directory lock. Forced termination can still
leave a lock file: retain the existing instruction to verify the process has stopped before removing it.

`pnpm test:account-runtime` runs five focused native checks. They cover exclusive ownership, retained
identity/pending registration through restart, token renewal, HTTP refusals/bounds, draining after client
disconnect and failed startup cleanup. All five and the five existing offline-upgrade tests pass. Two
packaged browser checks pass against the extracted backend with the existing compiled frontend; the
Vite two-device enrollment/editing/reopen check also passes. TypeScript and scoped lint/format pass.
No build/update campaign or release-validation work was needed for this backend extraction.

The live process described above has not been restarted to adopt this extraction. Phase 2 will separate
application serving and account service into independently operated processes behind the same browser
origin. The current shared private token remains development transport access, not an account session.
Production sessions and public deployment are still separate work.


## Service separation — phase 2

Packaged operation now uses two independent processes. `serve:account` opens the immutable build and
forwards `/__account-setup/…` and `/account/…` requests to the configured fixed loopback port.
`serve:account-service` opens the retained service runtime and serves APIs only, bound to 127.0.0.1.
The application process does not import account owners, read their keys or acquire their directory lock.
The backend pin and passkey RP ID remain those of the public browser origin; the internal port never
becomes a new service identity. The combined Vite runner remains available for coding.

The gateway streams the original method/body, Host, Origin and Authorization. It drops cookies and
forwarding headers, adds no credentials, caches no API responses and never retries. Unreachable service
returns 503, including config discovery: it cannot turn an account installation into a Local-only one.
A lost reply may follow a committed operation; its durable client owner still controls any exact retry.
Partial upstream replies terminate the response. The gateway never follows redirects or selects an
upstream from client input. Both listeners reject new work during graceful shutdown and reap connections
that become idle while existing responses drain.

For this worktree's Tailscale installation, run the account process in one terminal:

```sh
ACCOUNT_SETUP_PORT=53219 \
ACCOUNT_SETUP_ORIGIN=https://mbp.tail0e0d4.ts.net:8443 \
ACCOUNT_SERVICE_PORT=53220 \
ACCOUNT_SETUP_STATE=.dev/account-enrollment-tailnet \
node scripts/serve-account-service.mjs
```

Run the application process in another:

```sh
ACCOUNT_SETUP_PORT=53219 \
ACCOUNT_SETUP_ORIGIN=https://mbp.tail0e0d4.ts.net:8443 \
ACCOUNT_SERVICE_PORT=53220 \
ACCOUNT_SETUP_DIST=.dev/account-enrollment-tailnet/builds/20547876 \
node scripts/serve-account.mjs
```

Tailscale continues forwarding :8443 to the application on 53219. The API-only port 53220 stays on
loopback. Either process can start first; application files remain available while the service is down.
Restarting the app briefly interrupts the proxy but leaves the account owner, identity and token intact.
Restarting the service keeps the same public pin and durable account state while rotating private access;
the existing cached client renews it without downloading a new build. Schema upgrades remain explicit:
stop both processes before using the existing offline upgrade command, whose guard reserves the app port.
Forced termination can still require verified stale-lock removal; there is no automatic state reset.

Focused evidence: ten native runtime/gateway cases plus five offline-upgrade cases pass. The new proxy
checks exercise exact binary forwarding, retained Host/Origin/token checks and body limits, isolation
of static assets, a missing backend, independent restart, no retry after lost/truncated replies and
shutdown with a response in flight. The browser scenario exposed a keep-alive shutdown hang; a directed
native check reproduced it before the drain repair and passes afterward. One initial native fixture
removed its temporary directory before closing the owner; correcting cleanup order fixed that fixture.
The two packaged browser scenarios cover retained invitation/access renewal and both-device queued
writing across independent restarts, offline cold opens, and active editors during service/app outages.
The frontend build stays 20547876; this phase changes hosting only. No release campaign resumed.

At the implementation checkpoint, the old combined live process remains running. Applying this layout
to the retained :8443 installation requires a quiet point, an offline backup, then replacing that process
with the two commands above. No schema, credential or browser-storage migration is involved.
