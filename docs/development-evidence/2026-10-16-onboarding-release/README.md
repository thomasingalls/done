# Production preflight and account locking repair — 2026-10-16

Production preparation began from signed `58b1a12e`. The clean archive, ARM64 image,
31 container boundary cases, disposable restart smoke, 39 exact-frontend browser cases,
and the actual `890fc677` → candidate → compatible rollback → candidate journey pass.
Both original and joined protected profiles retain queued writing, offline undo, reopening
and subsequent delivery. Candidate and predecessor frontend inventories remain unchanged.

Hosted CI then fails in development onboarding. Publication stops. The two-tab test needs
the explicit **Check again** action introduced by storage classification; it now also proves
the unclassified code form is absent. Its ownership, passkey and resumed-phase checks remain.

The timing investigation finds a real lifecycle defect: `close()` aborts the coordinator,
then publishes `unlock` while outstanding work and storage cleanup are still draining.
That form cannot accept input. The repair publishes working/locking progress until the
successor coordinator starts. Factor verification, capability retirement, native drainage,
setup ownership, metadata fencing and stored formats are unchanged (SC-03/SC-08).

Choose evidence before repair: a held-request unit counterexample fails on the original
state. A native browser case holds the setup-metadata lock while locking an account with
an edited name, proves no editor/code form is shown, then releases cleanup and reopens with
the same code and retained writing. The corrected case passes on Mac and Linux ARM64.
An isolated Linux old-state control fails at that exact assertion. The initial browser
fixture incorrectly expected the title in a status paragraph; its failed attempts remain.
The Mac negative control fails earlier in setup and is **inconclusive**, not mutation credit.

All 153 unit files pass: 1,797 cases plus the unchanged named skip. All 19 prior development
cases pass, and the new case passes separately. This holds for Mac and Linux ARM64; it does
not claim a replacement for the failed AMD64 hosted run. All 175 adapter/registry cases,
TypeScript and changed-file lint pass. The +1 exact unit denominator is 2,455. All 860
obligations, 319 unresolved entries, prior assertions, deadlines and release blocks remain;
crypto domain labels, sites and classifications are unchanged. Only one runtime source
hash changes. The new browser case's existing file remains blocked for aggregate credit.

`summary.json` records failures and limits; compressed logs preserve them. `repair-source-pins.json`
binds this repair, and `artifact-index.json` binds this packet. The publication-only upgrade
probe and historical UI helpers are retained as `.txt`; copy them into the corresponding
clean archive's `test/packaged-account` paths to reproduce with
`DONE_PREDECESSOR_DIST` naming the extracted `890fc677` frontend. No runtime instrumentation
is installed in either image. Browser services are disposable host Node 24 services;
container API boundaries have their separate smoke and runtime checks.

The preflight image remains local and is **superseded for publication by this repair**.
Next: sign the repair, rerun hosted CI, build the signed source, repeat affected exact-image
checks, verify application merge/source agreement, publish that tested image, then prepare
the infrastructure PR and verify rollout. The isolated infra pin/render check is preparation
only. Production, port 8443, user storage, credentials and routes are unchanged.
General release qualification remains paused.
