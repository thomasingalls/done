# Selection — TRD §15 row 16: hosted-content retention duration after a lapse

**Status:** selected, and folded into the PRD and TRD. **Date:** 2026-08-20
**Closes:** TRD §15 row 16 · **Scope of:** review 3b (protocol)
**Constrained by:** PRD §6.10, §7.11, §11 · TRD §13.8, §16 · **Stage:** [sequencing.md](../sequencing.md) §3.1
**Check:** [`scripts/check-retention.mjs`](../../scripts/check-retention.mjs), run by `pnpm check`
**Companions:** [row 7](./row-7-checkpoint.md) and [row 6](./row-6-antireplay-retention.md) hold every _other_
retention in the design, and none of them is a duration; [row 10](./row-10-portable-package.md) is the artifact
that does not inherit this deadline.
**Amended by:** [`S0-7`](../review/remediation/S0-7/README.md) (2026-08-27) — the clock gains the machine it was
selected without. TRD §14.7 carries the lapse state, executes the deletion as a six-class ledger, and makes the
deadline a **floor** on expiry deletion as well as a ceiling on both causes.

---

## The selection

```
Duration   12 months of hosted-content retention after a lapse.

Clock      Starts when hosted synchronization stops -- the end of the grace
           period, the moment the account goes read-only. The grace period is
           not deducted from it.

Both ways  A FLOOR on the promise: a pricing model may offer longer, none may
           offer shorter.
           A CEILING on the data: at expiry the hosted ciphertext and its
           per-generation wraps are deleted. Not "at least 12 months".

Covers     One number for two paths, because both are gated by one artifact:
             - how long resuming restores the hosted history
             - how long service-hosted total-device-loss recovery is possible

Survives   R_pub and the code-sealed R_priv envelope, so a surviving device
           re-seeds the hosted workspace without a new code ceremony (PRD 6.10).

Condition  Arises if a lapse can exist at all. That binary is taken. The price
           is not, and no sentence anywhere depends on it.

Machine    TRD 14.7 (S0-7). One clock, created by whichever event stops hosted
           synchronization and never recomputed. A six-class deletion ledger
           whose CAUSE decides whether the recovery anchor survives: expiry
           keeps it, retirement does not. The deadline is a FLOOR on expiry
           deletion and a CEILING on both causes.
```

Everything below is why, and what it cost.

---

## 1. The condition was on a larger question than the row needs

§15 filed this row as conditional on PRD §11 question 1 — _what does hosted sync cost, and how should it be
priced?_ — which is deferred, blocks nothing, and which no sentence in the PRD may be written to depend on.
Read that way the row cannot be taken at all until a business model exists.

**But the row does not need question 1's answer. It needs one bit of it.** Question 1 asks what the plan costs;
this row asks only whether a lapsed-but-retained state can exist. Those separate cleanly: _some paid plan will
eventually exist, so a lapse can happen_ is a binary with no number in it, and answering it leaves every pricing
sentence in question 1 exactly as deferred as it was.

**So the deferral was inherited rather than argued**, and this is the fourth row in the scope whose apparent
question was not its real one — after row 12's missing secret, row 15's class-not-an-operation, and row 5's
three candidates that were two. The pattern is consistent enough now to be worth stating as a habit:
**when a row is filed as conditional, check whether it is conditional on the whole of the thing it names.**

**What stays deferred.** Whether hosted sync is free, paid, bundled or metered; what it costs; what the grace
period is. This row touches none of them and none of them moves the number, because the number is not argued
from cost.

---

## 2. This is the only clock in a design made of positions

Worth putting the retentions side by side, because seeing them together is what explains why this one is
different in kind rather than merely open.

| Retention                         | Held by      | Bound                                                       | Selected in  |
| --------------------------------- | ------------ | ----------------------------------------------------------- | ------------ |
| A device's own outbound envelopes | device       | back to the **second-newest** admitted checkpoint           | row 6        |
| Each checkpoint's suffix          | store        | that checkpoint's **head vector forward**                   | row 6        |
| The local head vector             | device       | **a mark, not a log** — one `(seq, link)`                   | row 6        |
| Checkpoints                       | store        | **two**, and never one whose generation another still needs | row 7        |
| Attribution claims                | content root | until §4.5's compaction retires the claim                   | row 8        |
| **Hosted content after a lapse**  | **service**  | **12 months**                                               | **this row** |

**Every other retention in the system is positional.** It is decided by the protocol, checkable from the
artifacts themselves, and needs no clock and no agreement about one. Row 6 made that explicit in its sharpest
sentence — _a mark, not a log_ — and row 7's _two_ is the same move at a different object.

