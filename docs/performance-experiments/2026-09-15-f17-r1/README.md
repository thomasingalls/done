# F-17 exploratory round 1 evidence

[Assessment and disposition](../../f17-exploration-r1.md). This is a lightweight experiment packet, not a conformance or release receipt. Base: signed `20a535c44d2c33b394306fa67023c62d2d9c5f40`. Main runtime/tests and product defaults remain unchanged.

- `protocol.md`: prospective screen plus explicitly labelled execution/amendment notes.
- `combination-decision.md`: choice recorded before full-corpus measurements.
- `preparation/`, `allocation/`, `publication/`: individual patches, notes, focused logs, prior defective versions where applicable.
- `combined.patch`: all three candidates plus integration type-only corrections, including the new test file. It applies to the signed base in a disposable checkout; it does not itself change default activation.
- `build.mjs`: same build-only `local-snapshots` activation for each variant. Compressed source-hash maps identify resulting source; compiled app/source maps remain under `/private/tmp/done-f17-exploration-r1/builds/`.
- `screen.mjs`, `measure.mjs`, `recorder.mjs`, `batch.mjs`: exact timing helpers; seeded through the actual packaged UI. `prepare-helper.mjs` records the original helper transformation.
- `diagnose.mjs`, `diagnose-settle.mjs`: declared diagnostic follow-ups to the immediate Undo assertion failure. The latter has the corrected bounded settlement check for future experiments. As-run timing helpers are retained unchanged.
- `results/`: all 12 timing-session results, including all 960 samples, and four diagnostic results; compressed CPU/allocation profiles and mapped observations. The failed diagnostic is included, with its unfinished postchecks explicit.
- `analysis.json`: session summaries and paired ratios; `analyze.mjs` reproduces them from raw results in the original scratch layout. `analyze-profile.mjs` records the source-mapping procedure.
- Focused checks: final combined 5 files /126 cases and TypeScript pass. Initial annotation, fixture and semantic failures are retained.
- `preservation.json`: 52 personal/package/vector pins and the L-2 suffix match the start. `sha256.json` identifies packet bytes; this is simple integrity bookkeeping, not an owned release-runner certification.

Run helpers refer to the original absolute scratch/main paths and installed pinned dependencies. To reproduce elsewhere, create isolated checkouts at the recorded base, apply the selected patches, adapt those paths, rebuild with the same configuration, and declare a new measurement run. Do not treat reconstructed runs as the original observations. Do not run the personal server or another test/build alongside measurements. Timed observations are exploratory; all normal release gates remain ahead of RC entry.
