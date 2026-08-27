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

|       | Stage                  | Output                                                                                                             | Status                                                     |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| **A** | Durable record schemas | the retention state machine, the one clock, the six deletion classes, `EntitlementEvent` in shape, `ReseedSession` | **done** — [`A-schemas.md`](./A-schemas.md)                |
| **B** | Normative construction | TRD §14.7 (new), with §13.5, §13.7, §14.4 and §16 joined to it                                                     | **done** — §16.1 gains three rows and a name               |
| **C** | Selection rows         | rows 15 and 16                                                                                                     | **done** — row 15 narrows, row 16 gains its machine        |
| **D** | Executable evidence    | the state machine as a model test; the cross-check `RC-7` says was missing                                         | **done** — 23 tests, 18 mutations, 3 checks                |
| **E** | Product surface        | PRD §§6.9–6.10                                                                                                     | **done** — §6.9 bounds "deleted", §6.10 gets its mechanism |

### Stage D

**Two artifacts, because the finding has two failure modes.** The machine can be wrong, and the claim about the
machine can be wrong; a model test catches the first and only a cross-check catches the second.

`test/hostedRetention.test.ts` — **23 tests, and every guard mutation-tested.** Eighteen mutations, each caught
by the test that names it:

| Mutation                                       | Caught by                                                    |
| ---------------------------------------------- | ------------------------------------------------------------ |
| The clock is rewritten on every stop           | one clock; and the race, which is where it matters           |
| `effective_at` becomes the clock               | the backdating falsifier and the compromised-signer bound    |
| A stale entitlement sequence is accepted       | the replay falsifier                                         |
| An entitlement event reaches a retired lineage | retirement wins both orders                                  |
| The class set is ignored                       | classes 1–5 delete, class 6 refuses                          |
| The deadline is not a floor                    | expiry before the deadline; and the compromised-signer bound |
| The handoff gate is removed                    | per-class receipts on retirement                             |
| Deletion is not idempotent                     | a partial run resumes without re-deleting                    |
| **The handoff gate outlives the ceiling**      | nothing survives the deadline                                |
| Resume ignores destructive progress            | the re-seed requirement                                      |
| A stale re-seed revision is accepted           | the serialization falsifier                                  |
| The ledger survives a resume                   | a second lapse re-deletes rather than reading a stale `done` |
| `stop()` does not restate                      | retirement re-opens the ledger after an expiry               |
| A genesis claim is accepted                    | two divergent survivors are branches                         |
| `retire` does not write terminal lineage       | only retire moves the lineage axis                           |
| The audit fact is asserted rather than derived | nothing survives the deadline                                |

**Each guard's refusal carries a reason, and each negative asserts the reason.** A state machine with four
guards on one call is precisely where this project's recurring defect reappears — a negative that refuses for a
different reason than intended, proving nothing — and it has been caught five times already. So the class-6
refusal is tested **after** the deadline, where the deadline cannot be the reason; the before-deadline refusal
uses a class that **is** in the set; and the handoff negative is paired with the same call carrying a receipt.

**Two of the falsifiers were model bugs first.** Writing the machine without them produced a `cleared` workspace
that still held its recovery anchor after the user asked for deletion — `cleared` had been true of five classes
and retirement makes it six — and a resume that left `done` in the ledger, so the _next_ lapse skipped every
class the first had already deleted and those bytes outlived their deadline. Both are now tests.

`scripts/check-retention.mjs` — **the third check, which is the one `RC-7` says was missing.** Its diagnosis is
that _two independent checkers each pass because neither cross-checks the policy state against a durable
transition._ The kinds are now read from the generator's published output, the states from §14.7's table, and
the two vocabularies must stay disjoint — with §13.7's stated count, the executable model's own declarations,
and the rule that expiry keeps exactly the recovery anchor all cross-checked. Seven mutations, all caught: a
`lapse` kind fails with the decision it would be reversing, and a state renamed `retired` fails as a lineage
word _and_ as a disagreement with the model.

**One mutation deliberately survives**, and it is the honest limit: removing one of §14.7's two statements of
the deadline still leaves the other, so the anchor holds. Removing both fails. That is the anchor list working
as designed rather than a gap.

### What Stage E changed

**§6.9's _if the acknowledgement is lost, the bytes stay_ needed a second half, and not having one was a
product problem rather than a design one.** _Deleted_ cannot quietly mean _kept because nobody confirmed_ —
that is the product holding data the user asked it to destroy, for a reason the user never hears. Deletion
stops hosted synchronization, which starts the same clock a lapse does, so the copy goes at the deadline
whatever happened to the handoff. The confirmation now says both halves, and names the one lever a user has if
they want it sooner: open a device, let it converge, confirm.

**§6.10's binding requirement stopped describing a mechanism it did not have.** It said a downgrade and a
deletion _are otherwise the same fields, so the kind of transition is authenticated in the request and in its
settlement_ — and there is no downgrade request. It now says the true thing, which is stronger: **a lapse is
not a request at all.** It is a signed service record on a separate axis, which is what _a failed payment is a
billing event, not an identity event_ means once it is built rather than asserted.

**Three things a user can act on were missing entirely.** What resuming costs and when that changes — before
any deletion nothing is asked, after it a device has to be present to re-seed. That the recovery material
expiry keeps is a class the machinery **refuses** to touch rather than a convention it observes, because
deleting it makes §6.10's own re-seed promise false in the one situation it exists for. And what a billing
failure reaches: read-only, loudly, with every device writable and every deadline stated — never anything
permanent.

**The disclosure became evidence.** _From that moment the devices stop converging_ was interface copy about a
service behaviour; the dates are now fields of a signed record, so what the user is told and what the service
will act on cannot drift, and a device that has seen a later version will not accept an earlier one.

**PRD §11 question 1 says what is left.** `D-31` is deferred on purpose and this action did not touch it — but
a future reader answering it should know the lapse machine is already selected and only the entitlement
record's wire and signer wait on the price.

## Not in scope

- **`D-31`.** Nothing here prices hosted sync. The `EntitlementEvent` wire is selected in shape and cannot be
  specified in bytes until there is a plan to lapse from — `P-4`'s scope decision.
- **The workers.** Hosted deletion, reseed and local-clear execution is `L-3`. This selects the state they move
  through and the gates they obey, not the code that performs them.
- **The grace period's duration**, which row 16 §9 leaves open as a billing parameter.

## The one thing this decided conservatively rather than argued

**Whether a user-initiated deletion deserves a shorter backstop than a lapse.** Making row 16's deadline a
ceiling on retirement too is forced — the alternative is the unbounded retention §16.6 calls a defect — but
_twelve months_ was the number already there, and reusing it was the conservative move rather than an argued
one. A shorter backstop is defensible and would mean a **second duration**, which row 16 §3 argues against on
grounds that were about lapse and resumption and do not obviously carry to deletion somebody asked for.

It is recorded in TRD §14.7 and row 16 §9 as open, in the same sentence that makes the ceiling binding, so
that nothing reads it as having been settled by implication. `S0-9` should challenge it.
