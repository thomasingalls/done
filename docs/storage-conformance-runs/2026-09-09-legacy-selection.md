# Verified Local import selection — execution evidence, 2026-09-09

Pre-active import is committed as **a0072e8**. The [selection owner](../legacy-selection-preparation.md)
is implemented and uncommitted. It cold-verifies the explicit Markdown/system destination, records selection
intent, installs the scoped route and atomically hands custody metadata to the ordinary Local owner.
Source material remains intact. Default startup, production exclusion, real carrier choice and cleanup
remain separate work.

## Final executions

| Execution | Result | Evidence |
| --- | --- | --- |
| Native selection | 20 cases, 60 generated histories, three renderer deaths; five named controls detected | [JSON](./2026-09-09-legacy-selection.json) |
| Saved damaged-import control | Baseline replay of the shrunk history, plus the 20 native cases | [Input](./2026-09-09-selection-control-input.json), [replay](./2026-09-09-selection-replay.json) |
| Full unit suite | 765 tests / 64 files pass; selection adds ten tests, including 30 generated partial-state/text/damage histories | [JSON](./2026-09-09-selection-unit.json) |
| Missing-route probe before repair | Selection incorrectly returned `selected` after index write success without a retained route | [Failure](./2026-09-09-selection-index-before.json) |
| Missing-route repair | Focused selection suite: ten tests pass, including refusal and successful resumption | [JSON](./2026-09-09-selection-index-after.json) |

Chromium **151.0.7922.34**, Node **26.8.1**, macOS arm64. The final native runner freezes source,
fixtures, guide, package/lockfile and Yjs patch pins, executes the installed patch guard and reports unchanged
inputs. Native cases use actual IndexedDB, Web Locks and WebCrypto in disposable contexts. The external
controller closes pages/workers, blocks service workers and external routes, and reestablishes its epoch
on restart. It does not provide a production old-writer fence.

The three commit boundaries are the signed selecting intent, index route and final custody decision.
Each has a request-success/transaction-abort case and an actual renderer death after observed commit.
The final custody transaction adds the signed ready Local claim and removes the import marker together.
Aborts leave ordinary open blocked. Death after a completed decision permits repeated factor-verified
selection acknowledgement and ordinary replay. Gates pause at the next crypto operation or fixture return;
these are not exhaustive instruction-level cuts. A fixture timing error originally missed the last gate
because its observer ran after the operation promise settled; waiting one event-loop turn corrected the
fixture before the final run. That timeout is not a protocol failure or sensitivity detection.

Other cases cover simultaneous same-page selectors under real Web Locks, wrong factor/incomplete import,
cold replay despite signed import progress, missing or unreadable slices, current source changes before
and after destination verification, provenance tampering, conflicting/lost routes and imported Local-clear
refusal. Selected scopes/keys/counters/content are compared before and after selection: only ownership/index
metadata changes. Ordinary opening may then perform admitted initialization and journal writes.

The external Node string ledger supplies master text, every day file and unfiled bodies; expectations do not
come from destination receipts. Generated histories vary Unicode/multiline/empty content, ten-day/archive
source data, original DB/WAL order and duplicate placement, abort boundary, cold restart and subsequent edit.
The edit must survive a repeated selection acknowledgement and another normal open. Exact native source rows,
all pre-existing localStorage values and the source digest are preserved. New scoped encrypted journals may
appear after ordinary opening. This is not a whole-profile plaintext or forensic-erasure audit.

## Defect and controls

The first final census accepted a missing index because the shared pre-active census legitimately allows
`selecting` without a route. A directed fault removed the route after add-request success while allowing
its transaction to complete. The owner then incorrectly returned `selected`. The repair explicitly requires
a retained exact route before the final custody decision. The same fault now refuses while retaining the
selecting marker, and a subsequent retry installs the route and completes. This is a fault-injection result,
not evidence that native IndexedDB silently loses successful writes. The native suite reproduces it and a
control removes the new check. A loss after the completed decision refuses resumption rather than recreating
the index. These checks rely on the existing slot lifetime and do not fence uncooperative old code.

| Control | Named observation |
| --- | --- |
| Trust imported stage without cold destination replay | Missing encrypted slice incorrectly succeeds; `cold-damage-refuses` fails |
| Ignore current source check | Changed source incorrectly selects; `changed-source-refuses` fails |
| Omit provenance from the Local claim MAC | Tampered source binding reaches normal open; `provenance-tampering-refuses` fails |
| Skip final route-presence check | Lost index incorrectly completes selection; `index-loss-refuses` fails |
| Retain the pre-active marker after claiming completion | Ordinary open remains blocked; `selected-route-present` fails |

Controls run on frozen copies and count only their named assertions. Generic errors, timeouts and fixture
failures do not count. The damaged-import control uses seed **8941**, fails on its first generated input,
shrinks **twice** and saves path **0:0:0**. Its smaller alphabet varies master text and imported/intent/indexed
state independently of the main ten-day schedule generator. The saved JSON is replayed against the corrected
baseline. Unit setup initially lacked complete localStorage enumeration and expected raw master rather than
the input ledger's journal suffix; these fixture mistakes were corrected before credited unit evidence.
An earlier native run passed its original 18 cases and 60 histories before the final route check and two
new cases were added; it is development evidence, not final acceptance.

## Affected regressions and limits

| Suite | Cases / detected controls | Evidence |
| --- | --- | --- |
| Pre-active import | 22 / 6, plus 60 generated histories and ten renderer deaths | [JSON](./2026-09-09-selection-import-regression.json) |
| Local genesis | 17 / 4 | [JSON](./2026-09-09-selection-genesis-regression.json) |
| Scoped Local clear | 17 / 5 | [JSON](./2026-09-09-selection-clear-regression.json) |
| Owned startup | 15 / 3 | [JSON](./2026-09-09-selection-startup-regression.json) |

These regressions ran after the shared Local-claim/provenance/clear-guard changes. Subsequent runtime edits
only changed the new `legacySelection.ts`, which these older fixtures do not import. Their frozen snapshots
include that then-unused file and retain its actual earlier hash; reports are copied byte-for-byte. Final
selection evidence covers the new owner with the final route check. No report is rewritten to claim later
bytes were executed.

Typecheck, focused lint/format, patch guard, build/budget, vectors/AAD, applicable governance/origin/WASM
checks and final traceability pass. Initial JS remains **306.3 kB / 350.0 kB** gzipped. The literal full check
chain, geometry and additional unchanged component browser suites were not run in this phase. Independent
security/storage/platform review, general CRDT coverage and memory/latency acceptance remain owed.

Source cleanup and its interrupted DB/WAL/ancillary deletion progress are next. Imported Local clear
currently refuses to avoid deleting the destination while leaving legacy plaintext behind. The explicit
adapter does not select the real Stage 2 carrier or provide fidelity restoration. Production exclusion and
complete cutover/residue acceptance remain gates; no obligation, debt status or payment changes here.
