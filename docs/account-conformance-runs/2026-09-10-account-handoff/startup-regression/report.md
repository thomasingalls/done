# Encrypted-store conformance execution

Scope: owned-startup-browser; candidates: startup. Exit: 0.

Run: 2026-09-10T18:04:33.182Z · harness beed8cfcf9d6d845ce8d055d4ab8cfe0344a94b6 (working-tree changes)

Subcase passes establish only the named oracle. Remaining obligations prevent a whole-contract pass.

| Scenario | startup |
| --- | --- |
| O01.absence | pass |
| O02.orphan | pass |
| O03.missing-content | pass |
| O04.missing-custody | pass |
| O05.routing | pass |
| O06.legacy | pass |
| O07.creation | pass |
| O08.clear | pass |
| O09.corrupt | pass |
| O10.factor | pass |
| O11.recheck | pass |
| O12.replay | pass |
| O13.init-death | pass |
| O14.future | pass |
| O15.scope | pass |

Mutation controls:
- probe-creates-database: detected (preflight-no-database-side-effects)
- orphan-is-fresh: detected (orphan-not-fresh)
- skip-open-classification: detected (open-rechecks-after-grant)

Detailed assertions, fault schedules, source/adapter hashes, browser version and storage inventories are in report.json and the per-case artifacts.
