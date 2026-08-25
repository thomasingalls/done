---
schema: 1
kind: finding
id: f-4259822-generation-switch-local-durability-undefined
status: candidate
type: implementation-hazard
severity: medium
confidence: high
introduced_by: 4259822828060fe2b9592fa525cd9a17170af285
work_item: X-03
created_by: /root
updated: 2026-08-25
challenged_by: none
superseded_by: none
---

# The committed generation switch has no selected local durability order for the successor key and old pending work

## Affected requirement or guarantee

Row 15 makes a verified service outcome the single generation-switch boundary: no target-generation content before
it, no previous-generation content after it, and no dropped old generation before settlement, successor checkpoint,
and local trim. A crash at that boundary must leave the client able to open the selected generation and preserve
every already-journalled or already-minted local edit.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §§6.1, 13.7 and row 15 (`OC-024`, `OC-029`, `OC-033`,
`OC-077`) require crash-safe key/store ordering and interrupted rotation that fails closed. The local apply ordering
was explicitly open.

## End-state source

At `9edd9300adebcec3abd2234c946f1dcccdc17eef`, `docs/selections/row-15-transitions.md` persists a pending intent
before network and gives the abstract states `pending -> applying -> settled`; row 3 selects the durable local
`KeyEnvelope`. Neither source orders a successor `KeyEnvelope`, the active-generation marker, pending-record cleanup,
the synchronous old-generation journal, an unflushed batch, or accepted-but-unacknowledged old-generation outbound
envelopes. The transition generator models signatures/verdicts but no local key store or content carriers.

## First introduction and propagation

`4259822828060fe2b9592fa525cd9a17170af285` introduces the exact outcome and switch rule while leaving the local
`applying` state abstract. It inherits row 3's key-envelope carrier, row 2's generation-tagged journal, and rows 4–6's
outbound chain, but no later commit composes their durable boundaries. The three-part deletion rule and unspecified
local switch survive to the pinned tip.

## Reachable consequence

- If the client marks `g+1` active or accepts a new local edit before a durable successor `KeyEnvelope` (or an
  equivalently durable self-wrap plus explicit recovery state) is installed, a crash can leave journal/content bytes
  under a generation the slot cannot reopen.
- If it deletes the pending transition before that install, resubmitting the outcome cannot reconstruct the local
  opener safely.
- If it discards an already-journalled/unflushed `g` delta at the switch, local work is lost. If it persists new
  post-outcome records under `g`, it violates the selected cutoff. If it moves the delta to `g+1`, it needs an exact
  coverage/cleanup rule before the old journal key can be dropped.
- An already-minted `g` envelope whose acceptance reply is outstanding must remain exact until acceptance or an
  authenticated refusal decides whether it is replayed or re-minted under the successor epoch.

The reachable impacts are local data loss, an unreadable store, or content incorrectly remaining readable to an
excluded old-generation holder.

## Supporting evidence

The exact row-15 vector uses opaque example wraps and asserts only message binding, deterministic payload sorting,
and the three-way signed verdict. It does not create a `KeyEnvelope`, journal entry, content batch, outbound envelope,
or crash point. Tip searches find no successor-envelope staging or old-batch transition rule. X-02 independently
reconstructed the same joint from the storage side and left it explicitly for X-03.

## Counterevidence and disconfirmation attempt

The persisted rotation payload should include a wrap to the initiating device, so a device with its durable wrapping
private key can in principle recover `K_(g+1)` after a crash. A correct implementation can stage the row-3
`KeyEnvelope`, keep the pending record through local application, re-encrypt/flush covered deltas, and atomically
advance the active marker. Those facts make the construction repairable and may avoid storing raw `K_(g+1)` in the
pending record; they do not select the ordering or tell an implementation when cleanup is safe.

## Validation procedure

1. Persist the full retry payload, receive a verified winning outcome, and kill before/after successor-key unwrap,
   local `KeyEnvelope` installation, active-generation change, pending cleanup, journal replay/clear, batch commit,
   accepted-head persistence, checkpoint admission, and trim.
2. At every restart require exactly one active generation, a durable opener for it, and coverage for every local
   delta.
3. Exercise an old journal delta, an unflushed batch, an accepted-but-unacknowledged old envelope, and a genuinely
   refused old envelope separately.
4. Drop `g` only after all local/remote carriers that still require it are covered or explicitly retained.

## Disposition

Reopen before Stage 4: select the local `applying` transaction/order and compose it with the key store, journal,
outbound spool, checkpoint admission, and old-generation deletion predicates.
