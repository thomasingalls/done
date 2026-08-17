# done — Implementation Sequencing

**Status:** Suggested, not decided. A proposal for the order in which TRD v8's requirements get built.
**Date:** 2026-08-17
**Companion to:** [TRD-v8.md](./TRD-v8.md), [PRD-v9.md](./PRD-v9.md)

---

## How to read this

**This is a dependency order, not a priority order.** PRD §10's phases say what matters most. This says what
has to exist before what, where the order is forced rather than chosen, and where waiting costs more than
working. There is one place where the two disagree, and §3.4 argues for taking the disagreement.

**Nothing here is a decision.** Three sequencing questions are genuinely the author's; they are collected in
§5 with a suggested answer each, rather than assumed silently.

**No durations.** There is no basis for any, and inventing them would make an ordering look like a schedule.
What this asserts is sequence and dependency.

**References:** `TRD §x` and `PRD §x` resolve to those documents. A bare `§x` is this one.

---

## 1. Where the code is today

Checked against the tree rather than remembered.

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
| Content encryption at rest                    | Free — export → import **is** the migration (TRD §14.6) | The in-place conversion state machine        |
| Root-type day collections (TRD §10.8)         | Two of its four costs never arise                       | All of them, forever                         |

**This is a deadline, not a priority.** None of these makes the product better for the author on the day it
lands. What they buy is the absence of three migrations, and that is only purchasable once.

### 2.2 One long pole, and it is calendar time rather than work

Levels 1–3 gate network sync, and **level 3 is an independent protocol design review by someone outside the
project.** Booking it, waiting for it and answering it is elapsed time that working harder does not compress.
TRD §13.11 adds that it waits until TRD §15 is closed, because reviewing an architecture alone buys an opinion
about a sketch.

So the single highest-leverage scheduling act is **starting TRD §15 immediately**, so the review is in flight
while the client work happens rather than beginning after it.

### 2.3 TRD §15 splits, and only half of it gates sync

The twenty unselected rows are not one body of work. **Six are needed to encrypt a local store; the rest are
needed to move an envelope over a network.**

| TRD §15 rows                              | Needed for                    | Blocks   |
| ----------------------------------------- | ----------------------------- | -------- |
| 1, 2, 3, 13, 18, and part of 14           | Local encryption at rest      | Stage 1  |
| 4–12, 15, 16, 17, 19, 20                  | The service and the wire      | Stage 4  |

**That split has a consequence.** The synchronous journal AEAD is row 2, it is the only new primitive in the
plan (TRD §10.10), and it ships in Stage 1 — well before network sync. So "levels 1–3 before network sync
ships" does not cover the one construction the review most needs to see, at the time it lands. §5.2 is that
question.

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
| **Now**                  | —                      | Select, measure, book                                          |
| **1. On-disk shape**     | 2, and part of 3       | Everything that changes what is written to disk                |
| **2. Cutover**           | between 2 and 3        | The first real deployment                                      |
| **3. Retrieval**         | 4, **brought forward** | Search, palette, the unbuilt Goals projections                 |
| **4. The service**       | 3                      | Accounts, keys, envelopes, relay, devices, revocation          |
| **5. Continuity**        | —                      | Fidelity archive, migration, the independently runnable package |
| **Continuous**           | —                      | Assurance                                                      |

### 3.1 Now — select, measure, book

Three things, none of which is application code, all of which get more expensive the later they start.

**Select TRD §15's storage half.** Rows 1, 2 and 3 are what Stage 1 cannot begin without: the algorithm suite,
the synchronous journal AEAD **and its nonce discipline**, and the encrypted record format. Row 2 is the one to
spend real thought on — a counter-based nonce whose last value was not durably recorded can repeat after
exactly the crash the journal exists to survive.

**Draft TRD §15's network half.** It blocks nothing here, and it is what the reviewer needs.

**Build a latency harness and take the baseline while the store is still plaintext.** Today the budget script
enforces initial JS and nothing else; keystroke → paint, cold start, warm start and content-root load have no
harness. TRD §12 already names cold start as the budget at risk, since it will absorb a key-store read, an
unseal and per-record decryption. **Without a recorded baseline, a regression from the encrypted store is both
invisible and unattributable**, and the budget conversation afterwards has nothing to argue from.

**Book the design review.** Lead time is the constraint, not readiness.

**Exit:** rows 1–3 selected with test vectors; a latency harness with recorded plaintext numbers; a reviewer
engaged and a date held.

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

Export from the development installation; import into the first real deployment; turn the old relay off. Then
the versioning and upgrade story, built preventatively rather than at the first incompatible change.

Two things must be true before this runs. **Import must not be gated by the freeze**, or a ten-day export
silently loses everything older than three days. And **Stage 1's on-disk shape must be final**, because this is
the moment it stops being free to change.

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
needed at all (TRD §15 row 18).

