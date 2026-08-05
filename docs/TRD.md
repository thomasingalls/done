# done — Technical Requirements

**Status:** Draft v2
**Date:** 2026-08-05
**Companion to:** [PRD.md](./PRD.md)

---

## 1. Summary of decisions

| Concern | Decision |
|---|---|
| CRDT | Yjs v13 (pinned, see §10.1) |
| Editor | CodeMirror 6, plain-markdown source of truth |
| Live preview | Custom CM6 decoration extension (cursor-line syntax reveal) |
| Document surfaces | One `Y.Text` each (master, daily log) |
| Collection surfaces | `Y.Array<Card>`, each card holding its own `Y.Text` |
| Primary persistence | `y-indexeddb` |
| Query/search index | SQLite-WASM (`opfs-sahpool` VFS) + FTS5, **derived and disposable** |
| Sync transport | `y-websocket` or `y-sweet`, self-hosted, **optional** |
| Doc partitioning | Single root doc; frozen days compact to flat text (§4.5) |
| PWA shell | Hand-rolled service worker, precache-only |
| Targets | Android Chrome (primary), Desktop Chrome/Edge |

Two load-bearing decisions: **Yjs is the source of truth and SQLite is a cache**, and
**structure follows the unit of interaction** — text where you edit documents, arrays
where you manipulate items.

---

## 2. Why not a SQL sync engine

Zero, ElectricSQL, Replicache, RxDB, and Convex are the right family for a different
problem, and one property rules them out.

**The realistic conflict here is:** you add a line to today's log on your phone, your
laptop has the same day open from this morning, both sync. Every SQL-shaped sync engine
resolves that at row or field granularity — one device's version of the whole text field
wins, the other is discarded. Silent data loss on the app's core operation.

A text CRDT merges at character granularity and keeps both edits. That's the requirement.

Secondarily: Zero, Electric, and Convex are server-authoritative — the server holds truth
and orders writes, so durability depends on the server accepting them. That contradicts
"a cloud instance must not be a blocking requirement." Replicache is the same shape with
more server left to you. RxDB comes closest (local DB, pluggable replication, can run
serverless) but resolves conflicts document-level, landing back on the text-merge problem.

**Chosen:** Yjs, with the relay as a dumb pipe carrying opaque binary updates. It holds no
authority, runs no application logic, and can be absent entirely.

### 2.1 Why Yjs over Automerge or Loro

Loro benchmarks fastest, Automerge has a richer history model, but Yjs has the ecosystem
this depends on — a maintained CodeMirror 6 binding, IndexedDB persistence, interchangeable
providers. At single-user scale none of the performance differences are observable.
Automerge's git-like history is attractive for a journal but costs performance and bundle
for something the PRD doesn't ask for. Revisit only if document time-travel becomes a
requirement.

---

## 3. Why CodeMirror over Tiptap, BlockNote, or Lexical

The card UI makes ProseMirror-family editors look attractive — BlockNote in particular is
close to what's being described out of the box, with node views, drag handles, and
first-class Yjs support. Two things decide against it.

**Markdown stops being the truth.** ProseMirror, Tiptap, Lexical, and BlockNote all use a
structured document model; markdown is an import/export serialization. Round-tripping
through that model is documented to alter escape policy on brackets, tildes, and
underscores, collapse frontmatter, and **strip blank lines**. Tiptap's `@tiptap/markdown`
extension exists precisely because this is hard, and real-world reports show it still
isn't lossless. Given that "your data outlives the app" is a ranked principle and blank
lines are literally the card-split input gesture, a lossy serialization layer under the
whole app is the wrong foundation.

You also don't get Obsidian-style syntax-visible editing from these without fighting the
model — `**` becomes a bold mark, not two characters you can see and delete.

**The card argument is weaker than it looks.** The usual reason to reach for a block
editor is that blocks are hard *inside one big document*. That's not the architecture here
(§4.2): each card owns a separate `Y.Text` and gets its own small editor instance. There
is no block-splitting inside a shared document model to implement — splitting a card is an
array operation, not a document transformation. Most of what BlockNote would provide is
work this design doesn't generate.

**Decision: CodeMirror 6 for every editing surface.** One authoring feel across documents
and cards, plaintext markdown throughout, no serializer in the write path.

---

## 4. Data model

### 4.1 Principle

There is no parallel structured representation of item *content*. All user-visible text
lives in a `Y.Text` as markdown. What the CRDT tracks beyond text is only what the workflow
requires the app to know: **membership and ordering of cards in collections.**

