# done — Technical Requirements

**Status:** v8 — current and normative. Supersedes v7 in full.
**Date:** 2026-08-17
**Companion to:** [PRD.md](./PRD.md)

---

## How to read this

This document records **decisions and constraints**, not implementations. Where a constraint can be
satisfied several ways, it is stated as a constraint and the choice of approach is named separately, so a
better approach can replace it without the requirement having to be reconstructed from the code that
happened to satisfy it.

Code appears only where **the code is the decision**: data shapes that define what is stored (§4.2, §6.3),
and interface boundaries that define what a subsystem may expose (§7.1). Short snippets elsewhere are
illustrative of an argument — showing that an operation is atomic, or that a mechanism already exists — and
are marked as such.

Styling, component structure, and framework idiom are implementation. They are described by the properties
they must have (§8.2), not prescribed line by line.

**Three things are new in v8 and change how this document is used.**

**Section numbers §0–§12 are preserved deliberately.** The PRD cites `TRD §4.5`, `TRD §6.1`, `TRD §10.4` and
others, the codebase carries the same references in comments, and the superseded decision record cites them too. Where a section's content changed, the
number did not. New material is §13, §14, §15 and §16. **§13 is a prerequisite for §6 and §7 and sits at the
end anyway** — read it first if you are implementing storage or sync.

**Each subsection states its constraint, names the approach separately, says what must not happen, and ends
with the test that keeps it honest.** The repetition between subsections is deliberate, for the same reason
it is deliberate in the PRD: a subsection should be usable alone.

**References resolve inside this document unless they say PRD.** `§6.1` means §6.1 here; `PRD §7.4` means
§7.4 of the companion product requirements. Where the PRD states a product requirement this document must
satisfy, the requirement is restated rather than pointed at.

**Decision provenance is one record.** `docs/sessions.md` preserves the options, rejected paths and evidence
behind the product and architecture settlement. This document and the PRD are the current normative
requirements; the record explains how they were reached and is the place to re-open a question on its original
evidence.

**The reference direction is one-way and deliberate.** The PRD stands alone. This document may read it. Anything
that plans, orders or schedules the work reads both and is read by neither — an ordering is downstream of the
requirements it orders, and a requirement that cites a schedule has acquired a premise it cannot defend.

**What this document does not do is select the cryptographic protocol.** PRD §7.12 makes an independent
protocol design review a gate before network sync ships, and that review needs concrete state, envelopes,
rotation, finalization and test vectors to be worth buying. §13 fixes the architecture, the roles, the
negative constraints and the criteria; §13.10 carries the selected suite, which no longer holds a candidate;
§15 is the selection register. **Its storage-facing scope is closed and its protocol scope is not**, so filling
the rest in and passing it to review remains the work between this draft and an implementable one.

---

## 0. Terminology

| Term                        | Meaning                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Update log**              | Yjs internals only. Never a user-facing concept, and nothing user-facing may be called a log.                                 |
| **Freeze**                  | UX rule: a day's collections become read-only 3 days after its date. Governs authoring, not replication or maintenance (§4.5). |
| **Compaction**              | Planned storage optimization, currently safety-paused. **Independent of freeze.** Also an attribution-retirement event (§4.5). |
| **Document**                | A surface backed by one `Y.Text`. There is one: the master list.                                                              |
| **Collection**              | A surface backed by an ordered `Y.Array<CardId>` (next, scheduled, done).                                                     |
| **Card**                    | One item in a collection; owns its own `Y.Text`.                                                                              |
| **Workspace content root**  | The whole synchronized, persisted data set of one workspace — currently one `Y.Doc`. A device may hold several (§6.1).        |
| **Workspace**               | One content root plus the grants that reach it. The product word; "room" survives only on the wire (§7.2).                    |
| **Principal**               | One human, grouping their actors. Exists from local genesis; no server required.                                              |
| **Member**                  | A workspace-scoped grant for a principal or an agent, carrying capabilities.                                                  |
| **Actor**                   | The identity attributed with a write. A human actor is one member on one device; an agent actor may have no device; the system actor is not a member (§4.8). |
| **Device**                  | One browser profile. Not a machine.                                                                                           |
| **Session**                 | One tab, this run of it. Ephemeral, never persisted, not `doc.clientID` (§4.8).                                               |
| **Local user slot**         | Device-local privacy and discovery boundary over the stores one person may open on this installation (§6.5).                  |
| **Origin**                  | A Yjs transaction's `origin` value, carrying the acting actor and device. Local to the page; never in update bytes (§4.8).    |
| **Authorization lineage**   | The signed, service-serialized chain of authorization epochs for one workspace. Absent, live, or terminally retired (§13.5).  |
| **Epoch**                   | One committed state of the lineage: membership, credentials, capabilities and current content-key generation.                 |
| **Content-key generation**  | `K_g` — one symmetric secret per generation, from which domain-separated subkeys are derived (§13.2).                         |
| **Local-custody key**       | `L_local` — the device-local key that opens this slot's sealed `K_g` envelopes. Promptless by default (§13.3).                |
| **Recovery keypair**        | `R_pub` wraps every generation; `R_priv` is ordinarily absent and persists only sealed to user-held factors (§13.2).          |
| **Envelope**                | One outbound unit: encrypted Yjs update, clear routing metadata, sealed attributed actor, source signature (§7.4).            |
| **Acceptance evidence**     | Authorization-service attestation that a specific envelope entered the accepted set (§7.5).                                   |
| **Checkpoint**              | A client-produced authenticated state attestation with a manifest binding it to an epoch, generation and covered range (§7.6). |

---

## 1. Summary of decisions

| Concern                    | Decision                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| CRDT                       | Yjs v13 (pinned, see §10.1)                                                                          |
| Editor                     | CodeMirror 6, plain-markdown source of truth                                                         |
| Live preview               | Custom CM6 decoration extension (cursor-line syntax reveal)                                          |
| Document surface           | The master list, one `Y.Text`                                                                        |
| Collection surfaces        | Ordered `Y.Array<CardId>` references; each card owns one canonical `Y.Text`                          |
| Primary persistence        | **First-party encrypted IndexedDB store, per _(principal, workspace)_. `y-indexeddb` is replaced (§6.1)** |
| Crash journal              | **Encrypted synchronous localStorage write-ahead log; reviewed synchronous AEAD (§6.1)**             |
| Query/search index         | **In memory, rebuilt lazily. Persistent SQLite-WASM only once encrypted at rest (§6.2)**             |
| Content encryption         | **Every app-managed persistent store, from genesis, under `K_g` (§13.2)**                            |
| Key custody, default       | **Promptless `L_local` as a structured-cloned non-extractable `CryptoKey`; optional device lock (§13.3)** |
| Device credentials         | **Separate signing and wrapping keypairs, non-extractable at runtime, two persistence tiers (§13.4)** |
| Authorization              | **Service-authoritative signed lineage; no authority outside the service (§13.5)**                   |
| Attribution                | **Source-signed envelopes; attributed actor inside the seal (§4.8, §7.4)**                           |
| Sync transport             | **Relay-mediated only, opaque envelopes, service-issued acceptance evidence (§7.3–§7.5)**            |
| Durable store              | **Content-blind: envelopes, checkpoints, manifests. Cannot merge (§7.6)**                            |
| Doc partitioning           | Single root doc per workspace; destructive compaction is safety-paused (§4.5)                        |
| Recovery                   | **Non-custodial: `R_pub` wraps generations, saved code seals `R_priv` 1-of-N (§13.8)**               |
| PWA shell                  | Hand-rolled service worker, precache-only                                                            |
| Targets                    | Android Chrome (primary), Desktop Chrome/Edge                                                        |

Four load-bearing decisions. Two survive from v7: **Yjs is the source of truth and the derived index is a
cache**, and **structure follows the unit of interaction** — text where you edit documents, arrays where you
manipulate items. Two are new: **no app-managed persistent store holds plaintext**, and **the service
authorizes while clients hold every content key.**

---

## 2. Why not a SQL sync engine

Zero, ElectricSQL, Replicache, RxDB, and Convex are the right family for a different problem, and one
property rules them out.

**The realistic conflict here is:** you add a line to the master list on your phone, your laptop has had it
open since this morning, both sync. Every SQL-shaped sync engine resolves that at row or field granularity —
one device's version of the whole text field wins, the other is discarded. Silent data loss on the app's core
operation. The same argument holds for a card: two devices editing one card's text is the same shape at a
smaller scale.

A text CRDT merges at character granularity and keeps both edits. That's the requirement.

Secondarily: Zero, Electric, and Convex are server-authoritative — the server holds truth and orders writes,
so durability depends on the server accepting them. That contradicts "a cloud instance must not be a blocking
requirement." Replicache is the same shape with more server left to you. RxDB comes closest but resolves
conflicts document-level, landing back on the text-merge problem.

**Chosen:** Yjs, with the relay carrying opaque encrypted envelopes.

**The "dumb pipe" formulation is retired, and what replaced it is narrower than it sounds.** v7 said the relay
"holds no authority, runs no application logic, and can be absent entirely." Two of those three are now false.
The service authenticates connections and signs authorization state; the relay validates opaque envelope
metadata and carries service-signed acceptance evidence; the durable store holds an encrypted replica. What
survives, and it is the property Yjs was selected for, is that **no service component parses document content
or holds a content key** (§7.3). A workspace with no live lineage still constructs no provider and needs
nothing (§7.1).

### 2.1 Why Yjs over Automerge or Loro

Loro benchmarks fastest and Automerge has a richer history model, but Yjs has the ecosystem this depends on —
a CodeMirror 6 binding, IndexedDB persistence, interchangeable providers.

**The performance argument is retired.** Automerge 3.0 (August 2025) cut memory by more than 10x and load
times on long histories collapsed with it. That gap is closed, and it was never load-bearing at single-user
scale.

Two arguments survive, and both are structural.

**Undo.** §4.8 scopes undo to the actor and the session, so that a bulk resolution or a compaction cannot land
in the human's undo stack. That is `Y.UndoManager` with tracked origins, and PRD §5.4 depends on it. Automerge
has no first-class undo; the community answer rewrites document history and describes itself as experimental.

**History retention is the thing being bought, and the product doesn't want it.** Compaction (§4.5) deletes
card objects and expects the space back. Automerge keeps history by design. PRD principle 6 argues directly
against paying for time-travel.

**A third argument arrives with v8 and is worth recording because it cuts the other way.** The envelope layer
(§7.4) and the checkpoint coverage attestation (§7.6) both depend on Yjs specifics — update encoding, state
vectors, and the `DeleteSet` inside a snapshot. That is new coupling outside the seam, and it makes a CRDT
change more expensive than v7 assumed, not less. It is not a reason to change now; it is a reason to record
the cost honestly (§10.1).

**Revisited 2026-08-09.** `yjs@13.6.32` shipped 2026-08-04 and v14 is in an active release-candidate series.
What has stalled is the binding layer — that is §10.1, and it is stale on Automerge's side too.

---

## 3. Why CodeMirror over Tiptap, BlockNote, or Lexical

The card UI makes ProseMirror-family editors look attractive. Two things decide against it.

**Markdown stops being the truth.** ProseMirror, Tiptap, Lexical, and BlockNote all use a structured document
model; markdown is an import/export serialization. Round-tripping through that model is documented to alter
escape policy on brackets, tildes, and underscores, collapse frontmatter, and **strip blank lines**. Given that
"your data outlives the app" is a ranked principle and blank lines are literally the card-split input gesture,
a lossy serialization layer under the whole app is the wrong foundation.

You also don't get Obsidian-style syntax-visible editing from these without fighting the model — `**` becomes
a bold mark, not two characters you can see and delete.

**The card argument is weaker than it looks.** The usual reason to reach for a block editor is that blocks are
hard _inside one big document_. That's not this architecture (§4.2): each card owns a separate `Y.Text` and
gets its own small editor. Splitting a card is an array operation, not a document transformation.

**Decision: CodeMirror 6 for every editing surface.** One authoring feel across documents and cards, plaintext
markdown throughout, no serializer in the write path.

---

## 4. Data model

### 4.1 Principle

There is no parallel structured representation of item _content_. All user-visible text lives in a `Y.Text` as
markdown. What the CRDT tracks beyond text is only what the workflow requires the app to know: **membership and
ordering of cards in collections.**

### 4.2 The workspace content root

```
Y.Doc (root)                                      ← one workspace content root
├── meta          Y.Map    { schemaVersion, createdAt, setting.*, actor:* }
├── master        Y.Text                                ← document, never freezes
├── cards         Y.Map<CardId, Card>                   ← canonical card content
├── cardLocations Y.Map<CardId, "ISODate:section">      ← canonical membership
└── days          Y.Map<ISODate, Y.Map>
      └── "2026-08-05"
            ├── next       Y.Array<CardId>              ← ordered collection; cap binds authoring only
            ├── scheduled  Y.Array<CardId>              ← ordered collection
            ├── done       Y.Array<CardId>              ← ordered collection, newest first
            └── archive    Y.Text | absent              ← legacy compaction only (§4.5)

Card = Y.Map {
  id:        string     // stable
  text:      Y.Text     // markdown; line 1 = title, remainder = description
  origin:    string | null   // item provenance: source card id or 'master'
  author:    string     // ActorId (§4.8)
  createdAt: string     // UTC ISO 8601
}
```

`meta` additionally holds settings and actor records as flat CRDT keys:

```
meta['setting.rolloverHour']  number
meta['actor:' + ActorId]      { kind: 'human'|'agent'|'system', name, color }
```

They are deliberately not nested `Y.Map` values. Two new offline devices can initialize concurrently;
independent flat keys merge, while two nested maps assigned to the same parent key would make one entire
settings/actor branch win.

Day maps are created lazily on first write. An untouched day occupies nothing.

**A card carries no date.** Canonical membership is stored separately from the Card, keyed by its id. Day
arrays retain presentation order. Rescheduling updates membership and the two ordering arrays atomically.
Keeping card content canonical means a concurrent edit and move operate on the same `Y.Text`, while concurrent
moves resolve through the single map value to one visible location.

**Constraint, new in v8: this is one content root, and a device may hold several.** The tree above describes
*a* workspace, not *the* workspace. A device that has been used locally and then signs in holds two, in two
stores, under two principals (PRD §6.7). Nothing in this tree changes; what changes is that every code path
addressing it must take a store handle rather than assume the module-level one (§6.1).

**Must not happen.** No structure above may become shared between workspaces, and no root type may be
addressed by a name that does not distinguish which content root it belongs to.

**Test.** §11, store isolation.

### 4.3 Why collections are arrays

The PRD's movement table is the justification. `Next → Done` is the second most important interaction in the
app, and with arrays it is a delete of an id from one array and an insert into the other, plus its canonical
membership update, inside a single transaction — atomic, undoable as one step, and observable as one event.
_(Shape shown to make the atomicity argument; not a prescribed implementation.)_

The same operation modelled as text ranges in a shared document is a delete-plus-insert whose concurrent-merge
behaviour is exactly the weak spot of text CRDTs — concurrent move tends to duplicate or interleave.

The three-item cap likewise becomes `next.length < 3` checked before insert, rather than a transaction filter
parsing list structure out of prose.

**That check is the whole of the enforcement, and nothing corrects the merge afterwards.** Two devices each
adding a third card while apart are both under the cap when they write; the merge is over it, and there is
nowhere to reject either write. PRD §4.1 keeps them all, so the merged Next simply holds more than three,
`capacityFor` goes negative, and every write path refuses on the same comparison it always made.

**The cap binds authoring, not replication, and two paths sit on the replication side of that line.** Remote
updates never consult it. **Import does not either** (§9), for the same reason it sits outside the freeze: it
is the app reconciling histories rather than a person editing the past.

**Must not happen.** No repair job moves overflow to Scheduled. An earlier draft ran one; it converged and
deleted nothing, and it was still the app deciding which of two devices' legitimate writes stopped being Next.

**Test.** §11, cap enforcement.

### 4.4 Cards render static until focused

A card is **not** a mounted editor by default. It renders as static HTML from its markdown. An editor mounts
only on focus.

This does three jobs at once:

- **Performance.** One or two live CodeMirror instances at a time regardless of list length.
- **Done-guarding** (PRD §4.3). Next and Scheduled cards mount on tap; Done cards mount only on long-press or
  explicit unlock. Same machinery, different trigger.
- **Freezing** (§4.5). Cards in a frozen day never mount.

**Hard constraint: static render and mounted editor must be pixel-identical.** Text must not shift when an
editor mounts — same constraint as the live-preview line-height rule (§5.2), same regression test. After mount,
place the cursor via `posAtCoords` on the originating tap so focus lands where the user pointed.

**Test.** §11, pixel identity.

### 4.5 Freeze and compaction are independent

These were conflated in draft v2. They are separate mechanisms on separate schedules and must stay that way.

**Freeze — a UX rule, day + 3.** The day's collections become read-only. Implemented purely as a policy check in
the UI and app-write layers: cards don't mount editors, mutation operations reject. Nothing about the stored
representation changes. Permanent; no unfreeze.

**The freeze's scope is a three-way split, and v7 did not say so.** It governs operations that **author the
past**:

| Path                             | Inside the freeze? | Why                                                                                   |
| -------------------------------- | ------------------ | --------------------------------------------------------------------------------------- |
| Replication (`Y.applyUpdate`)    | **No**             | Remote updates never consult `isFrozen`; a frozen day has always merged normally      |
| App-level create / move / destroy | **Yes**, every actor including system | `moves.ts` checks `writable()`; the recovery path declines to rewrite frozen history on purpose |
| Compaction                       | **No**, by explicit design | `compaction.ts` may not consult the freeze and `freeze.ts` may not consult it |
| **Import**                       | **No** (§9)        | A migration import is the app reconciling histories, not a person editing the past    |

Import is the placement that has to be made deliberately, because the default an ordinary implementation lands
on is the gated one — and a gated import silently drops every day older than three, which on a ten-day export
is most of it. It is not a novel exception: compaction is already an app-level system operation held outside the
freeze, so the code already distinguishes *authoring the past* from *maintaining the store*. Import is the
second member of the second category.

**Compaction — target storage optimization, day + 7, currently safety-paused.** The original implementation
serialized collections into `archive: Y.Text` and deleted their arrays and cards. That is not safe in a
local-first system without replica acknowledgements: a device can edit an existing nested `Y.Text` while
offline, after which another device's deletion of its parent makes the converged edit unreachable.

Due days still run the canonical serialize → parse → compare validation, but the operation returns `deferred`
without writing or deleting anything. Legacy archives remain readable. Destructive compaction may only return
when the protocol can prove every replica has observed the state being discarded, or when a new representation
keeps concurrent nested edits reachable.

The pause deliberately gives up the intended bound on structured card objects: until a safe protocol replaces
deletion, object count grows with history.

**New in v8: re-enabling destructive compaction moves a security boundary as well as a storage one.**
Compaction deletes cards, therefore deletes `Card.author`, therefore **retires the attribution claim** for the
days it compacts. PRD principle 6 is what licenses that retirement; it does not license displaying an author the
product can no longer verify. So the replica-acknowledgement protocol §10.4 requires is gating two boundaries,
and whoever re-enables compaction owns both.

**§15 row 8 simplifies the second boundary without removing it.** The attribution record lives beside the card
it attributes, so compaction deletes the claim in the same operation that deletes the card — **one trigger
rather than two that have to agree** — and the generation-dropping question it used to carry is settled
separately by §13.7's record living under the current generation anyway.

**Must not happen.** Freeze must not bind replication, compaction or import. Compaction must not consult the
freeze. Neither may be justified by elapsed time as evidence that replicas have synchronized.

**Test.** §11, freeze independence; compaction safety.

### 4.6 Item identity in documents

The master list is plain markdown and its lines are anonymous. It contains no hidden identity syntax: the editor
neither generates nor hides trailing caret suffixes, and caret text authored after the schema-v4 migration is
ordinary text.

Cards, actors and devices have internal UUIDs; collision is not a concern anywhere. Card UUIDs are keys in the
canonical registry and day collections; actor and device UUIDs support attribution. None are rendered into the
master document or otherwise exposed as user-facing identifiers.

Completion is `- [x]` and nothing more. **There is no `📅` scheduled-date syntax and no `✅` completion-timestamp
syntax** — both are deadline-tracking scaffolding for a system this explicitly isn't.

### 4.7 Movement operations

| Operation                       | Implementation                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| Next → Done                     | Move the card id and update canonical membership, one transaction (§4.3)                 |
| Compose → Done                  | Register one canonical card, then insert its id at the head of Done (§4.9)               |
| Reschedule to another day       | Move the id between days and update separate membership; no date field on the Card       |
| Master → collection             | Parse selected line(s), create card with `origin: 'master'`. **Does not modify master.** |
| Remove from master              | Separate explicit text deletion. Never bundled with the above.                           |
| Card split (3 returns)          | Truncate this card's `Y.Text`, insert a new canonical card id after it, move focus       |
| Card merge (backspace at start) | Append this card's text to previous, delete this card                                    |
| Bulk stale-item resolution      | Batched id and membership moves in one transaction                                       |
| **Import**                      | **Attributed to the system actor; bypasses the freeze and the cap (§4.5, §9)**           |
| **Promotion (Local → Account)** | **Not a content operation. Keys and admission only; the store is unchanged (§13.6)**     |

### 4.8 Identity levels, actors and attribution

Rewritten in v8. v7's §4.8 described one human actor per install and said attribution was recoverable from the
update stream. The first is true per device and false per person; the second is false outright.

**Eight levels, and picking the wrong one is the whole category of bug this replaces.** Account · local user
slot · principal · workspace · member · actor · device · session. PRD §1 defines them; what this section fixes
is which level answers which question in code.

**Eight here, nine there, and the difference is not a discrepancy.** PRD §1's vocabulary is nine terms: these
eight plus **workspace content root**, which is a data set rather than an identity level — it is what a
workspace *holds* (§4.2), not something a question about identity can be answered at. The count differs
because the two lists are doing different jobs; the vocabulary is the same one.

| Question                          | Level                                   |
| --------------------------------- | ----------------------------------------- |
| Who wrote this card               | **actor** — `Card.author`                 |
| Last synced from ⟨x⟩              | **device**                                |
| Anything shown to a human as "you" | **principal**                            |
| Where a caret is                  | **session** — one per tab                 |
| Which undo stack                  | **session**, never crossing devices       |
| Which stores may be discovered    | **local user slot** (§6.5)                |
| Which content root is open        | **workspace**                             |

**A human actor is the writing identity for one member on one device.** Do **not** merge the actor and device
identifiers. A device may host several principals, so one install can carry several human actors; the 1:1 that
holds today holds only because there is one member per install today. An agent actor acts for an agent member
and may have no device. The system actor is not a member: it is a constant used for compaction, import and bulk
operations, authenticated through an authorized credential when those operations replicate.

**A new device is always a new actor.** No mechanism claims an existing one.

**Every mutation carries its actor as the Yjs transaction origin.** `ydoc.transact()` already takes an origin the
codebase would otherwise pass as `null`, so attribution is populating an argument that exists rather than
threading new state through the write path. The origin carries the acting actor and the originating device.

**Undo is scoped by origin, to the local human, in this tab.** `Y.UndoManager` accepts a `trackedOrigins` set.
This is required for v1 correctness independent of agents: without it, undo after a compaction reverts the
compaction, and undo after a bulk stale-item resolution unwinds dozens of card moves as one confusing step. Both
are system-actor operations that must never enter the user's undo stack.

**Undo is an append and is not exempt from signing.** `Y.UndoManager` does not remove history; it appends a
transaction whose ops invert earlier ones. That mutation crosses the transport boundary and is enveloped and
signed like any other write (§7.4). What makes undo safe is narrower: **the undo stack is assembled from
in-memory origin objects, matched by identity, which exist only in the page that made them.** No document
content can insert an entry into your undo stack.

**Awareness is wired from day one.** `y-protocols/awareness` carries the local actor's identity and cursor, and
`yCollab` renders remote selections. Presence is one caret per input surface including your own tabs, all of
yours in your colour, labelled with the person's name. The peer list is deduplicated **by device id** today and
**by principal** once enrollment exists — **never by name**, since two Macs are both called `Mac`.

**Storage split:**

| What                                | Where                            | Synced    |
| ----------------------------------- | -------------------------------- | --------- |
| Actor roster                        | `meta['actor:' + id]` in the content root | yes |
| Which actor this client is          | device-local, inside the slot    | no        |
| Device id and friendly name         | device-local, inside the slot    | no        |
| **Principal id, per slot**          | **device-local, inside the slot** | **no**   |
| **Device signing/wrapping keys**    | **device-local, inside the slot (§13.4)** | **no** |
| **Content-key envelopes**           | **device-local, sealed under `L_local` (§13.3)** | **no** |
| **Authorization lineage state**     | **beside the content root, signed, service-issued (§13.5)** | yes, as signed objects |
| Live cursor / presence              | awareness protocol               | ephemeral |

The roster syncs; the local actor/device binding does not, and that stays correct — each install must know which
credential and actor it actually controls rather than trusting the roster.

**The roster is not evidence of anything.** It is mutable, unauthenticated, and written on every ordinary first
run before any sync exists. It may not be used to decide whether a workspace has ever been admitted anywhere;
that test reads authenticated lineage state (§13.5).

**A card's identifier commits to its creator, and that is what makes first authorship immutable** (`S0-5`,
§15 row 8). The attribution record lives in a Yjs map, and **a CRDT map cannot enforce "write once"** — that is
an application convention, not an authority. A compromised credential could replace another source's entry
with one naming itself, sign the complete tuple with its own valid key, and ship it in its own accepted
envelope; it verifies, and after trim a fresh restorer has no prior value and no accepted creation position to
refuse it with. So the id is derived instead: `card_id` is the first 16 bytes of
`SHA-256( LP("done/creation/v1") || LP(dec v) || LP(workspace_id) || LP(lineage_id) || LP(creator_credential) || LP(hex creator_nonce) )`.

**A different credential produces a different id, so there is no replacement claim to make.** The property is
structural rather than adjudicated: nothing has to be retained, ordered or asked, which is why it survives the
trim that defeated the convention. The width is unchanged — ids were already 128-bit — and a card edited after
creation still *verifies and is not exact*, which remains the honest reading.

**Attribution granularity is card-level, deliberately.** `Card.author` is one field and answers "who created
this." The master list is not attributed per character: Yjs stores no author per item, so it would require a
parallel mark structure maintained alongside every text edit — real cost on the keystroke path, for a question
nobody asks until an agent is editing prose. Deferred (PRD §11 q7).

**Nothing about attribution is recoverable from an update stream, and v7 said otherwise.** A transaction origin
is an argument the _receiver_ passes to `Y.applyUpdate(doc, update, origin)`; it is a local property and is never
encoded in the update bytes. What the bytes carry is the writing document's Yjs client id, which is random per
`Y.Doc` instance — per tab, per page load — so it identifies neither a device nor an actor durably.

**Three consequences follow, and each has been contradicted somewhere at least once:**

1. `Card.author` is an ordinary field any writer can set to any value. Making it trustworthy needs authenticated
   writes, not better forensics (§7.4).
2. **A delta cannot be filtered by signing credential.** "Keep only the operations this credential authored" asks
   the update stream for attribution it provably does not contain. Where that operation is needed — the migration
   cutover — the answer is the envelope, not the delta (§14.3).