**This row is the only one measured in time, and that is exactly why pricing can touch it and can touch nothing
else.** A position is decided by what the protocol needs; a duration is decided by a human circumstance and a
commercial one. It is also why **no construction can dissolve this parameter the way row 14 §5 dissolved the
freshness window.** There the five-minute timer was an approximation of _this assertion was collected for this
operation_, so binding the operation directly removed the number. Here there is nothing the number approximates.
PRD §6.10 requires a stated one, because _retained_ without one is a promise nobody can plan around — so the
number has to be argued from the failure it protects against, and that is §4.

**And a duration needs something to hold it, which this row selected without** (`S0-7`). Every positional
retention above is held by an artifact that already exists — a mark, a checkpoint, a head vector. This one was
held by nothing: the row said _the clock starts when hosted synchronization stops_ and no selected object
recorded that it had. Row 15's grammar could not say it either, so the two rows between them credited a state
neither carried. **TRD §14.7 is the artifact**, on a second axis from the lineage and under a signer that is not
the lineage key, and with it the number becomes a field of a signed record rather than a sentence about one.

---

## 3. Why one number and not two

PRD §6.10 asserts that resumption and total-device-loss recovery share a number. It does not say why, and the
reason is worth writing down, because _two numbers_ is the obvious efficiency and it is a false one.

**Three things are retained together** (§6.10): the hosted ciphertext, every needed content-key wrap to the
recovery public key, and the recovery private key sealed to the saved code.

- **Resuming** needs the ciphertext.
- **Total-device-loss recovery** needs all three.

**The ciphertext is the only expensive one.** The wraps are bytes per generation and the sealed envelope is one
small record. So a shorter recovery window buys nothing: deleting the wraps early while keeping the ciphertext
saves no storage worth naming, and it produces precisely the state §6.10 names as unacceptable — the service
holding the user's bytes and unable to give them back. And a shorter _resume_ window than the recovery window is
worse still, since it would refuse to restore history to a paying customer that it would still hand to someone
recovering from scratch.

**So the two windows are not independent quantities that happen to be equal.** They are one retained artifact
described twice, and the second promise is free once the first is made. Two numbers would be two things to
explain, two things to state at the moment sync stops, and one of them would be a fiction.

---

## 4. The number, argued from the failure rather than chosen

**The scenario this exists for is conjunctive**, and saying it out loud does most of the work: _payment lapsed,
**and** every device is gone._ Someone in that state is, by construction, not reading email from a service they
stopped paying.

**What expiry actually destroys** is narrower than "your data" and §6.10 already enumerates it: the
service-hosted total-device-loss recovery path, and the gap held by any device that was offline across the whole
lapse. Everything else survives — the devices' replicas are the workspace, they share an ancestor, and they
merge on resumption.

**The asymmetry is the whole argument.** A shorter number optimises storage the service cannot read, against a
loss that is total and permanent. The retained artifact is ciphertext under a key the service never holds
(§13.2), so what a long retention costs is bytes and a promise to honour — not the accumulation of readable
personal data that the rest of §16 is shaped to prevent. **That distinction is what makes a year defensible in a
design that otherwise deletes aggressively**, and it is the one place the privacy posture and the safety posture
point in opposite directions.

**Why not longer.** Beyond a year the marginal protection falls off rather than the cost rising: a workspace
nobody has touched for twelve months either has an independently held fidelity archive (§9.3, row 10) or it does
not, and another six months does not change which. The archive is the escape hatch and **it does not inherit
this deadline** — that is stated in §6.10 already and is what bounds the whole question.

**Why not shorter.** 90 days is the option most likely to expire during exactly the distracted interval the
recovery path exists for. It is the number that would be chosen by looking at the storage line rather than at
the failure.

**The honest status of the figure.** This is a judgment, not a measurement, and there is nothing to measure yet
— PRD §11 question 1's list of what to instrument when there are users is the closest thing, and none of it
bears on this. What makes it defensible is that it is argued from the failure it protects against rather than
from a cost model, and **that it is falsifiable in one direction**: if a real lapse-and-total-loss recovery ever
arrives past the deadline, the number was wrong and the evidence comes with the incident. That is a worse way to
learn it than a measurement and it is the only one available.

---

## 5. A floor alone would have been a defect, so it is a ceiling too

The decision was taken as _a floor a pricing model may lengthen and may not shorten_, which is right about the
promise and, **taken alone, wrong about the data.**

