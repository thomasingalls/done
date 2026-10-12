# Fresh authority before final receive application

2026-10-13. Contract committed signed as `742e1c14`; source baseline: signed `5c7ba18a`.
Implementation and focused evidence: [immediate authority handoff](performance-experiments/2026-10-13-immediate-authority/README.md).
The operator requested this contract after the [status-isolation comparison](performance-experiments/2026-10-12-status-subscriptions/README.md).
Release validation remains paused. No stored/wire format, deployment, account policy or undo change.

## Selected scope

For ordinary prepared content receipts only, perform the existing complete final authority check
before entering the editor FIFO. Permit synchronous final application **only immediately after that
check**, when the FIFO can accept and finish the proposal without waiting. Otherwise discard the
permission and use the existing queue-head check. Do not retain an authority ticket in a waiting job.

This is narrower than reading early and letting a ticket remain valid through an arbitrary queue
wait. It does not require a time-to-live policy, a periodic custody audit, or an assertion that
custody unchanged in memory proves arbitrary later disk state. It preserves the existing exclusive-
writer/read-to-effect assumption, with explicit invalidation of work that could intervene.

The measured opportunity is limited: under receiving load the current final inventory read takes
18–20 ms median, with application/publication around 6 ms. Moving the read permits local input to
proceed during the wait; it does not eliminate the read, promise 18–20 ms lower p95, eliminate long
tasks, or make the synchronous application free. The fast-path success rate is not yet measured.

Keep history/checkpoint installation, successor/membership adoption, rotation, removal, recovery,
Local/shared owners and other authority-changing paths on their current fences. No new cross-request
membership memo or discovery cadence change belongs in this slice.

## Existing boundaries that the implementation must preserve

- [`accountReceive.ts`](../src/crdt/accountReceive.ts), `receivePage`/`receiveGroup`: authenticate
  receipt/content, commit through the owned carrier, then authenticate readback before staging copied
  original update frames. `preparedPromotion` currently reacquires a storage task and runs
  `assertCurrent` at the final editor head, then matches captured `base` and `expectedPayload`.
- [`accountAuthority.ts`](../src/crdt/accountAuthority.ts), `createAuthorityAuthentication`: every
  check reads the **complete scoped inventory**. Exact keys and values may reuse a prior positive
  authentication; changed input takes the full verifier and must still match expected authority.
  No MAC-only, counter-only or marker-only substitute. The full-authentication reference remains.
- [`accountAuthorityInventory.ts`](../src/crdt/accountAuthorityInventory.ts) and the first/joined
  authenticators retain claim/custody/marker bindings and clear/import interlocks. Inventory layout,
  scope, bounds, parsing, keys and unexpected-row handling remain exactly as today.
- [`accountCapture.ts`](../src/crdt/accountCapture.ts), `run`: a storage tail serializes owned work;
  `carrier.appendLocal` is a separate synchronous journal operation. Both first and joined Account
  lifetimes hold an **exclusive slot Web Lock**, through native settlement and disposal.
- [`writeSession.ts`](../src/crdt/writeSession.ts): a `SessionTask` expires when its operation
  settles. A ticket must not retain that task, a transaction or its `step` closure. A new private
  synchronous effect checks the still-live owner through its existing lifetime authority.
- [`admissionQueue.ts`](../src/crdt/admissionQueue.ts), `prepareOwned`/`pump`: one bounded proposal,
  final FIFO ordering, close/drain, `whenDurable()` waiting outside the FIFO, and no storage task
  waiting for editor promotion. Background flush can let local input proceed but fences remote work.
- [`admittedWorkspace.ts`](../src/crdt/admittedWorkspace.ts), receive subscription: apply original
  frames to the current accepted history with origin `received`; preserve pending structs/deletions,
  verify the completed projection and publish once per page. Never install an older document or undo
  snapshot. [TRD §6.1](TRD.md) permits the committed, undisplayed suffix and requires journal-before-apply.

## Freshness means one check, one immediate effect

The permission is private, owner-local and single-use. Conceptually it binds the owner acquisition,
proposal identity, captured authority context/payload/record, an authority invalidation version and
a storage-activity version. Use unforgeable private identity/closures; caller-supplied version numbers
are not authority. Version tokens must not wrap or return to a previous value.

Issuance requires all of the following:

1. The same live owner still holds the exclusive permit; capture is not suspended, handed off,
   closing, failed or repair-required. Initialization/reacquisition always authenticates afresh.
2. The ordinary receive preparation and authenticated durable readback have finished successfully.
   Staged frames are immutable private copies bound to this proposal. No receive success or scheduler
   advance has been reported yet. Empty/duplicate receipt results keep their existing semantics.