### 3.5 Stage 4 — the service

The largest stage, and mostly indivisible: **you cannot ship a device list that cannot revoke.**

Internal order, each item needing the one before:

1. **Account service, authenticator, and the device-local slot verifier.** Account creation is the entry point.
2. **Recovery keypair and the code ceremony.** At account creation, not later — it is the first thing the user
   meets, and there is no account without it.
3. **Authorization lineage, first signed head, genesis checkpoint, promotion.**
4. **Device signing and wrapping credentials**, both persistence tiers, with the tier shown in the UI.
5. **Envelope layer, relay rewrite, content-blind durable store, checkpoints and manifests.**
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

| Level                              | When                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| 1 — threat model, conformance tests | Written alongside Stages 1 and 4; the tests are TRD §11                       |
| 2 — web-security baseline           | Profile selected in Now; verified before Stage 4 ships                        |
| 3 — protocol design review          | Booked in Now, in flight through Stage 3, answered before Stage 4 ships       |
| 5 — disclosure and response program | Live the day Stage 4 ships. A reporting path that does not exist when the first report arrives is the cheapest thing to get wrong |
| 4 — implementation audit            | On trigger: *end-to-end encrypted* in marketing copy, or the escrow add-on holding a real key |

---

## 4. The critical path

```
Now ── select TRD §15 storage half ──▶ Stage 1 ──▶ Stage 2 ──────────────┐
                                     (largest client risk)            │
                                                                      ├──▶ Stage 4 ──▶ Stage 5
Now ── draft TRD §15 network half ──▶ book review ──▶ review in flight ──▶ answered
                                                        │
                                                   Stage 3 runs here
```

The path is **storage selections → on-disk shape → cutover → service → continuity**, with the review running
beside it and gating Stage 4's ship.

**If the review is booked late it becomes the critical path**, and every other thing waits on it. That single
failure mode is what this ordering exists to avoid, and it is avoided in the first week or not at all.

---

## 5. Three decisions this document cannot take

### 5.1 Does the assurance gate bind the author's own dogfooding?

"Levels 1–3 before network sync ships" needs a definition of *ships*. The author syncing his own two devices
through his own service is not obviously it — the current development installation already does multi-device
sync with no account and no encryption at all.

Deciding this late means deciding it under schedule pressure, which is the condition under which it gets
decided wrongly.

**Suggested:** the gate binds anything that carries another person's data or is described publicly.
Dogfooding is Stage 4's internal milestone and does not wait. Write the answer down either way.

### 5.2 Is the design review split, or does storage encryption wait for it?

The journal AEAD is the only new primitive in the plan, TRD §10.10 says the review must cover it specifically,
and it ships in Stage 1 — long before network sync. Two options: a **narrow early review** of the storage and
journal construction plus the full protocol review later, or **hold Stage 1** until one review covers both.

**Suggested: split it.** Holding Stage 1 forfeits the migration saving that Stage 1 exists to capture (§2.1),
and a storage construction is a much smaller review than a protocol. The cost is buying two engagements rather
than one.

### 5.3 Does the root-type change (TRD §10.8) go into Stage 1?

It is deferred and its trigger conditions have not fired. But two of its four costs are paid only if there is
data to migrate, and a third has already lapsed — so Stage 1 is the cheapest this will ever be, and after
Stage 2 it is a schema migration forever.

**Suggested: no**, on risk grounds. Stage 1 already carries the largest correctness risk in the client, and
this adds an unrelated schema change to the same diff. But **the deadline should be a conscious pass rather
than an oversight**, which is why it is here rather than only in §6.

---

## 6. Deferred, with triggers

| Item                              | Trigger                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Root-type day collections         | Reconstructed Done order visibly wrong in real use, or something else needs the day map to stop being a concurrently-created container. **Its cost changes permanently at Stage 2** (§5.3) |
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

- **Now.** TRD §15 rows are being answered with "the TRD will decide" rather than a construction and a test vector.
  The review will bounce that.
- **Now.** The latency harness is being deferred to "when we need it". After Stage 1 there is no baseline, and
  the cold-start budget becomes unarguable in either direction.
- **Stage 1.** The store-handle refactor is landing in the same commits as the encryption. Two changes, one
  diff, and the data-loss risk is entirely in the second one.
- **Stage 1.** Tests are green and nobody has checked whether the fleet is running with `persist: true`. It
  defaults to false, and a green suite over a broken store is the exact shape of this stage's failure.
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
- **§2.1's "free before, expensive after" is a simplification.** It is free only if the export → import path is
  genuinely lossless for everything the author cares about, which is TRD §11.3 test 3 and is currently unbuilt.
  If that path turns out to lose something, Stage 1's deadline argument weakens and the migration state machine
  comes back into scope.
