# Remaining functional checkpoint — phase 383

All 42 remaining root commands (41–82) were attempted sequentially on frozen patch 382. Thirty-three pass. Nine stop at their existing 120-second full-unit stage; every stage preceding unit passes in each of those commands. Stages after unit, including downstream vectors/lint/format where configured, are not reached and receive no credit. [Every attempt, report, source pin, host/display log and diagnostic](./evidence.json).

| Root index | Command | Result |
| --- | --- | --- |
| 74 | `pnpm account:transport-contract` | unit deadline, exit143 |
| 75 | `pnpm account:service-custody` | unit deadline, exit143 |
| 76 | `pnpm account:promotion-contract` | unit deadline, exit143 |
| 77 | `pnpm account:ledger-contract` | unit deadline, exit143 |
| 78 | `pnpm account:counter-contract` | unit deadline, exit143 |
| 79 | `pnpm account:store-contract` | unit deadline, exit143 |
| 80 | `pnpm account:local-custody` | unit deadline, exit143 |
| 81 | `pnpm account:checkpoint-contract` | unit deadline, exit143 |
| 82 | `pnpm account:local-provenance` | unit deadline, exit143 |

The first transport-contract timeout and its identical full-command retry both remain. The counter run also reports the new codec property's failure at 5,778 ms before its unit deadline. Its detailed final error is unavailable because the wrapper terminates the suite. No claim that this was assertion-free or solely a parent deadline is made. The unchanged codec file subsequently passes all 12 cases; the same property takes 4,200 ms in isolation and 4,155 ms in the full verbose diagnostic. Vitest's installed runner explicitly rejects elapsed synchronous work past its test deadline, making timing sensitivity plausible; that is not a recovered error or a passing rerun replacing the failure.

The output-only full-unit diagnostic retains the same source, two workers, case timeouts and 120-second outer limit. It reports 2,577 passing cases and one existing skip across 231 of the 298 included files, then is terminated with exit143. No failing case is reported in that diagnostic; 67 files have no case report yet, and no final summary exists. It establishes progress, not a completed suite or proof that every unreported test would pass. Its reporter differs from the original commands, so it earns no acceptance or timing credit. The earlier phase381 standalone unit pass (2,985 passed, one skip,112.29s) stays beside these failures.

The first trace check correctly refuses six stale tree-bound receipts after freezing documentation. All six actual producer checks are rerun on the unchanged snapshot, then trace passes. No receipt is hand-edited or freshness guard relaxed. The private collector later misreads a nested native-summary schema after store completes; its error is retained, the exact parent report recovers the result, and the app run is not repeated. All declarations and executed controller scripts remain.

All 50,846 checkpoint-start file pins remain exact throughout execution and the diagnostics, no canonical file is added during those runs, and the real index is empty. The display is on in every recorded sample, with no within-run power-log off transition. Native campaigns retain caffeinate -d and five-second external host logs. Host swap and filesystem-process activity are retained as context; they do not establish a cause for the timeouts. Browser profiles/dependency checkouts are not copied into this evidence archive; their original private roots remain intact.

Together with the first 40 passing commands from381 and repaired full geometry from382, 74 of the83root commands now have passing runs across the segmented checkpoint. This is not a green monolithic check. Geometry's earlier red run, both passing complete base/hardened228-case campaigns, both actual immediate-focus negative-control failures, and every Cut seed-drain/fault observation remain in their original records.

This phase closes failure-list collection and diagnostics only. It changes documentation/evidence, not app code, tests, assertions, waits, deadlines, limits, budgets, trust, format or construction status. The functional checkpoint remains red. Remaining format integration and Stage5 gates do not advance on this evidence. The next bounded investigation is full-unit execution cost and the new codec test's narrow timing margin, keeping its sample population and all checks. No hardening completion, qualification, release, commit, push or deployment is claimed.

Machine-local freshness after applying this evidence patch is obtained by rerunning debts/retention/selection-status/update-limit/wasm-seal/origin-isolation and trace checks. Their actual `.receipts` files remain the live home; copying each new receipt back into tracked documentation would change the tree again. The successful frozen382 refresh is archived here, and later executions are retained in the private root.
