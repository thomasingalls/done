# Phase 466 — old saved-slice prerequisite expires

The first old-maintenance run times out at the unchanged90s prerequisite before
any typing. Public status shows one successful maintenance attempt, reported
2,920ms, observed durability-to-complete2,919.10ms, with no saved slice, overflow
or halt. Reader catch-up completes in23.943s. No typing/peer-latency/Undo/final
archive/cold checks are reached, so this attempt earns no gate credit.

This is a fixture exposure failure: it requires a saved slice and another active
verification interval, but the current1,024writer completes in one attempt. Do
not describe it as an app failure or turn absent input into a passing metric.
The original failed attempt and all22host samples stay. Swap is constant. A
single WindowServer sample is above one core; no non-test process remains above
one core for>10s. No noise-rule rerun is due.

Prepare an unapplied two-file proposal: old1,024case waits for active verification
with unfinished reader backlog, recording saved-slice presence as information;
the old analyzer does the same. Keep its90s wait, all other assertions and all
16ms/2.5s/120s/archive/cold/historical-comparison gates. Grown saved-slice and
native resumability checks remain unchanged. This is separate from the earlier
approved overlap amendment, so stop for an operator decision.

The operator now approves changing this fixture. Apply that exact proposal in a
fresh467root, preserving this failed run and original source. Three native
resumable cases already prove saved-slice/cold behavior; grown prerequisites stay.
Stage5remains15/36passing blocking journeys;21plus report-only work remain. No
app source, trust, format, limit, deadline, commit, push or deployment change.
