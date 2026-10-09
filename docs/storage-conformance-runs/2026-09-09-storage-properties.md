# Generated encrypted-storage histories — execution evidence, 2026-09-09

Phase eleven is committed as **85c7404**. This checkpoint adds the [native property harness](../storage-properties.md)
and corrects incomplete content compaction. The default application and migration are unchanged. No debt is paid.

| Execution | Result | Evidence |
| --- | --- | --- |
| Generated production histories | 120 histories, 11,461 recovery comparisons, six corpus replays; all pass | [JSON](./2026-09-09-storage-properties.json) |
| Mutation sensitivity | Five detected, shrunk, replayed, and checked on unmodified production | Same JSON, mutation records |
| Compaction regression | 21 cases / 128 assertions / eight detected mutants; exit zero | [JSON](./2026-09-09-properties-trim-regression.json) |
| Pre-fix diagnostic replay | Expected production failure, before the dependency guard | [JSON](./2026-09-09-properties-before-fix.json) |

The final baseline uses seeds **8941, 130003, 991827**, 40 histories each. It performs **1,139 recovery
checks**, **445 session reopen operations**, **18 actual renderer crashes**, **29 late-reservation
interleavings**, and **120 eventual-compaction checks** after persisting the missing semantic basis.
It also exercises 17 reservation aborts, 17 record aborts, three publication aborts and 12 deletion aborts.
These counts exclude corpus and mutant attempts. All named default coverage requirements were reached.
Inapplicable or dependency-deferred operations are counted separately, never presented as executed faults.

The final JSON files are format-normalized copies with parsed equality checked against the raw reports in
`test-results/storage-properties/final` and `test-results/content-trim/property-regression`. Their recorded
source and harness hashes match the current inputs. The before-fix report deliberately records an earlier
production/oracle revision; its hashes are historical, not asserted current.

## Defect discovered and bounded repair

A generated cross-client history falsified the assumption that preserving Yjs wire bytes through a partial
merge is enough to preserve later recovery. A faster bare-Yjs property reduced the issue to four insertions:
one by client B followed by three by client A, on A's text. With source update IDs **3, 1, 5** on disk and
**0, 2, 4, 6** delivered later, merging the partial union can leave the text at `base0` after every dependency
arrives; the original update records recover `aaaabase0`. The pinned-library negative control in
`test/storageProperties.test.ts` reproduces that final-state difference without any storage.

The [small native corpus history](../../test/storage-properties/corpus/partial-cross-client-merge.json)
fails on the previous production compactor. Its diagnostic report stops at the first visible mismatch;
the separate unit control demonstrates that the problem can persist through complete dependency delivery.
The same corpus now passes the production carrier, including subsequent full-basis persistence, compaction
and cold recovery.

Compaction now authenticates and validates its disk census, then checks whether every content struct and
deletion dependency integrated in the private validation document. If not, it returns `retained` with
`stateSequence: null`, without reserving, publishing or deleting. It keeps the original record framing and
persistent openers. Dependencies present only in the journal do not authorize content deletion; flush and
retry can enable a later compaction. Valid pending data is not treated as corruption and ordinary session
use remains active. Malformed bytes still refuse. A complete union uses the existing exact-coverage
publication and deleting-transaction checks. Record crypto, storage formats and generation rules are unchanged.

This conservatively postpones maintenance until the content basis is available; it does not repair Yjs.
Retained data may grow while dependencies remain absent. The integration-state read stays in the pinned
Yjs seam, so a future dependency upgrade must revisit this limitation and its negative control.

## What the properties measure

The generator varies edits, authors, update selection/order/duplicates, database and journal delivery,
flushes, overlapping compactions, quota/removal faults, native transaction aborts, close, reopen and renderer
death. Two shared writer sessions execute through production mandatory-factor custody with native IndexedDB,
Web Locks, WebCrypto and WASM. Required identity/creation authorities are synthetic. Pauses occur at named
crypto or actual native-commit boundaries; this is not an exhaustive browser event scheduler.

The source edit log and pure string model never derive expected coverage from storage. Decoded text-struct
clock/payload inventories and deletion ranges must match acknowledged source IDs even while dependencies
are pending. Semantic replay and integrated clocks are compared at complete dependency boundaries, and the
fully supplied history must match the string model. Every final history actually persists missing updates,
flushes, compacts and reopens; an implementation that postpones all maintenance would fail. Yjs is shared
for parsing and application, so this independently tests the storage algorithm, not CRDT correctness itself.

The initial semantic oracle compared every incomplete prefix. Generation and standalone probes showed
that partial visibility can differ with batching/order despite retained wire information. It was replaced
by unconditional pending wire inventories plus complete-basis semantic checks, not by dropping pending-data
coverage. Negative controls detect lost pending insertions, cross-client dependencies, deletion-only updates
and refused-update leakage. Seven oracle tests include 100 generated source/string consistency runs; the
production property histories execute in the separate `storage:properties` browser command wired into `check`.

| Mutant | Successful shrink reductions | Final property |
| --- | --- | --- |
| Range deletion | 13 | Pending/recovered text-struct inventory loses an uncovered update |
| Partial disk union | 6 | Recovered inventory omits covered input |
| Merge incomplete content | 2 | Complete-basis semantic recovery fails |
| Early transaction receipt | 10 | An aborted reservation is reported with the wrong failure outcome |
| Clear journal before commit | 20 | A held flush exposes missing acknowledged wire structs |

The incomplete-merge control uses a focused generated four-edit chain; other controls search the full
history grammar. Each minimized failure repeats in a fresh native context and passes on unmodified
production. A trailing suffix after the first failing command may be pruned and rechecked separately;
recorded fast-check paths/shrink counts describe its own reductions. JSON histories remain the durable
replay when generators or seed paths change. Five earlier mutant counterexamples plus the real compaction
counterexample form the six-file corpus; the former are sensitivity controls, not additional production bugs.

## Verification and limits

Full Vitest passes **687 tests / 56 files**, including 14 compaction tests and seven new oracle tests.
Typecheck, focused lint/format and build/budget pass; initial JS remains **306.3 kB / 350.0 kB** gzipped.
Applicable vectors, WASM, origin isolation and project/governance/traceability checks are recorded at the
final tree. The literal full check chain, geometry and separate unchanged custody/content/journal/admission/
editor/workspace/startup/genesis/clear browser suites were not rerun in this checkpoint.

Exploratory runs are not silently counted as passes. The first smoke run was stopped while awaiting a CDP
crash response; the harness now waits for the crash event. Two long native shrink runs were stopped after
standalone probes isolated the recovery issue and the partial-visibility oracle distinction. Their shutdown
errors are interruption artifacts. An initial journal mutant triggered an injected removal exception and was
not credited; its replacement preserves best-effort removal behavior and changes only the commit ordering.
The final mutation run detects acknowledged wire loss. Intermediate unit expectations were updated to the
new inventory assertion names. Only final completed runs supply the counts above.

Host: Chromium 151.0.7922.34, Playwright 1.62.0, fast-check 4.9.0, Node 26.8.1, Vite 8.1.5, macOS arm64.
Two sessions share one renderer; death kills both. No power-loss, supported-platform, large-state memory,
performance, forensic-erasure or independent-review claim follows. Generated editor/admission histories,
full genesis/clear, Account authority, generation/reference transitions and seeded legacy cutover remain
separate work. This checkpoint makes the carrier tests effective before migration; it does not authorize cutover.
