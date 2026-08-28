# `S0-7` Stage A — durable record schemas

**Standing:** home — sections here are pinned and swept by the authority map; read back by
`pnpm authority:check`.

**Status:** proposed for `S0-8` review · not implemented · the `EntitlementEvent` wire is gated on `D-31`

> **Amended 2026-08-29 at the `S0-7` return** (`FU-04`/`ST-02`/`A-06`/`E1`/`C-7`, and `FU-12`/`ST-07`; `P-4`
> ratified, option B with intrinsic acceptance). §1 gains the `deleted-without-receipt` terminal state; §3's
> gate table carries the destructive boundary — `retired_at + RETENTION`, written once at the `cause`
> overwrite — in place of the inherited ceiling that let a retirement be born already past it; §4 gains the
> durable branch set the divergent second survivor joins; §5's race keeps one clock while the boundary becomes
> the retirement's own; and the falsifier map continues at rows 19–26.

## 0. The naming rule, because the whole finding is a confusion of two axes

§13.5 gives the **lineage** three states: _never established_, _live_, _retired_. This machine gives **hosted
content** its own, and a lapsed workspace is `live` on the first axis and stopped on the second. The finding
exists because those two axes were being read as one.

So no state below may be spelled with a lineage word. There is no `live` retention state and no `retired` one,
deliberately: a reader who confuses them is the failure this is built to prevent, and a shared vocabulary is how
that confusion gets made in the first place.

## 1. `RetentionMark` — the machine, and the one clock

```
RetentionMark = LP("done/retention/v1") || LP(dec v) || LP(workspace_id) || LP(lineage_id)
                || LP(dec revision) || LP(hex prior_mark_digest) || LP(state)
                || LP(dec stopped_at) || LP(dec deadline) || LP(cause)
                || LP(hex ledger_digest)

  sig = Ed25519( the retention service's signing key ; RetentionMark )

  state ∈ 'hosted' | 'grace' | 'stopped' | 'clearing' | 'cleared' | 'deleted-without-receipt'
  cause ∈ 'none'   | 'entitlement' | 'retirement'
```

**The signer is not the lineage authorization key** (`P-4`). This service can stop hosting and cannot admit,
revoke, rotate or retire anything, and that separation is the entire bound on the trust it is being given.

| State      | Sync        | Clock       | What it means                                                          |
| ---------- | ----------- | ----------- | ---------------------------------------------------------------------- |
| `hosted`   | running     | none        | Ordinary operation                                                     |
| `grace`    | **running** | none        | An entitlement lapse is recorded and nothing has stopped yet           |
| `stopped`  | stopped     | **running** | Hosted synchronization has stopped. Every hosted byte is still present |
| `clearing` | stopped     | running     | Destructive progress has begun and the ledger is partway through       |
| `cleared`  | stopped     | done        | The class set for this `cause` is complete, every deletion authorized — for a retirement, receipt by receipt |
| `deleted-without-receipt` | stopped | done | A retirement's class set is complete and at least one class was erased at the boundary under the owner's accepted instruction — terminal, distinct from `cleared`, and never readable as handoff completion (the `S0-7` return) |

**`stopped_at` is written exactly once per entry into `stopped`**, under a compare-and-set on `revision`.
Concurrent writers do not each write one; the loser observes the written value and returns it, so a retry is
idempotent rather than a second clock. `deadline = stopped_at + twelve months` is computed at that same moment
and **never recomputed** — a deadline that can be recalculated is a deadline that can move — with exactly one
exception, moving one direction, once: the `cause` overwrite to `retirement` rewrites it as the retirement's
own destructive boundary (§3), and nothing recomputes it after.

**On resume, `stopped_at` and `deadline` are cleared with the same revision advance that returns the machine to
`hosted`.** A workspace that lapses again gets a new and strictly later clock. The invariant is _one clock per
stop_, not one clock per workspace forever, and the difference is testable: a second lapse whose deadline equals
the first one is an implementation that resurrected a clock instead of starting one.

**The clock does not move the machine — the ledger does.** Passing the deadline changes no state. It changes
what the ledger is _permitted_ to do. That is what makes the resume rule in §4 checkable rather than a matter of
timing, and it is deliberately generous: between the deadline and the first destructive act, every byte is still
there and a resume still restores all of it.

