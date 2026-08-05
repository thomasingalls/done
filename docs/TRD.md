# done — Technical Requirements

**Status:** Draft v1
**Date:** 2026-08-05
**Companion to:** [PRD.md](./PRD.md)

---

## 1. Summary of decisions

| Concern | Decision |
|---|---|
| CRDT | Yjs v13 (pinned, see §9.1) |
| Editor | CodeMirror 6, plain-markdown source of truth |
| Live preview | Custom CM6 decoration extension (cursor-line syntax reveal) |
| Primary persistence | `y-indexeddb` |
| Query/search index | SQLite-WASM (`opfs-sahpool` VFS) + FTS5, **derived and disposable** |
| Sync transport | `y-websocket` or `y-sweet`, self-hosted, **optional** |
| App framework | React + Vite (or Svelte — see §9.4) |
| PWA shell | Hand-rolled service worker, precache-only |
| Targets | Desktop Chrome/Edge, Android Chrome |

The load-bearing decision is that **Yjs is the source of truth and SQLite is a cache**.
Everything else follows from that.

---

## 2. Why not a SQL sync engine

You raised Zero, ElectricSQL, Replicache, RxDB, and Convex. They're the right family of
tool for a different problem, and one property rules them out here.

**This app is a pile of markdown documents that get edited from two devices.** The
conflict that will actually happen to you is: you add a line to today's log on your
phone on the train, your laptop has the same day open from this morning, and both
sync. Every SQL-shaped sync engine resolves that at row or field granularity — one
device's version of the whole text field wins and the other is discarded. Silent
data loss on the exact operation the app exists to perform.

A text CRDT merges that at character granularity and keeps both edits. That's not a
nice-to-have here; it's the core requirement.

Secondarily, the server posture differs. Zero, Electric, and Convex are
server-authoritative: the server holds truth, and clients hold a cache with optimistic
local writes that the server ultimately orders. Durability of a write depends on the
server accepting it. Replicache is the same shape with more of the server left to you.
That contradicts "a cloud instance must not be a blocking requirement."

RxDB is the closest fit — a local database with pluggable replication, and it can run
with no server. But its conflict handling is document-level, so it lands back on the
same text-merge problem.

**Chosen instead:** Yjs, with the relay as a dumb pipe carrying opaque binary updates.
It holds no authority, runs no application logic, and can be absent entirely.

### 2.1 Why Yjs over Automerge or Loro

Loro benchmarks fastest and Automerge has a richer history model, but Yjs has the
ecosystem this project depends on — specifically a maintained CodeMirror 6 binding
(`y-codemirror.next`), IndexedDB persistence, and multiple interchangeable sync
providers. At single-user scale, none of the performance differences are observable.
Automerge's git-like history is genuinely attractive for a journal, but it costs
performance and bundle size for a feature the PRD doesn't ask for. Revisit only if
document time-travel becomes a requirement.

---

## 3. Data model

### 3.1 Principle: markdown is the truth

There is no parallel structured representation of your items. Everything a user can see
or edit lives in markdown text inside a `Y.Text`. Structured data (completion state,
scheduled dates, item identity) is expressed **in the markdown itself**, using syntax
compatible with the Obsidian Tasks convention.

This buys three things: export is a byte-for-byte dump rather than a serializer, the
index can always be thrown away and rebuilt, and there is exactly one place a given fact
lives.

### 3.2 Document tree

```
Y.Doc (root)
├── meta            Y.Map     { schemaVersion: number, createdAt: string }
├── master          Y.Text    the master list, one markdown outline
└── days            Y.Map<ISODate, Y.Map>
      └── "2026-08-05"
            ├── log        Y.Text
            ├── next       Y.Text
            └── scheduled  Y.Text
```

That is the entire schema. Three text documents per touched day, one global.

**Why three `Y.Text`s per day rather than one document with `## Next` headings:** the
three-item cap must be enforced structurally, and section-parsing a single document
makes that fragile — a stray edit to a heading would silently disable the constraint.
Three bound editors is also a much simpler CodeMirror integration. The cost is that you
can't freely move text across section boundaries with a single selection. Export
concatenates the three under canonical headings; import splits on them, so the plain-text
representation is unaffected.