A retention stated only as a floor is unbounded above, and §16.6 calls an unbounded retention a defect in as many
words — every row's deletion event has to be exercised rather than asserted, and there is no deletion event in
_at least twelve months_. The inventory would carry a row whose retention column could not be checked against
anything.

**So the number fixes both directions, and they are different claims about it:**

| Direction   | What it binds                                                                        | Who it protects                                      |
| ----------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| **Floor**   | A plan may offer longer retention; none may offer shorter                            | The account holder, against the product              |
| **Ceiling** | At expiry the ciphertext and wraps are **deleted**, not merely eligible for deletion | The account holder, against the service accumulating |

This is the row's one genuine correction to the framing it was handed, and it costs nothing to take: the same
twelve months serves as both, and the inventory gets a value it can be tested against.

---

## 6. What the clock starts on, which is not the missed payment

**Retention runs from the moment hosted synchronization stops** — the end of the grace period, when the account
goes read-only — and the grace period is not deducted from it.

The alternative, running it from the failed payment, would let grace eat the retention, which contradicts
§6.10's own instruction that retention should outlast the grace period. It would also make the number depend on
a billing parameter this row deliberately does not take.

**And the event it is measured from is the event the user is told about.** §6.10 already requires something be
said out loud when sync stops — _from that moment the devices stop converging, and each one's edits are its
own_. The retention deadline belongs in that same sentence, because a duration measured from an event nobody
observes is not plannable, and plannable is §6.10's stated requirement rather than a nicety.

---

## 7. What can be machine-checked about a number, and what it found

**A duration has no vectors.** There is no construction to reproduce, no negative to fail, and nothing for
`pnpm vectors:coverage` to elide. Row 17 is the precedent — the only other row in the register whose artifact is
not a vector file — and its answer was that _repeatable_ is the word doing the work, so the profile is generated
and self-checking rather than written.

**What a number has instead is copies**, and this project has now been bitten twice by a fact stated in two
places: row 1's `algorithm-suite.json` published a superseded library, and its deferral entries named rows that
had since been answered. The recorded tell is exact — _a generator holding a string that describes a state
somewhere else_ — and the recorded fix is always to read the somewhere else.

So the check is [`scripts/check-retention.mjs`](../../scripts/check-retention.mjs), and it does three things —
the third added by [`S0-7`](../review/remediation/S0-7/README.md), which is the one `RC-7` says was missing.

**1. The duration is stated once and agreed everywhere.** It reads every hosted-retention duration stated in the
PRD and the TRD and requires them to be the same number, and that number to be this row's. A future edit that
changes §6.10 to six months and leaves §16 at twelve fails the build rather than reaching a reviewer.

**2. Every `unselected` cell in §16 is bounded, and none points at a closed row.** This extends the audit row 1
already has — `checkCoverage` reads §15.1 out of the TRD rather than trusting an owner string — from the suite's
deferral entries to the data inventory, where [sequencing.md](../sequencing.md) §3.7 and §16.6 both already
require it and nothing was enforcing it.

**It found four stale cells immediately**, which is the argument for having written it: §16's preamble named
rows 7 and 16 as the open retention durations, the acceptance-evidence row pointed at rows 5 and 7, and both
checkpoint rows pointed at row 7. **All of those rows are selected**, and rows 5, 6 and 7 answered them
positionally — _two checkpoints_, _that checkpoint's head vector forward_, _a mark, not a log_. Row 6 had gone
further than a retention: the acceptance-evidence row still described a per-credential accepted-set **log**, and
row 6's selection replaced the log with a mark. **A stale pointer is the small version of that finding; a data
class the design has since deleted is the large one**, and it was sitting in the inventory a reviewer reads.

**3. The lapse carrier and the transition grammar stay disjoint** (`S0-7`). `RC-7`'s diagnosis of this row's
half of `f-4259822-lapse-transition-kind-missing` is precise about the mechanism: _two independent checkers each
pass because neither cross-checks the policy state against a durable transition._ That was exactly true. Row
15's grammar had a checker, this row had a checker, and the state they jointly claimed to cover existed in
neither. The third check is the one that would have caught it:

- **No transition kind may name a retention state, and no retention state may be spelled with a §13.5 lineage
  word.** The kinds are read from `test/vectors/transition.json` — the generator's own output rather than a
  string describing it — and the states from §14.7's table. A future `lapse` kind, or a state renamed `retired`,
  fails the build with the decision it would be reversing.
- **§13.7's count and the generator's must agree.** _One protocol at three kinds_ against a published list of
  three. A grammar that grows without the document saying so is how a lapse kind arrives unreviewed.
