# done — Technical Requirements

**Status:** Draft v7
**Date:** 2026-08-10
**Companion to:** [PRD.md](./PRD.md)

---

## How to read this

This document records **decisions and constraints**, not implementations. Where a constraint can
be satisfied several ways, it is stated as a constraint and the choice of approach is named
separately, so a better approach can replace it without the requirement having to be
reconstructed from the code that happened to satisfy it.

Code appears only where **the code is the decision**: data shapes that define what is stored
(§4.2, §6.3), and interface boundaries that define what a subsystem may expose (§7.1). Short
snippets elsewhere are illustrative of an argument — showing that an operation is atomic, or that
a mechanism already exists — and are marked as such.

Styling, component structure, and framework idiom are implementation. They are described by the
properties they must have (§8.2), not prescribed line by line. An earlier draft got this wrong
in §8 and prescribed a flexbox layout; the requirement it was protecting survived the
correction, the code did not.

---

## 0. Terminology

| Term           | Meaning                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Update log** | Yjs internals only. Never a user-facing concept, and nothing user-facing may be called a log.                         |
| **Freeze**     | UX rule: a day's collections become read-only 3 days after its date.                                                  |
| **Compaction** | Planned storage optimization, currently safety-paused pending replica acknowledgements. **Independent of freeze**.    |
| **Document**   | A surface backed by one `Y.Text`. There is one: the master list.                                                      |
| **Collection** | A surface backed by an ordered `Y.Array<CardId>` (next, scheduled, done).                                             |
| **Card**       | One item in a collection; owns its own `Y.Text`.                                                                      |
| **Actor**      | Anything that writes to the document: `human`, `agent`, or `system`. Not synonymous with "user" — see §4.8.           |
| **Origin**     | A Yjs transaction's `origin` value, carrying the acting actor. Distinct from `Card.origin`, which is item provenance. |

---

## 1. Summary of decisions

| Concern             | Decision                                                                    |
| ------------------- | --------------------------------------------------------------------------- |
| CRDT                | Yjs v13 (pinned, see §10.1)                                                 |
| Editor              | CodeMirror 6, plain-markdown source of truth                                |
| Live preview        | Custom CM6 decoration extension (cursor-line syntax reveal)                 |
| Document surface    | The master list, one `Y.Text`                                               |
| Collection surfaces | Ordered `Y.Array<CardId>` references; each card owns one canonical `Y.Text` |
| Primary persistence | `y-indexeddb`                                                               |
| Query/search index  | SQLite-WASM (`opfs-sahpool` VFS) + FTS5, **derived and disposable**         |
| Sync transport      | `y-websocket` or `y-sweet`, self-hosted, **optional**                       |
| Doc partitioning    | Single root doc; destructive compaction is safety-paused (§4.5)             |
| PWA shell           | Hand-rolled service worker, precache-only                                   |
| Targets             | Android Chrome (primary), Desktop Chrome/Edge                               |

Two load-bearing decisions: **Yjs is the source of truth and SQLite is a cache**, and
**structure follows the unit of interaction** — text where you edit documents, arrays where
you manipulate items.

---

## 2. Why not a SQL sync engine

Zero, ElectricSQL, Replicache, RxDB, and Convex are the right family for a different
problem, and one property rules them out.

**The realistic conflict here is:** you add a line to the master list on your phone, your
laptop has had it open since this morning, both sync. Every SQL-shaped sync engine resolves
that at row or field granularity — one device's version of the whole text field wins, the
other is discarded. Silent data loss on the app's core operation. The same argument holds
for a card: two devices editing one card's text is the same shape at a smaller scale.

A text CRDT merges at character granularity and keeps both edits. That's the requirement.

Secondarily: Zero, Electric, and Convex are server-authoritative — the server holds truth
and orders writes, so durability depends on the server accepting them. That contradicts "a
cloud instance must not be a blocking requirement." Replicache is the same shape with more
server left to you. RxDB comes closest (local DB, pluggable replication, can run serverless)
but resolves conflicts document-level, landing back on the text-merge problem.

**Chosen:** Yjs, with the relay as a dumb pipe carrying opaque binary updates. It holds no
authority, runs no application logic, and can be absent entirely.

### 2.1 Why Yjs over Automerge or Loro

Loro benchmarks fastest and Automerge has a richer history model, but Yjs has the ecosystem
this depends on — a CodeMirror 6 binding, IndexedDB persistence, interchangeable providers.

**The performance argument is retired.** An earlier draft justified this partly on Automerge's
cost in performance and bundle. Automerge 3.0 (August 2025) cut memory by more than 10x — a
document the size of Moby Dick went from 700MB to 1.3MB — and load times on long histories
collapsed with it. That gap is closed, and it was never load-bearing anyway: at single-user
scale none of the performance differences were observable.

Two arguments survive, and both are structural rather than a question of who is faster this
year.

**Undo.** §4.8 scopes undo to the actor rather than to the surface, so that a bulk resolution
or a compaction cannot land in the human's undo stack. That is `Y.UndoManager` with tracked
origins, and PRD §11.3 depends on it. Automerge has no first-class undo — the feature request
has been open since November 2024, and the community answer works by rewriting document
history and describes itself as experimental. Migrating would mean reimplementing the
mechanism §4.8 rests on, on top of a dependency that says not to.

**History retention is the thing being bought, and the PRD doesn't want it.** Compaction (§4.5)
deletes card objects and expects the space back; Yjs reclaims it. Automerge keeps history by
design — that is the feature — and history truncation remains an open ask upstream. PRD
principle 6 ("the past is written, not read") argues directly against paying for time-travel,
so the property Automerge charges for is the one this app has deliberately designed away.

What would port cleanly, if this is ever revisited again: the canonical card registry and the
separate `cardLocations` register (§4.2) are an ordinary last-write-wins map, not a Yjs
construct. Automerge has no shipped list `move` operation either, so the same indirection
would still be required.