Day maps are created lazily on first write. An untouched day occupies nothing.

### 3.3 Item identity

Most items are anonymous — a line of markdown, nothing more. An item gains a stable ID
only when something needs to point at it.

The ID is a trailing caret marker, Obsidian block-reference style:

```markdown
- [ ] Draft the migration plan ^k3f9x2
- [x] Call the dentist ✅2026-08-04 ^m2p8qq
- [ ] Renew passport 📅2026-09-01 ^b7dd41
```

- IDs are 6 characters from a lowercase alphanumeric alphabet, generated on demand and
  checked against the index for collisions.
- The marker is **hidden by the editor decoration** unless the cursor is on that line —
  consistent with how every other piece of markdown syntax behaves (§4).
- Completion state is `- [x]`. Completion date is `✅YYYY-MM-DD`. Scheduled date is
  `📅YYYY-MM-DD`. These are text; the index parses them.

### 3.4 References

A Next or Scheduled entry is either a plain typed line (an ad-hoc action that doesn't
exist in the master list) or a reference:

```markdown
- [[^k3f9x2]]
```

The editor decorates a reference inline, showing the referenced item's live text and
checkbox state. Resolution is an index lookup for the document and line bearing that
marker. A reference whose target has been deleted renders as a visible broken-reference
chip rather than failing silently.

### 3.5 Document size and the subdocument question

Estimated ten-year steady state: ~3,650 days × ~400 characters ≈ 1.5 MB of text.
Yjs with GC enabled (the default) discards deleted content, so encoded state should
land in the low single-digit megabytes.

**v1 uses a single root document.** Subdocuments add loading-state coordination and
provider complexity for a problem that does not yet exist. Because days are keyed in a
`Y.Map`, converting a day's value from an inline `Y.Map` to a subdoc is a contained
migration rather than a rewrite.

**Migration trigger — implement subdocs (one per year) when either holds:**
encoded document state exceeds 20 MB, or cold load-to-editable exceeds 500 ms.
Instrument both from day one so this is a measurement, not a guess.

---

## 4. Editor

### 4.1 Architecture

CodeMirror 6, with `Y.Text` bound via `y-codemirror.next`. The document CodeMirror holds
is literal markdown. Every visual affordance is a **view-layer decoration** — CM6's
`Decoration.replace` and `Decoration.mark` over ranges computed from the Lezer markdown
syntax tree. Nothing in the rendering pipeline mutates the document.

This is the same approach Obsidian's Live Preview takes, and it's what makes
byte-for-byte round-tripping automatic rather than something you have to defend.

### 4.2 Live preview extension

A `ViewPlugin` that recomputes decorations on document change, viewport change, and
selection change:

1. Walk the syntax tree over the visible ranges only.
2. For each markdown node, compute the ranges covering its syntax characters
   (`**`, `##`, backticks, link brackets, the `^id` marker).
3. If the cursor or any selection range intersects the node's **line**, emit no
   replacement — raw syntax shows.
4. Otherwise replace syntax ranges with zero-width decorations and apply a `mark`
   decoration carrying the formatting class to the content range.

**Hard constraint: line height must not change** between the revealed and hidden states.
This is the single most common way live-preview implementations feel bad — text jumping
vertically under the cursor. Enforce it by styling hidden syntax to zero width rather
than `display: none` where possible, and by keeping formatting classes to properties
that don't alter line box height. Cover it with a regression test that measures line
geometry in both states.

Decoration computation must stay off the keystroke critical path for large documents:
restrict the tree walk to the viewport, and never walk the whole document synchronously.

### 4.3 Editor behaviors

Beyond stock CM6 markdown: list continuation on Enter (including checkbox lists and
correct handling of Enter on an empty list item, which should outdent then terminate),
`Tab`/`Shift-Tab` list indentation, click-to-toggle checkboxes, and `Cmd-B`/`Cmd-I`
that wrap or unwrap the selection idempotently.