3. A **new complete `assertCurrent`** runs on the serialized storage tail, using its normal lifetime
   checks before/after every asynchronous boundary. Its expected authority is also the proposal's
   captured authority. A successful read does not authorize switching that proposal to a newer epoch.
4. No later storage operation or authority/lifecycle invalidation has intervened during the check.
   Release the checking task completely before trying editor application. Native work must have
   settled, not merely had its public promise rejected; an abort cannot clear the active-work guard
   while a transaction or other tracked effect may still finish.

In the first synchronous continuation after that task settles, immediately try the admission-owner
entry point. No timer, await, budget yield, network call, deferred callback, public exposure or ticket
queueing is permitted between this handoff and the attempt. It must atomically establish:

- this exact proposal is still the sole prepared receive and has not been discarded or consumed;
- the admission owner is active, not blocked/repair-required/closing, with no older queued job,
  in-flight admission, pump activity or background flush that would fence remote application;
- the storage version and authority version still match, and no other storage task remains active
  or queued after the check; the complete checking task has settled;
- owner identity/lifetime, capture route, `base`, expected payload and expected custody record still
  match. A closed owner cannot become valid again by acquiring the same slot in a new session.

Only then consume the permission and perform the ordinary final remote promotion synchronously,
under the admission pump's reentrancy protection. Promise resolution may notify the caller afterward;
it must not hide an asynchronous check inside an `async` final-apply callback. There is no cached
permission to apply a different page or to repeat this one.

A cheap admission eligibility check may skip the early read when the queue is already unavailable.
It is only an optimization; eligibility must be checked again atomically at consumption.

## Invalidation and disposition

For the first implementation, invalidate conservatively for **every other serialized storage
operation**, including reads/audits. Do this synchronously when that operation is requested, before
it can enqueue, yield or start native work. A start-only or post-commit invalidation leaves an unsafe
window for an already queued or in-flight authority mutation. The issuing check has its own identity;
it cannot clear invalidations from subsequently requested work. An aborted write never restores an
old version, even when its visible bytes appear unchanged. Classifying harmless storage operations
more narrowly is a separate optimization requiring evidence.

| Event after/during the early check | Required disposition |
|---|---|
| Normal synchronous local edit, undo or redo, successfully journalled | Does not invalidate authority by itself. Final application uses the resulting current document/undo. If the queue cannot apply immediately, use the fallback. |
| Local pressure, older queued input, forced write or background flush | No bypass. Discard early permission; queue the normal final job behind the local predecessor. |
| Any other storage task requested, including reservation, flush, read, audit or compaction | Invalidate before enqueue. A benign scheduling miss may use the full queue-head fallback. |
| Custody/marker write, authority adoption, history progress/reservation refresh, route/generation change or capture suspension | Invalidate before the first effect/await, as well as on failure. If proposal context changed or handoff began, refuse and close for replay; do not refresh the old proposal into the new authority. |
| Hidden/freeze entry, visible/resume/pageshow return | Invalidate pending permission. Returning to visibility cannot revive it. Preserve existing full-read/memo invalidations; any further application needs a new normal check. Do not add a new product rule disabling background sync. |
| Lock, owner abort/close, release/reacquisition, repair-required or discarded pending suffix | Revoke immediately. No fallback on a dead owner; drain existing work, erase buffers and cold-replay before editing resumes. |
| Inventory read/authentication failure, detected missing/extra/changed custody, clear/import interlock | Refuse with the existing error/disposition. No repeated attempt to turn an integrity/authority failure into a cache miss. |
| Network login/grant expires, ordinary offline status or an unverified content hint | Not local custody authority by itself. Keep the independent transport checks and current offline behavior; never extend a grant or accept new network data using this permission. An authenticated observed transition still takes the authority path above. |

Hook the storage invalidation at `accountCapture.run`, and route all explicit authority/lifecycle
invalidations through the same owner-local gate. Review the `runNetworkTask` call sites: they may not
mutate custody/context outside that gate. Startup and other exclusive lifecycle owners cannot share
a ticket. Existing authority memo invalidation alone is insufficient: it has no consumable owner
permission, no storage-activity exclusion and currently invalidates some writes only after success.

Synchronous reentrancy must be accounted for. Mark the admission pump occupied before notification or
publication can submit another command; that command joins the normal FIFO. Recheck lifetime before
mutation and between frames, as in the existing path. If an observer closes the owner or application
fails after some durable frames were applied, stop and close for cold replay. Never replay the local
command or retry a partially applied page in place. Future queued storage work cannot execute inside
this no-await application turn; genuine synchronous revocation must still stop further effects.

## Fallback, progress and recovery

