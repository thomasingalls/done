# Private Local candidate: remaining browser cost

Prospective bounded diagnostic, September 15, 2026. The private handoff implementation is
uncommitted above signed `0c84e5cc`; freeze exact current sources and installed dependency bytes
before execution. This phase attributes remaining work, then selects a bounded repair. It does
not activate the candidate or repeat the application budget gate.

## Return from the phone comparison

The operator ends the physical-device work after the completed R/C/C/R comparison, including
the planned manual keyboard exercise. Preserve the [phone packet](./account-conformance-runs/2026-09-15-f17-pixel9a/README.md)
as recorded; its pending-manual field describes the state at measurement completion. The later
cancellation supplies no manual-keyboard qualification. The fixture server and its five owned
USB reverse forwards have closed, and the dedicated ADB server on port 5047 has stopped.

Keep the emulation reference numbers. For planning, the phone's mean card p95 divided by the
separate CPU-4x observation gives C: 87.0/63.5 = 1.37 and R: 108.1/69.4 = 1.56. Use roughly
**1.5 times emulated latency** as a back-of-the-envelope card-typing estimate. Different browser
versions, viewport, cadence and sessions prevent treating it as calibrated hardware equivalence
or measured evidence about other operations. No further phone campaign is scheduled.

## Fixed execution and analysis

Run the unchanged `browser-latency-diagnosis` selection exactly once on a disposable candidate
snapshot. The only snapshot source change is the explicit `local-handoff` argument to
`openAdmittedWorkspace`'s factory call; record its patch and all before/after input pins.
Actual Local and Account defaults remain the reference. Check original workspace identity after
the run. Preserve earlier functional, timing and phone packets, append-only record prefixes,
the other seat's progress suffix, and all 52 personal-package/vector pins.

Follow the existing [diagnostic protocol](./latency-diagnosis.md) without changing its recorder,
workload, deadlines or sample counts: desktop and CPU-4x Android-emulated projects; two reversed
120-key blocks on textarea, bare CodeMirror and admitted card (1,440 timings); separate 60-key
card-typing and ten-cycle card-focus CPU profiles per project. Require four passed cases, no
skips/retries, exact text, cold reopen and drained process groups. Missing samples/maps or a
functional failure refuses the run; retain the failed attempt rather than silently repeating it.
Run alone, without concurrent builds, tests or other profiling.

Retain raw profiles, mapped nodes, all timing samples, receipts, logs and source-map hashes;
keep full generated maps locally. Recompute quantiles from samples. Derive inclusive and self
CPU totals from sampled leaves and current source mappings, counting each leaf once per
ancestor category. Nested inclusive totals overlap and must not be added. Separate the history
document fork, undo/redo stack copying, full-state comparison, command work, publication and
editor work where the mappings permit. Do not attribute native `structuredClone` in isolation
from an inline callback's other work. Preserve unmapped/native/GC time rather than silently
allocating it to an application function.

## Decision rule and limits

Use the current candidate's dominant active call stacks to choose the next narrow design.
The older reference profile is context, not a matched causal comparison. Both earlier metadata
copy attempts missed their prospective performance rule; this run cannot rehabilitate them by
choosing a more favorable statistic. A new repair needs a distinct mechanism and preserved
refusal, durable admission, full verification, undo/redo, remote-order and pending-input semantics.
If attribution is ambiguous, record that and specify a focused probe before running it.

Timing and profiling are separate observations. Their diagnostic values neither replace nor
close the unchanged application gate: candidate card p95 remains 12.9/63.5 ms desktop/CPU-4x,
with Android over the <16 ms bound; the last reference observation remains 15.2/69.4 ms. A single
host, dependent samples, JIT/GC, profiler perturbation, accumulated history and scheduler/control
floors limit inference. F-17 stays partial; the 96 command and 63 campaign obligations and
immutable qualification remain open. No production optimization is included in this diagnostic.

## Observed result

