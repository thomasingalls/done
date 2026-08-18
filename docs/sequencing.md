# done — Implementation Sequencing

**Status:** The ordering is a proposal. **The three decisions in §5.1–§5.3 are taken** and reflected below;
the cutover-attribution choice in §5.4 remains open and gates Stage 2.
**Date:** 2026-08-17
**Companion to:** [PRD.md](./PRD.md), [TRD.md](./TRD.md)
**Current position:** [progress.md](./progress.md) — this document does not say which stage is running.

---

## How to read this

**This is a dependency order, not a priority order.** PRD §10's phases say what matters most. This says what
has to exist before what, where the order is forced rather than chosen, and where waiting costs more than
working. There is one place where the two disagree, and §3.4 argues for taking the disagreement.

**Most of the ordering is not a decision.** §5.1–§5.3 record three answers that were the author's to settle and
are now load-bearing: they fix what *ships* means, split the design review in two, and consciously pass one
deferred change's only cheap window. §5.4 records a fourth question that remains open and names exactly what it
blocks. Everything else is a proposal about sequence and dependency.

**No durations.** There is no basis for any, and inventing them would make an ordering look like a schedule.
What this asserts is sequence and dependency.

**This document says what has to happen before what. It does not say where the project is.** Every stage
below is written as a body of work with an exit condition, in a fixed order, and none of it changes when the
project moves — which is exactly why it must not carry current status. **Stage 0 was called "Now" in an
earlier draft**, and that was a trap: "now" is true on the day it is written and false immediately after,
with nothing in the document to say so. The active slice lives in [progress.md](./progress.md), which is
rewritten wholesale rather than amended; what has closed lives in [completed.md](./completed.md).

**References and precedence:** `TRD §x` and `PRD §x` resolve to those documents. A bare `§x` is this one.
`docs/sessions.md` is the earlier product-and-architecture decision history; `docs/decisions.md` is the
implementation decision journal; §5 here is the record for the later sequencing decisions and cutover choice. Their current consequences are propagated into the PRD and TRD. If a
record and the requirements disagree, the PRD and TRD state what is currently true and the record preserves the
reasoning to revisit.

---

## 1. Where the code is today

Checked against the tree rather than remembered.

**This section is a dated snapshot, and it is the one part of this document that decays.** It is kept
because the ordering below is argued *from* it — the stages are justified by what already exists and what
does not — so removing it would leave the reasoning unsupported. Read it as of this document's date. For
what is true now, see [progress.md](./progress.md) and [completed.md](./completed.md).

**Built and working.** The editor: live preview, card decorations, static render, the geometry tests that keep
them pixel-identical. The workflow: cards, collections, movement, the cap, freeze, the canonical card registry,
the membership repair, compaction (safety-paused by design). The shell: spatial navigation, three breakpoints,
gestures, card reorder. Attribution: actors, origins, origin-scoped undo. Export. Goals: scroll-aware breadcrumb
and a view-only outline. The PWA shell. A relay in its development shape. A property-test fleet of N stores
around a relay hub, with generated schedules of edits and partitions.

**Partial, in ways that matter for what follows.**

| Area | State |
| --- | --- |
| Sync | Works, and occupies no supported configuration: shared bearer token in a query string, plaintext `Y.Doc` on the relay, three fields typed by hand on each device |
| Goals projections | Breadcrumb and outline exist; focus, folding and archive do not |
| Performance budgets | `scripts/check-budget.mjs` enforces **one row** — initial JS, build-failing. Every latency row in TRD §12 has no harness at all |
| Property fleet | Opens whole stores but with `persist: false`, so **the persistence layer is not exercised by any property test** |

**Absent entirely.** Import. Principal, local user slot, and per-workspace store keying. Any encryption. The
account and authorization services. The envelope protocol. A content-blind durable store. The device list.
Recovery. The search index.

**Dependencies present:** `yjs`, `y-indexeddb`, `y-websocket`, `y-protocols`, `y-codemirror.next`, `lib0`,
React, CodeMirror. **No SQLite. No cryptography library.**

