# First general validation integration — Vitest properties, 2026-09-13

Base: signed and signature-verified `5872dc5`. This packet covers five synthetic test files,
62 cases and unchanged 515 seeded histories. It is a bounded selection, not the full test command,
its native wrappers, a loaded-host guarantee or an immutable release aggregate. See the
[current execution contract](../../release-validation-execution.md#vitest-property-adapter--phase-2m).

Both before and after disposable selections pass on this host. The first post-deadline command takes 67.9
seconds including copying/fingerprints. The final run, after the file-argument validation check, takes
56.2 seconds; generated properties take 1.0–6.2 seconds across those runs. The five test
limits change from the five-second default / four 30-second limits to explicit 60-second limits,
inside separate 180-second file stages with bounded drain. The normalized TypeScript AST comparison
retains the exact assertions, seeds and run counts after removing only those timeout arguments.
Historical loaded-host failures remain relevant; this phase does not re-reproduce them.

```sh
node scripts/release-validation/check.mjs
node scripts/release-validation/plan.mjs
node scripts/release-validation/execute.mjs --selection vitest-properties
node --test --test-concurrency=1 test/release-validation/vitest.test.mjs test/release-validation/vitest-process.test.mjs test/release-validation/manifest.test.mjs test/release-validation/inventory.test.mjs test/release-validation/stage.test.mjs
```

The latter runs 41 controls. The other fifty existing non-native adapter/identity tests pass separately
(`adapter-regressions.log.gz`). Total: 91 tests and 2,560 generated validation-control histories.
The unchanged eleven browser ownership controls retain their preceding phase evidence; no browser
campaign ran here. Typecheck, scoped style, planning readback and authority/registry gates are recorded
separately in `final-gates.json`; whole-tree R-04 style gates and full release execution remain open.

Four process tests produce nine real Vitest receipts: one success and eight required refusals covering
actual removed registration, runtime skip, zero-case collection, shrinking property counterexample,
inner timeout, outer timeout with an inherited child, cancellation and caught detached-child refusal.
They assert process drain; outer timeout also requires the child's PID to be absent and partial
completed-case progress to remain. `VITEST_CONTROL_OUTPUT` optionally preserves these receipt/log
files before the synthetic fixtures are removed. Their lightweight test fixtures share installed
libraries; the actual product selection copies and fingerprints dependencies in its disposable checkout.

`controls-first.log.gz` retains two failures: the skip fixture incorrectly expected a context argument
from scalar `it.each`, and the reporter lost a timeout message by retaining only its placeholder stack.
The corrected fixture uses a real ordinary-case runtime skip. The reporter retains message and stack;
the control checks actual fast-check seed/counterexample text and the inner timeout's diagnosis.
The repaired and final control runs are retained, including all nine detailed process receipts.

`summary.json` binds command results, selected input hashes, runtime/dependency digests, raw input
archive hashes and final runner/test source pins. Before, first-after and verified receipt maps contain the complete
bounded stage reports, contracts, case identities, timings, errors and process results. Log paths and
terminal colors are normalized before deterministic gzip compression; hashes of both raw and normalized
bytes are retained. Receipt identities/artifact hashes inside those normalized maps still identify the
original raw files; normalization does not reissue or authorize cache reuse.

`source-patch.diff.gz` is an exact, unnormalized patch from the signed base to the final test/runner
bytes. The verified property snapshot matches the final selected test/runner bytes and predates only
subsequent documentation/evidence updates. The earlier after run is retained separately. The full raw
input archives stay at the local `test-results/` paths in the summary. This compact packet records their
hashes and dependency digests rather than duplicating megabytes of installed-file lists. The prospective
packet ceiling is 120 kB including final gates, excluding raw local test output; no older archive was
rewritten, relocated or deleted. This packet is evidence for the selected stages, not a claim that all
current repository bytes were executed as one immutable aggregate.
