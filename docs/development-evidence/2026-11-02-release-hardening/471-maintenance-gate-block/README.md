# Phase 471 — both original maintenance cells pass three replicates

All five declared remaining journeys pass on the unchanged ordinary phase 470
build. Combined with its first normal run, old-maintenance-normal and
old-maintenance-withheld each pass 3/3. Every actual app run is retained; none
failed or was replaced. No new build, source/test change, profiler, lab factor,
guard, limit, budget or deadline. The API and service-automation-off profile stay.

| Journey | Completion after last key (s) | Input p95 (ms) | Peer p95 (ms) | Worst marker (ms) | Backlog (s) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Normal 1 | 26.212 | 3.384 | 796.318 | 784.747 | 32.485 |
| Withheld 1 | 29.991 | 3.180 | 1829.596 | 1286.173 | 26.962 |
| Normal 2 | 34.719 | 3.530 | 796.353 | 803.622 | 32.990 |
| Withheld 2 | 33.261 | 3.484 | 1847.544 | 1776.694 | 26.990 |
| Normal 3 | 25.692 | 3.696 | 816.707 | 808.518 | 33.561 |
| Withheld 3 | 29.093 | 3.530 | 1830.457 | 1567.665 | 27.488 |

Every current analyzer predicate passes, including active preparation with
unfinished backlog, all 120 keys, exact full archive plus offered append,
Undo/peer convergence, completion within the original 120-second wait and both
ordinary offline cold exports. The withheld runs exercise actual notification
withholding and retain the original historical 10% backlog comparison; ratios
are 0.2941, 0.2945 and 0.2999. This is the existing qualified historical reference,
not a new matched causal before/after measurement.

The two operator-approved old-fixture amendments stay explicit: the >=60-key
overlap and saved-slice prerequisite are informational. Actual old overlap is
34–47 keys; no claim that it meets the grown predicate. Grown >=60 and native/
grown resumability requirements remain unchanged and unrun on this candidate.

The old case records no individual cold-stage durations. A conservative joint
bound is available: all cold work starts after the observed successful maintenance
completion. Through wrapper finish, including both sequential reopens, exports,
all cleanup, renderer/host clock upper bound and a 2 ms rounding allowance, the
six bounds are 5.053 / 7.189 / 5.001 / 7.049 / 5.611 / 7.198 seconds. Each entire
segment is below 15 seconds, bounding either contained cold run as well. These
are upper bounds, not individual cold timings or a new test assertion.

Public status observes completion in attempts 2–3. Its interruption counts are
presentation-derived and are not native job traces. Unlike phases 467/468, each
run completes; no new claim about which earlier interruption guard fired is
inferred without tracing. Before runs and their 120-second failures remain.

The full phase 470 private manifest (2,891 files), all 125 shipping files, ten
private case/helper/analyzer bindings and all seven phase 469 working-source
bindings remain exact. Five-second host logs have 23–24 display-on samples per
run and constant 12,932.44 MiB swap. No failed replicate triggers the predeclared
noise rule; no retry is taken. Raw profiles/state/logs remain local behind one
manifest. Windowed power files and full-log SHA/size records remain, with no
repeated full-log or evidence object copies in Git.

The repaired-source candidate now has 6/36 blocking journeys passing, two cells.
Earlier-source results remain evidence and are not silently transferred. Thirty
blocking journeys remain: native x9, late-writing x6, fairness x3, Goals x6, grown
maintenance x6. Report-only work and Stage 6 remain. The phase 469 full unit
checkpoint still stands; this evidence phase changes no runtime or test.

The timed block is complete and the operator may resume other host work. No
commit, push, release preparation or deployment. Next bounded gate block may be
grown maintenance, with both owners observed and its unchanged overlap predicate.
