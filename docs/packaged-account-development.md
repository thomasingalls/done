# Packaged account application — development integration

2026-10-07. The operator approved compiled account serving, cold offline reopening and update
continuity, with signed intermediate commits. Release validation remains paused.

**Current retained installation:** history-management build `95433108`, account schema 26,
authority schema 1, same `:8443` origin and pin. Both network sessions and membership continuation
are enabled. The backed-up restart and actual-origin health checks pass; personal browser uptake
and the history walkthrough are deferred. [History upgrade record](./account-history-management.md)
is the current checkpoint; earlier commands below record historical deployments. Release validation
remains paused until after a version is published and the operator resumes it.

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

The live switch is complete. After signing implementation `7c2061ea` and confirmation that both devices
were locked/closed, stopped the combined process and took an offline snapshot of both databases, operator
key and pin under `.dev/account-enrollment-tailnet/backups/process-split-7c2061ea-5S5QA3`. The two commands
above are now running independently in this worktree/session. Logs are
`/tmp/done-account-service-7c2061ea.log` and `/tmp/done-account-app-7c2061ea.log`.

Live HTTPS verification matches all 21 precache URLs and the exact worker bytes. Config/access return
200 through the gateway, a fresh nonce-bound authority proof verifies with the original public pin,
and pin/key match the offline backup. Wrong Origin returns 403; source/operator-key paths return 404.
Schema remains 11. No credential or browser-storage change was needed, and no personal writing was
opened. Normal use can resume at the same :8443 address with the same cached application build.


## Session-enabled cutover — 2026-10-08

After the operator confirmed both devices locked/closed, stopped the verified API/app processes and
ran the explicit upgrader with `ACCOUNT_NETWORK_SESSIONS=1`. The complete pre-upgrade snapshot is
`.dev/account-enrollment-tailnet/backups/schema-11-zJ6r9i` (schema 11). Build `b17c7700` is retained at
`.dev/account-enrollment-tailnet/builds/b17c7700`. The running commands are now:

```sh
ACCOUNT_NETWORK_SESSIONS=1 \
ACCOUNT_SETUP_PORT=53219 \
ACCOUNT_SETUP_ORIGIN=https://mbp.tail0e0d4.ts.net:8443 \
ACCOUNT_SERVICE_PORT=53220 \
ACCOUNT_SETUP_STATE=.dev/account-enrollment-tailnet \
node scripts/serve-account-service.mjs
```

```sh
ACCOUNT_SETUP_PORT=53219 \
ACCOUNT_SETUP_ORIGIN=https://mbp.tail0e0d4.ts.net:8443 \
ACCOUNT_SERVICE_PORT=53220 \
ACCOUNT_SETUP_DIST=.dev/account-enrollment-tailnet/builds/b17c7700 \
node scripts/serve-account.mjs
```

Logs: `/tmp/done-account-service-b17c7700.log`, `/tmp/done-account-app-b17c7700.log`.
The live public configuration is version 2, with the same pin and session mode. `/access` is absent
(404); wrong-origin configuration is refused (403), source/key paths remain absent, and a fresh
nonce-bound authority proof verifies. Every old row/column in all 15 pre-existing account tables is
identical to the offline backup; pin/key are byte-identical. Account schema is 14.
All 23 precache URLs and the worker match the retained build. Worker SHA-256:
`5a5a4a717016d630b4b1208b03ddb8fd7f90194fc1368bb0a80604cd521aed19`.

The first verification script incorrectly mapped `/` to a filesystem directory; fixing that check to
use `index.html` completed asset verification. No serving defect or data repair was involved.
No personal browser or writing was opened. Existing cached old builds cannot synchronize through the
new host; allow the normal update to install/activate before using online sync. Local writing and
factors remain unchanged. A missing remembered login uses the approved combined unlock or explicit
Connect/Reconnect sync path. Browser-confirmed uptake on the operator's devices is still pending.

This pre-session backup is historical recovery material, not a general session-enabled restore recipe.
Restoring later backups must invalidate restored sessions and change their issuance-custody context;
that operational restore work is still outstanding. The service remains loopback/Tailscale development.

## Live notification cutover — 2026-10-08

