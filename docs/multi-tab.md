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

Writing the sixty lines is one way to get this. §3.5 is the ten-line way, and is where the
recommendation actually lands.

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
that outlives its clients. As of writing 148 is in beta.

**And support percentages are the wrong instrument here.** There is no installed base to protect —
nobody is running this but its author — and this project already ships on ES2022 (`vite.config.ts`),
which is not at 100% either, because nothing is. The question is not what fraction of the web has
SharedWorker; it is whether the two or three devices actually being used have it, which is a fact
about a phone rather than a table. If the author's Android is on a Chrome older than 148 the answer
is no for a population of one, and that matters more than any percentage. Check the devices, not
caniuse.

So the honest objections are narrower than the first draft of this note claimed. Three survive, and
none of them is about the platform.

- **It changes who owns the document, which is a bigger blast radius than "the transport moved."**
  A worker per tab is already prescribed for Phase 4 (TRD §6.2: OPFS needs a worker, all SQLite
  access goes through it, with a hand-rolled RPC layer). A _shared_ worker is a different claim: not
  "a worker owns the index" but "a worker owns the Yjs document." That forces a decision, per
  subsystem, about which side of the port it lives on — the membership repair, undo, awareness,
  compaction. The membership repair is the sharp one: it currently runs in every tab on
  `afterTransaction`, and a hub is the opportunity to make it run once. Take the opportunity and
  it's a rewrite of `watchMemberships`; skip it and you have added a hub without collecting its
  benefit.
- **Load-before-connect gets easier in one place and grows a new failure mode in another.** Inside
  the worker the constraint is better than it is today: one process loads from IndexedDB and one
  process opens the socket, so the ordering becomes a browser-wide truth rather than a per-tab one,
  still expressed as one `await`. What is new is the gate in front of the _editor_. `useStore`
  currently withholds the mount until `whenSynced` resolves, and that gate is a local promise which
  cannot fail to settle. Behind a port it becomes a message that may never arrive: worker fails to
  start, worker is killed mid-handshake, port silently drops. So the tab needs a timeout and a
  degraded path — fall back to owning its own document — which is a second code path through
  start-up, and start-up is where the data-loss bugs live. With `extendedLifetime` the constraint
  also instantiates twice: load before accepting ports, _and_ load before connecting the socket,
  because a worker that outlives its tabs can advance the document with nothing mounted. See §6 for
  the bfcache consequence, which is the same requirement as the BroadcastChannel path except that
  the authority is now in another context, so a stale tab cannot detect its own staleness.
- **Testability, which is the objection worth taking seriously — but "untestable" was wrong.** It is
  untestable _in jsdom_ (verified: `typeof SharedWorker === 'undefined'`, and `'locks' in
navigator === false`). That is a statement about the environment, not about the design, and this
  project is one devDependency from a better environment: it is already on **Vitest 4.1.10**, where
  Browser Mode is stable with a Playwright provider, and Playwright and a Chromium are already here
  for the geometry suite. In Browser Mode the same test files run in a real browser, where
  `SharedWorker`, `navigator.locks`, a real `BroadcastChannel` and OPFS all exist. Two caveats:
  Browser Mode gives one page per test file, so a genuine two-_tab_ test still wants Playwright with
  two pages in one context (a same-origin iframe may serve as the second context — worth trying
  before assuming it does not); and OPFS cannot be tested in jsdom either, so **Phase 4 needs this
  environment regardless of what happens to SharedWorker.** See §7.

Verdict: not now — but on sequencing grounds, not architectural ones. Every prerequisite a
SharedWorker needs is prescribed elsewhere: the worker build and RPC layer by TRD §6.2, the
real-browser test environment by OPFS. Do it first and you pay for all of that plus the ownership
change in one change, with no search index to show for it. Do it after Phase 4 and the
infrastructure is already bought, the tests already run in a browser, and the remaining work is the
part that is actually about tabs. The BroadcastChannel path in the meantime is not a competing
architecture; it is ~180 lines behind the seam that stop the app being wrong on screen today, and
§8's last line is that deleting it is a two-file change.

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

- **y-websocket's built-in BroadcastChannel** is what is running today (§1), and it _can_ be
  promoted into the answer — see §3.5, which is the most useful thing in this note and was wrong in
  its first draft.
