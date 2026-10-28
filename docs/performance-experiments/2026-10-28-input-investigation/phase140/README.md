# Phase140 — full-history card editing queues input in the renderer

All five frozen diagnostics complete once. Fault30/60/90 each registers the known80ms work through
independent DOM/RAF/heartbeat/longtask sensors; its low p95 still hides the rare stalls. Every120key
and all app markers are retained. Both app cases preserve full archives, peer real edit/undo,
maintenance completion, offline same-profile cold/no-reinjection, worker/resource/noOOM and
independent native signature/ciphertext/accepted-prefix/old-wire/unrelated-account checks.

| Condition | Host→DOM p95 upper | Browser keydown stamp→handler p95 | Beforeinput→DOM p95 | Renderer late p95 | Worker/parent late p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Static native before |8.3ms|0.9ms|0.7ms|6.7ms|2/3ms|
| Busy app / native input |5.4ms|0.8ms|0.5ms|4.7ms|2/2ms|
| Busy app / real card |**20.6ms**|**17.6ms**|0.7ms|23.8ms|2/2ms|
| Static native after |5.2ms|0.7ms|0.6ms|5.9ms|3/3ms|

Native control and editor each type all120keys during the backlog. Native input omits new editor
admissions/publications; this is a composite condition contrast, not a pure editor causal effect.
Browser-created timestamps are not hardware input, DOM/RAF are not physical paint, and marginal
p95s are not added. The internal timestamp→handler gap and renderer heartbeat distinguish queued
page delivery from slow mutation; small driver lateness argues against a generally blocked driver
in this fixture. It does not identify a particular function or establish exclusive CPU time.

The normal static bookends differ3.0999ms/37.35%, crossing the prospectively declared instability
flag. **No timing promotion or causal speedup claim.** Retain that drift; the converging renderer
signals justify a separate source-attribution profile, not activation or a changed threshold.

There are24over16ms inputs beyond the first5s; each last observes a non-running maintenance phase.
At typing end the real editor has2attempts/1interruption/0completions and is idle/activity-or-journal.
Thus investigate editing-induced background work after preparation yields. A new profile must
explicitly verify no maintenance attempt starts inside its middle-of-typing window. This is a
scheduling observation, not proof that all cleanup costs are absent.

Independent audit reconstructs all600key bounds/queue intervals, rejects wrong-quantile controls,
confirms byte-exact reuse of the October21 browser sensor/Node monitor, and audits both app stores.
All source/client/worker identities and original gates remain. Phase134 and138 failures are not
erased; resume/service remain default off. No runtime/old-test edits, qualification, phone result,
signing, push, preview, release artifact or deployment.
