# Private owned delivery and reconnect driver

This phase attaches one sender to the factor-owned v8 lifecycle. It uses the existing first-epoch
service and transport; it adds no stored format, inbound application, enrollment or personal deployment.
The explicit sending factory receives an in-memory development operator token separately from workspace
startup options. The manual v7/v8 factories remain available without automatically starting a sender.

## Scheduling and authority

One driver owns one active pass and at most one timer. Startup, accepted local revisions, restored Local
admission, an online event and manual retry can wake it. Ordinary edit/status notifications coalesce and
cannot bypass an unknown-result backoff. An online transition or explicit retry may expedite a waiting
attempt. Notifications received during work leave one wake pending; repeated notifications never create
a second active pass. Each successful pass yields to a timer before continuing, so a backlog does not
monopolize a microtask loop. The driver remains working across these yields; idle means a pass found
no remaining source to prepare or submission to send. No backoff sleep owns the storage task queue or a live task capability.

Every pass first reads authenticated durable delivery state. Closure, conflict and finalization halt it.
The next position is accepted-through plus one. An existing submission is sent first, without calling
preparation. An existing envelope is wrapped without resealing it. Only when neither exists does the
owner flush admitted work and use its existing position/invocation grants to prepare an envelope. A crash
before envelope commit may abandon an invocation; the next attempt uses a fresh durable grant. A crash
or disconnect after submission commit always retries the same exact wrapper.

The driver cannot mint from a transport callback, install authority, edit delivery status or infer an
acceptance from a network result. It uses the owned status after response persistence to decide whether
progress was made. The sending factory keeps manual prepare/send/record methods internal. Read-only
spool/status inspection and Local editing remain available for the private walkthrough.

## State and retry

Status is a detached runtime observation: phase (`starting`, `working`, `idle`, `retrying`, `offline`, `blocked` or
`closed`), accepted-through, next position, a saturating unknown-attempt streak (maximum six), next retry time and a bounded
reason. It contains no token, signing key, raw response or plaintext. It is not durable authority and resets
on reopening; actual status is reconstructed from authenticated storage before any publication.

Unknown results retry after 1, 2, 4, 8, 16 and then 30 seconds, capped at 30 seconds while the lifetime
remains active. Success resets that count. Offline state cancels the timer and waits for connectivity or
manual retry; `navigator.onLine` is a hint, not evidence of service availability. A failed fetch while the
browser reports online remains unknown. Manual retry does not reset the durable spool or grant reminting.

Local admission that is blocked or under storage pressure pauses publication. A restored active admission
state wakes it. Unexpected local/crypto/storage exceptions halt automatic attempts; manual retry can
recheck after repair, but no repair or discard is performed automatically. Permanent delivery evidence
cannot be cleared by retry. The driver does not suppress or roll back Local editing on a transport halt.
The send operation also checks Local admission/connectivity immediately before fetch, so a status change
while its queued verification is running prevents a new dispatch. An already dispatched response may still
be recorded if the lifecycle remains active.

## Close and recovery

The carrier's abort signal invalidates scheduling immediately. Close clears the token reference, removes
online/offline and admission listeners, cancels the timer, rejects future wakeups and drains its current
pass. The existing lifecycle aborts/drains fetch and retains its native slot permit until all cleanup has
settled. Driver cleanup never waits for a fresh task or closes the owner recursively. Closing during
backoff does not wait for the delay. Page death relies on the existing durable envelope/submission/witness
records and fresh factor unlock; runtime timers and counters are not recovered as authority.

## Validation boundary

Use an independent event/clock model against the actual scheduler, including deliberately deferred work,
wake storms, retry deadlines, offline transitions, Local pauses, permanent stops and close. Native tests
must exercise real v8 captures, invocation grants, IndexedDB, HTTP/service decisions, cold restart and
lost replies. Generated native histories compare observed exact wrappers and service decisions, not just
reported driver state. Actual guard-removal controls must demonstrate overlapping work or missed wakeups
in the scheduler and a refused outcome at the real owner boundary.

Inbound authenticated replay and its durable receive baseline/cursor remain the following protocol phase.
This sender is private scaffolding; public Account UI, second-device adoption, general lineage advancement,
revocation/rotation, pruning, production deployment/restore and independent review remain separate.