**Revisited 2026-08-09**, prompted by the observation that Yjs looked stalled. It is not:
`yjs@13.6.32` shipped 2026-08-04, and v14 is in an active release-candidate series with the
changeset and attribution work funded by ZenDiS and DINUM. What has stalled is the binding
layer — that is §10.1, and it is stale on Automerge's side too.

---

## 3. Why CodeMirror over Tiptap, BlockNote, or Lexical

The card UI makes ProseMirror-family editors look attractive — BlockNote in particular is
close to what's described, out of the box, with node views, drag handles, and first-class
Yjs support. Two things decide against it.

**Markdown stops being the truth.** ProseMirror, Tiptap, Lexical, and BlockNote all use a
structured document model; markdown is an import/export serialization. Round-tripping
through that model is documented to alter escape policy on brackets, tildes, and
underscores, collapse frontmatter, and **strip blank lines**. Tiptap's `@tiptap/markdown`
exists precisely because this is hard, and real-world reports show it still isn't lossless.
Given that "your data outlives the app" is a ranked principle and blank lines are literally
the card-split input gesture, a lossy serialization layer under the whole app is the wrong
foundation.

You also don't get Obsidian-style syntax-visible editing from these without fighting the
model — `**` becomes a bold mark, not two characters you can see and delete.

**The card argument is weaker than it looks.** The usual reason to reach for a block editor
is that blocks are hard _inside one big document_. That's not this architecture (§4.2): each
card owns a separate `Y.Text` and gets its own small editor. There is no block-splitting
inside a shared document model to implement — splitting a card is an array operation, not a
document transformation. Most of what BlockNote would provide is work this design doesn't
generate.

**Decision: CodeMirror 6 for every editing surface.** One authoring feel across documents
and cards, plaintext markdown throughout, no serializer in the write path.

---

## 4. Data model

### 4.1 Principle

There is no parallel structured representation of item _content_. All user-visible text
lives in a `Y.Text` as markdown. What the CRDT tracks beyond text is only what the workflow
requires the app to know: **membership and ordering of cards in collections.**

### 4.2 Document tree