Allow **at most one early full check per proposal**. A scheduling/lifecycle-version miss **after a successful check** discards the
permission and joins the existing final FIFO path, where the existing full fresh check runs again.
If `assertCurrent` itself throws (including its existing invalidation refusal), preserve the current
refusal/close behavior. Do not catch arbitrary verifier errors, compare error-message strings, or
use a changed version as evidence that a simultaneous integrity error was harmless.
Do not loop outside the queue, move the final job repeatedly to its tail, hold a storage task while
waiting for editor input, or retry integrity failures. There are at most two final checks in the
miss case (in addition to unchanged receive-commit/readback checks). The fallback intentionally can
still stall input; it is the existing progress/safety mechanism, not a promise that all final jobs
become synchronous. Record its frequency and cause.

`whenDurable()` continues waiting for the entire prepared receive outside the FIFO. A forced local
write ahead of final application can finish its storage work; no storage-to-editor lock inversion is
introduced. Only successful final application resolves receive success or permits the next receive
page. One proposal and the existing byte caps remain. No additional decoded history, key material,
borrowed buffers or unbounded ticket queue is retained.

A crash after commit but before early checking, after checking but before application, or part-way
through final application cold-replays durable receipts plus journalled local edits. A local edit
made before remote display cannot depend on that undisplayed page. Once remote content is displayed,
its dependencies are already durable, before later local acknowledgement. Text admission, command
ordering, source capture, receipt order, grouped projection verification and undo grouping/origins
must not change.

## What this does not guarantee

A complete custody check establishes the authenticated local snapshot under the exclusive-writer
contract. It is not a new online revocation query, nor proof of arbitrary future bytes on disk.
A write that deliberately bypasses the Web Lock/owner cannot be detected by an in-memory version.
A change visible to the fresh read must refuse; a change after that read can only be discovered by
another check. The current implementation already has a native-read-to-effect interval. This design
does not intentionally stretch it across a waiting FIFO job, and does not introduce an accepted
seconds/minutes custody-corruption window like warm content-ledger reuse. If that stronger adversary
must be covered, retain the queue-head read (which also is not atomic with arbitrary external writes)
or design a different storage/effect interlock. Do not advertise the ticket as defending against it.

No millisecond freshness threshold is invented here. Immediate consumption plus complete ownership,
storage and lifecycle guards define validity. Browser/OS scheduling is not a real-time guarantee.
The normal session/lifecycle rules still govern suspension and resumption.

## Bounded implementation and check requirements

1. Add the private invalidation gate at the existing owner/storage boundaries and a single-use
   permission after the unchanged full verifier. Cover both first-device and joined owners; keep
   legacy/generic paths unchanged. Establish the writer-call-site inventory before enabling it.
2. Add a private synchronous admission attempt for that permission. Retain the existing FIFO
   full-check path as fallback/reference, with no caller-visible API or persisted-format change.
3. Extend focused authority/admission/native prepared-receive tests. Required controls:
   - hold the early read: a local key journals/applies, and undo/redo stays usable;
   - mutate any custody row, key or clear/import interlock before/during the read: refusal;
   - request a custody write while checking, including abort/late settlement: no valid old ticket;
   - queue a harmless storage job or a forced local write: one fallback, no bypass/deadlock;
   - close, replace owner, freeze/resume, invalidate during verification: no late issue/revival;
   - same valid bytes but changed authority, reused ticket or wrong proposal: refusal; an
     activity-only version mismatch after successful checking takes the bounded fallback;
   - local undo/redo between commit/check/apply, pending Yjs structs/deletions and grouped pages:
     preserve current history, remote text, final projection checks and single publication;
   - reentrant input/close during publication: no interleaving, duplicate apply or buffer reuse;
   - crash at each new handoff boundary: cold recovery includes both durable carriers exactly once.
   Keep the existing native changed-inventory-before-promotion control; move its injection explicitly
   before the early read. Add a conforming queued-mutation control after that read. Do not falsely
   claim a post-read direct IndexedDB bypass must be detected by a memory version.
4. Reuse the stronger serial comparison from the status packet, with signed `5c7ba18a` as anchor:
   600 independent-cadence keys, both run orders, silent/active/backlog, complete correctness guards.
   Record early-check latency, immediate-apply hits, fallback reasons/additional reads, queue wait,
   final synchronous apply, p95/p99/max and long tasks. Require a synchronous successful fast path
   and no lost/stalled receive progress. Claim latency gains only where both contrasts support them;
   a low hit rate or extra-read cost can reject the optimization. Do not launch a generalized campaign.

Physical account evidence remains pending until a disposable phone credential fixture exists.
The linked implementation packet records which checks and measurements have completed; this contract
alone is not release qualification or publication. A wider-lived ticket would require revisiting
this decision explicitly.
