# Encrypted-store conformance execution

Scope: C04-component-browser; candidates: write-session. Exit: 0.

Run: 2026-09-10T17:27:19.459Z · harness 280f61654a60224af4d96910cf9ec68409307cbc (working-tree changes)

Subcase passes establish only the named oracle. Remaining obligations prevent a whole-contract pass.

| Scenario | write-session |
| --- | --- |
| C04.shared-scope | pass |
| C04.freeze-barrier | pass |
| C04.drain-cleanup | pass |
| C04.detached-work | pass |
| C04.stale-task | pass |
| C04.cancel-queued | pass |
| C04.cancel-initialize | pass |
| C04.initialize-error | pass |
| C04.cleanup-error | pass |
| C04.renderer-death | pass |
| C04.worker-lifetime | pass |
| C04.exclusive-error | pass |
| C04.navigation | pass |

Mutation controls:
- split-coordination-domain: detected (frozen-writer-blocks-exclusive)
- ignore-session-invalidation: detected (closing-callback-cannot-write)
- release-before-drain: detected (detached-work-blocks-exclusive)
- skip-cache-cleanup: detected (cache-cleared-before-exclusive)
- reuse-finished-task: detected (finished-task-cannot-write)

Detailed assertions, fault schedules, source/adapter hashes, browser version and storage inventories are in report.json and the per-case artifacts.