The same confirmed quiet point was used after the disposable packaged two-device checks passed. The
current immutable frontend is `.dev/account-enrollment-tailnet/builds/a07de792`; use that path in
`ACCOUNT_SETUP_DIST` in the session-enabled commands above. API and app remain separate, on 53220 and
53219 respectively. Current processes at cutover: API 81162, app 81163. Logs:
`/tmp/done-account-service-a07de792.log`, `/tmp/done-account-app-a07de792.log`.

Offline pre-switch backup: `.dev/account-enrollment-tailnet/backups/notifications-a07de792-2FMkcz`.
No schema migration was needed (schema 14). All 19 account tables, the public pin and operator key are
unchanged. Through live HTTPS, configuration and a fresh authority proof pass, shared access is 404,
wrong Origin is 403 and unauthenticated subscriptions are 401. Source/key paths are absent. All 23
precache URLs and `sw.js` match the retained build. Worker SHA-256:
`427981fbf2526c573f1dd8aab3aacd3e34410b363534d59a077aeaeb0e1f1598`.

The authenticated browser flow was exercised with disposable profiles through the packaged loopback
gateway. The personal Tailscale browsers were not opened; their normal update uptake still needs the
operator's check. They may now reopen at the unchanged `https://mbp.tail0e0d4.ts.net:8443/` address.

Notifications are hints followed by authenticated reads; they carry neither content nor authority.
The broker is process-local, with scoped parent checks, cancellation, bounded buffering, heartbeat
and catch-up after reconnect. Multi-instance fanout and public operations remain later work. The
snapshot contains session state and is **not** a supported restore recipe: restoring service state
must invalidate remembered sessions and change issuance-custody context before serving.


## Device-lifecycle upgrade preparation — 2026-10-08 (superseded by cutover below)

Implementation `2bea3437` passes the focused five-case removal walkthrough and five offline-upgrade
checks. The retained installation above has not changed. Obtain a fresh confirmation that its tabs/app
windows are locked and closed before stopping either process. Retain the exact origin and service pin.

After stopping both verified processes, run the existing explicit upgrader with both
`ACCOUNT_NETWORK_SESSIONS=1` and `ACCOUNT_MEMBERSHIP_CONTINUATION=1`, the retained state directory,
public port 53219, API port 53220 and existing HTTPS origin. It must preserve the complete offline
backup and migrate schema 14 to 20. Start the API with both flags, then the application against the
immutable tested build. Verify the original pin/key, existing table rows, new schema, config capability
and all precached asset bytes through the unchanged gateway before asking the operator to reopen.
No live source cleanup, account reset, key replacement or rollback of acknowledged writing is intended.

This remains development serving. Subsequent admissions/rotations and recovery/checkpoint/retirement
journeys remain gated or unfinished; the account-preview banner stays. A backup containing sessions
still requires issuance-context invalidation before any supported restore.

The tested immutable candidate is now preserved at
`.dev/account-enrollment-tailnet/builds/2bea3437`. Its service worker SHA-256 is
`744682bac7157313fbfc06b7ed897a18051ec69ffbbae1ebbb909cd52f69edde`. The final evidence
checkpoint is `f46978a0` (documentation/test extension only after implementation `2bea3437`).
Read-only listener verification still finds API 81162 and application 81163 on their original loopback
ports. No quiet point has yet been confirmed for this lifecycle upgrade.


## Live device-lifecycle cutover — 2026-10-08

A fresh operator confirmation established the quiet point. Stopped the verified old processes, then
ran the explicit upgrader with both feature flags. The complete offline backup is
`.dev/account-enrollment-tailnet/backups/schema-14-hYJ1yZ`. Schema moved from 14 to 20. Before starting
the API, all 42 prior account rows across 19 tables and all prior columns matched the backup, as did
the authority table, pin and operator key. Both original snapshots and upgraded databases pass
SQLite integrity checks. No account reset, source cleanup or key replacement was performed.

Current launch commands (from this worktree):

```sh
ACCOUNT_NETWORK_SESSIONS=1 \
ACCOUNT_MEMBERSHIP_CONTINUATION=1 \
ACCOUNT_SETUP_PORT=53219 \
ACCOUNT_SETUP_ORIGIN=https://mbp.tail0e0d4.ts.net:8443 \
ACCOUNT_SERVICE_PORT=53220 \
ACCOUNT_SETUP_STATE=.dev/account-enrollment-tailnet \
node scripts/serve-account-service.mjs
```