```
Y.Doc (root)
├── meta          Y.Map    { schemaVersion, createdAt, setting.*, actor:* }
├── master        Y.Text                                ← document, never freezes
├── cards         Y.Map<CardId, Card>                   ← canonical card content
├── cardLocations Y.Map<CardId, "ISODate:section">     ← canonical membership
└── days          Y.Map<ISODate, Y.Map>
      └── "2026-08-05"
            ├── next       Y.Array<CardId>              ← ordered collection; ≤3 per device
            ├── scheduled  Y.Array<CardId>              ← ordered collection
            ├── done       Y.Array<CardId>              ← ordered collection, newest first
            └── archive    Y.Text | absent              ← set on compaction (§4.5)

Card = Y.Map {
  id:        string     // 6-char, stable
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

They are deliberately not nested `Y.Map` values. Two new offline devices can
initialize concurrently; independent flat keys merge, while two nested maps
assigned to the same parent key would make one entire settings/actor branch win.

Day maps are created lazily on first write. An untouched day occupies nothing.

**A card carries no date.** Canonical membership is stored separately from the Card, keyed
by its id. Day arrays retain presentation order. Rescheduling updates membership and the two
ordering arrays atomically; there is no date field on the Card and no reschedule history.
Keeping card content canonical means a concurrent edit and move operate on the same `Y.Text`,
while concurrent moves resolve through the single map value to one visible location.

### 4.3 Why collections are arrays

The PRD's movement table is the justification. `Next → Done` is the second most important
interaction in the app, and with arrays it is a delete of an id from one array and an insert
into the other, plus its canonical membership update, inside a single transaction — atomic,
undoable as one step, and observable as one event. _(Shape shown to make the atomicity
argument; not a prescribed implementation.)_

The same operation modelled as text ranges in a
shared document is a delete-plus-insert whose concurrent-merge behaviour is exactly the weak
spot of text CRDTs — concurrent move tends to duplicate or interleave.

The three-item cap likewise becomes `next.length < 3` checked before insert, rather than a
transaction filter parsing list structure out of prose — and the PRD requires that cap to be
unbreakable by paste, multi-line insert, undo, and drag alike.

**That check is the whole of the enforcement, and nothing corrects the merge afterwards.** Two
devices each adding a third card while apart are both under the cap when they write; the merge
is over it, and there is nowhere to reject either write (§10.6). PRD §3 keeps them all, so the
merged Next simply holds more than three, `capacityFor` goes negative, and every write path
already refuses on the same comparison it always made. An earlier draft ran a system-actor
repair that moved the overflow to Scheduled. It was removed rather than tuned: it converged and
it deleted nothing, but it was the app deciding which of two devices' legitimate writes stopped
being Next, and that is a product decision the PRD has now made the other way.

### 4.4 Cards render static until focused

A card is **not** a mounted editor by default. It renders as static HTML from its markdown.
An editor mounts only on focus.

This does three jobs at once:

- **Performance.** One or two live CodeMirror instances at a time regardless of list length.
- **Done-guarding** (PRD §5). Next and Scheduled cards mount on tap; Done cards mount only
  on long-press or explicit unlock. Same machinery, different trigger.
- **Freezing** (§4.5). Cards in a frozen day never mount.

**Hard constraint: static render and mounted editor must be pixel-identical.** Text must not
shift when an editor mounts — same constraint as the live-preview line-height rule (§5.2),
same regression test. After mount, place the cursor via `posAtCoords` on the originating tap
so focus lands where the user pointed.

### 4.5 Freeze and compaction are independent

These were conflated in draft v2. They are separate mechanisms on separate schedules and
must stay that way.

**Freeze — a UX rule, day + 3.** The day's collections become read-only. Implemented purely
as a policy check in the UI layer: cards don't mount editors, mutation operations reject.
Nothing about the stored representation changes. Permanent; no unfreeze (PRD §6).

**Compaction — target storage optimization, day + 7, currently safety-paused.** The original
implementation serialized collections into `archive: Y.Text` and deleted their arrays and
cards. That is not safe in a local-first system without replica acknowledgements: a device can
edit an existing nested `Y.Text` while offline, after which another device's deletion of its
parent makes the converged edit unreachable.

Due days still run the canonical serialize → parse → compare validation, but the operation
returns `deferred` without writing or deleting anything. Legacy archives remain readable.
Destructive compaction may only return when the protocol can prove every replica has observed
the state being discarded, or when a new representation keeps concurrent nested edits
reachable. The seven-day threshold remains independent of the three-day freeze.

The pause deliberately gives up the intended bound on structured card objects: until a safe
protocol replaces deletion, object count can grow with history. The four-day gap between
freeze and the day + 7 validation threshold remains useful as policy separation, but does not
make deletion safe. Any resumed compaction must be idempotent under concurrent devices and
must guard against a wrong clock by comparing calendar dates in the last-known timezone.

### 4.6 Item identity in documents

The master list is plain markdown and its lines are anonymous. It contains no hidden identity
syntax: the editor neither generates nor hides trailing caret suffixes, and caret text authored
after the schema-v4 migration is ordinary text.

Cards, actors, and devices have internal UUIDs. Card UUIDs are keys in the canonical registry and
day collections; actor and device UUIDs support attribution. None are rendered into the master
document or otherwise exposed as user-facing identifiers. Existing short identifiers remain
valid when older documents are opened. Schema v4 removes the obsolete six-character trailing
caret suffixes from pre-v4 master documents once, then treats any future caret text literally.

Completion is `- [x]` and nothing more. **There is no `📅` scheduled-date syntax and no `✅`
completion-timestamp syntax** — both were in draft v2 and both are cut per PRD §9, being
deadline-tracking scaffolding for a system this explicitly isn't. Anything the user wants to
note is plain text, findable by search.

### 4.7 Movement operations

| Operation                       | Implementation                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| Next → Done                     | Move the card id and update canonical membership, one transaction (§4.3)                 |
| Compose → Done                  | Register one canonical card, then insert its id at the head of Done (§4.9)               |
| Reschedule to another day       | Move the id between days and update separate membership; no date field on the Card       |
| Master → collection             | Parse selected line(s), create card with `origin: 'master'`. **Does not modify master.** |
| Remove from master              | Separate explicit text deletion. Never bundled with the above.                           |
| Card split (3 returns)          | Truncate this card's `Y.Text`, insert a new canonical card id after it, move focus       |
| Card merge (backspace at start) | Append this card's text to previous, delete this card                                    |
| Bulk stale-item resolution      | Batched id and membership moves in one transaction                                       |

### 4.8 Actors and attribution

Per PRD §11: one user, several actors. Three exist in v1 — the human, the system (compaction,
import, bulk operations), and implicitly each device the human acts through. Agents arrive later
and require no structural change.

**Every mutation carries its actor as the Yjs transaction origin.** This is not an addition to
the write path — `ydoc.transact()` already takes an origin argument that the codebase would
otherwise pass as `null`, so attribution is a matter of populating an argument that exists rather
than of threading new state through the write path. The origin carries the acting actor and the
originating device.

**Undo is scoped by origin.** `Y.UndoManager` accepts a `trackedOrigins` set, so the user's undo
stack can be filtered to origins whose `actor` is the local human.

This is required for v1 correctness independent of agents. Without it, undo after a compaction
reverts the compaction, and undo after a bulk stale-item resolution unwinds dozens of card moves
as a single confusing step. Both are system-actor operations that must never enter the user's
undo stack. Agents later get the same treatment for free.

**Awareness is wired from day one.** `y-protocols/awareness` carries the local actor's identity
and cursor, and `yCollab` from `y-codemirror.next` already consumes it to render remote
selections. With one actor connected nothing is drawn, but the plumbing exists and is exercised
by multi-device sync in Phase 3 — where two of your own devices connected simultaneously is
already the two-cursor case.

**Storage split:**

| What                        | Where                 | Synced    |
| --------------------------- | --------------------- | --------- |
| Actor roster                | `meta['actor:' + id]` | yes       |
| Which actor this client is  | `localStorage`        | no        |
| Device id and friendly name | `localStorage`        | no        |
| Live cursor / presence      | awareness protocol    | ephemeral |

**Attribution granularity is card-level, deliberately.** `Card.author` is one field and answers
"who created this." The master list is _not_ attributed per character: Yjs stores no author
per item, so it would require a parallel mark structure maintained alongside every text edit
— real cost on the keystroke path, for a question nobody asks until an agent is actually
editing prose. Deferred (PRD §14 Q2).

**Nothing about attribution is recoverable from an update stream, and an earlier draft of this
section said otherwise.** A transaction origin is an argument the _receiver_ passes to
`Y.applyUpdate(doc, update, origin)`; it is a local property of the transaction and is never
encoded in the update bytes. What the bytes do carry is the writing document's Yjs client id,
which is random per `Y.Doc` instance — per tab, per page load — so it identifies neither a device
nor an actor durably. `Card.author` is therefore the only attribution that exists, it is an
ordinary field any writer can set to any value, and making it trustworthy needs authenticated
writes rather than better forensics. See `docs/sessions.md` D-27.

### 4.9 Section order, and where an arrival lands

Two different orders, and they must not be allowed to become one.

**Storage order** is `next, scheduled, done`: how a day is written to a file and to `archive`
(§9), and the order every iteration over a day's contents takes.

**Reading order** is `next, done, scheduled` (PRD §3). It is a property of the day panel and
of nothing else — rearranging the layout must not be able to change the file format, which is
the coupling that makes an export stop round-tripping without anyone touching the serializer.

Within a collection, **Done takes an arrival at index 0** and the other two append. That is
the only place ordering is a rule rather than a user action: Done is a record read from the
top, while Next and Scheduled are ordered by intent and keep whatever order they were given.
A multi-line copy into Done is reversed on the way in, so a run of lines still reads in the
order it had in the master list.

**Order has to survive replication** (PRD §3), and a sequence CRDT gives that for free while
the array survives. The case where it does not is a day _neither_ device has written to before:
both mint a `Y.Map` for the date, one wins the key outright, and the loser's arrays are deleted
with it. The cards survive in the canonical registry and are put back by the membership repair
(§4.2), which is therefore the one place an order is _recomputed_ rather than merged, because
the entry that encoded the position no longer exists.

Everything from here to the end of this section is a **mitigation for a schema problem**, not a
property of the data model, and §10.8 records the problem, the fix, and why it is deferred.
Read it before extending any of this: if the day map stops being a concurrently-created
container, none of what follows is needed.

It recomputes from the section's own rule. Next and Scheduled are ordered by intent, intent is
not stored, and a returning card appends — the arrival rule. Done is ordered by time, so its
order can be restored: a returning card goes back above everything completed before it, which
puts a run of them back in newest-first order and interleaves it with what is already there
instead of stacking it at one end. Two constraints make that safe to run independently on every
replica: the ordering key is replicated data rather than anything local, and returning cards are
processed oldest-first so a batch lands newest-first without depending on the order the card
registry happens to iterate in.

The key is `Card.createdAt`. It is the completion time exactly for the compose path — how most
things reach Done — and the _writing_ time for something written earlier in Next and finished
later, which is the known imprecision and the accepted one: PRD §9 rules out a completion
timestamp, and this is a repair choosing a position, not the app recording when work finished.
`createdAt` is therefore required to be **strictly increasing per device** rather than merely a
clock reading, since `Date.now()` resolves to a millisecond and a device can write several cards
inside one; equal timestamps would make a device's own order unrecoverable, which is the thing
being protected. Two _devices_ may still tie, and there the tie is real — nothing happened first
— so any deterministic choice is correct as long as every replica makes the same one.

---

## 5. Editor

### 5.1 Architecture

CodeMirror 6 with `Y.Text` bound via `y-codemirror.next`. The document CodeMirror holds is
literal markdown. Every visual affordance is a **view-layer decoration** — `Decoration.replace`
and `Decoration.mark` over ranges computed from the Lezer markdown syntax tree. Nothing in
the rendering pipeline mutates the document. This is what makes byte-for-byte round-tripping
automatic rather than something to defend.

### 5.2 Live preview extension

A `ViewPlugin` recomputing decorations on document change, viewport change, and selection
change:

1. Walk the syntax tree over **visible ranges only** — never the whole document
   synchronously.
2. For each node, compute ranges covering its syntax characters (`**`, `##`, backticks,
   link brackets).
