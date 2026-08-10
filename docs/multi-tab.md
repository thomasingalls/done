# Multi-tab

A design note, not a section of the TRD yet. It exists because pulling the persistence layer out
into its own library made the question unavoidable: a library that persists a Yjs document is
expected to keep the tabs of one browser in agreement, and this one does not. It has that property
today only by accident, and only when sync is switched on.

This note says what is actually true now, what "support multi-tab" has to mean, what the options
are, and what the work is. §9 lists the TRD paragraphs that would change.

---

## 1. What is true today

There are four ways an edit in one tab reaches another. Three are incidental and none of them is
live.

| Path                             | Fires                                                    | Carries                                            |
| -------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| `y-indexeddb` open               | Once, at tab open                                        | Everything flushed to IndexedDB before that moment |
| `y-indexeddb` trim               | After `PREFERRED_TRIM_SIZE` (500) updates in a given tab | Everything written since that tab's `_dbref`       |
| the recovery journal             | Once, at tab open                                        | Another tab's _un-flushed_ updates                 |
| `y-websocket`'s BroadcastChannel | Continuously — **iff** sync is configured and enabled    | Document updates and awareness                     |

The journal one is worth noticing because it was not designed: `readJournal` in
`src/crdt/persistence.ts` matches the whole `done.pending-update.<db>.` prefix rather than this
page's own `journalSession`, so a tab opening now inherits and takes over flushing whatever
another tab has in flight. It is benign — the updates are idempotent, and `clearJournal` compares
the stored value before removing a key, so the two tabs cannot delete each other's work — but it
means the tab-open path already reads across tabs by two independent mechanisms.

The fourth is the accident that matters. `y-websocket@3.0.0` subscribes to a BroadcastChannel
named `${endpoint}/${room}` inside `connect()`, and publishes both sync and awareness messages to
it (`node_modules/y-websocket/src/y-websocket.js`, `connectBc`). `src/crdt/yjs.ts` constructs the
provider with `connect: false` and then calls `provider.connect()`, so the channel is live from
that moment — and because BroadcastChannel is local, it stays live with the relay unreachable.

**So cross-tab liveness is currently a property of having configured sync, not a property of the
app.** Delete the sync configuration — the state TRD §7.1 requires to be fully working, and the
state the whole test suite runs in — and it disappears.

It also brings three artifacts, all of which read as bugs:

- **Your own tabs appear as peers.** `createSync` filters awareness states by `doc.clientID`, and a
  second tab is a second clientID with the same device name. The menu says `Mac, Mac`.
- **Your own tabs look like syncs.** y-websocket applies BroadcastChannel messages with the
  provider as the transaction origin, which is exactly what `onRemoteUpdate` tests for. Editing in
  another tab sets `lastSyncedAt`; the menu reports "synced just now, from another device" about
  bytes that never left the machine.
- **Your own caret appears as a collaborator's.** `yCollab` renders remote carets from awareness,
  and the other tab's is one.

### 1.1 What actually goes wrong without it

Not convergence. Two tabs are two replicas, and that model is already covered: `test/replicas.ts`
puts N stores around a hub and `syncProperties.test.ts` generates the sequences. Nothing is lost
by a stale tab either — every tab writes every update to IndexedDB, and the next open merges them.

What goes wrong is liveness, and the cost lands entirely on the human's model of the document:

- Type in tab A, switch to tab B, type in the same card. On the next reload the two edits
  interleave by character. Correct per the CRDT, and not what anyone meant.
- Move a card to Done in A; B still shows it in Next and will happily move it again. The
  membership repair dedupes the result, so the document is fine — but the card moved twice.
- The three-item Next cap is a rule about adding, enforced against a per-tab view, so two tabs can
  each add a third item. That is already true across devices and deliberately not repaired
  (PRD §3); multi-tab makes it reachable in five seconds rather than on a trip.

None of that is data loss. It is the app being wrong on screen, which for an editor is the more
expensive kind of wrong.

---

## 2. What "support multi-tab" has to mean

Three things, in dependency order.

1. **Liveness.** An edit in one tab appears in the others without a reload, whether or not sync is
   configured, and whether or not a relay exists.
2. **Identity.** A tab is not a device. Peers, remote carets, `lastSyncedFrom` and undo all
   currently conflate the two.
3. **Single-writer resources.** IndexedDB's trim, compaction, the relay socket, and — Phase 4 —
   the `opfs-sahpool` lock that TRD §6.2 already promises to guard.

Explicitly out of scope: convergence (done), anything about _devices_ (TRD §7), and a tab-manager
UI. Nobody wants to administer their tabs.

