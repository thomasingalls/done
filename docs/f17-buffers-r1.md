# F-17 persistent text-history buffers, first experiment

**Buffer reuse works in the tested scope, but this implementation is slower. Preserve it as an
optional prototype and keep R3 + membership-repair eligibility selected.** The preceding publication
phase is signed and signature-verified as `85a58bd4ef247612cfbfe66215ec084ca4ace2a3`.
[Source, controls and raw results](./performance-experiments/2026-09-15-f17-buffers-r1/README.md).

## What changed in the experiment

Two private Local document/history objects alternate between accepted and prepared roles. After an
eligible text acceptance, the previous accepted state can be explicitly retired. The next preparation
acquires that exact state, applies the saved accepted delta, copies full undo/redo stacks and owned
selection metadata, and fully compares its document with the current accepted basis before editing.
The existing full post-admission canonical comparison remains too. Here, persistent means runtime
reuse within an unlocked owner; there is no additional disk format or durable history feature.

The preparation owner allows one reacquisition only after explicit retirement of an earlier transfer.
Current accepted, foreign, duplicate and alias states refuse. Delayed callbacks still fail before
destroying a known document, including after reassignment. Write-lease cancellation retains its
existing destruction/erasure boundary. The workspace owns and clears one spare and one detached
accepted-update copy. Public snapshots and selections remain detached.

Actual changed Yjs types authorize only existing card/Goals text. Remote, metadata, structural,
undo/redo or unknown transitions reset the spare. A conservative normalization guard rejects
surrogate-bearing fields/keys, pending dependencies and unsupported object/content shapes.
Consequently, emoji-bearing workspaces use fresh forks in this first version. Generic preparation,
Local handoff and Account capture keep their prior behavior. Only the isolated private Local
snapshot candidate enables reuse. [Boundary review](./performance-experiments/2026-09-15-f17-buffers-r1/implementation-review.md).

## Controls and corrections

**224 unique tests across 15 files pass**, including 14 new cases and 60 new generated differential
histories. They exercise real two-document alternation, detached ranges/metadata, consumed-byte
erasure, retained reads, undo/redo, 1,001-character slices, deletion, selection, remote/structural
resets, normalization, refusal/retry/discard, write-lease close and cold replay. Existing suites
add pending/source/repair/selection and editor/IME coverage. Three deliberate faults are detected:
premature retirement, missing delta catch-up and shared mutable history.

The initial close fixture incorrectly assumed the write had acquired its lease as soon as preparation
completed; it now waits for the actual append reference. A negative-zero expectation was also wrong:
the pinned codec preserves it. A native-fork probe did confirm that sparse holes and extra or
nonenumerable properties change across a fork. The original eligibility guard accepted these shapes;
it now rejects them. Original tests, failures, probes and corrections remain. These are internal
eligibility/fixture findings, not observed loss of user writing.

Final lifetime review found an unnecessary strong lastAdopted reference surviving handoff completion
and close. The corrected code consults the already bounded current preparation slot instead.
The launched four-session ordinary batch drained successfully; its 320 measurements/416 warmups and
entire frozen source/build/control snapshot remain separate. After repair, 121 affected ownership/
workspace cases, TypeScript and all three faults pass again. The candidate is rebuilt and 418 identities
refrozen before the final six-session campaign. No heap reclamation is claimed from this static
reference correction. [Findings and provenance](./performance-experiments/2026-09-15-f17-buffers-r1/control-findings.md).

## Final application comparison

Both variants use the actual React Compiler build, identical private Local activation and symmetric
build-only preparation counters. The screen reads counters outside timed loops: **each ordinary
candidate block records 40 reuses; selected and Unicode blocks record 0**. This confirms the intended
paths rather than merely assuming activation. Common workload and paint-proxy recorder remain fixed.

Fresh Chromium 151 sessions use Pixel 7 settings, 1280×900 viewport, 20 days×15 seeded cards, 400 Goals
lines and a marked edited card. CPU4 applies after setup. Eight warmups/40 early keys precede 96
warmups/40 later keys, with 50 ms requested gaps. All **six final sessions /480 measured keys /624
warmups** pass text, bounded undo/redo, corpus checks, edited-card reopen and owned process drain.

| Ordinary-text block | Selected median | Candidate median | Paired median regression | Paired p95 regression |
| --- | ---: | ---: | ---: | ---: |
| Early | 43.80 ms | 46.80 ms | 6.8% | 5.0% |
| Later | 43.85 ms | 45.60 ms | 4.0% | 4.3% |

Latency cells are medians of session statistics; percentages use median paired ratios. Every
individual ordinary median/p95 pair is slower. Individual median regressions are 9.4%/4.3% early
and 6.7%/1.4% later. Unicode fallback medians regress 3.2%/2.1%; p95 regresses 1.1% early and improves
2.5% later. [Final analysis](./performance-experiments/2026-09-15-f17-buffers-r1/analysis.json).

This is descriptive pilot evidence from two ordinary pairs and one fallback guard. Dependent keys,
40-sample p95, host/JIT/GC drift and added counter instrumentation limit inference. Corpus checks
cover counts, markers and Goals line count, not every byte. Undo requires changed text and exact
redo, not one-key history depth; later blocks are not verified deep-history strata. No profile,
memory/GC campaign, phone run, native Account campaign or unchanged application-gate rerun occurs.
Absolute timings are not directly comparable with previous experiments. All ten sessions survive;
the four earlier sessions are not pooled into final-candidate statistics.

## Disposition and next step

Preserve the four-file runtime increment, retirement mechanism and controls as an optional prototype.
Keep the previous selected improvements. These results decline this implementation; they do not
reject persistent buffers or demand a one-shot solution to F-17. [Decision](./performance-experiments/2026-09-15-f17-buffers-r1/decision.md).

**Next: targeted cost accounting and replay-basis proof.** Measure the added full catch-up comparison
and stack copying against the saved fork. Specify when replay establishes the exact basis of a fresh
fork; then consider replacing this prototype's added comparison while retaining the existing full
post-admission check. The present run cannot attribute the regression to that comparison. Incremental
stack mirroring is another option after measuring its cost. Wider normalization eligibility and
native ownership/crash/memory/Account qualification remain. Incremental verification of the existing
canonical check remains a separate later proof and failure-detection-policy decision.

Main runtime/tests/defaults and release counts remain unchanged: 618 obligations; 263 files /2,121
dispositions (11 not applicable); 0 test-file /96 command /63 campaign unresolved. F-17 stays partial;
the last actual gate remains 12.2/75.1 ms desktop/CPU4 card p95 and 54.2 ms Android focus. No release
receipt or budget relaxation is added. Prior packet, 52 personal/package/vector pins, root perspective,
signed append-only prefixes and L-2 verify unchanged. Personal app/server, phone, relay and deployment
remain untouched. This new phase is uncommitted.


**Subsequent checkpoint.** This phase is now signed and signature-verified as `aa54be31`. Its next cost-accounting/replay step is complete in [the replay assessment](./f17-replay-r1.md); the original guarded measurements and archived packet remain unchanged.
