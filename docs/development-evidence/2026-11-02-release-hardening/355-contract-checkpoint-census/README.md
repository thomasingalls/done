# Remaining contract checkpoint census — phase 355

Six complete commands pass. Two fail for different reasons; two remain unrun. This is not a green checkpoint. [Every result, proposal and comparison](./evidence.json).

| Command | Result |
| --- | --- |
| account:recovery-contract | Only formatting fails: unchanged recovery-entry declaration; full units pass105.05s under120s |
| account:transport-contract | pass |
| account:service-custody | pass |
| account:promotion-contract | pass |
| account:ledger-contract | pass |
| account:counter-contract | pass |
| account:store-contract | pass |
| account:local-custody |13 custody baseline cases pass; two mutation controls time out before any assertion |
| account:checkpoint-contract | unrun after classification stop |
| account:local-provenance | unrun after classification stop |

All executed full-unit stages retain288files,2,882passes and the one existing skip, under the original120-second deadline. No script, limit, case, assertion or application source changes in this phase. Every previous failure remains. The metadata observer's2400s outer emergency bound does not replace or increase any child deadline.

## Deferred formatting

The only formatter complaint across the existing ten command scopes (128files) is `test/account-recovery/coordinator-entry.ts`. It is byte-identical to signed89b11fe2 and last changed in42ad6b7e on2026-10-09. The proposed patch joins one declaration's three lines into one; independent Babel parsing proves the entire TypeScript AST identical, including types. It remains unapplied because the operator previously asked to leave the old formatting work alone. Review SHA256 `901f75aa3ebdcde9cea5d044e574d6455b7c8526759d62f3ae87f0f453617385`. The first identity-probe draft tried the removed TypeScript5-style API on installed TypeScript7; preserve that draft and tool error, and use the actual installed parser instead. No app test failed in that instrumentation attempt.

## Custody control classification

Current custody passes all13 unmodified cases and detects three of five mutations. `trust-unverified-metadata` stalls while enrolling the fixture, before modified-count-refuses; `request-success-as-commit` stalls before no-encryption-before-reservation-completes. Both have the existing8s fixture wait. Neither is credited as detection, and no negative control unexpectedly passes. Keep the errored whole command.

A full custody run on clean signed89b11fe2 with the same pinned environment/browser reproduces the same13 baseline passes and the same two pre-assertion mutation errors. An earlier phase339 run detected all five mutations on an identical candidate runtime source map; that passing attempt does not erase these later errors. This is not Stage1-specific. The next bounded work is to diagnose and repair the test setup without changing any production guard, expected assertion or deadline. No normal app refusal, owner closure, lost writing or cold failure was observed here. If diagnosis requires an app change or weakening a guard, stop and report before doing it.

Six green command exits, the recovery formatting failure and both current/base custody failures are preserved. Raw closed browser profiles and the nonduplicated pass-run input packs stay in their original local output directories with archived input identities; the failure input packs and report/receipt/case/log material are archived here. No Stage2, format decision, acceptance, publication or deployment. Append this outcome before advancing progress to the custody harness diagnosis and pending formatting decision.
