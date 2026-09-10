# Encrypted-store conformance execution

Scope: ordered-admission-browser; candidates: admission. Exit: 0.

Run: 2026-09-10T19:50:14.252Z · harness 18ceb40d334be3f401d816fb07939d959dabb286 (working-tree changes)

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

Detailed assertions, fault schedules, source/adapter hashes, browser version and storage inventories are in report.json and the per-case artifacts.
