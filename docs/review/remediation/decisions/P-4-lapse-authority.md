# `P-4` — lapse authority

**Decided:** 2026-08-27 · **Reopened:** 2026-08-28, at the destructive boundary · **Ratified:** 2026-08-28,
option B with intrinsic acceptance · **Branch:** `RC-7B`, a service-signed billing/retention machine
independent of the authorization lineage · **Race:** retire wins, in both orders · **Scope:** common
invariants selected now, the entitlement wire gated on `D-31` · **Status:** ratified, not yet consolidated —
the `S0-7` return owes falsifiers 11–19

Consolidation is [`S0-7`](../action-tree.md). Consumes [`S0-6`](../S0-6/README.md)'s `TerminalHandoff`.

**Read the reopening at the end of this record before consuming anything above as settled.** `RC-7B` stands;
what failed both `S0-9` rounds was one rule at this record's destructive boundary, and that rule is now
ratified: **option B, with intrinsic acceptance** — the owner's signed intent authorizes ceiling erasure, and
the clock only executes it.

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

*Reopened 2026-08-28: this list was necessary and not sufficient — it bounds the clock from shortening and
never asserts the catch-up window is non-zero. It continues at falsifiers 11–19, below.*

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

---

## Reopened 2026-08-28 — the destructive boundary (`FU-04`, both `S0-9` rounds)

**Everything above stands except one composition, and it is the strongest convergence across the seven
challenges.** Round 1's [`C-7`](../S0-9/challenge-continuity.md) built it from the shipped model; every round 2
challenger reached it again, serially and blind —
[`A-06`](../S0-9/followup-authority/challenge-authority.md),
[`ST-02`](../S0-9/followup-storage/challenge-storage.md),
[`E1`](../S0-9/followup-evidence/challenge-evidence.md). Both dispositions return it here rather than to any
artifact, and [`HANDOFF.md`](../HANDOFF.md) states what this record owes: **the rule that stops a retirement
being born with its ceiling already elapsed.**

Three sentences compose into the defect:

- TRD §14.4: *"Only a durable handoff authorizes a hosted deletion class"* — grounded, in the same section, by
  *"a window that has merely elapsed is the definition of mistaking time for evidence."*
- TRD §14.7, lapse-then-retire: *"`stopped_at` and `deadline` do not move, because it is the same stop."*
- TRD §14.7: *"A lost acknowledgement therefore keeps the bytes until the ceiling and no longer."*

Lapse at `t`; the deadline passes with no destructive act, which §14.7 deliberately permits; the owner retires
at `deadline + 1`. The retirement inherits the elapsed clock, so it is **born with its ceiling already past**:
the `past` bypass is true from the first instant, the `no-handoff` refusal is unreachable, and the catch-up
window §14.4 requires has length **zero**. Reproduced on the shipped model: all six classes — recovery anchor
included — deleted at the click instant with `handoffs.size === 0`. The suite asserts this as a *positive*
(`lets nothing survive the deadline, including a retirement whose handoff never came`), which is how every gate
stayed green while
[`f-4259822-retirement-safe-survivor-gate-undefined`](../../findings/f-4259822-retirement-safe-survivor-gate-undefined.md)'s
end state executed. Its validation procedure says *refuse deletion when no such proof exists*; after the
deadline, the machine does the opposite.

**The actor split is what makes this a design defect rather than a model bug.** The lapse state is reachable by
the entitlement signer alone; twelve months later the *owner* supplies the retire intent. The attacker supplies
the state, the victim supplies the intent. Falsifier 10 above held exactly as written — nothing was deleted
*before* the deadline — and was vacuous in the one order that mattered. §14.7 flagged the backstop duration as
open and asked `S0-9` to challenge it; the challenge sharpened the question from *how long* to **whether it can
be zero**.

### The reopened question

**At the destructive boundary of a retirement, is elapsed time ever an authority — and when the ceiling arrives
with no durable `TerminalHandoff`, whose signed act makes deletion the outcome?**

`RC-7B` itself is not reopened. Every challenger preserved the machine: the separate retention signer and
vocabulary, one clock per stop, retire-wins in both orders, the six-class ledger and its idempotent resume,
expiry keeping the recovery anchor, the entitlement replay and backdating refusals. What is reopened is one
rule at one boundary — and it is first in the decision sprint because the rule chosen here is the
custody-over-clock pattern the other unbound authority joints will follow.

