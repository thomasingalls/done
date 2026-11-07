# Phase 327 — trace the paired-writing native-owner close

**Fictional lab evidence only. No acceptance credit, repair, landing, hardening, release or default change.** Phase326 stays frozen, including every failed sender cell. This phase adds observations and keeps every guard, quota, return code, deadline and cold-stop rule unchanged.

The tagged reference reproduction captures **ContentError / repair-required from the scheduled warm audit**. Its mapped stack is `localBaselineReuse.compare` → `contentStore.openSnapshot/load/auditWarm` → `accountCapture.run`; the existing terminal-error branch then closes the native owner. The full-replay ledger and incremental ledger disagree. Which view is wrong, which field differs, and why they diverge remain unmeasured. No verification or comparison is suppressed.

## Corrected fault hypotheses

The operator's note withdraws the flush timing clue: a flush was open in only4/8 traced closures, consistent with shutdown rejecting an already pending call. Their separate18-run reading finds no non-200 responses, peak13 units/s/device and at most2 active, and closure after17–21 sends while coordinated makes25 without closing. Those observations argue against rate/active limits and a simple send-count threshold. They are not a causal proof or a reason to change limits.

This phase independently records no observed non-200 responses in all three journeys, no queue-full observation, and channel high-water marks below the unchanged limit8. A pending workspaceFinish/flush at close does not identify the initiating cause. The captured native audit failure gives a direct code path instead.

## Declared journeys and result

All use the same already caught-up fictional account and two short day cards, independent persistent browsers,300 keys/device at150ms, added RTT0ms, and G8/R1000/SY1N/P1/V0/D0/E+B. Five-second external host logs run throughout. These heavily observed journeys are diagnostics, not latency comparisons or new passing gate cells.

|Journey|Source observation version|Functional|Device1 first close after typing starts|Cold|
|---|---|---|---:|---|
|trace327-ready-paired150-d0-reference|initial failure/channel/stream trace|FAIL|7.573 s|not reached|
|trace327-ready-paired150-d0-coordinated-2000|initial failure/channel/stream trace|pass|none before cold|both exact, offline edit/Undo exact|
|trace327-tagged-paired150-d0-reference|tagged native close|FAIL|7.716 s|not reached|

The first reference run reproduces closure. Its original Worker stack maps the native close to accountCapture.run's existing generation-changed/repair-required branch. The matched coordinated control preserves the full exported archive, both writing streams, peer-preserving Undo and two exact offline cold reopens. Before another run, a separate immutable source-tagged fork adds one critical event immediately before that existing close. Its reference reproduction identifies code repair-required and job `accountCapture.ts:380:schedule`, with preparation=false. Both reference failures are retained; neither reaches cold, and neither is labeled a cold failure. Device2 continues accepting its offered input.

The original 16ms/2.5s and exactness predicates remain in the harness and derived sender327 analysis. A successful functional control is not a blanket latency/gate pass; these diagnostic runs earn no credit. No inference about all earlier closures follows from one tagged reproduction.

## Origin and teardown, separated

On Device1, Window ceremony-fail records show session-cohort-abort and control-channel callbacks **after** closed=true, explicitlyClosed=true and handingOff=true. They are suppressed cleanup callbacks, not an initiating fail() branch. The flag explicitlyClosed means the programmatic close API ran; it does not imply a user clicked anything. No Worker error event initiates this reproduced close.

The earlier Worker channel-close stack maps through accountWorkerOwner's native-lifetime follower, workerNativeLifetime, writeSession.close and accountCapture's terminal catch. The tagged event is posted before live.close. Its original error stack maps to:

- contentRecord.corrupt;
- localBaselineReuse.compare at the full-versus-incremental ledger mismatch guard;
- contentStore.openSnapshot, load and auditWarm;
- the scheduled accountCapture queue job.

sameAccountLedger compares the observable census, delivery and inbound results, independently of continuation-only indexes. This is a semantic consistency guard, not a network quota or RPC-slot refusal. Preserve it while investigating the discrepancy. The trace does not establish storage corruption, user-data loss, a key/authority change, or which implementation is wrong.

