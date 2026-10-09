# Pending forks and projection consistency — execution evidence, 2026-09-09

Journal contention repair is committed as **fc1ff41**. Core repair phase 2 implements
[exact runtime forks and checked projection publication](../pending-projection.md). This checkpoint
remains uncommitted. It changes neither stored/wire formats nor arbitrary original-record Yjs delivery.

| Execution | Result | Evidence |
| --- | --- | --- |
| Native pending-projection suite | 12 cases pass, including 100 generated edit/delivery/undo histories and one renderer death | [JSON](./2026-09-09-pending-projection.json) |
| Saved generated-history replay | Local typing, later dependency delivery and human-only undo pass again | [JSON](./2026-09-09-projection-replay.json), [input](./2026-09-09-projection-replay-history.json) |
| Existing admission regression | 15 cases pass; six mutants detected | [JSON](./2026-09-09-projection-admission-regression.json) |
| Existing Goals editor regression | 12 cases pass; three mutants detected | [JSON](./2026-09-09-projection-editor-regression.json) |
| Existing workspace regression | 10 cases pass; four mutants detected | [JSON](./2026-09-09-projection-workspace-regression.json) |
| Existing owned-startup regression | 15 cases pass; three mutants detected | [JSON](./2026-09-09-projection-startup-regression.json) |
| Journal contention regression | 12 cases pass, including its separate 100 generated read histories | [JSON](./2026-09-09-projection-contention-regression.json) |

Chromium **151.0.7922.34**, Node **26.8.1**, macOS arm64. The native cases use actual mandatory-factor
custody, IndexedDB, localStorage, Web Locks, workspace/Goals owners and CodeMirror. Enrollment identity
and receive authority remain synthetic. All recorded production, fixture and guide hashes match the
working files; all frozen candidate/mutant hashes match their executed copies. The new runner additionally
pins the installed Yjs package/runtime and encoder/store source assessed for its internal read view.

## Preserved state and publication behavior

The saved partial corpus supplies records **3, 1, 5**, forks, then supplies **0, 2, 4, 6**. Draft and
runtime-history forks now retain the exact pending bytes and missing-clock map, and recover `aaaabase0`.
Separate deletion-only input verifies pending deletion preservation before its structs arrive. The copy
encodes integrated state through a detached read-only view, then copies pending fields without applying
their merged serialization. It neither temporarily removes source fields nor shares mutable pending
buffers/maps. Undo stacks and redone links retain the existing pinned seam handling.

Workspace and standalone Goals startup obtain a detached runtime fork from admission. Pending recovery
material survives their initial projection and later basis delivery. The workspace case also types local
text while remote work is pending, then verifies editor/export agreement after the basis arrives, human
undo removing only that local input, and redo restoring it. A real renderer death after journalled local
promotion preserves settings and pending records through fresh open and later complete recovery.

The pressure case forces native content delay/abort after journal refusal. Prepared settings and later
queued commands remain private and absent from outgoing bytes; explicit Retry preserves ordering and
future basis recovery. Every accepted transition now checks integrated identity/deletions/content and
exact pending bytes/bookkeeping against canonical before publishing ordinary views or local updates.
Content comparison also rejects different text under equal client clocks; vector equality is insufficient.

Controlled projection-event omissions exercise both workspace and Goals checks while persisting the
original input normally. Ordinary access stops with `projection-mismatch`, no inconsistent view/update
is published, durable originals remain, and a fresh projection recovers. This is runtime divergence, not
evidence that stored bytes are corrupt. Startup classifies it as unavailable / runtime-projection-mismatch.
The initialization case verifies that the original failure survives shutdown and its cancelled barrier,
with durable initialization bytes retained and a subsequent fresh open succeeding.

## Generated histories and sensitivity

The native generator uses seed **8941**, three source authors/roots, one to ten generated source edits,
original update reordering and local settings commands. Local text is inserted after the first delivered
record, before the remaining remote basis; later human undo must remove only that input. An independent
source string model supplies the expected remote content. All **100** source replays in this final sample
complete, and all workspace/editor/export, local-input preservation and undo checks pass. The alphabet
does not establish arbitrary transport or library correctness. Each source author synchronizes between
source edits; concurrent source editing, general structural commands and arbitrary pending donor snapshots
are outside this generator. Existing workspace regressions separately cover structural/history behavior.

