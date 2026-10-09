# Account fixture and delivery-table adapter evidence

Base: signed and verified `f9111ea3a81c3e22be2827a40290d59470a417d0`.
The new source/test work is uncommitted. This packet has a prospective **150 kB** ceiling.

`node scripts/release-validation/execute.mjs --selection account-fixtures` passed all **eleven
files / 56 cases** in **75.339 seconds**, including copying/fingerprints. Every group drained.
The ten Node files contain 44 cases for core ceremonies, authority and admission; the delivery
Vitest file contains twelve cases. Their existing property checks run **980 histories** in total:
core 160/80 (seeds 9142026/9152026), authority 160 (9172026), admission 80 (9232026), delivery
500 (1121060). Product assertions, seeds, history counts and deadlines were not reduced.

The delivery table previously formatted only the first event of each tuple, giving six scenarios
four unique titles. It now uses six stable labels and opaque builders with the exact same event
expressions. `delivery-preservation.json.gz` records the old/new mapping and all six histories;
`delivery-preservation-check.mjs.gz` reproduces the AST comparison against the base. Assertions and
every AST node outside the table are unchanged. Planning never executes the builders.

## Fixture and process review

| Family | Storage and code effects | Child ownership |
| --- | --- | --- |
| Account core | Synthetic authenticators; temporary SQLite; mutant service/protocol copies below disposable test-results; cleanup hooks | Restart workers fork the pinned worker module with inherited IPC/group ownership, kill themselves at commit boundaries, and close/disconnect on recovery |
| Authority | Temporary encrypted-root SQLite and generated factor; synthetic proofs; local chmod/symlink/corruption controls; cleanup hooks | Inherited fork workers test initialization death/races; normal workers close/disconnect |
| Admission | Synthetic core/authority/recovery/genesis fixtures; temporary SQLite; copied-source approval mutants | Inherited fork workers test offer/admission death and competing processes; no detached child |
| Delivery | Pure in-memory proof histories and independent oracle | Existing one-fork Vitest owner |

No browser or HTTP listener is launched by these files. Optional `ACCOUNT_REPORT_DIR` exports are
not enabled: this selection retains assertions and runner reports. Wrapper-specific reports, full
campaigns, prerequisites and native checks remain separate required obligations.

## Evidence and limits

- `summary.json` records the frozen source/dependency/runtime identities, timings, counts and hashes.
- `selection-receipts.json.gz` retains every selected stage's complete contract, receipt, case report,
  logs and ownership events. The source patch is exact and unnormalized; it reverse-checks against
  current source/test bytes. Forty-five selected/fixture/source pins match the frozen execution.
- All **110 non-native runner/control tests** pass: 87 pure tests, eighteen owner tests, five actual
  Vitest controls. They include **3,040 generated control histories**. The IPC control proves a
  passing case that leaks its fork still fails with `orphaned-child` and drains; both receipts are
  in `ownership.log.gz`. Thirteen Vitest control receipts contain three intended passes and ten
  required failures, including real omissions, skips, counterexamples and ownership failures.
- Typecheck, scoped lint/format, inventory, manifest, authority, signature and whitespace checks pass.
  The complete-release planner still refuses its 300 unresolved obligations as required. Typecheck
  and lint logs are retained separately from the seven commands in `final-gates.json`.
- All 106 prior general stage rows/contracts and 1,094 identities are unchanged; their earlier
  evidence is not a fresh combined run. The current selection set contains 117 files / 1,150 cases,
  including all 96 discovered Vitest files. Remaining test adapters: 125 Node and sixteen Playwright.
- The raw complete input archive remains in the ignored output directory identified by the summary;
  this packet retains its digest plus actual source/dependency/runtime digests. Subsequent docs and
  evidence changes do not constitute an immutable aggregate. No whole wrapper, supported-load or
  platform qualification is claimed. Eleven native owner controls retain earlier evidence.

The selection and regression tests needed no repair, retry, deadline increase or reduced population.
The initial evidence packer compared L-2 against an older residue-phase hash and correctly refused;
comparison with signed `f9111ea` and the current frozen L-2 hash confirmed no change. Packaging now
uses that current hash while the older preservation baseline still pins personal/package/vector files.
All 21 personal/package files and 31 earlier vector files match; product runtime, prior archives,
formal debts, signing backups, root `done ` and personal servers remain untouched.
