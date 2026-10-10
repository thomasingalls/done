# Account self-stream progress from retained acceptance

2026-10-10. First bounded editing-latency repair, on
`codex/account-self-stream-progress`, based on `343c4bce` from
`claude/f17-editing-latency`. The diagnostic starting point is the
[desktop typing packet](./performance-experiments/2026-10-10-account-desktop-typing/README.md).
Release validation remains paused. This change is not deployed.

## What changes

The composed Account owner derives its own received prefix from the existing verified delivery
decisions and retained source envelopes. It checks original content coverage, the contiguous
position/link chain, existing self-inbound evidence, and any installed checkpoint starting point.
An HTTP success, unsigned cursor, missing decision, or absent source cannot advance it.

`advanceSelfReceive` runs only after the existing spool, delivery and inbound verifiers succeed.
It extends the owner-local view; it does not write a cursor. The same derivation runs on cold open.
Coverage includes Yjs deletions and pending information, including after exact-coverage compaction.
The latest accepted prefix remains known if later conflicting evidence blocks the stream.
Other publishers' prefixes are unchanged.

The next own-stream read starts after that prefix. A successful ordinary submission therefore
needs no envelope download, duplicate content write, self-inbound row or Yjs promotion. The
existing endpoint still performs an empty repair check; this phase does not add a head-only wire
format, suppress notifications/discovery, or remove all self-directed HTTP traffic.

Those self checks execute under the existing storage owner without occupying the editor admission
FIFO. Actual peer updates still use the FIFO, persist-before-promotion and dependency-order rules.
Local input still waits behind a flush or a genuine remote admission; full-store validation still
runs on the main thread. This repair does not make those costs disappear.

## Interrupted operations

Before acceptance commits, there is no new durable self prefix. If both the submit reply and the
repair read are unavailable, the exact retained submission is retried after restart without resealing.

If a repair read returns an own envelope after a lost submit reply, the owner verifies the signed
request/page, acceptance evidence and exact match with its retained envelope. It records the
position decision through the existing delivery writer, which rechecks the current authority and
retained bytes. It neither persists another content copy nor promotes that content through Yjs.
The receive result alone is never the durable acknowledgement.

A crash after the acceptance commit but before returning from the operation reconstructs the prefix
from disk. Retained evidence also allows an overlapping older envelope reply to be classified as a
duplicate. Unknown own bytes remain a refusal; signed conflicts remain a blocked state.

## Compatibility and retention

No wire, marker, ciphertext or ledger grammar changes. Old self-inbound records remain independently
verified before projecting the delivery-backed prefix. New own receipts use the already supported
delivery-record grammar. No inbound event is written across a gap created only by this projection.

Consequently this repair does not need a new reader fence: a previous v9 reader can reconstruct its
old receive cursor and perform redundant readback again. It does not misinterpret a new persistent
cursor or encounter a new record form. Existing restrictions on v7/v8 readers remain.

This phase does not delete historical duplicate records or relax history-pruning evidence. The
packaged two-device checks exercise actual peer delivery, interrupted history installation and a
returning editor after service pruning. The ordinary completeness witness and retained acceptance
records remain required.

## Focused verification

- `test/accountSelfReceive.test.ts`: independent signed fixtures, accepted versus unknown progress,
  unchanged peer state, old self evidence, conflicting heads, missing decisions/content, duplicate
  replies, and 35 generated insert/delete histories before and after compaction.
- `test/account-sync/native.test.mjs`: no normal body readback or self-inbound records; lost reply
  reconciliation; exact retry when reconciliation is unavailable; abort before receipt persistence;
  renderer death after persistence; local input during held self-page verification; old self rows.
- `test/account-membership/generations.test.mjs`: retained acceptance/source evidence across rotation.
- Existing receive/delivery/scheduler units and the two packaged history journeys cover the adjacent
  contracts without starting a general campaign.

Timing evidence and exact completed commands are recorded separately in the
[repair measurement](./performance-experiments/2026-10-10-self-stream-progress/README.md).

## Next bounded repair

Incremental client validation: keep an authenticated view under the live owner and verify committed
transitions without repeatedly reading, parsing, copying and replaying the entire ledger. The first
repair removes redundant passes and new duplicate history, but existing and outbound history still
grow. Batching, service scans, undo copying and any editor architecture changes remain distinct work.
