# Encrypted-store conformance execution

Scope: journal-carrier-browser; candidates: journal. Exit: 0.

Run: 2026-09-11T06:42:52.390Z · harness 500630fc85e270728b65d6a6e960def22af47ad2 (working-tree changes)

Subcase passes establish only the named oracle. Remaining obligations prevent a whole-contract pass.

| Scenario | journal |
| --- | --- |
| C01.synchronous-crash | pass |
| C01.remote-basis | pass |
| C03.refusals | pass |
| C03.watermark | pass |
| C03.actual-quota | pass |
| C09.unreadable | pass |
| C09.enumeration-change | pass |
| C11.abort-flush | pass |
| C11.crash-before-cleanup | pass |
| C11.changed-entry | pass |
| C11.cleanup-refused | pass |
| C01.handoff-race | pass |
| C04.close-and-keys | pass |
| C04.frozen-writer | pass |
| C04.concurrent-writers | pass |
| C11.chunked-flush | pass |
| C03.host-smoke | pass |

Mutation controls:
- skip-storage-append: detected (receipt-already-has-carrier)
- acknowledge-refusal: detected (unavailable-does-not-acknowledge)
- remove-changed-entry: detected (changed-entry-retained)
- cleanup-before-commit: detected (aborted-flush-retains-journal)
- reread-journal-after-content: detected (handoff-cannot-fall-between-reads)
- skip-wasm-disposal: detected (close-erases-wasm-instance)

Detailed assertions, fault schedules, source/adapter hashes, browser version and storage inventories are in report.json and the per-case artifacts.