---

## 2. What fixes the order

### 2.1 Three one-way doors, and they share a date

**The first real deployment is the date.** Everything that changes what is written to disk is cheap before it
and expensive after, because after it there is data belonging to someone who is not the author, and changing
on-disk shape then means a migration written under pressure.

TRD §14.6 already makes this argument for one item. It applies to two more:

| Change                                        | Before the deployment                                  | After                                        |
| --------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| Store keyed by _(principal, workspace)_       | Free — a new install has nothing to rename              | A store-rename migration, run on open        |
| Content encryption at rest                    | Free — the clean cutover **is** the migration, whichever carrier §5.4 selects | The in-place conversion state machine        |
| Root-type day collections (TRD §10.8)         | Two of its four costs never arise                       | All of them, forever                         |

**This is a deadline, not a priority.** None of these makes the product better for the author on the day it
lands. What they buy is the absence of three migrations, and that is only purchasable once.

### 2.2 One long pole, and it is calendar time rather than work

Levels 1–3 gate network sync, and **level 3 is an independent protocol design review by someone outside the
project.** Booking it, waiting for it and answering it is elapsed time that working harder does not compress.
TRD §13.11 adds that each review waits until its own TRD §15 scope is closed, because reviewing an architecture
alone buys an opinion about a sketch.

So the single highest-leverage scheduling act is **starting TRD §15's review-scoped selections immediately**, so
each review is in flight while the corresponding implementation happens rather than beginning after it.

### 2.3 TRD §15 has four scopes

The twenty-one rows are not one body of work. **Two scopes feed reviews; one is empirical; one is the
cutover choice.**

| Scope             | TRD §15 rows                                      | Needed for                            | Blocks                                      |
| ----------------- | ------------------------------------------------- | ------------------------------------- | ------------------------------------------- |
| Storage review 3a | 1, 2, 3, 13, and the storage-facing part of 14    | Local encryption and journal design   | Rows 1–3 block Stage 1; closed scope and review 3a block Stage 2 |
| Protocol review 3b | 4–12, 15–17, 20, and the network-facing part of 14 | The service and the wire              | Closed scope and review 3b block Stage 4    |
| Empirical         | 18, 19                                            | Search persistence and root-type trigger decisions | Their stated measurements or triggers only |
| Migration         | 21                                                | First-deployment attribution carrier   | Stage 2                                     |

**That split had a consequence, and §5.2 has resolved it.** The synchronous journal AEAD is row 2, it is the
only new primitive in the plan (TRD §10.10), and it ships in Stage 1 — well before network sync. "Levels 1–3
before network sync ships" therefore did not cover the one construction the review most needs to see, at the
time it lands. **The review is now split in two**: a narrow storage-and-journal review answered before Stage 2,
and the full protocol review answered before Stage 4. Rows 18, 19 and 21 enter neither review.

### 2.4 What is genuinely independent

Four bodies of work touch neither the on-disk shape nor the protocol, and can land at any point:

- **Import** and its freeze-and-cap placement (TRD §9.2). Stage 2 needs it; nothing blocks it.
- **The in-memory search index** (TRD §6.2) and the command palette over it.
- **Presence corrections** — deduplicate the peer list by device id, distinguish the active caret (PRD §5.5,
  PRD §5.6). Small, and the first is a live defect: the list says `Mac, Mac`.
- **Durability disclosure copy** (PRD §7.10).

---

## 3. The stages

| Stage                    | PRD §10 phase          | What it is                                                    |
| ------------------------ | ---------------------- | --------------------------------------------------------------- |
| **0. Select, measure, book** | —                  | Selections, the latency baseline, and booking both reviews     |
| **1. On-disk shape**     | 2, and part of 3       | Everything that changes what is written to disk                |
| **2. Cutover**           | between 2 and 3        | The first real deployment                                      |
| **3. Retrieval**         | 4, **brought forward** | Search, palette, the unbuilt Goals projections                 |
| **4. The service**       | 3                      | Accounts, keys, envelopes, relay, devices, revocation          |
| **5. Continuity**        | —                      | Fidelity archive, migration, the independently runnable package |
| **Continuous**           | —                      | Assurance                                                      |