### 4.2 Document tree

```
Y.Doc (root)
├── meta      Y.Map    { schemaVersion, createdAt, settings }
├── master    Y.Text                                    ← document
└── days      Y.Map<ISODate, Y.Map>
      └── "2026-08-05"
            ├── log        Y.Text                       ← document
            ├── next       Y.Array<Card>   (≤3)         ← collection
            ├── scheduled  Y.Array<Card>                ← collection
            ├── done       Y.Array<Card>                ← collection
            └── archive    Y.Text | absent              ← set on freeze (§4.5)

Card = Y.Map {
  id:        string     // 6-char, stable
  text:      Y.Text     // markdown; line 1 = title, remainder = description
  origin:    string | null   // provenance: source card id or 'master'
  createdAt: string     // UTC ISO 8601
}
```

Day maps are created lazily on first write. An untouched day occupies nothing.

### 4.3 Why collections are arrays

The PRD's movement table (§4) is the justification. `Next → Done` is the second most
important interaction in the app, and with arrays it is one atomic operation inside a
single Yjs transaction:

```ts
ydoc.transact(() => {
  const [card] = day.get('next').slice(i, i + 1);
  day.get('next').delete(i, 1);
  day.get('done').push([card]);
});
```

Correct, undoable, and trivially observable. The same operation modelled as text ranges in
a shared document is a delete-plus-insert whose concurrent-merge behaviour is exactly the
weak spot of text CRDTs (concurrent move tends to duplicate or interleave).

The three-item cap likewise becomes `next.length < 3` checked before insert, rather than a
transaction filter parsing list structure out of prose — and the PRD requires that cap to
be unbreakable by paste, multi-line insert, undo, and drag alike.

### 4.4 Cards render static until focused

A card is **not** a mounted editor by default. It renders as static HTML from its markdown.
An editor instance mounts only on focus.

This does three jobs at once:

- **Performance.** One or two live CodeMirror instances at a time regardless of list length.
- **Done-guarding** (PRD §5). Next and Scheduled cards mount on tap. Done cards mount only
  on long-press or explicit unlock. Same machinery, different unlock trigger.
- **Freezing** (§4.5). Cards in a frozen day never mount.

**Hard constraint: the static render and the mounted editor must be pixel-identical.**
Text must not shift when an editor mounts. Same constraint as the live-preview line-height
rule (§5.2), same regression test. After mount, place the cursor via `posAtCoords` on the
originating tap so focus lands where the user pointed.

### 4.5 Freezing compacts the day

Three days after its date, a day's collections become permanently read-only (PRD §6). At
that point they are serialized to canonical markdown into `archive: Y.Text`, and the three
arrays plus all their cards are deleted from the document.

This is not just cleanup — it is what keeps the single-root-document decision viable.
Structured card objects exist only for the ~3–4 days that are still live. Everything older
is two flat `Y.Text`s (`log` + `archive`). Object count stays bounded by the active window
rather than growing with history.

Compaction runs on app start and on day rollover, is idempotent, and must be safe to run
concurrently on two devices — both produce the same archive text from the same source, and
Yjs converges. Guard against a device with a badly wrong clock freezing recent days by
requiring the local date to exceed the day's date by 3 in the last-known timezone, never
by comparing against a remote clock.

### 4.6 Item identity in documents

Master and log are plain markdown. Most lines are anonymous. A line gains a stable ID only
when something points at it, as a trailing caret marker in Obsidian block-reference style:

```markdown
- [ ] Draft the migration plan ^k3f9x2
- [x] Call the dentist ✅2026-08-04 ^m2p8qq
```

IDs are 6 lowercase alphanumeric characters, generated on demand, collision-checked
against the index. The marker is hidden by the editor decoration unless the cursor is on
that line. Completion is `- [x]`, completion date `✅YYYY-MM-DD`, scheduled date
`📅YYYY-MM-DD` — all text, parsed by the index.

### 4.7 Movement operations

| Operation | Implementation |
|---|---|
| Next → Done | Array splice + push, one transaction (§4.3) |
| Compose → Done | `done.push([newCard(text)])` |
| Master → collection | Parse selected line(s), create card with `origin: 'master'`. **Does not modify master.** |
| Remove from master | Separate explicit text deletion. Never bundled with the above. |
| Log line → Master | Assign `^id` if absent, append line to master `Y.Text` |
| Card split (3 returns) | Truncate this card's `Y.Text`, insert new card after it, move focus |
| Card merge (backspace at start) | Append this card's text to previous, delete this card |
| Bulk stale-item resolution | Batched array moves in one transaction |

