# Encrypted-store conformance execution

Scope: local-clear-browser; candidates: clear. Exit: 0.

Run: 2026-09-10T18:05:17.316Z · harness beed8cfcf9d6d845ce8d055d4ab8cfe0344a94b6 (working-tree changes)

Subcase passes establish only the named oracle. Remaining obligations prevent a whole-contract pass.

| Scenario | clear |
| --- | --- |
| L01.success | pass |
| L02.blocked | pass |
| L03.refused | pass |
| L04.kill-intent | pass |
| L05.kill-content-delete | pass |
| L06.kill-stage-journal | pass |
| L07.kill-stage-custody | pass |
| L08.kill-stage-index | pass |
| L09.kill-index-delete | pass |
| L10.kill-stage-cleared | pass |
| L11.journal | pass |
| L12.aborts | pass |
| L13.factor | pass |
| L14.guards | pass |
| L15.lifetime | pass |
| L16.recheck | pass |
| L17.cancel | pass |

Mutation controls:
- blocked-as-success: detected (blocked-delete-not-complete)
- journal-before-content: detected (delete-refusal-keeps-journal)
- retain-genesis-opener: detected (terminal-has-no-content-openers)
- skip-resume-authentication: detected (wrong-factor-cannot-finish-keyless-clear)
- allow-component-open: detected (component-refuses-before-key-access)

Detailed assertions, fault schedules, source/adapter hashes, browser version and storage inventories are in report.json and the per-case artifacts.
