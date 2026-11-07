# Phase162 — sustained Goals typing, account work and unlocked focus

2026-10-28. Bounded diagnostic after production b6f0160a. The operator reports new whole-app
pauses while writing six/seven sentences at about80wpm, and on mobile open/refocus while already
unlocked. Startup and sync improvement are qualitative operator observations, not timed results.
This phase adds evidence and a worker/queue ownership map; it makes no application repair.

## Question, fixture and method

Which main-thread work competes with sustained Goals input, and what boundary could move that work
away from the UI? Use the exact retained released frontend,86 files, and current byte-matching
account runtime. All six sampled account-owner sources independently match the actual bundle maps'
sourcesContent. Source HEAD8d6d42c1 contains the signed b6f0160a runtime. The existing fictional H2
synced profile has5,000 Goals characters/137 lines and accumulated technical history; copy its
service state and persistent browser storage for each journey. Private fixtures, keys, profiles and
service state stay outside Git. No real account/device, production data, preview8443 or infrastructure
is touched. Browser is local Chrome156.0.8078.49; service retains1CPU/1GiB/no-swap limits.

Type the same seven-sentence135-word/779-character paragraph through trusted CDP key events. Offer
one character each150ms independently of renderer acknowledgments:80 standardized five-character
words/minute, about69 literal words/minute on this text,116.7s first-to-last offer. Never compress
missed deadlines, paste the measured paragraph, omit inputs or await one rendered character before
offering the next. Keep every offered timestamp, trusted/focus/visibility check and final text guard.
A separate textarea's deliberate120ms busy interval confirms observer sensitivity in every timed
journey. Record main-thread long tasks,16ms heartbeat gaps, event/paint timing, numeric lifecycle and
HTTP paths/status/times without request/response contents. One desktop journey additionally samples
CPU at1ms for source attribution; its numbers are not latency acceptance. The private fixture and
machine are not a representative sample of production users or Android keyboards.

[Protocol and prospective amendments](protocol.md), [frozen workload](workload.json), input identity
packets and [executed apparatus](reproduction/) retain the design, assumptions, stop rules and setup
corrections. This is a mechanism-finding benchmark: correlated keys are not779 independent users.
No statistical power/population estimate or release-to-release causal effect is claimed.

## Observations, including failures

| Journey | Paragraph input observations | Main-thread tasks during paragraph | Status |
| --- | --- | --- | --- |
| Desktop, no CPU profiler |779/779 trusted, focused, visible; offer-to-beforeinput p9510.353ms/max62.206ms |0 at least50ms |Exact text, return input, Undo/Redo and lock/reopen pass. |
| Desktop, CPU profiler |779/779; profiling is attribution only |1,50ms |Same functional guards pass; do not use as performance acceptance. |
| Mobile emulation, CPU4x, online |779/779; offer-to-beforeinput p9539.049ms/max90.675ms |120; p9596ms/max108ms;52 heartbeat gaps>=100ms, max142.700ms |Fails final-text expectation: the new test captured its prefix before its own Enter completed. Retain as failed; see independent persisted-text check. No post-paragraph/lifecycle/Undo guard credit. |
| Fresh mobile emulation, CPU4x, offline control |779/779; offer-to-beforeinput p956.336ms/max28.887ms |0; heartbeat gap max66.700ms |Exact paragraph, return input and Undo/Redo pass. Later same-run offline lock/reopen exceeds unchanged15s guard; retain failure. |

The offline control disables networking only after unlock/initial checks and fixes the prefix race
before freezing its expected text. It reuses the same fictional account, cadence and released code.
No completed online timing is rerun for a better value. Zero versus120 long tasks supports
network-driven account work as a contributor on this fixture; it does not attribute every production
pause, isolate publication from receiving, or estimate a general speedup. The setup correction and
single trajectories limit a strict causal comparison. Local writing, encrypted journalling and local
maintenance remain active offline.

The first desktop journey also observes a922ms main-thread task during the later foreground quiet
period, with a964.200ms heartbeat gap. The sampled desktop run has different tails, so its stacks do
not establish the cause of that exact922ms task. Offline mobile quiet time still has a492ms task and
501.500ms heartbeat gap: removing network traffic does not remove all idle contention.

Two independent persisted-profile checks preserve the failures rather than reclassifying them:

- Copy the failed online mobile profile/state, without storage reinjection, reopen normally and compare
  the full archive to the original plus the intended Enter and all779 characters. Exact match passes.
  The mismatch is the test's prematurely captured prefix, not missing writing in this observation.
