# Seeded legacy export capture — execution evidence, 2026-09-09

Phase thirteen was committed as **e64cd2a** before this work. The [capture checkpoint](../legacy-export-capture.md)
adds read-only diagnostic source recovery and an explicit Markdown preview, with controller-owned exclusion
in a disposable browser. It introduces no destination import, active selection, cleanup or live cutover.
The Markdown/system-attribution versus fidelity-archive choice remains open.

| Execution | Result | Evidence |
| --- | --- | --- |
| Native capture and cold artifact replay | 16 named checks, 60 generated histories, 240 core wire/content/inventory comparisons; pass | [JSON](./2026-09-09-legacy-export.json) |
| Sensitivity | Seven focused mutants detected by named assertions | Same JSON |
| Saved JSON history replay | Named scenarios and all seven mutants repeat successfully | [JSON](./2026-09-09-legacy-export-replay.json) |
| Source-reader regression | 12 named checks, 100 generated partitions / 400 comparisons, four detected mutants; pass | [JSON](./2026-09-09-export-source-regression.json) |

The default seed is **8941**. Each generated case varies authored strings, ten day collections, Next counts,
unfiled content, an optional archived first day, a dependent journal insertion/deletion, native record
partition/order and duplicates. It writes and rereads diagnostic JSON and preview ZIP files, establishes a
fresh browser runtime, and compares recovered Markdown entries against the external input-string ledger.
Original wire record identity/bytes are checked separately; Python `zipfile` supplies independent ZIP/CRC
readback. There are **64** fully saved/replayed candidates in the baseline (60 generated plus four named
positive/interrupted recaptures). An additional source packet is replayed after a post-save renderer death.

The baseline has **three actual renderer deaths**: after the initial source digest, during recovery-output
hashing, and after writing a recovery file but before file replay. The saved-history replay repeats those
named deaths. The separate source-reader regression includes its own one reader death. Source carriers
remain intact; interrupted/invalid candidates never become migration or deletion receipts. An old dedicated
worker holding the source DB is observed closing with its parent before the first capture. New pages and
prohibited old-route attempts invalidate the controller epoch; closing a new page does not restore it.

Chromium **151.0.7922.34**, Node **26.8.1**, macOS arm64. The three JSON evidence files are copies of the
raw reports under `test-results/legacy-export/{final,replay-check,source-regression}`. Parsed equality and
all recorded source/harness/guide hashes are checked. Inputs are frozen per native run; candidate mutations
are applied to separate copies. No generated counterexample occurred in the final run, so its shrink count
is zero. Failure seed/path/minimized JSON support and successful saved-history replay are both present.

## Defects and refusals established during preparation

A new refusal test caught a flaw in the first implementation of the preview validator: a Yjs array root
requested as Text can have valid wire bytes while `toDelta()` skips its ContentAny items. The candidate
then contained an empty `master.md`. The correction checks live text item kinds through the pinned Yjs
seam before projection. A native mutant removing the guard reproduces the bad acceptance. This was a
development defect in the new private capture path, not an executed migration or a user-data loss event.
Additional seam/attribute checks refuse map/sequence reinterpretation and non-plain text shapes.

The source survey also identified a membership state ordinary export cannot faithfully show: a registry
card points at an existing collection that omits its id, so neither the day file nor current `unfiled.md`
includes it. The capture now requires every registry card to be represented and refuses this state as
`legacy-membership-needs-repair`. It neither runs repair nor changes ordinary application export behavior.
Supported unfiled cards, canonical archives, empty card bodies and all ten days are verified positively.

| Mutant | Detecting assertion |
| --- | --- |
| Ignore foreign text item kinds | `text-array-refuses-candidate` |
| Omit journal records | `original-wire-inventory-preserved` |
| Export only the last three days | `all-authored-content-recovered` |
| Ignore pending dependencies at both checks | `pending-refuses-candidate` |
| Ignore incomplete membership projection | `membership-refuses-candidate` |
| Ignore the separately held packet digest | `separate-digest-required` |
| Forget observed exclusion loss | `exclusion-loss-refuses-verification` |

These are focused mutants, not generated/shrunk mutant schedules. Each named scenario passes unmodified,
then fails its indicated assertion on the relevant copied implementation; the saved-history run repeats
all seven controls. Harness exceptions and timeouts never count as detections. The first smoke run passed
ten-day capture/replay but failed when a negative fixture tried to reuse source memory after its old page
had been closed. Source mutation setup was moved before exclusion/cold startup; the second smoke run
passed. The array/Text refusal was then added, failed as described, and was repaired before final execution.

The 17 new unit tests include 100 generated multiline/Unicode payloads against the separate string ledger,
packet integrity/shape checks, pending dependencies, unsupported schemas/roots/paths, membership refusal
and mutation of the caller's packet buffer during asynchronous verification. Full Vitest passes **722 tests /
58 files**. Typecheck, focused lint/format, build/budget, vector/AAD and applicable project/governance/origin/
WASM/traceability checks pass. Initial JS remains **306.3 kB / 350.0 kB** gzipped. The usual Vite chunk warning
is below the repository's actual gzip budget. `storage:legacy-export` joins the check chain. The literal full
chain, geometry and separate unchanged encrypted custody/content/journal/admission/editor/workspace/startup/
genesis/clear/trim/property browser suites were not rerun for this private preparation path.

## Evidence boundary and next phase

This demonstrates controlled seeded exclusion and source/export recovery, not production supported-version
exclusion. Service workers are blocked from the disposable context's creation; only pinned fixture code is
admitted. Arbitrary historical SharedWorkers, other profiles/devices, hostile unlocked origin code, profile
forensics, memory/latency budgets and live old-relay retirement are not established here.

The diagnostic packet retains original source updates but has no portable encryption, authenticated archive
identity, migration authority, destination keys or writable counter restoration. Its external digest detects
changes relative to that digest; it cannot authenticate a packet whose bytes and expected digest are both
replaced. The Markdown preview exercises one adapter without selecting the real cutover policy. The next
bounded implementation is the authenticated pre-active destination/import owner with mandatory-factor fresh
writable scope, explicit verified source/carrier input and idempotent bounded slices. Selection/cleanup,
the full cutover kill matrix, the Stage 2 carrier choice and review 3a remain owed. No debt is paid.
