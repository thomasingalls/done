# Phase244 — retain the invalid midnight diagnostic

2026-10-30. The one phase243 diagnostic failed its original30s final-delivery assertion.
Both original backlog checks completed, but archive/cold guards were not reached: no credit.
The fixture day2026-10-27 was two days old at reconnect23:57:32 Europe/Paris Oct29 and three
days old at attempted late marker00:01:52 Oct30. Actual freeze.ts policy freezes at three days;
the original assertion error observes data-frozen=true. No writer submission follows that late
keyboard attempt; all observed HTTP statuses are200 or absent. Do not treat a key sent to a
frozen card as admitted writing, or this as proof of an authority/network refusal.

The collector was incorrectly after the failed assertion, so owner events and final DOM probes
were lost. Preserve that diagnostic-machinery failure. Exact container absent. No retry erased
this trajectory; no relaxed deadline/guard. Raw result/logs, actual timestamps and classification
script retained; no profiles/state/factors or error-context artifacts copied into the repository.
No unmodified performance result is superseded and2.5s acceptance remains blocked.

A separate corrected diagnostic may use civil timezoneUTC while actual date is still Oct29:
this restores the original valid fixture's effective age, without faking Date.now, authentication
expiry or any protocol clock. Add explicit editable/freeze guards before marker input and collect
in finally even on a failing assertion. This is an apparatus correction, not a favorable performance
rerun or a product repair. No release preparation or deployment.