3. Origin is trustworthy precisely because it never leaves, and that same property is exactly why it cannot serve
   as cross-device attribution. One mechanism, two conclusions that look contradictory until you notice which
   direction each runs.

**Must not happen.** No design may assume coarse attribution is recoverable from update bytes. No code may merge
`done.actor` and `done.device`.

**Test.** §11, undo scoping; attribution authenticity.

### 4.9 Section order, and where an arrival lands

Two different orders, and they must not be allowed to become one.

**Storage order** is `next, scheduled, done`: how a day is written to a file and to `archive` (§9), and the order
every iteration over a day's contents takes.

**Reading order** is `next, done, scheduled` (PRD §4.1). It is a property of the day panel and of nothing else —
rearranging the layout must not be able to change the file format.

Within a collection, **Done takes an arrival at index 0** and the other two append. That is the only place
ordering is a rule rather than a user action. A multi-line copy into Done is reversed on the way in, so a run of
lines still reads in the order it had in the master list.

**Order has to survive replication**, and a sequence CRDT gives that for free while the array survives. The case
where it does not is a day _neither_ device has written to before: both mint a `Y.Map` for the date, one wins the
key outright, and the loser's arrays are deleted with it. The cards survive in the canonical registry and are put
back by the membership repair, which is therefore the one place an order is _recomputed_ rather than merged.

Everything from here to the end of this section is a **mitigation for a schema problem**, not a property of the
data model, and §10.8 records the problem, the fix, and why it is deferred.

It recomputes from the section's own rule. Next and Scheduled are ordered by intent, intent is not stored, and a
returning card appends. Done is ordered by time, so its order can be restored: a returning card goes back above
everything completed before it. Two constraints make that safe to run independently on every replica: the
ordering key is replicated data rather than anything local, and returning cards are processed oldest-first.

The key is `Card.createdAt`. It is the completion time exactly for the compose path and the _writing_ time for
something written earlier in Next and finished later, which is the known imprecision and the accepted one.
`createdAt` is therefore required to be **strictly increasing per device** rather than merely a clock reading.
Two _devices_ may still tie, and there the tie is real, so any deterministic choice is correct as long as every
replica makes the same one.

**Test.** §11, Done's order across replication.

---

## 5. Editor

### 5.1 Architecture

CodeMirror 6 with `Y.Text` bound via `y-codemirror.next`. The document CodeMirror holds is literal markdown.
Every visual affordance is a **view-layer decoration** — `Decoration.replace` and `Decoration.mark` over ranges
computed from the Lezer markdown syntax tree. Nothing in the rendering pipeline mutates the document.

### 5.2 Live preview extension

A `ViewPlugin` recomputing decorations on document change, viewport change, and selection change:

1. Walk the syntax tree over **visible ranges only** — never the whole document synchronously.
2. For each node, compute ranges covering its syntax characters (`**`, `##`, backticks, link brackets).
3. If the cursor or a selection range intersects the node's **line**, emit no replacement — raw syntax shows.
4. Otherwise replace syntax ranges with zero-width decorations and `mark` the content range with the formatting
   class.

**Hard constraint: line height must not change** between revealed and hidden states. Style hidden syntax to zero
width rather than `display: none` where possible, and keep formatting classes to properties that don't alter line
box height.

**Test.** §11, pixel identity.

### 5.3 Card decorations

Within a card editor: **line 1 → title class** (high contrast, heavier weight), **lines 2+ → description class**
(reduced contrast). Both are `mark` decorations keyed on line number.

They apply identically in the static render, which is how §4.4's pixel-identity constraint is met — the static
renderer and the editor share one stylesheet and one markdown-to-HTML path.

### 5.4 Editor behaviors

Beyond stock CM6 markdown: list continuation on Enter (including Enter on an empty list item, which outdents then
terminates), `Tab`/`Shift-Tab` indentation, click-to-toggle checkboxes, idempotent `Cmd-B`/`Cmd-I` wrapping.

In card editors additionally: three consecutive returns splits (§4.7), backspace at position 0 merges upward,
`Escape` blurs and unmounts back to static.

The split threshold is a **named constant**, not a literal. The PRD expects it to change.

---

## 6. Storage

### 6.1 Primary: the encrypted content store

**Constraint.** No app-managed persistent store holds user-content plaintext, from genesis, on every device
(PRD §7.1). Stores are addressed per _(principal, workspace)_, a device may hold several, and no provider may
ever write to a store belonging to a different workspace.

**Approach: replace `y-indexeddb` with a first-party encrypted store.** v7 said the adapter "keeps
y-indexeddb's on-disk format, loading, ordinary writes, and compaction". **That is no longer possible, and the
reason is worth stating rather than leaving as a preference.** `y-indexeddb` persists raw `Y` update bytes in an
`updates` object store and applies them back with `Y.applyUpdate` on load. Encrypting those records means the
stored bytes are no longer valid updates, so its load path fails on its own data. There is no layer at which
`y-indexeddb` can be retained and the store still be ciphertext.

What is being replaced is smaller than it sounds. The existing adapter already owns the write path — the
synchronous journal, batching, the transaction-complete durability boundary and `whenDurable()`. What comes from
`y-indexeddb` and must be written is three things: the load path, the `updates` object store, and periodic
trimming of accumulated updates into one state record.

**The record shape is the decision, so it is written out:**

```
StoredRecord = {
  v:      number       // store format version — NOT the document schemaVersion (§4.2)
  gen:    number       // content-key generation this record is sealed under
  seq:    number       // monotonic per (principal, workspace), for trim ordering and diagnostics
  kind:   'update' | 'state' | 'heads'
  nonce:  Uint8Array
  ct:     Uint8Array   // AEAD(K_gen-derived store subkey; plaintext = one Yjs update)
}
```

Constraints on it:

- **Records are individually decryptable and order-independent**, because Yjs updates are, and the load path
  reads them in whatever order the store returns.
- **The AEAD's associated data binds the record to its store** — at minimum workspace id, generation and record
  kind — so a record cannot be moved between workspaces or reinterpreted as another kind.
- **`gen` is per record, not per store.** Rotation does not re-encrypt what is already written; it changes what
  new writes are sealed under. A device therefore needs every generation its own records use, which is an
  ordinary local retention question and is **separate from** the attribution retention floor (§13.7) — those are
  different objects and conflating them will over-retain.
- **Trimming is crash-safe in that order**: write one `kind: 'state'` record under the current generation, wait
  for its transaction to complete, and only then delete the records it supersedes in a second transaction. A
  crash between the two leaves duplicate coverage, which is harmless; the reverse order loses data. **The trim
  covers content records only** — a `heads` record is not superseded by a state record and is not swept by it.
- **Trim discharges old generations locally.** Once a single state record under the current generation covers
  everything, older generations are droppable from this device's local custody — subject to nothing else needing
  them.

**A third `kind` exists and it is not a content record** (§15 row 6). `heads` carries the anti-replay high-water
mark §7.5 requires — one `(seq, link)` per credential — in **its own object store**, under the same store subkey,
so the content load path never meets a record it cannot apply as a Yjs update. Sharing the subkey is safe rather
than merely economical because `kind` is in the associated data: reinterpreting a heads record as a `state`
record is exactly the attack that binding was written for, one object along. Three constraints on it:

- **`seq` is not per object store.** One sequence per _(principal, workspace)_ spans both, so the nonce budget
  above stays the single comparison it was argued as rather than a sum over two sequences.
- **The content batch commits first and the heads record after it.** The same direction as the trim, for the
  same reason: a crash in this order re-delivers admitted positions, which is idempotent, while the reverse
  advances the mark past an operation that was never applied and leaves it below the baseline forever.
- **The store is created empty at genesis**, before any workspace has a lineage to fill it. IndexedDB creates
  object stores only inside a version-change transaction, so adding it in Stage 4 is a version bump over a real
  deployment's data — §14.6's class of migration, and this one costs a line now. Like the custody record above,
  it also makes its own absence something §11.1 can assert.

**Two version numbers exist and must not be conflated.** `StoredRecord.v` versions the on-disk envelope;
`meta.schemaVersion` versions the document tree. A change to either must not be read as a change to the other.

**The concrete format is selected** (§15 row 3). AES-256-GCM under a domain-separated store subkey of `K_g`, with
12 random nonce bytes per record. **Every cleartext field is in the associated data — `v`, `gen`, `seq` and `kind`,
plus the principal and workspace ids** — and `kind` is why that matters rather than being thorough: IndexedDB holds
a structured clone whose properties the load path trusts, a `state` record supersedes everything before it, and an
editable `kind` is therefore a way to make the store delete its own history through its own trim path. **`seq` does
not reset at trim**, because the nonce budget is argued from it.

**That budget has a number and an action, and the writer needs both.** NIST SP 800-38D §8.3 bounds a key to 2^32
invocations when its nonces are random, which is what holds the collision probability at or below 2^-32. `K_store`
is per generation, so the budget is per generation: **a store whose next write would be the 2^32nd invocation under
the current generation rotates before that write rather than after it.** Equality is the first disallowed value,
and the writer rotates or refuses rather than proceeding. This is one comparison in front of a field that exists
for other reasons, and it is the whole enforcement behind the conditional argument the random nonce rests on — a
counter that is observed but never compared enforces nothing.

**What row 3 has not selected is the count that comparison reads, and the gap is not cosmetic.** `seq` is monotonic
across the store and does not reset, while the budget is per generation; the two agree only for the first
generation. A literal `next seq ≥ 2^32` test would therefore be conservative until the first rotation and then
refuse every write for the rest of the store's life. The comparison needs a per-generation baseline — a
generation-start watermark, or an invocation count that also counts encryptions abandoned before commit — and
selecting it is the same open decision as the multi-tab sequence allocator (§15 row 3). Until that is selected, an
implementation cannot derive this branch from the register alone.

**The journal, and why it is the sharp edge.** Every update is first written synchronously to localStorage as one
immutable, per-page, per-store journal entry. A reload replays those idempotent Yjs deltas. At the end of a short
batching window the adapter writes every captured delta in one relaxed IndexedDB transaction, waits for its
`complete` event, and only then removes the corresponding journal entries. `whenDurable()` forces that batch
immediately and resolves only after every update observed before the call has committed. Journal or batch failures
remain observable and leave recoverable entries intact.

The journal is a short-lived write-ahead log, not a second document representation. It closes the browser
lifecycle gap where navigation can terminate the page between a Yjs transaction and IndexedDB's asynchronous
commit.

**It now holds content, so it is encrypted — and WebCrypto cannot do it.** `crypto.subtle.encrypt` is
promise-based and cannot complete inside a handler that must not return until the write has happened.

> **Decision: preserve the crash-safety contract.** A reviewed **synchronous AEAD** — JS or WASM — on this one
> narrow path, with a low-end-device latency benchmark, is a requirement. The alternative is a deliberate
> redesign of the crash-safety contract, which trades a guarantee the product already makes for an
> implementation convenience.

Three constraints on that construction, and the third is the one that is easy to miss:

1. It receives a **domain-separated journal subkey** derived while `K_g` is briefly unsealed — never the WebCrypto
   key used for the content store or for network envelopes. That subkey exists only in live slot memory, is
   cleared at sign-out or lock, and is re-derived at unlock. It is the narrow exception to non-extractable
   runtime keys, forced by the synchronous contract.
2. It must never receive `K_g` itself, a device private credential, or recovery material.
3. **Its nonce discipline has to survive a page kill.** A counter-based nonce whose last value was not durably
   recorded can repeat after a crash, which for most AEADs is catastrophic — and this is precisely the path whose
   whole purpose is to survive crashes. Either use random nonces with a space large enough that collision is
   negligible without state, or derive a fresh journal subkey per page session so a repeated counter lands under
   a different key. **Selected** (§15 row 2): XChaCha20-Poly1305 with 24 random bytes per record, so there is no
   counter and no durable state for a crash to lose.

**Start-up order changes, and this is a concrete consequence nothing upstream states.** Today `openLocalStore`
constructs the provider and then replays the journal **synchronously**, before the IndexedDB load resolves.
Encrypted, the journal cannot be read without the journal subkey, which needs `K_g` unsealed, which needs
`L_local` — a structured-cloned `CryptoKey` that only IndexedDB can hold. So the order becomes:

```
open key store → unseal K_g (and prompt, only if a device lock is enabled)
  → derive store + journal subkeys → replay journal → load content records → construct transport
```

**The key store carries a custody record per slot, written at genesis.** On the default tier it says promptless and
nothing reads it; it is what §13.3's device lock later moves. It is required from the first version that writes a
key store, because a store whose tier is implied by what is present would need a migration over key material to
gain an explicit one — the class of migration §14.6 exists to avoid. It also makes *this slot is on the default
tier* something §11.1 can assert in both directions rather than an absence.

Journal replay is no longer synchronous at open. Two consequences: the cold-start budget absorbs a key store
read and an unseal before any content is available (§12), and the load-before-connect rule below gains a step in
front of it.

**Local state must finish loading before any transport is constructed.** This is the ordering behind the most
common data-loss report against Yjs in production, and it fails in one direction: the socket syncs first, a
document not yet populated from disk looks authoritative, and the near-empty state is what both ends converge on.
Sync then propagates the loss to every replica. **In v8 the rule extends: keys load before local state, and local
state loads before transport.** A workspace whose keys have not been opened must not construct a provider at all.

Request `navigator.storage.persist()` on the first human write. Surface the granted/denied state in settings.

**Must not happen.** No plaintext user content in any app-managed persistent store, at any lifecycle point —
genesis, Local, Account, after deletion, after retention expiry, after migration. No provider constructed against
a content root belonging to a different workspace, in either direction, including on teardown, retry and error
paths. The journal implementation receives only its domain-separated journal subkey — never `K_g` itself, a
device private credential, recovery material, or a key used by the content store or network envelopes.

**Test.** §11, no-plaintext-at-rest; journal replay ordering; store isolation; trim crash-safety; load before
connect.

### 6.2 Derived: the search index, in memory first

**Constraint.** A persistent derived index may ship **only** when its on-disk representation is encrypted
(PRD §7.1). It is used only for what the CRDT can't answer efficiently: full-text search, reference resolution,
and the stale-Next-item scan that drives the PRD §4.4 indicator.

**It is a cache.** Never written by the user, never synced, safe to delete. If missing, corrupt, or a schema
version behind, delete and rebuild from the content root. This must be an ordinary tested code path, not an
emergency one.

**Approach: start in memory.** No browser engine currently supplies transparent encrypted persistence that
full-text indexing can use — row-level security is access control rather than encryption; column encryption
produces ciphertext columns ordinary FTS cannot index; PGlite documents an in-memory filesystem but not encrypted
browser persistence; Turso's page-level encryption is labelled experimental in its own manual; and official
SQLite WASM builds expose transparent encryption only with the commercial SEE extension. So: keep the index in
memory, rebuild it lazily from the decrypted content root after startup and off the cold-start path, **measure
the rebuild**, and add an encrypted persistent representation only if measurement demands it.

**The persistent-tier constraints are retained but dormant**, and should be read as applying to the second
implementation rather than the first:

- Use official `@sqlite.org/sqlite-wasm` with the **OO1 API**. The `Worker1` and `Promiser1` wrappers are
  deprecated by their author as too fragile for non-toy use. Write a dedicated worker with a small hand-rolled
  RPC layer.
- Use the **`opfs-sahpool` VFS**. No `SharedArrayBuffer`, therefore **no COOP/COEP headers**.
- OPFS requires a worker context; all SQLite access goes through it.
- `opfs-sahpool` holds exclusive access; a second tab can't acquire it. Guard with `navigator.locks`; a tab
  without the lock runs normally with search disabled and says so.
- **Load lazily.** The ~1 MB wasm must not block first paint or first keystroke.

**One documented consequence of starting in memory.** An in-memory index has no OPFS lock, so the app currently
has **no per-device exclusive resource at all**. The lock is cited elsewhere as the example of a session-scoped
exclusive resource and as a candidate for a tab count; neither example is live until a persistent index exists.
Neither conclusion depended on it.

**Must not happen.** The index must never become authoritative for anything. If a bug makes it so, that's the bug.

**Test.** §11, index rebuild determinism.

### 6.3 Index schema

```sql
CREATE TABLE docs (
  doc_id     TEXT PRIMARY KEY,   -- 'master' | 'day:2026-08-05:archive'
  kind       TEXT NOT NULL,      -- 'master' | 'archive'
  date       TEXT,
  body       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE cards (
  card_id    TEXT PRIMARY KEY,
  date       TEXT NOT NULL,      -- the day that holds it; a card has no date of its own
  section    TEXT NOT NULL,      -- 'next' | 'scheduled' | 'done'
  position   INTEGER NOT NULL,
  title      TEXT NOT NULL,      -- first line
  body       TEXT NOT NULL,      -- full text
  origin     TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE items (                -- markers parsed out of documents
  item_id TEXT PRIMARY KEY,
  doc_id  TEXT NOT NULL REFERENCES docs(doc_id) ON DELETE CASCADE,
  line    INTEGER NOT NULL,
  depth   INTEGER NOT NULL,
  text    TEXT NOT NULL,
  done    INTEGER NOT NULL DEFAULT 0
);

CREATE VIRTUAL TABLE docs_fts  USING fts5(body,        content='docs',  content_rowid='rowid', tokenize='porter unicode61');
CREATE VIRTUAL TABLE cards_fts USING fts5(title, body, content='cards', content_rowid='rowid', tokenize='porter unicode61');

CREATE INDEX cards_by_day ON cards(date, section, position);
CREATE INDEX cards_stale  ON cards(date, section) WHERE section = 'next';
CREATE INDEX items_open   ON items(done) WHERE done = 0;
```

**One index instance per open workspace.** The schema carries no workspace column because two workspaces never
share an index, for the same reason they never share a store (§6.1).

### 6.4 Index maintenance

Observe `Y.Text` and `Y.Array` changes, debounce ~300 ms, re-parse the affected document or card and replace its
rows in one transaction. Per-unit reparse is cheap (kilobytes), so line-level diffing is unwarranted.

Full rebuild walks everything and should finish well under a second at projected scale. Run on schema-version
mismatch, on index-open failure, and on demand from settings.

### 6.5 The local user slot index, and store naming

**Constraint.** Every store a device holds belongs to exactly one local user slot, and a picker scoped to the
active slot must be unable to enumerate any other slot's stores (PRD §6.7). The database key alone cannot supply
this: keying by _(principal, workspace)_ prevents merges but still leaves a previous person's retained Local
workspace enumerable.

**Approach: a device-local slot index, separate from the stores it points at.** It records, per slot, which
_(principal, workspace)_ stores exist, which principal owns each, and the slot's offline-verifiable unlock binding
(§13.9). It is device-local, never synced, and is not identity state — it groups for local access only and makes
no claim that two principals in one slot are the same person.

**Store naming must not leak across the boundary it enforces.** Names are derived from _(principal, workspace)_,
and a name that can be guessed from a workspace identifier alone would let a picker enumerate by construction
rather than by lookup. Enumerate through the index, never through `indexedDB.databases()`.

**Lifecycle:**

| Operation                       | Slot index                                                     | Stores                       | Service            |
| ------------------------------- | -------------------------------------------------------------- | ---------------------------- | ------------------ |
| Sign out                        | Mark this slot closed; retain its entries                      | Retained, sealed             | Sessions ended     |
| Reopen (offline)                | Verify slot binding, mark active                                | Opened                       | Nothing            |
| Remove account from this device | Delete this slot's entries                                     | Cleared                      | Revocation requested |
| Reset for handoff               | Delete **every** slot's entries                                | All cleared                  | All revocations requested |

**Destructive clears must be crash-safe across the slot index, the key material and the stores.** Clearing
IndexedDB is asynchronous and interruptible; navigating away mid-clear must resume or roll back. A clear that
leaves a store with no identity manufactures precisely the state the product says must never be reachable
(PRD §6.11). Order matters: remove the index entry last on a delete, so an interrupted clear is re-discoverable
and resumable rather than orphaned.

**Must not happen.** No picker enumerates by database name. No slot's stores are reachable while that slot is
closed. No clear leaves capability behind while removing identity and content, and none removes the content key
while leaving the ciphertext.

**Test.** §11, slot scoping; crash-safe clear.

---

## 7. Sync

### 7.1 Provider interface

Sync sits behind a narrow interface with a **null implementation as the default**:

```ts
interface SyncProvider {
  connect(): void;
  disconnect(): void;
  readonly status: 'disabled' | 'connecting' | 'connected' | 'offline';
  readonly lastSyncedAt: Date | null;
}
```

No provider is constructed until a workspace has a live authorization lineage and its keys are open.
**Deleting the sync configuration entirely must leave a fully working app** — enforced by running the full suite
with the provider absent.

**Nothing on the read or write path may await sync state, an account session, or a network credential.** Three
things follow that are easy to get wrong individually:

- A revocation check gates **sync**, not startup. Unknown or offline means full local function; *known revoked*
  detaches the replica and says so.
- An operational-key PRF unlock gates **sync**, not the app. Those credentials sign envelopes and receive keys;
  they do not open the local store (§13.4).
- An expired account session degrades to "sync is offline", never to "the app is locked".

The one ceremony that may precede local reads is the **optional** device lock, which is local and not a network
wait (§13.3).

**Test.** §11, sync-absent; load before connect.

### 7.2 The relay, and what it is not any more

**Constraint.** No service component parses document content or holds a content key. The relay authenticates
transport, validates opaque envelope metadata and signatures, sequences and stores ciphertext, and carries
service-signed acceptance evidence.

**The relay in this repository is not that relay, and the gap is a rewrite rather than a configuration change.**
`relay/src/persistence.ts` calls `Y.applyUpdate` on load and writes `Y.encodeStateAsUpdate(doc)` to a file per
room; `relay/src/connection.ts` extends `Y.Doc`. Under content encryption it can do none of that. What replaces
it is a content-blind store of immutable envelopes plus checkpoints (§7.6). The honest claim about the existing
program is that **its shape is proven and its operating model is known** — one small process, a handful of
dependencies, no native code — not that the capability is already built.

`relay/src/auth.ts` is likewise a target for replacement rather than a constraint to design around: one shared
`token` in a query string plus a room allowlist, which cannot separate tenants at all. Its successor is a scoped,
expiring admission credential issued by the authorization service (§13.4).

**Three claims v7 made here are now false and should not be inherited.** The relay is not a dumb pipe; it is not
absent-able for a workspace using hosted sync; and "every device holds a full replica" is wrong — a device holds
its **last** replica, which is the distinction every deletion, lapse and migration warning depends on.

**Relay transport is not by itself a backup; the durable hosted store is a real retained recovery source.** The
relay's live fan-out supplies no durable copy. The hosted store does: while its ciphertext, generation wraps and
retention window survive, it can supply recovery object 4 and the saved code can open the recovery key needed for
object 3 (§13.8). That is a server-held encrypted replica, not an independently controlled backup, and it disappears
with retention or the service. Markdown export (§9.1) and the fidelity archive (§9.3) are the user-controlled
portability and backup artifacts; only the latter preserves exact workspace state.

### 7.3 Component split

**Constraint.** Authorization is service-authoritative; content is end-to-end encrypted; the boundary between
them is fixed and neither may absorb the other.

| Component                   | Responsible for                                                                                                                                                            | Must not become                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| **Authorization service**   | Authenticate the account; admit and revoke device/agent credentials; assign capabilities; sign and serialize authorization epochs; issue acceptance and finalization evidence | A content-key holder, mutation signer or document-semantic authority                |
| **Client envelope layer**   | Encrypt outbound updates; bind workspace, epoch, credential and digest in the clear and **the actor inside the seal**; sign over both; verify inbound authorization, signatures and acceptance evidence; wrap and rotate content keys | A second authorization authority, a network dependency on the local edit path       |
| **Relay and durable store** | Authenticate transport; validate opaque envelope fields, epoch and signatures; sequence and store ciphertext; carry service-signed acceptance evidence                     | A plaintext processor, CRDT merger, or source of authorization by itself            |
| **Yjs**                     | Represent and merge content locally **after** an envelope has passed verification                                                                                          | An identity, authorization or recovery system                                       |

**Every component here owes inventory rows, and §16 has them.** A component that stores, forwards, logs or backs
up anything acquires a row at the moment its definition exists, not at review time.

**Interfaces are drawn now even though the first deployment may remain one process.** That deployment must
already distinguish: rendezvous and connection authentication; ephemeral live fan-out and awareness; durable
encrypted envelopes and checkpoints; authorization signing and accepted-set finalization; and account storage.
Drawing them later is a rewrite, and collapsing them lets ephemeral presence silently inherit the retention
policy of durable workspace state.

**Authorization reconciles before content.** Two devices settle the current epoch, credentials and capabilities
before they exchange a single document update. Same shape as §6.1's load-before-connect rule, and the same
status.

### 7.4 The envelope

**Constraint.** Every mutation admitted to the shared lineage is authenticated by a credential authorized at the
referenced epoch, and its attributed actor is derived from that credential or explicitly authorized for it to
represent.

**The field split is a product constraint, not a preference.** Workspace, epoch, credential and update digest are
**in the clear**, because the relay validates them. **The attributed actor is inside the seal**, because the
relay is not entitled to a per-write record of which member wrote. The signature covers both.

**The format is selected** (§15 row 4):

```
Clear header  v, workspace_id, credential_id, epoch, gen, seq, nonce[12], digest
Sealed body   LP("done/env-body/v1") || LP(actor_id) || LP(actor_kind)
              || u32be(count) || ( u32be(len) || update )*

K_net = HKDF-SHA256(ikm = K_g, salt = "", info = LP("done/envelope/v1") || LP(workspace_id), L = 32)
AAD   = LP("done/env/v1") || LP(dec v) || LP(workspace_id) || LP(credential_id)
        || LP(dec epoch) || LP(dec gen) || LP(dec seq)
ct    = AES-256-GCM(K_net; body, AAD)
sig   = Ed25519( device signing credential ; LP("done/env-sig/v1") || <the AAD's fields>
        || LP(hex nonce) || LP(hex digest) )
```

**There are two bound field lists because one of them structurally cannot do the whole job.** The nonce is the
AEAD's own input and `digest` is a function of the ciphertext the AAD helps produce, so neither can be inside
the AAD — and both are fields a reader trusts. **The signature is what reaches them**, which is why its message
is a separate list rather than the header repeated.

**`digest` is SHA-256 of the ciphertext**, not the plaintext, so §7.2's relay validates it with no content key
and §7.5's accepted chain binds the same value the relay checked.

**`seq` is the credential's own outbound position and its accepted position, as one number, and that is forced
by §7.5 rather than chosen here.** A client can only replay its own chain if it can compute each position
unaided; a service-assigned position would mean it cannot verify anything until told where its own writes
landed. The cost is that a client cannot skip — a refused envelope stalls that credential's chain until it is
re-minted at the same position — and the benefit beyond §7.5 is that `seq` bounds the 12-byte random nonce's
per-generation budget in one comparison, exactly as it does in §6.1.

**Batching closes at a change of actor, credential, epoch or generation; at a flush interval that must not be
shorter than the acceptance-head cadence, since §7.5 holds the envelope regardless; or at a byte cap.** One
envelope carries one actor by construction, so batching costs no attribution granularity at all. The interval
and the cap are tunables with grounds rather than constants with authority.

