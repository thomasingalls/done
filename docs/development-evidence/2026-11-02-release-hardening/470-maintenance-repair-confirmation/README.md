# Phase 470 — original maintenance case passes after arbitration

The uninstrumented hardened build passes the same approved case that timed out
in phases 467 and 468. All 120 keys, active preparation with unfinished backlog,
full archive plus only the offered append, Undo/peer convergence, maintenance
completion and both ordinary offline cold exports are exact. The case body is
byte-identical to phase 467. No assertion, wait or deadline changes.

Maintenance completes 26.212 seconds after the last measured key, on public
attempt 2 (complete-stage elapsed 3.509 s). Public diagnostic interruption
counters are presentation-derived; no new native interruption/job trace is
claimed. Compare with seven interrupted attempts and zero completions at 120 s
before the repair. This is the old 1,024-position fixture, not the lab's 2,048
fixture, so it is not a matched comparison to the 34/55-second lab values.

Input p95 is 3.384 ms; peer p95 is 796.318 ms. All three markers pass at
784.747 / 620.388 / 737.555 ms. Backlog drain is 32.485 seconds. All ten current
analyzer predicates pass. Old-fixture overlap is informational as approved:
45 keys; the grown >=60 requirement remains unchanged. The old saved-slice
prerequisite is also information only, per the phase 466 operator amendment.

The original cold steps and their helper waits pass; this old body records no
separate complete cold durations, so none are invented. The full build includes
all standard bundle/origin-isolation checks. All 125 shipping assets are
ordinary release-profile output with lab/diagnostic markers absent. Exactly two
runtime files differ from phase 458: accountCapture and maintenanceTurns. API,
workload, flags, budgets and limits are unchanged. Service automation stays off.

Every raw profile/result, five-second host log and windowed power record remains
local behind hashes. No profiler is used. The repaired candidate has one passing
blocking journey so far; earlier candidate results remain historical evidence.
Do not silently transfer those source-bound results to this tree. Remaining old
maintenance replicates still need to run; the whole Stage 5 is not green.

No app/test change in this evidence phase, commit, push, release preparation or
deployment. A quiet-host handshake is requested for the remaining five cases.