3. If the cursor or a selection range intersects the node's **line**, emit no replacement —
   raw syntax shows.
4. Otherwise replace syntax ranges with zero-width decorations and `mark` the content range
   with the formatting class.

**Hard constraint: line height must not change** between revealed and hidden states. This is
the most common way live-preview implementations feel bad. Style hidden syntax to zero width
rather than `display: none` where possible, and keep formatting classes to properties that
don't alter line box height. Cover with a geometry regression test.

### 5.3 Card decorations

Within a card editor: **line 1 → title class** (high contrast, heavier weight), **lines 2+ →
description class** (reduced contrast). Both are `mark` decorations keyed on line number.

They apply identically in the static render, which is how §4.4's pixel-identity constraint is
met — the static renderer and the editor share one stylesheet and one markdown-to-HTML path.

### 5.4 Editor behaviors

Beyond stock CM6 markdown: list continuation on Enter (including Enter on an empty list item,
which outdents then terminates), `Tab`/`Shift-Tab` indentation, click-to-toggle checkboxes,
idempotent `Cmd-B`/`Cmd-I` wrapping.

In card editors additionally: three consecutive returns splits (§4.7), backspace at position
0 merges upward, `Escape` blurs and unmounts back to static.

The split threshold is a **named constant**, not a literal. The PRD expects it to change.

---

## 6. Storage

### 6.1 Primary: y-indexeddb

Persists the Yjs document and is the durable local store. The adapter keeps y-indexeddb's
on-disk format, loading, ordinary writes, and compaction. `whenSynced` means only that stored
updates have been applied in memory; it does not add a full-document write to the startup path.

Every update is first written synchronously to localStorage as one immutable, per-page,
per-database journal entry. A reload replays those idempotent Yjs deltas before IndexedDB is
opened. At the end of a short batching window the adapter writes every captured delta in one relaxed
IndexedDB transaction, waits for its `complete` event, and only then removes the corresponding
journal entries. `whenDurable()` forces that batch immediately and resolves only after every Yjs
update observed before the call has committed. Journal or batch failures remain observable and
leave recoverable entries intact.

The journal is a short-lived write-ahead log, not a second document representation or another
authority. This closes the browser lifecycle gap where navigation can terminate the page between
a Yjs transaction and IndexedDB's asynchronous commit without putting cumulative update merging,
base64 encoding, or a strict disk flush on every keystroke.

Opening another tab later reads the same database. y-indexeddb does not itself broadcast live
updates between already-open tabs, so real-time cross-tab propagation is not a property of this
layer.

Request `navigator.storage.persist()` on first successful write. Surface the granted/denied
state in settings — a local-first app that can be silently evicted should say so.

**Local state must finish loading before any transport is constructed.** This is the ordering
behind the most common data-loss report against Yjs in production, and it fails in one
direction: the socket syncs first, a document not yet populated from disk looks authoritative,
and the near-empty state is what both ends converge on. Sync then propagates the loss to every
replica, which is the property that makes it worth a constraint rather than a comment.

