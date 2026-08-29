---
schema: 1
kind: finding
id: f-5bd9552-origin-scan-static-forms
status: repaired
type: evidence-weakness
severity: medium
confidence: high
introduced_by: 5bd9552b38d12e2c8b51bd490d2b78c64351eaa7
work_item: B-01
created_by: /root
updated: 2026-08-29
challenged_by: root-v01-20260826
superseded_by: none
---

# `The A1 build check can report no remote subresources while built code can fetch or construct one`

## Affected requirement or guarantee

OC-079 requires a web-security baseline for the browser origin as a cryptographic boundary. Row 17 addendum A1
claims “No remote subresource in the key-holding origin” and marks `scripts/check-origin-isolation.mjs` as the
build-failing CI verification that is effective now.

## Original source

At `c6116669030eedeea3d599bca0da3547114e6930`, PRD §7.12 and TRD §§10.9/13.11 require the key-holding origin's
controls to be verified; TRD §15 row 17 leaves the concrete profile open. The falsifier in OC-079 is an unreviewed
third-party script or the absence of a versioned control profile.

## End-state source

At `5bd9552b38d12e2c8b51bd490d2b78c64351eaa7:scripts/check-origin-isolation.mjs` lines 41–49, the failing
`FETCHING` list recognizes only literal HTTP(S) URLs in `src`/`href` attributes, CSS `url()`/`@import`, static or
dynamic ESM imports, and `importScripts`. Lines 95–99 classify every other literal HTTP(S) URL as a non-failing
mention. There is no failing matcher for `fetch`, `XMLHttpRequest`, WebSocket/EventSource, DOM
`setAttribute`, worker constructors, evaluated fetched code, or URLs assembled from parts. Line 120 nevertheless
prints “no remote subresources; the key-holding origin is first-party only”.

## First introduction and propagation

The scanner and the row-17 claim are introduced together in
`5bd9552b38d12e2c8b51bd490d2b78c64351eaa7`. They propagate to `package.json`'s `build`, TRD §§10.9/13.11/15,
the row-17 selection, the generated ASVS profile, progress, and end-state claim E-20.

## Reachable consequence

A future dependency or app edit can put `fetch("https://third.example/code")`, a constructed remote URL, or a
DOM loading form outside the regex set into built JavaScript and still receive a green A1 result. If the fetched
bytes are executed or influence code in the key-holding origin, that third party can use live key handles and
read/modify plaintext, violating confidentiality and integrity at the origin boundary. The configured tip's app
source currently shows no third-party runtime resource, so this is a false assurance gate rather than a demonstrated
present compromise.

## Supporting evidence

The scanner's finite regex list is the complete failing oracle. Its separate `ANY_URL` loop logs non-matching URLs
but never adds them to `violations`. The selection itself states that built-output scanning is meant to catch a
dependency-injected CDN URL, and that any third-party asset is inside the trust boundary regardless of SRI; those
arguments apply equally to remote loads expressed through an unrecognized syntax.

## Counterevidence and disconfirmation attempt

I tested whether “subresource” was deliberately narrower than all network access. The file's opening claim and A1
are trust-boundary statements, and its comment calls the enumerated forms “constructs that cause a fetch”; a remote
script inserted with `setAttribute`, or fetched then evaluated, has the same trust consequence. I also searched the
configured tip outside docs/tests/scripts for remote app loads. Only same-origin service-worker `fetch(request)`,
development/relay URLs, and metadata appeared, so no current violating party was found. That null result lowers
current exposure but does not make the build check complete.

## Validation procedure

1. Build a disposable exact-tip snapshot.
2. Add one built fixture at a time using literal `fetch("https://third.invalid/x")`, XHR, constructed URL pieces,
   `setAttribute("src", ...)`, and fetched-code evaluation.
3. Run `node scripts/check-origin-isolation.mjs`; current unmatched forms exit successfully.
4. Define A1's exact allowed network graph, then test the built artifact with a parser/bundler manifest and runtime
   CSP/connect/resource policy rather than treating a regex list as complete.

## Disposition

Validated by `V-01`. Narrow the success message and row-17 evidence to the syntaxes actually scanned, or
replace/supplement the scanner with coverage over all allowed resource and connection channels plus negative fixtures.

**Repaired — 2026-08-29** under the authorized `S0-10` disposition workflow (`docs/review/README.md` §Finding lifecycle states the standard; `remediation/traceability.md` is the
generated finding→falsifier matrix). The defect's return is refused by `check-origin-isolation.mjs`,
its claim narrowed to its scanned syntaxes at the `S0-1` return with the `originOf` discard-set repair.