- **§14.7's tables and the executable model must agree.** `pnpm vectors:check` compares a generator to its
  vector and never a document to either, which is the shape of row 4's stale carrier registry and of this
  finding too. A state or a deletion class in `test/hostedRetention.test.ts` and not in §14.7 means one of them
  describes a machine that does not exist.
- **Expiry must keep exactly one deletion class, and it must be the recovery anchor.** PRD §6.10's _re-seed
  without creating or confirming a new code_ is true only while that holds, and it is one table cell away from
  not holding.

**And it found that §16.6's own rule was already false.** The rule says each `unselected` occurrence points at
the §15 row that closes it — and four cells name no row at all, because a metrics retention, a log retention, a
backup retention and a support-material retention are bounded by a deployment choice rather than by a selection.
The rule was true of the rows it was written beside and false of the table as a whole. **So `unselected` now
carries its kind** — pending a §15 row, or pending deployment — and the check enforces that every cell declares
one and that a §15 pointer names a row §15.1 does not list. This is row 17's A4 finding a second time: a control
written as true in spirit with no address in fact, refused by the generator until it named one.

---

## 8. What it costs

| Cost                                                 |                                                                                                                                                                  |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One binary taken early                               | _A lapse can exist_ is now assumed. If hosted sync is never priced, §6.10 and this row are dead code in the requirements rather than wrong — the cheap direction |
| A promise that has to be honoured                    | Twelve months is now a commitment the service must be built to keep and to _execute_, and §16.6 requires the deletion be exercised rather than asserted          |
| A number with no measurement behind it               | §4 is honest about this; it is argued rather than measured, and no measurement exists to be had yet                                                              |
| Grace and retention are now coupled in one direction | Whatever the grace period becomes, retention starts after it. That is a constraint on a billing parameter, placed by a safety one                                |

**What it does not cost.** No protocol field, no key, no format, no client change. The number is a service
policy and a sentence in the interface; nothing in §6, §7 or §13 moves.

---

## 9. What is still open, and what Stage 4 owes

- **The grace period's own duration is not this row's**, and stays open. It is a billing parameter; the only
  constraint placed on it here is that retention starts when it ends.
- **The disclosure copy.** §6.10 requires the number be stated, and the moment to state it is when sync stops.
  That belongs with PRD §11 question 11's destructive-confirmation copy — the same problem of saying what is
  actually at stake without either alarming or soothing.
- **The deletion is a test, not a policy.** §16.6 and PRD §7.11 both require the deletion event be exercised;
  expiry deletes hosted ciphertext and wraps while keeping `R_pub` and the sealed envelope, and _keeping the
  right things_ is as much of the assertion as deleting the rest. It belongs with §11.4's generated deletion and
  export tests. **`S0-7` turned that from a note into a class the ledger refuses to touch** — class 6 — so what
  Stage 4 owes is the worker, not the rule.
- **Whether a user-initiated deletion deserves a shorter backstop is open** (`S0-7`; `P-4` ratified). §14.7
  gives a retirement a destructive boundary of its own — `retired_at` plus this row's twelve months, written
  exactly once at the `cause` overwrite and never earlier than an inherited deadline — because the alternative,
  a retirement whose survivor never appears, is an unbounded retention against the owner's own request. Twelve
  months is the number that was already there, and using it was the conservative move rather than an argued
  one; the question stays safely open, because under the ratified rule **any** positive backstop refuses the
  born-elapsed reproduction. A shorter backstop for deletion the user asked for is defensible and would mean a
  **second duration**, which §3 argues against on grounds that were about lapse and resumption. Those grounds
  do not obviously carry, and nobody should read §14.7 as having decided it.
- **The composition with retirement's gate was owed and nobody was holding it** (`S0-7`). `S0-6` selected _a
  lost acknowledgement retains the bytes_, and this row selected _at expiry the copy is deleted_. In different
  sections those are both right; composed, a retirement whose survivor never appears retains bytes forever under
  one and twelve months under the other. §14.7 resolves it by **changing the authority rather than the clock**
  (`P-4`, ratified 2026-08-28; landed at the `S0-7` return): every retire intent carries the erasure acceptance
  in its signed payload, the boundary is the retirement's own, and an erasure the boundary executes terminates
  in `deleted-without-receipt` — the bytes bounded, the audit record still saying the handoff never completed,
  and elapsed time never the authority.
- **Nothing here waits on review 3b**, and 3b should be told that this row was taken on a binary rather than on
  question 1's answer, so a reviewer who reads the register's old conditionality is not left wondering what
  changed.