It costs one `await` at start-up and is invisible when correct. The saving available from
overlapping the disk read with the socket opening is real, and someone will eventually propose
it; the cost is a class of bug that appears only for users who already have local state and a
fast connection. Enforced by test (§11).

### 6.2 Derived: SQLite-WASM

Used only for what the Yjs document can't answer efficiently: full-text search, reference
resolution, and the stale-Next-item scan that drives the PRD §6 indicator.

**It is a cache.** Never written by the user, never synced, safe to delete. If missing,
corrupt, or a schema version behind, delete and rebuild from the Yjs document. This must be
an ordinary tested code path, not an emergency one.

Constraints:

- Use official `@sqlite.org/sqlite-wasm` with the **OO1 API**. As of 2026-04-15 the
  `Worker1` and `Promiser1` wrappers are deprecated by their author as too fragile and
  limited for non-toy use and will not be extended. **Do not build on them** — most tutorials
  still teach them. Write a dedicated worker with a small hand-rolled RPC layer.
- Use the **`opfs-sahpool` VFS** (SQLite 3.43.0+). No `SharedArrayBuffer`, therefore **no
  COOP/COEP headers** — a meaningful deployment simplification.
- OPFS requires a worker context; all SQLite access goes through it.
- `opfs-sahpool` holds exclusive access; a second tab can't acquire it. Guard with
  `navigator.locks`; a tab without the lock runs normally with search disabled and says so.
  Data is unaffected — the Yjs doc is shared via IndexedDB regardless.
- **Load lazily.** The ~1 MB wasm must not block first paint or first keystroke. Fetch on
  idle after the editor is interactive, or on first search.

Per PRD principle 6, search is weighted toward the master list and recent days. Deep-history
FTS is indexed because it's nearly free once the table exists, not because it's expected to
be used.

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

### 6.4 Index maintenance

Observe `Y.Text` and `Y.Array` changes, debounce ~300 ms, re-parse the affected document or
card and replace its rows in one transaction. Per-unit reparse is cheap (kilobytes), so
line-level diffing is unwarranted.

Full rebuild walks everything and should finish well under a second at projected scale. Run
on schema-version mismatch, on index-open failure, and on demand from settings.

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

No provider is constructed until an endpoint is configured. Nothing on the read or write path
may await sync state. **Deleting the sync configuration entirely must leave a fully working
app** — enforced by running the full suite with the provider absent.

### 7.2 Relay

Self-hosted `y-websocket`, or `y-sweet` if S3-backed persistence is wanted later (Rust,
actively maintained, explicitly supports self-hosting). Either is one small process; both
treat updates as opaque binary. Auth is a shared bearer token over TLS — unsophisticated, but
the threat model is one person's task list.

The relay is not a backup. Every device holds a full replica, and the export (§9) is the
backup story.

---

## 8. Layout and interaction

### 8.1 Responsive shell

One layout system, three breakpoints. The same three surfaces (Menu / Today / Goals) sit on a
plane; the breakpoint decides how many are simultaneously visible.

| Breakpoint | Menu                        | Today      | Goals                       |
| ---------- | --------------------------- | ---------- | --------------------------- |
| **Narrow** | off-screen left, drag right | full width | off-screen right, drag left |
| **Medium** | behind a trigger            | panel      | panel                       |
| **Wide**   | persistent panel            | panel      | panel                       |

Only the current view plus immediate neighbors mount. Neighboring days render their static card
lists — cards are static by default (§4.4), so a revealed neighbor shows real content at no
editor cost.

### 8.2 Layout constraints

Stated as constraints because they must hold under any implementation; §8.3 records the approach
chosen to satisfy them.

- **The document never scrolls.** Only designated regions scroll internally.
- **Panels are viewport-height bounded.** A panel's content length must never extend the page.
  Use `dvh`, not `vh` — mobile browser chrome makes `vh` wrong exactly when it matters.
- **The Today panel is four bands in order:** yesterday peek, header, body, tomorrow peek. Only
  the body scrolls; the other three are fixed-size. The peeks bracket the header rather than
  sitting inside the body — inverting this looks plausible and reads wrong (PRD §7.4).
- **The header is pinned, not sticky.** It lives outside the scrolling region rather than
  `position: sticky` within it. Sticky looks identical but leaves the trigger inside the
  scrolled subtree, where it takes part in scroll repaints and is reachable by the gesture
  handler's scroll logic (§8.4).
- **Only the scrolling band may absorb slack.** The trap: both flex and grid give items an
  automatic minimum size derived from content, so a content-sized floor silently defeats the
  height bound and the panel grows past the viewport. The fix differs by system — `min-height: 0`
  on a flex child, `minmax(0, 1fr)` on a grid track — which is why this is written as a
  constraint rather than a rule. Earlier drafts stated it as flexbox `min-height: 0` _on the
  panel_, which was both the wrong element and the wrong altitude.
- **Static card render and mounted editor must be visually identical** (§4.4). This is a styling
  constraint before it is a testing one.

### 8.3 CSS approach

The shell is a **grid**, not nested flex. The three surfaces are named areas and each breakpoint
is a different `grid-template-areas` — the breakpoint change becomes one declaration describing
the layout, rather than a scattering of direction, order, and basis changes. The Today panel's
four bands are likewise grid rows, where the scrolling band is the only `minmax(0, 1fr)` track.
Flex is appropriate for one-dimensional runs inside components; it is not the shell.

**Cascade layers** order the cascade explicitly: `reset, vendor, app, theme`. The concrete
justification is CodeMirror — it ships its own stylesheet, and this app overrides it heavily for
live preview (§5.2), card title/description treatment (§5.3), and pixel identity (§4.4). Without
layers those overrides become a specificity contest against `.cm-*` selectors, won by escalation
and lost the moment CodeMirror changes a selector. With `vendor` beneath `app`, plain selectors
win by position.

