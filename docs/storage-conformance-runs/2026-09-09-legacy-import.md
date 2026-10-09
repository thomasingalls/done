# Pre-active Local import — execution evidence, 2026-09-09

The Yjs delivery repair is committed as **a465310**. The [pre-active import owner](../legacy-import-preparation.md)
is implemented and uncommitted. It creates fresh factor custody, binds verified input and the explicit
Markdown/system policy, and resumes bounded encrypted slices. It does not select a workspace, delete the
source, implement production writer exclusion or settle the real cutover carrier.

## Final executions

| Execution | Observed result | Evidence |
| --- | --- | --- |
| Native import | 22 cases, 60 generated histories, ten renderer deaths; all six sensitivity controls detected | [JSON](./2026-09-09-legacy-import.json) |
| Saved repeated-write input | Native baseline replay, including the named interruption cases | [Input](./2026-09-09-import-repeat-input.json), [replay](./2026-09-09-import-replay.json) |
| Full unit suite | 755 tests / 63 files pass, including 25 new input/resumption histories and five generated 2,000–4,000-card restarted-writer histories | [JSON](./2026-09-09-import-unit.json) |
| Receipt-growth probe before repair | Mutable progress exceeds 16 KiB at action index 2296 | [Failure](./2026-09-09-import-receipt-before.json) |
| Receipt repair | Focused import and generated receipt suites: 14 tests pass; native 2,601-action stress observes maximum update size 344 bytes | [Focused JSON](./2026-09-09-import-receipt-after.json), native report above |

Chromium **151.0.7922.34**, Node **26.8.1**, macOS arm64. The native runner freezes source, fixtures,
script, guide, lockfile and patch pins, and executes the installed Yjs guard. Its final inputs remained
unchanged during execution. It uses real IndexedDB, Web Locks and WebCrypto; source seeding is fixture-only.
Service workers and external network routes are blocked by the reused disposable-context controller.
The controller reestablishes its epoch after every restart; stale handles refuse. This is test exclusion,
not a deployable old-version exclusion procedure.

Named cases cover confirmation before persistence, competing creators/resumers, wrong factor/source
binding, normal startup/custody/index/genesis refusal, request-success followed by transaction abort,
missing custody/counters/slices, tampered progress, long Unicode text and uncapped ten-day input. The ten
renderer schedules observe claim, completed custody, content-stage progress, creating content witness,
initial content counter, ready witness, importing-stage progress, reservation, slice and imported-stage
completion. The fixture gates after observed transaction completion at the next crypto boundary or fixture
return; these are not proof of every possible instruction-level cut or both sides of every commit. Native
aborts exercise before-commit behavior separately. The later full cutover matrix remains owed.

Every successful destination is reopened in a fresh page, unlocked with the factor, compared with an
external Node string ledger and resumed again without additional records. Expected content comes from
fixture inputs rather than import receipts. Generated source placement/order/duplicates retain a causal
journal-only insertion/deletion, multiline/Unicode and empty bodies, ten days, archives and unfiled content.
Generated schedules vary 1–32-action budgets, forced native slice aborts and fresh-page resumptions.
Before and after comparisons include the source's exact native rows and all localStorage key/value pairs,
as well as its observation digest. Destination scans reject named plaintext content/code canaries and an
active index route; they do not claim whole-profile forensic erasure or protection against unlocked code.

## The defect and sensitivity controls

The first cursor overwrote one Yjs meta key on each action. Under successive writer client ids, Yjs encoded
an increasingly large deletion set. A directed 2,600-card probe refused at zero-based index **2296**, even
though that action created only one empty card. The repair gives each receipt its own immutable encrypted
meta key. The generated unit property varies 2,000–4,000 empty cards and writer-id ranges, applies every
encoded slice to a separate receiver and checks the output bound and consecutive receipts. It does not
claim that thousands of real browser restarts were executed or that the whole import has bounded memory.
The native `mutable-receipt` control recreates the rejected construction.

| Control | Required observation |
| --- | --- |
| Mutable receipt key | `receipt-output-bound` detects the exact `import-update-limit` refusal |
| Omit master plus bypass final semantic guard | External `all-master-days-recovered` assertion fails |
| Receipt without text data | Production `import-projection-mismatch` reaches the named `slice-projection-guard` assertion |
| Repeat text action | Generated property reaches the same semantic guard, shrinks five times and saves input |
| Trust imported stage without replay | Removing a committed slice incorrectly succeeds; `missing-slice-refuses` detects it |
| Permit ordinary custody | `ordinary-custody-refuses` detects access to the pre-active destination |

All controls run on frozen copies. The repeated-write property uses seed **8941**, fails on its second
generated input and shrinks to path **1:1:0:1:1:1**. Its smaller control alphabet isolates text repetition;
it is distinct from the main ten-day schedule generator. Replay uses the saved JSON with the unmutated
owner. Known domain refusals count only at the named control assertions; generic exceptions, fixture
failures and timeouts are not detections. The data-omission controls show both the production semantic
check and the independent ledger's ability to reject loss if that check is also bypassed.

Development failures are not credited as passes. The first native attempt hit the macOS Chromium sandbox
bootstrap restriction. An initial slice-death fixture completed its one-action call before reaching its
pause; the fixture was corrected to continue to a following boundary. The existing custody runner's
explicit freeze list omitted the new guard module; it was stopped, and custody/content/journal/admission
freeze lists now include that module. The initial mutable-receipt implementation passed its smaller native
histories before the stress probe found its bound failure. Final native evidence is from `verified`, and
full unit evidence is from `unit-immutable.json`; earlier preliminary passes are not substitutes.

## Affected regressions and limits

| Suite | Cases / detected controls | Evidence |
| --- | --- | --- |
| Custody | 13 / 5 | [JSON](./2026-09-09-import-custody-regression.json) |
| Content | 13 / 5 | [JSON](./2026-09-09-import-content-regression.json) |
| Journal | 17 / 6 | [JSON](./2026-09-09-import-journal-regression.json) |
| Ordered admission | 15 / 6 | [JSON](./2026-09-09-import-admission-regression.json) |
| Owned startup | 15 / 3 | [JSON](./2026-09-09-import-startup-regression.json) |
| Local genesis | 17 / 4 | [JSON](./2026-09-09-import-genesis-regression.json) |
| Scoped Local clear | 17 / 5 | [JSON](./2026-09-09-import-clear-regression.json) |
| Source export | 16 / 7, plus 60 generated histories and three renderer deaths | [JSON](./2026-09-09-import-export-regression.json) |

These regression executions followed the shared runtime guard and freeze-list changes. Subsequent changes
were confined to the new importer, its fixtures/tests and documentation; the shared runtime exercised by
these older suites did not change. Their reports retain the actual frozen input hashes, including any
then-unused importer files. Reports are copied byte-for-byte, not rewritten to pretend later hashes ran.

Typecheck, focused lint/format, patch guard, build/budget, vector/AAD and applicable governance/origin/WASM/
traceability checks pass. Initial JavaScript remains **306.3 kB / 350.0 kB** gzipped. The literal full check
chain, geometry, additional unchanged editor/workspace/trim/delivery browser suites and independent platform,
crypto/security and performance acceptance were not run in this phase. The full unit suite includes their unit tests.

The new owner preserves the original source as recovery material and keeps imported content pre-active.
Cold verification followed by a durable active-selection decision, real carrier choice, production exclusion,
cleanup and final residue acceptance remain separate work. No obligation, debt status or payment changed.
