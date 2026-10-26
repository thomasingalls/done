# Phase73 — private automatic local-retention scheduling

2026-10-26 · follows frozen cumulative72 `1d503be6abaa5e9f262ddeebfe65bae01c1aa69c`.
Source HEAD remains `0a01b71510adca394ce01c758cb96c9400c302ef`; all work remains unsigned/unstaged.
[Contract](../../../account-local-retention-automatic.md).

## Outcome and reused evidence

Adds an event-driven private scheduling policy and composed owner integration. Authenticated count
and revision hints decide when to request existing verified removal; they confer no deletion power.
The owner retains current authority/journal/attempt/census/readback checks and atomic exchange. Public
reader stays on; installer, retention writer and new automatic policy remain off. Independent AST
inspection of the actual default build confirms those flags. No data format or service change.

The historical depth study already discriminates ledger-history growth from identical visible writing.
The later preparation-task study already repaired the remaining known preparation stalls (CPU-4x max
483ms→97ms). This phase reuses those results and does not rerun their broad workloads or claim those
numbers for current source/phones/accounts. Their unexplained lifecycle failure and the limits of the
later receive-ordering attribution remain linked in the contract. No personal account was profiled.

## New evidence

- 39 focused units pass: 16 new policy cases plus 23 unchanged storage/fence cases. These exercise
  all 16 flag combinations, actual threshold, quiet/cooldown/fresh hints, one flight, parked versus
  transient refusals, unexpected outcomes, errors, already-aborted and late-abort behavior.
- Two new required native browser cases pass against final source in disposable profiles. The
  threshold-only probe uses one record instead of 1,024; the real ten-second quiet interval,
  cryptography, authority, journal, census, final strict exchange and independent replay remain.
  The real owner converts 27 ledger records to a v5 baseline with zero suffix rows, retaining
  writing, live undo/redo and cold reopen. Disabled policy and closing before the timer fires do not
  convert. This is integration evidence, not a performance result or physical-phone measurement.
- Three unchanged native owner cases pass: typing interrupts preparation before reservation;
  failed committed readback closes and cold retry authenticates; unpublished original identities
  survive reduction, reopen and publication.
- 97 separate inventory/adapter cases and 12 authority-registry cases pass. TypeScript, focused lint/format, default Vite build,
  source/inventory/manifest readback and independent conservation checks pass. Final fresh
  prerequisites and traceability results are retained in `checks.json` and raw logs.

The initial TypeScript check rejected an optional field supplied as explicit undefined; the interface
now models that state precisely. A speculative built-output probe incorrectly expected dead-code
elimination to remove disabled code text. Its assertion failed; the emitted gate is disabled, confirmed
by a replacement AST inspection. The first AST probe assumed an unavailable TypeScript parser module;
it was replaced with the repository's Babel parser. These are check corrections, not hidden product
repairs. Initial and final logs are preserved separately. Final native rerun follows cleanup ordering
review; none of these reruns erase an earlier failure or create a new performance claim.

The first authority-map check also found one stale source coordinate for the existing non-crypto
ledger-mismatch label (704→711). Only that line coordinate was refreshed; independent comparison
confirms every ownership/contract value and source label remains. The failed log is retained.

## Conservation and remaining work

Runtime sources 408→409. All 197 domain/templates and source sites remain (line offsets change only);
construction/ownership definitions and old test/assertion/invocation bytes remain. Planning goes
902→904 obligations, 358→360 unresolved: exactly the two new files, required and uncredited pending
separate adapter/process review. General qualification remains paused and aggregate blocked.

Private policy starts at 1,024 records, 10 seconds quiet, 30 minutes success cooldown and at least
one minute after skips. Unchanged capacity/history/ineligible hints park; other refusals require a new
event; unexpected owner errors halt this lifetime. These bounds are not measured optima. Cooldown is
not persisted across reopening. Refusal/capacity UI, public activation, current-account attribution,
physical phones and server pruning remain separate. No real account, preview8443, production, Git
index or prior patch was changed. Patch73 follows61–72; no commit/publication is implied.