The unit property runs **500** generated histories with repeated forks between deliveries. It requires
fork/original equivalence for every history and external-string recovery for source-ordered histories;
arbitrary original ordering can itself strand in the pinned library. Its pending-byte/map detachment and
content/deletion negative controls check properties beyond visible equality. Native failures save their
first input without shrinking; the unit fork property supports shrinking. No generated failure occurred
in the final runs. Saved native JSON replay is exercised, not merely offered as a command.

| Focused mutant | Required assertion | Evidence |
| --- | --- | --- |
| Drop pending structs/map | `pending-forks-exact` | [JSON](./2026-09-09-projection-drop-pending-structs.json) |
| Drop pending deletions | `pending-deletions-exact` | [JSON](./2026-09-09-projection-drop-pending-deletions.json) |
| Serialize pending startup | `pending-workspace-startup-completes` | [JSON](./2026-09-09-projection-serialize-startup.json) |
| Omit workspace check | `workspace-drift-blocks-read` | [JSON](./2026-09-09-projection-skip-workspace-check.json) |
| Omit Goals check | `text-drift-blocks-read` | [JSON](./2026-09-09-projection-skip-text-check.json) |
| Ignore content despite equal clocks | `equal-clocks-do-not-prove-content` | [JSON](./2026-09-09-projection-ignore-integrated-content.json) |
| Mask initialization's failure | `initialization-preserves-projection-cause` | [JSON](./2026-09-09-projection-erase-projection-cause.json) |

All seven are detected at their specified assertions on separate frozen copies. Unexpected exceptions
and timeouts do not count. Unmodified scenarios pass in the baseline. The raw report copies originate in
`test-results/pending-projection/typing-verified`, `typing-replay`, `final-<mutant>` and the regression-named
directories (`workspace-verified` for the final workspace run). Byte-for-byte equality is checked.

## Development findings and final checks

The first two directed unit regressions failed against the pre-repair forks, reproducing the changed
pending bookkeeping ([development report](./2026-09-09-projection-before-fix.json)). A later directed test
found that projection failure during admitted initialization was masked by the subsequent inactive-session
barrier rejection ([development report](./2026-09-09-projection-initialization-before-fix.json)). Preserving
the owner's original failure fixes that diagnostic; the seventh native mutant detects its removal.
These Vitest development reports do not freeze their inputs; the committed core reproduction and frozen
native controls provide the separately reproducible source-bound evidence.

The first native smoke harness read `text` instead of the export entry's `content` field and awaited a
reply from the renderer-crash command rather than the crash event. The runner was stopped, those two
harness errors were corrected, and the final execution repeats all affected cases successfully. The
generated native history was strengthened to include local typing and human-only undo before final
recording. Preliminary green runs are not substituted for the final frozen run.

Full Vitest passes **736 tests / 60 files**, including seven new tests. Typecheck, focused lint/format,
build/budget, vectors/AAD and applicable project/governance/origin/WASM/traceability checks pass. Initial
JS remains **306.3 kB / 350.0 kB** gzipped. The literal full check chain, geometry, separate custody/content/
journal/genesis/clear/trim/storage-property/legacy browser suites and broader platform tests were not rerun.
The five affected regression suites above were executed; journal contention's older mutation controls
were not rerun in that regression. `storage:projection` joins the check chain after workspace admission.

## Boundary and next work

Comparison normalizes integrated state through temporary documents and scans/copies state on each
accepted transition. These costs, deleted runtime history retention and version-sensitive internals still
need working-set, low-end input-to-paint and independent review acceptance. The existing editor profile
measures preparation only; it does not measure the added publication check. A matching projection also
cannot establish that canonical Yjs state interpreted every delivered original correctly.

The separate pinned-library original-order counterexample and pending donor snapshot handoff remain
core gates. No vendor patch, transport-format change, record reordering, compaction-policy change or
migration follows from this checkpoint. Those behaviors must be addressed against original saved bytes
and independent semantic oracles before destination/import work resumes. Matrix evidence and its three
pins advance; obligations and debt statuses remain unchanged.
