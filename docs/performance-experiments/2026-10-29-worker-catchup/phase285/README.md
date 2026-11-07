# Phase 285 — bounded composed peer range writer

2026-10-30. Development-only v2 reader now has one application writer: composed peer catch-up
through an authenticated observed tip. Normal planning combines up to four positions in one signed
request. Self reconciliation, manual/noncomposed reads and unknown-tip probes keep limit1. Actual
verified positions consume the unchanged four-position publisher allowance; a short page credits
only its fitting verified prefix. Request/page bytes, original signatures and the owned request set
remain exact. No native progress is inferred from a transport hint or allocation.

The existing atomic group verifier/commit handles wider pages. Fresh authority, lifetime, epoch,
prefix, history, expiry, complete witness, native readback and final Window acknowledgement remain.
Transient verified results are owned before the last lifetime check and erased on failure, including
an unused fitting-bound tail. Large range originals select fresh single-entry work for that publisher
only; aggregation capability remains separate. Size/source/native record/pending limits, service
16/session64/process budgets, retry/backoff and local flushing are unchanged. Wire supports8 but
this phase does not multiply the admission turn: eight-entry network/tail continuation is next.

Seven new unit/property cases pass, including weighted rotation/short credit, invalid excess credit,
planner bounds and scoped/bounded size hints that never rewrite signatures or disable batching.
Three isolated faults are detected: HTTP-count credit instead of positions, ignored width, and a
publisher hint leaking to all publishers.159 focused units and the existing11 native encrypted
receive-group tests pass, retaining corruption, sealed readback, interruption, byte/record fitting
prefix, cold reopen and all old assertions/deadlines. Full Vitest2832pass/oneexisting skip,279files;
119 metadata checks,7 repository contracts, types and scoped lint/format pass.

The first planning record correctly refused a changed construction inventory after the reviewed
writer entry point was added; preserve that attempt. Re-recording the reviewed inventory before
the plan restores agreement. Independent reconciliation:503 runtime files,199 unchanged label
homes, exactly3source identities changed, all78specified constructions and16open preserved. All
1030old manifest rows retained; only the existing open range construction gains its new required
test dependency. One required uncredited test added:1031rows/484unresolved. No aggregate credit.

Deep4 and8 latency/native fairness, Page64 deep, date-fixture recipe, withheld signed comparison
and normal gates remain. Full checks are functional, not16ms/2.5s/30s acceptance. Native stale-tab
and old-application rollback observations are still required before release work. No normal
Page/Worker comparison, release prep, service automation, signing, push, deploy, preview, computer
use or personal-profile access.
