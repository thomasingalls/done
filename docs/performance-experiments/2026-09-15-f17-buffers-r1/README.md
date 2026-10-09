# F-17 persistent text-history buffer experiment

Above signed and signature-verified `85a58bd4ef247612cfbfe66215ec084ca4ace2a3`.
**Preserve this as an optional prototype; keep R3 + repair eligibility selected.** Actual reuse works
under the focused controls, but the final browser pairs are slower. Main runtime/tests/defaults and
release-adapter counts remain unchanged. [Assessment](../../f17-buffers-r1.md).

## Reconstructing the variants

`selected.patch` is exactly the publication packet's selected patch: R3 plus repair eligibility.
Apply it to a clean checkout of the signed base. `persistent-buffers.patch` applies on that comparator;
`candidate.patch` instead reconstructs the complete candidate directly from the signed base. Do not
apply both complete and incremental patches. `implementation/` contains the four changed runtime
files and the new/extended tests; the complete patch includes inherited test additions too.

`protocol.md` records the initial design and its two explicit amendments before the affected final
measurements. Build-only preparation counters are symmetric across variants. `screen.mjs` records
their values outside timed input loops and requires actual reuse in ordinary candidate blocks and
zero reuse for selected/Unicode blocks. `original-screen.mjs` preserves the previous helper;
`measure.mjs` and `recorder.mjs` stay byte-identical. The real React Compiler build retains the same
build-only Local snapshot activation. No diagnostic content, document or key access is exported.

`setup.py`, `prepare-measurement.py`, `build.mjs`, `freeze-final.py`, `batch-final.mjs` and
`analyze-final.mjs` preserve final execution. `commands.json` records control and measurement commands.
The initial edit scripts are historical steps, not the final reconstruction authority; use patches.
Build-only transformed sources, source/bundle manifests and `frozen-final.json` pin418 identities.
The source census includes new files. `batch-final.mjs` refuses reused output identities, verifies
pins before/after each session and owns bounded child process groups.

Scratch sources, dependencies and binary bundles/maps remain at `/private/tmp/done-f17-buffers-r1`;
binary assets and full scratch checkouts are not archived here. Repeats need fresh output identities
and explicit relocation of absolute paths. Reuse pinned dependencies rather than fetching new versions.
Host execution was confined to disposable loopback servers and Chromium profiles.

## Evidence retained

Final controls pass 224 unique tests across 15 files, including 14 new cases and 60 generated histories
(seed171510). After the final lifetime repair, 121 cases in the three affected ownership/workspace
files repeat successfully; TypeScript and all three faults pass in their intended roles. The fault
records bind each exact source/test identity, command and designated catching assertion. Deliberately
broken `*-fault.ts` files must not be used as candidate code.

`control-findings.md` preserves the original premature close-fixture assertion, mistaken negative-zero
expectation, actual sparse/extended/nonenumerable shape eligibility gap, test-type corrections and
the final reference-lifetime repair. `normalization-values.json` distinguishes preserved negative zero
from changed property layouts. The original strong lastAdopted reference was removed in favor of
the existing bounded preparation slot; this is a static lifetime correction, not a heap/GC result.

`before-retention-repair/` retains the original source patches, manifests, scripts, controls and four
ordinary timing sessions. All320 measured keys/416 warmups pass their own semantic/treatment/drain
checks, but that version is not the final candidate. Its original frozen source/build snapshot remains
in scratch for audit. Final measurements use six separate final-* identities:480 keys/624 warmups.
All ten sessions and their original samples survive. Only the final six enter `analysis.json`.

The final candidate records 40 reuses in every ordinary block; selected and Unicode blocks record 0.
All final sessions pass exact text, bounded undo/redo, existing corpus checks, edited-card cold reopen
and process drain. Ordinary paired medians regress 6.8% early /4.0% later; p95 regresses 5.0%/4.3%.
Unicode median regressions are 3.2%/2.1%, with mixed p95. `decision.md` records the optional disposition.

These are two ordinary session pairs and one Unicode fallback guard, not fleet, memory, deep-history,
GC or release-budget evidence. Keys are dependent; each p95 has40 samples. Corpus checks cover day
counts/markers and Goals line count rather than every byte; undo requires changed text and exact redo,
not one-key depth. The later block is not a verified history stratum. Counter updates are small added
instrumentation in both builds; no correction or cross-experiment absolute-latency claim is made.

`audit.py`/`audit.json` check both frozen versions, every session, actual reuse/fallback, patch
consistency, controls, prior packet, 52 personal/package/vector pins, root perspective, signed record
prefixes, main runtime/test invariance and L-2. Auditing source/bundles needs the original scratch
snapshot or faithful reconstruction; archived checksum verification alone does not rerun tests.
`sha256.json` pins every archived artifact except itself. No historical packet is rewritten and no
aggregate receipt or release obligation is added.
