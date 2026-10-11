# Private outbound composition under the v9 owner

The initial self-readback flow below is superseded in the composed owner by
[acceptance-driven self progress](./account-self-stream-progress.md) (2026-10-10).
The original evidence remains a record of that integration; peer receive ordering is unchanged.

Status: bounded implementation and validation complete 2026-09-11; uncommitted.
[Evidence](./account-conformance-runs/2026-09-11-account-sync.md).

This is the Stage 4 §3.5 first-ciphertext-round-trip composition. One creating member, epoch 1,
its original unbranched credential history, and the retained promotion genesis are supported.
This does not enroll another device or enable the default application. The personal Local release stays
stopped and unchanged. Real Account use still has the gates listed in progress.md.

## Authority and persistence

The explicit private composed factory opens one v9 capture/receive owner and one admitted editor.
Outbound preparation and delivery reuse that owner's authenticated generation key, signer, authority,
content carrier and serialized task queue. No second v8 owner or caller-provided authority is opened.
The existing v7/v8 readers keep their marker refusal rules; manual v9 receive remains available.
There is no new stored format in this phase.

Extract the existing envelope preparation algorithm into an internal operation over a held context.
Every position still identifies one original source capsule/index/hash; every seal spends a distinct,
committed invocation grant; a persisted envelope/submission is retried byte-for-byte at the earliest
unresolved position. No receive original, projection snapshot or pending remote dependency creates a
local source. The existing power-loss/restore limitations of invocation accounting remain open.

Delivery gets an owner-supplied census, defaulting to the unchanged v8 census for old factories.
The v9 census separates ledger grammars but authenticates their complete union with the single existing
spool witness. Every cold load checks source capture, envelopes/grants, submissions/decisions, inbound
proofs and exact content coverage. Never filter inbound records out of the completeness witness.

For this creating-member self-stream, an inbound acceptance must name the exact locally persisted
outbound envelope at that position. Unknown/different self-stream bytes mean unsupported branching or
missing local history; refuse before recording/promoting them. A composed cold open also refuses such
retained history. Do not invent source identities to reconcile it. Contradictory inbound acceptance and
outbound refusal/finalization are refused on the combined census. Receive-only synthetic remote fixtures
are still useful for the manual receiver, but do not establish safe credential cloning or enrollment.

## Scheduling and shutdown

Use one composed scheduler with two independent lane states and at most one pass/timer. A send pass
resolves at most one position; a receive pass handles at most one page. If both are due, alternate lanes.
Send progress yields 50 ms; receive progress yields through a zero-delay timer, permitting a due sender
to run before the next page. Receive idle polls every five seconds (about a minute with a healthy
notification stream). Send idle waits for an editor revision;
revision wakes during an active pass are retained, and ordinary wakes cannot bypass unknown backoff.
Each lane keeps its own 1/2/4/8/16/30-second capped backoff, including unexpected exceptions. Explicit
conflict, closed, size and integrity refusals halt. Online or a fresh subscription handshake may
expedite eligible work but cannot clear a halt; explicit lane retry requests a durable recheck of only
that lane. Neither retry nor a notification changes authenticated positions.

All operation results are runtime observations. Each pass reconstructs position from authenticated disk;
transport success cannot mark acceptance or receipt. Offline/Local pressure pause both lanes. Recheck
readiness after asynchronous preparation at actual HTTP dispatch. An observer may pause/close/retry
reentrantly; it cannot cause overlapping passes, lost wakeups or dispatch after close. The private adapter's
10-second request bound limits network head-of-line delay; storage/crypto may still delay a pass.

Only receive commit through the admission FIFO may publish originals. Network fetch ends its carrier
task before it enters that FIFO. Scheduler waiting never owns a carrier task. Close clears timers,
listeners and token, aborts network, invalidates both lanes and drains the active pass/admission handoff
before releasing the single permit. Public runtime statuses distinguish sending from receiving; raw
prepare, submit, response-recording and receive-page capabilities stay inside this factory.

## Evidence required

- Native actual-service round trip, local edits while receiving, and exact source/envelope/submission
  oracles under one permit; remote delivery must not add source captures.
- Lost submit response followed by receive and cold restart: retry exact submission without resealing,
  advance delivery only from its own retained decision, and reconstruct receive cursor from disk.
- Native outbound/inbound commit failure, close during pending transport/preparation and queued work,
  compaction then cold replay, and old-reader refusal.
- Generated operation histories with authored text/source/position oracles and generated deferred clock
  schedules for fairness, backoff, pause, observer reentrancy, wake retention and close.
- Effective copied-source omission controls, including union census/witness, self-stream byte binding,
  dispatch readiness and scheduler exclusion/fairness. No credit for test timeouts or mutation build errors.
- Existing manual v9 receive, v8 sender and extracted spool regressions; full units with two workers;
  type/lint/format and isolated build/trace checks. Preserve failures and repairs alongside final evidence.

Account UI, additional members, successors, pruning, revocation/rotation, recovery/finalization and
production provisioning remain separate phases. This contract does not pay whole-protocol debts.


## Implemented boundary

`openOwnedSyncingAccountWorkspace(input, operatorToken)` in `src/crdt/accountReceive.ts` composes
`createEnvelopePreparation`, the v9 delivery census and `createSyncScheduler` under the existing owner.
Runtime status separates `sync.status.send` and `sync.status.receive`; `sync.retry(lane)` requests a
fresh durable recheck. Public read-only `deliveryStatus`, `receiveStatus` and `spoolStatus` retain useful
inspection without exposing publication or raw receive capabilities.

The native self-stream control found that a candidate mismatch was initially classified as corrupt
Local storage. The repair refuses that input before persistence, halts receiving and preserves the active
local editor. A stored signed receive conflict halts both lanes while preserving readable local content.
The before/after observations, effective mutation and final campaigns are recorded in the evidence link.

All generated histories passed under the original deadline. The test and outer runner now allow 420 and
450 seconds respectively, following a measured 291-second generated stage; the seed, cases and assertions
are unchanged. The exact executed source versions and this timeout-only delta remain archived.

Next is the row-7 manifest and semantic-admission descriptor capacity/versioning correction. This result
pays no remaining real-Account, enrollment, performance, recovery or release gate by implication.


### 2026-10-11 — Client receive and failure visibility

The receive selector keeps a publisher for at most four verified progressing pages, then gives other
publishers a turn. Empty checks advance immediately; no unverified reply creates sticky preference.
Every page returns to the shared scheduler. Page size remains one position, retaining existing byte
and admission bounds. Custody equality compares the same closed values as the MAC encoding without
re-encoding sealed progress carriers; the authenticated format is unchanged.

A persistent online lane problem becomes visible after 30 seconds in a fixed editor notice. The
Account menu also shows each lane's state, accepted/received counters, fixed reason code and last
successful upload/receive check since this opening. Those times are runtime observations, not durable
or global "all devices synced" claims. Offline and local-storage pressure use their existing paths.
Retry targets one lane and reruns all normal checks. Invalid received/history evidence remains halted;
unexpected exceptions retry automatically. No content, account IDs or exception text enters the notice.

The [bounded measurement protocol](./performance-experiments/2026-10-11-client-receive/protocol.md)
uses substantial synthetic writing and deep received history. Release qualification remains paused.