The single owned run passed all four cases in 208.584 seconds of stage execution, with zero
skips/retries and drained process groups. It retained all 1,440 timing samples and four CPU
profiles. Full-corpus and exact added-card text checks passed through cold reopen. The original
workspace identity remained unchanged throughout execution. All 2,168 mapped nodes were
independently resolved again from their raw frames and full generated source map; its 79
application sources match the activated candidate. Full map bytes remain in the raw run.

| Diagnostic p95, ms | Desktop block 1 / 2 | CPU-4x Android block 1 / 2 |
| --- | ---: | ---: |
| Textarea | 1.4 / 1.3 | 5.9 / 5.8 |
| Bare CodeMirror | 1.9 / 16.9 | 7.6 / 19.1 |
| Admitted card | 14.6 / 13.7 | 80.5 / 68.7 |

The second CodeMirror block has a higher tail in both projects. Keep this scheduler/control
uncertainty; do not subtract its quantile from card latency. These observations do not replace
the earlier application gate values or establish a regression against its different run.

Separate 60-key CPU profiles attribute the following inclusive sampled time:

| Work, ms across 60 keys | Desktop | CPU-4x Android |
| --- | ---: | ---: |
| Workspace command preparation | 398.0 | 1,836.5 |
| Complete history fork, within preparation | 345.2 | 1,558.4 |
| Document fork, within history fork | 170.3 | 770.1 |
| Undo/redo stack copying, within history fork | 172.4 | 778.8 |
| Complete-state comparison during adoption | 190.2 | 804.8 |
| Workspace publication/listeners | 61.4 | 489.9 |

These rows overlap as indicated. The stack-item callback includes `structuredClone(meta)` and
range-copying work; its sampled self time does not isolate native cloning. Ten-cycle focus
profiles attribute 22.6/110.8 ms to editor construction. Native/unmapped, GC, program and idle
samples remain in the analysis; they are not silently assigned to an application function.
The candidate's source still explicitly bypasses the first admission draft; the remaining
history document fork, stack copying and full comparison are all substantial.

## Next bounded phase: ownership contract for selection snapshots

Pursue privately owned immutable selection snapshots before another runtime optimization.
The profile supports investigating the repeated history metadata copy; it does not establish
that this repair alone will meet the application budget. This is a different mechanism from
the two rejected shape-specific copiers: capture a detached snapshot when its value changes,
then safely reuse that owned value across history forks instead of cloning it on every fork.

Before implementation, specify a private opt-in metadata seam and add contract/reference controls:

1. Keep generic `forkWorkspaceHistory` fully detached for arbitrary structured-cloneable metadata.
   Limit reuse to snapshots created and sealed by the owning workspace. A TypeScript readonly
   annotation or `Object.freeze(Map)` does not prevent nested or Map mutation and is insufficient.
   Do not let caller-owned mutable objects become reusable metadata merely by recognizing shape.
2. Define capture, fork, restore and disposal ownership. Capture copies mutable input once; restore
   produces detached selections. No snapshot payload or mutable alias escapes. Foreign-owner,
   forged and stale references must refuse or take a documented safe fallback. Prove lifetime
   behavior across accepted/pending histories without retaining an unbounded registry after
   discard, history clearing or close.
3. Preserve before/after selection semantics for grouped edits, changed targets, nested aliases,
   undo/redo and redone links. Retained snapshots cannot change when later selections, restored
   values or another fork mutate. Keep complete document forks and canonical verification.
4. Compare current and proposed behavior on generated master/card selections, groups, undo/redo,
   failed writes, exact retry/discard, sliced commands, remote delivery and close. Deliberate
   nested sharing, cross-owner reuse and premature disposal mutations must fail named assertions.
   The existing generic isolation/fallback tests remain required.
5. Only after contract and component controls, opt into the private Local candidate and run the
   affected functional/native gates. Specify the fixed balanced performance comparison before
   measuring; then run the unchanged application gate if the new mechanism is useful. Account
   source capture and default activation remain separate decisions.

[Retained evidence](./account-conformance-runs/2026-09-15-f17-local-profile/README.md). This closes
diagnosis and selects the next contract phase; it changes no product source, format or budget.
