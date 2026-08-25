---
schema: 1
kind: finding
id: f-138a5f8-libsodium-readiness-timing
status: candidate
type: evidence-weakness
severity: low
confidence: high
introduced_by: 138a5f81ac07d505d9494a899ccf546e383a0684
work_item: B-03
created_by: /root
updated: 2026-08-21
challenged_by: none
superseded_by: none
---

# The reported 37 ms libsodium readiness time measures when readiness was queried, not when the cipher became callable

## Affected requirement or guarantee

TRD §12 requires the synchronous journal seal to be available before the application accepts edits.
Commit `138a5f8` reports libsodium as callable 37 ms after bundle evaluation and treats that duration
as an unsafe pre-seal startup window.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §§6.1, 10.10, and 12 require
write-before-handler-return crash safety and a synchronous reviewed seal; original claim `OC-025`
requires that nonce and crash safety survive page lifecycle failures.

## End-state source

`9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/performance.md` retains the 37 ms statement as
the libsodium startup comparison. The end-state purpose-built module instead compiles and instantiates
synchronously during bundle evaluation, so the historical number is not the selected startup path.

## First introduction and propagation

Introduced at `138a5f81ac07d505d9494a899ccf546e383a0684` by
`test/latency/cipher-bench.ts`, `cipher-bench.device.ts`, and `docs/performance.md`; repeated by the
documentation catch-up. Later `9b49b74` replaces libsodium with a synchronous purpose-built module.

## Reachable consequence

The 37 ms value cannot distinguish a 5 ms initialization followed by 32 ms of fetch/check/UI work
from a 37 ms initialization. It therefore cannot price libsodium startup or support comparisons with a
minimal module. The safety consequence is limited: any asynchronous readiness interval is still an
unacceptable shape if edits can be accepted first, and libsodium was rejected independently for size.

## Supporting evidence

At the exact commit, `cipher-bench.device.ts:start()` fetches `/vector`, calls `agree()` over all
comparable candidates (including `sodium.crypto_aead_xchacha20poly1305_ietf_encrypt`), updates the UI,
and only then loops over `candidate.ready()`. The libsodium `ready()` implementation awaits
`sodium.ready` and returns `performance.now() - moduleEvaluated`. If the promise resolved during the
preceding fetch/check work, that subtraction reports the later query time rather than the resolution
time. If it did not resolve, `agree()` attempts to use libsodium before the required readiness await.

## Counterevidence and disconfirmation attempt

The timer begins after the benchmark module's imports evaluate and therefore does include some of the
async wait on the recorded run. The measured 37 ms is a valid upper bound on “callable by the time the
page queried readiness,” and the successful recorded comparison implies libsodium happened to be usable
before measurement. It is not a timestamp captured at readiness completion, so the claimed attribution
to instantiation does not survive.

## Validation procedure

Capture a bundle-start timestamp before dependency evaluation and attach a `.then()` handler to
`sodium.ready` immediately, storing the first callable timestamp independently of fetches, vector checks,
and rendering. Await readiness before invoking `agree()`. Repeat cold loads and record raw timings and
browser/device versions.

## Disposition

Clarify the 37 ms row as an upper bound from the historical harness or remeasure with a readiness-completion
timestamp. Do not use it as a precise instantiation comparison.
