# Fresh authority-read wait — prospective investigation

Base signed `b60d535d`. Product investigation only; release validation remains paused. No runtime
repair or authority-policy change is part of this slice.

## Question and scope

What occupies the fresh authority-read wait in the final editor promotion on the current build?
Separate database opening, cooperative budget yields, layout/cursor transaction work, deserialization
and JS continuation overhead before choosing a repair. Prior read medians were 30–46 ms at CPU-4x.
Hypotheses: connection opening dominates; cursor/native scheduling dominates; or budgeted `task.wait`
counts asynchronous time as CPU work and adds avoidable yields. None is assumed true.

## Design and measurement

Instrument only diagnostic builds. For every owned authority check, attach numeric events to its
SessionTask: probe invocation/callback, open issue/success, read callback entry, layout creation/end,
cursor transaction creation/completion, each cursor callback start/end and value retrieval, close
invocation, and each actual budgeted wait yield. Retain existing final-promotion/authority-read/equality
spans. Match checks to final jobs by containment and reject ambiguous matches. No keys, names, row
contents or identities are recorded. One operation's event timeline supplies the accounting; nested
async spans must not be summed as independent time. An IndexedDB request-to-callback interval includes
browser scheduling and main-thread availability, not just storage latency. `close()` measures the call,
not off-thread physical connection closure.

Four serial restored sessions, active peer and 600-position backlog, first without and then with CPU
sampling (1 ms requested interval). Same 120 cards/~60 KB, 12 KB Goals, ~400-character edited card,
120 keys at requested 150 ms gaps, CPU-4x receiver and 75 ms request delay as the last packet. Current
default membership yielding/reuse and cursor reader stay enabled. No other builds/tests during timing.
Sampling runs diagnose CPU overlap; do not pool them with unsampled timing or claim a speedup.

## Analysis, precision and decision

Report per-session final read/authority/apply distributions and decomposed elapsed totals/medians:
budget yields, open issue-to-callback, cursor issue-to-completion, synchronous callbacks/getters,
layout and close calls, residual JS/continuation time. Cursor callbacks are nested within transaction
elapsed time, not additive. Report final versus other authority checks separately. Compare final-wait
intervals to long tasks and sampled work; overlap is evidence of contention, not a causal effect.
Report checks completed across the timing boundary separately, not as zeros or silently dropped rows.

The restored session is the independent analysis unit; repeated checks/keys are dependent. Four
diagnostic sessions are a feasibility/attribution study, not a population latency estimate. There is
no power or significance claim. Instrumentation overhead, CPU emulation, automated-input timing,
changing amounts of completed sync and machine drift limit extrapolation to phones.

Choose the next repair around a component accounting for >50% of final read elapsed time in both
unsampled conditions, if one exists. Budget yields merit a separate scheduling repair if they account
for >=25% and at least 8 ms per final read in both conditions. If no component dominates, report the
split and propose a narrowly controlled experiment rather than dropping checks. If >20% of elapsed
time remains unaccounted for, permit one named instrumentation refinement and retain its earlier logs.
Do not change default behavior based on attribution alone.

## Guardrails and runbook

All four sessions must preserve exact local text, last-key undo/redo, peer writing, export convergence
and cold offline replay. Report unexpected HTTP refusals and stopped lanes. Never change native
transaction boundaries, queue order, complete fresh authority checks, lifetime checks or final apply.
Build once, run serially against disposable restored fixtures, retain failure evidence, check timeline
accounting, then record source/build/helper/fixture hashes and whitelisted numeric evidence. The study
does not qualify a release, prove a connection-cache lifetime design or establish a throughput gain.
