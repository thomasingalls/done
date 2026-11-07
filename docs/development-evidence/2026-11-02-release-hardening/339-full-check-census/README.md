# Stage 1 full-check census — phase 339

The remaining 43 commands have all run in the same pinned environment: **24 pass, 19 fail**. This is a complete command failure list, not a green checkpoint. Some failures recur in multiple wrappers; a campaign's later stages remain unrun after its failed prerequisite. [Census and raw evidence](./census.json).

This amends phase 338's classification: the two storage status messages are both current and semantically different. The old Window IndexedDB fault does not establish a fault in the storage Worker. No editor expectation or old browser test has been changed.

Failures include Window-only storage fault controls, a development offline opening timeout, a public-runtime asset-name expectation, stale mutation anchors/source closures, a receive-history result needing diagnosis, stale whole-tree check receipts, formatting, and six existing 120-second full-unit wrapper deadlines. The unbounded full-unit command passed previously; that does not waive those wrapper deadlines.

The signed-base comparison is the next bounded step. Built-preview offline unlocking already passed, including both packaged entries. The dev fixture mounts LocalApp directly, installs no service worker, and receives Vite no-cache application modules; this is a setup difference, not yet a runtime diagnosis.

No app/source change after phase 337, no trust, format, gate, budget or deadline change, no new release or acceptance claim. All previous evidence is retained. Active state returns to [progress.md](../../../progress.md); the hardening document remains the operator's scope/plan.