**Custom properties** carry the design tokens — type scale, line height, spacing, the
title/description contrast pair. Their load-bearing job here is pixel identity: the static
renderer and the mounted editor consume the same variables through the same markdown-to-HTML
path, so the constraint is structural rather than a thing that has to be independently
maintained in two stylesheets and caught by a test when it drifts.

**Container queries over viewport media queries for anything inside a panel.** Panel width and
viewport width diverge across breakpoints, so a card that reacts to its own container stays
correct when the shell changes around it.

### 8.4 Gestures

Pointer Events. **Swipe navigates; long-press-then-drag selects** (PRD §7.2).

1. `pointerdown` records origin and starts a long-press timer (~400 ms).
2. Movement past ~10 px before the timer fires → **navigation.** Lock to the dominant axis,
   capture the pointer, translate the container.
3. Timer fires without movement → **selection mode** in live text. A static Done card instead
   captures the pointer and arms reordering; subsequent movement drags it, while a stationary
   release unlocks it.
4. `pointerup` before either → **tap.** Place cursor, mounting an editor if needed (§4.4).

On a fine pointer, Done cards expose a reorder grip. Dragging it starts the same collection-owned
reorder interaction immediately, leaving ordinary mouse drag over card text available for text
selection. Both paths write once, on release, through the atomic CRDT reorder operation.

Requires `user-select: none` on the container with selection re-enabled on entering selection
mode, and `touch-action: none` on navigable surfaces. `overscroll-behavior: contain` prevents
pull-to-refresh and overscroll glow. Gestures must not require starting at a screen edge,
keeping them clear of the system back gesture.

Vertical drags inside a scrollable region scroll it, and navigate only at a scroll extent with
continued motion in that direction.

### 8.5 Keyboard

Desktop is keyboard-first. Bindings live in one table so they're discoverable and remappable
later. `Cmd/Ctrl-K` opens a command palette backed by the SQLite index — which must degrade
gracefully when the index hasn't loaded (§6.2).

### 8.6 Long-document projections

Long-document navigation is a **view over the master `Y.Text`**, never another document model.
No projection may copy a section into a second `EditorState`, persist a sliced `Y.Text`, or make
the user choose a destination before ordinary text entry. Markdown remains the only source of
heading structure and the master text remains byte-for-byte unchanged by navigation, focus, and
folding.

#### Scroll-aware breadcrumb

The first implementation is the Goals header breadcrumb. Its active position is the first
visible document line in the editor's scroll container. It is explicitly not:

- the selection head, because moving the cursor while editing must not change the location label;
- CodeMirror's `viewport.from`, because the rendered viewport includes overscan above the visible
  scroll edge; or
- a persisted CRDT value, because it describes one device's view, not shared document state.

At that position, walk headings from the beginning of the document and maintain the ordinary
markdown outline stack: a heading removes preceding headings of equal or deeper level, then
becomes the deepest entry. The visible label is `Goals` followed by that stack. Text before the
first heading has the root label only. Skipped levels are valid; structure remains opt-in and the
breadcrumb reports what was authored rather than repairing it.

The editor extension owns scroll measurement and heading derivation. DOM geometry is read in a
CodeMirror measurement phase, after which it reports only changes in the derived path to React.
React owns the pinned header rendering. Document edits, incremental parser progress, geometry
changes, and scrolling can all invalidate the path. Heading labels omit structural markdown
marks, normalize line breaks, and retain the authored text. At constrained widths the deepest
location must remain visible; the complete path remains available to assistive technology and as
the element title.

This extension is installed only on the document surface. Card headings are presentation inside
items and do not describe application location.

#### Heading outline and focus

The later outline consumes the same derived heading representation. Navigation dispatches a
CodeMirror scroll effect without moving the selection or focusing the editor, which prevents an
outline tap from summoning the mobile keyboard. Navigating and focusing remain separate commands.

Focus is one editor showing one contiguous heading subtree. Its state is local and ephemeral; the
initial implementation does not sync or encode it in markdown. Positions must map through editor
transactions so concurrent edits before the subtree do not detach the view from its heading. The
whole document and each ancestor are directly reachable from the pinned breadcrumb—this is a
hierarchical lens, not a navigation stack or a collection of document routes.

Do not implement focus by binding another editor to a substring. A substring has unstable CRDT
boundaries, creates ambiguous insert behavior at both edges, and makes undo and remote edits
depend on which projection happened to be mounted. Hiding ranges in the one bound editor keeps
the document, selection, collaboration binding, and undo history singular.

#### Folding, archive, search, and duplicate diagnostics

- Folding uses CodeMirror view state and markdown heading ranges. It begins expanded, does not
  sync, and never changes source text.
- Archive is a user-initiated text move to a bottom document region, performed atomically and
  undoably through the existing actor-aware CRDT operation boundary. It must not introduce an
  authoritative per-line lifecycle field.
- Search continues to use the derived SQLite index (§6.2). Archive remains indexed.
- Duplicate diagnostics are derived and advisory. Exact-match normalization or later similarity
  scoring may surface candidates, but neither is item identity. Diagnostics never merge text or
  propagate completion automatically.

---

## 9. Export and import

Export produces a zip of markdown, no server involved:

```
master.md
days/2026-08-05.md      # ## Next / ## Scheduled / ## Done
recovery.md              # only when retained cards have no visible collection
```

The master list is dumped verbatim — it is already markdown. Collections serialize as lists of
cards separated by blank lines. Since a day _is_ its collections, a day file and a legacy
compacted day's `archive` are the same bytes read by the same parser — so "exactly one
serializer" remains literal while destructive compaction is safety-paused (§4.5).

A card can itself contain a blank line, so blank-line-delimited blocks would be ambiguous and
§11's "reproduces the original collections exactly" would not hold. Each card is therefore
written as a markdown list item — first line after `- `, the rest indented — which makes card
boundaries the only lines at column 0 whatever a card holds. The alternative, forbidding blank
lines inside cards, would make the storage format depend on the split threshold, and PRD §10
calls that a tunable.

