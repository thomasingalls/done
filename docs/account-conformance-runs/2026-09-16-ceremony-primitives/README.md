# Content-approval chunk A: primitive conformance

2026-09-16, against signed `192d2a12`. Product checks only; release validation remains paused.
[Byte contract](../../account-crypto/enrollment-ceremony.md);
[phase plan](../../account-content-approval-prep.md). Final inputs are SHA-256 pinned in `inputs.json`.

- 29 ceremony tests pass, including the unchanged published honest vector, all 15 named negative
  scenarios, closed scalar bounds, input capture across a suspended digest and strict code syntax.
- 100 shrinking generated contexts, seed 16091607, independently agree with Node SHA-256/HKDF
  and preserve each transcript field. This does not claim a 25-bit SAS is collision-free.
- 12 omission controls produce actual forbidden equivalence/opening outcomes when the corresponding
  runtime predicate is removed; the baseline distinguishes/refuses the same relevant inputs.
- 12 construction-registry checks pass. Final focused total: **41 tests, zero failures**.
- `tsc -b --noEmit`, scoped oxlint/oxfmt, runtime inventory, the existing enrollment vector checker
  and `git diff --check` pass. Current census: 179 sources, 100 labels/templates, 25 groups and
  14 manual entrypoints. The new ceremony group is explicitly open.

`initial-tests.log.gz` preserves the first passing 29-case run. `registry-initial.log.gz` retains the
40/41 result before updating the registry's expected open-group count/list from two to three. This
was a missing inventory-test expectation, not a runtime ceremony failure. The input validator also
needed an equivalent character-code check to satisfy the no-control-regex lint rule; all cases were
rerun afterward. `focused.log.gz` contains the final 41-case pass. `typecheck.log.gz` is empty on
success; its recorded command exited zero. There were no primitive counterexamples in this run.

Reproduce without an aggregate wrapper:

```sh
node --test --test-timeout=30000 test/account-ceremony/*.test.mjs test/account-first-authority/registry.test.mjs
node node_modules/typescript/bin/tsc -b --noEmit
node scripts/account-crypto-prep/run.mjs
node scripts/generate-enrollment-vectors.mjs --check
```

These are primitive conformance checks, not evidence of commit-before-reveal chronology, durable
comparison limits, native custody, key release or second-device convergence. Historical vectors,
frozen release inventories, prior campaign evidence and ordinary Account activation are unchanged.
