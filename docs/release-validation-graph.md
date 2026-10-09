# Release-validation inventory — phase 1

The current [execution foundation](./release-validation-execution.md) builds on this inventory. Its
manifest remains blocked for whole-release execution; the phase-1 counts below are historical.

This phase maps the historical validation surface at `d03e473` (signed counterpart `4e692be`)
plus the inventory changes; the [crosswalk](./account-conformance-runs/2026-09-13-signed-review-history.json)
retains the original IDs. It does not execute
an aggregate, change runtime behavior, repair deadlines, sweep P-06's cryptographic prose, or qualify
a release. The subsequent bounded execution phases are recorded in the
[current execution checkpoint](./release-validation-execution.md#checkpoint-and-remaining-sequence).

Run `pnpm validation:inventory`. The command checks the committed planning snapshot against current
inputs, then tests the checker. After reviewing changed inputs or dispositions, explicitly regenerate
with `node scripts/release-validation/check.mjs --record`. Regeneration records a plan, never a pass
for the tests named in it. The [policy](../scripts/release-validation/policy.json) and
[generated inventory](./release-validation-graph.json) are distinct from execution receipts.

## What is reconciled

| Population | Phase-1 count | Mapping and limit |
| --- | ---: | --- |
| Package scripts | 122 | Every script has exactly one reviewed disposition. Alias expansion preserves order, arguments, environment and repeated prerequisites; cycles, missing aliases and unsupported shell syntax refuse. |
| Campaign entrypoints | 78 | All immediate `scripts/*/{run,campaign}.mjs` files map to package commands, explicit phase commands, reviewed parent wrappers or exclusions. AST call locations expose dynamic arguments for the next phase; they are not resolved execution edges. |
| Test files | 261 | 255 required and 6 retired v8 product files excluded. Every file has a proposed unfiltered Node/Vitest invocation or explicit Playwright config/package variants. These proposed commands are separate from existing wrapper coverage. |
| Scenario catalogues | 12 | Each full catalogue maps to its native runner, including its generated cases and mutants. The old three-candidate tournament is historical. Static ID candidates do not replace runtime enumeration. |
| Current vector corpora | 29 | Every current corpus maps to an existing generator in `vectors:check`; the nested historical scalar-only recovery corpus has an explicit exclusion. Unknown nested corpora refuse. |
| Registered constructions | 83 | Every registered test remains required; every registered vector-case reference resolves in its phase corpus. Requirement names stay attached to the construction. This mapping does not establish semantic assertion strength. |

Discovery reads `scripts/`, `test/`, `vite/`, the package/config files and the existing construction
registry independently of the proposed family selections. Inputs include all test/helper/runner
source files, not just filenames mentioned in commands. A new test, changed helper, unclassified
runner, new package alias or changed dynamic map invalidates the reviewed snapshot. The snapshot
has a 700 kB size ceiling; no source trees, browser profiles or historic report copies are added.

The AST inventory never imports test or runner modules. It records declaration/property and command
call-site candidates without claiming runtime case counts. Aliased test APIs, factories, parameterized
cases, conditional branches and mutation variants still need an actual execution census. A string
mention of a test in a source manifest is not credited as an executed test. No general JavaScript
interpreter or shell executor is hidden in this checker.

## Concrete wiring and execution gaps

1. **The package `check` chain is not the complete selected graph.** The inventory records the exact
   missing leaf commands for each additional root. These include the later Account crypto audit,
   reservation durability, isolation, decision composition, parser conformance, delivery oracle,
   admission evidence, residue and liveness campaigns. Lint, format and latency are separate too.
   Build preparation needs its own isolated output. Six `scripts/private-release/run.mjs` modes
   (privacy, failures, recovery, maintenance, projection, marker) and the validation-control campaign
   are additional explicit roots; no default-argument inference may silently omit their variants.
2. **Recent native coverage can be absent from an older wrapper.** The new sync batch, ledger batch
   and ordinary liveness workload files are selected by `scripts/account-liveness/run.mjs`; their
   older `account:sync`/`account:ledger-contract` wrappers do not select them. Required direct-file
   coverage preserves them even if a future aggregate restructures wrappers. The existing full
   Vitest suite includes the separate spool-batch properties; that is not the native crash coverage.
3. **Eighteen campaign sources reference the full `vectors:check` chain.** These are enumerated in
   `campaigns[].referencesVectorChain`. This is source wiring, not a measured invocation multiplier.
   Standalone checks retain their prerequisites. Aggregate reuse must match exact arguments,
   environment/variant, source and dependency identity, then give each consumer the same verified
   result. Names, prior phase success and unchanged vector output alone are insufficient identity.
4. **Some wrapper successes do not establish a complete case census.** For example, the current
   `scripts/account-sync/run.mjs` checks child exit/deadline status but does not reconcile expected
   versus executed test cases. Several older Account wrappers share that pattern. The newer crypto
   audit checks JUnit test counts; the liveness/private-release wrappers check Node test summaries.
   Neither pattern alone proves that every intended generated case or mutation was selected. The
   execution plan needs declared case/variant denominators and separate expected-failure semantics.
5. **Deadline evidence needs per-suite ownership.** N-06's four generated-property files still have
   30-second limits: `accountInboundPrep`, `legacyImport`, `legacySelection` and `legacyCleanup`.
   Their historical loaded-host failures remain a concrete lead, not a new failure reproduction.
   The retained [maintenance attempt](./account-conformance-runs/2026-09-12-content-maintenance/README.md)
   demonstrates why grouping three native suites under one 240-second budget was inadequate. Preserve
   per-suite measured limits, heartbeats, bounded TERM/KILL cleanup, cancellation and failure artifacts;
   first diagnose timeouts, then justify any changed budget. This phase changes no deadlines.
6. **The crypto audit's inherited source list is incomplete for current code.**
   `scripts/account-crypto-audit/run.mjs` seeds its pins from the historical local-provenance report.
   Even after its current evidence-pin additions, that set omits `verificationMemo.ts`,
   `verifiedRecords.ts`, `archiveProjection.ts`, `localRecovery.ts`, `LocalRecovery.tsx`,
   `account-protocol/diagnostics.ts` and `account-service/deliveryVerification.ts`. The statement that
   every recorded pin was unchanged can hold while one of these newer inputs changes. Build a fresh
   complete input closure for the selected run; preserve the older receipt as historical evidence.
7. **Existing defaults are unsuitable for an in-place aggregate here.** `pnpm build` and the
   geometry/latency web-server commands write root `dist/`; some Playwright configurations may reuse
   an existing server. The aggregate must use a disposable checkout/build, explicit owned servers,
   isolated profiles and separate report directories. No personal app or relay is needed. The obsolete
   cold-host migration rehearsal requiring Lima is optional and excluded from private release
   requirements; this inventory does not authorize a VM, sudo or production old-writer deployment.

These are F-20/N-06/P-05 execution-plan obligations, not newly renumbered review findings. Q-01/Q-04
remain bounded repaired prerequisites; they must actually execute against the aggregate's current
inputs. P-06's duplicate cryptographic prose is a separate sweep before qualification.

## Selection and deduplication contract for phase 2

The existing `check` expansion is a comparison baseline, not a command to execute blindly. It still
contains the retired standalone v8 driver and transport wrappers. The six explicit direct-test
exclusions concern only those product paths and their v8 service interoperability fixture. Shared service/read-codec, generated transport and
construction/helper tests remain required; the checker refuses exclusion of a registered test.
The old storage tournament and cold-host deployment rehearsal have separate reasons in the policy.

Compile a finite execution manifest from the required families and reviewed wrapper variants. Reconcile
all 255 required test files, all required catalogue cases/mutants, all construction/vector obligations,
static gates and every selected non-test check. The inventory's direct-file commands describe full
coverage; actual safe arguments, reporting paths and fixtures remain the compiler's responsibility.
Do not collapse a whole phase just because another phase names one of its test files. Keep historical
before-source performance variants and genuine omission controls distinct from ordinary passing runs.

A reusable result must bind a frozen checkout/revision, current source/dependency pins, exact command,
environment, variant, expected-case set, timeout/cancellation policy and complete result. Preserve
ordered receipt dependencies (notably traceability), prerequisite results and failure artifacts. A
survived mutation, missing/zero/skipped/cancelled case or timeout is not success. Unsupported syntax
or an unresolved dynamic selection must refuse planning rather than assume coverage.

Phase 2 should deliver that execution manifest and a shared bounded stage runner with effective
omission, timeout, child-cleanup and stale-result controls. P-06's prose sweep and the immutable full
selected run follow. Workload/platform/claim decisions remain explicit; no initial-release approval
or personal Account cutover follows from this inventory alone.

## Validation of this phase

Ten checker tests pass, including 160 seeded generated command graphs with an independent ordered-leaf
oracle. Directed controls change real fixture files: adding a test or changing an imported helper
invalidates the saved inventory; removing package wiring, required test files, vector prerequisites
or registered vector cases refuses. New nested corpora, unmapped catalogues, cycles, stale exclusions,
duplicate policy entries and unsupported shell syntax refuse. Throwing test/runner module bodies are
parsed without execution. The [bounded evidence](./account-conformance-runs/2026-09-13-validation-inventory/README.md)
records exact checks and hashes; it is not aggregate execution evidence. A package-manager invocation
produced no output and was stopped; its exact checker/test commands pass directly under Node. The
package-manager stall was not diagnosed as a test failure or repaired in this phase.
