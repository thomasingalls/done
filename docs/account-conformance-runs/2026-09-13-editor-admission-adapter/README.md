# Editor-admission catalogue adapter — bounded evidence

Baseline `4fc3af0` (unsigned) plus this adapter's changes. This packet covers the Goals CodeMirror
catalogue, shared-runner repairs uncovered by native execution, and selected regressions. It is not
an immutable release aggregate. Executable/test bytes from the final full run were checked before
archival; checkpoint/evidence prose was written around/after runs. A guide punctuation correction
followed the final static checks. Production code, scenario assertions and catalogue patches are unchanged.

## Results

| Run | Result |
| --- | --- |
| Initial full editor run | Failed: multicaret raised `No tile at position undefined`; other baselines and three intended mutations completed. A failed receipt and drained groups were recorded. |
| Full run after overlay repair | All 12 baselines and three mutation detections completed, but report reconciliation failed and receipt serialization also failed. Overall run remains failed; there is no stage receipt. |
| Final full standalone editor | All 12 baselines, 61 assertions and three intended mutation detections; worker/browser groups drained. Stage 67.3 s; whole command 93.5 s. |
| Selected editor pressure | One baseline and both applicable mutations; standalone output and JSON/Markdown reports preserved. |
| Selected baseline-only editor | One pressure baseline and exactly zero mutations. |
| Selected prior-family regressions | Content unreadable-load: one case/one mutation; journal handoff: one/one; admission refusal-order: one/two. All passed with overlays inside their disposable checkout. |
| Final non-native gates | Eight pass: inventory, manifest, 51 non-native tests, types, lint, format, authority and expected whole-release refusal. |
| Disposable infrastructure | Nine stages: 36 exact cases and two static checks; all groups drained. |
| Final native ownership controls | Seven pass: completion, deadline, cancellation, worker death, browser death, startup deadline and dependency-instance identity. |
| Standalone option refusals | Unsupported browser override creates no output; existing output refuses and preserves its prior report hash. |

The previous-family selections ran after the overlay repair and before the later report/startup
repairs. Their input deltas retain that distinction. Final editor and native ownership runs exercise
the final runner; the static controls cover all four adapters. Earlier complete content, journal and
admission campaigns were not rerun or credited as new full campaigns here. Some native runs overlapped;
timings are host observations, not comparative performance evidence.

## What the native failures uncovered

**Separate dependency instances.** The original shared runner put generated source beside reports,
outside the disposable checkout. The editor overlay then resolved CodeMirror from the original
worktree, while fixture imports resolved the copied installation. Equal file bytes did not give those
modules equal constructor identity. The multicaret selection failed inside CodeMirror when passed
between these copies. All four workers now put generated source and Vite caches inside the disposable
checkout; evidence files remain in the requested output directory.

A native control uses equal package bytes in two installations and compares the class objects loaded
by a fixture and an overlay. Before repair, it records `moduleIdentity:false` and fails; after repair,
`true` and success. The first exploratory version allowed Vite prebundling and passed without finding
the problem. The corrected control uses the catalogue's `noDiscovery:true`; only that discriminating
before/after comparison is credited. Exploratory logs remain in `resolution-controls/`.

**Lost assertion values.** Export-refusal assertions compare against `undefined`. Plain JSON removed
those `actual`/`expected` properties, so the parent correctly rejected the saved report despite passing
in-memory comparisons. Editor reports now declare `tagged-json-v1` and encode supported plain values
with explicit tags, preserving undefined versus null, negative zero and nested array/object structure.
The parent validates those tags and recomputes assertion equality. Unsupported values refuse. Scenarios
still perform their original comparisons; missing fields are not treated as evidence. Other report
families retain their existing representation pending individual review.

**Missing failure receipt.** After reconciliation threw, the old runner retained a partially parsed
report without a top-level `cases` field and inserted an undefined value into the receipt. Canonical
serialization then threw, leaving the second full run without a receipt. The runner now assigns result
cases only after reconciliation succeeds. A malformed-report control requires a complete failed
receipt with its reason and drained group. The initial missing receipt is recorded, not reconstructed.

**Endpoint publication.** An intermediate native ownership run failed at browser startup with
`Invalid owned browser endpoint`; its retained endpoint file was valid afterward and browser drain
was recorded. That observation is consistent with incomplete file publication but does not reveal
which partial bytes were read. Controlled processes publishing an empty file, a port, a partial path
and then a full endpoint reproduce the premature refusal. The owner now retries within the existing
startup deadline and requires a complete port/UUID path. A permanently incomplete endpoint never
becomes ready and still drains. These two controls use a synthetic publisher, not Chromium. The final
seven-control campaign uses actual Chromium and passes, including the original deadline case.

## Assertions and scope

The editor catalogue retains native typing/multicaret, formatting, cut, undo/redo, the actual checkbox
widget, pressure and retry, export, remote history mapping, BroadcastChannel delivery, Unicode paste,
Blink composition, close/repair and a preparation profile. Source overlays include `src/`, the shared
Account protocol files and generated journal WASM. The parent compares exact source populations and
hashes, with an actual uniquely anchored byte change for each mutation.

