# `P-4` — lapse authority

**Decided:** 2026-08-27 · **Branch:** `RC-7B`, a service-signed billing/retention machine independent of the
authorization lineage · **Race:** retire wins, in both orders · **Scope:** common invariants selected now, the
entitlement wire gated on `D-31` · **Status:** decided, not yet consolidated

Consolidation is [`S0-7`](../action-tree.md). Consumes [`S0-6`](../S0-6/README.md)'s `TerminalHandoff`.

## The finding has two halves and only one is live

`f-4259822-lapse-transition-kind-missing` records both, and they have different urgencies:

- **False closure, now.** Rows 15 and 16 are credited with covering lapse. They do not: the grammar offers
  `rotate`, `replace-recovery` and `retire`, and none of them represents a live-dormant state. An
  implementation reading the register today would have to misuse `rotate`, or use `retire` and destroy the
  live-lineage guarantee, or invent unreviewed state outside the protocol that claims to be common.
- **Unimplemented guarantee, conditionally.** There is no lapse machine — but lapse exists only if hosted sync
  is ever priced, and **`D-31` is "Deferred on purpose"**: a business-model question the project deliberately
  parked. PRD §6.10 says so in its own first line, which is marked *conditional*.

That asymmetry is what shapes this decision. The closure defect is real today; the missing machine is real
only in a future the project has chosen not to pick yet.

## The decision

**`RC-7B`.** Entitlement and hosted-retention state live outside the authorization lineage. Only a signed
service record stops synchronization or starts expiry, and **retirement remains the only terminal lineage
event**.

```
HostedRetentionState  live | grace | lapsed | expiring | expired
                      one stopped_at, one deadline, a monotonic revision
EntitlementEvent      the billing fact; authorizes state change, never writes lineage
ReseedSession         references the still-live lineage after destructive progress
```

## Why B

**PRD §6.10 answers this in the sentence it leads with:** *"A failed payment is a billing event, not an
identity event."* Branch A makes a billing change depend on a **client-signed** operation, and automatic
non-payment then requires the service to sign on the user's behalf — which is exactly what row 15's grammar
exists to prevent, and exactly the collapse that sentence refuses. A is more auditable in the abstract and
contradicts the product's own framing in practice.

B also keeps row 15 at three kinds. That matters beyond tidiness: row 15's wire theorem, its mine/other/silence
verdict and its idempotency argument were all validated by the review, and widening the grammar would put them
back in scope for no gain.

**The cost is recorded rather than glossed:** another trusted service signer and a cross-service transaction
with retirement. A billing compromise can then deny hosting — but it must not create terminal lineage and must
not delete before the deadline, which is what keeps the blast radius to availability.

## Why retire wins the race

Retirement is terminal and irreversible; lapse is dormant and resumable. **Retire wins in both orders**, and
that is simpler than an arbitration rule while failing in the safe direction:

- **Retire, then lapse** — the lapse is meaningless against a retired lineage and is refused.
- **Lapse, then retire** — a user who asked to delete gets deletion, whatever their billing state.

An arbitration rule naming an actor would need its own race semantics and a partition story. This needs
neither.

## What `S0-7` builds now, and what waits

**Now, because none of it depends on who initiates:**

- exactly one sync-stop time and one deadline, created once, idempotent under retry;
- **live lineage on lapse, terminal lineage only on retire** — the distinction the whole finding is about;
- a per-class expiry deletion ledger over primary objects, replicas, wraps, checkpoints and declared backups,
  consuming `S0-6`'s `TerminalHandoff` where retirement is the cause;
- resume **before** destructive progress reactivates; resume **after** it requires an explicit reseed session;
- multiple divergent survivors contribute branches and are **never mistaken for never-established genesis**.

**Gated on `D-31`:** the exact `EntitlementEvent` wire and its signer. It is selected in shape and cannot be
specified in bytes until there is a plan to lapse from.

**And the closure claim is corrected either way.** Rows 15 and 16 stop claiming to cover lapse. That is the
half of the finding that is live today, and it is fixed by saying something true rather than by building
something speculative.

## What `S0-7` must satisfy

1. Exactly one clock: two concurrent lapse events produce one `stopped_at` and one deadline.
2. A lapse leaves the lineage **live**; only `retire` writes terminal lineage.
3. Retire wins both orderings, replayably.
4. Resume before any destructive progress restores hosted sync with no reseed.
5. Resume after partial deletion requires a reseed session and cannot silently reactivate.
6. Deletion is per class and resumable; a partial run neither restarts nor over-deletes.
7. Declared backups and replicas are covered by the same ledger, not by a separate ad-hoc path.
8. Two divergent survivors both reseed as branches; neither is treated as genesis.
9. A forged or stale entitlement event cannot stop sync, start a clock, or delete anything.
10. A billing compromise can deny hosting and **cannot** create terminal lineage or delete before the deadline.

## What this does **not** decide

- **`D-31`.** Nothing here prices hosted sync, and nothing here assumes it is priced. If it never is, the
  retention machine still governs a sync stop that happens for any other reason, and the entitlement wire is
  simply never built.
- The hosted deletion, reseed and local-clear **workers** — `L-3`.
- Whether a non-billing event may stop hosted sync. That is a product question this record leaves open rather
  than resolving by implication.
