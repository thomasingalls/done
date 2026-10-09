# F-17: physical Pixel 9a companion measurement

## Decision and scope before measurement

The private Local handoff passes its prospective Node comparison but fails the unchanged CPU-4x
application gate at 63.5 ms card-typing p95. Measure the reference and candidate on the author's
physical Pixel 9a before choosing another optimization. This companion study asks whether that
hardware has the same practical latency problem and whether the candidate helps there. It does not
replace the failed emulation receipt, automatically authorize default activation, qualify all Android
devices or decide the supported low-end device set.

Use the current reference R and private candidate C from the preceding functional/performance
checkpoint. Production builds share dependencies and source; C differs only by the Local opener's
`local-handoff` argument. Preserve their source/build hashes and keep the installed personal app,
Tailscale route, relay, existing phone writing and default source opener unchanged. Serve new test
origins through a USB loopback connection. Refuse pre-existing storage at a chosen test origin.

Run four independent test-origin sessions in fixed order **R, C, C, R**, with fresh synthetic data
each time. The corpus is the existing 20 days × 15 cards plus 400 Goals lines, seeded through the
editor and verified after locking/reopening. Preserve the Pixel's actual viewport and browser; apply
no artificial CPU or device-metric emulation. The desktop suite's forced 1280×900 viewport must not
be reused. Adapt only setup navigation to open/close the narrow-screen Goals drawer. Retain an exact
adapter/source diff; this is explicitly a companion measurement, not the unchanged desktop runner.

Measure startup/unlock/replay, compose typing, card typing and focus using the existing recorder and
timing boundaries. Collect exactly 120 trusted automated keys with the original 50 ms gaps for each
typing surface. Retain every raw timing and verify exact resulting text. Automated keys describe
that input path; a separate operator-driven soft-keyboard exercise covers ordinary typing,
composition/autocorrect, undo and lock/reopen without calling it the same quantitative experiment.
Use the original numerical budgets as reported comparisons: typing <16 ms p95, focus <50 ms,
cold application work <2500 ms, warm application work <1000 ms and content replay <500 ms. Do not
change a budget based on observations. Navigation timing remains in the existing desktop gate and
is not a claimed quantitative outcome of this bounded phone companion.

The exposure unit is a fresh-origin session; observations are keys/events nested in sessions on one
phone. Report per-session p50/p95 and paired R/C contrasts for the two opposite-order pairs. Do not
pool keys into independent device replicates or manufacture confidence intervals from four sessions.
Record device/OS/Chrome versions, actual layout/visual viewport, display cadence, battery/thermal
state where readable, and session order. Keep the phone awake and otherwise idle; no screencasting,
CPU profiling or concurrent host tests during timings. Temperature and battery observations may flag
order effects; they do not prove their absence. A single phone is not a fleet sample.

Stop at four sessions, an immediate semantic/input failure, a 10-minute session deadline or a
45-minute overall deadline. Keep partial output and failed attempts. Do not rerun an unfavorable
valid timing. Connection and untimed setup checks occur before the measured campaign and are
identified separately. A disconnection, backgrounded page or wrong-origin interaction invalidates
that session rather than silently substituting another one.

## Operator boundary and preparation status

The user controls USB authorization and phone/browser actions. The measurement adapter must be
restricted to a dedicated test tab/origin and started by an explicit operator action. It must not
launch or force-stop the user's browser, close unrelated tabs, inspect existing writing or clear
browser-wide storage. Cleanup is limited to the test's servers, USB forwards and test origins.
Keep the existing desktop browser owner/fixture unchanged; it intentionally owns and terminates its
browser and is unsuitable for a borrowed personal browser.

At preparation time the Mac sees a Pixel 9a USB device, but adb reports no debugging device under
either its native or libusb Mac backend. The operator is checking USB debugging. Google Platform
Tools 37.0.1 are downloaded only under `/private/tmp/done-pixel9a`; the dedicated adb server uses
port 5047. Its attempted `ANDROID_USER_HOME` override is unsupported by this adb binary: it created
the ordinary `~/.android/adbkey` pair. This is a USB authorization key, not a done custody key.
No phone benchmark has run and no default activation follows from this preparation.

[Previous comparison](./f17-local-performance.md).


## Connection and build checkpoint