- **`y-webrtc` with `signaling: []`** is the community's standard trick for BroadcastChannel-only
  sync, and it works. It also drags in the WebRTC provider, `simple-peer`, and room-key crypto for
  a channel we can open in sixty lines from dependencies already present, and its BroadcastChannel
  layer carries peer discovery rather than just document updates. WebRTC may be interesting some
  day; nothing about this project is near that day.
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

### 3.5 Borrowing y-websocket's channel without a socket

The obvious reading of §1 is that the built-in channel cannot be reused, because `connectBc()` looks
reachable only through `connect()` and the channel name is derived from the endpoint — which leads
straight to the idea of constructing against a placeholder URL like `wss://invalid.invalid` and
swapping it for the real one on `online`, on configuration, and on whatever else turns out to
matter. **That reading is wrong, and so is the workaround it implies.** `connectBc()` is an ordinary
public method (`node_modules/y-websocket/src/y-websocket.js`), and with `connect: false` the
constructor never touches the URL — `url` is a getter used only by `setupWS`. So:

```ts
// A channel, not a connection. Never call connect().
const tabs = new WebsocketProvider('local://tabs', dbName, doc, {
  connect: false,
  awareness: new Awareness(doc), // its own, so nothing in the app renders it
});
tabs.connectBc();
```

There is no bogus endpoint, no failing socket that retries forever behind a `maxBackoffTime`, no
placeholder to special-case through `sync.ts`'s status and `closeMessage` paths, and nothing to swap
on `online`/`offline`. The URL problem only exists if you go through `connect()`, and nothing here
needs to.

What it buys, all of it already written and tested upstream:

- **The handshake.** `connectBc()` publishes sync step1, step2, `queryAwareness` and the local
  awareness state. §4's "handshake on open" requirement is satisfied by the call itself.
- **`resync()` for free.** `connectBc()` re-publishes step1 and step2 every time it is called, and
  guards only the `subscribe`. So `provider.connectBc()` _is_ the bfcache/visibility re-handshake
  primitive, which is otherwise the fiddliest part of §4.
- **Correct origin discipline, by construction.** Received messages are applied with this provider
  as the transaction origin. It is a different object from the relay provider, so `sync.ts` does not
  report tab traffic as a relay sync; the UndoManager does not track it (`trackedOrigins` matches by
  identity); `persistence.ts` still persists it (it skips only `origin === provider`); and
  `requestPersistenceOnFirstWrite` does not fire, because it matches `origin.actor` and there is
  none. Those are the four properties §4 asks for, and they are free rather than argued for.
- **No echo.** `_bcSubscriber` ignores messages it published, and `_updateHandler` ignores updates
  whose origin is the provider itself, so a received update is applied and not re-broadcast.
- **A stable channel name, decoupled from relay configuration.** `bcChannel` is
  `serverUrl + '/' + roomname`, both fixed at construction, so passing a constant makes the channel
  a function of the _database_ rather than of the endpoint. This matters more than it looks: room
  names, token handling and room assignment are all still undefined UX, and every one of them will
  change. A channel named after the relay would break cross-tab sync every time that UX moves, and
  break it in the transient state where two tabs hold different configurations — which is exactly
  the state a settings screen produces.

What it costs:

- **A 3-second timer that does nothing, forever.** The constructor starts `_checkInterval` at
  `messageReconnectTimeout / 10` (30_000 / 10), whose body is a no-op while `wsconnected` is false.
  Clearing it means touching `_checkInterval`, which is the same private-field trade as Phase 1b.
- **An `Awareness` instance nobody reads**, to keep tab awareness out of the app's (§4 decides
  against carrying cursors between tabs; this is how you get that with a provider that always
  publishes them).
- **Dependence on undocumented behaviour.** `connectBc()` without `connect()` works in 3.0.0. It is
  not part of the documented API, and a minor version could reasonably make BroadcastChannel
  subscription conditional on the socket. A test asserting cross-tab liveness with no relay
  configured is what turns that from a silent regression into a build failure.
- **A socket-capable object that never opens a socket**, which reads oddly and will invite someone
  to "fix" it. It needs a comment saying why, in the voice of the one already above
  `openWebsocket`.

