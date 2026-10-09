# Selection-snapshot ownership contract and baseline controls

This phase specifies a private snapshot owner and adds baseline tests to the current copying
runtime. It does not implement tokens, reuse metadata, change product source or enable the Local
candidate. [Contract and next component](../../f17-selection-snapshots.md).

Six owned suites pass **118 cases** with no skips/retries and drained process groups. The two
modified files pass 73 cases, including 96 generated retained-branch histories (seed 150901), a
frozen/lookalike generic-metadata case, and 80 independent master/card ledger histories under
each preparation strategy (seed 150902). The ledger checks text, both selections, undo/redo,
revision, failed-write retry/discard, remote insertion and cold database+journal replay. Supplied
and returned selection objects are mutated to check isolation.

Three deliberate faults are detected: shallow nested sharing, empty `before` capture and stale
`after` capture. The first sharing control caught prototype normalization before its intended
alias assertion. Its fixture now uses production-shaped cloned metadata and reaches that alias
assertion. Both attempts, exact configurations/patches, logs and shrunk counterexamples survive.
These are deliberate faults; no production defect was identified in this phase.

All 17 selected runner/registration checks, TypeScript, scoped source style, inventory/manifest
and authority checks pass. The initial registration guard also found the deliberate denominator
title change; the final guard verifies that exact rename alongside four added cases. Every other
execution contract, deadline and exclusion is preserved. General integration is now 261 files /
2,077 dispositions (11 not applicable), with 96 command / 63 campaign obligations still unresolved.
The complete unit/native/performance aggregates were not rerun. The application budget remains
failed; no performance claim follows from baseline agreement.

[Summary and registrations](./summary.json). `artifacts.json.gz` stores content-addressed UTF-8
payloads for owned reports/receipts/logs, exact tests and diffs, controls and earlier attempt,
prospective contract, review scripts, gates and preservation pins. The large owned source/dependency
inventory and previous planning snapshots remain local, bound by [raw hashes](./raw-artifacts.json).
This packet does not replace immutable release/rebuild qualification.

Run `python3 docs/account-conformance-runs/2026-09-15-f17-selection-contract/verify.py --raw` while
large local artifacts exist; omit `--raw` for retained evidence. All runtime bytes, four previous
phase packets, 52 personal/vector pins, append-only record prefixes and the other seat's progress
suffix are preserved.

Next implement the unmounted owner and directly test capture/restore isolation, foreign/forged/
cloned/closed-token rejection and retained-branch lifetime. The passing baseline cannot establish
those properties of an unimplemented component. Local integration follows that component gate.
