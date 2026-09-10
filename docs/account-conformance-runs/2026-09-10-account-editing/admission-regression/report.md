# Encrypted-store conformance execution

Scope: ordered-admission-browser; candidates: admission. Exit: 0.

Run: 2026-09-10T18:35:19.608Z · harness 649925f460db5fc3f782e2c87413883f62414462 (working-tree changes)

Subcase passes establish only the named oracle. Remaining obligations prevent a whole-contract pass.

| Scenario | admission |
| --- | --- |
| C01.pending-struct | pass |
| C03.synchronous | pass |
| C03.ordered-refusal | pass |
| C03.retry | pass |
| C01.remote-basis | pass |
| C02.pending-delete | pass |
| C03.slicing | pass |
| C03.capacity | pass |
| C03.barrier | pass |
| C03.timer | pass |
| C04.close | pass |
| C09.persisted-yjs | pass |
| C09.runtime-repair | pass |
| C03.validation | pass |
| C04.cross-tab | pass |

Mutation controls:
- publish-before-forced-commit: detected (refused-prefix-is-private)
- prepare-queued-input-early: detected (only-head-prepared)
- publish-receive-before-commit: detected (remote-is-private-until-commit)
- retry-via-journal: detected (retry-forces-second-content-invocation)
- early-durability-return: detected (barrier-waits-for-prior-input)
- ignore-byte-capacity: detected (byte-capacity-refuses)

Detailed assertions, fault schedules, source/adapter hashes, browser version and storage inventories are in report.json and the per-case artifacts.