---

## 5. Editor

### 5.1 Architecture

CodeMirror 6 with `Y.Text` bound via `y-codemirror.next`. The document CodeMirror holds is
literal markdown. Every visual affordance is a **view-layer decoration** — `Decoration.replace`
and `Decoration.mark` over ranges computed from the Lezer markdown syntax tree. Nothing in
the rendering pipeline mutates the document. This is what makes byte-for-byte
round-tripping automatic rather than something to defend.

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

**Hard constraint: line height must not change** between revealed and hidden states. This
is the most common way live-preview implementations feel bad. Style hidden syntax to zero
width rather than `display: none` where possible, and keep formatting classes to properties
that don't alter line box height. Cover with a geometry regression test.

### 5.3 Card decorations

Within a card editor, additional decorations:

- **Line 1 → title class** (high contrast, heavier weight).
- **Lines 2+ → description class** (reduced contrast).

Both are `mark` decorations keyed on line number. They apply identically in the static
render, which is how §4.4's pixel-identity constraint is met — the static renderer and the
editor share one stylesheet and one markdown-to-HTML path.

### 5.4 Editor behaviors

Beyond stock CM6 markdown: list continuation on Enter (including Enter on an empty list
item, which outdents then terminates), `Tab`/`Shift-Tab` indentation, click-to-toggle
checkboxes, idempotent `Cmd-B`/`Cmd-I` wrapping.

In card editors additionally: three consecutive returns splits (§4.7), backspace at
position 0 merges upward, `Escape` blurs and unmounts back to static.

The split threshold is a **named constant**, not a literal. The PRD expects it to change.

---

## 6. Storage

### 6.1 Primary: y-indexeddb

Persists the Yjs document and is the durable local store. Also syncs updates across tabs of
the same origin for free, removing any need for tab coordination on the write path.

Request `navigator.storage.persist()` on first successful write. Surface the granted/denied
state in settings — a local-first app that can be silently evicted should say so.

### 6.2 Derived: SQLite-WASM

Used only for what the Yjs document can't answer efficiently: full-text search, date-range
queries, reference resolution, backlinks, and the stale-Next-item scan that drives the
PRD §6 indicator.

**It is a cache.** Never written by the user, never synced, safe to delete. If missing,
corrupt, or a schema version behind, delete and rebuild from the Yjs document. This must be
an ordinary tested code path, not an emergency one.

Constraints:

- Use official `@sqlite.org/sqlite-wasm` with the **OO1 API**. As of 2026-04-15 the
  `Worker1` and `Promiser1` wrappers are deprecated by their author as too fragile and
  limited for non-toy use and will not be extended. **Do not build on them** — most
  tutorials still teach them. Write a dedicated worker with a small hand-rolled RPC layer.
- Use the **`opfs-sahpool` VFS** (SQLite 3.43.0+). No `SharedArrayBuffer`, therefore **no
  COOP/COEP headers** — a meaningful deployment simplification.
- OPFS requires a worker context; all SQLite access goes through it.
- `opfs-sahpool` holds exclusive access; a second tab can't acquire it. Guard with
  `navigator.locks`; a tab without the lock runs normally with search disabled and says so.
  Data is unaffected — the Yjs doc is shared via IndexedDB regardless.
- **Load lazily.** The ~1 MB wasm must not block first paint or first keystroke. Fetch on
  idle after the editor is interactive, or on first search.

### 6.3 Index schema

