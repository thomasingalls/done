# done — Technical Requirements

**Status:** Draft v3
**Date:** 2026-08-05
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
properties they must have (§8.2), not prescribed line by line. Draft v4 got this wrong in §8 and
prescribed a flexbox layout; the requirement it was protecting survived the correction, the code
did not.

---

## 0. Terminology

| Term           | Meaning                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Journal**    | A day's free-prose surface. Never "log" — in a Yjs codebase that name reads as the CRDT update log.                                    |
| **Update log** | Yjs internals only. Never a user-facing concept.                                                                                       |
| **Freeze**     | UX rule: a day's collections become read-only 3 days after its date.                                                                   |
| **Compaction** | Storage optimization: frozen collections collapse to flat text. No user-visible effect, different schedule, **independent of freeze**. |
| **Document**   | A surface backed by one `Y.Text` (master, journal).                                                                                    |
| **Collection** | A surface backed by an ordered `Y.Array<CardId>` (next, scheduled, done).                                                              |
| **Card**       | One item in a collection; owns its own `Y.Text`.                                                                                       |
| **Actor**      | Anything that writes to the document: `human`, `agent`, or `system`. Not synonymous with "user" — see §4.8.                            |
| **Origin**     | A Yjs transaction's `origin` value, carrying the acting actor. Distinct from `Card.origin`, which is item provenance.                  |

---

## 1. Summary of decisions

| Concern             | Decision                                                                    |
| ------------------- | --------------------------------------------------------------------------- |
| CRDT                | Yjs v13 (pinned, see §10.1)                                                 |
| Editor              | CodeMirror 6, plain-markdown source of truth                                |
| Live preview        | Custom CM6 decoration extension (cursor-line syntax reveal)                 |
| Document surfaces   | One `Y.Text` each (master, journal)                                         |
| Collection surfaces | Ordered `Y.Array<CardId>` references; each card owns one canonical `Y.Text` |
| Primary persistence | `y-indexeddb`                                                               |
| Query/search index  | SQLite-WASM (`opfs-sahpool` VFS) + FTS5, **derived and disposable**         |
| Sync transport      | `y-websocket` or `y-sweet`, self-hosted, **optional**                       |
| Doc partitioning    | Single root doc; compaction bounds the structured working set (§4.5)        |
| PWA shell           | Hand-rolled service worker, precache-only                                   |
| Targets             | Android Chrome (primary), Desktop Chrome/Edge                               |

Two load-bearing decisions: **Yjs is the source of truth and SQLite is a cache**, and
**structure follows the unit of interaction** — text where you edit documents, arrays where
you manipulate items.

---

## 2. Why not a SQL sync engine

Zero, ElectricSQL, Replicache, RxDB, and Convex are the right family for a different
problem, and one property rules them out.

**The realistic conflict here is:** you add a line to today's journal on your phone, your
laptop has the same day open from this morning, both sync. Every SQL-shaped sync engine
resolves that at row or field granularity — one device's version of the whole text field
wins, the other is discarded. Silent data loss on the app's core operation.

A text CRDT merges at character granularity and keeps both edits. That's the requirement.

Secondarily: Zero, Electric, and Convex are server-authoritative — the server holds truth
and orders writes, so durability depends on the server accepting them. That contradicts "a
cloud instance must not be a blocking requirement." Replicache is the same shape with more
server left to you. RxDB comes closest (local DB, pluggable replication, can run serverless)
but resolves conflicts document-level, landing back on the text-merge problem.

**Chosen:** Yjs, with the relay as a dumb pipe carrying opaque binary updates. It holds no
authority, runs no application logic, and can be absent entirely.

### 2.1 Why Yjs over Automerge or Loro

Loro benchmarks fastest, Automerge has a richer history model, but Yjs has the ecosystem
this depends on — a maintained CodeMirror 6 binding, IndexedDB persistence, interchangeable
providers. At single-user scale none of the performance differences are observable.
Automerge's git-like history is attractive for a journal but costs performance and bundle
for something the PRD doesn't ask for, and PRD principle 6 ("the past is written, not read")
argues directly against paying for time-travel.

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
├── meta          Y.Map    { schemaVersion, createdAt, settings }
├── master        Y.Text                                ← document, never freezes
├── cards         Y.Map<CardId, Card>                   ← canonical card content
├── cardLocations Y.Map<CardId, "ISODate:section">     ← canonical membership
└── days          Y.Map<ISODate, Y.Map>
      └── "2026-08-05"
            ├── journal    Y.Text                       ← document, stays editable
            ├── next       Y.Array<CardId>   (≤3)       ← ordered collection
            ├── scheduled  Y.Array<CardId>              ← ordered collection
            ├── done       Y.Array<CardId>              ← ordered collection
            └── archive    Y.Text | absent              ← set on compaction (§4.5)

