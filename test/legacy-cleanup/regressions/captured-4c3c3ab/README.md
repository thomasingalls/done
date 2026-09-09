# Unresolved cleanup history from the interrupted campaign

`input.json` and `diagnostic.json` are byte-for-byte copies of the locally retained
artifacts named in `provenance.json`. The archive pins their SHA-256 hashes and the
source/fixture/dependency hashes that matched commit `4c3c3ab` in the frozen
`final-complete/baseline` directory. That directory name is not evidence of completion.

The diagnostic records a generated history failing at cleanup retry with
`operation-accepted: Error`. The old browser wrapper discarded the underlying
exception message, stack and cause. Those details cannot be recovered from this
JSON. The exact pairing of this input and diagnostic has not been verified by
replay; the input is not claimed to be minimal. Its presence is not a passing
regression test or cleanup acceptance evidence.

The next investigation can execute this input once, without the directed campaign,
new generation, shrinking or fault controls:

```sh
pnpm storage:legacy-cleanup --mutant baseline --replay test/legacy-cleanup/regressions/captured-4c3c3ab/input.json
```

That command has **not** been run as part of preserving these artifacts or adding
harness diagnostics. It tests the current source snapshot, whose hashes are saved
in its new output directory; it does not reproduce historical source bytes by itself.
See [the harness guide](../../../../docs/legacy-cleanup-preparation.md#harness-diagnostics-and-deadlines)
for logs and deadline controls. Diagnose that result before treating the cleanup
implementation as complete or proceeding to the migration coordinator.