### 3.1 Stage 0 — select, measure, book

Three things, none of which is application code, all of which get more expensive the later they start.

**Select TRD §15's storage-review scope.** Rows 1, 2 and 3 are what Stage 1 cannot begin without: the algorithm suite,
the synchronous journal AEAD **and its nonce discipline**, and the encrypted record format. Row 2 is the one to
spend real thought on — a counter-based nonce whose last value was not durably recorded can repeat after
exactly the crash the journal exists to survive.

**Draft TRD §15's protocol-review scope.** It blocks nothing here, and it is what the reviewer needs.

**Build a latency harness and take the baseline while the store is still plaintext.** Today the budget script
enforces initial JS and nothing else; keystroke → paint, cold start, warm start and content-root load have no
harness. TRD §12 already names cold start as the budget at risk, since it will absorb a key-store read, an
unseal and per-record decryption. **Without a recorded baseline, a regression from the encrypted store is both
invisible and unattributable**, and the budget conversation afterwards has nothing to argue from.

**Book both design reviews** (§5.2). Lead time is the constraint, not readiness, and there are now two
engagements with different scopes and different deadlines:

| Review                          | Scope                                                                        | Answered before |
| ------------------------------- | ------------------------------------------------------------------------------ | --------------- |
| **Storage and journal**         | The record format, the key hierarchy's local half, and the synchronous journal AEAD with its nonce discipline | **Stage 2**     |
| **Protocol**                    | Authorization, key delivery, envelopes, epochs, rotation, recovery, downgrade | **Stage 4**     |

The storage review reads the construction selected here, so it can be booked now and answered while Stage 1 is
being implemented. It gates **cutover** rather than Stage 1 itself: a defect found during Stage 1 costs a
rework, whereas the same defect found after Stage 2 has written the first deployment's data under a broken
construction — and a nonce-reuse fault is retroactive, so ciphertext already written stays broken. The author's
own development data inside Stage 1 is the accepted exposure.

**Exit:** rows 1–3 selected with test vectors; a latency harness with recorded plaintext numbers; **both**
reviewers engaged, with the storage review's date inside Stage 1.

### 3.2 Stage 1 — everything that changes what is on disk

The work, in an order chosen so that the riskiest change arrives alone and reviewable:

1. **Store handles replace the module constant.** Thread a handle through everything that reaches for
   `DB_NAME`. No behaviour change, no cryptography, and the largest mechanical diff in the client.
2. **The local user slot index.** A device-local store, scoping, and enumeration through the index rather than
   `indexedDB.databases()` — a name guessable from a workspace identifier would let a picker enumerate by
   construction (TRD §6.5).
3. **The key store.** `L_local` as a structured-cloned non-extractable key; `K_g` sealed under it as bytes;
   domain-separated subkeys.
4. **The encrypted content store**, replacing `y-indexeddb`: the load path, the record store, and the trim.
5. **The encrypted journal** and its synchronous AEAD.
6. **Start-up order inversion:** keys → journal replay → content records → transport.
7. **Import**, outside the freeze, outside the cap, attributed to the system actor.

**Items 3–6 are one change and should land together.** You cannot ship 4 without 3, and 5 without 6 produces a
journal nobody can replay.

**The risk is concentrated in 4 and 5**, because a defect there loses data silently, and it will not be caught
by what exists. **The property fleet runs with `persist: false`** — it wires up the membership repair, undo and
awareness, but never touches the store — so the whole suite will keep passing whatever the encrypted store
does. Two things follow: the encrypted store needs its own tests (TRD §11.1), and it is worth adding a
`persist: true` variant of the fleet so that convergence and the encrypted round trip are exercised together.
The harness already takes the flag, so this is cheap.

**Exit:** a profile snapshot after ordinary use yields no recognizable content in any store, at genesis and
after; two workspaces open on one device with no cross-writes on any path including teardown and error; a
ten-day export imports into a clean store with **every** day present; the latency harness shows the budgets
holding, or shows a number the budget has been consciously revised to.