Import parses the same layout, splitting on canonical headings and re-splitting cards on blank
lines. Round-tripping export → import → export must be byte-identical.

---

## 10. Known debt and risks

### 10.1 Yjs v13 / v14

`y-codemirror.next@0.3.5` targets Yjs v13 and was last published 2024-06-18. The repo's main
branch develops `@y/codemirror` for Yjs v14, still on `0.0.0-x` pre-release tags as of
2026-01-19. Yjs v14 itself remains in a release-candidate series.

**Pin Yjs v13 and `y-codemirror.next@0.3.5`.** The binding is stable and narrow. Migration is
planned debt, not a blocker. Isolate every Yjs import behind one internal module so the
migration has a single seam — `src/crdt/yjs.ts`, enforced by `test/seam.test.ts`.

**A stale binding is not a reason to change CRDT.** Recorded because the inference is tempting
and does not hold: `@automerge/automerge-codemirror` is at `0.2.0`, last published 2025-07-21.
Both candidates have a pre-1.0 CodeMirror binding that has gone a year or more without a
release, and the Yjs _core_ ships regularly (§2.1). Judge the binding layer against the other
binding layer, not against the health of the library underneath it.

Note also what the seam does **not** cover. It holds imports, not semantics: undo scoping
(§4.8), the compaction model (§4.5), and the relay's forked message loop all encode Yjs
behaviour outside `src/crdt/yjs.ts`. The seam bounds a v13 → v14 migration, which is what it
was built for. It does not bound a change of CRDT.

### 10.2 Many small editors

Cards mount editors individually. Even with static-by-default (§4.4), mount/unmount happens on
every focus change and must feel like a text field, not a modal. Budget in §12. If mount cost
proves visible, the fallback is a single pooled editor instance reparented between cards —
more complex, so don't build it preemptively.

### 10.3 Two storage systems

Yjs-in-IndexedDB plus SQLite-in-OPFS means two things that can drift. Mitigation is
architectural: SQLite is strictly derived and the rebuild path runs routinely. If a bug ever
makes the index authoritative for anything, that's the bug.

### 10.4 Destructive compaction is safety-paused

Round-trip verification could protect against serializer mistakes but cannot establish that an
offline replica has no unseen edits beneath a type about to be deleted. Compaction therefore
defers indefinitely without serializing or mutating the day. The cost is unbounded document
growth; the benefit is that elapsed time is never mistaken for evidence that all replicas have
synchronized. Retained cards from legacy compaction are exposed in the Today recovery panel and
in `recovery.md` exports.

### 10.5 Storage eviction

Browsers can evict origin storage. `persist()` reduces but doesn't eliminate the risk. With
sync configured another replica exists; without it, export is the only backup — so prompt for
an export periodically if sync has never been configured.

### 10.6 Permissions are unenforceable in this architecture

Worth recording before anything is designed assuming otherwise. The relay treats updates as
opaque binary and holds no authority (§2, §7.2); there is no server-side validation point. Yjs
applies any well-formed update it receives. Therefore **any actor with access to the document can
write anything to it**, and a rule like "the agent may edit the master list but not Done" is a
property of the agent's own code, enforced by trust rather than by the data layer.

This is acceptable — the agents in question are ones the author runs — but it constrains the
Phase 6 design. Anything resembling a capability boundary has to live in the agent process, and
the honest failure mode is a misbehaving agent corrupting frozen history. The mitigations
available are ordinary ones: attribution makes damage attributable (§4.8), scoped undo makes it
reversible, and export (§9) makes it recoverable. Enforcement is not among them.

Introducing real enforcement would mean giving the relay schema awareness and update validation,
which forfeits the "dumb pipe, no authority" property that §2 selected Yjs for. Not a trade worth
making for this threat model.

### 10.7 Framework choice

React + Vite on ecosystem grounds; Svelte is defensible (smaller bundle, little component-tree
complexity here). It barely matters — the editor is CodeMirror and state lives in Yjs, both
framework-agnostic. Decide at Phase 1, don't revisit.

### 10.8 A day's collections are containers created concurrently — deferred

**Deferred, deliberately.** The mitigation in §4.9 holds and is tested. This records what the
underlying problem is, what fixing it would take, and what it would let us delete, because the
mitigation reads like a design choice and is really a workaround.

**The mechanism.** `ensureDay` materialises a day as `days.set(date, new Y.Map())`. A `Y.Map`
key is last-write-wins over whole values, so two devices writing to a date neither has touched
before mint two different maps for one key, one wins outright, and **the loser's map is deleted
with its three collection arrays and every id in them**. Nothing is merged, because there is
nothing to merge against: the container the entries lived in no longer exists.

This is the same failure `actors.ts` describes for the schema-v2 `meta.actors` map, which was
fixed by flattening to independent keys. `days` still has the shape that causes it, and
flattening does not fix it here: `days.set('2026-08-05:done', new Y.Array())` is the same
last-write-wins on a fresh container, one level down.

**Why nothing is lost today.** Card content and canonical location live in roots that merge by
id (§4.2), so the cards survive; the membership repair puts them back. What does not survive is
the array position, and §4.9 recomputes one from `Card.createdAt`. That mitigation is the
reason `createdAt` has to be strictly increasing per device, and it is why Done's order is
_reconstructed_ in this one case rather than simply carried.

Recorded plainly: this is not a limit of the CRDT. Yjs's list ordering is exact and merges two
devices' concurrent insertions without help. The order is lost because the schema lets a
container be created twice, not because a sequence CRDT cannot order things.

**The fix.** Make a day's collections **root types**, addressed by name — `day:ISODate:section`
— rather than values set into a map. Root types are created lazily and deterministically from
their name, so two devices creating one concurrently get the same logical type and their
contents merge. No card is stranded, no array is destroyed, and Yjs's ordering carries Done's
order with nothing recomputed.

