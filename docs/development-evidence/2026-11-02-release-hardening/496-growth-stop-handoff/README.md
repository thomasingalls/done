# Stage 6 amendment — growth diagnosis and new stop

This amends the [phase 491 landing report](../491-landing-report/README.md). Its 36 passing original blocking journeys, nine valid report-only journeys and six report-only latency misses remain recorded unchanged. The requested 3,072-position report remains unavailable. A new unexplained post-maintenance publication stall means the current candidate is **not cleared for landing** by those earlier passes.

## What the growth investigation established

[Phase 492](../492-fixture-growth-existing-evidence/README.md) preserves the original timing evidence. [Phase 493](../493-publication-proposal-cliff/README.md) runs one fresh diagnostic: the detached publication proposal first exceeds the unchanged 33,554,432-byte index guard at additional edit 294, charging 33,559,042 bytes. Publication wait increases from a 1.222-second mean in the preceding 32 edits to 3.338 seconds in the following four. Admission and durability remain small. The live retained index remains eligible at about 24.3 MB and main full verification stays at one.

The relevant fallback is therefore full delivery verification of proposed submission/response state, not an eviction of the live index or a proven network limit. This is source-bound attribution with stage and byte evidence, not a sampled CPU breakdown. The existing safe fallback and its guard remain unchanged.

[Phase 494](../494-maintained-producer-fixture/README.md) adds only fixture preparation: wait for the producer's normal automatic local reduction, verify unchanged complete writing and server tuples, close/reopen and verify the baseline again, then execute the original 1,024 individually accepted edits. Nine regression controls pass. Removing only the added preparation recovers the original recipe exactly. The entire preparation, growth and final checks retain one 1,800-second setup case, the 30-second per-position assertion and the same wrapper. No server pruning or synthetic storage edits are used.

[Phase 495](../495-maintained-growth-stop/README.md) proves maintenance and native reopen preserve the full archive and service history. It completes maintenance in 93.905 seconds over eleven attempts and then confirms 101 new positions, with a 383.69 ms mean inter-acceptance gap. The next original 30-second assertion fails: expected 2,156, observed 2,155. A strict observer on a private stopped-service copy confirms exactly 101 new acceptances. Decision tables contain no recorded refusal, but this does not rule out a network refusal or establish the owner lifecycle. No exact request/Worker error was captured. There is no proof of writing loss, and no basis to dismiss the failure as stale Window status.

Stop before any further app run under the hardening rule. Do not increase the timeout, relax the assertion, continue a failed fixture or replace the requested workload with fewer positions. The prepared returning-reader case retains the original checks/deadlines and six passing counter controls, but it has no 3,072 fixture and has not run. First fallback position, returning-reader drain, Undo and cold exactness are still unavailable.

## Updated debts and handoff

- Add the new post-maintenance publication stall to the blockers. Trace the next request, service outcome, Worker owner state and Window mirror before another fixture attempt. The stopped run cannot establish post-close local durability because it did not save a final producer profile.
- Add the detached publication-proposal byte ceiling and its full-delivery fallback to the cost backlog. The trace does not justify widening the 32 MiB guard or dropping the full comparison.
- Keep the original preparation-cost, real-scale index time/RAM and capacity-park debts. Producer reduction makes early growth faster, but this failed attempt is not a completed fix or a RAM result.
- Keep every [Worker reply census finding](../491-landing-report/worker-replies.md): compositionStatus is history-sized, each call loads/decodes the catalog, and bounded/paginated summary work remains. The fixture's bounded poll does not repair those shipped APIs.
- Keep all previous format/rollback obligations. Dense writing is approved, but final signed-source writer-on and same-tree reader-on/writer-off images still need the separate publication procedure. Any pre-release rollback locks out devices that wrote dense rows. No flag, format, trust, budget or security decision changed.

All 2,046 app build inputs and 167 plain/native served files remain exact. No app source changed in phases 492–496. Every attempt, five-second external host log and windowed power record is retained. These prepared sequential patches are unsigned and unpushed. No release preparation, merge or deployment was started by this continuation.