---

## 3. Options

### 3.1 BroadcastChannel

A channel per document name, a `y-protocols/sync` handshake on subscribe, and updates published as
they happen. This is what y-websocket and y-webrtc both do internally; `lib0/broadcastchannel`,
the primitive both use, is already a direct dependency of this project (`lib0@^0.2.109`), and
`y-protocols` is already behind the seam. So the whole thing is about sixty lines in
`src/crdt/yjs.ts` plus a policy module, and **zero new dependencies** — which matters against a
350 KB gzip budget (TRD §12, `scripts/check-budget.mjs`).

Support: BroadcastChannel shipped in Safari 15.4 (March 2022) and long before that everywhere
else. `lib0` falls back to a localStorage-event polyfill where it is missing, so there is no
support floor to defend.

What it does not solve: nothing is centralised. Every tab still has its own socket, its own
IndexedDB writes, and its own claim on any exclusive resource.

### 3.2 SharedWorker

One worker owns the document, IndexedDB, the socket, and later the SQLite/OPFS index; tabs become
views that hold a thin replica and exchange updates over a `MessagePort`. Tabs still need their own
`Y.Doc` — CodeMirror cannot bind to a document in a worker — so this does not remove the local
replica, it adds a hub above it.

It is the right shape for the single-writer problems: one socket, one writer, one compaction actor,
one lock holder, and a socket that survives every tab being backgrounded. It is also the answer to
the Phase 4 constraint in TRD §6.2 — instead of "a tab without the lock runs with search
disabled", every tab gets search because the worker holds the lock.

Support is no longer the objection it was. Safari has had SharedWorker since 16; Chrome for Android
is shipping it in **148**, enabled for all users, along with `extendedLifetime: true` for a worker
that outlives its clients. As of writing 148 is in beta, so the Android installed base is the
lagging part — verify the current stable milestone before relying on it.

The objections that remain are about this codebase rather than the platform:

- **You build the BroadcastChannel path anyway**, as the fallback for browsers and installed-base
  versions without a worker, and for the case where the worker fails to start. Two mechanisms, not
  one.
- **It relocates the load-before-connect constraint** (TRD §6.1, `openStore`'s second reason for
  being `async`) from one `await` into a cross-context protocol. That ordering is the single
  constraint in this codebase with a test written specifically to stop someone optimising it away.
- **The seam gets much wider.** Today `src/crdt/yjs.ts` is the only file that names a Yjs package
  and `test/seam.test.ts` enforces it. A worker moves persistence and transport behind a port,
  which is a different architecture, not a different import.