```sh
ACCOUNT_SETUP_PORT=53219 \
ACCOUNT_SETUP_ORIGIN=https://mbp.tail0e0d4.ts.net:8443 \
ACCOUNT_SERVICE_PORT=53220 \
ACCOUNT_SETUP_DIST=.dev/account-enrollment-tailnet/builds/2bea3437 \
node scripts/serve-account.mjs
```

Processes at cutover: API 29654, application 29655. Logs:
`/tmp/done-account-service-2bea3437.log`, `/tmp/done-account-app-2bea3437.log`.
The application serves the exact already-tested build, not a rebuild of the later documentation commits.
Worker SHA-256: `744682bac7157313fbfc06b7ed897a18051ec69ffbbae1ebbb909cd52f69edde`.

Through the public HTTPS address, both capabilities and the unchanged pin are advertised. A fresh
nonce-bound authority proof verifies. Shared access remains 404, wrong-Origin config is 403,
unauthenticated subscription is 401, and database/key/source paths are absent. All 28 precache URLs
and the worker match local immutable bytes. [Cutover evidence](./development-evidence/2026-10-08-device-lifecycle-cutover.json)
preserves these checks separately from the disposable browser walkthrough.

The operator may now reopen the same address online, allow normal update activation, and check their
writing and ordinary sync on both devices. Close/reopen after update download if the old worker still
controls a page. Personal browser uptake is pending; no personal writing was opened during this work.
The snapshot contains sessions: supported restore still requires session invalidation and a changed
issuance-custody context. The build exposes the first removal/rotation only; later lifecycle and
maintenance obligations remain open, and release validation stays paused.


## Repeatable-lifecycle update prepared — 2026-10-08 (completed below)

Implementation `ea120109` completes the bounded repeated connection/removal product flow, including
current-key replacement installation and another connection initiated by that replacement.
`6387d955` repairs obsolete-grant quota exhaustion during the longer cycle. Both clean disposable
packaged-browser cases pass; the affected grant, transfer and offline-upgrade evidence is recorded in
[the completion checkpoint](./completed.md) and
[product output](./development-evidence/2026-10-08-repeatable-product.log).

The committed implementation was rebuilt and preserved at
`.dev/account-enrollment-tailnet/builds/ea120109`. Its worker SHA-256 is
`7cf78e59314c5caacf196d401098e0730b9d075d8b73f082f3ec44a3e52362fa`.
The rebuild's changes from the browser-tested build are the commit/version identity; build, budget
(109.5 kB initial JS) and origin-isolation checks pass. The immutable directory is local development
state and is not checked into Git.

**Pending quiet point:** live still serves `2bea3437` on schema 20, with API 29654/app 29655 last
observed on 53220/53219. Do not reuse an earlier locked/closed confirmation. After the operator gives
a fresh confirmation, verify those processes, stop both, and run:

```sh
ACCOUNT_NETWORK_SESSIONS=1 \
ACCOUNT_MEMBERSHIP_CONTINUATION=1 \
ACCOUNT_SETUP_PORT=53219 \
ACCOUNT_SETUP_ORIGIN=https://mbp.tail0e0d4.ts.net:8443 \
ACCOUNT_SERVICE_PORT=53220 \
ACCOUNT_SETUP_STATE=.dev/account-enrollment-tailnet \
node scripts/upgrade-account-setup.mjs
```

The upgrader holds the retained-state lock, creates an offline backup of both databases plus pin/key,
and explicitly moves schema 20 to 21. Before starting the API, compare every prior table row/column,
check both databases' integrity and verify pin/key equality against that backup. Start the API with
the same environment as above using `scripts/serve-account-service.mjs`; start the application with
the existing command but `ACCOUNT_SETUP_DIST=.dev/account-enrollment-tailnet/builds/ea120109`.
The origin, ports, account state and service identity stay the same.

Verify configuration/capabilities, a fresh authority proof and every precached URL/worker through the
actual HTTPS gateway. Then ask the operator to reopen and check existing writing plus ordinary sync;
no personal-device removal is required for initial uptake. Preserve the backup and previous immutable
build. A session-bearing backup is not a supported rollback of acknowledged writing: restore requires
session invalidation and a changed issuance-custody context. Recovery, pruning/key retirement and
public operations remain open; the preview label and release-validation pause remain.