**Clients see these marks, and that is the disclosure PRD §6.10 requires.** _From that moment the devices stop
converging_ and _the deadline is this date_ are the mark's own fields rather than interface copy, so the thing
the user is told is the thing the service signed. A client that has seen `revision` n **rejects a mark at
revision ≤ n whose contents differ** — §13.5's ancestor rule at a second object, and the reason
`prior_mark_digest` is in the message.

## 2. `EntitlementEvent` — selected in shape, gated on `D-31`

```
EntitlementEvent = LP("done/entitlement/v1") || LP(dec v) || LP(account_id)
                   || LP(dec sequence) || LP(effect) || LP(dec effective_at)

  sig = Ed25519( the entitlement service's signing key ; EntitlementEvent )

  effect ∈ 'grace-begins' | 'sync-stops' | 'restored'
```

`sequence` is monotonic per account and an event that does not exceed the recorded one is refused, so a replayed
stop cannot re-stop a resumed account.

**`effective_at` is bound and is not the clock.** The retention machine timestamps its own transition; it never
copies this field into `stopped_at`. A biller with a wrong clock — or a compromised one — could otherwise
**backdate the deadline**, which is deletion earlier than promised dressed as bookkeeping. Binding a time and
refusing to enforce it is the same move §13.5 makes with `issued_at` and row 14 §5 makes with the freshness
window: the value is evidence, and the operation is what actually decides.

**What `D-31` still owes**: the exact field widths, the signer's key management, and whether `grace-begins`
carries a duration. What it does not owe is any of §1, §3 or §4, none of which depends on who initiates.

## 3. The deletion ledger — six classes, two causes

```
DeletionLedger = per (workspace_id, cause), one row per class:
                 class · state ∈ 'pending' | 'running' | 'done' · revision · at

  ledger_digest = SHA-256( LP("done/retention-ledger/v1")
                           || ( LP(class) || LP(state) || LP(dec at) )* ascending by class )
```

| #   | Class             | Holds                                                                    | `expiry` | `retire` |
| --- | ----------------- | ------------------------------------------------------------------------ | -------- | -------- |
| 1   | `primary`         | Accepted envelopes and hosted content objects (§16.3)                    | delete   | delete   |
| 2   | `replicas`        | Hosted replicas of those objects (§14.5)                                 | delete   | delete   |
| 3   | `checkpoints`     | Checkpoints, manifests, superseded checkpoints and their suffixes (§7.6) | delete   | delete   |
| 4   | `wraps`           | Per-generation content-key wraps to `R_pub` (§13.8)                      | delete   | delete   |
| 5   | `backups`         | Declared backups of any of the above (§16.4)                             | delete   | delete   |
| 6   | `recovery-anchor` | `R_pub` and the code-sealed `R_priv` envelope (§13.8)                    | **keep** | delete   |

**Class 6 is the whole difference, and PRD §6.10's reseed promise is why.** _A surviving device can later
re-seed the hosted workspace, wrap its current generation to the same recovery public key, and resume without
creating or confirming a new recovery code_ is only true if the anchor outlives expiry. So _keeping the right
things is as much of the assertion as deleting the rest_ (row 16 §9) stops being a note and becomes a class the
ledger refuses to touch.

**One class at a time, each advanced under the same revision compare-and-set as §1.** A partial run resumes at
the first class that is not `done`; it neither restarts nor over-deletes. The ledger and the mark cannot drift
apart, because `ledger_digest` is inside the signed mark.

**The gates differ because the causes differ** — and a retirement's boundary is **its own** (amended
2026-08-29 at the `S0-7` return; `P-4` ratified).

|           | `expiry`                    | `retire`                                                     |
| --------- | --------------------------- | ------------------------------------------------------------ |
| May begin | **not before the deadline** | as soon as a `TerminalHandoff` authorizes the class (`S0-6`) |
| Must end  | **by the deadline**         | **by the destructive boundary: `retired_at + RETENTION`, written once at the `cause` overwrite** |
| Authority | the mark's own clock        | a durable per-class handoff — or, at the boundary, the owner's intrinsic erasure acceptance, executed |

**The destructive boundary is written exactly once, at the `cause` overwrite, and is never earlier than an
inherited deadline** — `max(inherited deadline, retired_at + RETENTION)`, which collapses to `retired_at +
RETENTION` because a retirement cannot precede the stop it inherits. The pre-return rule let the retirement
inherit a lapse's elapsed clock, so it could be **born with its ceiling already past** — the `no-handoff`
refusal unreachable, every class deleted at the click instant with zero receipts — which is `FU-04`, the
strongest convergence across all seven challengers. A boundary computed from the retirement refuses that
reproduction for any positive floor.

