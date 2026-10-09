# Encrypted-store conformance execution

Scope: workspace-admission-browser; candidates: workspace. Exit: 0.

Run: 2026-09-10T18:37:28.650Z · harness 649925f460db5fc3f782e2c87413883f62414462 (working-tree changes)

Subcase passes establish only the named oracle. Remaining obligations prevent a whole-contract pass.

| Scenario | workspace |
| --- | --- |
| W10.repair | pass |
| W01.surfaces | pass |
| W02.pressure | pass |
| W03.undo-death | pass |
| W04.cross-tab | pass |
| W05.system | pass |
| W06.remote | pass |
| W07.history | pass |
| W08.rules | pass |
| W09.initialize | pass |

Mutation controls:
- pending-history-visible: detected (pending-history-private)
- system-bulk-in-human-history: detected (bulk-outside-human-history)
- received-work-in-human-history: detected (undo-preserves-remote)
- lost-redone-links: detected (undo-edit-in-restored-card)

Detailed assertions, fault schedules, source/adapter hashes, browser version and storage inventories are in report.json and the per-case artifacts.