### 4.4 The three-item cap

Enforced in the `next` editor via a `changeFilter` transaction filter that rejects any
change producing a fourth top-level list item. Rejecting the transaction outright would
feel broken, so the filter instead blocks the change and surfaces the displacement
picker: choose which of the three to bump, and whether it returns to the master list or
is marked done.

---

## 5. Storage

### 5.1 Primary: y-indexeddb

`y-indexeddb` persists the Yjs document and is the durable local store. It also
synchronizes Yjs updates across browser tabs of the same origin for free, which removes
any need for tab-coordination logic on the write path.

Request `navigator.storage.persist()` on first successful write to reduce eviction risk.
Surface the granted/denied state in settings — a local-first app that can be silently
evicted should say so.

### 5.2 Derived: SQLite-WASM

Used only for queries the Yjs document can't answer efficiently: full-text search,
date-range queries, reference resolution, and backlinks.

**It is a cache.** It is never written to by the user, never synced, and is safe to
delete at any time. If it's missing, corrupt, or a schema version behind, the app
deletes it and rebuilds from the Yjs document. This must be an ordinary, tested code
path, not an emergency one.

**Implementation constraints:**

- Use official `@sqlite.org/sqlite-wasm` with the **OO1 API**. As of 2026-04-15 the
  `Worker1` and `Promiser1` wrapper APIs are deprecated by their author as too fragile
  and too limited for non-toy use, and will not be extended. **Do not build on them.**
  Write a dedicated worker with a small hand-rolled RPC layer instead.
- Use the **`opfs-sahpool` VFS** (SQLite 3.43.0+). It does not require
  `SharedArrayBuffer`, so the app does **not** need COOP/COEP headers — a meaningful
  deployment simplification.
- OPFS requires a worker context; all SQLite access goes through the worker.
- `opfs-sahpool` holds exclusive access. A second tab will fail to acquire it. Guard
  with `navigator.locks`; a tab that can't get the lock runs normally but with search
  disabled and says so in the UI. Data is unaffected — the Yjs doc is shared via
  IndexedDB regardless.
- **Load lazily.** The ~1 MB wasm binary must not block first paint or first keystroke.
  Fetch it on idle after the editor is interactive, or on first search.

### 5.3 Index schema

```sql
CREATE TABLE docs (
  doc_id     TEXT PRIMARY KEY,   -- 'master' | 'day:2026-08-05:log'
  kind       TEXT NOT NULL,      -- 'master' | 'log' | 'next' | 'scheduled'
  date       TEXT,               -- ISO date, null for master
  body       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE items (
  item_id       TEXT PRIMARY KEY,  -- the ^marker
  doc_id        TEXT NOT NULL REFERENCES docs(doc_id) ON DELETE CASCADE,
  line          INTEGER NOT NULL,
  depth         INTEGER NOT NULL,
  text          TEXT NOT NULL,     -- rendered text, markers stripped
  done          INTEGER NOT NULL DEFAULT 0,
  done_at       TEXT,
  scheduled_for TEXT
);

CREATE TABLE refs (
  from_doc TEXT NOT NULL REFERENCES docs(doc_id) ON DELETE CASCADE,
  to_item  TEXT NOT NULL,
  PRIMARY KEY (from_doc, to_item)
);

CREATE VIRTUAL TABLE docs_fts USING fts5(
  body, content='docs', content_rowid='rowid', tokenize='porter unicode61'
);

CREATE INDEX items_scheduled ON items(scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX items_open      ON items(done) WHERE done = 0;
```

### 5.4 Index maintenance

Subscribe to `Y.Text` observers. On change, debounce ~300 ms, then re-parse the affected
document and replace its rows in a single transaction. Per-document reparse is cheap
enough (documents are kilobytes) that incremental line-level diffing is unwarranted.

A full rebuild walks every document and should complete in well under a second at the
projected data scale. Run it on schema-version mismatch, on index-open failure, and on
demand from settings.

---

## 6. Sync

### 6.1 Provider interface