**What closes the window is the owner's signed act, never elapsed time.** Every `retire` intent carries the
erasure acceptance in its signed payload — asking for deletion is accepting deletion, and a payload without it
is malformed, refused at creation. `S0-6` says a lost acknowledgement retains the bytes, because deleting data
somebody needed is unrecoverable; row 16 §5 says an unbounded retention is a defect rather than an omission.
Both hold in their own jurisdictions: a lost acknowledgement retains the bytes **until the boundary**, where
erasure executes the owner's instruction and terminates in **`deleted-without-receipt`** — a terminal state
distinct from handoff completion that no consumer of the mark or ledger can read as a receipt, with the audit
record still saying the handoff never completed rather than claiming it did.

**The ledger's subject is hosted content for one workspace.** Retiring the lineage itself — committing the
terminal record, propagating it, then removing the service's copies — is §14.4's own ordered sequence and runs
_before_ this. A gate cannot also be an item in the thing it gates.

## 4. Resume, and `ReseedSession`

```
ReseedSession = LP("done/reseed/v1") || LP(dec v) || LP(workspace_id) || LP(lineage_id)
                || LP(dec epoch) || LP(credential_id) || LP(dec generation)
                || LP(hex prior_head) || LP(dec retention_revision)

  sig = Ed25519( the seeding device's signing credential ; ReseedSession )
```

| Resume from           | Requires                    | Because                                                                 |
| --------------------- | --------------------------- | ----------------------------------------------------------------------- |
| `grace`, `stopped`    | nothing                     | Every hosted byte is present; there is nothing to rebuild               |
| `clearing`, `cleared` | a committed `ReseedSession` | The hosted copy is partial or gone and must not be presented as current |

**It is signed by a device, not by the service**, because what it asserts is what that device holds. And it
**names the lineage it continues**: `lineage_id`, `epoch` and `prior_head` are what make a reseed a _branch_.
§13.5's detection rule already forbids silently minting a replacement identity where a signed live head exists,
and a lapsed lineage is live — so treating an emptied hosted store as a never-established workspace is the
mistake this field exists to refuse.

**Two divergent survivors both reseed — as joins of a durable branch set, never as replacements** (amended
2026-08-29 at the `S0-7` return; `FU-12`/`ST-07`). Each presents its own `prior_head` against the same lineage
and epoch, and **acceptance records the branch durably**: the set of accepted prior heads is state, so the
second survivor — whose session is stale once the first advances the retention revision — is refused **with
its session held**, re-derives against the current revision, and is accepted *beside* the first. The
pre-return model had no branch state at all, so the two survivors were two isolated counterfactuals and the
compare-and-set would have refused the required second one with nowhere for its divergent content to go. The
branches converge exactly as PRD §6.10 already says they do: _the devices' replicas are the workspace, they
share an ancestor, and they merge._ The reseed does not choose between them and does not need to.

**`retention_revision` is how a reseed and a running deletion serialize.** A reseed naming a stale revision is
refused and rebuilt against the current one — the three-way rule row 15 already selected, at a third object —
and the refusal holds the session, never the content behind it. The derive-to-commit window runs under the
storage scheduler with a kill and a second writer inside (`test/storageSchedule.test.ts`).

## 5. The race, as one rule

**`cause` is set once with `stopped_at`. Retirement may overwrite `entitlement`; nothing may overwrite
`retirement`.**

That single rule gives both orderings without an arbitration table, and it composes with the one clock rather
than competing with it:

- **Retire, then lapse.** `cause` is already `retirement`. The entitlement event is recorded and changes
  nothing — not the state, not the clock, not the boundary, not the class set. A `restored` event is refused
  for the same reason: the lineage is terminal, and there is nothing to restore it to.
- **Lapse, then retire.** `cause` becomes `retirement`, the class set widens to include class 6, and the gate
  becomes the handoff. **`stopped_at` does not move** — the clock was already running and this is the same
  stop — while the destructive boundary is rewritten here and only here, once, as the retirement's own:
  `retired_at + RETENTION`, never earlier than the deadline it inherits (§3; amended 2026-08-29 at the `S0-7`
  return).

**Replayable, because the outcome is a function of the recorded `cause` rather than of arrival order.** Two
services replaying the same events in either order reach the same mark, and a replayed retirement finds
`cause` already `retirement` and recomputes nothing.

## 6. What this gives a compromised biller, stated as a bound

