# Rapid-reopen session liveness

Base: signed `47466b84`. See the [renewal contract](../../account-session-renewal-window.md).
Disposable fixtures only; no deployed service, personal browser data or release campaign changed.

## Results

- `before.log.gz`: the new renewal-window controls on the previous service return **four failures
  and five passes**. Each failure reaches the ninth-token `capacity` refusal, including retry after
  an injected failure and ignored successful replies. This run preceded formatting and the extra
  oldest-token-use assertion; the final source hashes are recorded separately in the manifest.
- `core-client.log.gz`: **53 passing tests**, including the nine new window controls, 20 successive
  cold client owners using one remembered login without a service restart, and existing ceremony
  reuse. Tokens are distinct, only the newest eight remain usable, use does not promote an older
  issuance, expiry does not slide, and raw access tokens do not appear in persisted session rows.
  Invalid renewal, before/after-commit faults, lost successful replies, other logins and current
  account/credential/key/expiry changes are exercised. Existing cases retain cross-owner revocation,
  commit/late-result boundaries, sign-out and offline local opening.
- `transport.log.gz`: **39 passing tests** across scoped client, grants, HTTP and actual process
  restart. Two new controls retire the browser's cached access before grant acquisition or during
  signed proof submission: the client renews once, signs a fresh device proof and sends the protected
  semantic read once. Existing controls retain membership changes, wrong scopes, parent revocation,
  captured request bytes, bounded denial and close/sign-out invalidation.
- `lifecycle.log.gz`: **two passing packaged journeys** with reduced original/joined fixtures,
  reader-only service-worker update, another ordinary device, two rotations, lost-reply and interrupted
  activation recovery, offline writing and detached editing. The former backend restart after the
  second removal's lost reply is removed. That journey reports **20 observed renewal responses, all
  200**, and keeps its original assertions/timeouts. This count is across the observed pages; the
  Node client control separately establishes 20 reopens of one remembered login.
- `build.log.gz` and `checks.log.gz`: TypeScript, Yjs patch, ordinary packaged build, origin isolation,
  scoped lint/format and whitespace checks pass. Initial JS: **138.4 kB / 350 kB**.

The original reader-first failures and workaround evidence remain in the
[previous packet](../2026-10-13-local-retention-reader-rollout/README.md). They have not been relabelled
as uninterrupted recovery. The lifecycle log still contains expected authority/grant refusals during
membership changes; those checks are retained. Existing hidden blocked-state control text appears in
the diagnostic status dump; the fixture independently asserts active workspace status and successful
editing/reopening on every final owner.

## Reproduce

```sh
node --test --test-timeout=15000 test/account-sessions/renewal-window.test.mjs test/account-sessions/core.test.mjs test/account-sessions/client.test.mjs test/account-sessions/ceremony-login.test.mjs
node --test --test-timeout=15000 test/account-sessions/scoped-client.test.mjs test/account-sessions/http.test.mjs test/account-sessions/grants.test.mjs test/account-sessions/restart.test.mjs
ACCOUNT_BASELINE_READER_FIRST=1 ACCOUNT_BASELINE_READ=1 ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_RETENTION=1 node node_modules/@playwright/test/cli.js test -c playwright.local-baseline.config.ts test/local-baseline/lifecycle-owner.spec.ts
node scripts/check-yjs-patch.mjs
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
node scripts/check-budget.mjs
node scripts/check-origin-isolation.mjs
```

Loopback/native browser tests require normal local server permissions. Run the packaged cases
serially on ports 53221/53222. Their private writer prepares disposable reduced stores; after the
reader update, installer/retention are both off, and the fixture checks conversion denial. The
ordinary build defaults remain reader on, installer off, retention off.

To reproduce the ninth-token refusal, use an isolated checkout of this phase's test sources with
only `account-service/sessions.ts` restored from `47466b84`, then run the renewal-window file.
Do not replace a running development service or deployed files for this control.

`manifest.json` records final source and evidence hashes. Generated databases, browser profiles and
bundles under `test-results/` are disposable output, not publication artifacts. This packet does not
measure performance, real-phone behavior, multi-process service limits or the product conversion
journey. No compatible rollback container has yet been published for the reader-first build.