**What that buys, precisely, so nobody claims more.** No actor identifier crosses in the clear. It is **not**
unlinkability: the relay sees a credential identifier per envelope — it cannot validate per-credential
authorization blind — and the authorization state it validates binds credentials to members, so it can generally
map credential to member and tell a device's writes from an agent's. Write times, rates and volumes per credential
are visible either way. Buying the stronger property would mean an unlinkable credential-to-member boundary, which
is a much larger cryptographic commitment than anything else here and which nobody has asked for.

**Source-authenticated envelopes are preserved end to end.** No relay, store or future transport may combine
mutations from several credentials into new bytes and sign the result as itself; that erases the property the
invariant establishes. A source **may** batch its own mutations when actor, credential and epoch are the same.
Forwarded mutations retain their original envelopes.

**A device retains its own outbound envelopes.** This falls out of the rule rather than being an extra:
attribution lives in the envelope, so an operation separated from its envelope can never be re-attributed. The
migration cutover depends on it directly (§14.3).

**The depth is the second-newest checkpoint it has seen admitted, not the last** (§15 row 6). An earlier draft
said the last, and that is one checkpoint too shallow: §7.6 retains **two**, because §11.3 test 8 falls back to
the next-newest, and §14.3 has each device re-envelop its own suffix from whichever checkpoint it applied. A
device trimmed to the newest cannot supply the suffix for the checkpoint everyone has just fallen back to.
Counting two locally needs no retention field on the wire, and the failure it prevents appears at a restore
rather than at a review.

**One consequence of the single position number is a trap rather than a delay, so it is a rule.** A refused
envelope stalls that credential's chain until it is re-minted at the same position — and the obvious recovery
from a stall is what breaks the chain permanently. Re-minting position *n* over fresher content produces a
second, different link at a position the service may already have accepted, which every other device refuses
under §7.5 and reads as a compromised credential. **A definite refusal is the only thing that licenses a
re-mint; silence is not one**, and a timeout is silence.

**And a definite refusal has to be authenticated, or forging one is the attack** (§15 row 15). This rule licenses
a client to act on a refusal, so anything that can withhold an answer can manufacture one; §13.7 makes the same
point where the consequence is larger — there the client discards a live content key. **Everything that is not an
authenticated refusal is silence**, including an unsigned error body.

**Where verification does and does not run:**

| Path                      | Verify?                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| Keystroke → local Yjs     | **No.** No cryptography on this path at all                                                 |
| Local journal write       | **No.** It never leaves the device, and an attacker who can write it can write your JavaScript |
| Local replay on load      | **No.** Verifying every historical update would put cost on cold start and grow with history |
| Outbound at the boundary  | **Sign.** Asynchronous; a signature nobody waited for is not on the keystroke path          |
| Inbound at receipt        | **Verify.** Signature, epoch, and acceptance evidence (§7.5)                                |
| First sync                | **Verify** the checkpoint, or the signed envelope history (§7.6)                            |

**Must not happen.** No actor identifier in clear metadata. No re-signing of another credential's operations. No
verification on the keystroke or local-replay path. **No re-mint at a position without a definite refusal for
it**, however long the wait has been.

**Test.** §11, envelope binding; attribution authenticity; verification latency.

### 7.5 Acceptance evidence and the finalization boundary

**Constraint.** A valid signature is not an accepted write. A client admits an envelope only with
authorization-service evidence that it entered the accepted set.

**Why refusal at the relay is not sufficient**, stated as the attack because the hole is invisible otherwise:

1. A credential — or an attacker holding it — signs an update referencing an epoch it legitimately holds keys for.
2. A hostile relay **withholds it from the accepted set** rather than refusing it, and delivers it to another
   device after that credential's revocation has committed at the next epoch.
3. The receiving client sees a validly signed envelope under a past epoch — and **must accept genuine
   late-arriving old-epoch updates**, because a device offline across a rotation produces exactly that shape.

The epoch field therefore cannot distinguish "accepted before revocation" from "withheld until afterwards".

**The evidence is required before revocation too.** A cutoff learned at epoch *n+1* cannot help a stale client that
still knows only epoch *n* while a hostile relay withholds the successor. Requiring evidence on **every** applied
envelope closes the timing hole: the relay may hide the new authorization head, but it cannot supply acceptance
evidence for a write the service never accepted. If it withholds the evidence too, synchronization stops — which
is availability, not integrity, and is a failure the threat model permits.

**The shape is selected** (§15 row 5): an **append-only per-credential accepted chain**, with service-signed
heads amortized over a batch.

```
link_n = SHA-256( LP("done/accept/v1") || LP(workspace_id) || LP(credential_id)
                  || LP(dec n) || LP(dec epoch_n) || LP(hex digest_n) || LP(hex link_(n-1)) )

Head_n = Ed25519( K_accept ; LP("done/accept-head/v1") || LP(workspace_id)
                  || LP(credential_id) || LP(dec n) || LP(hex link_n)
                  || LP(dec epoch) || LP("true"|"false") )
```

`link_0` is 32 zero bytes; `digest_n` is the update digest §7.4 already puts in the clear, so the chain adds no
new cleartext field. **`final: true` is the finalization boundary** — no position above _n_ will ever be accepted
for that credential — and it is what tells an excluded credential it was excluded (§13.7).

**Three things follow, and each was a candidate the selection absorbed rather than beat.** Per-envelope receipts
are this construction with the chain removed, and a bag of independent receipts has the defect that every subset
of it is as well-formed as the whole. A checkpoint plus an authenticated suffix is this construction at a
checkpoint, which is why §7.6's manifest carries the same head vector. And **one signature covers every position
beneath it**, which is what makes evidence-on-every-envelope affordable without an asymmetric signature per
write.

**`K_accept` is a separate acceptance-signing key, certified by the authorization key in the epoch it appears
in.** Evidence is required before a client applies anything, so whatever signs heads is on the delivery path;
splitting the keys keeps the one that admits and revokes credentials off it. Rotating `K_accept` is an ordinary
epoch event.

**Four client rules, and the first is the one that is easy to get wrong.**

1. **Verify a head against the link you replayed yourself, never against the link the head claims.** A client
   that trusts the head's own link field holds a signature over a value it never checked against its own
   history, and the chain is then decorative.
2. Admit no envelope without a signed head at or above its position.
3. **First-seen-wins per (credential, position).** A second link at a position already held is equivocation, and
   a valid signature is not an answer to it.
4. Above the newest head, **hold rather than discard**.

**Non-equivocation here is per credential and within a view, and the bound is stated rather than left to be
discovered.** A service maintaining two consistent forks and showing each device only its own equivocates
undetectably by cryptographic means alone. What narrows it is that the epoch payload and the checkpoint manifest
both carry the head vector, so sustaining a fork means forking the authorization lineage — which §13.5's
ancestor rule and §7.3's authorization-before-content ordering put in front of every session — and that
divergent content is the user-visible symptom. **A transparency log or client gossip would close it properly and
is not selected**, being a larger commitment than anything else here for a workspace with two devices and one
person.

**Rule 4 has a latency consequence §12 has no row for.** An envelope arriving ahead of the head covering it is
held, so *remote edit → visible on the second device* is bounded below by head cadence rather than by the
network. §12's `envelope verify on receipt` budget measures the client, which is not where this cost is.

**A numeric high-water mark is not a finalization boundary.** A compromised credential can sign two different
envelopes at the same sequence, or fill a gap the service never accepted, and a hostile relay could then choose
which valid envelope at or below *k* to show a client. **The accepted stream must be non-equivocating from a
client's point of view**, which is what the selected chain supplies: the gap-free per-credential links, and a
final sequence and head digest committed together in one signed head.

**The client's side of that is four conditions, and the fifth one it looks like it needs is implied** (§15
row 6). Admit an envelope at *(credential, n)* iff it verifies; *n* is exactly one past the position this client
holds for that credential; `link_n` is computed from the link **the client itself holds**; and a signed head at
*n* verifies against that link. Otherwise **hold** — the position or its head has not arrived — or **refuse**.
*No second link at a position already held* needs no state of its own: a second envelope at *n* arrives when the
mark is already at *n* or beyond, and the position check refuses it. **That is why the anti-replay state is one
`(seq, link)` per credential rather than a log** — and why it carries the link: one level down from the
paragraph above, a numeric mark is not an anti-replay state either.

**Evidence is per run rather than per envelope, and that is not a relaxation of the rule.** A head at position
*n* covers every position beneath it through the chain, so a client walks a run to *n*, verifies one signature
there, and applies the whole run or none of it. Nothing is applied without evidence; the evidence is simply not
one signature per update, which is what *amortized over a batch* means seen from the client.

**A device persists that state because it cannot recompute it** — the links are functions of envelope digests
and it retains only its own outbound envelopes. Where it lives is §6.1's.

**Revocation is three states and only the middle may be shown as revoked** (PRD §6.5): *requested* ·
*committed* · *acknowledged*. **Committed** means one atomic security boundary: the service accepted the
authorization successor **and** a client-produced content-key generation with its reader and recovery wraps,
**and** published the authenticated finalization boundary for the removed credential's accepted writes. The
implementation may make the three one transaction; the semantics may not omit one.

**Nothing accepted before the cutoff is discarded.** There is no filtered replay — you cannot remove one
participant's operations from a CRDT history without losing what was built on them — and no two-lineage
adjudication, because the service serializes successors so concurrent attempts resolve to one accepted epoch and
one refusal that retries.

**Must not happen.** No envelope applied without evidence. No claim that relay refusal alone prevents divergence.
No presentation of a queued request as "revoked". **No head verified against the link it carries rather than the
link the client replayed**, and **no second link accepted at a position already held**, however well signed.

**Test.** §11, hostile-relay withholding; revocation commit; concurrent successors.

### 7.6 Checkpoints and the durable store

**Constraint.** A content-blind durable store **cannot merge what it holds**. Recovery therefore needs a bounded
representation rather than a merged state.

**The representation:** immutable authenticated envelopes; a client-produced authenticated checkpoint; a manifest
binding that checkpoint to its authorization head, content-key generation, covered range **and an authenticated
coverage attestation**; the update suffix after it; and retention rules for superseded checkpoints.

**The manifest also carries the accepted-head vector** — `(credential, position, link)` for every credential, as
of the checkpoint (§7.5, §15 row 5). That is what lets a device starting from a checkpoint verify the suffix
forward from authenticated heads instead of replaying every chain from genesis, and it is the same field the
epoch payload carries (§13.5). §7.5's third candidate shape was this composition; it is not a separate mechanism.

**The coverage attestation must cover insertions *and* deletions, and a bare state vector cannot.** A Yjs state
vector maps client to clock over insertions; deletions live separately in the `DeleteSet`. Two replicas can carry
identical state vectors and disagree about what has been deleted, so "the checkpoint's state vector is dominated"
does not mean "everything the checkpoint contains is here". The manifest therefore publishes a full snapshot's
`{sv, ds}` pair, or a receipt for the specific checkpoint a device applied.

**Publishing that pair is not deriving it, and the difference is the whole of `S0-5`.** A producer's signature
says *this producer made this manifest*. It does not say the `{sv, ds}` inside describe the snapshot the
manifest names, nor that the accepted-head vector stops where the snapshot stops — and an authentic manifest
whose coverage is wrong is worse than an unsigned one, because it is believed. **Two different checks answer
those two questions, and only one of them is a matter of trust.**

**Coverage is re-derived locally, by everyone, always.** The checkpoint carries the snapshot, so any restorer
can decrypt it, materialise it, derive `{sv, ds}` itself and compare. That needs no witness, no signature and
no second party, and it is **mandatory even when the admission verifies** — an encoding or selection bug
produces the mismatch as readily as a malicious producer. The derivation names its version, because `sv` and
`ds` are a library's opaque encoding and an unversioned change turns every stored attestation into a silent
mismatch that reads as corruption.

**The accepted-head baseline is the part that cannot be re-derived, and therefore the part that is trusted.**
Establishing that the head vector did not advance past the snapshot requires the accepted events, which is
exactly what trim removes. An eligible client that checked it signs a `SemanticAdmission` before any
pre-checkpoint envelope may be trimmed, and **a fresh restorer's confidence in that baseline is exactly its
confidence in the admitting credential**. The design says so rather than implying the head proves it.

**A producer may admit its own proposal, and the record says when it did.** §13.5 selects single-owner client
authority, so the only eligible client may be the producer itself. Requiring a second admitter would leave a
one-device workspace unable to checkpoint at all — and therefore retaining envelopes without bound, which is
the condition checkpoints exist to end. **A second eligible client admits where one exists; otherwise the
admission is marked self-admitted**, and a restorer that can see the weaker provenance can act on it.

**Incomparable proposals are ordered by an authenticated decision parent and never by wall clock**, which is
§15 row 7's own rule carried to the object that now settles it.

**Checkpoint construction must preserve attribution.** A checkpoint that flattens several credentials' work into
one signature by whichever client produced it is the forbidden shape — it is exactly what §7.4's no-re-signing
rule prohibits, arriving through a performance optimization. First sync needs either the signed envelope history
or an attribution-preserving checkpoint, and the second is the target because the first grows without bound.

**That constraint is discharged by §15 row 8 rather than by the checkpoint** — and it stops being a rule anyone
has to remember. Attribution is a set of standing records, each signed by the credential that made the claim,
living in the content the snapshot covers. **The producing credential signs the container and nothing inside it**,
so there is no step at which the forbidden shape could arise.

**The construction is selected** (§15 row 7):

```
ct = AES-256-GCM( K_cp ; a Yjs full snapshot of the content root, AAD )
K_cp = HKDF-SHA256(ikm = K_g, salt = "", info = LP("done/checkpoint/v1") || LP(workspace_id), L = 32)
AAD  = LP("done/cp/v1") || LP(dec v) || LP(workspace_id) || LP(dec gen) || LP(dec epoch)

M    = Ed25519( producing credential ; LP("done/cp-manifest/v1") || LP(dec v)
       || LP(workspace_id) || LP(dec epoch) || LP(hex epoch_head) || LP(dec gen)
       || LP(hex checkpoint_digest) || LP(hex sv) || LP(hex ds)
       || LP(hex head_vector_digest) || LP(producing_credential) )

head_vector = for each credential ASCENDING BY ID: LP(credential_id) || LP(dec seq) || LP(hex link)
```

`checkpoint_digest` is SHA-256 of the ciphertext, so the durable store validates it with no content key, exactly
as the relay validates an envelope's (§7.2, §7.4). **`sv` and `ds` are bound separately and as opaque bytes** —
separately because either alone is the claim this section says is not a coverage claim, and opaquely because
their content is Yjs's and §10.1's deferred upgrade would change it. **The sort is the canonicalization**: two
devices checkpointing the same accepted state must produce the same head-vector digest.

**Cadence has one forced rule and two tunables.** **A rotation produces a checkpoint under the new generation
before the old generation may be dropped** — a checkpoint is openable only while its generation is retained, so
dropping the key would destroy the recovery path in the course of tidying up. The other triggers are an
accepted-position count and an elapsed interval, whichever comes first; their ground is first-sync cost (§12),
and neither can be set honestly before there is a service to measure. **They have a second ground, which §15
row 6 added**: a checkpoint's head vector is a chain state above any gap beneath it, so cadence also bounds how
long a lost envelope can stall a credential (§7.5). Still not a number this can set — but two inputs rather than
one, and the second is availability rather than cost.

**Retention is at least two checkpoints and their suffixes**, because §11.3 test 8 requires falling back to the
next-newest, and **no generation may be dropped while any retained checkpoint is sealed under it.** Those two
sentences are the whole interlock between checkpoint retention and key retention. The subject is the generation:
a rule that instead forbade dropping *a checkpoint whose generation a retained checkpoint needs* constrains each
checkpoint only by reference to itself, and would leave the mandated fallback authentic but unopenable once its
generation was dropped. **Which objects constitute an opener — the local key envelope, a retained recovery wrap,
a reader wrap — is still open** (§13.7, §15 row 15), and the deletion predicate must read that whole set.

**Whatever attribution-preserving evidence is selected is part of this representation, not a separate operator
archive.** It is portable workspace material encrypted under retained generations, so it is checkpointed, stored
and restored with the workspace: it travels with the archive, uploads with the checkpoint at migration, and a
device enrolling fresh receives it from the service in the ordinary way. There is no separate channel and nothing
the vanished operator has to still be alive to do.

**Must not happen.** No merged state as the recovery representation. No bare state vector as a coverage claim. No
checkpoint that re-signs another credential's operations.

**Test.** §11, checkpoint coverage; fallback to next-newest checkpoint.

### 7.7 Awareness

**Constraint.** Awareness remains **outside** content encryption. The relay may learn who is editing which
workspace and when, while learning nothing about the text. It is **ephemeral and not persisted by default**, and
it must not inherit the retention of durable workspace state.

**What that concedes, said rather than implied.** Names, colours, cursor positions, workspace association and
connection timing are visible to the relay while a connection is live. Encrypting awareness later is a permitted
strengthening; **retaining** it requires an explicit product purpose and its own retention rule.

**Must not happen.** No awareness payload carries document plaintext or a content key. No awareness state is
written to durable storage by default.

---

## 8. Layout and interaction

### 8.1 Responsive shell

One layout system, three breakpoints. The same three surfaces (Menu / Today / Goals) sit on a plane; the
breakpoint decides how many are simultaneously visible.

| Breakpoint | Menu                        | Today      | Goals                       |
| ---------- | --------------------------- | ---------- | --------------------------- |
| **Narrow** | off-screen left, drag right | full width | off-screen right, drag left |
| **Medium** | behind a trigger            | panel      | panel                       |
| **Wide**   | persistent panel            | panel      | panel                       |

Only the current view plus immediate neighbors mount. Neighboring days render their static card lists — cards are
static by default (§4.4), so a revealed neighbor shows real content at no editor cost.

### 8.2 Layout constraints

Stated as constraints because they must hold under any implementation; §8.3 records the approach chosen.

- **The document never scrolls.** Only designated regions scroll internally.
- **Panels are viewport-height bounded.** Use `dvh`, not `vh`.
- **The Today panel is four bands in order:** yesterday peek, header, body, tomorrow peek. Only the body scrolls.
  The peeks bracket the header rather than sitting inside the body — inverting this looks plausible and reads
  wrong.
- **The header is pinned, not sticky.** It lives outside the scrolling region rather than `position: sticky`
  within it. Sticky looks identical but leaves the trigger inside the scrolled subtree.
- **Only the scrolling band may absorb slack.** Both flex and grid give items an automatic minimum size derived
  from content, so a content-sized floor silently defeats the height bound. The fix differs by system —
  `min-height: 0` on a flex child, `minmax(0, 1fr)` on a grid track — which is why this is a constraint rather
  than a rule.
- **Static card render and mounted editor must be visually identical** (§4.4). A styling constraint before it is
  a testing one.

### 8.3 CSS approach

The shell is a **grid**, not nested flex. The three surfaces are named areas and each breakpoint is a different
`grid-template-areas`. The Today panel's four bands are likewise grid rows, where the scrolling band is the only
`minmax(0, 1fr)` track. Flex is appropriate for one-dimensional runs inside components; it is not the shell.

**Cascade layers** order the cascade explicitly: `reset, vendor, app, theme`. The concrete justification is
CodeMirror — it ships its own stylesheet, and this app overrides it heavily. With `vendor` beneath `app`, plain
selectors win by position rather than by specificity escalation.

**Custom properties** carry the design tokens. Their load-bearing job is pixel identity: the static renderer and
the mounted editor consume the same variables through the same markdown-to-HTML path.

**Container queries over viewport media queries for anything inside a panel.**

### 8.4 Gestures

Pointer Events. **Swipe navigates; long-press-then-drag selects.**

1. `pointerdown` records origin and starts a long-press timer (~400 ms).
2. Movement past ~10 px before the timer fires → **navigation.** Lock to the dominant axis, capture the pointer,
   translate the container.
3. Timer fires without movement → **selection mode** in live text. A static Done card instead captures the
   pointer and arms reordering; movement drags it, a stationary release unlocks it.
4. `pointerup` before either → **tap.** Place cursor, mounting an editor if needed (§4.4).

On a fine pointer, Done cards expose a reorder grip. Both paths write once, on release, through the atomic CRDT
reorder operation.

Requires `user-select: none` on the container with selection re-enabled on entering selection mode, and
`touch-action: none` on navigable surfaces. `overscroll-behavior: contain` prevents pull-to-refresh. Gestures must
not require starting at a screen edge.

Vertical drags inside a scrollable region scroll it, and navigate only at a scroll extent with continued motion.

### 8.5 Keyboard

Desktop is keyboard-first. Bindings live in one table so they're discoverable and remappable later.
`Cmd/Ctrl-K` opens a command palette backed by the search index — which must degrade gracefully when the index
hasn't finished its first build (§6.2).

### 8.6 Long-document projections

Long-document navigation is a **view over the master `Y.Text`**, never another document model. No projection may
copy a section into a second `EditorState`, persist a sliced `Y.Text`, or make the user choose a destination
before ordinary text entry.

#### Scroll-aware breadcrumb