## Both-direction queue accounting

Per-channel high-water counters observe every admitted outgoing request and incoming handler, including reentrant Worker-originated calls. Outgoing ninth-call rejection still returns queue-full without consuming its sequence. Incoming active-bound violation still has its original message-order closure; the observer labels the bound without changing the wire code. Every channel-close snapshot includes both peaks and its current pending/active methods.

|Journey|Device|Page outgoing/incoming peak|Worker outgoing/incoming peak|Queue-full observations|
|---|---:|---|---|---:|
|trace327-ready-paired150-d0-reference|1|3/2|2/2|0|
|trace327-ready-paired150-d0-reference|2|3/2|3/2|0|
|trace327-ready-paired150-d0-coordinated-2000|1|3/2|2/2|0|
|trace327-ready-paired150-d0-coordinated-2000|2|3/2|2/2|0|
|trace327-tagged-paired150-d0-reference|1|3/2|2/2|0|
|trace327-tagged-paired150-d0-reference|2|3/2|3/2|0|

[Every channel](./trace327-queues.csv) and [the critical event timeline](./trace327-events.csv) remain separate by case, device and realm; peaks are not added as if simultaneous.

## Worker evidence survives termination

The existing Worker event log is streamed through observation-only global Worker messages, outside the RPC channel and its8 slots. Batches are bounded at128 events with a512-event pending buffer. Critical observations flush synchronously before cleanup; there is no protocol/lifetime await. The page keeps an initial bounded stream, a rolling8,192-event tail and separate critical events, so terminating the Worker does not erase the captured evidence.

This is not a lossless trace: high-volume bursts overflow the observation buffer. The terminating worker reports241 dropped metadata events in the first reference run and248 in the tagged run; continuing Device2 reports about2.0million drops. The control also has visible drops. Batch sequence gaps, source drops, page truncation and tail counts remain in raw snapshots; zero batch gaps does not mean zero missing events. The original terminal event, close stack and per-channel peaks are captured. Omitted trace content is not assumed known. Instrumentation overhead means these runs cannot establish performance benefits.

## Checks, failed attempts and provenance

Five new private controls cover outgoing and incoming quota behavior, reentrant calls in both directions, original handler error-code preservation and bounded pre-close streaming with visible overflow/sink failure. Final focused runs pass85 cases in9 files on each observation source variant; these overlap and are not170 distinct tests or a full-suite claim. Strict TypeScript passes for both final variants. No canonical old test or assertion is edited.

First unit attempt retains73 passes and one failed stack-observation assertion: V8 exposed its stack through a native accessor rather than the expected value descriptor. The observer was repaired to read the native Error stack safely and preserve the application refusal. The first type attempt retains three index-signature access errors, fixed in the private observer. First browser list preflight fails before opening a browser because the new lab root lacks container-image.json; copying the parent's immutable image identity repairs apparatus only. Its failed preflight is preserved.

All three timed stages freeze source, exact assets, server inputs, harness/support and fixture identities. Source-tagged is separate from the original source and both original builds, so old inputs remain verifiable. All1,552 canonical inputs and signed HEAD0ab9cbc8937e32c6542aaeeca697c87ba116c3be remain unchanged; the real index is empty. No production/preview/account storage is accessed. Compiled builds, credentials, browser profiles and databases stay private. [Artifact index](./evidence-index.json) preserves all runs, faults, source maps/derived mappings, host logs, logs and inert recipes; [closure check](./independent327-check.json) verifies the frozen inputs.

## Next bounded diagnostic, not a repair decision

Capture the first mismatch path among census, delivery and inbound, plus bounded hashes/counts and the exact committed-prefix/baseline/owner identities used by both views. Determine whether an incremental projection, full replay, or a comparison of different captured evidence is responsible. Do not disable the audit, ignore repair-required, change limits, or infer that all earlier closures share this cause. The separate grown snapshot-building owner-error from phase326 remains unresolved; this phase does not establish that it has the same cause. No hardening starts.