### 3.3 Stage 2 — cutover

Small, one-way, and named separately because it is where §2.1's deadline actually falls.

Use the carrier selected in §5.4 to move from the development installation into the first real deployment —
Markdown export/import if system attribution is accepted, the fidelity archive otherwise — and turn the old relay
off. Then the versioning and upgrade story, built preventatively rather than at the first incompatible change.

Two things must be true before this runs. **Stage 1's on-disk shape must be final**, because this is the moment it
stops being free to change. And, if §5.4 selects Markdown as the carrier, **import must not be gated by the
freeze**, or a ten-day export silently loses everything older than three days.

**And one thing has to be decided rather than discovered: the Markdown cutover re-attributes the entire
pre-deployment history to the system actor** (§5.4). The export carries card bodies and nothing the app tracked —
no `id`, no `author`, no `origin`, no `createdAt` — and import is a system write. **Stage 2 must not begin until
the choice in §5.4 is recorded; it gates this cutover and neither design review.**

**Exit:** daily use is on the new installation with encrypted stores; the development relay is off.

### 3.4 Stage 3 — retrieval, brought forward

**This is the one place the dependency order disagrees with PRD §10's numbering, and the disagreement is worth
taking.** Retrieval is Phase 4, after the service at Phase 3. There is no technical dependency in that
direction — the in-memory index needs nothing from sync — and Stage 4 has a review-shaped hole in the middle of
it during which nobody can usefully write service code.

So while the design review is out: search over the master list and recent days, the command palette, and as
much of Goals' unbuilt projections (focus, folding, archive) as earns its place.

**The PRD's phase numbers are a statement about what matters, not a schedule.** Doing this earlier reorders no
priorities; it fills time that would otherwise be spent waiting. The index is in memory, rebuilt lazily off the
cold-start path, and measurement of that rebuild is what later decides whether a persistent encrypted index is
needed at all (TRD §15 row 18). **That later empirical choice gates neither review 3a nor Stage 2 cutover.**

### 3.5 Stage 4 — the service

The largest stage, and mostly indivisible: **you cannot ship a device list that cannot revoke.**

Internal order, each item needing the one before:

1. **Account service, authenticator, and the device-local slot verifier.** Account creation is the entry point.
2. **Recovery keypair and the code ceremony.** At account creation, not later — it is the first thing the user
   meets, and there is no account without it.
3. **Authorization lineage, first signed head, genesis checkpoint, promotion.**
4. **Device signing and wrapping credentials**, both persistence tiers, with the tier shown in the UI.
5. **Envelope layer, relay rewrite, content-blind durable store, checkpoints and manifests.** Relay transport is
   ephemeral; the durable hosted ciphertext is the retained recovery source while its retention window survives.
6. **Enrollment's two gates** and whichever ceremony TRD §15 row 11 selects.
7. **The device list.**
8. **Rotation, revocation, acceptance evidence, and the finalization boundary.**
9. **Sign out / remove / reset**, the workspace picker, provenance mode for cards.

**Two internal milestones, because they are where you learn things.** *First ciphertext round trip* (after 5):
one device writes, the relay stores an opaque envelope, the same device reads it back — the moment the relay
stops understanding the content. *Two devices converging* (after 6): the phone-and-laptop case, which is the
whole point.

**Neither milestone is a ship boundary.** A device list that cannot revoke is worse than no device list, and
revocation is not honest until 8.

**And neither waits on the protocol review, because §5.1 has defined what *ships* means.** The author
synchronizing his own devices through his own service is development. The gate binds at the first byte of
anyone else's data — a bounded test audience included — and at any public description of the security
properties. So milestones 5 and 6 are reached, and dogfooded, while the review is still out; what waits for the
answer is exposing another person to it.

**One reuse worth planning for.** `test/replicas.ts` already builds a fleet around a relay hub that holds a
replica of its own. TRD §11.2's hostile-relay tests need exactly that shape with the relay able to misbehave —
withhold, reorder, deliver late. Extending `relayNetwork()` is far cheaper than a second harness.