Sync sits behind a narrow interface with a **null implementation as the default**:

```ts
interface SyncProvider {
  connect(): void;
  disconnect(): void;
  readonly status: 'disabled' | 'connecting' | 'connected' | 'offline';
  readonly lastSyncedAt: Date | null;
}
```

No provider is constructed until the user configures an endpoint in settings. Nothing on
the read or write path may await sync state. The correctness requirement: **deleting the
sync configuration entirely must leave a fully working app.** Enforce it with a test that
runs the full suite with the provider absent.

### 6.2 Relay

Self-hosted `y-websocket` server, or `y-sweet` if S3-backed persistence and horizontal
scaling are wanted later (y-sweet is Rust, actively maintained, and explicitly supports
self-hosting). Either is a single small process; both treat updates as opaque binary.

- Single-user, so auth is a shared bearer token in the WebSocket URL over TLS. Not
  sophisticated, but the threat model is one person's task list.
- The relay is not a backup. It holds convergent state, but every device holds a full
  replica, and the export in §8 is the actual backup story.

### 6.3 Correctness bar

Two devices, both offline, both editing the same day's log, must converge to a document
containing both sets of edits with no prompt. This is a property test, not a manual
check — see §10.

---

## 7. Navigation

### 7.1 Model

A single container with views positioned on a 2D plane; navigation is a transform on that
container. No router, no history stack. Today is the origin; the URL reflects current
position (`/2026-08-05`, `/goals`) for deep-linking and refresh restoration, but URL
changes are a consequence of navigation rather than the mechanism.

Only the current view plus its four immediate neighbors are mounted. Neighboring day
views mount their editors but keep them read-only until focused, so a drag reveals real
content rather than a placeholder.

### 7.2 Gesture handling

Pointer Events with a directional lock:

1. On `pointerdown` inside a navigable surface, record the origin. Don't capture yet —
   let the editor handle cursor placement.
2. Once movement exceeds ~10 px, determine the dominant axis and lock to it.
3. If the axis is vertical and the current view scrolls, the drag scrolls the view.
   Navigate only when already at a scroll extent and continuing in that direction.
4. If the axis is horizontal, capture the pointer and translate the container.
5. On release, snap to the nearest view past a distance/velocity threshold.

Text selection and gesture navigation both want a horizontal drag inside the editor.
Resolution: a drag that begins inside a focused editor is always selection. Navigation
from a focused editor requires either starting the drag in the chrome strip, or the
keyboard. This is a real constraint that limits gesture reach on mobile, and it is the
item most likely to need revision after real use.

`overscroll-behavior: contain` on the container prevents Android Chrome's pull-to-refresh
and overscroll glow. Gestures must not require starting at the screen edge, which keeps
them clear of the system back gesture.

### 7.3 Keyboard

Desktop is keyboard-first (PRD §5.1). Bindings live in a single table so they're
discoverable and remappable later. `Cmd/Ctrl-K` opens a command palette; the palette
queries the SQLite index, which means it must degrade gracefully when the index hasn't
loaded yet.

---

## 8. Export and import

Export produces a zip of markdown files with no server involvement:

```
master.md
days/2026-08-05.md      # ## Log / ## Next / ## Scheduled
```

Each day file concatenates its three `Y.Text`s under canonical headings. Since the
stored form *is* markdown, this is concatenation, not serialization — there is no
lossy step and no separate export format to keep in sync with the schema.

Import parses the same layout, splitting on the canonical headings. Round-tripping
export → import → export must be byte-identical; test it.

---

## 9. Known debt and risks

### 9.1 Yjs v13 / v14

`y-codemirror.next@0.3.5` targets Yjs v13 and its last npm release is roughly two years
old. The repository's main branch is developing `@y/codemirror` for Yjs v14, unreleased.

**Decision: pin Yjs v13 and `y-codemirror.next@0.3.5`.** The binding is stable and
narrow in surface area. Migration to v14 + `@y/codemirror` is planned debt, not a
blocker. Isolate every Yjs import behind a thin internal module so the migration has one
seam.

### 9.2 Two storage systems

