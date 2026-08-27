# `S0-7` — lapse, expiry, and the per-class destructive-deletion ledger

**Started:** 2026-08-27 · **Inputs:** [`P-4`](../decisions/P-4-lapse-authority.md) decided (`RC-7B`);
[`S0-6`](../S0-6/README.md) supplies `TerminalHandoff`; [`S0-2`](../S0-2/README.md) supplies the generation and
reference rules

The last action before evidence regeneration, and the one whose finding is **half already true and half
conditional**. `P-4` separated those halves; this builds the true one and states the other in shape.

## Findings this action must close

| Finding                                   | Severity | What fails today                                                                      |
| ----------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| `f-4259822-lapse-transition-kind-missing` | medium   | Rows 15 and 16 are credited with covering a state the selected grammar cannot express |

`f-4259822-retirement-safe-survivor-gate-undefined` was closed by `S0-6`, which built the gate. This action
composes that gate with row 16's clock, which is where the two of them turn out to disagree — see
**The bound nobody had written** below.

## The claim that has to go

Row 15 §8 files product downgrade as answered:

> | **Product downgrade** | PRD §6.10, and §2 above makes its one requirement a bound field |

and PRD §6.10 states the mechanism as fact:

> a downgrade and a deletion differ in exactly one artifact — the terminal lineage record — and **the two
> requests are otherwise the same fields**, so the kind of transition is authenticated in the request and in
> its settlement.

**There is no downgrade request.** The grammar has `rotate`, `replace-recovery` and `retire`. What §2 proves —
and it does prove it, with vectors — is that _a rotation_ cannot be read as a retirement. A rotation is a
generation change. It is not a payment lapse, a hosted read-only state, a synchronization stop, or a retention
deadline, and no field of it says otherwise.

So the demonstration is sound and **the thing it demonstrates is not the thing the row claims**. That is the
same shape as `f-992bc91-network-carrier-registry-stale`: a true local statement standing in for a total one.

## The bound nobody had written

`S0-6` selected the deletion gate: **a lost acknowledgement retains the bytes**, because deleting data somebody
needed is unrecoverable. Row 16 selected the ceiling: **at expiry the hosted copy is deleted**, because §16.6
calls an unbounded retention a defect rather than an omission.

Composed, those are a contradiction nobody had to resolve while they lived in different documents. A retirement
whose survivor never appears retains bytes **forever** under the first rule and **for twelve months** under the
second. This action resolves it in the direction both rules were already pointing:

> **The deadline is a floor on expiry deletion and a ceiling on both.** Nothing may be deleted before it when
> the cause is expiry; nothing may survive it whatever the cause. A lost acknowledgement retains the bytes
> _until the ceiling_, and the audit record still says the handoff never completed.

## Stages

|       | Stage                  | Output                                                                                                             | Status                                              |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| **A** | Durable record schemas | the retention state machine, the one clock, the six deletion classes, `EntitlementEvent` in shape, `ReseedSession` | **done** — [`A-schemas.md`](./A-schemas.md)         |
| **B** | Normative construction | TRD §14.7 (new), with §13.5, §13.7, §14.4 and §16 joined to it                                                     | **done** — §16.1 gains three rows and a name        |
| **C** | Selection rows         | rows 15 and 16                                                                                                     | **done** — row 15 narrows, row 16 gains its machine |
| **D** | Executable evidence    | the state machine as a model test; the cross-check `RC-7` says was missing                                         | pending                                             |
| **E** | Product surface        | PRD §§6.9–6.10                                                                                                     | pending                                             |

## Not in scope

- **`D-31`.** Nothing here prices hosted sync. The `EntitlementEvent` wire is selected in shape and cannot be
  specified in bytes until there is a plan to lapse from — `P-4`'s scope decision.
- **The workers.** Hosted deletion, reseed and local-clear execution is `L-3`. This selects the state they move
  through and the gates they obey, not the code that performs them.
- **The grace period's duration**, which row 16 §9 leaves open as a billing parameter.
