# Final apply and protocol parsing attribution

Recorded before new measurements. Base signed `02829405`; no runtime repair in this investigation.
Release validation remains paused. Reuse the experiment-designer measurement-study workflow.

## Question and decision

Separate final editor FIFO occupancy into storage acquisition, fresh authority check, and synchronous
apply/publication; locate the synchronous parser bursts still blocking input. Select a bounded repair
without weakening fresh authority, lifetime, journal-before-apply, pending-update or live-undo checks.

Hypotheses, not results: (1) final authority storage/read work is most of final-job elapsed time;
(2) full joined-custody parsing outside the positive authentication memo and repeated inbound protocol
parsing explain some remaining long tasks; (3) actual Yjs apply/projection is smaller than the whole
70–93 ms final-job span. A finding to the contrary changes the proposed repair order.

## Measurement and units

Four restored diagnostic sessions, active/backlog then backlog/active. The last two also collect CPU
samples. One session is the observation/analysis unit; rows, keys, and samples within it are dependent.
Use the preceding packet's 120-card (~60 KB), 12 KB Goals fixtures, 120 keys at requested 150 ms gaps,
receiver CPU-4x, and 75 ms added service delay. Active peer makes ten edits; backlog starts 600 positions
behind. Profiles and wall-span sessions are described separately, not pooled into a speedup estimate.

Test-only Vite transforms add final-stage spans, authority read/equality spans, parser durations and
caller counts/byte sizes, and apply/projection spans. They retain no input values, account identities,
writing, tokens or keys. Sync parser spans nest; report inclusive versus exclusive time separately.
Correlate spans with long tasks and input waits, rather than adding overlapping durations. Record
source/build/probe/fixture hashes. Retain failures, including incomplete runs.

## Validity and stopping

No candidate/baseline causal claim: this is attribution of the current build, with instrumentation
and optional profiling overhead. A four-session convenience sample cannot establish tail percentiles
for phones or users. CDP may undersample pre-handler input blocking; async elapsed spans include
native waits and unrelated tasks. Same fixture reset avoids accumulated history between sessions;
serial runs avoid load interference from our own builds/tests. Source-map stack attribution may end
at async boundaries. Record instrumentation overhead as unmeasured.

Exact local text, undo/redo, peer text, export convergence and cold offline replay must pass each run.
No deployment, format change or removal of authority checks is permitted in this phase. If one stage
accounts for a majority of final-job elapsed time in both modes, prioritize its safe scheduling/work
reduction. Otherwise document the split instead of declaring one cause. For parsing, prioritize the
largest measured repeated synchronous caller that overlaps actual long tasks; a large aggregate alone
is insufficient. Stop after these four sessions and code-boundary analysis unless missing/failed data
requires a named correction. The deliverable is a repair recommendation and preserved evidence, not
another general conformance campaign.