- **It is close to untestable at the unit level.** jsdom has no `SharedWorker` (verified: `typeof
SharedWorker === 'undefined'` under this project's vitest environment), so everything moves to
  Playwright.

Verdict: not now. Revisit when Phase 4 exists, because a single owner for the OPFS lock is the
first reason to want one that is about function rather than tidiness.

### 3.3 Web Locks leader election

`navigator.locks.request(name, { mode: 'exclusive' }, () => new Promise(() => {}))` — the tab whose
callback is running is the leader, and when it dies the lock releases and a queued request wins.
Standard, ~15 lines, and already the mechanism TRD §6.2 assumes for `opfs-sahpool`. Web Locks
shipped in Safari 15.4 alongside BroadcastChannel.

It is a complement, not an alternative: it decides _which_ tab does something, not how tabs talk.
The handoff is asynchronous, so nothing whose correctness depends on being timely may depend on
being the leader. Not available in jsdom (verified: `'locks' in navigator === false`), so it needs
a small injectable seam the way `SyncOptions.open` is one.

### 3.4 Existing solutions from Yjs

- **y-websocket's built-in BroadcastChannel** is what is running today (§1). It cannot be promoted
  into the answer: `connectBc()` is only reachable through `connect()`, so getting the channel
  without a socket means constructing a provider against a fake URL, and the channel name is
  derived from the endpoint, so two tabs configured differently would not share one.
- **`y-webrtc` with `signaling: []`** is the community's standard trick for BroadcastChannel-only
  sync, and it works. It also drags in the WebRTC provider, `simple-peer`, and room-key crypto for
  a channel we can open in sixty lines from dependencies already present, and its BroadcastChannel
  layer carries peer discovery rather than just document updates.
- **`y-indexeddb` will not do this.** The source is unambiguous: `fetchUpdates` runs at open and
  inside `storeState`, and `_storeUpdate` schedules `storeState` only once `_dbsize` crosses 500.
  There is no listener and no channel.
- **There is no standalone provider package.** No `y-broadcastchannel`, no `y-sharedworker`. The
  primitive is official and shared; the provider is left to the application. Worth stating plainly,
  because the instinct is to go looking for the package first.
- **`y-sweet`, `y-crossws`, `@y/websocket-server`** are relays (TRD §7.2). Nothing to do with tabs.
- **localStorage `storage` events** are the fallback `lib0` already implements, and this app already
  writes every update to localStorage for the journal — so every journal write _already_ fires a
  `storage` event in every other tab, carrying the base64 update in `newValue`. A working transport
  is sitting there unused. It is the fallback and not the design: synchronous main-thread writes,
  a 5 MB quota, and no delivery to same-page listeners.

---

## 4. Recommendation

**A tab channel over BroadcastChannel, behind the existing seam, constructed unconditionally.**
Then stop, measure, and only add leader election when Phase 4 gives it a job.

### Phase 1 — the tab channel

New `src/crdt/tabs.ts`, sitting beside `sync.ts` as a second policy layer over a second transport,
with the transport itself in `src/crdt/yjs.ts` because `y-protocols` is seam-controlled.

Decisions, with reasons:

- **Document updates only. No awareness.** The channel does not carry cursors. Two tabs of one
  person do not need to see each other's carets, and _not_ carrying awareness is what fixes the
  `Mac, Mac` peer list and the self-caret in one move rather than three. This is also why
  `openWebsocket` should pass `disableBc: true` from now on: cross-tab behaviour should live in one
  place, and that place should not be the relay transport.
- **A sync handshake on open, not just a stream.** On subscribe, publish `syncStep1` with the local
  state vector; answer an incoming step1 with step2. Without it, a tab that opens second is
  correct only to the extent that IndexedDB and the journal happened to be current — which is
  true today, and is exactly the kind of correctness that turns into a bug the moment flush timing
  changes.
- **Re-handshake after a freeze.** BroadcastChannel delivers nothing to a frozen or bfcached page,
  and the page gets no gap notification. So `resync()` on `visibilitychange` → visible, on
  `pageshow` when `event.persisted`, and at start-up when `document.wasDiscarded`. **This is the
  requirement most likely to be missed**, and its absence looks exactly like "multi-tab works,
  except sometimes on my phone".
- **A distinct transaction origin, carrying no actor.** Received updates are applied with a frozen
  `{ tab: <id> }` origin. That single choice gets four behaviours right for free: the UndoManager
  does not track them (`trackedOrigins` is matched by object identity), `persistence.ts` still
  persists them (it skips only `origin === provider`), `sync.ts` does not report them as relay
  syncs, and `requestPersistenceOnFirstWrite` does not fire on a sibling's edit, because it matches
  `origin.actor` and there isn't one. It also has to be checked before re-publishing, or two tabs
  echo forever — the same check y-websocket's `_bcSubscriber` makes.
- **Constructed after `await local.whenSynced`, before `createSync`.** Same ordering and the same
  reason as TRD §6.1: a document that has not finished loading must not be the thing another
  replica is told about. It costs nothing here and keeps one rule rather than two.
- **Every tab keeps its own socket and its own IndexedDB writes.** Both are changeable later under
  a lock; neither is worth changing before there is a number saying so. One consequence to accept:
  an edit made in one tab is sent to the relay once per tab that sees it. The relay absorbs the
  duplicates — `SharedDoc` broadcasts from `this.on('update')`, and re-applying an update it
  already holds changes nothing and therefore fires nothing — so the cost is upstream bytes, N per
  edit rather than one.

### Phase 1b — one IndexedDB writer (strongly recommended, separable)

Every Yjs update currently produces **two** rows in the `updates` store: `y-indexeddb`'s own
fire-and-forget `_storeUpdate` writes one, and the adapter's batched, transaction-complete write
adds a second. Verified against this repo — one update in, two rows out. Multi-tab multiplies it by
the number of open tabs, since every tab persists what it receives, which turns an invisible 2× into
a 2N×.

It also leaves the trim race in place. `storeState` reads everything at or above `_dbref`, sets
`_dbref` to the last key it saw, appends a full-document snapshot, and deletes everything below it.
Whether a second tab's write can land inside that sequence depends on whether the IndexedDB
transaction survives the promise chain between the `getAll` and the `getLastKey` — if it does not,
there is a window in which a row is deleted without having been read. With one writer this is
academic. With several tabs writing concurrently it is the one place in this design where a lost
update looks possible. **I have not reproduced it; the analysis is from the source.** That is
exactly the epistemic state in which you remove the concurrency rather than argue about the
interleaving.

Two ways to become the only writer:

1. `doc.off('update', provider._storeUpdate)` after construction. Three lines, reversible, and it
   reaches into a `_`-prefixed field of a pinned dependency — so it needs a test asserting the
   field exists, which fails loudly on upgrade rather than silently doubling the writes again.
2. Fork `y-indexeddb`'s ~150 lines into the seam, keeping the on-disk format (`updates` with
   `autoIncrement`, `custom`) so existing databases open unchanged. Drops a dependency, makes trim
   ours to schedule under a lock, and has precedent: `relay/src/connection.ts` documents forking
   `setupWSConnection` for a comparable reason.

