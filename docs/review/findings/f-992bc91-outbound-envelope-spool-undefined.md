---
schema: 1
kind: finding
id: f-992bc91-outbound-envelope-spool-undefined
status: candidate
type: implementation-hazard
severity: medium
confidence: high
introduced_by: 992bc9113093fe04d20df0247aa118d0f8ba365f
work_item: X-03
created_by: /root
updated: 2026-08-25
challenged_by: none
superseded_by: none
---

# The selected protocol has no durable outbound-envelope spool for crash and lost-reply recovery

## Affected requirement or guarantee

Devices must retain their own source-authenticated envelopes through the second-newest admitted checkpoint, must
compute their own accepted chain unaided, and must never re-mint a position that might already have been accepted.
Those requirements imply that the exact envelope bytes and their position survive before first submission and across
an accepted-but-unacknowledged send.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/PRD.md` §§5.3–5.4 and the same SHA's TRD §7.4 (`OC-010`,
`OC-011`, `OC-068`) require source envelopes to survive end to end and require each device to retain its own suffix.
The wire format and retention depth were open.

## End-state source

At `9edd9300adebcec3abd2234c946f1dcccdc17eef`, rows 4–6 make `seq` client-owned, use a random nonce and digest in
each signed envelope, forbid re-mint after silence, and deepen retention to the second-newest checkpoint. TRD §6.1
selects local `update`, `state`, and `heads` records but no outbound-envelope record, object store, reservation, or
send/ack cleanup order. The tip contains no application or relay integration that supplies an implicit carrier.

## First introduction and propagation

`992bc9113093fe04d20df0247aa118d0f8ba365f` selects the random-nonce envelope and one client/accepted position,
which makes exact-byte retry load-bearing. `745e332b061e0e964ae655e853f2f3b393667c66` adds the silence/no-re-mint
rule and second-newest retention but only selects the inbound `heads` carrier. The omission survives row 15's exact
transition retry work and the pinned tip.

## Reachable consequence

1. A local delta is journalled and later minted as envelope `E_n` with a random nonce, digest, signature, batching
   boundary, epoch, and generation.
2. The service accepts `E_n`; the page dies before the sender durably records the accepted head or before the reply
   arrives.
3. The local journal/content record preserves the Yjs delta but not `E_n`'s exact nonce, batch, digest, signature, or
   link. Re-enveloping the delta produces different bytes at `n`; choosing `n+1` creates a gap; waiting without the
   original bytes cannot retry a request that may have been lost before acceptance.
4. Fetching `E_n` back from the hosted store is not a replacement for device retention: a hostile/unavailable old
   provider is precisely the migration and fallback boundary for which the device-owned suffix exists.

The result is indefinite outbound unavailability, self-equivocation, or loss of the device-owned migration suffix,
depending on which unsupported recovery choice an implementation makes.

## Supporting evidence

Exact-tip searches for pending/persisted outbound envelopes find only the retention requirement. The selected local
record type has no outbound kind; antireplay vectors model accepted marks and narrative retention but no crash before
send/after accept; the envelope vector proves bytes and field bindings but no durable state. The transition row shows
the contrasting correct shape: persist exact retry material before the first network byte and resubmit identical
bytes on silence.

## Counterevidence and disconfirmation attempt

The synchronous journal and encrypted content store preserve the underlying edit, so the user content need not be
lost locally. They do not reproduce a random-nonce, signed, batched envelope or its accepted link. The remote durable
store ordinarily retains accepted envelopes and may repair an honest online case, but reliance on that store silently
removes the independent device-retention property and does not cover a request lost before acceptance. A simple
encrypted spool can solve the issue; it is not present in the selected state machine.

## Validation procedure

1. Persist an exact outbound record and reserve its credential position before the first submission.
2. Kill before submission, after submission, after remote acceptance, after receiving the head, and before/after
   advancing the local mark; every restart must resend the same bytes or recognize their accepted link.
3. Lose the first request entirely and require byte-identical retry rather than re-mint.
4. Make the hosted store unavailable and prove the device still retains every own envelope back to the
   second-newest admitted checkpoint.
5. Check cleanup only after both the accepted mark and the checkpoint-relative retention floor permit it.

## Disposition

Reopen before Stage 4: select the encrypted outbound spool, position reservation, exact retry/idempotency rule, and
checkpoint-relative cleanup ordering.