The Pixel became authorized after the operator toggled USB debugging and reconnected. Read-only
metadata reports Android 17; the preparation battery reading is 80% and 34.0 °C while powered. Both
production variants now build successfully (11 files each). The first candidate transform refused
because Vite had already transformed the matched TypeScript; moving the exact source replacement
to the load hook repairs the fixture. The original build failure is retained. No product source
changed, and this is an untimed setup repair, not a measurement retry.

Four fresh R/C/C/R origins and one connection-check page are served on owned loopback ports, with
USB reverse forwards limited to those ports. The operator has been given the connection-check URL.
The page reports only its own origin's empty storage and browser capabilities. The physical adapter
and operator-started measurement are still pending; no application timing has run. Current temporary
server/session details and frozen build inputs are under `test-results/pixel9a`. The server expires
after one hour and removes its test forwards. The dedicated adb server remains to be stopped after
the phone session finishes; no browser-wide cleanup or personal-data migration is part of this work.

## Connection-page repair before measurement

The operator reported that tapping **Check connection** did nothing. The generated inline script
failed to parse: an escaped newline in the server's template became a literal newline inside a
JavaScript string. This was a fixture defect, reproduced without reading the phone browser. The
repair preserves the escape and checks the generated script at server startup. The page now has
an initial status, a checking status, a short root URL and a useful missing-page response. Local
HTTP verification confirms that the served root returns 200 with parseable JavaScript and a missing
path returns the intended 404 text. The operator subsequently confirmed **Connection verified**;
the received preflight identifies Pixel 9a, Android 17 and Chrome 152.0.7977.83, with screen 412×924
CSS pixels, layout viewport 411×785, DPR 2.625, secure APIs and empty origin storage.

Only the owned test server was restarted; no measured session had begun. Before/after server
scripts, session configurations and the reproduced syntax failure are retained under
`test-results/pixel9a/preparation/connection-repair`. Automatic approval review rejected opening
Chrome's debugging endpoint because it could expose unrelated tabs and sessions. That connection
was not opened. The repaired connection check uses only the existing USB loopback forwards; any
measurement adapter requiring broader browser access remains a separate authorization question.

## Prepared measurement adapter; authorization pending

The temporary `driver.mjs` and `run.mjs` reuse the repository's recorder and locked store census.
The driver opens/closes Goals using the application's narrow-screen shortcuts, sends trusted touch
and key events, preserves the native viewport and checks exact content after seeding and after
reopening the measured card. The original 50 ms inter-key pause is retained; actual trusted event
timestamps are recorded so USB/driver overhead in the delivered cadence remains visible. A 60-frame
requestAnimationFrame interval sample is collected separately from typing. The driver reports every
timing budget after collecting a session and stops immediately for semantic or input failure.

An untimed driver smoke check passed in a newly owned desktop Chromium with a 412×785 viewport,
2 days × 2 cards, 10 Goals lines and 4 keys per surface. This checks setup/instrumentation only;
its timings are not Pixel evidence. The first smoke invocation failed before launch because it
requested the wrong package name; both logs are retained. The physical server also now serves a
minimal empty HTML route so freshness can be checked before application startup creates storage.

The prepared connection requires explicit operator approval before use. USB forwarding would make
Chrome's debugging endpoint accessible to the Mac, including other tabs' metadata and the ability
to access their sessions. The runner filters the tab list in memory for the exact connection-page
URL, refuses ambiguous matches, and attaches only to that page's socket. It never writes the other
tabs' titles/URLs to evidence. Its command allowlist has no browser-wide, target-management, cookie,
screenshot or storage-clearing methods. Page evaluation checks the allowed test origin and visibility
before inspecting DOM/storage, and navigation is restricted to the five test origins. These runner
restrictions do not make the underlying Chrome endpoint itself tab-scoped.

Four sessions are fixed before execution; an existing campaign directory cannot be overwritten.
The runner retains partial results on failure, per-session battery readings, exact raw typing
samples, observed event cadence, source/build identities and synthetic test factors in a local
mode-0600 file for the later manual recovery exercise. Those factors belong only to disposable
synthetic workspaces. It removes its init script and owned debugging forward when finished without
closing Chrome. The server's USB reverse forwards have their own expiry/cleanup. The manual keyboard
exercise, physical measurements and default-activation decision remain pending.

## Authorized phone setup attempt