Take (1) now. Take (2) when trim needs to be leader-aware, which is Phase 2.

### Phase 2 — leader election, when something needs it

Under one `navigator.locks` leader, in this order of value:

1. **The OPFS/SQLite index** (Phase 4). This is the one that changes behaviour rather than tidying
   it, and TRD §6.2 already specifies the guard.
2. **Trim/compaction.** Compaction is currently safety-paused and non-mutating
   (`src/crdt/compaction.ts`), so there is no live hazard — only a rule to have written down before
   it is unpaused.
3. **The relay socket.** One socket for the browser, with the leader forwarding on behalf of the
   others. This is the point at which awareness _does_ have to traverse the tab channel, because a
   non-leader tab's presence would otherwise never reach the relay — and it is also the point at
   which a SharedWorker is doing a better job than an elected tab. Re-evaluate there; do not
   pre-commit here.

---

## 5. The work

| File                      | Change                                                                                                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/crdt/yjs.ts`         | `openTabChannel`, mirroring `openWebsocket`'s shape: `lib0/broadcastchannel` for the pipe, `y-protocols/sync` for the framing, a narrow `TabSession { destroy, resync }`. Add `disableBc: true` to the `WebsocketProvider` options. |
| `src/crdt/tabs.ts` (new)  | Policy: handshake, visibility/bfcache `resync`, the tab origin, teardown. Injectable `open` for tests, like `SyncOptions.open`. No storage concerns, no relay concerns.                                                             |
| `src/crdt/persistence.ts` | Phase 1b: detach `provider._storeUpdate` so the adapter is the only writer.                                                                                                                                                         |
| `src/crdt/index.ts`       | Construct the tab channel after `await local.whenSynced` and before `createSync`; add it to `Store` and to `destroy()`.                                                                                                             |
| `src/crdt/sync.ts`        | Dedupe the peer list by device id and drop entries whose device id is this device's — correct regardless of the tab channel, and no longer masked by it.                                                                            |
| `src/ui/Menu.tsx`         | Optional: "2 tabs on this device", from a `hello`/`bye` count on the channel. Only if it earns the line.                                                                                                                            |
| `docs/TRD.md`             | §9 below.                                                                                                                                                                                                                           |

Sketch of the seam, for scale rather than for copying:

```ts
export interface TabSession {
  /** Re-announces state. For a page returning from freeze or bfcache. */
  resync: () => void;
  destroy: () => void;
}

export interface TabOptions {
  /** Names the document, not the relay: `done.tabs.<dbName>`. */
  channel: string;
  doc: YDoc;
  /** Frozen, actor-free, and the identity received updates are applied with. */
  origin: object;
  onRemoteUpdate?: () => void;
}