The first implementation is the Goals header breadcrumb. Its active position is the first visible document line in
the editor's scroll container. It is explicitly not the selection head (moving the cursor while editing must not
change the location label), not CodeMirror's `viewport.from` (the rendered viewport includes overscan), and not a
persisted CRDT value (it describes one device's view).

At that position, walk headings from the beginning of the document and maintain the ordinary markdown outline
stack. The visible label is `Goals` followed by that stack. Skipped levels are valid; the breadcrumb reports what
was authored rather than repairing it.

The editor extension owns scroll measurement and heading derivation; DOM geometry is read in a CodeMirror
measurement phase; React owns the pinned header rendering. At constrained widths the deepest location must remain
visible; the complete path remains available to assistive technology.

This extension is installed only on the document surface. Card headings are presentation inside items and do not
describe application location.

#### Heading outline and focus

The later outline consumes the same derived heading representation. Navigation dispatches a CodeMirror scroll
effect without moving the selection or focusing the editor, which prevents an outline tap from summoning the
mobile keyboard. Navigating and focusing remain separate commands.

Focus is one editor showing one contiguous heading subtree. Its state is local and ephemeral. Positions must map
through editor transactions so concurrent edits before the subtree do not detach the view from its heading.

Do not implement focus by binding another editor to a substring. A substring has unstable CRDT boundaries, creates
ambiguous insert behavior at both edges, and makes undo and remote edits depend on which projection happened to be
mounted. Hiding ranges in the one bound editor keeps the document, selection, collaboration binding, and undo
history singular.

#### Folding, archive, search, and duplicate diagnostics

- Folding uses CodeMirror view state and markdown heading ranges. It begins expanded, does not sync, and never
  changes source text.
- Archive is a user-initiated text move to a bottom document region, performed atomically and undoably through the
  existing actor-aware CRDT operation boundary. It must not introduce an authoritative per-line lifecycle field.
- Search continues to use the derived index (§6.2). Archive remains indexed.
- Duplicate diagnostics are derived and advisory. Neither exact-match normalization nor similarity scoring is item
  identity. Diagnostics never merge text or propagate completion automatically.

---

## 9. Export, import and the fidelity archive

### 9.1 Export

Export produces a zip of markdown, no server involved, from the decrypted content root in memory:

```
master.md
days/2026-08-05.md      # ## Next / ## Scheduled / ## Done
unfiled.md               # only when retained cards have no visible collection
```

The master list is dumped verbatim — it is already markdown. Collections serialize as lists of cards separated by
blank lines. Since a day _is_ its collections, a day file and a legacy compacted day's `archive` are the same bytes
read by the same parser — so "exactly one serializer" remains literal.

A card can itself contain a blank line, so blank-line-delimited blocks would be ambiguous. Each card is therefore
written as a markdown list item — first line after `- `, the rest indented — which makes a column-zero `- ` line an
unambiguous card start whatever a card holds. The alternative, forbidding blank lines inside cards, would make the
storage format depend on the split threshold, which the PRD calls a tunable.

**What the format carries is what the user wrote, and nothing the app tracked.** `readDayContent` maps a day's
collections through `cardBody`, so a day file holds card **bodies**, in section order, and the date comes from the
filename. Four fields are therefore absent from every ordinary card: **`id`, `author`, `origin` and `createdAt`.**

That is the format doing its job rather than a defect, and each omission has a consequence worth naming once:

| Absent      | Consequence                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| `id`        | Import is not idempotent and cannot merge into a populated workspace (§9.2)                            |
| `author`    | Imported content is a **system-actor** write; pre-import authorship is not recoverable from the export |
| `origin`    | Item provenance — which master line a card came from — does not survive                                |
| `createdAt` | Reconstructed Done order (§4.9) restarts from import time; visible order survives because file order does |

**`unfiled.md` is the one exception and is not a loophole.** It prints each retained card's id and last-known
location as prose, for a human reading the file. It is not a parseable identity field and import must not
treat it as one.

**Exporting does not discharge an attribution claim**, because the workspace keeps making it after the export is
written (§13.7).

### 9.2 Import

**Constraint.** Import is a requirement of equal standing with export. It **creates a workspace's contents; it
does not merge into a populated one.**

Import parses the same layout by recognizing canonical headings and, within each collection, **column-zero `- `
list-item starts**. After the first line, lines bearing the serializer's canonical continuation indentation belong
to that card, and the parser removes exactly that indentation. This includes indentation-only lines representing
blank lines inside the card body. Unindented blank lines are separators and are discarded; they are never used to
infer a card body boundary. The next column-zero list-item start or canonical heading ends the card. Round-tripping
export → import → export must be byte-identical.

**Three things v7 did not say and this document must:**

1. **Import is scoped to an empty workspace.** It serves the first-deployment migration (§14.6) and a clean-install
   restore, both of which target a clean store.
2. **It sits outside the freeze and outside the cap**, as a maintenance rather than an authoring operation
   (§4.5, §4.3), and is attributed to the **system actor**. Gating it as an edit silently drops every day older
   than three.
3. **The byte-identical round trip is a format guarantee and does not supply card identity.** That is the gate that
   keeps merging into a populated workspace a separate project — days collide by construction because entries are
   keyed by date, and nothing distinguishes re-importing the same file from importing new content, so import is not
   idempotent and would duplicate on every repeat.

**Two claims about losslessness are true and one is not, and they are easy to run together.** *Export → import →
export is byte-identical* is a **format** guarantee: required, testable, and about the bytes. *Export → import
restores the workspace* is **false and knowably so**: the four fields in §9.1 do not survive, and no amount of
testing the round trip will surface that, because the round trip is between two files rather than between two
workspaces.

So the honest statement of what import restores is: **everything the user wrote, and nothing the app tracked.**

**Must not happen.** No import into a populated workspace until identity survives the format. No silent truncation
at the freeze or the cap.

**Test.** §11, round-trip — including cards with one or several embedded blank lines; import outside freeze and cap.

### 9.3 The fidelity archive

**Constraint.** Plain Markdown is the permanent **escape** format and the wrong **round-trip** format. The restore
format is a second artifact: an **encrypted fidelity archive** containing CRDT state, retained content-key
generations, `R_pub`, sealed `R_priv` where an account recovery identity exists, and the material needed to resume.

Two constraints on it:

- **A purely Local archive has no account recovery keypair**, so it needs its own explicit portable wrap rather
  than one it does not have. **That wrap is now constructed rather than only required** (`S0-6`, `P-6`): the
  workspace holds one archive keypair, its private half sealed under a generated 125-bit archive code — row
  14's generator, alphabet and normalizer unchanged — beside the same root commitment §14.2 uses, with the
  archive identity's own public key in the slot a lineage would otherwise fill. **One code per workspace, typed
  back once before any archive is described as restorable**, retired to legacy when the workspace is promoted.
  Generations are wrapped to that identity, so import is one path rather than two.
- **It is not a recovery factor.** It answers *does ciphertext still exist* and never *can you decrypt it*. A user
  holding an archive and no code has an encrypted file and no way in.

**It should be app-driven** — a periodic verified archive, or a destination configured once — rather than something
the user is trusted to remember, because it is the one requirement here with a recurring cost to attention.

It is also the format that could eventually carry a non-empty import, since CRDT state is what makes card identity
survive (§9.2).

**It is not a separate artifact from §14's package: it is that format at the never-established lineage state**
(§15 row 10, §13.5). The two constraints above are what that state *means* rather than exceptions to it — no
lineage, so no trust root to anchor and no epochs, head or suffix to carry, and the explicit portable wrap is the
one the absent recovery keypair would otherwise have supplied. **The archive's own signature is integrity within
something already opened**, not an authority: what authenticates a Local archive is the code that opens it, which
is the same sentence as *it answers does ciphertext still exist and never can you decrypt it*.

---

## 10. Known debt and risks

### 10.1 Yjs v13 / v14

`y-codemirror.next@0.3.5` targets Yjs v13 and was last published 2024-06-18. The repo's main branch develops
`@y/codemirror` for Yjs v14, still on `0.0.0-x` pre-release tags. Yjs v14 itself remains in a release-candidate
series.

**Pin Yjs v13 and `y-codemirror.next@0.3.5`.** Migration is planned debt, not a blocker. Isolate every Yjs import
behind one internal module — `src/crdt/yjs.ts`, enforced by `test/seam.test.ts`.

**A stale binding is not a reason to change CRDT.** `@automerge/automerge-codemirror` is at `0.2.0`, last
published 2025-07-21. Judge the binding layer against the other binding layer, not against the library underneath.

**The seam holds imports, not semantics, and v8 makes that gap larger.** Undo scoping (§4.8), the compaction model
(§4.5) and the relay's message loop already encoded Yjs behaviour outside the seam. The envelope layer now adds
update encoding, and the checkpoint manifest adds state vectors and the `DeleteSet` from a snapshot (§7.6). The
seam still bounds a v13 → v14 migration, which is what it was built for. **It bounds a change of CRDT less well
than it did**, and any estimate of that change should count §7 as well as §4.

### 10.2 Many small editors

Cards mount editors individually. Even with static-by-default (§4.4), mount/unmount happens on every focus change
and must feel like a text field, not a modal. Budget in §12. If mount cost proves visible, the fallback is a single
pooled editor instance reparented between cards — more complex, so don't build it preemptively.

### 10.3 Two storage systems

Content-in-IndexedDB plus a derived index means two things that can drift. Mitigation is architectural: the index is
strictly derived and the rebuild path runs routinely. If a bug ever makes the index authoritative for anything,
that's the bug.

### 10.4 Destructive compaction is safety-paused, and now gates two boundaries

Round-trip verification could protect against serializer mistakes but cannot establish that an offline replica has
no unseen edits beneath a type about to be deleted. Compaction therefore defers indefinitely without serializing or
mutating the day. The cost is unbounded document growth; the benefit is that elapsed time is never mistaken for
evidence that all replicas have synchronized. Retained cards from legacy compaction are exposed in the Today
unfiled panel and in `unfiled.md` exports.

**New: the replica-acknowledgement protocol this section requires is gating an attribution boundary too.**
Compaction deletes cards and therefore `Card.author`, which retires the attribution claim for those days and makes
the content-key generations serving only them droppable (§4.5, §13.7). Whoever designs the acknowledgement protocol
is designing the trigger for a key-retention change, and should know it.

~~**One consequence worth naming plainly: the retention floor is currently unbounded in practice.**~~ **Closed by
§15 row 8.** It was unbounded because verifying a claim meant opening the envelope that made it, and every card
ever written still carries a live claim. The selected attribution record is a standing signed object living in
the content root, so §6.1's trim re-seals it under the current generation and **historical generations are no
longer needed to verify historical authorship** (§13.7). What is still true is the storage half of this section:
nothing retires a card, so object count still grows with history.

**When a card is eventually retired, its creation certificate goes with it, and neither goes alone** (`S0-5`).
Since §4.8 derives `card_id` from that certificate, destroying the certificate by itself would leave a card
whose identity no longer recomputes — a worse state than either keeping both or destroying both, and one that
would look like corruption rather than a deletion. **This constrains the shape of a future compaction and not
its schedule:** whether a card may be destroyed at all remains this section's paused question.

### 10.5 Storage eviction

Browsers can evict origin storage. `persist()` reduces but doesn't eliminate the risk. Re-check the grant on every
launch and keep the prominent environment warning visible while persistence is not granted (§6.1, PRD §7.10). That
warning is separate from copy count: when only this device is known to hold a copy, state the fact once on a setup
surface or when the user is about to rely on a second copy. Export or sync creates another copy; **never turn the
single-copy fact into a periodic prompt or recurring banner.**

### 10.6 What is and is not enforceable

**v7 said permissions are unenforceable here and that real enforcement would require giving the relay schema
awareness. That treated enforcement and plaintext authority as one axis when they are two, and the correction
matters because it changes what the agent feature may promise.**

Three things are now enforceable, and none of them costs the relay's content-blindness:

- **Read exclusion is cryptographic.** Content is encrypted and the generation rotates on lost read access; a
  removed credential retains a key that opens history and nothing newer (§13.7).
- **Attribution is client-verifiable.** Every admitted mutation is signed by an epoch-authorized credential and its
  actor is derived or explicitly authorized (§7.4).
- **Accepted-write authority is service-held.** The service serializes epochs and issues acceptance evidence, so a
  revoked credential cannot land a write after the committed cutoff (§7.5).

**What genuinely survives from v7 is the semantic-capability case, and it survives for a different reason than v7
gave.** "The agent may edit the master list but not Done" is unenforceable **because edit cryptographically implies
read under one symmetric content key** (§13.2) — not because the relay is dumb. An agent that can construct a valid
encrypted update holds the key and can decrypt everything. So the agent feature may offer read and read+edit and
must not promise cryptographic write-only isolation; a nominal write-only agent could sign a *proposal* that a
read-capable device validates and encrypts, but then it is not independently editing while that device is offline.

**And the consequence that has to be stated where the feature is described:** granting an agent edit discloses the
entire workspace to it and to whatever service runs it. The relay is blinded by construction and the model provider
is not.

The remaining mitigations are the ordinary ones: attribution makes damage attributable, scoped undo makes it
reversible, and export makes it recoverable.

### 10.7 Framework choice

React + Vite on ecosystem grounds; Svelte is defensible. It barely matters — the editor is CodeMirror and state
lives in Yjs, both framework-agnostic. Decide at Phase 1, don't revisit.

### 10.8 A day's collections are containers created concurrently — deferred

**Deferred, deliberately.** The mitigation in §4.9 holds and is tested. This records what the underlying problem is,
what fixing it would take, and what it would let us delete.

**The mechanism.** `ensureDay` materialises a day as `days.set(date, new Y.Map())`. A `Y.Map` key is last-write-wins
over whole values, so two devices writing to a date neither has touched before mint two different maps for one key,
one wins outright, and **the loser's map is deleted with its three collection arrays and every id in them**. Nothing
is merged, because the container the entries lived in no longer exists.

Flattening does not fix it: `days.set('2026-08-05:done', new Y.Array())` is the same last-write-wins on a fresh
container, one level down.

**Why nothing is lost today.** Card content and canonical location live in roots that merge by id (§4.2), so the
cards survive; the membership repair puts them back. What does not survive is the array position, and §4.9
recomputes one from `Card.createdAt`.

**The fix.** Make a day's collections **root types**, addressed by name — `day:ISODate:section` — rather than values
set into a map. Root types are created lazily and deterministically from their name, so two devices creating one
concurrently get the same logical type and their contents merge.

**What it would let us delete.** The Done branch of `rehomeIndex` (§4.9), the strictly-increasing requirement on
`createdAt` and the monotonic clock behind it, and `compareInstants`.

**What it costs, and one of the four is now much cheaper than v7 recorded.**

1. **Root types are never removed from `doc.share`.** v7 objected that §4.5 rests on object count being "bounded by
   the window, not by history length", and three empty root types per day is bounded by history. **That objection
   has largely lapsed**: destructive compaction is safety-paused and §10.4 already accepts unbounded document growth
   in terms, so the property this cost would falsify is one the shipping product no longer asserts. The absolute
   numbers were always small — on the order of 11k tiny entries after a decade. This is an observation, not a
   decision to proceed; it means the first of the four costs should no longer be counted at full weight.
2. **A schema migration**, run on open, moving every existing day's arrays out of `days` into root types.
3. **`listDays` changes shape.** Days become a filtered enumeration of `doc.share`, and "an untouched day occupies
   nothing" (§4.2) needs re-checking against a store that has an entry for every day ever visited.
4. **`ensureDay`, `dayAt`, `collectionOf`, compaction's deletion path and the `days` observer in `watchMemberships`
   all address collections through the day map** and would each need rewriting.

**When to do it.** Not for correctness — the mitigation is tested and holds. Do it if either appears: the
reconstructed Done order is visibly wrong in real use, or something else needs the day map to stop being a
concurrently-created container.

**Its one cheap window was passed deliberately, and this is recorded so the lapsed cost above is not mistaken for
an oversight.** Costs 2 and 3 arise only where there is existing data to migrate and enumerate, so the change was
at its cheapest before the first deployment, when the first-deployment cutover (§14.6) would have absorbed the
migration for free. It was declined there on risk grounds: that release already carries the largest correctness
risk in the client — replacing the persistence layer — and an unrelated schema change in the same diff trades a
certain increase in risk for a saving on work that may never be done. After the cutover the change costs all four
of its costs, permanently, and only the triggers above should reopen it.

### 10.9 The cryptographic boundary is a web origin

**Same-origin code is inside the end-to-end boundary**, and no key-storage choice changes that. A passkey is
phishing-resistant because it is bound to the relying-party origin; it does not distinguish the intended app from
hostile script served at that legitimate origin. `extractable: false` is a useful misuse guard and **not** an XSS
containment boundary — the WebCrypto specification explicitly allows a `CryptoKey` to be structured-cloned across
origins and warns that injected script may post it to an attacker-controlled origin.

Consequences that belong in the build rather than in the protocol: no unreviewed third-party script in the
key-holding origin; CSP and Trusted Types where supported; dependency integrity; service-worker update integrity;
cookie attributes; and origin checks on the transport upgrade. These are the controls a versioned web-security
baseline covers, and they are a gate before sync ships (§13.11).

**The baseline is selected** (§15 row 17): **OWASP ASVS 5.0.0 at L2 as a floor**, plus eight named L3
requirements pulled up, five addendum controls, and one recorded deviation — 218 of the standard's 345
requirements in scope, 55 excluded with reasons. **A level is a floor rather than a profile**, because the
controls listed above are scattered across L1, L2 and L3: external-asset integrity, CSP reporting,
Cross-Origin-Opener-Policy and dependency provenance are all L3 in a standard whose L2 most applications take.

**The addendum exists because the standard does not model an application of this shape**, and the measurement is
blunt: ASVS 5.0.0 has **one** requirement mentioning browser storage and **none** mentioning Trusted Types,
service workers or offline operation. So `V14.3.3` — no sensitive data in browser storage — is **recorded as a
deviation with a compensating control** rather than dispositioned away, since the entire content of this
application is user data in IndexedDB and §6.1 is what makes that safe. The addendum's first control is stronger
than the requirement it supersedes: **no remote subresource at all**, rather than external hosting with
Subresource Integrity, because SRI pins a byte string and does not remove the party.

**The profile is generated and checks itself**, in
[`test/vectors/web-security-baseline.json`](../test/vectors/web-security-baseline.json): chapters are discovered
from a pinned index of the standard rather than from a list, every exclusion carries a reason and every
conditional one a trigger, every pulled-up requirement is checked to exist and to be L3, and every addendum
control has to cite a section of this document — and, where it claims CI verification, name a check that exists.
**One control is verified now**: `pnpm build` fails if any built file fetches a subresource from outside the
origin.

### 10.10 One new primitive, and it is on the crash path

Everything in §13 composes reviewed constructions except one: the **synchronous AEAD** for the crash journal
(§6.1). It is the only place the design adds a primitive rather than selecting one, it sits on the path whose whole
purpose is surviving a page kill, and its nonce discipline has to survive the same kill. **Review 3a covers it
specifically, and is answered before the first deployment cutover rather than before network sync** (§13.11) —
because this construction lands with the local store, which is far earlier. The latency benchmark on a low-end
device is a build-failing budget rather than an aspiration (§12).

### 10.11 The browser support floor, and where Baseline stops resolving

**The floor is Baseline _newly available_**: a platform feature is in scope once it is supported in the current
stable release of every core browser — Chrome, Edge, Firefox and Safari, desktop and mobile. Not _widely
available_, which is the same bar thirty months later.

**The stricter floor is affordable because there is no installed base to strand**, and it buys two things beyond
tidiness. It keeps the design out of polyfills for capabilities the platform is about to supply anyway, which is
already one of §13.10's selection criteria. And it **bounds the device population from below**, which is the only
thing §12's low-end journal budget can be argued against once it is accepted that the handset it names will not be
acquired: a device running a current stable browser is not a device from the era that would make that budget
interesting.

**Baseline does not resolve either of the two capabilities this design actually asks about, and that is the part
worth writing down.** Checked against the Baseline data rather than assumed, on 2026-08-19:

| Baseline feature   | Status           | Since      | What it does not say                                                                               |
| ------------------ | ---------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| `web-cryptography` | widely available | 2015-07-29 | Which algorithms `SubtleCrypto` accepts. The API predates Ed25519 in it by a decade                |
| `webauthn`         | widely available | 2021-09-07 | Anything about extensions. **There is no Baseline feature for PRF, or for any WebAuthn extension** |

So the floor answers the platform question and neither of §13's. **Where Baseline does not resolve a capability the
design depends on, the floor is stated for that capability specifically, with its evidence and the date the
evidence was taken, and the design says what happens when it is absent.** Four such statements follow, and they
are the whole of the current list.

**Ed25519 is in scope, and needs no fallback path.** Support, from the MDN compatibility data behind
`SubtleCrypto.sign` with `Ed25519`:

| Chrome | Edge | Firefox | Safari | Safari iOS |
| ------ | ---- | ------- | ------ | ---------- |
| 137    | 137  | 129     | 17.0   | 17.0       |

The binding constraint is Chrome and Edge at 137, which is the most recent of the four; every core engine has
shipped it, so it satisfies the floor. **This closes what row 1 recorded as open**, in the terms that record set:
it asked for the support floor to be written down, and noted that an earlier draft of §13.10 anticipated a
fallback path for unavailability without selecting one. Under this floor there is no such state to select for.
Signatures are first used in Stage 4, so the conformance test that turns this from a statement into a check
belongs there (§11.2), not here.

**X25519 is in scope on the same terms as Ed25519, and it was missing from this list.** §13.10 selects HPKE base
mode with DHKEM(X25519, HKDF-SHA-256) for every public-key wrap — the recovery envelope's `R_pub`, the per-reader
generation wrap, and the package generation wrap — so rows 10, 11 and 14 are all load-bearing on it. Row 14 §8
flagged it as the same class of assumption as Ed25519 and asked for it to be answered once here rather than three
times in three rows; this section closed for Ed25519 and did not close for X25519, which is the omission being
corrected.

**The dependency is on the primitive, not on HPKE**, and the distinction matters for what has to be checked. No
engine exposes HPKE through `SubtleCrypto`; the key schedule is built above the primitive, which is why
`scripts/generate-package-vectors.mjs` implements RFC 9180 base mode itself and reproduces A.1.1 before using it.
What the platform must supply is exactly four operations:

| Operation                          | Used by                                        |
| ---------------------------------- | ---------------------------------------------- |
| `generateKey('X25519')`            | the ephemeral sender key in every HPKE seal    |
| `importKey('raw'\|'spki', 'X25519')` | the recipient public key `R_pub` / `W_pub`     |
| `importKey('pkcs8', 'X25519')`     | the recovery scalar `R_priv` once unsealed     |
| `deriveBits({ name: 'X25519' })`   | the DH inside DHKEM                            |

**The absence behaviour, which is the part no compatibility table supplies.** Unlike PRF there is no degraded
mode: a device without these operations cannot be wrapped a content generation, cannot open a recovery envelope,
and cannot import a package. It is therefore **a refusal at the capability check rather than a failure part-way
through a ceremony** — the device reports that it cannot join this workspace, and no enrollment, recovery or
import is begun that it could not finish. That is the same shape as §13.9's answer for a missing authenticator,
and for the same reason: an operation that cannot complete must not consume a credential, a nonce or a transition
id on the way to discovering it.

**The evidence table is deliberately empty, and that is the remaining work.** This section's own rule is a floor
with evidence and the date it was taken; asserting a version row from memory would be worse than the omission it
replaces, because §10.11's dates are the point rather than decoration. A dated `SubtleCrypto` readback of the four
operations above, across the four core engines, is required before Stage 0 closes — and it is the same measurement
row 12's authenticator survey is already offered to review 3b for, so it belongs in that pass.

**WebAuthn PRF cannot be a floor capability at all**, and this is a fact about the feature rather than a gap in the
research. Its availability is not a browser version: it is a matrix of operating system, browser and authenticator
kind. Platform authenticators are reachable in current Safari on macOS and iOS through iCloud Keychain, in Chrome
on Android through Google Password Manager, and in Chrome, Edge and Firefox on Windows; **roaming authenticators
are not reachable from iOS or iPadOS at all**, because the platform does not pass extension data to external keys,
regardless of what the key supports.

**This is why §13.3 makes the generated code the root and the PRF output an additional seal of the same key.** The
design already treats PRF as absent by default, so a matrix this ragged costs a convenience on some combinations
and never a capability on any — and there is no floor to state, because there is no version at which the answer
becomes yes everywhere. **A design that had made PRF the root would need this section to say something it cannot.**

**A usable authenticator is a runtime condition rather than a version, and §13.9 depends on one.** `webauthn` above
is Baseline *widely available*, which answers the API and says nothing about whether the device in front of the user
has a platform authenticator or a security key attached. That is PRF's problem one step less severe: the API is
uniform, the hardware is not. **The design says what happens when it is absent** — the account credential cannot be
created on that device, and its slot has no local verifier, which §13.9 handles with the sentence it already had for
a purely accountless Local slot: sign-out is not presented as though it could protect the slot, and the honest
handoff is export then reset. The runtime check is
`PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`. **Unlike the two statements above, this one
carries no evidence table**, because presence is not a fact about a browser version. What is worth measuring is
which current-stable platform-and-browser combinations expose one, and that measurement is offered to review 3b
(§15 row 12) rather than asserted here.

**What this section is not.** It is a statement of intent and a record of evidence, not a test: nothing in the build
asserts that Ed25519 is present, and the Baseline set moves as browsers ship, so the dates above are the point
rather than decoration.

---

## 11. Testing

**Convergence (property-based).** A fleet of N stores around one relay that holds a replica of its own, driven by
generated schedules of edits, partitions and reconnections. Runs on every commit. Six properties of the fleet are
requirements rather than implementation, because each rules out a way of passing the wrong test.

**It runs at two devices and at three, and three is not a bigger two.** With two, every partition is symmetric and
every replica has seen either all of a change or none of it. With three, one replica can sit *between* the other
two — holding the first half of what one of them did and none of the second — and runs the membership repair on
that partial view. **Whether two independently repairing replicas agree is only a real question once a third can
disagree with both.** Two is kept alongside three because it shrinks to smaller counterexamples, not because it
covers the space.

**Through a hub, not pairwise.** Devices exchange only through the relay, which holds a replica of its own and
forwards what it is given. Anything that converges pairwise but not through a hub passes the wrong test — and this
matters more in v8 than it did, because every sync path is now relay-mediated (§7.3) and the relay is the component
§11.2's tests attack.

**Whole stores, not bare documents.** The membership repair and the undo manager are exactly what concurrency
breaks, so the fleet opens real stores. A property test against bare `Y.Doc`s tests Yjs rather than this app.

**Both delivery orders, at three replicas.** The recorded update log is replayed forwards and reversed into fresh
documents, and the repairs must decide the same thing. TCP does not reorder, but a device that has been away
receives a week in one batch while a device that was present received it a keystroke at a time. The interesting
half is not that Yjs converges — it does — but that `repairCardMemberships` iterates the card registry in
*integration* order, which differs between two replicas that received the same updates in different orders. The
repair has to be indifferent to that.

**Convergence is a fixpoint, and the round count is part of the result.** Reconnect rounds run until no state
vector anywhere moves. A repair that provokes a repair on the far side shows up as a network that takes several
rounds to go quiet; one that never settles shows up as the bound.

**Every run is replayable.** Card ids and client ids both come from the property's seed. Client ids are *drawn*
rather than numbered 1, 2, 3, because their order is what breaks every tie Yjs has to break, and a fixed order
would test one direction of every conflict.

**Must include concurrent card moves** between collections, where array semantics are least obvious.

Hand-written two-replica scenarios remain alongside the fleet and are a different job: named cases with a readable
failure, not coverage.

**Round-trip.** `export → import → export` byte-identical, including card bodies containing one or several blank
lines. Editor content equals stored `Y.Text` after arbitrary edit sequences.

**Import placement.** A ten-day export imports into a clean store with **every** day present, including days older
than the freeze window, and including days whose Next holds more than three items. Import writes as the system
actor and never enters the human's undo stack.

**Compaction safety.** For arbitrary day contents, serialize → parse reproduces the original collections exactly. A
due compaction is mutation-free and defers. A replica offline across the threshold can reconnect with both new
cards and edits to existing card text without either becoming unreachable.

**Freeze independence.** Freeze behavior is identical whether or not a day has been compacted, and compaction timing
never affects what the UI permits.

**Index rebuild determinism.** Index state after incremental updates equals index state after a full rebuild.

**Pixel identity.** Static card render and mounted editor produce identical geometry across every supported markdown
construct. Same test covers live-preview line-height stability.

**Cap enforcement.** No sequence on one device — paste, multi-line insert, undo, drag — produces four cards in
`next`, checked after every operation. Concurrent insert-from-two-devices is the exception: the merged Next may hold
more than three, every card is still in Next on every device, none moved to Scheduled, and no write path adds
another until the user has brought it back under three.

**Done's order across replication.** Each device's own completions read newest-first on every device, for arbitrary
generated schedules of concurrent completion and partition — including a day both devices create at once.

**Undo scoping.** System-actor operations never enter the user's undo stack. Specifically: undo immediately after a
compaction, an import, or a bulk stale-item resolution reverts the user's last _typed_ change. This is the test that
keeps §4.8 honest as the codebase grows new system operations.

**Load before connect.** No transport is constructed until keys are open and local persistence has finished loading
into the document (§6.1).

**Sync-absent.** Full suite passes with no sync provider constructed.

### 11.1 Storage and slot tests

**No plaintext at rest.** A profile snapshot taken after ordinary use — every IndexedDB store, the localStorage
journal, and any derived index — is inspected for recognizable content at genesis, at Local, at Account, and after
deletion, retention expiry and migration. The journal is checked specifically for an unencrypted window between
transaction and commit. **The complementary negative is asserted rather than omitted:** on the default custody tier
a restored profile executing the app's origin **does** open the workspace, and the test records that as expected so
the claim's scope is exercised rather than assumed.

**Journal replay ordering.** After a simulated page kill mid-batch, reopening derives keys, replays the journal and
converges to the pre-kill state. Replay never runs before the key store is open.

**Trim crash-safety.** A crash between writing a `state` record and deleting the records it supersedes leaves a
readable store with duplicate coverage and no loss.

**Store isolation.** Two workspaces open on one device, exercised concurrently including teardown, retry and error
paths: neither provider writes a byte into the other's store, and no update crosses.

**Slot scoping.** A picker in one slot enumerates only that slot's workspaces, with a second slot present and
closed. Enumeration never falls back to a database listing.

**Crash-safe clear and promotion.** Remove-from-device and handoff reset interrupted at each step resume or roll
back, never leaving a store without identity or capability without a store. An interrupted promotion resolves to
exactly one of its two states on next launch.

**Slot reopening, with no network.** A closed slot reopens only on a user-verified assertion from a credential its
binding names. The binding is refused if **any** of its bound fields is altered, including the case that matters:
a public key replaced with one whose authenticator is present and asserting. A presence-only assertion is refused,
and a stale signature counter is not (§13.9).

### 11.2 Protocol conformance

These are the product's stated conformance tests. They are listed here so the suite owns them.

1. A client with only an endpoint and workspace id cannot retrieve usable content or add an accepted envelope.
2. A relay token cannot be used as a mutation credential, content-wrapping key or recovery proof; expiry and refusal
   do not block local use.
3. Changing the workspace id, actor, capability, epoch, ciphertext or update digest invalidates an envelope; an
   envelope cannot be replayed into another workspace.
4. A client that has witnessed epoch *n* rejects an ancestor as current, and the service serializes successor
   commits so two concurrent successors resolve to one accepted epoch with the loser refused rather than forked.
5. After a committed revocation — successor, rotation and finalized cutoff — the removed credential cannot decrypt a
   new generation or create a newly accepted write, while its historical local copy remains usable.
6. **A hostile relay withholds an envelope signed by the revoked credential that is absent from the committed
   accepted set, then delivers it after revocation; every client refuses it.** An envelope included in the pre-commit
   accepted set is still admitted, as is a genuine late-arriving old-epoch update from a still-authorized offline
   device.
7. **Authorization alone cannot cause content-key delivery.** A malicious authorization service admits a credential
   it controls and presents a valid successor epoch; every existing client refuses to wrap or send a content key
   without a separate user-mediated content-delivery proof.
8. **A workspace is migrated, not succeeded, with the original service unreachable.** A clean device restores
   independently held ciphertext using the content-recovery factor, creates an account at a replacement service
   under a new authorization lineage, and then admits and revokes a device. Nothing claims the new service
   inherited the old service's authority.
9. A relay or durable-store snapshot contains ciphertext, `R_pub`, wraps, public authorization material and accepted
   metadata — no unwrapped content key, plaintext, reusable device secret, PRF output, recovery code or unsealed
   `R_priv`. A code-sealed `R_priv` may be present; the test is that nothing in the snapshot **opens** it. **Repeated
   against the escrow agent's store, which must contain a separately sealed `R_priv` and no ciphertext.**
10. Every recovery path is exercised after loss of one device, all devices, a device-bound passkey, an independently
    synced passkey, the account session and the service, checked separately for all four recovery objects. A device
    plus every artifact bound only to it is one correlated loss; loss of every independent content factor is an
    expected permanent-loss outcome, not a bug.
11. Unsupported PRF, interrupted enrollment, duplicate recovery, concurrent authorization changes and a
    half-completed account deletion fail closed without silently changing the confidentiality promise.
    **Specifically** (§13.7, §15 row 15): a fabricated or unsigned refusal never causes a pending transition to be
    rebuilt; a client that resubmits after a lost response commits at most once at its target; the loser of a
    concurrent rotation rebuilds rather than resubmits; a `retire` intent cannot be committed against a `rotate`
    submission or the reverse; and no generation is dropped before its successor's checkpoint is admitted.
12. Mutation verification and first-sync checkpoint verification meet §12's budgets without moving cryptography onto
    the keystroke or local-replay path.
13. No app-managed persistent store yields user-content plaintext (§11.1).
14. The web application is verified as part of the cryptographic boundary (§10.9).
15. **Promotion and migration cannot be confused.** A never-established Local workspace is admitted under a
    device-signed genesis checkpoint binding its pre-account actors, retaining `K0` and creating the first recovery
    keypair. Repeating with a terminal lineage package instead preserves historical attribution, retains the recovery
    identity where available, rotates to a fresh generation and creates a new lineage. Neither path copies the source
    database or accepts an old-lineage envelope into the new accepted set.
16. **A slot-unlock assertion is not an account assertion.** The client mints its challenge under its own label and
    the service refuses it as a sign-in; an assertion collected for one slot opens no other slot and no other
    credential; and the offered `pubKeyCredParams` is the compiled-in list, so a credential outside it is never
    created and a stored key outside the two accepted encodings is refused rather than guessed at (§13.9).

### 11.3 Continuity gate

Demonstrated without production credentials or the original app origin, gating the corresponding release claim and
nothing else:

1. Start an existing installation with app and relay origins unreachable; read and edit normally.
2. Export to Markdown and inspect every user-authored item with ordinary tools.
3. Import that export into a clean, independently served build without losing frozen history.
4. Restore an encrypted workspace archive on a clean device using only saved recovery material.
5. Start the documented self-hosted service and store, and migrate one surviving replica without modifying content.
6. Create a new authorization lineage at the replacement service, then add and revoke a device.
7. With two devices diverged while the former service was unavailable, use one replica to establish the replacement
   workspace; enroll the other, verify it applies the checkpoint, retains its own divergent work and re-signs **only
   its own credential's** operations, then converge edits made after enrollment. Verify separately that operations
   from a third credential which never reached the archive are **not** re-signed by the enrolling device.
8. Repeat with the store holding the newest checkpoint unavailable, falling back to the next-newest retained
   checkpoint and its suffix.
9. **Run 4 through 7 again with the entire original provider account unavailable** — every service the company
   operated — using only material the user already holds.

Tests 1–3 are cheap and near-term; 4–9 are a serious program, and 9 is the one that cannot be faked.

### 11.4 Service data handling

Generated tests rather than a policy document, because that is the evidence standard the as-built review applies
(PRD §7.11). Each of these checks a claim §16 makes.

**Every inventory row's deletion event is exercised.** For each row in §16, perform its named event and assert the
data is absent from its named store. **A row whose deletion event cannot be exercised is a defect in the row**, not
an exemption from the test.

**Backups do not outlive their source.** A row deleted at its deletion event does not reappear from a backup taken
before it and restored after.

**Subject enumeration, export and correction.** For each subject — account, workspace, device credential — the data
attributable to it can be enumerated and exported, and no aggregate measurement returns a subject identifier that
the subject's deletion did not clear.

**Diagnostics carry no secret.** Logs, telemetry and support artifacts are generated under load and inspected for
reusable credentials, recovery material and plaintext content. The allowlist is the mechanism; the test is that
nothing outside it appears.

**Presence is not persisted.** After a connection closes, no store contains awareness payloads (§7.7).

**Service-side deletion does not disable a local replica.** After account deletion and after suspension, a device
that was offline throughout still opens its last replica and still exports.

---

## 12. Performance budgets

Build-failing thresholds, not aspirations.

| Metric                                       | Budget           |
| -------------------------------------------- | ---------------- |
| Keystroke → paint                            | < 16 ms p95      |
| Card focus → editable                        | < 50 ms          |
| Cold start → Today editable                  | < 2.5 s          |
| Warm start → Today editable                  | < 1.0 s          |
| Day-to-day navigation                        | < 100 ms         |
| Search results (10k items)                   | < 150 ms         |
| Initial JS bundle (excl. lazy wasm)          | < 350 KB gzipped |
| Content-root load (encoded state)            | < 500 ms         |
| **Key store open → `K_g` unsealed**          | **< 100 ms**     |
| **Journal AEAD write, low-end device**       | **< 1 ms p95**   |
| **Envelope sign (async, off the edit path)** | **< 5 ms p95**   |
| **Envelope verify on receipt**               | **< 2 ms p95**   |
| **First-sync checkpoint verify**             | **< 1.5 s**      |
| **In-memory index first build**              | **< 1.5 s, off the cold-start path** |

**The cold-start budget is the one at risk**, and it should be watched rather than assumed. It now absorbs a key
store read, an unseal and per-record decryption on load, none of which existed when 2.5 s was set. If measurement
says the budget cannot hold, the honest responses are fewer stored records (more aggressive trimming, §6.1) or a
revised budget — not moving verification onto a lazy path where it silently stops happening.

**The journal budget is a correctness budget in disguise.** The synchronous AEAD runs inside a handler that must not
return until the write has happened, so exceeding it does not make the app slow, it makes typing stutter.

**It was measured on hardware, found exceeded at 4 kB, and is now met at every payload measured.** The full
synchronous write — seal, base64 and the `localStorage.setItem` the journal already performs — was **145 µs p95 at
the 18-byte common case and 295 µs at 419 bytes on a Pixel 9a, against 1 ms; at 4 kB it was 1 930 µs.** The breach
reproduced within 1.4% across two runs and survived a drift check, so it was a payload effect rather than a warm
phone. **It is closed by a WASM seal** (§15 row 2), measured on the same handset: **35 µs, 65 µs and 240 µs p95**,
the last with 4.2× of margin. The paired JS baseline in that session reproduced the breach to 0.8%, so the two
columns are one comparison rather than two measurements. See `docs/performance.md`.

**The payload qualifier is still not settled, and closing the breach did not settle it.** Large pastes and unusually
large documents remain outside what this specification treats. What has changed is that the question is no longer
forced by a failing number.

**Two findings sit underneath it and outlive the number.** The row names the AEAD, and **at 4 kB the AEAD is no longer
the largest term** — base64 costs about as much. And **an emulated CPU throttle is not a conservative stand-in for a
device**: a 4× throttle predicted 266 µs where the phone measures 1 498 µs, understating by 5.6×, because a phone is
not uniformly slower — its pure-JS arithmetic degrades 43× while paths reaching native code degrade 5×. §15 row 2's
extrapolation from a desktop margin was therefore unsound in kind, not merely in degree.

**No faster path exists in JavaScript, and that is structural.** This write is synchronous by construction and
WebCrypto is async, so no hardware-accelerated route exists to reach for — which is §10.10's point, now with a number
against it. Two independent pure-JS implementations measure within 1% of each other, so the wall is the language
rather than one library's code shape.

**A WASM cipher keeps the call synchronous, and this is now built rather than argued.** Compilation has a synchronous
form — Chromium caps synchronous main-thread compilation at 8 MB and the module is 6 465 bytes — and exported
functions are ordinary synchronous calls, provided the module is **inlined rather than fetched**: a fetched module
opens a window between the app accepting an edit and the journal being able to seal it, which is the window this
journal exists to close. Inlined and compiled synchronously there is no such window at all, because instantiation is
paid inside bundle evaluation. See [performance.md](./performance.md).

The lazily-loaded wasm sits outside the initial bundle budget; the app must be fully usable for writing before it
arrives.

---

## 13. Keys, credentials and authorization

New in v8. This section fixes the architecture, the roles and the negative constraints. **It does not select the
protocol** — §13.10 carries the suite that is selected and §15 is the register of what is not.

### 13.1 What is fixed before anything is chosen

**Two powers must never collapse into one: authorization and decryption.** The service is the sole authorization
authority. The user holds the sealed recovery private key. The service cannot decrypt a workspace under any proof
or any order.

Everything below is downstream of that, and any construction that violates it is wrong however elegant.

### 13.2 The key hierarchy

| Artifact                                   | May do                                                                                               | Must not do                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **Account authenticator / local verifier** | Authenticate the person to the service; prove locally that a closed slot belongs to them             | Decrypt content, sign mutations, create a relay session while offline, change authorization     |
| **Relay admission token**                  | Open a scoped transport connection for a bounded time                                                | Decrypt, sign content, admit a device, change capabilities, recover an account                  |
| **Device / agent signing credential**      | Sign mutations as its authorized actor                                                                | Receive a content key merely because it can sign; change authorization                          |
| **Device / agent wrapping credential**     | Unwrap content keys if read-capable                                                                   | Sign mutations, change authorization, represent an arbitrary actor                              |
| **Certified recipient set** (§13.5)        | Name the exact `(credential, W_pub)` pairs and the `R_pub` a rotator may wrap to                     | Be authored or amended by the service; grant capability; assert accepted positions              |
| **Recovery-bootstrap signer** (§13.8)      | Authenticate one successor binding when no eligible client survives, from the factor-opened recovery object | Be held by the service; exist outside the content factor's seal; be reused for a second binding |
| **Local-custody key `L_local`**            | Open this slot's encrypted `K_g` envelopes on the default tier                                       | Sign, authenticate an account, unwrap `R_priv`, travel to another device                        |
| **Optional device-lock custody `L_lock`**  | Replace promptless opening of those envelopes with a user-factor gate (§13.3)                        | Sign, authenticate an account, become a recovery factor implicitly, be opened by recovery       |
| **Service authorization authority**        | Admit and revoke credentials, choose capabilities, sign epochs, finalize accepted sets               | Decrypt, sign a device's mutations, represent its actor, deliver a content key by authorization alone |
| **Content-key generation `K_g`**           | Derive domain-separated subkeys for one workspace generation                                          | Admit or revoke anything; authorize its own distribution; be reused across stores or protocols  |
| **Recovery public key `R_pub`**            | Wrap each `K_g` for recovery                                                                          | Unwrap any generation, authorize anything                                                       |
| **Recovery private key `R_priv`**          | Unwrap recovery copies of `K_g` after device loss                                                     | Admit or revoke anything, sign mutations, recover the service account                           |

**Signing and wrapping are two jobs and the contract may not assume one key does both.** Signing proves who sent an
envelope; public-key encryption or key agreement lets a content key be wrapped for one reader. A library may
represent them together; this document may not.

**The asymmetric recovery shape is load-bearing, not a preference.** A symmetric recovery root present on every
device would let a later-revoked device derive future generations. A symmetric root absent from ordinary devices
could not wrap new generations without being re-entered. `R_pub` resolves the contradiction: an authorized client
creates a new random `K_g` and makes a recovery wrap during ordinary operation, while only sealed `R_priv` opens it.

**Subkeys are domain-separated from `K_g`, never `K_g` itself.** At minimum: a content-store subkey (§6.1), a
synchronous-journal subkey (§6.1), a network-envelope subkey (§7.4), a checkpoint subkey (§7.6), and later an
index subkey. **All of them differ by label alone**, which is what makes this separation a property of the labels
rather than of five constructions a reviewer has to compare by hand. **One primitive key
must not be reused across the asynchronous and synchronous constructions**, which is also why `K_g` cannot itself be
the structured-cloned non-extractable key — WebCrypto cannot later wrap a non-extractable target.

**Edit implies read.** Under one symmetric key per generation there is no cryptographic write-without-read. This is a
capability limit, not a policy one, and the agent feature inherits it (§10.6).

### 13.3 Local custody and the optional device lock

**Constraint.** Opening a workspace requires no prompt by default, and the default tier makes **no claim against an
attacker who can execute the app's origin from a copied profile**. That scoping sentence travels with the property
everywhere it is described.

**Approach.** `L_local` persists as a structured-cloned non-extractable `CryptoKey` — the one representation the
browser offers that cannot be trivially serialized out — and every locally needed `K_g` persists **only** as bytes
sealed under it. Opening a workspace briefly unseals those bytes and derives the subkeys; promotion, rotation and
recovery may use the same brief plaintext interval to create reader and `R_pub` wraps before erasing it.

**With the optional device lock, factor-gated custody replaces the promptless handle.** No default handle capable of
opening the envelopes remains. It unlocks at cold start, and it **strengthens custody of a key that already exists**;
it is not the switch that turns encryption on.

**The construction, selected** (§15 row 13). A **generated 125-bit code is always enrolled and is the root**; a
WebAuthn PRF output, where the platform supplies one (§10.11 — and it is a matrix rather than a version), is an
**additional seal of the same key** rather than an
alternative to it — §13.8's rule that PRF's optionality is not a product branch, applied a second time. A
user-chosen passphrase is **rejected**: the seal sits in the profile beside the ciphertext it protects, so guessing
is offline and unrateable for the attacker this feature exists to resist, and a browser origin has no rate-limiting
anchor except the authenticator.

**Factors seal a random `L_lock`, which takes `L_local`'s place in §6.1's key envelope** — same format, same AAD,
different key. So adding, replacing or removing a factor is one 32-byte seal that moves no content and no content
key. **The separation between §13.4's four factor roles lives inside the PRF evaluation input**, not in a derivation
label applied afterwards: one evaluation and four labels would leave whoever holds that output holding all four keys.
The input binds the role and the slot, so one assertion yields one slot's key for one role.

**Enrollment reseals and then rotates.** `L_local` is non-extractable, so the lock cannot adopt it: enrollment
generates `L_lock`, seals it under every factor, reseals each retained generation's envelope, and deletes `L_local`
and swaps the envelopes **in one transaction** — the state that must never exist is no `L_local` and unresealed
envelopes. **It then rotates the content key forward**, because resealing leaves `K_g` unchanged and a profile copy
taken before enrollment would otherwise keep opening content written after it. Rotation is forward-only: history is
not re-keyed, because the copy that motivates the rotation already holds it.

**The custody record is written at genesis on the default tier**, saying promptless, and is read by nothing until a
lock is enrolled. Adding it later would be a migration over the first deployment's key material.

**What this buys and what it does not.** It defeats **file-level** exposure: an OS backup, a disk image, a synced
profile directory, a forensic tool, a support person with filesystem access, freed blocks after deletion, and a
trivially-readable plaintext journal. It defeats **nothing at the code level**.

**Failure.** Forgetting the device-lock factor loses this device's readable copy. At a never-admitted Local workspace
whose last readable replica this is, that is total and final — accepted, on the same terms as the recovery code.
**The disclosure at enrollment is therefore two texts, not one**, because the consequence has two sizes: at an account
workspace the workspace survives and the device re-enrolls, and at Local there is no second copy anywhere.

**The copy must not claim the lock is retroactive.** A backup or profile copy made before enrollment was made without
it and stays readable; what rotation buys is everything written from that point on.

**Must not happen.** `L_local` may not sign, authenticate an account, unwrap `R_priv`, or leave the device. No
lifecycle event may materialize a plaintext store. **Recovery may not open a locked slot**: a device whose factor is
lost re-enrolls as a device, and a lock that `R_priv` can bypass is a preference rather than a lock.

**Test.** §11.1, no plaintext at rest.

### 13.4 Device and agent credentials

**Constraint.** Device signing and wrapping private keys are **non-extractable at runtime**, with two honest
persisted representations:

- **Where PRF is absent**, each persists as a structured-cloned non-extractable `CryptoKey`.
- **Where PRF is available**, encrypted private-key bytes persist under a PRF-derived wrapping key and are imported
  as non-extractable runtime keys after unlock.

A non-extractable target key is **not** described as "wrapped": WebCrypto wrapping is an export operation and cannot
wrap a key whose extractability forbids export.

**Those two tiers are keyed on PRF availability, and a locked slot needs a third** (`S0-2`, `P-2`). Where PRF is
absent the wrapping private key persists as a structured-cloned non-extractable `CryptoKey` — promptless, and
therefore usable from a copied profile. §13.3's lock protects the `KeyEnvelope` and leaves that credential
untouched, so rotation publishes a reader wrap the pre-lock copy can open: the lock is bypassed without being
attacked, on the tier the code factor makes the common one (§10.11).

**Enabling the lock therefore replaces the wrapping credential rather than re-sealing it**, and the sentence above
is why it must: the existing key cannot be exported, so it cannot be brought under a factor. The replacement is
generated as extractable bytes, sealed under `L_lock`, and imported as a non-extractable runtime key after unlock
— the PRF tier's own pattern with `L_lock` as the factor source, not a new carrier. Its introduction is a
certified-set successor (§13.5), so every future rotator wraps to the replacement automatically. **The predecessor
stays valid until that successor and the generation winner are both durably known**, which keeps an interrupted
lock recoverable; the interval in which a pre-lock copy still holds `K_g` is exactly what `rotation_owed` exists
to state, and no interface may claim future-copy protection while it is true.

**The device list shows which tier a device is on.** A two-tier assurance bar is acceptable; a silent one is not.

**This unlock gates sync, not the app** (§7.1). These credentials sign envelopes and receive new keys; they do not
open the local store.

**What the PRF wrap buys, precisely.** It protects the *persisted wrapper* against an attacker who has the browser
profile but cannot produce a platform assertion — a stolen laptop, a copied profile, an OS backup — and the value is
concentrated in the window *before the owner knows to revoke*. It buys nothing against live same-origin code (§10.9).

**Four factor roles are distinct even where one authenticator ceremony supplies more than one, and their outputs are
domain-separated and never substituted:** the account authenticator / slot verifier, the device-key PRF, the optional
content device lock, and any optional recovery-factor PRF. Opening a slot is not creating an account session;
unlocking a signing key is not recovering `R_priv`; recovering `R_priv` is not an account assertion.

**Sign-out clears their live outputs with the rest of the slot's in-memory state; it does not destroy their persisted
representations.**

**WebAuthn is not a drop-in mutation-signing key.** Assertions are user-agent-mediated ceremonies over a challenge.
The workable shape derives a wrapping key from a PRF output and unlocks an ordinary device credential — not invoking
WebAuthn per update.

### 13.5 The authorization lineage

**Constraint.** One signed object serves five requirements at once, so it is designed once rather than five times.
It must:

| Requirement                             | What it needs from the lineage                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| Distinguish genesis from admitted       | **Signed, and verifiable without a local secret**                                |
| Enrollment                              | An admission binding the new device to the existing principal                    |
| Exclusion                               | Key rotation recorded when a read-capable credential loses access                |
| Revocation commit                       | A definite committed epoch, signed and serialized by the service                 |
| Attribution                             | The credential, capabilities and represented actor authorized for each mutation  |

**Payload.** Each epoch binds the workspace's membership grants, device and agent credentials, capabilities,
current content-key generation, **the acceptance-signing key `K_accept` in force, and the accepted-head vector**
— `(credential, position, link)` for every credential as of that epoch (§7.5, §15 row 5). **Generation is broader
than membership**, because admitting a second device changes authorization without creating a second member.

**A service-signed epoch does not by itself license key delivery, and that is the correction §15 row 11 forced**
(`S0-2`). The epoch is simultaneously the roster a rotator reads and a document only the service signs, which is
how account authorization alone could cause *delayed* content-key delivery: a credential the service admitted and
no person enrolled is indistinguishable, at the next unrelated rotation, from one whose ceremony succeeded. The
epoch therefore additionally carries a **certified recipient set**, which the service serialises and cannot author:

> `CertifiedSet = LP("done/certified-set/v1") || LP(dec v) || LP(workspace_id) || LP(lineage_id) || LP(dec parent_epoch) || LP(dec next_epoch) || LP(hex members_digest) || LP(hex recovery_state_digest)`
>
> `members_digest = SHA-256( LP("done/certified-members/v1") || ( LP(credential_id) || LP(hex W_pub) )* sorted by credential_id )`
>
> `recovery_state_digest = SHA-256( LP("done/recovery-state/v1") || LP(dec counter) || LP(hex R_pub) || LP(hex recovery_envelope_digest) || LP(hex root_commitment) )`

**The binding is credential-to-exact-wrapping-key, not credential-to-boolean**, because the roster was never the
thing that was missing — the service does enumerate credentials. What was missing is an approval of the exact key
a rotator will encrypt to, so a service-admitted credential has no approved `(credential, W_pub)` pair and
receives no wrap. The recovery recipient sits in the same object for the same reason: substituting `R_pub` is that
attack through a second carrier, and one approval covers both.

**One eligible content-holding client's signature suffices** (`P-1`). `approvals[]` is a list, so a threshold is
later a verifier policy change rather than a format migration; a hard quorum is not selected, because it would
make a one-device workspace unable to enroll its second device.

**This does not change what the head vector is or who asserts it.** The epoch stays service-signed as a whole and
the approvals ride inside it as bytes the service cannot forge; accepted positions remain the service's to assert,
because positions are exactly what it is authoritative over. Verifiers check the epoch signature as before and
additionally check the approvals over `members_digest` and `recovery_state_digest` (§7.5, §15 row 5).

**The head vector is what makes an equivocating service have to fork the lineage**, rather than merely withhold.
The epoch already says which credentials exist; this says where each one had got to, so a device shown a
different accepted history is shown a different epoch — and epochs are serialized, signed and ancestor-checked.
Certifying `K_accept` here is what lets the hot acceptance key rotate without touching the authorization key.

**Three states, and absence is not retirement.** *Never established* — no epoch exists at all. *Live* — the service
signs successors. *Retired* — a signed terminal record exists and no successor will. The terminal record is what
lets a surviving replica prove its workspace was historically admitted after the service is gone.

**Hosted content is a second axis and not a fourth state here** (§14.7). A workspace whose payment lapsed, whose
hosted copy has expired, or whose hosted store is empty is **`live` on this axis** — the lineage keeps signing
successors and the devices keep writing. Only `retire` moves this axis, and reading a stopped hosted copy as a
retired lineage is the confusion §14.7 exists to prevent.

**It lives beside the content root, not inside it.** It is a separate signed object; the relay validates live epochs
and clients verify them. **It must never be read from document-resident, mutable, unauthenticated data** — which is
exactly the mistake a roster-based test makes (§4.8).

**Detection rule.** Absent means never-admitted genesis and local identity may be re-minted silently. A signed live
head or terminal record means historically admitted and the app must **not** silently mint a replacement identity.
This is asked **per workspace**, never per device: one device can hold a lineage-absent Local workspace and a
live-lineage Account workspace in the same profile.

**Rollback protection is bounded and the bound must be stated.** A returning client remembers the newest head it has
seen and rejects an ancestor. A **brand-new** client trusts the service to identify the current head, and no
construction fixes that.

**What is selected is how far *brand-new* reaches, and what is left when it stops** (§15 row 9). **Two of the
three arrival paths are not brand-new.** A device enrolling through §13.6 receives the head **through the
person** — row 11's transcript binds the epoch head, so the typed symbols authenticate where the lineage is as
well as whose wrapping key it is. A device restoring from a user-held migration package or fidelity archive has
an anchor from outside the service for the same reason, and §14's package formats owe a signed head because of
it. **The third — recovery with no surviving device (§13.8) — asks:**

```
Assertion = Ed25519( K_auth ; LP("done/head-assert/v1") || LP(workspace_id) || LP(dec epoch)
              || LP(hex epoch_head) || LP(hex client_nonce) || LP(dec issued_at) )
```

**The nonce separates a hostile relay from a hostile authorization service**, which is §7.3's own boundary:
without it an assertion is a standing artifact any intermediary may re-serve forever, and replay needs no key at
all. `issued_at` is bound and **displayed rather than enforced** — a device recovering after total loss has no
trustworthy clock — and the recovery screen showing the epoch, its age and the device list it implies is part of
the construction rather than copy around it. A device records its head at first contact; from then on the
ancestor rule above applies and this mechanism is finished.

**The residual, and its bound.** A hostile authorization service can serve a recovering device a stale,
self-consistent head at first contact. **It cannot also show current content**: §7.5 makes revocation atomic
with rotation, so a hidden revocation is a hidden generation, and a device held on the stale generation cannot
read anything written after it. The attack degrades to a partition — availability rather than integrity — and
its symptom is the one thing a person running a recovery is looking at. That bound is weakest on a workspace
with little history since the rotation, and it is a bound rather than a guarantee.

**Test.** §11.2 tests 4 and 15.

### 13.6 Enrollment, and promotion

**Constraint.** Enrollment has two independent gates and neither may satisfy the other:

1. **Authorization.** Account authentication lets the service admit the new device credential and sign a successor
   epoch. No existing device needs to be online.
2. **Content-key delivery.** The new device receives a key from an existing device or unwraps it with an independent
   recovery factor. **Service authorization alone must never cause an existing client to release a content key.**

The second gate is the one that stops a malicious service turning authorization authority into decryption authority.
It is also where correlated loss bites: a phone, its device credential, a device-bound passkey, its local ciphertext
and a recovery code saved on that phone are five artifacts and **one** failure domain.

**That gate held for the immediate release and not for the delayed one, which is what `S0-2` repairs.** The
ceremony below stops an existing client releasing `K_g` to a service-admitted credential *now*. It did not stop
that credential being wrapped `K_(g+1)` at the next unrelated rotation, because nothing durable recorded which
credentials a person had actually enrolled — so the rotator fell back on the epoch roster. **A successful
ceremony therefore produces a certified recipient-set successor** (§13.5), signed by the existing device that
released the key and countersigned by the new credential on install. That record, not the roster, is what a
future rotator reads.

**The transcript binds the recovery recipient as well as the wrapping key**, for the same reason at a second
carrier: a service that supplies the new device an attacker-controlled `R_pub` and a matching opaque envelope
gets the honest new device to wrap future generations to it. The `recovery_state_digest` the new device installs
is inside what the typed symbols authenticate, so an existing client cannot be induced to certify a recovery
recipient it does not itself hold.

**Enrollment is not complete at admission, and the states are distinct**: service-admitted, ceremony-committed,
SAS-confirmed, key-and-recovery-state-delivered, installed-and-countersigned, certified. Only the last is
reader-eligible. A crash resumes the same transcript or restarts with a fresh credential; a mismatch spends the
credential.

**The ceremony that discharges the second gate is selected** (§15 row 11): a **short authentication string over
an in-band agreement**, with both nonces **committed before either is revealed**, derived from a transcript
binding the workspace, the epoch **and its head**, both credential ids and the new device's wrapping public key.
**The head is bound because §15 row 9 asked for it**: a device enrolling here is talking to one that already
knows where the lineage is, so the same typed symbols authenticate that too and §13.5's brand-new case never
reaches this path. Five Crockford
Base32 symbols — row 14's alphabet, mask and normalization, reused — **displayed on the new device and typed
into the existing one**, because the existing device is the one deciding whether to release a content key and a
comparison is satisfied by pressing the affirmative button. The wrap is HPKE base with
`info = LP("done/enroll-wrap/v1") || LP(hex transcript_hash)`, so **a wrap made for one ceremony opens under no
other** and the ceremony cannot be separated from the delivery it authorized.

**Three properties travel with that, and none is presentation.** The commitment is what makes the string's 25
bits mean 25 bits: whoever reveals second and is uncommitted can grind its nonce until the string comes out as
it likes, and §15 row 5's companion record demonstrates the search rather than asserting it. **A mismatch spends
the credential** — refusal reaches the authorization service, re-enrolling mints a new credential and a new
transcript, and there is no retry of the same ceremony — which is what makes the strength per admitted
credential rather than per attempt. **And QR is an accelerator, not an alternative**: where `BarcodeDetector`
exists the same transcript may be read by camera instead of by person, with the same bits and the same failure
mode. It cannot be the root — a decoder does not fit §12's bundle headroom, and camera availability is a matrix
of browser, OS, permission and hardware, which is §13.3's finding about PRF applied a third time.

**What this asks of the person is one thing the recovery code does not.** Enrollment needs **both devices awake**,
because the out-of-band channel is somebody looking at two screens; §13.7's rotation is deliberately
store-and-forward and this deliberately is not. The escape hatch is already in gate 2 above — an independent
recovery factor needs no second device.

**Promotion of a never-established Local workspace is a finite key and admission operation, not a content
transformation.** In order: keep the workspace and its current `K0`; create the enrolling device's signing and
wrapping keypairs; create `(R_pub, R_priv)`; seal `R_priv` to the confirmed high-entropy code and any independent
optional factors; wrap `K0` to `R_pub` and to the device's wrapping public key; sign the authenticated genesis
checkpoint; establish the first authorization head; **then erase unsealed `R_priv`.** The service receives only
public keys, sealed private-key envelopes, wrapped content keys, ciphertext and signed admission evidence.

**The genesis checkpoint is a bounded exception to per-mutation envelopes and is not an attribution exception.** A
never-established workspace has never put a mutation onto a shared lineage, so its local history need not have been
signed. The enrolling device attests the one-device history it is promoting and binds the pre-account human actor and
permitted system actor to its newly admitted credential. **A retired-lineage workspace cannot use this shortcut**,
because its historical writes already have several admitted sources: it uses migration instead (§14).

**Promotion is a move, not a copy, and it is crash-safe.** Which workspace a store belongs to is a single committed
fact, and an interrupted promotion resolves to exactly one of the two states on next launch. A copy would leave a
stale duplicate that diverges and is later believed.

**Test.** §11.1 crash-safe promotion; §11.2 tests 7 and 15.

### 13.7 Rotation and generation retention

**Constraint.** Rotation is **client-produced and service-committed**. An authorized owner device generates fresh
`K_(g+1)`, wraps it to **exactly the `(credential, W_pub)` pairs in the certified recipient set of its parent
epoch and to exactly that set's `R_pub`** (§13.5), and submits those wraps with the authorization successor and
accepted-set cutoff. The service atomically commits and signs that package. Removed credentials receive no wrap.

**A rotator reads the certified set, never a roster, a service-supplied key, or a capability flag.** That sentence
is the whole of the delayed-delivery repair: an authorized-but-uncertified credential is not a recipient, so
authorization alone cannot cause key delivery either immediately or later.

**No construction may give the service the key in order to simplify its commit.**

**The transition protocol is selected** (§15 row 15), **and it is one protocol at three kinds** — `rotate`,
`replace-recovery` (§13.8) and `retire` (§14.4) — because §11.2 test 11's list is one class: a multi-step
transition whose interrupted middle can be mistaken for a completed **lesser** transition. A rotation that did not
settle reads as no rotation being needed; a half-finished retirement reads as a workspace that merely stopped
syncing (PRD §6.10). **Lapse is not a fourth kind and deliberately not in this grammar** — it is a billing fact
carried by §14.7's retention machine, which is why this list is three and stays three.

> `Intent  = LP("done/transition/v1") || LP(dec v) || LP(kind) || LP(workspace_id) || LP(lineage_id) || LP(dec parent_epoch) || LP(dec target) || LP(hex payload_digest)`
> `Outcome = LP("done/transition-out/v1") || LP(dec v) || LP(kind) || LP(workspace_id) || LP(lineage_id) || LP(dec target) || LP(dec epoch) || LP(hex committed_id)`

The intent is signed by the requesting device credential and `id = SHA-256(Intent)`; the outcome is signed by the
lineage authorization key. **`kind` is bound in both, and PRD §6.10 is why**: a `rotate` and a `retire` are
otherwise the same eight fields, so an unbound `kind` is a way to submit one and commit the other. That is §6.1's
editable-`kind` finding at a third object, and here the consequence is that a rotation retires a lineage.
**What that closes is exactly the pair it names, and not lapse**: no field of a `rotate` expresses a payment
lapse, a synchronization stop or a retention deadline, so binding `kind` cannot protect a state the grammar has
no way to say. §14.7 carries that state, and §15 row 15 records the narrowing. **There is
no `from_gen` and no `state` flag**: the epoch already binds the current generation, and whether a client won is
`committed_id == its own id` — a second binding of a derivable fact is a thing that can disagree with it (§15
rows 10 and 12).

**The client rule has three cases, and the third is why the outcome must be signed.** Silence: wait, then
resubmit the **identical bytes** — the payload digest sorts its parts, so a rebuild reproduces the id exactly, and
the service commits at most one intent per `(lineage_id, kind, target)`. `committed_id` equal to its own id:
apply. `committed_id` different: **discard and rebuild against the new epoch, never resubmit**, because the
exclusion set was computed against an epoch that has moved and resubmitting would revoke the wrong credential.
**Everything that is not a verified outcome is silence** — a timeout, a reset, an unsigned error body — because
the third case discards a live content key and anything that can withhold an outcome can fabricate one. §7.4's
rule that a definite refusal licenses a re-mint and silence does not is the same rule; **what this adds is where a
definite refusal comes from.**

**Neither half of a rotation may precede the commit.** No content is written under the target generation before a
verified committed outcome and none under the previous generation after it, so the atomic commit is one transition
point rather than a window in which the excluded credential can still read new writes. **The pending intent is
persisted before the first network byte**, which is what makes a crash between commit and local switch resolvable:
the client resubmits and is told its own id.

**A verified outcome begins local application rather than completing it, and `applying` is a durable record**
(§15 row 15 names the state; `S0-2` makes it a record). A matching winner is not a state change, it is the
licence to start one, and every step between is a crash point:

> 1 outcome verified and persisted · 2 successor opener installed · 3 old-generation objects classified ·
> 4 permissible local work covered under `g+1` · **5 active epoch/generation advanced — the commit point** ·
> 6 successor checkpoint admitted and local content trimmed · 7 old openers retired under this section's
> predicate · 8 the apply record itself discharged

Each step is idempotent and restart resumes at the recorded step. Steps 1–4 are reversible; step 5 is not, and it
may only be taken once no new write can select `g` and `g+1` is reopenable. **Device lock (§13.3) and recovery
replacement (§13.8) apply through this same machine** rather than each defining its own, which is what stops a
committed transition, a locked device and a replaced recovery set from having three different crash semantics. **Three states must never exist** — a committed transition with no
local record it was intended, content under a generation no committed epoch names, and a dropped generation with
no checkpoint under its successor.

**A client that cannot reach the service stays pending, and that is the fail-closed direction.** Timing out and
rebuilding is the attack above performed by the network.

**Every wrap to `R_pub` binds the lineage it was made under** (§15 row 10):

```
info = LP("done/gen-wrap/v1") || LP(workspace_id) || LP(lineage_id) || LP(hex auth_root) || LP(dec gen)
```

as HPKE base-mode `info`. It is §14.2's trust-root anchor, and it lives here because here is where the wrap is
made. The binding is **per generation**, which §14.1 makes correct rather than convenient: a migration rotates
forward under a new lineage, so generations written before it stay anchored to the root that was in force when
they were written. For a never-established workspace both lineage fields are empty (§9.3).

**Rotation moves the propagation problem, it does not remove it** — from "tell everyone the new identifier" to "get
the new key to every remaining reader". Every remaining credential is reachable through the relay, which holds the
wrapped key until that device next connects: store-and-forward, not both-devices-awake.

**The excluded credential must be told.** From its side the workspace simply stops updating, and "no new changes" is
a false statement. The rotation therefore carries a signal the excluded credential can still read even though the
content is closed to it. This is a protocol requirement falling out of an honesty rule, and it is easy to miss
because the cryptography works fine without it.

**That signal is now a field rather than an obligation.** §7.5's finalized head — `final: true` at the removed
credential's last accepted position — is signed over public material and needs no content key, so a revoked
device can verify *the workspace stopped accepting your writes at position n* instead of inferring it from
silence (§15 row 5).

**A rotation's honest promise is narrower than the obvious one, and the product owes the narrow version**
(§15 row 15). A device that has not yet observed the committed outcome keeps writing under the previous
generation, and §11.2 test 6 requires admitting a genuine late-arriving old-epoch update from a still-authorized
offline device — so an excluded credential can read those writes. It cannot be closed without refusing to write
while possibly stale, which is §7.1's rule inverted. **The promise is therefore: from the commit, content written
by devices that have observed it is closed to that credential** — not that the workspace is closed to it, which
was never true of its history. The window is one device's propagation delay, the exclusion is legible to the
excluded credential through the finalized head, and obtaining the ciphertext at all is what the finalization
boundary refuses (§11.2 test 6).

**Two retention questions exist and they are different objects.**

- **Local store retention** (§6.1): a device needs every generation its own records are sealed under. Trimming to one
  state record under the current generation discharges the rest. **The previous generation is droppable only when
  four things hold** — §15 row 15's three, plus the one that discharges §7.6's fallback: the transition is
  settled, a checkpoint under the new generation is admitted (§7.6), the local trim holds a state record under it,
  **and every retained checkpoint still sealed under the previous generation has at least one surviving authorized
  opener**. The first three permit the drop; only the fourth keeps the second-newest checkpoint openable, which is
  what §11.3 test 8 falls back to. **The predicate is stated over openers rather than over the local key
  envelope**, because deleting that envelope does not necessarily end access — a retained recovery or reader wrap
  may still open the generation — so a reference ledger over journals, batches, outbound envelopes, accepted
  marks, checkpoints, suffixes, packages and wraps is what the drop consults. An interrupted rotation is exactly what violates
  §7.6's cadence rule, because the obvious implementation clears the obligation when the epoch commits — which is
  before the checkpoint exists.
- **Attribution retention**: the attributed actor sits **inside the seal**, so verifying historical authorship
  requires decrypting. **Retain enough to open every generation whose attribution the product still claims — or stop
  claiming it.** The floor is *for the lifetime of the claim*, not forever, and destructive compaction is the
  sanctioned way a claim ends (§4.5, §10.4). In the shipping product compaction is paused, so this floor is unbounded
  in practice.

Conflating those two will over-retain. A device may legitimately trim its local store while still holding older
generations for attribution, and vice versa.

**A smaller attribution floor is selected** (§15 row 8), **and it closes the unbounded one.** The representation is
a standing signed claim, minted by the **writing** credential at card creation:

```
R = LP("done/attrib/v1") || LP(dec v) || LP(workspace_id) || LP(card_id) || LP(actor_id)
    || LP(actor_kind) || LP(credential_id) || LP(dec epoch) || LP(hex content_commitment)
sig = Ed25519( the writing device's signing credential ; R )
content_commitment = SHA-256( LP("done/attrib-body/v1") || LP(card_id) || LP(body at creation) )
```

**Copying an original envelope signature beside a newly assembled tuple does not work** — that signature
authenticates the original envelope and ciphertext, not the new tuple or its association with the current card —
so the claim is signed over the tuple directly, at write time, by the credential making it. §7.4 permits a source
to sign only its own operations, and a claim is one; **no later party can mint these.**

**The records live in the content root**, in a write-once map keyed by card id, which is what §7.6 already
requires of attribution evidence: portable workspace material, checkpointed, stored and restored with the
workspace rather than held in a separate channel. **That is what closes the floor.** §6.1's trim collapses the
store to one state record under the current generation and the records come with it, so verifying historical
authorship no longer requires historical generations, and the two retention questions above stop being different
sizes. What remains is the local-store question, which the trim already discharges.

**The signature and the commitment answer different questions and the product must not merge them.** The
signature says a credential made this claim; the commitment says whether the card still holds what was claimed
about. **A card edited after creation verifies and is not exact**, which is the honest reading of §4.8's
card-creation attribution rather than a defect in it, and provenance mode owes three states rather than two.

**A claim retires when its card does, and on no other event.** §4.5 already says compaction deletes cards,
therefore retires the attribution claim; putting the record beside the card means there is one trigger rather
than two that must agree. The storage bound is one record per card, minted once: **a constant multiple of what
the cards already cost**, not a new growth class.

**Test.** §11.2 test 5.

### 13.8 Recovery

**Constraint.** Four objects may be missing and no mechanism supplies another's:

| Object                   | Supplied by                                                        |
| ------------------------ | -------------------------------------------------------------------- |
| 1. Account access        | Account recovery                                                    |
| 2. Authorization         | The service admitting a replacement credential                       |
| 3. Content-key access    | The saved code or another independent wrap of `R_priv`               |
| 4. Ciphertext            | A surviving device, the hosted copy, or a fidelity archive (§9.3)    |

**Object 4's three sources do not share a lifetime, and the middle one has a deadline.** During a lapse the
hosted copy is retained for **twelve months** from the moment synchronization stops, which bounds this whole
path: after expiry the hosted ciphertext and its per-generation wraps are gone, while `R_pub` and the
code-sealed `R_priv` envelope remain, so a surviving device can re-seed without a new code ceremony
(§15 row 16, PRD §6.10). **A fidelity archive does not inherit that deadline** and is the reason the deadline
is tolerable.

**`R_priv` is sealed 1-of-N, and a high-entropy code saved outside the enrolling device is the mandatory floor.**
Every account has one; there is no account without one. Account creation requires the user to **re-enter it before the
account exists**.

**The code is selected** (§15 row 14): **125 bits, Crockford Base32, five groups of five, and no stretching at all.**
The alphabet omits `I`, `L`, `O` and `U`, which is what lets the input field map `O` to `0` and `I`/`L` to `1`
without collision — a correct transcription of a badly rendered code still opens the workspace. The envelope seals
`R_priv` **and §14.2's root commitment** under HKDF-SHA-256 of the code with a fresh per-seal salt, so exactly one
message is ever encrypted under that key and nonce reuse is structurally unreachable. **The commitment rides here
rather than in its own object** because it must be protected by exactly what protects `R_priv` and must be
available at exactly the moment `R_priv` is: one AEAD, one seal, and nothing further for the user to keep. **The no-stretching decision rests on the invariant in
§13.10**: the code is generated at full width and is never user-chosen, user-extended or truncated. Additional independent seals may be added — PRF-capable passkeys, preferably in more than one
ecosystem — and each is a complete path only if it remains available after loss of the device it protects.

**No threshold, no quorum, no lockout when a threshold cannot be met.**

**Rejected as recovery factors, each for a specific reason.** A password or passphrase, because server-held sealed
data permits offline guessing. Email or support proof, because it is escrow wearing a different label: if a fresh
device can decrypt after email alone, the service had enough capability to make that happen. Threshold splitting,
which buys nothing over 1-of-N at this scale while adding setup, explanation and a new failure mode.

**Re-entry proves transcription and possession, never location.** A user who pastes the code into a note on the same
phone passes every test the app can run. Saying so is refusing to let a mechanism take credit for a property only the
copy can carry — which puts the weight on what is said at the moment of generation.

**PRF's optionality is not a product branch**, and that is a consequence of the code being mandatory. An authenticator
returning no PRF result costs its owner an optional convenience wrap and nothing else: no branch, no device-dependent
security bar, no silent downgrade.

**The code is never re-displayed; replacement exists instead.** Re-display would require retaining a recoverable copy.
Replacement is allowed only from a device that already has content access: after fresh account authentication and an
explicit confirmation, it creates a new recovery keypair, seals the new `R_priv` to a newly confirmed code and optional
factors, rewraps every required generation to the new `R_pub`, and asks the service to atomically replace the old
public key, wraps and sealed envelope. **That replacement is §13.7's transition protocol at `kind:
'replace-recovery'`** (§15 row 15), so an interruption leaves exactly the old envelope or exactly the new — never
both live, which would leave the old code still opening content. **It cannot help after the last content key and the old code are both gone.**

**"Exactly the new" is a claim about bytes, so the bytes are in the signature** (`S0-2`). The replacement intent's
payload binds the counter, the new `R_pub`, **the exact sealed envelope bytes including its tag**, the root
commitment (§14.2), and **the exact wrap bytes for every rewrapped generation** — the same shape `rotate` already
uses, rather than a list of generation numbers. A digest over which generations were rewrapped, and not over what
they were rewrapped to, cannot make atomicity mean that one exact complete set won.

**Replacement after exposure rotates forward, and the payload says which.** Resealing leaves `K_g` unchanged, so an
exposed `R_priv` still opens current content after a replacement that only re-encrypts it — the same shape as
§13.3's reason for rotating after a device lock. The payload therefore carries a `successor-generation`, and the
only way not to rotate is the explicit value `none-lost-not-copied`, available solely where the product can
distinguish *lost* from *copied* and say so to the user. **Replacement described as the answer to an exposed code
must rotate**, or the promise is not kept.

**"Fresh account authentication" is a bound challenge, not a freshness window** (§15 row 14). Three gates, and two of
them are free: **content access** is proven by use, since replacement must rewrap every required generation to the new
`R_pub` and has therefore already opened them; **the device lock** is implied where the slot has one, because §13.3
makes it the gate on opening `K_g` envelopes and the first gate opens them. An implementation that adds a second
prompt has misread where the lock sits. The third gate is an assertion from the account credential (§13.9) over

> `challenge = SHA-256( LP("done/recovery-replace/v1") || LP(dec v) || LP(hex intent_id) || LP(hex nonce) )`

with **32 fresh nonce bytes per attempt, issued by the service and retired on use**. A five-minute window is a
parameter with no principled value, and what it approximates is *this assertion was collected for this operation* — so
the operation is bound directly and there is no clock to skew. **The nonce is what makes single-use true rather than
said**: without it the challenge is a pure function of the operation, and an assertion collected for a replacement
that never completed stays presentable indefinitely — §13.5's standing artifact, replayable with no key at all.

**It binds the §13.7 transition id rather than the new public key.** The id covers `kind`, the lineage, the parent
epoch and the payload — the new key among them — so binding the key beside it would be a second binding of a fact
already inside it, and it means a `replace-recovery` step-up cannot be redirected to a `retire`. **It binds no
principal or credential id**, where §13.9's slot-unlock challenge binds both: that challenge is client-constructed for
a device-local gate and names device-local things, this one is service-issued for a service operation and names the
operation as the service knows it. Binding a credential id would also forbid answering from a second passkey the
account has registered.

**The old code is deliberately not required**, because replacement exists for the holder who still has their devices
and has lost or exposed the code, and demanding the lost object is the one requirement guaranteed to be unmeetable
exactly when the flow is needed. **The residual is stated rather than left to be found:** a party holding a device
*and* the account credential can replace the envelope and destroy the owner's recovery path. That party already has
content access, so this widens no confidentiality boundary — it is an availability loss, strictly less than deleting
the account outright, and PRD §7.6's explicit confirmation is where it is surfaced.

**Escrow is excluded from the service by construction**, because a decryption capability is a compellable capability.
An opt-in add-on may exist only if operated by a **separate legal entity** and scoped to a separately sealed `R_priv`
and nothing else. Split that way, the service holds ciphertext, wraps and a code-sealed private key while the escrow
agent holds a separately sealed private key and no ciphertext, so **neither party alone can produce plaintext**. The
residual — the escrow agent's public key ships to every client — is carried by release integrity rather than custody:
reproducible, checksummed artifacts and the implementation audit the add-on triggers.

**Test.** §11.2 tests 9 and 10.

### 13.9 The account credential and the local slot verifier

**Constraint.** Reopening a closed slot requires proof, it is local, and it grants nothing on the network.

Account enrollment leaves an offline-verifiable slot-unlock binding on the device. Reopening requires proof of the
same account credential, plus the optional device-lock factor if that slot uses one; **knowing that a closed slot
exists is not enough.** That proof reopens already-local state and grants **no relay token, no account session and no
authorization change.** When the service is reachable it separately authenticates the account and restores network
capabilities.

**A purely accountless Local slot has no account credential**, so the product does not present account sign-out as
though it could protect it. Its honest handoff on a shared installation is export then reset. **A device with no
usable authenticator has no local verifier either, and gets the same sentence** — the degradation is stated rather
than replaced by a weaker gate.

**The construction, selected** (§15 row 12). The account credential is a **WebAuthn discoverable credential** on the
account service's RP ID, created at account creation, and the verifier **checks a signature rather than a secret**.
`pubKeyCredParams` is fixed, ordered and part of the carrier version: Ed25519 (COSE -8) preferred, ES256 (COSE -7)
accepted; both verify in WebCrypto, so the offline verifier needs no polyfill. **The row uses no WebAuthn
extension**, which is why this role can root on the authenticator where §13.3's device lock could not: PRF is an
extension whose availability is a matrix (§10.11), and a signature is the core of the API.

**Offline-guessing resistance is satisfied by absence rather than by cost.** There is no secret in the profile to
grind: the private key is in the authenticator, and "guessing" the verifier means forging a signature. This is
§13.10's third answer of _none_ to the stretching question and the strongest of them — rows 13 and 14 argued that a
generated 125-bit code leaves no entropy deficit, and here there is no deficit **and no secret**.

**The clause protects the network credential rather than the slot, and that is why it is in this section.** A
verifier that was a checkable function of a low-entropy secret would let a profile holder recover the credential
that authenticates to the *service* — which §13.2 forbids this artifact supplying while offline. The local gate
against the person at a shared keyboard is a different and lesser thing, and §13.3's scoping sentence applies to it
unchanged.

**Each credential gets a service-signed binding in the slot index, and that anchor is load-bearing.** An asymmetric
verifier removes the guessable secret and introduces a **substitutable public key**, and §6.5's index holds a
structured clone whose properties the load path trusts — §6.1's rule about editable fields, at a different store.
The binding is signed by the authorization key of the epoch it names (§13.5) over

> `LP("done/slotbind/v1") || LP(dec v) || LP(account_id) || LP(principal_id) || LP(rp_id) || LP(dec epoch) || LP(cred_id) || LP(hex public_key)`

so substituting a key requires the service's private key rather than write access to IndexedDB. **The public key is
stored as SubjectPublicKeyInfo and there is no separate algorithm field**: the encoding names its own algorithm, the
accepted encodings are a compiled-in set of two, and an unrecognized one is refused rather than guessed at.

**The unlock assertion is bound to the operation, not to a clock** — the rule row 14 §5 selects for step-up (§13.8),
reused here at a challenge with different provenance and therefore a different field list:

> `challenge = SHA-256( LP("done/slotunlock/v1") || LP(dec v) || LP(principal_id) || LP(cred_id) || LP(hex nonce) )`

with 32 fresh random nonce bytes per attempt. **The label is the purpose**, and it is what stops a slot-unlock
assertion being presented to the service as a sign-in; the service's own challenges being service-issued and
single-use is the second and independent refusal. Verification checks the binding first, then the returned
credential id, then the client data — **parsed, never rebuilt** — then `rpIdHash` and both the UP and UV flags, then
the assertion signature. **The signature counter is read and ignored**, because a synced passkey cannot maintain one
and a verifier enforcing monotonicity refuses the ordinary case while detecting nothing.

**Two bounds, stated rather than left to be found.** A binding signed in one epoch still verifies on a device that
has not seen the epoch revoking its credential — bounded by this section's own guarantee, since what a stale binding
opens is already-local state and nothing on the network, and closed by §13.5's lineage the moment the device is
online. And **recovery is the fallback for this gate only**: §13.3's prohibition stands, so a locked slot still
requires its device-lock factor afterwards.

**Test.** §11.1, slot reopening; §11.2 test 16.

### 13.10 The selected suite

**Suite 1, selected as a whole** (§15 row 1), and **no role is a candidate any more.** The criteria it was selected
against still govern anything added to it: reviewed and widely implemented; available in browsers without a
polyfill where possible; and **no primitive reused across the asynchronous and synchronous paths** (§13.2).

| Role                                    | Selected                                     | Path  |
| --------------------------------------- | -------------------------------------------- | ----- |
| Content store, key envelope and network envelope AEAD | AES-256-GCM via WebCrypto      | async |
| **Synchronous journal AEAD**            | **XChaCha20-Poly1305**, from the audited RustCrypto `chacha20poly1305` crate compiled to an inlined wasm module (`wasm/journal-seal`), instantiated synchronously | sync  |
| Subkey derivation                       | HKDF-SHA-256 via WebCrypto, domain-separated labels | async |
| Mutation signatures                     | Ed25519 via WebCrypto                        | async |
| Wrapping a key to a public key          | HPKE base mode (RFC 9180), DHKEM(X25519, HKDF-SHA256) / HKDF-SHA256 / AES-256-GCM | async |
| Hash                                    | SHA-256                                      | —     |
| **Recovery-code and device-lock stretching** | **None.** HKDF only                     | —     |
| **Account credential and slot verifier** | **A WebAuthn assertion**, offered as Ed25519 (COSE -8) then **ES256 (COSE -7)** and verified in WebCrypto. No extension, so no PRF dependency (§13.9, §15 row 12) | async |
| **Slot-verifier stretching**            | **None, and nothing to stretch** — the verifier holds a public key, not a secret | — |

**Agility is a carrier version, not a per-record algorithm field.** A version selects the entire suite, so there is
nothing to negotiate and nothing to downgrade, and every carrier authenticates its own version — a renumbered record
fails to open rather than selecting a weaker suite.

**The §13.2 separation rule is machine-checked rather than asserted.** Row 1's generator buckets every role above by
path and fails if any primitive appears in both. **It also checks its own deferrals against §15**, and fails if a
role it publishes as unfilled points at a row that has since been selected — which had happened to three of them
before the check existed.

**The journal AEAD reaches its implementation through a second toolchain, and that is the one open criterion
question.** "Reviewed and widely implemented" is satisfied by the RustCrypto `chacha20poly1305` crate; what it does
not obviously settle is whether compiling that reviewed source through `rustc` and `wasm32-unknown-unknown` inherits
the property, since the artifact a user runs is not the artifact anyone reviewed. **This is review 3a's to answer,
and it is the only item in 3a's scope that is a criterion rather than a construction.** What the project can do
about it, it has done: the module is built from a pinned crate, regenerated reproducibly by
`node scripts/build-wasm-seal.mjs`, and checked on every `pnpm check` against draft-irtf-cfrg-xchacha-03 §A.3.1 and
row 2's composition vectors — so a compiled artifact that computes something other than XChaCha20-Poly1305 fails the
build rather than shipping.

**It also adds one platform dependency, which is inside the floor and stated because it is a hard failure.** The
module is compiled with `+simd128`, and a SIMD module **fails to instantiate** where SIMD is absent rather than
running slowly. WebAssembly SIMD is Baseline from Safari 16.4, well inside the §10.11 floor whose binding constraint
is Ed25519 at Safari 17.0 — so no device that can run this app lacks it, and there is no fallback state to design.

**"Argon2id, or none" is answered three times, and each answer rests on less than the one before.** For the recovery
code, an attacker must first fetch a service-held envelope, after which guessing is offline (§13.8). For the device
lock the seal sits in the profile beside the ciphertext it protects, so guessing is offline from the start (§13.3).
**In both cases the code is generated at 125 bits and the deficit a work factor exists to cover does not exist.** A
work factor would multiply an already unreachable number while trading an unconditional argument for one that decays
with hardware. **For the slot verifier there is no secret in the profile at all** (§13.9), so the question a work
factor answers is not asked: nothing is being checked against a guess.

**That answer rests on one invariant, which is therefore normative rather than incidental: every such code is
generated by the app at full width, and is never user-chosen, never user-extended, and never displayed or accepted
in a truncated form.** If any of those changes, the stretching question reopens that day, and it reopens as a real
one.

**One role's primitive is not this document's to select, and that is a fact about WebAuthn rather than a gap.**
Credential creation is a negotiation: the relying party offers an ordered `pubKeyCredParams` and the authenticator
picks. **The agility rule above survives in a different form** — the negotiation happens once, at creation, and its
result is frozen inside a service-signed binding, so no assertion renegotiates anything and there is no
per-assertion algorithm field. What replaces *no algorithm field* is *one algorithm field, signed, written once*,
and it is carried by the key encoding rather than stored beside it. **ES256 is the one primitive added to the suite
since it was selected**, under the criteria above rather than around them, and it is added because the authenticator
chooses it. RS256 is not offered.

### 13.11 Assurance

Five cumulative levels; three gates.

| Level                                      | Evidence produced                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 1. Project-owned threat model and tests    | This document's constraints, §11.2's vectors, negative tests, CI controls                          |
| 2. Versioned web-security baseline         | **OWASP ASVS 5.0.0 at L2 as a floor**, plus 8 pulled-up L3 requirements, 5 addendum controls and 1 recorded deviation — the profile is generated and self-checking (§10.9, §15 row 17) |
| 3a. Independent storage and journal review | The encrypted record format, the local key hierarchy, and the synchronous journal AEAD with its nonce discipline (§6.1, §13.2, §13.3) |
| 3b. Independent protocol design review     | Authorization, key delivery, envelopes, epochs, rotation, recovery, downgrade                       |
| 4. Independent implementation audit        | The shipped client, relay and deployment against this contract                                     |
| 5. Ongoing disclosure and response program | Reporting path, rotation/recovery runbook, dependency monitoring, incident drills                  |

**Levels 1–3 before network sync ships. Level 5 live from the day it ships. Level 4 on a stated trigger** — the phrase
*end-to-end encrypted* appearing in marketing copy, or the escrow add-on holding a real key.

**"Ships" is defined, because it had to be.** It means the first deployment that carries data belonging to anyone
but the author — a deliberately bounded test audience included — or any public description of the security
properties. **The author synchronizing his own devices through his own service is development and precedes every
gate.** PRD §7.11's as-built data review is a separate and later gate, at wider availability, so a bounded test
audience sits between the two.

**Level 3 is two engagements with different deadlines, because encryption at rest ships before network sync.** The
journal AEAD is the only new primitive in the plan (§10.10) and it lands with the local store, so one combined
review would either arrive too late to protect it or hold the storage work until the protocol was specified.

- **3a — storage and journal**, covering §15 rows 1, 2, 3, 13 and the storage-facing part of 14 — **that scope
  is closed** (§15.1), so this review reads constructions and vectors rather than a register. Answered
  **before the first deployment cutover** (§14.6), not before the storage work begins: a defect found during implementation costs a rework,
  whereas the same defect found after cutover has written a real deployment's data under a broken construction,
  and a nonce-reuse fault is retroactive.
- **3b — the protocol**, covering §15 rows 4–12, 15–17 and 20, plus the network-facing part of 14 — **that scope is
  closed too** (§15.1), so this review also reads constructions and vectors rather than a register. What it is
  additionally *asked* is whether the service rate-limits envelope fetch, which is a service-hardening question
  rather than a construction and is put to the reviewer as one. Answered **before network sync ships.** Rows 18, 19
  and 21 belong to neither review (§15).

**Level 2's profile is selected in Stage 0 and verified before Stage 4 ships**, and the split is the same one
level 3 uses: recording which requirements apply is worth doing while the answer is cheap to change, and most of
the 218 in scope are about a service that does not exist yet.

**Both design reviews wait on their scope in §15 being closed.** Booking a design review of architecture alone buys an opinion about
a sketch; the reviewer needs concrete state, envelopes, rotation, finalization and test vectors. That sequencing is
the main reason §15 exists as a list rather than as prose.

---

## 14. Service replacement and migration

### 14.1 Migration replaces succession

**Constraint.** The workspace moves; the old service's authority does not. The replacement service establishes a
**new** lineage, the client rotates to a **fresh** generation, and the existing recovery keypair is reused where the
user holds it.

**The two enrollment gates stay separate** (§13.6): the replacement service may authorize a new credential, but only a
surviving content-holding device or `R_priv` unsealed by a recovery factor may deliver the old content keys.
**Possession of restored content does not prove continuity of the former account; it creates a new one.**

**Migration cannot manufacture a terminal record from an authority that has vanished.** If the old service is
reachable, migration requests deletion or a signed terminal commit. If it is not, the portable cutover package marks
that lineage **superseded for this restored workspace**, and the fresh lineage identifier plus accepted checkpoint
prevents any old envelope from replaying into it. The old service, if it returns, may still regard its own copy as
live — **migration has isolated that copy, not remotely revoked it** — and the product must say so.

### 14.2 The cutover checkpoint

**The problem, which is easy to miss because both halves are individually correct.** Every historical envelope carries
the *former* service's acceptance evidence, issued under a key the replacement has no reason to honour. Replaying them
under the new lineage cannot work, and must not, or migration would be a way to launder unaccepted writes into a fresh
workspace. But a checkpoint that re-baselines acceptance also re-signs everyone's history as one client, which §7.4
forbids.

**The resolution is a checkpoint whose construction preserves attribution.** The restoring client attests the state it
recovered; the new service accepts that attestation as the lineage's origin; the prior envelope history becomes
**archival rather than replayable**. Every write after the checkpoint carries the new service's evidence in the
ordinary way.

**Verifying a pre-migration write end to end needs four things**, and the package must carry all four:

1. **An authenticated old trust root** — the vanished service's authorization signing key, bound so it cannot be
   substituted. Otherwise whoever can write the archive can rewrite who wrote what.
2. **Enough of the old authorization history** to establish which credential held which capability at the referenced
   epoch.
3. **Either the original signed envelopes or a validated attribution-preserving checkpoint.** The checkpoint is the
   target, since retaining every envelope grows without bound.
4. **The historical content-key generations**, because the attributed actor is inside the seal (§13.7).

**`info` is not that binding, and `S0-6` corrects it.** HPKE base mode is anonymous: sealing needs only the
recipient's public key, and `R_pub` travels in the package. Every field in `info` — workspace, lineage,
`auth_root`, generation — is public or attacker-chosen. So binding the root there stops a wrap being
*reinterpreted* under a different root and does nothing about one being *minted*: an attacker picks their own
`auth_root'`, signs a fabricated history under it, wraps their own generation key to the **genuine** `R_pub`
with `info` naming `auth_root'`, and the victim's own recovery code opens it. Everything verifies, under a root
the attacker chose. **The published negative mutates `info` on existing ciphertext, which of course fails, and
never attempts the fresh wrap.**

**The correction is the one this section already asks for: put it behind the code.** The recovery envelope
seals a root commitment beside `R_priv`:

> `RootCommitment = SHA-256( LP("done/pkg-root/v1") || LP(workspace_id) || LP(lineage_id) || LP(hex auth_root) )`

An importer opens the envelope with the user's code, recomputes the commitment from the manifest's own three
fields, and **refuses a mismatch before attempting a single generation unwrap**. An attacker cannot produce the
matching sealed commitment, because sealing it requires the code — which is exactly "the chain terminates in
material the user holds", made structural instead of asserted. The `info` binding stays as it is; it defeats
cross-lineage and cross-generation reuse, which is a different attack and a real one.

**HPKE `mode_auth` was the other candidate and is declined for a product reason rather than a cryptographic
one.** It binds a sender's static key, and the legitimate assembler here is not a fixed identity — any
authorized device, or the service assembling a terminal package — so there is no single key an importer could
pin. The factor is the one thing the user holds across all of them.

**Item 1's binding is selected, and it is the only one of the five that could not be a part of the package**
(§15 row 10). Every other item is service-signed, so a forger supplying their own root can re-sign all of it and
produce something internally consistent that says whatever it likes about who wrote what. The chain has to
terminate in material the user holds, and §13.8 makes exactly one thing mandatory: the recovery code. So the
root is bound in the **HPKE `info` of every generation wrap** (§13.7) — a substituted root derives a different
key schedule, the wrap opens nothing, and there is no content left to re-attribute. In `info` rather than in the
AEAD's associated data, because `info` is never transmitted: a reader must **supply** the root it believes
rather than read one out of the package.

**Only one reader needs that anchor, which is §15 row 9's argument again.** A surviving device knows the root
from its own enrollment, and a device enrolled through §13.6 receives it through the person. Recovery with no
surviving device is the case that asks — and it is the case that must hold the code.

**A fifth thing is owed for a different reason, and §15 row 9 is why.** The package must carry **the old
lineage's signed head at the moment it was made**, because a restoring device is otherwise brand-new in §13.5's
sense and has to ask the replacement service where the lineage stood. A user-held package is the one artifact
that can answer that from outside any service, and it costs one signature it is already carrying the key to
verify. Row 10 selects the format, and this is the package's `head` part.

**None of this is succession.** It proves who wrote history and authorizes nothing. The rule that nobody changes
authorization outside the service is untouched by material that cannot change anything.

### 14.3 Each device re-envelops its own suffix

**The cutover window produces divergence on every enrolled device, not just the restoring one**, because offline-first
means devices keep writing throughout and a migration is a service event.

- **A device's own window edits are its own writes**, so on enrolling under the new lineage it re-signs them and
  submits them as ordinary envelopes. Nothing is re-attributed: the same credential and actor sign the same
  operations.
- **The enrolling device applies the admitted checkpoint first and descends from it by construction.** Its own
  pre-migration work survives alongside everything the checkpoint brought, because both are replicas of one workspace
  sharing an ancestor. Descent is a state the device *reaches*, not a qualification it has or lacks.
- **A state vector alone cannot authenticate coverage** (§7.6). Use the snapshot's `{sv, ds}` pair or a receipt.
- **A delta cannot be filtered by signing credential** (§4.8). The device retains its **own outbound signed
  envelopes** since the checkpoint, which it has by construction, and re-envelops the same operations under the new
  epoch.
- **Coverage is a subtraction, not a filter.** Checkpoint plus this device's own envelope suffix accounts for part of
  its replica; any residue — operations it *received* from another device during the window — is not this device's to
  carry and it cannot honestly re-sign it. That residue travels on **that** device's enrollment.

**The one thing migration cannot carry.** Operations from a credential that reached one device and never reached the
archive travel on that credential's enrollment or not at all. If the device that wrote them never enrolls, they are
gone — not replaced, not adjudicated, simply never re-signed under a lineage that would accept them.

**The window should therefore be short**, and that is a design requirement rather than an aspiration.

**Test.** §11.3 test 7.

### 14.4 Account deletion and the terminal package

**There is one package format, at §13.5's three lineage states, rather than two formats** (§15 row 10). What
this section describes is the service *populating the portable package* of §14.2 before deletion, not producing
a second artifact — and *importing the package later upgrades its knowledge*, below, is a live package moving to
retired rather than being replaced. §9.3's fidelity archive is the third state, of a workspace whose lineage was
never established. One format, one importer, one verifier:

```
Manifest = Ed25519( assembler ; LP("done/pkg/v1") || LP(dec v) || LP(workspace_id) || LP(lineage_id)
             || LP(lineage_state) || LP(hex auth_root) || LP(hex lineage_head_digest)
             || LP(dec epoch) || LP(hex parts_digest) || LP(assembled_by) )

parts    = checkpoint · epochs · suffix · generations · head · recovery
           ASCENDING BY NAME: LP(name) || LP(dec count) || LP(hex digest), digested under
           LP("done/pkg-parts/v1")
```

**There is no attribution part, and §15 row 8 is why**: the claims live in the content root, so they are inside
the checkpoint the package already carries — which is what §7.6 required of attribution evidence in the first
place. **There is no separate part count either**, because each part's count is already inside `parts_digest`,
and a second binding of the same fact could disagree with it. `assembled_by` names a credential resolvable from
the epochs the package carries, or the trust root itself when the service assembled it here, or — where there is
no lineage — the archiving device, which nothing external certifies and §9.3 already says so.

**That commit is §13.7's transition protocol at `kind: 'retire'`, and the ordering is the fail-closed property
rather than an implementation detail** (§15 row 15). A lapse and a deletion differ in exactly one artifact —
the terminal record — so an interrupted deletion must leave a **retired lineage whose hosted content is still
present**, which is honest and recoverable-looking.

**The reverse order is not merely untidy, and §14.7 is what makes that precise.** Hosted content deleted under a
live lineage is a legitimate state — it is what expiry produces — but a legitimate one carries a signed retention
mark that says when synchronization stopped, when the deadline fell, and that the recovery anchor was kept. A
deletion that ran before its terminal record leaves the same absence with **nothing accounting for it**, and is
indistinguishable to every surviving device from an expiry that was never disclosed. That is PRD §6.10's warning
realized, and the artifact that separates the two cases is the mark rather than the intent.

**Before the service deletes anything it commits a signed terminal lineage record.** Every participating replica and
the verified portable package receive that record plus `R_pub`, the code-sealed `R_priv`, enough public authorization
history, verification keys, accepted-set evidence and recovery wraps for every generation needed by the attribution
claims they retain. Those artifacts must be **synchronized before deletion, not invented during it.**

**Nothing decrypts.** Every store was already ciphertext, so each device opens its last replica with the generations it
already holds and stops syncing.

**An offline replica cannot receive the terminal package, and deletion must not pretend otherwise.** It keeps its last
signed **live** head — stale, but sufficient to prove the workspace is historically admitted and must not silently
re-mint identity (§13.5). It works as a detached last replica and cannot locally claim to have observed retirement.
Importing the package later upgrades its knowledge.

**That upgrade is of the device's knowledge and never of the package's manifest** (`S0-6`). A live manifest
cannot become a retired one: `lineage_state` is inside the message the assembler signs, so changing it leaves a
signature that no longer covers what it names. **A retired package is therefore a complete package, assembled
and signed by the service's terminal authority at `lineage_state = 'retired'`** — not a live manifest with a
field rewritten, and never one an importer synthesises for itself from a terminal record. A terminal record may
be displayed beside a stale live package; it does not rewrite it. The cost is real and belongs here: a full
re-assembly rather than a delta, and the service must be reachable to produce one.

**Two requirements make deletion safe rather than merely available:** a verified-current device or a fresh export
before the lineage and hosted copy are retired, and a catch-up window during which enrolled devices can converge, with
devices that never appear named rather than quietly abandoned.

**"Verified-current" is a durable receipt rather than an elapsed interval, and `S0-6` selects it.** Nothing
previously proved a survivor had *received* terminal state, so deletion could proceed while every remaining
copy was stale, incomplete, or absent — and a window that has merely elapsed is the definition of mistaking
time for evidence, which §10.4 already refuses elsewhere. A receiving client signs a `TerminalHandoff` binding
the terminal head, the exact retired-package digest, its own prior head, and either an empty catch-up or a
verified transcript from that prior head with **exact known absences enumerated rather than summarised**.

**Only a durable handoff authorizes a hosted deletion class**, one class at a time, so a partial deletion resumes
rather than restarting or over-deleting. **The classes are §14.7's**, and retirement is the cause that reaches
all six — a second copy of that list here is a thing that could disagree with it. **A lost acknowledgement
retains the bytes**, deliberately: keeping data nobody wanted is recoverable and deleting data somebody needed is
not, so the ambiguous case keeps it and the audit record says the handoff never completed rather than claiming it
did. An offline replica remains a stale detached copy and is **never counted as a survivor for this gate**.

**That retention is bounded by the same deadline as everything else** (§14.7). Retirement stops hosted
synchronization, which starts the one clock, so a retirement whose survivor never appears keeps its bytes until
the ceiling and no longer. Without that bound the gate above would be an unbounded retention, which §16.6 calls a
defect rather than an omission — the two rules were written in different sections and only disagree once they are
composed.

### 14.5 Custody is not replica count

Three processes, machines or buckets under one provider account, billing relationship, domain and operator improve
availability against machine and regional failure and do nothing about closure of the account, loss of the domain, or
a deliberate shutdown. **One independently controlled copy is worth more than three operator-controlled ones.**
Immutable encrypted blobs can be copied to independent stores and verified by digest without moving authorization
authority.

### 14.6 The first deployment is itself a migration

The installation running today is Vite behind Tailscale on a laptop, in continuous daily use, with sync configured by
hand on each device against a shared bearer token and a **plaintext** relay document. It has no principal and no
authorization lineage, and it occupies no supported configuration — it is multi-device sync with no account, which
works because it has exactly one user who trusts every device on his own tailnet.

**The proposed cutover is to export from the development installation and import into the first real deployment, and
to treat that as the migration** rather than carrying a live document across. It is not selected until §15 row 21
decides whether the resulting system attribution is acceptable; if it is not, the fidelity archive moves forward and
carries the CRDT state instead. Then comes a versioning and upgrade story, built preventatively rather than at the
first incompatible change.

**One consequence has to be decided rather than discovered: the Markdown cutover re-attributes everything.** Import is a
system-actor write and the export carries no `author` (§9.1), so every card written before the cutover arrives
attributed to the system actor, and provenance mode (PRD §5.7) shows nothing for any of it. For a single-user
development installation where the answer to *who wrote this* is always the same, that may be an acceptable price
for using the escape format as the migration path; it is not something to find out afterwards. The alternative is
to bring the fidelity archive (§9.3) forward and migrate through **it** instead, since CRDT state is what carries
identity and attribution — which costs a continuity item early and is the only route that does not put metadata
into the markdown. Adding `author` to the day files is rejected on §4.6's grounds: the format has already had
hidden per-item identity syntax removed once, and putting it back to serve a one-off migration is the wrong
direction for the dependency to run.

**Two further consequences, and the second is a sequencing win available in one direction only:**

1. **The import must not be gated by the freeze** (§4.5, §9.2), or a ten-day export silently loses everything older
   than three days.
2. **If encryption-at-rest lands before any external user exists, the first-deployment cutover _is_ its migration,
   whichever carrier row 21 selects.** The alternative is a one-time in-place conversion state machine — open the old
   plaintext store, mint `K0`, write and verify the encrypted store, atomically select it, remove the plaintext store
   only after verification, resume safely after interruption. That machine is well-understood and entirely avoidable,
   and it is only avoidable now.

### 14.7 Lapse, expiry and the hosted-retention machine

**Constraint.** There are three ways a workspace stops being hosted here — it migrates (§14.1), it is deleted
(§14.4), or its hosted copy expires — and only the first two had a construction. **A lapse is not a transition
kind** (§15 rows 15, 16). §13.7's grammar has `rotate`, `replace-recovery` and `retire`, and none of them
represents a live-dormant state; PRD §6.10 says why in its own first line, *a failed payment is a billing event,
not an identity event*. So entitlement and hosted retention live **outside** the authorization lineage, and only
a signed service record stops synchronization or starts expiry.

**Two axes, and the confusion between them is what this section exists to prevent.** §13.5 gives the lineage
three states — never established, live, retired. Hosted content has its own, and **a lapsed workspace is `live`
on the first axis**. No retention state below is spelled with a lineage word, deliberately: a shared vocabulary
is how the two get read as one.

| State | Sync | Clock | Meaning |
| ----- | ---- | ----- | ------- |
| `hosted` | running | none | Ordinary operation |
| `grace` | **running** | none | A lapse is recorded and nothing has stopped yet |
| `stopped` | stopped | **running** | Hosted synchronization has stopped; every hosted byte is still present |
| `clearing` | stopped | running | Destructive progress has begun and the ledger is partway through |
| `cleared` | stopped | done | The class set for this cause is complete |

> `RetentionMark = LP("done/retention/v1") || LP(dec v) || LP(workspace_id) || LP(lineage_id) || LP(dec revision) || LP(hex prior_mark_digest) || LP(state) || LP(dec stopped_at) || LP(dec deadline) || LP(cause) || LP(hex ledger_digest)`
>
> `sig = Ed25519( the retention service's signing key ; RetentionMark )`, with `cause` one of `none`,
> `entitlement`, `retirement`

**The signer is not the lineage authorization key.** This service can stop hosting and cannot admit, revoke,
rotate or retire anything, and that separation is the whole bound on the trust it is given — see *what a
compromise reaches*, below.

**One clock, and whichever event stops synchronization first creates it.** `stopped_at` is written exactly once
per entry into `stopped`, under a compare-and-set on `revision`: concurrent writers do not each write one, the
loser observes the written value, and a retry is idempotent rather than a second clock. `deadline` is computed
at that same moment from §15 row 16's twelve months and is **never recomputed**, because a deadline that can be
recalculated is a deadline that can move. A resume clears both with the same revision advance, so a workspace
that lapses again gets a new and strictly later clock rather than a resurrected one.

**The clock does not move the machine — the ledger does.** Passing the deadline changes no state; it changes
what the ledger is permitted to do. That is deliberately generous: between the deadline and the first
destructive act every byte is still present, and a resume still restores all of it.

**Clients see these marks, and that is PRD §6.10's disclosure rather than interface copy.** *From this moment
the devices stop converging* and the deadline itself are fields of a signed record, so what the user is told is
what the service committed to. A client that has seen `revision` n rejects a mark at revision ≤ n whose contents
differ — §13.5's ancestor rule at a second object, which is what `prior_mark_digest` is for.

**The entitlement event is selected in shape and its wire waits on PRD §11 question 1**, which is deferred on
purpose. It is a service-signed record over `(account_id, sequence, effect, effective_at)` with `effect` one of
`grace-begins`, `sync-stops` or `restored`; `sequence` is monotonic per account, so a replayed stop cannot
re-stop a resumed account. **`effective_at` is bound and is not the clock** — the machine timestamps its own
transition and never copies that field, because a biller with a wrong clock could otherwise backdate the
deadline, which is early deletion dressed as bookkeeping. Binding a time and refusing to enforce it is §13.5's
treatment of `issued_at` at a third object.

**Deletion is one ledger over six classes, and the cause selects the set.**

| # | Class | Holds | `expiry` | `retire` |
| - | ----- | ----- | -------- | -------- |
| 1 | `primary` | Accepted envelopes and hosted content objects (§16.3) | delete | delete |
| 2 | `replicas` | Hosted replicas of those objects (§14.5) | delete | delete |
| 3 | `checkpoints` | Checkpoints, manifests, superseded checkpoints and their suffixes (§7.6) | delete | delete |
| 4 | `wraps` | Per-generation content-key wraps to `R_pub` (§13.8) | delete | delete |
| 5 | `backups` | Declared backups of any of the above (§16.4) | delete | delete |
| 6 | `recovery-anchor` | `R_pub` and the code-sealed `R_priv` envelope (§13.8) | **keep** | delete |

**Class 6 is the entire difference between the two causes, and PRD §6.10's re-seed promise is why.** A surviving
device re-seeds the hosted workspace and wraps its current generation to the same recovery public key *without
creating or confirming a new code* — which is true only if the anchor outlives expiry. Keeping the right things
is as much of the assertion as deleting the rest.

**One class at a time, each advanced under the same compare-and-set**, so a partial run resumes at the first
class that is not `done` and neither restarts nor over-deletes. `ledger_digest` is inside the signed mark, so
the ledger and the mark cannot drift apart. **The ledger's subject is hosted content for one workspace**;
retiring the lineage itself is §14.4's own ordered sequence and runs before this, because a gate cannot also be
an item in the thing it gates.

**The deadline is a floor on expiry deletion and a ceiling on both.** Expiry may delete nothing before it.
Retirement may delete as soon as a `TerminalHandoff` authorizes a class, because the user asked. **Neither may
leave anything after it** — and that resolves a contradiction the two source rules were never composed closely
enough to show. §14.4 retains bytes on a lost acknowledgement, because deleting data somebody needed is
unrecoverable. §16.6 calls an unbounded retention a defect rather than an omission, because there is no deletion
event in *at least twelve months*. **A lost acknowledgement therefore keeps the bytes until the ceiling and no
longer**, and the audit record still says the handoff never completed rather than claiming it did.

**Resume is free before destructive progress and needs a re-seed after it.** From `grace` or `stopped` a resume
returns the machine to `hosted` and nothing is rebuilt, because nothing is missing. From `clearing` or `cleared`
it requires a committed re-seed session — signed by the **device**, since what it asserts is what that device
holds, and naming `(lineage_id, epoch, prior_head)` so the result is a **branch of the live lineage and never a
genesis**. §13.5's detection rule already refuses to mint a replacement identity where a signed live head
exists, and a lapsed lineage is live. Two divergent survivors each present their own `prior_head` and converge
exactly as PRD §6.10 says they do; the re-seed does not choose between them. It carries the retention revision
it was built against, so a re-seed racing a running deletion is refused and rebuilt rather than silently
reactivating — §15 row 15's three-way rule at a fourth object.

**Retirement wins the race in both orders, by one rule.** `cause` is set once with `stopped_at`; retirement may
overwrite `entitlement` and **nothing may overwrite `retirement`**. Retire-then-lapse: the entitlement event is
recorded and changes nothing, and a `restored` event is refused because the lineage is terminal. Lapse-then-
retire: the class set widens to include class 6 and the gate becomes the handoff, while `stopped_at` and
`deadline` do not move, because it is the same stop. The outcome is a function of the recorded `cause` rather
than of arrival order, so it is replayable after a lost response.

**What a compromise of the entitlement signer reaches, as a bound rather than a guarantee.** It can move the
machine to `grace` and `stopped`, denying hosted synchronization — and every device keeps working locally,
because nothing on the read or write path ever awaited a credential. It **cannot** commit terminal lineage,
which needs a client-signed `retire` intent and the lineage authorization key. It cannot delete before the
deadline, which the retention machine computes from its own clock. It cannot reach class 6, because the class
set follows `cause`. So the attack is a long, loud read-only state ending in the deletion §15 row 16 already
promises, with the devices' replicas intact and an independently held fidelity archive outside the deadline
entirely (§9.3). A signer that could also suppress the marks above would make it quieter, which is why they are
signed and version-ordered.

**Test.** §11.2 test 11 and §11.4's generated deletion tests; the state machine's own model is
`test/hostedRetention.test.ts`.

---

## 15. The selection register

The constraints above are fixed; this is the register of the constructions built on them. **Eighteen rows are
selected and four are open**, with row 20 appearing in both halves because it is split. **The design reviews wait on the selections in their scope, and the cutover
waits separately on row 21** (§13.11, §14.6).

**The register has two review scopes and two independent scopes.** Rows **1, 2, 3 and 13**, plus the storage-facing
part of 14, are what a local encrypted store needs; they gate the storage work and are the scope of review **3a**, answered
before the first deployment cutover — **that scope is now closed.** Row 12 has since added one primitive to row 1's
suite (§13.10), under row 1's own criteria and on the asynchronous path only; **3a therefore reads a row 1 that a
3b row amended**, which is the first time the two scopes have crossed and is said here rather than left to be
noticed. Rows **4–12, 15–17 and 20**, plus the network-facing
part of 14, are what moving an envelope over a network needs; they gate the service and are the scope of review **3b**,
answered before network sync ships — **that scope is now closed too**: rows 4–12 and 15–17 are selected, and row 14's
network-facing half — the step-up challenge — is selected with them. Between them they carry the whole sync core, the
account credential everything else authenticates against, the rule for what happens when any of it is interrupted, the
web-security baseline that §13.11 level 2 owes separately, and the one retention in the design that is a duration
rather than a position. **What is left for the reviewer is one question rather than one row**: whether the service
rate-limits envelope fetch, which changes nothing about the code's entropy because the attacker who matters has
already fetched (§15 row 14's record, §5). Rows **18 and 19**
retain their own empirical triggers and gate neither review nor
cutover. Row **21** is the migration choice: it gates cutover but neither design review. Closing one scope does not
require another, which is what lets encryption at rest land before the protocol is specified.

### 15.1 Selected

**Each construction is argued at length in a record under `docs/selections/`, and summarized in one line here.**
The records preserve the reasoning, including what was rejected and why; **this document states what is currently
true**, and where the two disagree this one wins.

| # | Selected | The construction | Record |
| - | -------- | ---------------- | ------ |
| 1 | Algorithm suite and crypto-agility | **Suite 1** — AES-256-GCM on every asynchronous path, XChaCha20-Poly1305 on the synchronous one, HKDF-SHA-256, Ed25519, HPKE base with X25519, SHA-256. **A carrier version selects the whole suite**: no per-record algorithm field, so nothing to negotiate and nothing to downgrade | [row 1](./selections/row-1-algorithm-suite.md) |
| 2 | Synchronous journal AEAD and its nonce discipline | **XChaCha20-Poly1305**, 24 random bytes per record, **no counter and no durable state** — so there is nothing for a crash to lose. Subkey derived once at open from `K_g`. **The implementation is the audited RustCrypto crate compiled to a 6.5 kB inlined wasm module**, instantiated synchronously, which closes §12's measured 4 kB breach and costs 0.7 kB _less_ than the pure-JS library it replaces (§13.10) | [row 2](./selections/row-2-journal-aead.md) |
| 3 | Encrypted record and local key-envelope formats | AES-256-GCM under domain-separated subkeys; **every cleartext field is in the AAD**, because IndexedDB holds a structured clone whose properties the load path trusts. 12 random nonce bytes under a per-generation budget that `seq` bounds — **so `seq` does not reset at trim**. The budget is NIST SP 800-38D §8.3's 2^32 invocations per key: **the store rotates before the 2^32nd write under a generation**, equality being the first disallowed value. The per-generation count that comparison reads, and the crash-safe allocator that issues `seq` across tabs, are **still open** (§6.1) | [row 3](./selections/row-3-record-format.md) |
| 13 | Device-lock derivation, enrollment migration and copy | A **generated 125-bit code always**, with WebAuthn PRF as an additional seal of the same `L_lock` rather than an alternative to it. Enrollment reseals the key envelopes and **rotates the content key forward** (§13.3) | [row 13](./selections/row-13-device-lock.md) |
| 14 | Recovery-code entropy, generation, step-up and confirmation UX | 125 bits, Crockford Base32, five groups of five, **and no stretching at all**. Step-up is **a bound challenge rather than a freshness window** — `SHA-256( LP("done/recovery-replace/v1") \|\| LP(dec v) \|\| LP(hex intent_id) \|\| LP(hex nonce) )`, answered by the account credential, with 32 service-issued nonce bytes retired on use. **It binds §13.7's transition id, not the new public key**, so a `replace-recovery` step-up cannot be redirected to a `retire`; and no principal or credential id, because a service-issued challenge names the operation as the service knows it (§13.8) | [row 14](./selections/row-14-recovery-code.md) |
| 5 | Finalization shape | An **append-only per-credential accepted chain** of SHA-256 links, with **service-signed heads amortized over a batch** rather than one receipt per envelope. A separate hot acceptance-signing key, certified by the authorization key in the epoch. `final: true` is the cutoff. The epoch payload and the checkpoint manifest each gain the head vector (§7.5, §7.6, §13.5) | [row 5](./selections/row-5-finalization.md) |
| 11 | Device-to-device ceremony | A **short authentication string over an in-band agreement**, nonces **committed before revealed**, five Crockford Base32 symbols **typed** from the new device into the existing one. QR is an accelerator of the same transcript where a decoder exists, never a second protocol. The transcript binds the epoch head as well as the wrapping key, and the wrap's HPKE `info` binds the transcript hash (§13.6) | [row 11](./selections/row-11-enrollment-ceremony.md) |
| 4 | Envelope wire format and batching granularity | Clear header — `v`, workspace, credential, epoch, generation, `seq`, nonce, `digest` — under AES-256-GCM with a network subkey, the actor inside the seal, and **two bound field lists**: an AAD for what the reader trusts, and a signature reaching the nonce and digest the AAD structurally cannot. `digest` is of the **ciphertext**, so the relay validates it with no content key. **`seq` is the credential's own position and the accepted position both**, because row 5 requires the client to compute its chain unaided (§7.4) | [row 4](./selections/row-4-envelope-format.md) |
| 9 | Chain-head discovery for a brand-new device | **Two of three arrival paths are not brand-new**: enrollment carries the head through the person (row 11), and migration carries it in a user-held package. The third — recovery with no surviving device — gets a **nonce-bound signed head assertion**, which moves replay from *anyone in the path* to *the authorization service itself*. The residual is bounded: a hidden revocation is a hidden rotation, so a stale head cannot come with current content (§13.5) | [row 9](./selections/row-9-chain-head-discovery.md) |
| 8 | Attribution-preserving representation and its storage bound | A **standing signed claim, minted by the writing credential at card creation and living in the content root** beside the card it attributes — so §6.1's trim re-seals it under the current generation and **verifying historical authorship stops requiring historical generations**. The body commitment makes the claim falsifiable, not unforgeable: a card edited since creation verifies and is not exact. One record per card, retiring on exactly the event §4.5 already says retires a claim (§13.7) | [row 8](./selections/row-8-attribution-record.md) |
| 7 | Checkpoint construction, cadence and retention | One **full snapshot under one generation** plus a signed manifest binding the epoch and its head, the generation, the checkpoint digest, **`sv` and `ds` separately**, row 5's accepted-head vector and the producing credential. **Attribution is preserved by row 8 rather than here**, so §7.6's forbidden re-signing shape is unreachable. **A rotation forces a checkpoint before the old generation may be dropped**; at least two are retained (§7.6) | [row 7](./selections/row-7-checkpoint.md) |
| 6 | Anti-replay rule and envelope retention depth | Admit at *n* iff the position is **one past the mark**, the link is computed from the link the client itself holds, and a signed head verifies against **that** link. §7.5's *no second link at a held position* needs no fifth condition — it arrives at or below the mark — so the carrier is one `(seq, link)` per credential, a §6.1 record with `kind: 'heads'`. **Outbound: re-mint only on a definite refusal**, never on silence. Retention is three different depths, and a device keeps its own envelopes back to the **second-newest** admitted checkpoint (§7.4, §7.5) | [row 6](./selections/row-6-antireplay-retention.md) |
| 17 | Which web-security baseline profile and version | **OWASP ASVS 5.0.0 at L2 as a floor**, plus 8 named L3 pull-ups, 5 addendum controls and 1 recorded deviation. **A level is a floor rather than a profile** — §10.9's controls are spread across all three. The standard has **one** requirement mentioning browser storage and **none** mentioning Trusted Types, service workers or offline operation, so `V14.3.3` is a recorded deviation against §6.1 rather than a disposition. Generated and self-checking; A1 (no remote subresource) is build-failing today (§10.9, §13.11) | [row 17](./selections/row-17-web-security-baseline.md) |
| 15 | Interrupted-rotation and downgrade behaviour | **One intent-and-outcome protocol at three kinds** — rotate, replace-recovery, retire — because §11.2 test 11's list is one class: an interrupted middle that reads as a completed **lesser** transition. `kind` is bound in both messages, so a `rotate` cannot commit as a `retire` — **and that pair is what it closes, not lapse**: no field of a rotation expresses a payment lapse, a synchronization stop or a retention deadline, so §14.7's retention machine carries that state and this grammar stays at three (`S0-7`). Three client cases: silence means resubmit the identical bytes, a matching `committed_id` means apply, and a differing one means **discard and rebuild** — so **the outcome must be signed**, since the third case throws away a live content key (§13.7, §14.4) | [row 15](./selections/row-15-transitions.md) |
| 12 | Account-credential and slot-verifier construction | The account credential is a **WebAuthn discoverable credential** and the verifier **checks a signature rather than a secret** — so §13.10's Argon2id candidate answers *none* for the third time and on the strongest argument: there is no secret in the profile to grind. Each credential gets a **service-signed binding** in the slot index, because an asymmetric verifier trades a guessable secret for a **substitutable public key** and §6.5's index is a structured clone. The unlock assertion is bound to the slot and the credential, never to a clock; the signature counter is read and ignored (§13.9) | [row 12](./selections/row-12-account-credential.md) |
| 16 | Hosted-content retention duration after a lapse | **Twelve months**, from the moment hosted synchronization stops rather than from the missed payment, so grace is not deducted from it. **A floor on the promise and a ceiling on the data**: a plan may offer longer and none may offer shorter, and at expiry the ciphertext and wraps are *deleted*. One number for two paths because both are gated by one artifact — the ciphertext — so a shorter recovery window would save nothing and produce the state §6.10 refuses. **The condition was one bit of PRD §11's pricing question**, not its answer. **§14.7 is the machine that executes it** — one clock, created by whichever event stops synchronization; a six-class ledger whose cause decides whether the recovery anchor is kept; and the deadline as a **floor on expiry deletion and a ceiling on both causes**, which is what bounds §14.4's lost acknowledgement (`S0-7`) (PRD §6.10, §16) | [row 16](./selections/row-16-hosted-retention.md) |
| 10 | Terminal and portable cutover-package formats | **One format at §13.5's three lineage states**, not two: §14.2's cutover package, §14.4's terminal package and §9.3's fidelity archive. A **retired package is a complete package signed by the terminal authority**, not a live manifest upgraded in place — `lineage_state` is inside what the assembler signs, so there is no in-place upgrade to verify. §14.2's trust root is bound in the **HPKE `info` of every generation wrap** *and* committed in a digest **sealed beside `R_priv` under the recovery code**: `info` alone stops a wrap being reinterpreted and not one being minted, since base mode needs only the public `R_pub`. The commitment is the anchor that terminates in user-held material; the importer checks it before any unwrap. §9.3's archive uses the same shape under its own per-workspace code (§14.2, §14.4, `S0-6`) | [row 10](./selections/row-10-portable-package.md) |

**Row 20 — test vectors — is closed for these eighteen and open for the rest.** Rows 16 and 17 are the two whose
artifacts are not vector files in the same sense — a number and a profile rather than constructions — and each
earns its place the same way: checked against what it names rather than restating it, and build-failing when the
two stop agreeing. Row 17's profile is generated from a pinned index of the standard; row 16's number is read
back out of this document and the PRD by `scripts/check-retention.mjs`, which also audits §16's `unselected`
cells against §15.1. Each carries a generated,
self-verifying vector file; `pnpm vectors:check` fails the build if any has drifted from its generator, and
`pnpm vectors:coverage` fails it if any field bound in one is isolated by no published negative.

### 15.2 Unselected

| # | Unselected                                    | Constrained by                                                                                 |
| - | --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 18 | Whether a persistent encrypted search index is needed at all | Deferred; gates neither review nor cutover; measure the in-memory rebuild first (§6.2, §12) |
| 19 | Root-type day collections (§10.8)              | Deferred; one of its four costs has lapsed and should be re-counted                            |
| 20 | Test vectors for every construction still open | §11.2; required before level 3 review. **Closed for the eighteen selected above** — sixteen carry a generated, self-verifying vector file, and rows 16 and 17 carry the checked artifact their subject admits instead |
| 21 | First-deployment cutover attribution: accept system attribution, or bring the fidelity archive forward | §14.6; must be selected before cutover; adding authorship fields to Markdown is rejected (§9.1) |

**No row remains in this scope.** Envelope, acceptance, retention, checkpoint, attribution, enrollment, discovery,
the package that carries all of it out, the credential the account is reached by, the rule for what happens when any
of it is interrupted, the web-security baseline, the hosted-retention duration and the step-up that gates recovery
replacement are all selected, each with a construction and a self-verifying artifact.

**What remains is a question put *to* the reviewer rather than a row left open for them**, and the distinction is
worth drawing since §13.11 gates on the second: whether the service rate-limits envelope fetch. It changes nothing
about the code's entropy — the attacker who matters has already fetched the envelope — so it is a service-hardening
question rather than a construction, and it is asked rather than answered.

**Row 16 was taken on a binary rather than on the question it was filed under, and a reviewer should be told
which.** It was recorded as conditional on PRD §11's pricing question; it needed only whether a lapsed-but-retained
state can exist, which is one bit of that question and carries no price in it. Answering it leaves every pricing
sentence in PRD §11 as deferred as it was. **This is the fourth row in the scope whose apparent question was not
its real one**, after rows 5, 12 and 15.

**Row 12 answered the open question about which review should hold it, rather than being reassigned.** It looked
storage-shaped because *offline-guessing resistance* implied a secret at rest, and §13.3's threat model was the one
it seemed to need. There is no secret at rest. What the row actually contains — an account credential, a service
signature, an epoch, a challenge and a cross-protocol replay boundary — is network-facing throughout, so it stays in
**3b** and 3a's closed scope stays closed.

---

## 16. The service data inventory

**This is the living inventory the product decision requires this document to start** (PRD §7.11). It is a view of
the architecture, not a second architecture document: every store, queue, log, backup or processor that §7 and §13
introduce gets one row. As implementation makes each definition real, the row moves to live beside the schema,
service or infrastructure definition that makes it true, and changes with it. Implementation reconciles the whole
against what is actually deployed, and that reconciliation gates wider availability.

**The row format is fixed and is not negotiable per row:**

> **data class · purpose · subject/deletion scope · storage or recipient · retention · deletion event ·
> operator visibility · third parties**

**Scope: service-held data.** Device-local stores are §6, and are ciphertext under keys the service never holds
(§13.2); they appear here only where the service learns something about them. **The seven constraints in PRD §7.11
bind every row below** — no component receives plaintext, a content key, an unsealed `R_priv` or a recovery factor;
every subject-bearing record has a deletion scope; no reusable credential or recovery secret enters logs; deletion
never disables a local replica; operator powers are least-privilege and audited.

**Two columns are deliberately incomplete, and a row that says so is doing its job.** Some retentions are still
unselected, and vendors and processors do not exist until deployment chooses them. `unselected` is the placeholder
the as-built review checks against, not an omission.

**`unselected` has two kinds and a cell must say which** (§16.6). One waits on a **§15 row**, and that row has to
still be open. The other waits on a **deployment** choice — a metrics store, a log processor, a backup provider —
which no selection was ever going to close. **Every retention bounded by a selection now carries its answer**, and
they are of two shapes: the positional ones rows 6, 7 and 8 fix by the artifacts themselves, and the single
duration row 16 fixes by a clock — twelve months of hosted content after a lapse (§13.8, PRD §6.10). **§14.7 is
the machine that runs that clock and executes the deletion**, which is what turns the row's ceiling from a
promise into a deletion event this inventory can be checked against.

### 16.1 Authorization and retention services

**Two authorities share this store boundary and do not share a key.** The lineage authorization key admits,
revokes, rotates and retires; the retention key stops hosted synchronization and runs §14.7's deletion ledger and
can do nothing else. Grouping them here is a fact about where the rows live, not a claim that one may act for the
other — a compromise of the retention key reaches availability and never lineage.

| Data class | Purpose | Subject / deletion scope | Storage or recipient | Retention | Deletion event | Operator visibility | Third parties |
| ---------- | ------- | ------------------------ | -------------------- | --------- | -------------- | ------------------- | -------------- |
| Account record — identifier, contact address, service settings | Authenticate and contact the account holder | Account | Authorization service store | Life of the account | Account deletion | Support may read; audited | None in the base design |
| Account authenticator public material and slot-verifier parameters — credential ids, public keys, and the signed slot bindings issued for them (§13.9) | Verify sign-in; anchor the device-local slot binding | Account | Authorization service store | Life of the account | Account deletion | None — public material | None |
| Signed authorization lineage — epochs, membership grants, credential ids, capabilities, generation ids (§13.5) | Admit and revoke, order successors, prove historical admission | Workspace | Authorization service store | Life of the lineage | Account deletion commits the terminal record, then removes service copies | Support may read; authorization changes are audited | None |
| Terminal lineage record | Let a surviving replica distinguish retirement from genesis (§13.5) | Workspace | Authorization service store, then replicas and the portable package | Propagated before deletion; not retained by the service afterwards | Account deletion | Support may read; audited | None |
| Acceptance evidence — the per-credential accepted mark `(seq, link)`, batch head signatures and finalization cutoffs (§7.5) | Let clients refuse writes the service never accepted | Workspace × credential | Authorization service store | Life of the lineage — **a mark, not a log**: one `(seq, link)` per credential and its cutoff, which is all the chain has any memory of (§15 rows 5, 6) | Account deletion | Support may read; audited | None |
| Recovery material — `R_pub`, per-generation wraps, code-sealed `R_priv` envelope | Non-custodial recovery after total device loss (§13.8) | Workspace | Authorization service store | Life of the account; during a lapse the wraps are separately bounded by hosted-content retention — **twelve months** from the moment synchronization stops (§15 row 16) | Account deletion; retention expiry deletes the wraps (§14.7 class 4) and **refuses** `R_pub` and the sealed envelope (class 6), which is what makes PRD §6.10's re-seed without a new code true | None — opaque to every operator by construction | Escrow agent, **only** where the opt-in add-on exists (§16.5) |
| Committed-transition table — `(lineage, kind, target)` to committed intent id and signed outcome (§13.7) | Commit each rotation, recovery replacement and retirement at most once, and answer a resubmission with the same outcome | Workspace | Authorization service store | Life of the lineage | Account deletion commits the terminal record, then removes service copies | Support may read; audited | None |
| Relay admission tokens issued (§13.2) | Scope and time-bound a transport session | Device credential | Issued to the device; service-side issuance state only if the selected shape needs it | Short by construction | Expiry, revocation, account deletion | Support may read issuance state; audited | None |
| Hosted-retention marks and the deletion ledger — state, `stopped_at`, deadline, revision and per-class progress (§14.7) | Stop hosted synchronization without touching the lineage; bound hosted content by one deadline; make a partial deletion resumable rather than restartable | Workspace | Retention service store, signed by the retention key and served to clients as PRD §6.10's disclosure | Life of the hosted copy; the marks alone survive it, because the record of a deletion has to outlast the bytes it accounts for | Account deletion | Support may read; every state change is audited | None |
| Entitlement events — account, sequence, effect and effective time (§14.7). **Conditional** — exists only if PRD §11's pricing question selects a paid plan | Authorize a synchronization stop or restore, and nothing else | Account | Entitlement service store; never the lineage authorization key | Life of the account | Account deletion | Finance and support may read; audited | The payment processor, if one is chosen |
| Committed re-seed sessions — lineage, epoch, seeding credential, generation, prior head (§14.7) | Let a survivor rebuild an expired hosted copy as a **branch of the live lineage** rather than as a new workspace | Workspace | Authorization service store | Life of the lineage | Account deletion | Support may read; audited | None |

### 16.2 Relay

| Data class | Purpose | Subject / deletion scope | Storage or recipient | Retention | Deletion event | Operator visibility | Third parties |
| ---------- | ------- | ------------------------ | -------------------- | --------- | -------------- | ------------------- | -------------- |
| Live connection state — credential id, network address, connect and disconnect times | Authenticate transport and route envelopes | Device credential | Relay process memory; logged only through PRD §7.11's allowlist | Connection lifetime | Disconnect; log expiry | Operational; audited | Hosting provider observes network addresses |
| Awareness and presence — name, colour, cursor position, workspace association (§7.7) | Live presence display | Principal × workspace | Relay process memory | Connection lifetime. **Not persisted by default**, and must not inherit workspace-ciphertext retention | Disconnect | Operational, live only | Hosting provider |
| Per-credential write times, rates and volumes | Validate authorization, rate-limit, and account for cost | Device credential | Relay metrics | **Unselected, pending deployment.** Any *persisted* use needs its own purpose, subject scope and retention before it is added (PRD §7.11 constraint 6) | Account deletion | Operational | A metrics processor, if one is chosen |

### 16.3 Durable store

| Data class | Purpose | Subject / deletion scope | Storage or recipient | Retention | Deletion event | Operator visibility | Third parties |
| ---------- | ------- | ------------------------ | -------------------- | --------- | -------------- | ------------------- | -------------- |
| Authenticated envelopes — ciphertext plus clear routing metadata (§7.4) | Store-and-forward between devices never awake together | Workspace | Durable store | Until superseded by a checkpoint, then per the checkpoint rule below | Account deletion; hosted-content retention expiry (PRD §6.10) | None — opaque | Storage provider |
| Checkpoints and manifests, including the coverage attestation (§7.6) | The bounded recovery representation a content-blind store needs | Workspace | Durable store | **Two**, and never one whose generation another retained checkpoint still needs (§7.6, §15 row 7) | Account deletion; retention expiry | None — opaque | Storage provider |
| Superseded checkpoints | Fallback when the newest is unavailable (§11.3 test 8) | Workspace | Durable store | The second-newest, with its suffix from that checkpoint's head vector forward — required by §11.3 test 8 and §14.3 both (§15 rows 6, 7) | Account deletion; retention expiry | None — opaque | Storage provider |
| Attribution-preserving evidence (§7.6, §13.7) | Verify historical authorship across rotation and migration | Workspace | Durable store, as part of the recovery representation | Bounded by the attribution retention floor — for the lifetime of the claim | Account deletion; compaction retires the claims it covers (§4.5) | None — encrypted under content-key generations | Storage provider |

### 16.4 Operational

| Data class | Purpose | Subject / deletion scope | Storage or recipient | Retention | Deletion event | Operator visibility | Third parties |
| ---------- | ------- | ------------------------ | -------------------- | --------- | -------------- | ------------------- | -------------- |
| Diagnostics and logs | Diagnose service faults | Per field, attributed to the subject it concerns; an aggregate must not quietly retain subject identifiers | Log store | **Unselected, pending deployment** | Log expiry; subject deletion for attributed rows | Operational; audited | A log processor, if one is chosen |
| Backups | Restore service state | Mirrors the subject of whatever it copies | Backup store | **Unselected, pending deployment**, and **must not outlive the deletion event of the row it copies** | Backup expiry following the source deletion | Operational; audited | A backup provider |
| User-supplied support material | Diagnose a problem the user has chosen to disclose | Account, as an explicit and separately scoped disclosure | Support system | **Unselected, pending deployment**, and separate from every other row | Ticket closure or user request | Support; audited | A support-desk provider |
| Billing records | **Conditional** — exists only if PRD §11's pricing question selects a paid plan | Account | Payment processor | Statutory | Account deletion, less any statutory hold | Finance; audited | Payment processor |

### 16.5 Escrow agent — conditional, and deliberately not us

| Data class | Purpose | Subject / deletion scope | Storage or recipient | Retention | Deletion event | Operator visibility | Third parties |
| ---------- | ------- | ------------------------ | -------------------- | --------- | -------------- | ------------------- | -------------- |
| A separately sealed copy of `R_priv`, **and no ciphertext** | Opt-in recovery for a user who will not take custody (§13.8) | Account | **A separate legal entity**, never this service | Life of the opt-in | Opt-out; account deletion | The escrow operator only | The escrow entity is itself the third party |

**This row exists to be tested rather than trusted.** The two-party property is real only if neither store alone
suffices, so §11.2 test 9 inspects each store for what it can *open*, not for what it holds: the service's snapshot
must contain no material that unseals `R_priv`, and the escrow agent's must contain no ciphertext.

### 16.6 What this inventory is checked against

- **Every row's deletion event is exercised**, not asserted. §11.2 test 9 inspects service snapshots; the as-built
  review's evidence is generated deletion and export tests reconciled against deployed infrastructure, not the
  existence of a policy document (PRD §7.11).
- **A row appearing with no deletion scope is a defect**, because the constraint that every subject-bearing record
  has one is what makes deletion, export and correction implementable at all.
- **`unselected` is bounded, not open-ended, and it has two kinds.** One waits on a **§15 row**, which must still be
  open; the other waits on a **deployment** choice, which no selection closes and which the as-built review is what
  closes. A cell must declare which. **The rule as first written recognized only the first kind, and was therefore
  false of four cells in its own table** — metrics, logs, backups and support material, none of which any §15 row
  was ever going to answer, while four others still pointed at rows that had since been selected.
  `scripts/check-retention.mjs` now enforces both halves: every cell declares its kind, and a cell naming a §15 row
  names one §15.1 does not list. Neither kind may survive into the as-built review.

---

## Sources

- [Yjs](https://github.com/yjs/yjs) · [Subdocuments](https://docs.yjs.dev/api/subdocuments) · [y-codemirror.next](https://github.com/yjs/y-codemirror.next) · [y-websocket-server](https://github.com/yjs/y-websocket-server)
- [Y-Sweet](https://github.com/jamsocket/y-sweet) · [docs](https://docs.y-sweet.dev/)
- [SQLite Wasm](https://github.com/sqlite/sqlite-wasm) · [Persistent Storage Options](https://sqlite.org/wasm/doc/trunk/persistence.md) · [SQLite Wasm + OPFS (Chrome)](https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system) · [State of SQLite persistence on the web, May 2026](https://powersync.com/blog/sqlite-persistence-on-the-web)
- [CodeMirror: hide markdown syntax](https://discuss.codemirror.net/t/hide-markdown-syntax/7602) · [atomic-editor](https://github.com/kenforthewin/atomic-editor) · [codemirror-live-markdown](https://github.com/blueberrycongee/codemirror-live-markdown)
- [Tiptap bidirectional markdown](https://tiptap.dev/blog/release-notes/introducing-bidirectional-markdown-support-in-tiptap) · [markdown round-trip corruption report](https://github.com/wonderwhy-er/DesktopCommanderMCP/issues/440) · [rich text editor comparison, 2026](https://velt.dev/blog/best-rich-text-editors-react-comparison)
- [Yjs vs Automerge vs Loro, 2026](https://www.pkgpulse.com/guides/yjs-vs-automerge-vs-loro-crdt-libraries-2026) · [crdt-benchmarks](https://github.com/dmonad/crdt-benchmarks)
- §2.1 revisit, 2026-08-09: [Automerge 3.0](https://automerge.org/blog/automerge-3/) · [undo/revert request](https://github.com/automerge/automerge/issues/985) · [local-first feedback](https://github.com/automerge/automerge/issues/1231) · [automerge-codemirror](https://github.com/automerge/automerge-codemirror) · [Yjs 14 at FOSDEM 2026](https://fosdem.org/2026/schedule/event/8VKQXR-blocknote-yjs-prosemirror/)
- §6.1 load-before-connect: [data loss with IndexedDB + websocket providers](https://discuss.yjs.dev/t/local-data-lost-with-indexeddb-websocket-providers/1816) · [rare data loss with y-prosemirror](https://discuss.yjs.dev/t/random-rare-data-loss-in-production-with-y-prosemirror/3728) · [y-indexeddb#20](https://github.com/yjs/y-indexeddb/issues/20)
- §13 prior art, watched rather than adopted: [Ink & Switch Keyhive](https://www.inkandswitch.com/keyhive/notebook/) · [@localfirst/auth](https://github.com/local-first-web/auth). Both are Automerge-adjacent and solve service-independent authorization, which §13.1 deliberately does not need; their credential-separation and signed-operation patterns remain useful input to the design review.
- §13.10 suite: [HPKE, RFC 9180](https://www.rfc-editor.org/rfc/rfc9180.html) · [WebCrypto security considerations](https://www.w3.org/TR/WebCryptoAPI/#security-considerations) · [WebAuthn PRF extension](https://w3c.github.io/webauthn/#prf-extension)
