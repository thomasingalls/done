# F-17 exploratory round 2 evidence

[Assessment and disposition](../../f17-exploration-r2.md). Exploratory application measurements, not release receipts. Base: signed `cc0f85c5ad7b7d3dde6b5b02477d0452c2066666`. Main runtime/tests and defaults remain unchanged.

- `protocol.md`: prospective component-removal, Unicode and editor comparisons.
- `editor-decision.md`: decision to compare the editor shortcut on preparation + pooling, recorded before its measurements; explicit setup-condition assertions added at that boundary.
- `selected.patch`: complete preparation + pooling + editor candidate above the signed base, including tests. It applies in a disposable checkout without changing default activation. Its inherited preparation and publication-focused controls remain useful even though publication caching is absent.
- `editor-result/`: editor-only patch, reasoning and focused evidence; initial ten-case log and final eleven-case log retained. Review caught the forced IME reconciliation requirement before browser measurements.
- The [round-one packet](../2026-09-15-f17-r1/README.md) holds the individual preparation, allocation and publication patches and their failed/repaired probes. `all` uses its complete combined patch. Each removal variant omits exactly the named runtime mechanism, keeping applicable type-only corrections. `editor-runtime-diff.json` records that the selected editor variant changes only `admittedEditor.ts` relative to `no-publication`.
- `build.mjs` and compressed `*-source.json.gz`: isolated build procedure and source identities. All variants use the same build-only `local-snapshots` opener selection. Compiled apps remain under `/private/tmp/done-f17-exploration-r2/builds/`.
- `screen-initial.mjs` / `batch-initial.mjs`: exact helpers for the initial ablations and Unicode comparison. `screen.mjs` / `batch.mjs`: final helpers with the explicit marker/emoji checks and added final Unicode pair. `measure.mjs` and `recorder.mjs` are shared timing helpers.
- `results/`: every timing session, all measured samples, condition flags when asserted, bounded undo/redo settlement, exact text/cold-reopen postchecks, and drain status. `*-batch.json` records actual order and timestamps. Earlier sessions lack the later explicit marker/emoji assertion; no observations are removed or retroactively upgraded.
- `analysis.json` and `analyze.mjs`: descriptive session summaries and paired ratios. Editor Unicode is a separate single-pair guard, never pooled into the ordinary editor comparison.
- `focused.json`, `*-focused.log`, `editor-composition-*.log`: bounded semantic checks and TypeScript for the selected composition. No full unit/native/release campaign ran this round.
- `wasm-assessment.md`: project-specific scope and primary references for a possible Rust/Wasm migration; no migration was started.
- `start.json` / `preservation.json`: earlier packet, personal/package/vector and L-2 preservation; main runtime/test changes absent. `sha256.json` identifies packet bytes, not owned-runner certification.

Helpers refer to the original absolute scratch/main paths and installed dependencies. To reproduce elsewhere, create disposable checkouts at the signed base, apply the recorded component patches (including applicable type-only corrections), adapt paths, rebuild and declare a new run. `selected.patch` supplies the complete selected variant directly. Do not run other builds/tests alongside serial timing or treat a reconstructed run as the original observation. Keep all qualification/default activation gates ahead of RC entry.
