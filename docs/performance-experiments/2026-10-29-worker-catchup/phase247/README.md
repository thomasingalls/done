# Phase247 — due-send yield contract and discriminating failure

2026-10-30. User authorizes bounded repair/regressions/two-receiver rerun and clear subsequent work.
Base signed0ab9cbc8; evidence241–246 remains cumulative/uncommitted. No commits, push or release prep.

A completed publisher check is the only yield boundary. Never abort verification, custody retention,
Window promotion or final conflict/prefix checks. Keep all native Root/Task/mixed-owner fencing,
synchronous journal admission, authority/history/ledger/witness/commit checks and local flushing.
Publication quiet300/max2000ms and independent retry/backoff/halt/gate policies are unchanged.

Scheduler offers a pass-scoped predicate: true only during that exact active receive turn, ready gate,
send not halted and its actual eligibility deadline due. Failed send's backoff owns its deadline;
a local/content hint cannot accelerate it. Expired callbacks cannot influence future turns.
A yielded receive result carries its last verified position, schedules continuation promptly and
claims neither idle completion nor received progress, and does not clear failure/evidence state.
Existing alternating lanes select due sending next and let receiving continue after that pass.

Keep remaining empty-check budget across yield, scoped to actual authority object/publisher count.
Reset on changed scope/count, progress/non-idle result or exception. Native selection cursor is held
by the same owner and every next request is freshly authorized; the budget grants no proof reuse.
A completed sweep alone may choose existing idle poll. Preserve remote hints during a yielded sweep;
no publisher is identified by the workspace hint. At least one fully checked publisher per turn,
so continuous editing cannot starve receiving; retained busy-stream four-page fairness stays intact.

Regression falsifier: six100ms checks, local wake while receiving, publication due300ms. Old source
has sent only initial pass at300ms; desired send300ms between completed checks, then continuation
finishes remaining checks and retains5000ms idle deadline. First new test's cleanup used one-timer
flush and masked the assertion with5s timeout; retained attempt, fixed only own new cleanup to drain
finite pending callbacks after abort. Corrected before test fails precisely [0] versus[0,300].
No existing test edited or removed. Proposed test archived here; it enters runnable suite with repair.

Validation: deterministic regression schedules for gate/stop/stale callbacks, send backoff/halt,
failed/paused/conflicting receive, scope/count changes, fairness/continued coverage and monotonic
positions. Existing scheduler/selection/batch/idle and relevant owner regressions, type/lint/build.
Add adapter bookkeeping separately if needed; no assertion/case/deadline weakening.

After repair, rebuild beforeWorker0ab and candidate from exact input bytes. Four fixed serial native
journeys: before-normal,after-normal,after-withheld,before-withheld. Same fixed0ab server/fictional
fixture/browser/runtime/cgroup/flags, fresh state/profiles. Browser civil Etc/GMT+12 is still Oct29
at present (fixtureOct27 editable); real epoch/authentication clocks unchanged. Verify at start and
before each marker, abort if fixture would freeze during original900s journey. No concurrent heavy
work, retries or favorable replacement. Retain all16ms local p95,2500ms peer p95 AND every marker,
30s final delivery,600s backlog and exact archive/offline-cold/no-reinjection guards. Instrumentation
only existing bounded network/notification/DOM collectors, same in both builds; no source trace helper.

Journey is dependent two-client unit; keys/receivers are not independent replicas. One pair per mode
cannot establish population precision. Compare per-mode whole journey ratios, stage/request counts,
absolute gates and guard outcomes. A ratio>1.10 is an investigation signal, never a release allowance.
If any functional guard fails, retain it and stop for classification; an absolute latency failure with
complete functional guards does not erase other fixed cases. Calendar change, host/thermal/cache
variation and observer scheduling remain limits. Record evidence/completed before backlog, freeze
sequential patches and continue only clear discriminating experiments/repairs. No physical phone,
computer use, preview8443, real profiles, service-history automation or deployment.