Both of these live entirely inside `src/crdt/yjs.ts`, so this is a seam-local choice that no other
file can observe. That is what makes the sequencing easy: take the borrowed provider first, because
it is a tenth of the code and immediately testable, and write the ~60-line channel only if one of
the costs above actually bites.

---

## 4. Recommendation

**A tab channel over BroadcastChannel, behind the existing seam, constructed unconditionally.**
Then stop, measure, and only add leader election when Phase 4 gives it a job.

### Phase 1 — the tab channel

New `src/crdt/tabs.ts`, sitting beside `sync.ts` as a second policy layer over a second transport,
with the transport itself in `src/crdt/yjs.ts` — either the borrowed provider of §3.5 or a
hand-written channel, and **start with the borrowed one**: it is ten lines against sixty, it comes
with the handshake and the `resync` primitive already written, and swapping it out later is invisible
outside the seam.

Decisions, with reasons:

- **Document updates only. No awareness in the app's `Awareness`.** The channel does not put cursors
  on screen. Two tabs of one person do not need to see each other's carets, and keeping tab
  awareness out is what fixes the `Mac, Mac` peer list and the self-caret in one move rather than
  three. With the borrowed provider this means handing it an `Awareness` of its own (§3.5). This is
  also why `openWebsocket` should pass `disableBc: true` from now on: cross-tab behaviour should
  live in one place, and that place should not be the relay transport.
- **A sync handshake on open, not just a stream.** Publish `syncStep1` with the local state vector
  and answer an incoming step1 with step2. Without it, a tab that opens second is correct only to
  the extent that IndexedDB and the journal happened to be current — which is true today, and is
  exactly the kind of correctness that turns into a bug the moment flush timing changes.
  `connectBc()` does this.
- **Re-handshake after a freeze.** BroadcastChannel delivers nothing to a frozen or bfcached page,
  and the page gets no gap notification. So `resync()` on `visibilitychange` → visible, on
  `pageshow` when `event.persisted`, and at start-up when `document.wasDiscarded`. **This is the
  requirement most likely to be missed**, and its absence looks exactly like "multi-tab works,
  except sometimes on my phone". A second `connectBc()` call is the whole implementation.
- **A distinct transaction origin, carrying no actor.** Four behaviours depend on it — undo not
  tracking tab traffic, persistence still storing it, `sync.ts` not reporting it as a relay sync,
  and `requestPersistenceOnFirstWrite` not firing on a sibling's edit. The borrowed provider gets
  all four by using itself as the origin; a hand-written channel needs a frozen `{ tab: <id> }` and
  the same identity check before re-publishing, or two tabs echo forever.
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

| File                      | Change                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/crdt/yjs.ts`         | `openTabChannel` behind the `TabSession` shape below. First cut: a `WebsocketProvider` with `connect: false`, its own `Awareness`, a constant channel name, and `connectBc()` (§3.5). Later, if needed: `lib0/broadcastchannel` plus `y-protocols/sync` directly. Either way, add `disableBc: true` to the relay provider's options. |
| `src/crdt/tabs.ts` (new)  | Policy: visibility/bfcache `resync`, teardown, and nothing else. Injectable `open` for tests, like `SyncOptions.open`. No storage concerns, no relay concerns.                                                                                                                                                                       |
| `src/crdt/persistence.ts` | Phase 1b: detach `provider._storeUpdate` so the adapter is the only writer.                                                                                                                                                                                                                                                          |
| `src/crdt/index.ts`       | Construct the tab channel after `await local.whenSynced` and before `createSync`; add it to `Store` and to `destroy()`.                                                                                                                                                                                                              |
| `src/crdt/sync.ts`        | Dedupe the peer list by device id and drop entries whose device id is this device's — correct regardless of the tab channel, and no longer masked by it.                                                                                                                                                                             |
| `src/ui/Menu.tsx`         | Optional: "2 tabs on this device", from a `hello`/`bye` count on the channel. Only if it earns the line.                                                                                                                                                                                                                             |
| `docs/TRD.md`             | §9 below.                                                                                                                                                                                                                                                                                                                            |

Sketch of the seam, for scale rather than for copying:

```ts
export interface TabSession {
  /** Re-announces state. For a page returning from freeze or bfcache. */
  resync: () => void;
  destroy: () => void;
}

