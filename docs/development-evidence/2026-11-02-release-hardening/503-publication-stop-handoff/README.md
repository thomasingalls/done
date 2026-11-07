# Stage 6 amendment — confirmed publication failure

This amends the [earlier landing report](../491-landing-report/README.md) and [growth handoff](../496-growth-stop-handoff/README.md). The 36 original blocking passes, nine valid report-only journeys and six report-only latency misses remain unchanged. The 3,072-position report is still unrun. The candidate is **not cleared for landing**.

## What this continuation establishes

- [497](../497-post-maintenance-diagnostic/README.md): a 160-edit diagnostic passes the earlier stall point with exact archive/reopen checks. It changes observation timing and does not resolve the old failure.
- [498](../498-session-fixture/README.md): a fixture-only four-session recipe preserves every original edit and final assertion; ten controls pass. Normal automatic reduction/reopen sits inside one original setup clock.
- [499](../499-session-precondition-timeout/README.md): initial online preparation exceeds the fixture's unchanged 120-second observation before writing, while the workspace remains active/durable. All server tuples and captured writing remain exact. Keep this failure.
- [500](../500-offline-fixture/README.md): ordinary offline state only during local reduction removes network contention without changing readiness/verification guards or any deadline. Thirteen controls pass. All Stage 5 online gates stay online and unchanged.
- [501](../501-idle-publication-stall/README.md): offline preparation completes in 42.856 s; two later boundaries complete in 16.354 and 17.347 s with exact writing, service tuples and persisted baselines. After 582 positions, the next original 30-second check fails at expected 2,637 / actual 2,636. The sender's Window holds 583 extra characters and reports active/durable, yet send is idle with no retry. No refusal/channel error is observed. Its full disposable browser state is saved.
- [502](../502-publication-coverage/README.md): the normal independent witness has only the 582-edit archive. Every source position 7–2,636 is present in a read-only native census and all unrelated writing is exact; server tuples stay unchanged. The missing edit is **not explained by envelope coalescing**. Both failed diagnostic preconditions remain recorded. The valid source-specific proof uses the existing receiving owner and current receipt floor, with an exact 662-event observation counter.

The original slow-growth byte cliff remains [phase 493's measured proposal fallback](../493-publication-proposal-cliff/README.md): a detached publication proposal crosses the 32 MiB guard, and full delivery verification is correctly retained. Producer preconditioning reduces setup cost, but this continuation does not prove a completed 3,072 setup or repair uninterrupted-session performance.

## Stop and next bounded repair

The [hardening rule](../../../release-hardening-2026-11-02.md) requires stopping on an app failure. The confirmed unpublished edit cannot be converted into a stale fixture expectation or hidden by a longer timeout. No original assertion is removed or changed. All gates, budgets, formats, timeouts and cryptographic/authority/commit checks remain.

The next repair must distinguish whether the final source was captured/flushed and available to envelope selection, and whether its local notification scheduled publication. Idle send state alone does not establish the exact lost-wake cause. Cold recovery of the sender's last edit has not run: the Window's durability report is not independent proof of that recovery, and no data-loss claim is made.

All 2,046 canonical build inputs still match phase 470; no app source changes were made in phases 497–503. All earlier rollback/format and Worker-reply debts remain, including the pre-release lockout for devices that wrote dense rows. Final signed image/rollback preparation is separate and has not started. These seven new sequential patches are unsigned/unpushed; no merge or deployment occurred. Stop here pending operator resumption.