**Exit:** PRD §10's Phase 3 exit — phone and laptop consistent across a week including offline edits on both,
and a week of daily use without falling back — plus TRD §11.2's conformance tests.

### 3.6 Stage 5 — continuity

The fidelity archive; the migration and cutover machinery; the independently runnable package; TRD §11.3's nine
tests.

**Tests 1–3 are cheap and detachable.** Tests 1 and 2 are close to free today — start the installation with the
origins unreachable, and export and read the result with ordinary tools. Test 3 lands with import in Stage 1.
Tests 4–9 are the serious program and depend on Stage 4.

Claims are gated by their own tests and nothing else. An open repository is evidence of availability, not of
buildability.

### 3.7 Continuous — assurance

**"Ships" means the first deployment that carries data belonging to anyone but the author** (§5.1) — a bounded
test audience counts — **or any public description of the security properties.** The author's own multi-device
dogfooding is development and precedes every gate below. The as-built data review is a separate and later gate,
at wider availability (PRD §7.11).

| Level                                     | When                                                                          |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| 1 — threat model, conformance tests       | Written alongside Stages 1 and 4; the tests are TRD §11                       |
| 2 — web-security baseline                 | Profile selected in Stage 0; verified before Stage 4 ships                    |
| **3a — storage and journal design review** | **Booked in Stage 0, in flight through Stage 1, answered before Stage 2** (§5.2) |
| 3b — protocol design review               | Booked in Stage 0, in flight through Stage 3, answered before Stage 4 ships    |
| 5 — disclosure and response program       | Live the day Stage 4 ships. A reporting path that does not exist when the first report arrives is the cheapest thing to get wrong |
| 4 — implementation audit                  | On trigger: *end-to-end encrypted* in marketing copy, or the escrow add-on holding a real key |

**The service data inventory runs alongside all of it, and is not a review-time task.** TRD §16 already carries a
row for every store, queue, log, backup and processor its architecture introduces. Stage 4 adds rows as it makes
each one real and moves them beside the definitions that make them true; Stage 5 does the same for the durable
store and the archive. The as-built reconciliation is a *check* on that work, and the evidence it wants is
generated deletion and export tests (TRD §11.4) rather than a document. Every `unselected` cell in TRD §16 points at
the TRD §15 row that closes it, and none may survive to the review.

---

## 4. The critical path

```
Stage 0 ─ select storage scope ──▶ Stage 1 ──────────────▶ Stage 2 ─────────┐
          book review 3a ──────▶ 3a in flight ─▶ answered ┘                 │
                                                                            ├──▶ Stage 4 ──▶ Stage 5
Stage 0 ─ draft protocol scope ──▶ book review 3b ─▶ 3b in flight ─▶ answered
                                                           │
                                               Stage 3 runs here
```

The path is **storage selections → on-disk shape → cutover → service → continuity**. Each review runs beside
the stage it reviews and gates the stage *after* it: 3a gates cutover, 3b gates the service.

**If either review is booked late it becomes the critical path**, and everything else waits on it. That single
failure mode is what this ordering exists to avoid, and it is avoided in the first week or not at all. Review 3a
is the easier one to leave late, because Stage 1 does not feel like it is waiting on anything — right up until
Stage 2 cannot run.

---

## 5. Decision record

§5.1–§5.3 were the author's to settle and are settled; the stages above already reflect them. **§5.4 is open**,
and surfaced after the other three while confirming what the export format actually carries.

### 5.1 *Ships* means someone else's data — decided

> **The assurance gate binds at the first deployment that carries data belonging to anyone but the author,
> a deliberately bounded test audience included, and at any public description of the security properties.
> The author synchronizing his own devices through his own service is development, and precedes every gate.**

The question was what "levels 1–3 before network sync ships" means, since the current development installation
already does multi-device sync with no account and no encryption at all.

**What it binds.** Levels 1–3 at the first byte of anyone else's data. Level 5 — the disclosure path — from the
same moment, because a reporting path that does not exist when the first report arrives is the cheapest thing
to get wrong. Level 4 on its own two triggers.