export interface TabOptions {
  /** Names the document, not the relay — see §3.5 on why that distinction is load-bearing. */
  channel: string;
  doc: YDoc;
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
| Peer list and remote carets show your own tabs                                        | pre-existing              | Tab awareness goes to an `Awareness` nothing renders (§3.5); dedupe peers by device id                                                                                    |
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
- `'locks' in navigator === false` and `typeof SharedWorker === 'undefined'` under jsdom. Leader
  election needs an injectable seam to be unit-testable there at all.

### 7.1 The environment is the real decision

Everything above is about making jsdom do, which works for the BroadcastChannel path and does not
extend. Three things this project has already committed to cannot be tested in jsdom at all: Web
Locks (Phase 2), OPFS (Phase 4, TRD §6.2), and SharedWorker (§3.2). That is not three separate
problems, it is one missing environment.

The fix is small and mostly already paid for. This project is on **Vitest 4.1.10**, where Browser
Mode is stable with a Playwright provider, and Playwright plus a Chromium are already here for the
geometry suite (`playwright.config.ts`, including a `CHROMIUM_PATH` escape hatch for images that
ship one). Adding a browser-mode project means the same test files can run in a real browser, where
`navigator.locks`, a real `BroadcastChannel`, OPFS and `SharedWorker` all exist — with real
IndexedDB rather than `fake-indexeddb`, which is separately worth having given §4's Phase 1b is a
claim about IndexedDB transaction semantics that `fake-indexeddb` is not obliged to reproduce.

Two limits to know before relying on it. Browser Mode gives one page per test file, so a genuine
two-_tab_ test still wants Playwright with two pages in one context; a same-origin iframe is the
obvious candidate for a second browsing context inside one browser-mode test, and it shares
BroadcastChannel, IndexedDB and SharedWorker access, but **try it before designing around it**. And
it is a third test command after `test` and `test:geometry`, so it needs a reason — which it has:
without it, Phase 4 is untestable and §3.2's verdict rests on an environment gap rather than on
anything true about the design.

Sequencing follows from that. Stand up browser mode when the first thing that needs it arrives,
which is Phase 2's leader election, not Phase 1's channel. Phase 1 is deliberately the part that
jsdom can hold.

### 7.2 Suites

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
8. **Cross-tab liveness with no relay configured**, as a regression test with a second job: it is
   what catches an upstream change that makes `connectBc()` conditional on the socket (§3.5).
9. **Playwright** (`test/geometry/sync.spec.ts` is the neighbour): two pages in **one** browser
   context, so they share origin, BroadcastChannel and IndexedDB. This is the only place the
   freeze/bfcache re-handshake can actually be exercised — a jsdom test can fire a `pageshow` event,
   but it cannot freeze a page.

---

## 8. Cost

- Ten lines of seam for the borrowed provider (§3.5) or sixty for a hand-written one, ~80 of policy,
  3 for the writer detach, and the suites above.
- **No new dependencies** for Phase 1. `lib0/broadcastchannel`, `y-protocols/sync` and
  `y-websocket` are all already here, so the budget impact is the new code and nothing else. Phase 2
  adds one devDependency for browser-mode tests, which Phase 4 needs regardless (§7.1).
- No change to the on-disk format, no schema version bump, no migration.
- Reversible: delete `tabs.ts`, drop `disableBc: true`, and the behaviour returns to today's — a
  two-file change, which is the argument for not treating this as a fork in the road.

What it does not buy: one socket, one writer, a lock holder for Phase 4, or a document that survives
every tab closing. Those are Phase 2 and Phase 4, and §3.2's verdict is about the order to buy them
in, not about whether they are worth buying.

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
- **§11** — two additions. The sync-absent suite grows a multi-tab case, because sync-absent is
  precisely the configuration in which multi-tab does not work today. And the section should name a
  third environment: jsdom for logic, Playwright for layout, and a real browser for the platform APIs
  jsdom does not have — Web Locks, OPFS, SharedWorker (§7.1). The current two-environment split is
  what makes Phase 4 look harder than it is.
- **§12** — nothing changes, but worth noting that Phase 1 adds no dependency and therefore no
  budget risk; the first thing in this note that could move the number is the Phase 2 socket work.