Card = Y.Map {
  id:        string     // 6-char, stable
  text:      Y.Text     // markdown; line 1 = title, remainder = description
  origin:    string | null   // item provenance: source card id or 'master'
  author:    string     // ActorId (§4.8)
  createdAt: string     // UTC ISO 8601
}
```

`meta` additionally holds the actor roster:

```
meta.actors  Y.Map<ActorId, { kind: 'human'|'agent'|'system', name, color }>
```

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

**Compaction — a storage optimization, day + 7.** Collections serialize to canonical
markdown into `archive: Y.Text`; the arrays and their cards are deleted. Purely internal:
by the time it runs the day has been read-only for four days, so no user-visible behavior
can depend on whether it has happened yet. The window is a free tuning parameter.

The four-day gap is deliberate. Compaction is the only destructive operation in the system,
and separating it from the freeze means a frozen day sits in structured form for several
days first — more opportunity to notice a problem, and no coupling between a correctness-
critical deletion and a user-facing rule.

Compaction is what keeps a single root document viable: structured card objects exist only
for the ~7-day active window, and everything older is two flat `Y.Text`s (`journal` +
`archive`). Object count is bounded by the window, not by history length.

Compaction runs opportunistically on idle, is idempotent, and must be safe to run
concurrently on two devices — both produce identical archive text from identical source, and
Yjs converges. Guard against a wrong clock by requiring the local date to exceed the day's
date by 7 in the last-known timezone, never by comparing against a remote clock.

### 4.6 Item identity in documents

Master and journal are plain markdown. Most lines are anonymous. A line gains a stable ID
only when something points at it, as a trailing caret marker in Obsidian block-reference
style:

```markdown
- [ ] Draft the migration plan ^k3f9x2
- [x] Call the dentist ^m2p8qq
```

IDs are 6 lowercase alphanumeric characters, generated on demand, collision-checked against
the index. The marker is hidden by the editor decoration unless the cursor is on that line.

Completion is `- [x]` and nothing more. **There is no `📅` scheduled-date syntax and no `✅`
completion-timestamp syntax** — both were in draft v2 and both are cut per PRD §9, being
deadline-tracking scaffolding for a system this explicitly isn't. Anything the user wants to
note is plain text, findable by search.

### 4.7 Movement operations

| Operation                       | Implementation                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| Next → Done                     | Move the card id and update canonical membership, one transaction (§4.3)                 |
| Compose → Done                  | Register one canonical card, then append its id to Done                                  |
| Reschedule to another day       | Move the id between days and update separate membership; no date field on the Card       |
| Master → collection             | Parse selected line(s), create card with `origin: 'master'`. **Does not modify master.** |
| Remove from master              | Separate explicit text deletion. Never bundled with the above.                           |
| Journal line → Master           | Assign `^id` if absent, append line to master `Y.Text`                                   |
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

| What                        | Where                        | Synced    |
| --------------------------- | ---------------------------- | --------- |
| Actor roster                | `meta.actors` in the Yjs doc | yes       |
| Which actor this client is  | `localStorage`               | no        |
| Device id and friendly name | `localStorage`               | no        |
| Live cursor / presence      | awareness protocol           | ephemeral |

**Attribution granularity is card-level, deliberately.** `Card.author` is one field and answers
"who created this." Documents (`master`, `journal`) are _not_ attributed per character: Yjs
stores no author per item, so it would require a parallel mark structure maintained alongside
every text edit — real cost on the keystroke path, for a question nobody asks until an agent is
editing prose. Deferred (PRD §14 Q4). Note that transaction origins are still recorded in the
update stream regardless, so coarse attribution is recoverable if it ever matters.

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
   link brackets, `^id`).
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

Persists the Yjs document and is the durable local store. Also syncs updates across tabs of
the same origin for free, removing any need for tab coordination on the write path.

Request `navigator.storage.persist()` on first successful write. Surface the granted/denied
state in settings — a local-first app that can be silently evicted should say so.

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
  doc_id     TEXT PRIMARY KEY,   -- 'master' | 'day:2026-08-05:journal' | 'day:2026-08-05:archive'
  kind       TEXT NOT NULL,      -- 'master' | 'journal' | 'archive'
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
3. Timer fires without movement → **selection mode.** Release the container, hand the pointer
   to the editor (or, on a Done card, unlock it).
4. `pointerup` before either → **tap.** Place cursor, mounting an editor if needed (§4.4).

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

---

## 9. Export and import

Export produces a zip of markdown, no server involved:

```
master.md
days/2026-08-05.md      # ## Journal / ## Next / ## Scheduled / ## Done
```

Documents (`master`, `journal`) are dumped verbatim — they are already markdown. Collections
serialize as lists of cards separated by blank lines, which is the same transformation
compaction performs (§4.5), so there is exactly one serializer and compaction exercises it
continuously.

Import parses the same layout, splitting on canonical headings and re-splitting cards on blank
lines. Round-tripping export → import → export must be byte-identical.

---

## 10. Known debt and risks

### 10.1 Yjs v13 / v14

`y-codemirror.next@0.3.5` targets Yjs v13; its last npm release is roughly two years old. The
repo's main branch develops `@y/codemirror` for Yjs v14, unreleased.

**Pin Yjs v13 and `y-codemirror.next@0.3.5`.** The binding is stable and narrow. Migration is
planned debt, not a blocker. Isolate every Yjs import behind one internal module so the
migration has a single seam.

### 10.2 Many small editors

Cards mount editors individually. Even with static-by-default (§4.4), mount/unmount happens on
every focus change and must feel like a text field, not a modal. Budget in §12. If mount cost
proves visible, the fallback is a single pooled editor instance reparented between cards —
more complex, so don't build it preemptively.

### 10.3 Two storage systems

Yjs-in-IndexedDB plus SQLite-in-OPFS means two things that can drift. Mitigation is
architectural: SQLite is strictly derived and the rebuild path runs routinely. If a bug ever
makes the index authoritative for anything, that's the bug.

### 10.4 Compaction is the only destructive operation

It deletes card objects, and a serializer bug would damage history seven days after the fact.
Mitigations: the serializer is shared with export (§9) and therefore continuously exercised;
compaction verifies round-trip (serialize → parse → compare) inside the same transaction and
aborts on mismatch; a failed verification defers compaction indefinitely rather than retrying
destructively; and because compaction is decoupled from freezing (§4.5), deferring it forever
has no user-visible consequence beyond document size.

### 10.5 Storage eviction

Browsers can evict origin storage. `persist()` reduces but doesn't eliminate the risk. With
sync configured another replica exists; without it, export is the only backup — so prompt for
an export periodically if sync has never been configured.

### 10.6 Permissions are unenforceable in this architecture

Worth recording before anything is designed assuming otherwise. The relay treats updates as
opaque binary and holds no authority (§2, §7.2); there is no server-side validation point. Yjs
applies any well-formed update it receives. Therefore **any actor with access to the document can
write anything to it**, and a rule like "the agent may edit the journal but not Done" is a
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

---

## 11. Testing

**Convergence (property-based).** Random concurrent edit sequences against two replicas,
applied in both orders, assert identical final state. Must include **concurrent card moves**
between collections, where array semantics are least obvious. Runs on every commit.

**Round-trip.** `export → import → export` byte-identical. Editor content equals stored
`Y.Text` after arbitrary edit sequences.

**Compaction safety.** For arbitrary day contents, `compact → parse` reproduces the original
collections exactly. Concurrent compaction on two replicas converges. Verification failure
defers rather than deletes.

**Freeze independence.** Freeze behavior is identical whether or not a day has been compacted,
and compaction timing never affects what the UI permits. This is the regression test for the
v2 conflation.

**Index rebuild determinism.** Index state after incremental updates equals index state after a
full rebuild from the same document.

**Pixel identity.** Static card render and mounted editor produce identical geometry across
every supported markdown construct. Same test covers live-preview line-height stability.

**Cap enforcement.** No sequence — paste, multi-line insert, undo, drag, concurrent
insert-from-two-devices — produces four cards in `next`.

**Undo scoping.** System-actor operations never enter the user's undo stack. Specifically: undo
immediately after a compaction, an import, or a bulk stale-item resolution reverts the user's
last _typed_ change, not the system operation. This is the test that keeps §4.8 honest as the
codebase grows new system operations.

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