**What it does not bind.** Stage 4's internal milestones (§3.5). First ciphertext round trip and two devices
converging are reached and dogfooded while review 3b is out.

**The neighbouring gate is deliberately later and should not be collapsed into this one.** PRD §7.11's as-built
data review binds at *wider availability*, beyond development or a bounded test audience. So the order is:
dogfooding → levels 1–3 and 5 → bounded audience → as-built review → wider availability. Two gates, two
audiences, and a bounded test audience sits between them.

### 5.2 The design review is split in two — decided

> **A narrow storage-and-journal review, answered before Stage 2. The full protocol review, answered before
> Stage 4. Two engagements.**

The journal AEAD is the only new primitive in the plan, TRD §10.10 requires the review to cover it
specifically, and it ships in Stage 1 — long before network sync. Holding Stage 1 for one combined review would
forfeit the migration saving Stage 1 exists to capture (§2.1).

**What review 3a covers:** the encrypted record format, the local half of the key hierarchy, and the
synchronous journal AEAD with its nonce discipline. TRD §15 rows 1, 2, 3 and 13, plus the storage-facing part of
row 14. Row 18 is deliberately absent: it follows measurement in Stage 3 and gates neither this review nor cutover.

**What it gates:** cutover, not Stage 1. Stage 1 is implemented while the review of its design is in flight. A
defect found then costs a rework; the same defect found after Stage 2 has written a real deployment's data
under a broken construction, and a nonce-reuse fault is retroactive.

**The cost, accepted:** two engagements rather than one, and the author's own Stage 1 development data is
exposed to whatever review 3a eventually finds.

### 5.3 The root-type change does not go into Stage 1 — decided, as a conscious pass

> **No. TRD §10.8 stays deferred on its existing trigger conditions, and its one cheap window is passed
> deliberately rather than missed.**

Two of its four costs are paid only if there is data to migrate and a third has already lapsed, so Stage 1 is
the cheapest this will ever be. It is still declined, on risk grounds: Stage 1 already carries the largest
correctness risk in the client, and adding an unrelated schema change to that diff trades a certain increase in
risk for a saving on work that may never be done.

**What this means afterwards.** From Stage 2 the change costs all four of its costs, permanently, and the
decision is effectively final unless one of its triggers fires: the reconstructed Done order visibly wrong in
real use, or something else needing the day map to stop being a concurrently-created container. TRD §10.8 now
records the pass, so a future reader who notices the lapsed cost finds the reason rather than an oversight.

### 5.4 What happens to attribution at the cutover — open

The export carries card **bodies** and nothing the app tracked. `readDayContent` maps a day's collections through
`cardBody`, so `id`, `author`, `origin` and `createdAt` are all absent, and import is a **system-actor** write
(TRD §9.1). **So every card written before the cutover arrives attributed to the system actor**, and provenance
mode shows nothing for any of it.

This is not a defect in the export — plain Markdown is the escape format and identity is exactly what plain text
does not carry — but it is a decision, and Stage 2 is when it gets taken whether or not anyone notices.

| Option                                              | Cost                                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Accept it.** Pre-cutover history reads as system-written | Provenance mode is blank before the cutover, permanently                        |
| Migrate through the fidelity archive instead        | Pulls a Stage 5 item into Stage 2; the only route that carries identity              |
| Add `author` to the day files                       | **Rejected.** TRD §4.6 removed hidden per-item identity syntax from the format once already |

**Suggested: accept it**, for a single-user development installation where *who wrote this* has one answer, and
say so at the time. But note the shape of the alternative before dismissing it: the fidelity archive is the
artifact that carries CRDT state, TRD §9.3 already owes it, and the cutover is the one moment where having it
early would pay for itself twice — once for attribution and once for a verified restore of the migration itself.

**Status and gate:** open; recorded as TRD §15 row 21 and PRD §11 question 10. It blocks Stage 2 cutover and
neither review engagement.

---

## 6. Deferred, with triggers