Yjs-in-IndexedDB plus SQLite-in-OPFS means two things that can be out of step. The
mitigation is architectural rather than defensive: SQLite is strictly derived, and the
rebuild path is exercised routinely (§5.2). If a bug ever makes the index authoritative
for anything, that's the bug.

### 9.3 Gesture navigation on desktop

Mouse-dragging to navigate is unusual and slow. The mitigation is keyboard-first desktop
(§7.3), but there is a risk that the spatial model itself is a mobile idiom that reads as
awkward on a large screen. Phase 2 should evaluate honestly whether desktop wants a
persistent multi-pane layout instead of the same single-view plane.

### 9.4 Framework choice

React + Vite is the default on ecosystem grounds. Svelte is a defensible alternative —
smaller bundle, and this app has little component-tree complexity. The choice barely
matters because the editor is CodeMirror (framework-agnostic) and state lives in Yjs
(framework-agnostic). Decide at Phase 1 and don't revisit.

### 9.5 Storage eviction

Browsers can evict origin storage under pressure. `navigator.storage.persist()` reduces
but doesn't eliminate the risk. With sync configured, another replica exists. Without it,
the export is the only backup — so the app should prompt for an export after some
interval if sync has never been configured.

---

## 10. Testing

**Convergence (property-based).** Generate random concurrent edit sequences against two
replicas of a document, apply in both orders, assert identical final state. This is the
only test that meaningfully guards the sync guarantee, and it should run on every commit.

**Round-trip.** `export → import → export` is byte-identical. Editor content equals
stored `Y.Text` content after arbitrary edit sequences.

**Index rebuild determinism.** Index state after incremental updates equals index state
after a full rebuild from the same document. Catches drift in the incremental path.

**Editor geometry.** Line height is unchanged between syntax-revealed and syntax-hidden
states, across every supported markdown construct.

**Sync-absent.** The full suite passes with no sync provider constructed.

**Cap enforcement.** No sequence of transactions — paste, multi-line insert, undo, drag —
produces four items in a `next` document.

---

## 11. Performance budgets

Treat as build-failing thresholds, not aspirations.

| Metric | Budget |
|---|---|
| Keystroke → paint | < 16 ms at p95 |
| Cold start → Today editable | < 2.5 s |
| Warm start → Today editable | < 1.0 s |
| Day-to-day navigation | < 100 ms |
| Search results (10k items) | < 150 ms |
| Initial JS bundle (excl. sqlite wasm) | < 350 KB gzipped |
| Yjs doc load (encoded state) | < 500 ms — see §3.5 trigger |

The sqlite wasm binary is explicitly outside the initial bundle budget because it is
lazily loaded (§5.2), and the app must be fully usable for writing before it arrives.

---

## Sources

- [Yjs](https://github.com/yjs/yjs) · [Subdocuments](https://docs.yjs.dev/api/subdocuments) · [y-codemirror.next](https://github.com/yjs/y-codemirror.next) · [y-websocket-server](https://github.com/yjs/y-websocket-server)
- [Y-Sweet](https://github.com/jamsocket/y-sweet) · [docs](https://docs.y-sweet.dev/)
- [SQLite Wasm](https://github.com/sqlite/sqlite-wasm) · [Persistent Storage Options](https://sqlite.org/wasm/doc/trunk/persistence.md) · [SQLite Wasm + OPFS (Chrome)](https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system) · [State of SQLite persistence on the web, May 2026](https://powersync.com/blog/sqlite-persistence-on-the-web)
- [CodeMirror: hide markdown syntax](https://discuss.codemirror.net/t/hide-markdown-syntax/7602) · [atomic-editor](https://github.com/kenforthewin/atomic-editor) · [codemirror-live-markdown](https://github.com/blueberrycongee/codemirror-live-markdown)
- [Yjs vs Automerge vs Loro, 2026](https://www.pkgpulse.com/guides/yjs-vs-automerge-vs-loro-crdt-libraries-2026) · [crdt-benchmarks](https://github.com/dmonad/crdt-benchmarks)
