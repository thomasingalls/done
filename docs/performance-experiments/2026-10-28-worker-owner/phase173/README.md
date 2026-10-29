# Phase173 — native state observation independent of frames and truthy Promises

2026-10-29. The full172 admission campaign passed15 ordinary cases but three later fault controls
failed during initial fixture observation;168 journal had similar long-run observer errors. An
isolated frozen-page probe did NOT reproduce the rendering stall, so this packet does not establish
that all old errors were caused by absent animation frames. Preserve that negative probe. It DID
reproduce a false-positive path: the installed Playwright1.62 waitForFunction treats a Promise as
truthy before its false result settles. Installed source and both native browsers confirm this.

Add one bounded host-side observer for coordination/storage state. Page.evaluate awaits the real
predicate result. A monotonic host deadline also bounds unresolved page evaluation; no page timer
or animation frame is required. Only one evaluation is outstanding and unsuccessful observations
wait at most25ms before the next, within the same deadline. Errors propagate; late results earn no
credit. The owning campaign closes its context on failure, draining any pending remote evaluation.
This helper is test machinery only, not background polling or application runtime behavior.

Replace17 state-observer call sites across admission/journal/lifetime scenarios. Keep exact original
10s/10s/8s deadlines, predicates, native effects, assertions, schedules and mutation controls. Independent
AST reconstruction checks all old scenario statements, including every assertion. Each runner hashes
the new executed helper. Six new unit cases and89 focused cases pass.34 native Chromium/Firefox
cases pass, including actual async lock queries, the false-Promise control and a bounded unresolved
evaluation. Type/lint pass. Full original admission15+6, journal17+6 and lifetime13+5 outcomes are
recorded and independently checked below. Earlier failed attempts remain in168/172.

No431 runtime source changes or198domain assignments. All old qualification rows remain identical;
two new test files are required and uncredited:951/405blocked. No changed16ms/2.5s/all-marker/30s gates,
performance acceptance, default worker activation, service automation, preview, signing/push or
release work. Return to Window mirror hot route/era rebinding, then actual async Worker receive,
maintenance, login/ceremony and application integration. This observer repair does not complete the
worker conversion or claim that the reported production input stalls are fixed.