```sql
CREATE TABLE docs (
  doc_id     TEXT PRIMARY KEY,   -- 'master' | 'day:2026-08-05:log' | 'day:2026-08-05:archive'
  kind       TEXT NOT NULL,      -- 'master' | 'log' | 'archive'
  date       TEXT,
  body       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE cards (
  card_id    TEXT PRIMARY KEY,
  date       TEXT NOT NULL,
  section    TEXT NOT NULL,      -- 'next' | 'scheduled' | 'done'
  position   INTEGER NOT NULL,
  title      TEXT NOT NULL,      -- first line
  body       TEXT NOT NULL,      -- full text
  origin     TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE items (                -- markers parsed out of documents
  item_id       TEXT PRIMARY KEY,
  doc_id        TEXT NOT NULL REFERENCES docs(doc_id) ON DELETE CASCADE,
  line          INTEGER NOT NULL,
  depth         INTEGER NOT NULL,
  text          TEXT NOT NULL,
  done          INTEGER NOT NULL DEFAULT 0,
  done_at       TEXT,
  scheduled_for TEXT
);

CREATE VIRTUAL TABLE docs_fts  USING fts5(body,        content='docs',  content_rowid='rowid', tokenize='porter unicode61');
CREATE VIRTUAL TABLE cards_fts USING fts5(title, body, content='cards', content_rowid='rowid', tokenize='porter unicode61');

CREATE INDEX cards_by_day  ON cards(date, section, position);
CREATE INDEX cards_stale   ON cards(date, section) WHERE section = 'next';
CREATE INDEX items_open    ON items(done) WHERE done = 0;
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

No provider is constructed until an endpoint is configured. Nothing on the read or write
path may await sync state. **Deleting the sync configuration entirely must leave a fully
working app** — enforced by running the full suite with the provider absent.

### 7.2 Relay

Self-hosted `y-websocket`, or `y-sweet` if S3-backed persistence is wanted later (Rust,
actively maintained, explicitly supports self-hosting). Either is one small process; both
treat updates as opaque binary. Auth is a shared bearer token over TLS — unsophisticated,
but the threat model is one person's task list.

The relay is not a backup. Every device holds a full replica, and the export (§9) is the
backup story.

---

## 8. Layout and interaction

### 8.1 Responsive shell

One layout system, two breakpoints. The same three surfaces (Menu / Today / Goals) are
positioned on a plane; the breakpoint decides whether the viewport shows one panel or three.

- **Narrow:** single panel, spatial navigation by gesture, adjacent views partially
  revealed during drag.
- **Wide:** three panels side by side. Today and Goals are independently scrollable
  regions constrained to viewport height — `100dvh` with `min-height: 0` on flex children
  so they scroll internally rather than growing the page. The document body never scrolls.
  Adjacent days render above and below Today as faded, rounded, dimmed panel edges that are
  also click targets.
- **Half-width:** deferred (PRD §12 Q3). Leave the breakpoint table with an explicit gap
  rather than guessing.

Only the current view plus immediate neighbors mount. Neighboring days render their static
card lists — cards are static by default (§4.4), so a revealed neighbor shows real content
at no editor cost.

### 8.2 Gestures

Pointer Events. **Swipe navigates; long-press-then-drag selects** (PRD §7.2).

1. `pointerdown` records origin and starts a long-press timer (~400 ms).
2. Movement past ~10 px before the timer fires → **navigation.** Lock to the dominant axis,
   capture the pointer, translate the container.
3. Timer fires without movement → **selection mode.** Release the container, hand the
   pointer to the editor (or, on a Done card, unlock it).
4. `pointerup` before either → **tap.** Place cursor, mounting an editor if needed (§4.4).

Requires `user-select: none` on the container with selection re-enabled on entering
selection mode, and `touch-action: none` on navigable surfaces. `overscroll-behavior: contain`
prevents pull-to-refresh and overscroll glow. Gestures must not require starting at a screen
edge, keeping them clear of the system back gesture.

Vertical drags inside a scrollable region scroll it, and navigate only at a scroll extent
with continued motion in that direction.

### 8.3 Keyboard

Desktop is keyboard-first. Bindings live in one table so they're discoverable and remappable
later. `Cmd/Ctrl-K` opens a command palette backed by the SQLite index — which must degrade
gracefully when the index hasn't loaded (§6.2).

---

## 9. Export and import

Export produces a zip of markdown, no server involved:

```
master.md
days/2026-08-05.md      # ## Log / ## Next / ## Scheduled / ## Done
```

Documents (`master`, `log`) are dumped verbatim — they are already markdown. Collections
serialize as lists of cards separated by blank lines, which is the same transformation
`archive` compaction performs (§4.5), so there is exactly one serializer and freezing
exercises it continuously.

Import parses the same layout, splitting on canonical headings and re-splitting cards on
blank lines. Round-tripping export → import → export must be byte-identical.

---

## 10. Known debt and risks

### 10.1 Yjs v13 / v14

`y-codemirror.next@0.3.5` targets Yjs v13; its last npm release is roughly two years old.
The repo's main branch develops `@y/codemirror` for Yjs v14, unreleased.

**Pin Yjs v13 and `y-codemirror.next@0.3.5`.** The binding is stable and narrow. Migration
is planned debt, not a blocker. Isolate every Yjs import behind one internal module so the
migration has a single seam.

### 10.2 Many small editors

Cards mount editors individually. Even with static-by-default (§4.4), mount/unmount happens
on every focus change and must be fast enough to feel like a text field, not a modal.
Budget in §12. If mount cost proves visible, the fallback is a single pooled editor instance
reparented between cards — more complex, so don't build it preemptively.

### 10.3 Two storage systems

Yjs-in-IndexedDB plus SQLite-in-OPFS means two things that can drift. Mitigation is
architectural: SQLite is strictly derived and the rebuild path runs routinely. If a bug ever
makes the index authoritative for anything, that's the bug.

### 10.4 The freeze is destructive

Compaction deletes card objects. If the serializer has a bug, it silently damages history
three days after the fact — the worst possible detection latency. Mitigations: the
serializer is shared with export (§9) and therefore continuously exercised; compaction
verifies round-trip (serialize → parse → compare) in the same transaction and aborts on
mismatch; and freezing is deferred, never retried destructively, if verification fails.

### 10.5 Storage eviction

Browsers can evict origin storage. `persist()` reduces but doesn't eliminate the risk. With
sync configured another replica exists; without it, export is the only backup — so prompt
for an export periodically if sync has never been configured.

### 10.6 Framework choice

React + Vite on ecosystem grounds; Svelte is defensible (smaller bundle, little component-tree
complexity here). It barely matters — the editor is CodeMirror and state lives in Yjs, both
framework-agnostic. Decide at Phase 1, don't revisit.

---

## 11. Testing

**Convergence (property-based).** Random concurrent edit sequences against two replicas,
applied in both orders, assert identical final state. Must include **concurrent card moves**
between collections, which is where array semantics are least obvious. Runs on every commit.

**Round-trip.** `export → import → export` byte-identical. Editor content equals stored
`Y.Text` after arbitrary edit sequences.

**Freeze safety.** For arbitrary day contents, `compact → parse` reproduces the original
collections exactly. Concurrent compaction on two replicas converges.

**Index rebuild determinism.** Index state after incremental updates equals index state
after a full rebuild from the same document.

**Pixel identity.** Static card render and mounted editor produce identical geometry, across
every supported markdown construct. Same test covers live-preview line-height stability.

**Cap enforcement.** No sequence — paste, multi-line insert, undo, drag, concurrent
insert-from-two-devices — produces four cards in `next`.

**Sync-absent.** Full suite passes with no sync provider constructed.

---

## 12. Performance budgets

Build-failing thresholds, not aspirations.

| Metric | Budget |
|---|---|
| Keystroke → paint | < 16 ms p95 |
| Card focus → editable | < 50 ms |
| Cold start → Today editable | < 2.5 s |
| Warm start → Today editable | < 1.0 s |
| Day-to-day navigation | < 100 ms |
| Search results (10k items) | < 150 ms |
| Initial JS bundle (excl. sqlite wasm) | < 350 KB gzipped |
| Yjs doc load (encoded state) | < 500 ms |

The sqlite wasm binary sits outside the initial bundle budget because it loads lazily
(§6.2); the app must be fully usable for writing before it arrives.

---

## Sources

- [Yjs](https://github.com/yjs/yjs) · [Subdocuments](https://docs.yjs.dev/api/subdocuments) · [y-codemirror.next](https://github.com/yjs/y-codemirror.next) · [y-websocket-server](https://github.com/yjs/y-websocket-server)
- [Y-Sweet](https://github.com/jamsocket/y-sweet) · [docs](https://docs.y-sweet.dev/)
- [SQLite Wasm](https://github.com/sqlite/sqlite-wasm) · [Persistent Storage Options](https://sqlite.org/wasm/doc/trunk/persistence.md) · [SQLite Wasm + OPFS (Chrome)](https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system) · [State of SQLite persistence on the web, May 2026](https://powersync.com/blog/sqlite-persistence-on-the-web)
- [CodeMirror: hide markdown syntax](https://discuss.codemirror.net/t/hide-markdown-syntax/7602) · [atomic-editor](https://github.com/kenforthewin/atomic-editor) · [codemirror-live-markdown](https://github.com/blueberrycongee/codemirror-live-markdown)
- [Tiptap bidirectional markdown](https://tiptap.dev/blog/release-notes/introducing-bidirectional-markdown-support-in-tiptap) · [markdown round-trip corruption report](https://github.com/wonderwhy-er/DesktopCommanderMCP/issues/440) · [rich text editor comparison, 2026](https://velt.dev/blog/best-rich-text-editors-react-comparison)
- [Yjs vs Automerge vs Loro, 2026](https://www.pkgpulse.com/guides/yjs-vs-automerge-vs-loro-crdt-libraries-2026) · [crdt-benchmarks](https://github.com/dmonad/crdt-benchmarks)
