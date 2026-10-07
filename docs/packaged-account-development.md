# Packaged account application — development integration

2026-10-07. The operator approved compiled account serving, cold offline reopening and update
continuity, with signed intermediate commits. Release validation remains paused.

## Serving and access

Build with `pnpm build`, then use `pnpm serve:account` with the existing `ACCOUNT_SETUP_PORT`,
`ACCOUNT_SETUP_ORIGIN` and `ACCOUNT_SETUP_STATE`. `ACCOUNT_SETUP_DIST` defaults to `dist`; a separate
build directory may be supplied. Retain the exact origin, authority identity and service state.
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

Phase 3 will check packaged update continuity. The live preview is not yet switched. Tests use
disposable service/browser state and tab cold-opens, not a physical-device or process-crash claim.