**What it would let us delete.** The Done branch of `rehomeIndex` (§4.9), the strictly-increasing
requirement on `createdAt` and the monotonic clock behind it, and `compareInstants`.
`repairCardMemberships` still has work to do — reconciling arrays with the canonical location
map after concurrent moves — but its "located card that no array holds" branch would be reduced
to the undo defect it also covers.

**What it costs, and why this is not free.** Four things, in the order they matter:

1. **Root types are never removed from `doc.share`.** Compaction can empty a day's arrays but
   cannot take the root entries back. §4.5 rests on object count being "bounded by the window,
   not by history length", and three empty root types per day is bounded by history. The
   absolute numbers are small — on the order of 11k tiny entries after a decade — but the
   property §4.5 asserts would no longer be true as stated, and it should be restated rather
   than quietly falsified.
2. **A schema migration**, run on open like `migrateCardsToRegistry`, moving every existing
   day's arrays out of `days` and into root types.
3. **`listDays` changes shape.** Days are currently the keys of one map; they would become a
   filtered, parsed enumeration of `doc.share`, and "an untouched day occupies nothing" (§4.2)
   needs re-checking against a store that has an entry for every day ever visited — day
   materialisation on _view_ (not only on write) makes that a broader set than it sounds.
4. **`ensureDay`, `dayAt`, `collectionOf`, compaction's deletion path and the `days` observer in
   `watchMemberships` all address collections through the day map** and would each need
   rewriting.

**When to do it.** Not for correctness — the mitigation is tested and holds. Do it if either of
these appears: the reconstructed Done order is visibly wrong in real use, which would show up as
a card written in the morning and finished in the evening coming back low in the list after a
merge; or something else needs the day map to stop being a concurrently-created container.
Until then, §4.9 is the answer and this section is why it looks the way it does.

---

## 11. Testing

**Convergence (property-based).** A fleet of N stores around one relay that holds a
replica of its own, driven by generated schedules of edits, partitions and reconnections.
Runs on every commit.

**It runs at two devices and at three, and three is not a bigger two.** With two, every
partition is symmetric and every replica has seen either all of a change or none of it. With
three, one replica can sit _between_ the other two — holding the first half of what one of
them did and none of the second — and runs the membership repair on that partial view.
Whether two independently repairing replicas agree is only a real question once a third can
disagree with both. Two is kept alongside three because it shrinks to smaller counterexamples.

Exchange is **through the hub, not pairwise**: anything that converges pairwise but not
through a relay passes the wrong test. The fleet opens **whole stores**, because the
membership repair and the undo manager are what concurrency breaks and a test against bare
`Y.Doc`s tests Yjs rather than this app. **Both delivery orders** are covered at three
replicas by replaying the recorded update log forwards and reversed — not because Yjs might
diverge, but because `repairCardMemberships` walks the card registry in integration order,
which differs between replicas that received the same updates in different orders, and the
repair has to be indifferent to that. Every run is replayable from the property's seed, with
client ids drawn rather than numbered so that tie-breaking is exercised in both directions.

Must include **concurrent card moves** between collections, where array semantics are least
obvious. Hand-written two-replica scenarios remain alongside the fleet: named cases with a
readable failure, not coverage.

**Round-trip.** `export → import → export` byte-identical. Editor content equals stored
`Y.Text` after arbitrary edit sequences.

**Compaction safety.** For arbitrary day contents, serialize → parse reproduces the original
collections exactly. A due compaction is mutation-free and defers. A replica that remains
offline across the threshold can reconnect with both new cards and edits to existing card text
without either becoming unreachable.

**Freeze independence.** Freeze behavior is identical whether or not a day has been compacted,
and compaction timing never affects what the UI permits. This is the regression test for the
v2 conflation.

**Index rebuild determinism.** Index state after incremental updates equals index state after a
full rebuild from the same document.

**Pixel identity.** Static card render and mounted editor produce identical geometry across
every supported markdown construct. Same test covers live-preview line-height stability.

**Cap enforcement.** No sequence on one device — paste, multi-line insert, undo, drag —
produces four cards in `next`, checked after every operation rather than at the end, since
nothing tidies up afterwards. Concurrent insert-from-two-devices is the exception and is
specified the other way (§4.3): the merged Next may hold more than three, every card is still
in Next on every device, none of them moved to Scheduled, and no write path adds another until
the user has brought it back under three.

**Done's order across replication.** Each device's own completions read newest-first on every
device, for arbitrary generated schedules of concurrent completion and partition — including a
day both devices create at once, where one of the two ordered arrays is destroyed by the merge
and the order has to be recomputed (§4.9).

**Undo scoping.** System-actor operations never enter the user's undo stack. Specifically: undo
immediately after a compaction, an import, or a bulk stale-item resolution reverts the user's
last _typed_ change, not the system operation. This is the test that keeps §4.8 honest as the
codebase grows new system operations.

**Load before connect.** No transport is constructed until local persistence has finished
loading into the document (§6.1). The regression test for the most common production data-loss
mode in Yjs deployments, and for the start-up optimisation that would silently reintroduce it.

**Sync-absent.** Full suite passes with no sync provider constructed.

---

## 12. Performance budgets

Build-failing thresholds, not aspirations.

| Metric                                | Budget           |
| ------------------------------------- | ---------------- |
| Keystroke → paint                     | < 16 ms p95      |
| Card focus → editable                 | < 50 ms          |
| Cold start → Today editable           | < 2.5 s          |
| Warm start → Today editable           | < 1.0 s          |
| Day-to-day navigation                 | < 100 ms         |
| Search results (10k items)            | < 150 ms         |
| Initial JS bundle (excl. sqlite wasm) | < 350 KB gzipped |
| Yjs doc load (encoded state)          | < 500 ms         |

The sqlite wasm binary sits outside the initial bundle budget because it loads lazily (§6.2);
the app must be fully usable for writing before it arrives.

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