### The floor that is not a choice

**Whatever is ratified must refuse the reproduction: a retirement never begins life with its gate already
disarmed.** §14.4 already says the right thing — *"Retirement stops hosted synchronization, which starts the
one clock"* — and §14.7's *"it is the same stop"* overrode it for the lapse-then-retire order without working
the elapsed case. The repair shape is round 1's suggested direction: the retirement's destructive boundary is
computed from the retirement — `max(inherited deadline, retired_at + floor)` with a stated `floor > 0` —
written exactly once at the `cause` overwrite, under the same compare-and-set, and never recomputed after. That
preserves the rule that a deadline must not move: this boundary can only be *later* than the inherited
accident, once, at a client-signed event nothing may overwrite. With `floor = RETENTION` — row 16's twelve
months — the formula collapses to `retired_at + RETENTION`: **one duration, no second number, row 16 §3's
argument preserved**, and a shorter floor remains exactly as open as §14.7 already records it. Under option A
below the rule is vacuously satisfied, because the gate never disarms.

An entitlement event may never move a retirement's boundary in either direction. Shortening is already refused;
after `cause = retirement`, stop/resume ping-pong and `restored` change nothing. `C-8`'s lapse-side extension
stays deliberate — §14.7 selects a new, strictly later clock for a workspace that lapses again — and what dies
is only the tested claim that the deadline is out of the signer's reach, owed as Stage D evidence.

### The options considered

One sub-question separates them: what happens at the ceiling when no handoff ever completed.

**A — the gate is absolute; a retirement with no survivor retains forever.** `S0-6`'s falsifier 11 restored
verbatim for the retirement cause; the ceiling binds expiry alone. The cost is the contradiction `S0-7` built
the ceiling to resolve: §16.6's *unbounded retention is a defect* must be explicitly narrowed to lapse/expiry,
and the service holds ciphertext indefinitely **against the owner's own signed deletion request** — the privacy
and data-minimization cost `E1` names, and the one direction of the original contradiction this program has
already once refused.

**B — the owner's signed intent is the erasure authority, and the clock only executes it. (Ratified.)** The
`retire` intent carries, in its signed payload, the explicit acceptance: *if no receiver completes a handoff
within the window, delete anyway*. Ceiling erasure is then the execution of a client-signed instruction — never
the clock's own authority — and it terminates in `deleted-without-receipt`, a terminal state distinct from
handoff completion that no consumer can read as a receipt. Both prior rulings survive in their own
jurisdictions: §14.4's custody gate governs while the window is open, and §16.6's bound holds because the
owner's own instruction, not elapsed time, closes it. This is PRD §6.10's pattern at the next boundary — *a
failed payment is a billing event, not an identity event*; a deadline is an executor of the owner's
instruction, not an authority of its own. The sub-choice resolved with ratification: the acceptance is
intrinsic to every `retire` — asking for deletion *is* accepting deletion, and Stage E owes the sentence that
says so out loud. The optional-waiver variant, whose absent case inherits A's indefinite retention, is not
selected.

**C — elapsed time keeps the authority, and every home says so.** The shipped machine stands, made honest: the
safe-survivor guarantee is narrowed at every home that states it — §14.4, PRD §6.9, `S0-6`'s falsifier 11, the
finding's guarantee — to *unless the ceiling arrives first*. It is the smallest diff and the largest
concession: it ratifies mistaking time for evidence in the one place §14.4 refuses it by name, it renegotiates
the original high finding rather than repairing it, and it sets the anti-pattern for every class-1 joint behind
this one.

### Ratified 2026-08-28 — B, with intrinsic acceptance

**The ruling.** Every `retire` intent carries the erasure acceptance in its signed payload; a payload without
it is malformed. The destructive boundary is `retired_at + RETENTION`, written once at the `cause` overwrite
under the floor rule above — whether a shorter floor is warranted stays row 16 §9's open product question, now
safe to leave open because any `floor > 0` refuses the reproduction. Ceiling erasure executes the owner's
instruction and terminates in `deleted-without-receipt`. **Elapsed time is never an authority** — here, or at
any class-1 joint that follows this pattern.