Candidate `editor`, scope `editor-admission-browser`, full editor patch paths and catalogue identity
are bound separately. The three mutants are `history-before-receipt`, `ordinary-view-before-receipt`
and `remote-in-undo`. The first two target the same pressure case but different files/assertions; one
result cannot discharge both. Each expected assertion must pass in the baseline and fail in its
specific mutant. Duplicate/omitted results, another mutation's source hash and unrelated failures refuse.

Five editor-adapter tests include 160 generated selections (seed 130907). Combined with earlier seeds
130901–130906, the 51 non-native controls contain **1,120 generated validation histories**. These test
the validation infrastructure, not another 1,120 product histories. Three added process controls cover
failure-receipt serialization and fragmented endpoint publication. Seven native ownership controls
are counted separately, for 58 tests across the two final control runs.

The preparation case retains 230 recorded samples across five shapes: three text sizes, 2,000 middle
inserts by one writer, and 2,000 distinct writers. These are finite scaling samples, not an input-to-paint
or low-end-device budget pass. Composition uses CDP to exercise Blink; it does not qualify native IMEs,
mobile input or supported-device populations. Startup, complete workspace commands, Account authority,
OS/power loss and raw clone/rollback remain outside this catalogue. Ownership is cooperative POSIX
process management, not an OS containment boundary.

## Reproduction

Use installed dependencies and Playwright Chromium. These commands neither install dependencies nor
use the personal app/profile/server. Native commands need permission for disposable browsers and
loopback listeners. Choose fresh output directories.

```sh
node scripts/release-validation/check.mjs
node scripts/release-validation/plan.mjs
node --test --test-concurrency=1 test/release-validation/*.test.mjs
node scripts/editor-admission/run.mjs
node scripts/editor-admission/run.mjs --case E02.pressure --output test-results/editor-pressure-new
node scripts/editor-admission/run.mjs --case E02.pressure --no-mutants --output test-results/editor-baseline-new
node scripts/release-validation/execute.mjs --selection content-control
node scripts/journal/run.mjs --case C01.handoff-race --output test-results/editor-journal-new
node scripts/admission/run.mjs --case C03.ordered-refusal --output test-results/editor-admission-new
node scripts/release-validation/execute.mjs --selection infrastructure
```

The manifest's `editor-admission` selection uses the same full factory as the standalone command.
Its default catalogue, package leaf and campaign alias resolve; enclosing wrappers retain independent
prerequisites and postconditions. The manifest has 599 obligations, 436 unresolved. Seven catalogue
adapters remain (106 cases/34 mutations), beginning with workspace-admission's ten cases/four mutations.
Whole-release execution still refuses; remaining adapters/wrappers precede P-06 and aggregate validation.

Multiple-case workers retain 120 seconds, single-case workers 90 seconds, browser startup 15 seconds
and separate 5-second TERM/KILL grace periods per group. Logs/reports retain 4 MiB ceilings. Copying
and fingerprinting are separate preparation. Browser background logs remain; zero background networking
is not claimed. The installed runtime is Node 26.8.2, macOS arm64, Chromium 151.0.7922.34 and Playwright 1.62.0.

## Artifacts and preservation

The prospective packet ceiling is **1,500,000 bytes**. Retain compressed reports, receipts, logs,
identity closures, repair controls and summaries; omit profiles, copied dependencies/source trees,
source overlays and caches. The final base closure pins 14,187 source/document/evidence paths, 8,761
installed dependency entries, the Node executable and 339 Chromium bundle entries.

[runs.json](./runs.json) distinguishes overall status, raw worker status and receipt availability.
[archive-files.json](./archive-files.json) maps original artifact hashes to normalized, compressed
archives; equal normalized artifacts share storage. Worktree, browser-cache and disposable prefixes
are normalized. Test-generated IDs and other runtime paths remain meaningful. This is local retention,
not completion of Q-08's public evidence policy. Receipt hashes refer to original bytes; the index
preserves correspondence after normalization.

`passing-full/inputs.json.gz` is the base. To reconstruct another run, remove `removeFields`, replace
`fields`, apply each collection's remove/upsert `patches`, and sort rows by `path`. Canonical JSON uses
sorted object keys, compact separators and a trailing newline; its hash must match
`targetNormalizedSha256`. Original unnormalized reconstruction was also checked before archival.

[preservation.json](./preservation.json) records 21 unchanged personal package files, 31 unchanged prior
vector files, append-only completed/decision records and an unchanged L-2 suffix. Root `done ` was not
read or changed. No personal app/profile/service/build, recovery material, Account, factor or key was
used. Historical reviews, intake manifests and formal debts are unchanged. This phase remains
uncommitted; `4fc3af0` and earlier unsigned hashes are preserved for the in-flight review.
