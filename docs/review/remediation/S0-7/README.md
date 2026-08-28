# `S0-7` — lapse, expiry, and the per-class destructive-deletion ledger

**Standing:** home — the findings table below is an ownership source of the traceability population; read
back by `pnpm trace:check`.

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
second. This action resolved it in the direction both rules were already pointing:

> **The deadline is a floor on expiry deletion and a ceiling on both.** Nothing may be deleted before it when
> the cause is expiry; nothing may survive it whatever the cause. A lost acknowledgement retains the bytes
> _until the ceiling_, and the audit record still says the handoff never completed.

**And both `S0-9` rounds convicted that resolution's boundary half** (`FU-04` — the strongest convergence
across all seven challengers): composed with *it is the same stop*, a retirement after a lapse's elapsed
deadline was **born with its ceiling already past**, every class deleting at the click instant with zero
receipts — elapsed time replacing the receiving client's custody authority, asserted by the suite as a
positive. The ratified repair (`P-4`, option B with intrinsic acceptance) landed at the return, below: the
boundary is the retirement's own, what closes it is the owner's signed acceptance, and its execution
terminates in `deleted-without-receipt`.

## Stages

|       | Stage                  | Output                                                                                                             | Status                                                     |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| **A** | Durable record schemas | the retention state machine, the one clock, the six deletion classes, `EntitlementEvent` in shape, `ReseedSession` | **done** — [`A-schemas.md`](./A-schemas.md), amended at the return: §1 gains `deleted-without-receipt`, §3 the destructive boundary, §4 the branch set, and the falsifier map continues at rows 19–26 |
| **B** | Normative construction | TRD §14.7 (new), with §13.5, §13.7, §14.4 and §16 joined to it                                                     | **done** — §16.1 gains three rows and a name; the return restates §14.7's boundary half and §14.4's bound |
| **C** | Selection rows         | rows 15 and 16                                                                                                     | **done** — row 15 narrows, row 16 gains its machine; the return restates row 16 §9's two composition bullets |
| **D** | Executable evidence    | the state machine as a model test; the cross-check `RC-7` says was missing                                         | **done** — 29 model tests plus the scheduled reseed window, 18 return mutations, and the cross-check grown to the one-domain and homes-agree readbacks |
| **E** | Product surface        | PRD §§6.9–6.10                                                                                                     | **done** — §6.9 bounds "deleted", §6.10 gets its mechanism; the return lands the acceptance sentence and the request-measured boundary |

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
that is the product holding data the user asked it to destroy, for a reason the user never hears. As first
written, the second half read the copy going *at the deadline whatever happened to the handoff* — the
inherited clock, which is the sentence `FU-04` convicted; **at the return it became the acceptance said out
loud**: asking for deletion is accepting deletion, the signed request carries that acceptance, the window is
measured from the request itself, and a boundary erasure is recorded as `deleted-without-receipt` rather than
as anything a reader could take for a confirmation. The confirmation still says both halves, and names the
one lever a user has if they want it sooner: open a device, let it converge, confirm.

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

## The `S0-7` return (2026-08-29)

`S0-9` failed this stage twice at one boundary and once at one composition, and the boundary conviction is the
strongest convergence across all seven challengers:

- **`FU-04`** (round 1's `C-7`; round 2's `A-06`, `ST-02`, `E1`): three true sentences composed into a
  retirement **born with its ceiling already elapsed** — lapse at `t`, the deadline passes with no destructive
  act (which §14.7 deliberately permits), the owner retires at `deadline + 1`, and the inherited clock makes
  the `past` bypass true from the first instant. All six classes deleted at the click instant with
  `handoffs.size === 0`, the suite asserting it as a positive. The actor split is what made it a design defect:
  the entitlement signer supplies the state, the owner supplies the intent.
- **`FU-12`** (`ST-07`): the divergent-reseed test called `resume` twice from the same input world and passed
  neither result to the other, so the selected compare-and-set would refuse the required second survivor as
  stale — no branch set, no import state, nowhere for its divergent content to go.

The return landed `P-4`'s ratified rule (option B with intrinsic acceptance) and the branch composition:

- **The boundary is the retirement's own.** `retired_at + RETENTION`, written exactly once at the `cause`
  overwrite, never earlier than an inherited deadline, never recomputed after — a replayed retirement finds
  `cause` already `retirement` and recomputes nothing. `C-7`'s schedule now refuses `no-handoff` at the birth
  instant with all six classes present, and a property run over arbitrary `stopped_at ≤ retired_at` pairs
  finds no earlier execution in any order (falsifiers 11–13).
- **The clock executes only signed authority.** Every `retire` payload carries the erasure acceptance in its
  signed bytes — the acceptance-less mint is a published negative in the transition vectors, and the
  in-transit strip is a published digest difference the intent's signature no longer covers (falsifier 15).
  A boundary erasure terminates in **`deleted-without-receipt`**, a sixth retention state distinct from
  `cleared` that no reader of the mark or ledger can take for a receipt; the receipt-authorized run stays
  `cleared` and the two ends stay distinguishable (falsifier 14). The entitlement signer moves the boundary
  in neither direction, in the order `C-7` used (falsifier 16).
- **One gate, one domain.** `DELETION_CLASSES`'s five-entry copy died: the gate publishes its six-class
  domain and boundary semantics with the package vectors, and `check-retention.mjs` reads them back against
  §14.7's table and the model — order included — with the boundary tokens required in both (falsifier 17).
  The same checker holds eight destructive-boundary homes to the ratified sentences with the superseded ones
  refused as byte rules — §14.4, §14.7, row 16 §9, PRD §6.9/§6.10, `S0-6`'s and this stage's schema homes,
  and the record (falsifier 19).
- **The second survivor joins.** The reseed branch set is durable; the stale session is refused **and held**,
  re-derives against the advanced revision, and joins the world the winner left. The derive-to-commit window
  runs on the storage scheduler with a kill and a second writer inside, and the branchless pre-return machine
  is kept as the detected negative (`FU-12`).
- **The map's last open joint flipped.** `destructive-boundary` resolved; the open count reads **zero**,
  entry by entry at the returns. `retention-mark`, `reseed-session`, `terminal-handoff`, `package-manifest`,
  `terminal-lineage-record` and `local-archive-anchor` re-pinned with their rules unchanged (the retention
  mark's bound gaining the boundary immunity).

An 18-mutation battery caught 18 — the boundary recompute deleted, the formula inverted, the replay
recompute restored, the acceptance guards deleted at both mints, the terminal state collapsed back to
`cleared`, the audit fact unrecorded, the pre-boundary gate disarmed, the branch set replaced in both
machines, the stale session dropped, the published domain narrowed to five, the superseded sentences
restored to three homes, and a silent edit to the pinned schema — each by its own falsifier, checker or pin.
`pnpm check` green end to end.

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
that nothing reads it as having been settled by implication. `S0-9` was asked to challenge it — **and did,
harder than the invitation imagined**: the challenge sharpened the question from *how long* to *whether the
window can be zero*, which is `FU-04`. The ratified answer (`P-4`, option B) makes the duration question
safely open — any positive backstop refuses the born-elapsed reproduction — and it remains open on exactly
the recorded terms.