**Why B.** It is `A-06`'s second arm made concrete — *"a distinct, explicitly authorized loss/deletion exception
whose authority and UX do not pretend to be a survivor receipt"* — and it satisfies `E1`'s either/or on both
sides at once: recoverability's rule (*the timer cannot substitute for `TerminalHandoff`*) holds because what
substitutes is the owner's signed acceptance, and forced erasure's rule (*record that no recovery survivor may
exist*) is exactly what `deleted-without-receipt` records. `ST-02`'s refusal of the superficial repair is
honored: nothing is renamed — the authority actually changes hands.

### Falsifiers 11–19

Continuing the ten above, under the ratified rule. Each is a test, not a claim:

11. **The reproduction fails.** Lapse; the deadline elapses with no destructive act; the owner retires; every
    class refuses `no-handoff` at the birth instant with `handoffs.size === 0`, and all six classes are present.
12. In every order — retire alone, lapse-then-retire live, lapse-then-retire elapsed — no handoff-less class
    deletes before `retired_at + floor`. A property run over arbitrary `stopped_at ≤ retired_at` pairs finds
    no earlier execution.
13. The boundary is written exactly once, at the `cause` overwrite, under the compare-and-set; it is never
    earlier than the inherited deadline, and no later event recomputes it. A replayed retirement yields the
    same boundary.
14. **Time never masquerades as receipt.** A ceiling erasure terminates in `deleted-without-receipt` with the
    handoff recorded incomplete, and no reader of the mark or ledger can derive *a survivor received terminal
    state* from it. Renaming `cleared` or keeping only an audit bit fails this — both dispositions say so.
15. **The clock executes only signed authority.** The acceptance is intrinsic, so a `retire` intent without it
    in its signed bytes is refused at creation as malformed — no acceptance-less retirement exists for the
    ceiling to arbitrate — and flipping the acceptance in transit breaks the intent's signature.
16. **The entitlement signer cannot move the boundary in either direction.** Backdated `effective_at` cannot
    shorten it; after `cause = retirement`, ping-ponged stop/resume and `restored` events extend nothing.
    §14.7's compromise bound then holds non-vacuously, in the order `C-7` used.
17. **One gate, one domain.** The two artifacts credited with the finding state the same predicate over the
    same six classes; drift in either the class list or the time semantics fails a check rather than passing
    both. `DELETION_CLASSES`'s five-entry copy dies here.
18. **Before the boundary, `S0-6`'s gate is untouched.** Every existing `no-handoff`, non-receiver-signature
    and per-class negative still fails; retire-wins in both orders, one clock per stop, resume before/after
    destructive progress, the expiry floor and class-6 keep, and per-class idempotent resume still pass.
19. **The homes agree.** §14.4, §14.7, row 16 §9, PRD §6.9/§6.10, `S0-6/A-schemas.md` falsifier 11 and this
    record state the ratified rule, and a readback fails while any of them still publishes the superseded
    sentence — the `FU-07`/`FU-13` shape, refused here before it can recur.

### Consolidation owed at `S0-7`, composed with `S0-6`

- §14.7: the boundary half of *"it is the same stop"*; the unqualified *"keeps the bytes until the ceiling and
  no longer"*; the compromise paragraph's *"cannot delete before the deadline"* restated against the boundary.
- §14.4: *"bounded by the same deadline as everything else"* restated as the ratified rule.
- Row 16 §9 and PRD §6.9/§6.10 — Stage E owes the acceptance sentence in the deletion flow.
- The `retire` transition vector gains the acceptance field in its signed payload.
- `test/hostedRetention.test.ts`: the positive `lets nothing survive the deadline…` inverts to the ratified
  outcome, and falsifiers 11–19 land at Stage D.
- One deletion-authority domain across `generate-package-vectors.mjs` and the retention model (falsifier 17).

### What this reopening does not decide

- **`FU-03`** — what a `TerminalHandoff` transcript must carry is `S0-6`'s return; this boundary composes with
  whatever it selects and gets no weaker if the handoff gets stronger.
- **`FU-12`** — divergent-reseed branch composition, `S0-7` Stage A/D on its own track.
- **`C-8`'s lapse-side behavior** — deliberate, per §14.7, for a genuinely flapping subscription; only the
  claim's breadth and the missing lengthening-direction test are owed, at Stage D.
- **`D-31`**, still deferred on purpose; the workers, still `L-3`; the grace duration, still row 16 §9's open
  billing parameter.