The operator explicitly authorized the Chrome debugging connection and the four-session driver.
The first attempt opened the intended test tab and verified a fresh origin, then stopped because
the driver read the generated factor before the asynchronous save-code UI appeared. A subsequent
inspection of that exact test tab found the expected save-code state and code element. The missing
element wait is repaired in the adapter. No product source changed.

The original attempt is retained under `test-results/pixel9a/preparation/phone-setup-attempt-1`,
including its 261.3 ms fresh-prompt observation, failure, frozen adapter and post-failure inspection.
No corpus had been seeded and no typing measurement was collected. This abandoned setup attempt
does not count as a completed comparison session. The four-session comparison will use fresh
origins and the repaired readiness wait, with its new adapter bytes preserved. The failure is not
silently replaced, and the original fresh-prompt observation remains part of the evidence.

Further phone setup checks exposed three driver assumptions that the desktop smoke check did not:
bulk insertion returns before the editor applies it; a tap can return before focus/selection changes;
and keyboard transitions move the target viewport. The adapter now waits for exact setup insertion,
the intended focused field, stable target/viewport geometry, and the trusted tap's click before
reading the new selection. These waits precede measured input; key sampling and budget thresholds
are unchanged. Direct diagnostics found the entire expected bulk text and the exact scheduling
phrase, with the latter inserted at the tapped selection rather than the selection captured too
early by the driver.

The second startup attempt is retained under `phone-setup-attempt-2`; its fresh prompt and creation
observations are 239.2 ms and 313.2 ms. The unmeasured driver checks under `phone-adapter-smoke-1`,
`phone-adapter-smoke-2`, and `phone-adapter-smoke` preserve subsequent failures and diagnostic
observations. The last check seeded and cold-verified the full corpus on C, then stopped during
the scheduling selection check. A focused follow-up using the repaired click boundary passed
scheduling and four trusted card keys with exact text verification. This is component-level driver
qualification, not a successful full four-session comparison or a replacement for card recovery
verification in that comparison. All diagnostic observations remain outside its four sessions.

The corrected driver is frozen before restarting the fixed R/C/C/R comparison on fresh origins.
No unfavorable valid comparison timing is discarded or retried, and no product build changes.

## Four-session outcome — September 15 locally

The fixed R/C/C/R campaign completed on September 14, 22:16–22:28 UTC, without a retry.
Card p95 was **107.9 / 87.1 / 86.9 / 108.3 ms**: C was 19.3% and 19.8% lower within the two
opposite-order pairs, but all four sessions failed the unchanged <16 ms card budget. Compose p95
was 14.8 / 14.4 / 14.2 / 15.7 ms. Every other measured budget passed. All 960 trusted-key samples
survived; every full-corpus and exact edited-card cold-reopen check passed.

The native typing viewport was identical across runs: 411.43×403.81 CSS pixels, DPR 2.625, with the
keyboard open. Actual median event gaps were 67.7–68.0 ms in compose and 140.9–158.8 ms in cards:
the 50 ms pause follows command completion, so this is not equal delivered cadence. Separate frame
interval medians were 16.6–16.7 ms. Battery temperature rose from 34.6 to 37.6 °C at 81% charge.
Keep these cadence and period effects visible when interpreting the one-phone comparison.

The independently verified [evidence packet](./account-conformance-runs/2026-09-15-f17-pixel9a/README.md)
preserves full precision, exact frozen adapters/build metadata, all setup failures and diagnostics.
The Chrome debugging connection was removed at completion. The operator's on-screen keyboard,
composition/autocorrect, undo and lock/reopen exercise remains next; then diagnose the residual
card cost. Keep the candidate private and F-17 partial. No product build, default activation or
release-runner obligation count changes follow from this companion result.

## Operator disposition after measurement

The operator ends the physical-device work here, including the pending manual keyboard exercise.
The frozen packet retains the state at campaign completion; that exercise was not executed.
The fixture server, its five owned reverse forwards and dedicated ADB server are now stopped.
Keep the emulation reference and use roughly 1.5 times card-typing latency for planning, based on
87.0/63.5 = 1.37 for C and 108.1/69.4 = 1.56 for R across separate runs. This is an approximate
comparison, not a calibration for other metrics. Resume [candidate profiling](./f17-local-profile.md).
