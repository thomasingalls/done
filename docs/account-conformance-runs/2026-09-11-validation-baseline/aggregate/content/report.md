# Encrypted-store conformance execution

Scope: content-carrier-browser; candidates: content. Exit: 0.

Run: 2026-09-11T08:03:53.757Z · harness 500630fc85e270728b65d6a6e960def22af47ad2 (working-tree changes)

Subcase passes establish only the named oracle. Remaining obligations prevent a whole-contract pass.

| Scenario | content |
| --- | --- |
| C15.concurrent-allocation | pass |
| C15.reservation-abort | pass |
| C15.abandoned-seals | pass |
| C15.content-abort | pass |
| C15.ceiling | pass |
| C14.generation-fence | pass |
| C09.unreadable-load | pass |
| C09.metadata | pass |
| C09.immutable-record | pass |
| C10.content-initialization | pass |
| C04.content-close | pass |
| C01.byte-replay | pass |
| C07.full-snapshot | pass |

Mutation controls:
- early-transaction-success: detected (no-encryption-after-aborted-reservation)
- skip-reservation: detected (abandoned-encryption-remains-counted)
- omit-generation-fence: detected (changed-generation-refuses-commit)
- swallow-unreadable-record: detected (tag-refuses-whole-load)
- allow-ceiling-equality: detected (ceiling-refuses-before-encryption)

Detailed assertions, fault schedules, source/adapter hashes, browser version and storage inventories are in report.json and the per-case artifacts.
