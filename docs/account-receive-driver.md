# Owned receive polling and reconnect

The explicit private `openOwnedPollingAccountWorkspace(input, operatorToken)` composes the v9 receive
owner with one polling driver. It does not add a durable format, sender, membership, default-app UI or
personal Account activation. The manual receive factory remains available without automatic networking.
The polling factory keeps raw prepare/read/page operations internal; its caller receives the admitted
editor, read-only receive census, runtime `receiver.status`, `retry()` and status subscription.

## Polling policy

A timer starts the first pass. Each pass reads authenticated durable receive state and calls the existing
owned limit-one HTTP operation. It re-reads durable state after the operation: only an increased durable
position counts as progress. A verified empty response with no advancement means the stream is currently
caught up. Runtime status never supplies a cursor, baseline, key or trust decision.

Successful progress yields 50 ms through a timer before another page. A verified empty page schedules the
next poll five seconds later, even without local edits. Unknown results use 1, 2, 4, 8, 16 and then 30-second
backoff, capped at 30 seconds. Successful responses reset the failure streak. These private intervals are
fixed in code; they are not an availability or latency guarantee on suspended browsers.

One pass and at most one timer exist. Ordinary status notifications do not accelerate backoff or restart
an idle interval. Online events and explicit retry may expedite the next attempt and coalesce during work.
Local revision changes alone do not trigger network reads. No timer wait occupies the carrier queue or
holds a task capability. Each new request derives its cursor afresh and receives a new nonce; unknown or
lost replies grant no receive progress.

## Pauses and failures

Offline connectivity is a hint. It cancels scheduling until connectivity or an explicit retry wake; actual
HTTP failure while reported online is unknown. Local admission blockage or pressure also pauses polling.
The backoff deadline survives a Local pause/resume. A skipped pass is classified as paused,
not as a verified empty page, and does not reset the unknown streak. The owner rechecks the current gate immediately before
fetch, after queued crypto and storage reads; a readiness check only at the beginning of a pass is insufficient.
An already dispatched response can finish its ordered durable receive while the lifetime remains active.

Conflicted durable state, malformed/unverified pages and unexpected crypto/storage failures halt automatic
attempts. The failure halt is kept separately from temporary offline/storage gates, including if a failure
arrives while already paused. Ordinary edits, admission restoration and online events do not clear it.
Explicit `retry()` rechecks durable state; it neither repairs/discards Local input nor erases conflict
records. A retained conflict still prevents dispatch. A blocked admission job retains its existing ordered
suffix semantics; the user must resolve that suffix before the driver can settle and proceed.

Status is a frozen detached observation: phase, received-through, saturating failure streak, next attempt
time and bounded reason. It contains no token, raw response, plaintext or key. Status observers cannot
start work after synchronous close or create duplicate timers through reentrant wakeups.

## Lifetime and scope

The driver owns listeners, timers and its operator-token reference under the same held permit as receive.
Close immediately stops scheduling, clears the token reference and listeners, cancels timers and aborts
the lifetime. Cleanup drains the active pass after the owner has settled its fetch/stream/native work.
Closing during backoff waits for no timer delay. Cold reopen rebuilds progress from the authenticated
receive ledger and signs the next request from that position, never from saved runtime status.

The first epoch, creating publisher, generation 1, receiver's 512 KiB envelope cap and native batch limits
remain. Polling does not make larger envelopes, new members, checkpoint successors or branched credentials
supported. The v8 sender is unchanged. Next is explicit outbound composition under v9, followed by remaining
review gates and real two-gate second-device adoption; no real Account rollout is authorized by these tests.

`account:receive-driver` combines an independent clock/event oracle, effective scheduler and final-dispatch
omissions, and disposable native HTTP/restart histories. The manual transport and v8 sending driver remain
regression gates. This targeted evidence is not a claim of complete protocol correctness.

## Size failures (R-01)

The held receiver reports `inbound-size` for an authenticated page whose envelope/update bounds fail,
and `response-too-large` when the HTTP body exceeds its declared or streamed budget. Both stop
automatic polling with the authenticated durable cursor unchanged. Offline/online and local edits do
not clear the halt; an explicit retry rechecks current state. These are bounded observations, with no
writing, identifiers or exception text in the diagnostic ring. Request expiry remains transient.
The composed sender similarly reports `envelope-size` for local preflight or the service's unsigned
size hint, retaining source/spool/submission bytes. A retry cannot repair an immutable bad accepted
position. See the [compatibility and recovery policy](./review/implementation/service-receiver-bounds.md).