- Copy the offline control's persisted profile/state and reopen **offline** in a new, ordinary desktop
  context with default focus settings. The original plus Enter, paragraph and return character match
  exactly. This does not retroactively satisfy its mobile-CPU4x/same-context15s guard or identify why
  that guarded opening exceeded its deadline. Keep the cold-open context/timing difference unresolved.

[Raw observation reports](reports/) include both successful desktop journeys, both failed measured
mobile journeys, the independent checks and all setup failures. A passing later check never erases
a failed attempt. The independent offline check is7.4s for its entire test, not a measured unlock time. Its desktop
viewport, unthrottled CPU and default focus settings differ from the failed mobile guard. Neither
test-focus settings, entry routing nor cold-open cost is isolated as that failure's cause. The first
persistence-check source was expanded before the second check; retain its reconstructed initial
form separately, without claiming a pre-run hash for that additional guard. Earlier primary driver/
protocol versions are independently retained against their frozen hashes.

## Lifecycle limitation

The requested CDP freeze does not establish hidden/suspended state here: visibility remains visible
and timers keep running. Playwright ordinarily enables focus emulation. Four blank-page pilots retain
headless, second-tab, windowed and normal-background-flag results; even minimized bounds do not prove
hidden state in this setup. The offline control disables focus emulation and records actual blur/
focus with the shell present and unlocked. That covers an unlocked focus transition, not physical
Android suspension, screen lock or hidden-tab catch-up. No dispatchEvent substitution supplies the
missing coverage. Do not call the922ms task a proven refocus regression.

## Source attribution and proposed boundary

The profiled desktop journey's largest **mapped application self-sample weights** are
verifiedRecords.ts6,664ms and verificationOwnership.ts1,135ms, versus Yjs487ms, Markdown462ms,
CodeMirror view330ms and React DOM661ms. Idle148,100ms, unmapped program6,417ms and GC2,330ms remain
visible in the report. These are sampled stack residence across the whole journey, including idle
account work, not exact exclusive CPU costs or times to add to an input latency.

Independent source reading corroborates the ownership chain:

- contentStore/accountCapture load into accountReceive.validate and verifiedRecords.verify;
- verifiedRecords.read performs a synchronous complete record comparison and detached projection;
- accountDelivery's fresh beforeCommit load calls accountReceive.verifyProposed, which reads/clones
  the whole verified view; publication selections also detach state;
- replacement/cleanup walks the private graph and erases unretained buffers. Some comparisons have
  cooperative checkpoints, while read/select cloning and cleanup are synchronous.

[Source-map review](reports/source-map-review.json), the retained CPU profile and its analyzer support
these locations; they do not prove that any one helper causes every stall. The next architectural
candidate keeps the private verification owner and state together in a worker, including storage,
publication/receiving and maintenance coordination. Avoid preparing whole ledger copies on the UI
thread merely to send them to worker helpers. Retain a deliberately small Window journal/UI/activity/
passkey bridge and fresh authority/witness/commit checks. [Ownership map and next bounded choice](worker-boundary.md).

The operator further clarifies catch-up's objective: downloading the next group should proceed
without waiting for the current group to finish verification **and** presentation. The map records
separate bounded downloaded/staged, verified-durable and displayed progress. Current single-flight
receive and request-cursor ownership couple them. No new transport, accepted-writing definition,
staging format, worker implementation, service automation or changed security promise is selected.

## Validation and limits

The old test population and all application/runtime sources are unchanged. New diagnostic sources are
preserved as text under this packet and receive no aggregate qualification credit. Initial relative
TS config failure and two mobile overlay-navigation setup failures occur before paragraph input;
their logs are retained. The measured mobile failures above remain failed. No deadline, crypto,
authority/history proof, storage admission, local flush or backoff is relaxed.
The independent raw audit checks all four779-input denominators and rejects dropped input, false
focus and inconsistent clocks in three fault controls. All440 recorded source hashes remain equal;
all86 actual frontend files and six mapped owner sources pass an independent content review.
Run `python3 review-source-maps.py` and `python3 review.py` from this packet; the former requires the
retained frontend (override STALL_FRONTEND when moved).

Original16ms local,2.5s peer/all-marker and30s delivery guards remain unchanged. Offer-to-rAF is an
additional diagnostic, not the old mutation-observer local16ms measurement; no peer is timed here.
This packet supplies no new acceptance/qualification result. No runtime fix, physical Android run,
new release preparation, commit, push, merge or deployment occurs. A future worker implementation
needs discriminating interruption/lock/erasure, input-durability, stale-reply, Undo/offline and actual
catch-up-competing-with-editing tests at the existing gates.
