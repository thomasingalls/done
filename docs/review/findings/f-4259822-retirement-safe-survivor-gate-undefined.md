---
schema: 1
kind: finding
id: f-4259822-retirement-safe-survivor-gate-undefined
status: repaired
type: implementation-hazard
severity: high
confidence: high
introduced_by: 4259822828060fe2b9592fa525cd9a17170af285
work_item: X-04
created_by: /root
updated: 2026-08-29
challenged_by: root-v01-20260826
superseded_by: none
---

# Retirement has no durable gate proving a current survivor or export received terminal evidence before deletion

## Affected requirement or guarantee

Account deletion is safe only when a verified-current device or fresh export survives, enrolled devices receive a
catch-up window, and terminal/recovery/verification material is synchronized before hosted ciphertext is deleted.
Deleting while every survivor is stale is named as irreversible data loss.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/PRD.md` §6.9 (`OC-020`) requires a current device or fresh export,
a catch-up window, a signed terminal package, and independent usable local replicas. The same SHA's TRD leaves the
terminal format and interrupted-deletion behavior open in rows 10 and 15.

## End-state source

At `9edd9300adebcec3abd2234c946f1dcccdc17eef`, PRD §6.9 and TRD §14.4 preserve the preconditions and order.
`docs/selections/row-10-portable-package.md` explicitly leaves what the service must do before deletion and the
catch-up window to Stage 4. `scripts/generate-transition-vectors.mjs` binds the `retire` payload only to
`reason = account-deletion` and `terminal-head`; it carries no package digest, verified-current device/export proof,
participant/catch-up result, or delivery acknowledgement. The service inventory names account deletion as the
hosted objects' deletion event without defining a durable intermediate gate.

## First introduction and propagation

The safety requirement exists at the pinned base. `745e332b061e0e964ae655e853f2f3b393667c66` selects the package
format but defers the deletion protocol. `4259822828060fe2b9592fa525cd9a17170af285` then selects `retire` and its
signed outcome without carrying the deferred precondition/delivery state. Both selections are marked closed at the
tip while the joint remains prose-only.

## Reachable consequence

1. A device requests retirement while its replica is stale and no fresh export has been durably saved, or the last
   current device prepares a package but loses the response/download.
2. The service commits the valid `retire` intent and terminal record. This fail-closed intermediate—retired lineage
   with hosted bytes present—is safe so far.
3. A deletion worker observes account deletion/terminal state. No selected durable object tells it whether a safe
   survivor/export received the terminal package or whether the required catch-up gate completed.
4. Hosted ciphertext, wraps, checkpoints, and authorization state are deleted as the inventory directs.
5. Remaining stale local replicas have permanent gaps, and no package/source remains from which to fill them.

The impact is irreversible content or verification-material loss during an authorized destructive operation.

## Supporting evidence

Exact-tip searches find the requirements only as prose; there is no package acknowledgement, survivor/export id,
catch-up receipt, or deletion-gate schema in selections, generators, vectors, or the service inventory. The retired
package vector proves manifest encoding and signatures, not delivery. The retire vector proves kind binding and
outcome idempotency, not the safe-survivor precondition or terminal-package handoff.

## Counterevidence and disconfirmation attempt

The ordering requirement is explicit: a conforming Stage-4 service can add a durable state such as
`retired-awaiting-export-ack`, keep hosted bytes indefinitely until a verified package acknowledgement, and make the
deletion worker consume that record. This makes the design repairable and means the signed retirement outcome alone
need not contain every acknowledgement. No such state, authority, retry rule, or deletion predicate is selected,
however, so the exact handoff between the two closed rows remains undefined.

## Validation procedure

1. Start with every device stale except one candidate survivor and no independent export.
2. Kill before/after terminal commit, package assembly, package download, durable client acknowledgement, catch-up
   completion, and each hosted deletion class.
3. At every point require either recoverable hosted bytes or a verified-current independent package/replica that has
   acknowledged the terminal record.
4. Refuse deletion when no such proof exists; a UI request, active session, or locally generated but unreceived
   package is not proof.
5. Repeat with an explicitly absent offline device and verify the confirmation names rather than waits for it.

## Disposition

Reopen the retire/package/deletion joint. Select a durable safe-survivor/export acknowledgement and catch-up gate,
and make every hosted deletion event depend on it before account deletion is implementation-ready.

**Repaired — 2026-08-29** under the authorized `S0-10` disposition workflow (`docs/review/README.md` §Finding lifecycle states the standard; `remediation/traceability.md` is the
generated finding→falsifier matrix). The defect's return is refused by the seven `catchup-*`
negatives and the `§14.7` retention-model suite enumerated for this finding in the matrix.