## Live repeatable-lifecycle cutover — 2026-10-08

Fresh operator locked/closed confirmation received. The explicit offline upgrade saved
`.dev/account-enrollment-tailnet/backups/schema-20-25xQob` and moved schema 20 to 21. Before starting
the API, every prior account row/column (42 rows, 25 tables), the authority row, pin and operator key
matched the backup. Current and backup databases passed SQLite integrity checks.

Current immutable application: `.dev/account-enrollment-tailnet/builds/ea120109`.
Current processes: API 54398, application 54401. Logs:
`/tmp/done-account-service-ea120109.log`, `/tmp/done-account-app-ea120109.log`.
Use the launch environment in the preceding preparation section, with both API feature flags and
the `ea120109` application directory. Public origin and internal ports are unchanged.

Through the actual HTTPS gateway, configuration retains the original pin and both capabilities;
a fresh authority proof verifies. All 29 precache URLs and the worker match the immutable build.
Wrong Origin is refused, unauthenticated subscription is refused, and private state/source paths are
absent. [Machine-readable cutover record](./development-evidence/2026-10-08-repeatable-lifecycle-cutover.json).

Operator uptake remains pending. Reopen online and allow the normal application update to activate;
close/reopen after download if an old worker still controls a tab. Confirm version `ea120109`, existing
writing and ordinary sync on both devices. The preview label stays; release validation remains paused.
The prior build and the full pre-upgrade backup are retained, subject to the session-restore constraints
above. No personal browser was opened during this cutover.

## Retained-service desktop walkthrough — 2026-10-08

The operator requested computer use instead of personally repeating the writing/sync check. Both
disposable Firefox containers lacked their earlier chooser entries, so the operator authorized a fresh
pair and handled credential saving and content approval. Both editors displayed `ea120109`. The new
pair passed initial Goals transfer, ordinary cards in both directions without page reloads, and
lock/tab-close/chooser-reopen on each device with all writing retained. The joined device reopened
without re-entering its invitation. Both showed remembered logins; another B edit reached A after both
reopens. No application repair or service change was necessary.

[Observation record](./development-evidence/2026-10-08-retained-desktop-walkthrough.json).
This completes the requested desktop walkthrough and leaves both test editors available for use.
It does not establish preservation/update uptake of the old browser accounts, physical-phone behavior,
offline/crash recovery, or a manual removal/replacement cycle. The earlier automated repeated-lifecycle
checks remain their own evidence. B's saved connection/unlock still uses enrollment wording; that
usability detail is recorded without changing the product flow. Release validation remains paused.


## History-enabled retained installation — 2026-10-09

The operator authorized a backed-up restart without a personal history walkthrough. The existing
offline upgrader preserved all retained rows and the original identity while upgrading 24 → 26.
Backup: `.dev/account-enrollment-tailnet/backups/schema-24-AmOFlk`. See the
[history checkpoint](./account-history-management.md) and development evidence for verification.

Current launch commands, each in its own process from this worktree:

```sh
ACCOUNT_NETWORK_SESSIONS=1 \
ACCOUNT_MEMBERSHIP_CONTINUATION=1 \
ACCOUNT_SETUP_PORT=53219 \
ACCOUNT_SETUP_ORIGIN=https://mbp.tail0e0d4.ts.net:8443 \
ACCOUNT_SERVICE_PORT=53220 \
ACCOUNT_SETUP_STATE=.dev/account-enrollment-tailnet \
node scripts/serve-account-service.mjs
```

```sh
ACCOUNT_SETUP_PORT=53219 \
ACCOUNT_SETUP_ORIGIN=https://mbp.tail0e0d4.ts.net:8443 \
ACCOUNT_SERVICE_PORT=53220 \
ACCOUNT_SETUP_DIST=.dev/account-enrollment-tailnet/builds/95433108 \
node scripts/serve-account.mjs
```

This remains a loopback/Tailscale development host, with no boot supervisor or public deployment
configuration added. Application update activation still waits for existing controlled windows to
close. The schema upgrade does not itself create a checkpoint or delete covered history.
