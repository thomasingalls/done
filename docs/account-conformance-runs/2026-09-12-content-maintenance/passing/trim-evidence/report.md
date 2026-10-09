# Encrypted-store conformance execution

Scope: content-trim-browser; candidates: trim. Exit: 0.

Run: 2026-09-12T15:41:57.598Z · harness 01b3036dffe09bcaeb0cca6652195cd3bc26afd4 (working-tree changes)

Subcase passes establish only the named oracle. Remaining obligations prevent a whole-contract pass.

| Scenario | trim |
| --- | --- |
| T01.union | pass |
| T02.late | pass |
| T03.concurrent | pass |
| T04.dependencies | pass |
| T05.unreadable | pass |
| T06.changed | pass |
| T07.recheck | pass |
| T08.new-damage | pass |
| T09.journal | pass |
| T10.publish-abort | pass |
| T11.delete-abort | pass |
| T12.kill-reservation | pass |
| T13.kill-publication | pass |
| T14.kill-deletion | pass |
| T15.close | pass |
| T16.generation | pass |
| T17.single-state | pass |
| T18.replacement | pass |
| T19.missing | pass |
| T20.journal-tag | pass |
| T21.journal-recheck | pass |

Mutation controls:
- range-delete: detected (late-record-survives)
- partial-disk-union: detected (cold-replay-keeps-disk-union)
- ignore-record-bytes: detected (changed-record-refuses)
- skip-delete-census: detected (changed-after-audit-refuses)
- skip-journal-check: detected (post-publication-journal-refuses)
- merge-incomplete-content: detected (struct-retained)
- early-delete-receipt: detected (delete-abort-has-no-success-receipt)
- skip-final-journal-census: detected (post-publication-journal-refuses)

Detailed assertions, fault schedules, source/adapter hashes, browser version and storage inventories are in report.json and the per-case artifacts.
