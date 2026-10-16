# Phase 16 — Upgrade fixture listener belongs to its runner

Parent overlay: `e193406ddace835fda20a870d1629c1333fd8fa3`. No application/service/protocol changes.

An earlier interrupted full-suite attempt left a separate upgrade HTTP server orphaned on port 4197. The normal upgrade runner now imports the actual fixture server into its own process, as the guarded browser driver already does, and binds an ephemeral loopback port. Its Playwright child uses that exact origin and launches no separate webServer. The helper closes all fixture connections on successful or failed browser work; killing the runner also closes its own socket. Existing manual config fallback remains explicit and refuses server reuse.

Three new real-HTTP regressions pass on pinned Node 24: normal return, callback failure, and SIGKILL of the fixture-owning process. The complete two-build upgrade run passes all eight existing active cases and retains the one optional genuine-predecessor skip. The immediate-activation sensitivity control still detects the bad update. Original 35-second case and 180-second child deadlines remain; interruption/timeout cannot report success, and child termination has bounded escalation. No claim that an arbitrary detached browser descendant is covered by the listener test.

Eleven existing planning cases, lint, diff and inventory pass. The new regression file is required and blocked from aggregate credit; planning is 855/314 blocked. The original orphan evidence belongs to phase 05 and remains preserved. Qualification stays paused. Normal CI includes the three listener regressions. A packaging-only JSON-shape error was corrected before finalizing this unsigned patch; it changed no source or test results. No commits, signing, publication or preview changes.
