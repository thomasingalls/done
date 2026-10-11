# Incremental Account ledger experiment — predictions before implementation

Recorded 2026-10-10, before implementation or candidate measurement. Comparator: signed
`d5763346` (self-stream repair); historical attribution: the October 10 desktop typing packet.
This is bounded development measurement, not resumed release qualification.

## Decision and scope

Does incremental semantic validation reduce the growth of Account editing cost while preserving the
reference verifier's decisions? Keep the existing physical census, synchronous journal, authority
checks, commit guards and cold verifier. Enable the candidate through an internal build switch;
connect source/spool/delivery before completing receive/coverage to permit an early measurement.

## Predictions (hypotheses, not measurements)

For 100-key traced blocks beginning at 0, 520, 1,220 and 2,220 previous per-key edits, respectively:

| Main-thread work per key, p50 ms | 0 | 520 | 1,220 | 2,220 |
| --- | ---: | ---: | ---: | ---: |
| Predicted self-stream comparator | 145 | 350 | 575 | 850 |
| Predicted source/spool/delivery candidate | 100 | 210 | 360 | 560 |
| Predicted complete incremental candidate | 80 | 150 | 250 | 390 |

The historical trace implies roughly 0.32 ms additional main-thread work per prior edit over
0–2,220. The complete candidate hypothesis is at most 0.16 ms/edit (50% lower slope); the retained
physical census and state copies mean a flat curve is not predicted. These figures are deliberately
falsifiable estimates. The prior "500 of 705 ms" attribution is guidance, not an additive guarantee.
Stable-text p95 should improve at the two deepest points, with a working target of >=30% reduction;
a mixed result, missing text or exhausted preload deadline prevents claiming the latency repair done.

## Measurement and analysis

Same packaged application, local disposable service, Chromium version, viewport and fixed text/gaps
for both arms. Independent fresh browser/service state per arm, sequential execution. Preserve every
run, including failures. No concurrent native/browser campaigns while timing. Compare raw per-key
captures at matched achieved history sizes; do not silently substitute a shorter preload.

Primary quantities: main-thread p50-per-key slope (endpoint difference and all-four-point fit), and
stable-text p95 at each point. Secondary: paint, saving-indicator exposure, admission settling,
actual key intervals, physical bytes inspected, semantic events processed, cold-open duration,
post-GC heap/retained cache bytes, and compaction duration versus history. Measure the cost of a
single nontrivial coverage check on both small and larger documents, including deletes/pending data;
counting checks alone does not establish the cost improvement.

Use the existing typing instrumentation with traced 100-key blocks at the four specified points.
Cold-open and explicit compaction/coverage measurements are separate from timed typing. Record
natural compaction pauses too. Pure string insertion of a large paste is not equivalent to creating
that many historical per-key edits.

The unit of comparison is the browser run/block, not independent keystrokes: keys are autocorrelated,
percentiles are heavy-tailed, and one sequential pair cannot establish population confidence or phone
performance. Host load, batching and compaction timing can confound small differences. No p-values or
invented power calculation. If differences are marginal, retain the evidence and avoid shipping claims;
only repeat a predeclared matched comparison if needed to settle that decision, rather than selecting
favorable runs. Larger workspace microchecks do not establish whole-application large-corpus latency.

## Safety and memory guardrails

Differential generated histories and directed real-browser commit/abort/restart cases must agree with
the full reference. Fault controls must expose stale reuse, late reinstatement and changed-old-row
misclassification. Reuse positive coverage only; a negative result never becomes a cached verdict.
Exact-coverage compaction may preserve positives only when the replacement's full Yjs state is shown
equivalent, including pending/delete state. Context changes invalidate the view.

Retain one owner-local view with a budget; avoid adding another unbounded store-sized byte cache.
Use compact metadata for added indexes and bound coverage-positive bytes. Measure actual heap and
cold-open cost. Existing APIs that require retained envelope/source bytes may constrain replacing them
with digests in this slice; record that limitation rather than changing retry/duplicate guarantees.

Keep a low-cadence full reference comparison at a safe maintenance boundary. Report mismatch using
fixed diagnostic codes only, invalidate/stop the owner, and do not delay key erasure at lock to audit.
Measure that maintenance cost; no periodic foreground audit on the ordinary keystroke path.
