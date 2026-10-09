# Encrypted-store conformance execution

Scope: local-genesis-browser; candidates: genesis. Exit: 0.

Run: 2026-09-11T19:55:03.627Z · harness 555523863b0dc999e4fe1407a6883d000f233e75 (working-tree changes)

Subcase passes establish only the named oracle. Remaining obligations prevent a whole-contract pass.

| Scenario | genesis |
| --- | --- |
| G03.kill-claim | pass |
| G06.kill-progress-content | pass |
| G10.kill-progress-ready | pass |
| G11.kill-index | pass |
| G12.abort | pass |
| G14.missing | pass |
| G15.auth | pass |

Mutation controls:
- forget-completed-stage: detected (missing-complete-refuses)
- skip-progress-authentication: detected (damaged-progress-refuses)

Detailed assertions, fault schedules, source/adapter hashes, browser version and storage inventories are in report.json and the per-case artifacts.
