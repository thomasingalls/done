# Encrypted-store conformance execution

Scope: local-genesis-browser; candidates: genesis. Exit: 0.

Run: 2026-09-10T17:27:20.296Z · harness 280f61654a60224af4d96910cf9ec68409307cbc (working-tree changes)

Subcase passes establish only the named oracle. Remaining obligations prevent a whole-contract pass.

| Scenario | genesis |
| --- | --- |
| G01.confirm | pass |
| G02.race | pass |
| G03.kill-claim | pass |
| G04.kill-reservation | pass |
| G05.kill-custody | pass |
| G06.kill-progress-content | pass |
| G07.kill-witness | pass |
| G08.kill-counter | pass |
| G09.kill-witness-ready | pass |
| G10.kill-progress-ready | pass |
| G11.kill-index | pass |
| G12.abort | pass |
| G13.cancel | pass |
| G14.missing | pass |
| G15.auth | pass |
| G16.index | pass |
| G17.scope | pass |

Mutation controls:
- skip-factor-confirmation: detected (mismatched-confirmation-refused)
- forget-completed-stage: detected (missing-complete-refuses)
- skip-progress-authentication: detected (damaged-progress-refuses)
- legacy-overwrites-local: detected (legacy-cannot-close-local)

Detailed assertions, fault schedules, source/adapter hashes, browser version and storage inventories are in report.json and the per-case artifacts.