| Item                              | Trigger                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Root-type day collections         | Reconstructed Done order visibly wrong in real use, or something else needs the day map to stop being a concurrently-created container. **Its cheap window was passed deliberately** (§5.3); from Stage 2 it costs all four of its costs, permanently |
| Yjs v13 → v14                     | A stable v14 binding release. **Not during Stage 4** — the seam bounds imports, and Stage 4 adds Yjs coupling outside it (TRD §10.1) |
| Persistent encrypted search index | Measurement of the in-memory rebuild demands it (TRD §6.2)                                                  |
| Destructive compaction            | A replica-acknowledgement protocol — which also retires attribution claims and drops content-key generations, so it moves two boundaries (TRD §4.5, TRD §10.4) |
| Pooled editor instance            | Card mount cost proves visible (TRD §10.2)                                                                  |
| Peer-to-peer                      | PRD §2.3's measured conditions, all four                                                                    |
| Escrow add-on                     | Demand, plus a separate legal entity. Triggers the implementation audit                                     |
| Agent membership                  | Stage 4 complete, and its own product document                                                              |
| Human sharing                     | Its own product document. Not reached by growing the workspace picker                                       |

---

## 7. Early warning signs

One per stage — the thing that says it is going wrong before the exit criteria do.

- **Stage 0.** TRD §15 rows are being answered with "the TRD will decide" rather than a construction and a test vector.
  The review will bounce that.
- **Stage 0.** The latency harness is being deferred to "when we need it". After Stage 1 there is no baseline, and
  the cold-start budget becomes unarguable in either direction.
- **Stage 1.** The store-handle refactor is landing in the same commits as the encryption. Two changes, one
  diff, and the data-loss risk is entirely in the second one.
- **Stage 1.** Tests are green and nobody has checked whether the fleet is running with `persist: true`. It
  defaults to false, and a green suite over a broken store is the exact shape of this stage's failure.
- **Stage 1.** Review 3a has not been booked because Stage 1 "isn't waiting on it". It is not — Stage 2 is,
  and by then the lead time is unrecoverable (§5.2).
- **Stage 2.** Anything other than export → import is being considered for carrying the development
  installation across.
- **Stage 4.** The relay is being *extended* rather than replaced. It holds a plaintext `Y.Doc`; extending it
  means the content-blindness boundary is being negotiated rather than drawn.
- **Stage 4.** Revocation is called done when the relay refuses the connection. That is not the finalization
  boundary (TRD §7.5), and the difference is invisible until the relay misbehaves.
- **Stage 5.** The package is being demonstrated within the provider account. TRD §11.3's test 9 is the one
  that cannot be faked, and a within-provider drill passes while the real scenario still fails.

---

## 8. Where this plan is likely wrong

- **The stages are very unevenly sized**, and Stage 4 is most of the work. If it needs splitting, §3.5's
  internal milestones are the seams — but none of them is a ship boundary, and pretending otherwise is how a
  device list that cannot revoke gets shipped.
- **The review's shape is assumed.** If the reviewer wants an implementation rather than a specification, Stage
  4 and the review interleave instead of sequencing, and §4's critical path is drawn wrong.
- **Stage 3 might not fill the hole.** If the review comes back quickly, retrieval is half-built when Stage 4
  wants to start. That is a good problem and the work is not wasted — but the plan is presenting a convenience
  as though it were a fit, and it should be read as the former.
- **§2.1's "free before, expensive after" was stated too loosely, and the correction is worth keeping.** An
  earlier draft made it conditional on the export → import path being "genuinely lossless", as though that were
  an open empirical question. It is not: the path's losses are known and enumerable (TRD §9.1), and *lossless*
  was doing two jobs. **Byte-identical round-tripping is a format guarantee, required and testable.
  Workspace-preserving is a different claim and is false** — `id`, `author`, `origin` and `createdAt` do not
  survive. So §2.1's argument holds for everything on-disk-shaped, and what is genuinely open is the narrower
  question in §5.4: whether losing those four fields at the cutover is acceptable.
