# Physical Pixel 9a companion: candidate improves, card budget still fails

Four fresh synthetic Local origins ran **R/C/C/R** on the author's Pixel 9a, Android 17,
Chrome 152.0.7977.83. The campaign ran 2026-09-14 22:16–22:28 UTC (September 15 locally).
No CPU/viewport emulation, screencasting or profiling. [Protocol and setup history](../../f17-pixel9a.md).

| Metric, ms | R first | C first | C second | R last | Budget |
| --- | ---: | ---: | ---: | ---: | ---: |
| Card typing p95 | 107.9 | 87.1 | 86.9 | 108.3 | <16 |
| Compose typing p95 | 14.8 | 14.4 | 14.2 | 15.7 | <16 |
| Card focus | 43.2 | 40.8 | 40.5 | 40.1 | <50 |
| Cold application work | 504.8 | 547.5 | 548.8 | 530.7 | <2500 |
| Warm application work | 496.3 | 496.9 | 531.5 | 541.6 | <1000 |
| Content replay | 21.9 | 31.1 | 21.9 | 24.9 | <500 |

The two opposite-order pairs show **19.3% and 19.8% lower card p95** with C. All four card
budgets fail; all other reported budgets pass. Every run cold-verifies the full 20×15-card,
400-line Goals corpus and the exact measured card text after reopening. All **960 trusted-key
samples** survive (120 per surface per session). No valid comparison run was retried.

This measures automated trusted keys on one physical phone. Actual median event gaps were
67.7–68.0 ms in compose and 140.9–158.8 ms in cards: the fixed 50 ms driver pause follows
command completion, and USB/browser processing adds time. Equal delivered input cadence is not
established. The measured typing viewport was consistently 411.43×403.81 CSS pixels with the
keyboard open, DPR 2.625. Separate frame intervals had medians 16.6–16.7 ms. Battery temperature
rose from 34.6 to 37.6 °C while charge stayed 81%; order reversal does not eliminate thermal or
other period effects. These are descriptive paired observations, not fleet estimates or confidence
intervals. On-screen keyboard/composition/autocorrect/undo/reopen testing remains pending.

The physical result supports further diagnosis of the slow card path. Keep the candidate private;
F-17 and the unchanged failed emulation gate remain open. This is a companion study, not a new
owned release-runner adapter or immutable qualification. The 96 command / 63 campaign obligations
are unchanged. No product source or personal packaged application changed.

`artifacts.json.gz` contains a content-addressed store of exact campaign and setup artifacts.
Failed startup, focus and selection checks remain distinct from the four comparison runs, including
their diagnostic observations. Synthetic factors remain only in the ignored local run directory.
Large build assets and the frozen input inventory remain under `/private/tmp/done-pixel9a`, pinned
by `raw-artifacts.json`. The predecessor verifier binds current functional sources, prior evidence,
52 personal/vector pins and preserved append-only/L-2 records. Chrome's debugging forward was
removed at campaign completion; temporary test servers remain available for the manual check and
expire separately. The dedicated adb server still needs shutdown after the phone exercise.

Run `python3 docs/account-conformance-runs/2026-09-15-f17-pixel9a/verify.py --raw` from the repo root.
The script independently recomputes percentiles, paired changes and budget results; it does not
run another timing sample. `analysis.json` retains full precision.