A second trusted signer is the cost `P-4` recorded rather than glossed, and this is its blast radius.

**It can** move the machine to `grace` and to `stopped`, denying hosted synchronization. Every device keeps
working locally, because nothing on the read or write path ever awaited a credential (PRD §6.10).

**It cannot** create terminal lineage — that needs a client-signed `retire` intent and the lineage
authorization key, neither of which it holds. It cannot delete before the deadline, because the floor is
computed by the retention machine from its own clock and not from `effective_at`. It cannot move a
retirement's destructive boundary in either direction: a backdated `effective_at` never becomes the clock, and
after `cause = retirement` every entitlement event is refused against the terminal lineage — including in the
order the challenge used, where its own lapse ran the clock out before the owner ever acted (the `S0-7`
return). And it cannot delete class 6, because the class set is selected by `cause` and its `cause` is
`entitlement`.

**So the attack is twelve months of loud read-only state ending in the deletion row 16 already promises**, with
the user's own devices intact and an independently held fidelity archive outside the deadline entirely (§9.3).
That is availability, not integrity, and it is a bound rather than a guarantee: a biller who can also suppress
the disclosure marks in §1 makes it quieter, which is why those marks are signed and version-ordered.

## Falsifier map

| #   | Falsifier                                                                              | Schema |
| --- | -------------------------------------------------------------------------------------- | ------ |
| 1   | **Two concurrent stop events produce one `stopped_at` and one deadline**               | 1      |
| 2   | Resume then lapse again yields a strictly later deadline, never the first one          | 1      |
| 3   | Passing the deadline changes no state; only the ledger does                            | 1, 3   |
| 4   | A lapse leaves the lineage **live**; only `retire` writes terminal lineage             | 1      |
| 5   | A client rejects a mark at a revision it has already passed                            | 1      |
| 6   | A backdated `effective_at` does not move the deadline                                  | 2      |
| 7   | A replayed entitlement event with a stale sequence changes nothing                     | 2      |
| 8   | **An expiry run deletes classes 1–5 and refuses class 6**                              | 3      |
| 9   | An expiry run that begins before the deadline is refused                               | 3      |
| 10  | A retirement run deletes a class only with a `TerminalHandoff` for it                  | 3      |
| 11  | A partial run resumes at the first class that is not `done`, without re-deleting       | 3      |
| 12  | **Nothing survives the deadline, whatever the cause, including an incomplete handoff** | 3      |
| 13  | Resume before destructive progress restores hosted sync with no reseed                 | 4      |
| 14  | Resume after destructive progress without a `ReseedSession` is refused                 | 4      |
| 15  | Two divergent survivors both reseed as branches; neither is genesis                    | 4      |
| 16  | A reseed naming a stale `retention_revision` is refused                                | 4      |
| 17  | **Retire wins both orderings, and the clock does not move when it does**               | 5      |
| 18  | A compromised biller cannot create terminal lineage or delete class 6                  | 6      |

The `S0-7` return continues the map (2026-08-29; `P-4` falsifiers 11–19, `FU-12`):

| #   | Falsifier                                                                              | Schema |
| --- | -------------------------------------------------------------------------------------- | ------ |
| 19  | **The reproduction fails: lapse, an elapsed deadline, then retire — every class refuses `no-handoff` at the birth instant with zero receipts, all six present** | 3 |
| 20  | Over arbitrary `stopped_at ≤ retired_at` pairs, in every order, no handoff-less class deletes before `retired_at + RETENTION` | 3 |
| 21  | The boundary is written exactly once at the `cause` overwrite, never earlier than the inherited deadline; a replayed retirement yields the same boundary | 3, 5 |
| 22  | **A ceiling erasure terminates in `deleted-without-receipt`, never `cleared`, and no reader of the mark or ledger derives a receipt from it** | 1, 3 |
| 23  | A `retire` payload without the erasure acceptance is refused at creation as malformed, and stripping it in transit breaks the intent's signature | 3 |
| 24  | The entitlement signer cannot move the boundary in either direction, in the order the challenge used | 5, 6 |
| 25  | **The gate and the retention model state the same predicate over the same six classes** — the published domain, §14.7's table and the model agree, and drift in the class list or the time semantics fails the build | 3 |
| 26  | **The divergent second survivor joins**: refused as stale with its session held, re-derived against the advanced revision, accepted beside the first — on the scheduler, with a kill and a second writer inside the derive-to-commit window | 4 |
