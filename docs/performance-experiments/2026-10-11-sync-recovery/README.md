# Sign-in warnings and one-way receiving

2026-10-11. Follow-up to the signed compaction repair `ae30694a`, based on deployed runtime
`203a0655` / main merge `e948c52a`. These are focused incident repairs. Release qualification
remains paused. The repairs described here have not been published or exercised on the real
phone with an updated application.

## Separate incidents

The preceding incident affected both lanes: the user found **Reconnect sync**, approved the
account passkey on both devices, and confirmed two-way delivery resumed. That established a
login requirement, not why the login needed renewal. Ordinary lane retries cannot perform a
passkey assertion, but their status called this `network-unavailable`.

In the new incident, reconnecting both devices and retrying receiving did not help the phone.
The user confirmed a new phone edit reached the desktop. With permission, Chrome's USB debugger
observed two receive attempts on the actual phone: membership discovery returned 200, then
`/account/history/v1/checkpoint` returned 409 / `unavailable`. No `read-v2` request followed.
The fixed notice and Account details called this `receive:network-unavailable` too.

Only route names, status, elapsed time and enumerated refusal fields from those requests are
retained in [phone-receive.json](./phone-receive.json). No real writing, request bodies, keys,
tokens, account identifiers or device identifiers are retained. No real browser state was edited.

## Clock evidence and reproduction

Thirty serial `/healthz` reads through the phone measured a **656–717 ms lead** of the phone's
clock over the application's HTTP Date clock. This is the intersection of per-request bounds
including whole-second header rounding and request/response transit, not a statistical confidence
interval. Round trips ranged from 32 to 41 ms. See [phone-clock.json](./phone-clock.json).
The app and API share the deployed pod's host clock.

Every history request builder used `Date.now() + 60000`. The service rejects requests whose
expiry exceeds its current time by more than 60000 ms, then checks expiry again at commit.
Thus a fast device has no clock margin at all: a small positive skew exceeding the request's
preparation/transit time makes it invalid. The broad history catch returns `unavailable`;
the client maps that to `network-unavailable` and stops the receive pass before ordinary reads.
Shorter-lived membership and delivery requests can still work.

`test/packaged-account/history-clock.spec.ts` reproduces the same one-way failure with two
disposable devices of one account and a +700 ms clock offset in only the receiving renderer. Its
upload reaches the first device, but the reverse edit does not arrive within 15 seconds and
history returns repeated 409 / `unavailable`. The failing output is retained in
`checks/clock-before.log.gz`; all text and identities in that test output are synthetic.
The baseline bundle included the sign-in-warning work but retained the old history lifetime.

The same test passes after using a **30-second request lifetime within the unchanged 60-second
verification limit**. All six construction sites use the shared sender constant: routine catalog
and latest-checkpoint reads, maintenance exchange, maintenance baseline lookup, history source
replay and membership replacement source lookup. The protocol format, signed binding, server
upper bound and commit-time expiry check are unchanged. Large clock errors can still fail;
this adds headroom rather than trusting a remote clock or accepting expired evidence.

## Actionable login status

The composed scheduler now distinguishes `sign-in-required` from a retryable network result and
stops scheduling futile lane requests while explicit connection is required/in progress. A login
subscription wakes work after success; it cannot clear a lane's separate conflict/integrity halt.
Cancelling the passkey prompt preserves Connect/Reconnect status when another prompt is required.

After the existing 30-second online notice delay, the fixed notice explains that sync needs an
account passkey check and offers **Connect sync** / **Reconnect sync**. Account details keep the
lane codes/positions and the existing login controls. Ordinary retry remains per-lane for other
failures. Offline suppression and local editing remain. A status update also refreshes the notice's
clock, fixing a case where a later lane deadline could remain hidden after an earlier timer fired.

This does not classify every `unknown` transport outcome: history's broad refusal remains coarse
on old and new clients. The actual phone's measured clock-skew failure is repaired at its source.
No service data repair, browser reset, slot recreation or new enrollment is involved.

## Focused checks

- 23 scheduler/UI unit tests pass, including independent halts, initial/during-request login gates,
  reconnect action, offline handling, cancellation and delayed notice visibility.
- 17 existing/new login client cases pass, including two cancelled-prompt controls.
- 15 history service cases pass, including the old +700 ms refusal, new requests at -5 s, +700 ms
  and +5 s skew, and unchanged expired/overlong request refusal. The first invocation lacked
  sandbox permission to bind its HTTP fixture; the rerun with localhost access passed.
- Two serial packaged Chromium cases pass: skewed-device two-way writing and actual passkey
  reconnect through the fixed notice without a reload. The latter is repeated on the final build
  after the cancelled-prompt change; see `checks/login-browser-final.log.gz`.
- TypeScript, scoped lint/format, production build, origin isolation and the 350 kB initial-JS
  budget pass (136.7 kB gzipped). No broad campaign or release inventory was run.

Commands:

```sh
node node_modules/vitest/vitest.mjs run test/accountSyncDriver.test.ts test/syncNotice.test.tsx
node --test --test-timeout=15000 test/account-sessions/client.test.mjs
node --test --test-timeout=20000 test/account-history/service.test.mjs
node node_modules/@playwright/test/cli.js test --config playwright.packaged-account.config.ts test/packaged-account/history-clock.spec.ts test/packaged-account/sync-login.spec.ts
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
node scripts/check-budget.mjs
node scripts/check-origin-isolation.mjs
```

Next: commit these repairs and prepare the tested image for publication, then verify the real
phone receives again after updating. The clock diagnosis combines a real failed route/clock
observation and a matching controlled reproduction; recovery on the actual phone is still pending.
