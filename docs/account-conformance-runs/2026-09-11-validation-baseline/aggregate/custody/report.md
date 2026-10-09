# Encrypted-store conformance execution

Scope: custody-component-browser; candidates: custody. Exit: 0.

Run: 2026-09-11T08:03:32.277Z · harness 500630fc85e270728b65d6a6e960def22af47ad2 (working-tree changes)

Subcase passes establish only the named oracle. Remaining obligations prevent a whole-contract pass.

| Scenario | custody |
| --- | --- |
| C12.genesis | pass |
| C10.concurrent-creation | pass |
| C12.reservation-abort | pass |
| C12.interrupted-creation | pass |
| C12.completion-abort | pass |
| C12.metadata-authentication | pass |
| C10.partial-and-legacy | pass |
| C12.scope-and-authority | pass |
| C12.seal-ceiling | pass |
| C12.session-lifetime | pass |
| C12.cancel-crypto | pass |
| C12.cancel-initialize | pass |
| C13.profile-copy | pass |

Mutation controls:
- skip-nested-crypto-guard: detected (cancel-prevents-private-export)
- accept-unconfirmed-code: detected (wrong-confirmation-refused)
- skip-reservation-commit: detected (durable-reservation-before-encrypt)
- trust-unverified-metadata: detected (modified-count-refuses)
- request-success-as-commit: detected (no-encryption-before-reservation-completes)

Detailed assertions, fault schedules, source/adapter hashes, browser version and storage inventories are in report.json and the per-case artifacts.
