# Encrypted-store conformance execution

Scope: content-carrier-browser; candidates: content. Exit: 0.

Run: 2026-09-11T18:23:25.817Z · harness 837cd1433d52cbc4a7d5e9eb45cd18d53ccde86e (working-tree changes)

Subcase passes establish only the named oracle. Remaining obligations prevent a whole-contract pass.

| Scenario | content |
| --- | --- |
| C09.unreadable-load | pass |
| C01.byte-replay | pass |

Mutation controls:
- swallow-unreadable-record: detected (tag-refuses-whole-load)

Detailed assertions, fault schedules, source/adapter hashes, browser version and storage inventories are in report.json and the per-case artifacts.
