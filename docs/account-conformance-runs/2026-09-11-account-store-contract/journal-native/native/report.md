# Encrypted-store conformance execution

Scope: journal-carrier-browser; candidates: journal. Exit: 0.

Run: 2026-09-11T18:23:31.310Z · harness 837cd1433d52cbc4a7d5e9eb45cd18d53ccde86e (working-tree changes)

Subcase passes establish only the named oracle. Remaining obligations prevent a whole-contract pass.

| Scenario | journal |
| --- | --- |
| C01.synchronous-crash | pass |
| C09.unreadable | pass |
| C11.abort-flush | pass |
| C01.handoff-race | pass |
| C04.close-and-keys | pass |
| C04.concurrent-writers | pass |

Mutation controls:
- skip-storage-append: detected (receipt-already-has-carrier)
- cleanup-before-commit: detected (aborted-flush-retains-journal)
- reread-journal-after-content: detected (handoff-cannot-fall-between-reads)
- skip-wasm-disposal: detected (close-erases-wasm-instance)

Detailed assertions, fault schedules, source/adapter hashes, browser version and storage inventories are in report.json and the per-case artifacts.
