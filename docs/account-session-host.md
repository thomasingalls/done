# Session-enabled development host

2026-10-08 · sessions/subscriptions phase 3d · implemented; retained-installation cutover pending.

The host composes the existing public pin/authority proof, fresh authentication and
attempt-capability setup routes with the session/grant-protected content adapter. Bootstrap has a
closed route list; unknown paths and `/__account-setup/access` cannot fall through to the private
adapter. Existing signatures, passkey checks and attempt capabilities remain the authority for each
bootstrap operation. Responses are no-store; origin, framing, request-size, concurrency, rate and
request-lifetime bounds apply before domain dispatch.

`ACCOUNT_NETWORK_SESSIONS=1` selects this host in either the separate API process or Vite composition.
It exposes configuration version 2 with the pin and `networkSessions: true`, without a shared bearer.
Existing fixture/private mode stays separate. Starting on retained schema 11 refuses until the same
flag is passed to the offline upgrader. The upgrade retains identity, uses the existing exclusive
lock/port guard, and snapshots both databases, pin and operator key before opening schema 14.
An ordinary restart cannot implicitly perform that upgrade or reopen schema 14 in private mode.

The packaged client remembers transport mode beside its public pin, without network credentials.
An older installation that retained only a pin selects sessions in the new build, even offline;
network use against an old server fails rather than downgrading. An explicitly discovered private
fixture retains its private mode, but detects a later session configuration before acquiring private
access and asks for owner reopening. A session-configured owner never falls back to the shared token.
All local factor, binding and writing checks remain independent of the public locator/configuration.

Focused host, upgrade and packaged-client checks are in `test/account-sessions/host.test.mjs` and
`test/privateAccess.test.ts`. The disposable packaged scenario in
`test/packaged-account/sessions.spec.ts` exercises enrollment, both editing directions, API restart
and offline reopening. The packaged scenario passes through the real compiled application, gateway and two independent
Chromium profiles with virtual passkeys. It covers both editing directions, queued delivery across
service restart and offline cold reopening/reconnection. The creator explicitly connects its missing
login; joining enrollment uses the combined assertion. No `/access` request is made by this session flow.

The browser test found two integration defects missed by the component fixtures: native `fetch`
requires the global receiver when retained in a class, and expected admission/certification changes
invalidate cached grants. The transport now binds `fetch` correctly. The ceremony owner can retry an
authority-change refusal once, reopening its permit and reauthenticating bootstrap against saved
progress before continuing. Competing heads still require restart; semantic proofs remain retained.
The transport itself still does not blindly retry authority-refused writes.

The affected session/runtime/gateway/upgrade group passes 115 Node tests, and four affected client
Vitest files pass 33 tests. TypeScript, scoped lint/format, build, initial-JS budget and built-origin
scan pass. These are focused implementation checks, not release qualification.

The retained `:8443` service is unchanged at this point. Live cutover requires a quiet point and
backup; notifications and the operator's two-device trial follow. Release qualification remains paused.