export type OpenTabChannel = (options: TabOptions) => TabSession;
```

---

## 6. Hazards

| Hazard                                                                                | New?                      | Answer                                                                                                                                                                    |
| ------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen/bfcached tab misses messages and is never told                                 | new                       | `resync()` on visibility, `pageshow`/`persisted`, `wasDiscarded` (§4)                                                                                                     |
| Echo between tabs                                                                     | new                       | Origin check before publishing                                                                                                                                            |
| IndexedDB rows per update: 2 → 2N                                                     | worsened                  | Phase 1b, one writer                                                                                                                                                      |
| `storeState` trim overlapping another tab's write                                     | worsened                  | Phase 1b, then leader-only trim                                                                                                                                           |
| Relay receives each edit once per open tab                                            | new                       | Accept — the relay's `on('update')` broadcast is a natural dedupe                                                                                                         |
| Membership repair ping-pong                                                           | new, bounded              | `repairCardMemberships` returns 0 and opens no transaction when nothing is wrong, so a repair that finds nothing emits no update and the exchange terminates in one round |
| Peer list and remote carets show your own tabs                                        | pre-existing              | Awareness stays off the channel; dedupe peers by device id                                                                                                                |
| `lastSyncedFrom` reports a same-device tab as a sync                                  | pre-existing              | `disableBc: true` plus the distinct origin                                                                                                                                |
| Undo is per-tab while TRD §4.8 scopes undo to the _actor_, and two tabs are one actor | pre-existing, now visible | Per-tab is the right behaviour — undo follows the surface you are looking at — but the TRD sentence should say so instead of leaving it inferred                          |
| Journal entries crossing tabs                                                         | pre-existing              | Benign (§1); pin it with a test rather than leaving it as folklore                                                                                                        |
| Service-worker update with several tabs open                                          | adjacent                  | Out of scope; the worker is precache-only (`src/pwa.ts`)                                                                                                                  |

---

## 7. Test plan

The environment facts were verified in this repo rather than assumed, and two of them make this
much cheaper to test than expected:

- `lib0/broadcastchannel`'s `publish` **delivers synchronously to same-process subscribers** as well
  as posting to the real channel. Two `openStore()` calls in one vitest file therefore sync through
  lib0's own subscriber set, with no scheduling and no fake transport. Two-tab tests are ordinary
  synchronous tests.
- `fake-indexeddb` is per process, so both stores can share one `dbName` and the IndexedDB
  interaction is real, not simulated.
- `typeof BroadcastChannel === 'function'` under jsdom — it is Node's, which is shared across
  _worker threads in the same process_. **Channel names must be unique per test file** or files
  running in parallel will cross-talk. This will not announce itself; it will look like flake.
- `'locks' in navigator === false` and `typeof SharedWorker === 'undefined'`. Leader election needs
  an injectable seam to be unit-testable at all; SharedWorker would be Playwright-only.

Suites:

1. **Liveness, sync-absent.** Two stores, one `dbName`, no relay: an edit in one appears in the
   other with no reload. This is the test that fails today and is the whole point.
2. **The handshake.** Open the second store after the first has edited _without_ flushing, and
   assert convergence — proving the handshake rather than IndexedDB is what did it.
3. **Origin discipline.** A received update is not on the receiving tab's undo stack; is persisted;
   does not set `lastSyncedAt`; does not trigger `requestPersistenceOnFirstWrite`.
4. **Termination.** A membership-affecting edit in one tab produces exactly one repair, not a
   ping-pong. Assert the second tab's repair returns 0.
5. **Write amplification.** Count rows in the `updates` store per update, with one tab and with
   two. A number in a test is what stops it drifting back.
6. **Journal cross-talk.** A tab opening while another has un-flushed journal entries converges and
   leaves no orphaned keys.
7. **Property test.** Add a "two tabs, one device, one relay" topology to `test/replicas.ts`: tabs
   share a channel and a database, each has a socket. The existing invariants should hold unchanged
   — the interesting outcome is if they don't.
8. **Playwright** (`test/geometry/sync.spec.ts` is the neighbour): two pages in **one** browser
   context, so they share origin, BroadcastChannel and IndexedDB. This is the only place the
   freeze/bfcache re-handshake can actually be exercised.

---

## 8. Cost

- Roughly 60 lines of seam, 120 of policy, 3 for the writer detach, and the suites above.
- **No new dependencies.** `lib0/broadcastchannel` and `y-protocols/sync` are both already here, so
  the budget impact is the new code and nothing else.
- No change to the on-disk format, no schema version bump, no migration.
- Reversible: delete `tabs.ts` and drop `disableBc: true` and the behaviour returns to today's.

What it does not buy: one socket, one writer, a lock holder for Phase 4, or a document that
survives every tab closing. Those are Phase 2, and §3.2 is the reason not to buy them now.

---

## 9. TRD amendments

- **§6.1**, last paragraph — "Opening another tab later reads the same database … real-time
  cross-tab propagation is not a property of this layer" stays true of _y-indexeddb_, and gains a
  sentence pointing at the tab channel as the layer that does provide it.
- **§6.1**, load-before-connect — extend "any transport" explicitly to the tab channel, so the
  constraint reads as being about transports rather than about the socket.
- **§6.2** — the `navigator.locks` guard stops being a one-off for `opfs-sahpool` and becomes the
  shared leader-election mechanism §4's Phase 2 uses.
- **§7.1** — say that the tab channel is a _separate_ transport with its own null-by-default
  policy, and that deleting the sync configuration must not affect it. The current arrangement has
  it the other way round, which is the bug this note starts from.
- **§4.8** — one sentence: undo is scoped to the actor _within a page_, and two tabs are two
  histories.
- **§11** — the sync-absent suite grows a multi-tab case, because sync-absent is precisely the
  configuration in which multi-tab does not work today.
