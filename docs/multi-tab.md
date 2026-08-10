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
- **Your own caret appears as a collaborator's.** `yCollab` renders remote carets from awareness, and
  the other tab's is one. Note the shape of this one carefully: the caret appearing is _right_ (§4.1),
  and what is wrong is that nothing distinguishes it from a second person's.

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
2. **Identity.** There are three levels — actor, device, session — and the code has two. The actor
   is a person and lives in the synced roster; the device is a machine and lives in localStorage;
   the session is a tab and **does not exist**, so every surface that needs one borrows a level that
   does not fit. That is the whole of the identity problem, and §4.1 is the fix.
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

One worker owns the document, IndexedDB and the socket; tabs become views that hold a thin replica
and exchange updates over a `MessagePort`. Tabs still need their own `Y.Doc` — CodeMirror cannot bind
to a document in a worker — so this does not remove the local replica, it adds a hub above it.

It is the right shape for the single-writer problems: one socket, one writer, one compaction actor,
and a socket that survives every tab being backgrounded.

**It cannot, however, hold the OPFS lock itself.** `createSyncAccessHandle()` is defined only on
`DedicatedWorkerGlobalScope` — synchronous file I/O is kept off any thread that might be shared —
and `opfs-sahpool` is built on sync access handles, so a SharedWorker has no more access to that VFS
than a page does. Getting "every tab gets search" instead of TRD §6.2's "a tab without the lock runs
with search disabled" therefore takes one more layer:

```
tabs  →  SharedWorker hub  →  dedicated SQLite/OPFS worker
```

Which matters for sequencing more than for feasibility: **Phase 4's dedicated worker and its RPC
layer are needed either way.** Moving Yjs into a SharedWorker does not replace that work, it sits
above it. So the hub is an optional layer on top of Phase 4 rather than a different way of doing
Phase 4 — and it is worth checking that nested workers are available on the target browsers before
counting on the arrangement at all.

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
- **A dead worker is silent, and two tabs can end up on two different workers.** This is the
  objection with teeth, and it is measured rather than feared — see §3.2.1.
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

#### 3.2.1 What a dead SharedWorker actually does — measured

Port reliability is the right thing to be afraid of, and it is worth separating two fears that get
filed together. **Service workers** have a lifecycle the browser controls and that is actively
hostile to long-lived state: terminated when idle, restarted on demand, with `install`/`activate`,
claiming, and update-on-navigation all able to move under you. **SharedWorkers** have none of that —
one lives as long as a client holds a port, `extendedLifetime` aside — so most of the scar tissue
does not transfer. What does transfer is the part that matters: a port that stops delivering without
telling you.

That part is real, and rather than assert it either way I ran it: two pages in one Playwright
context, one SharedWorker, then kill the worker out from under them via CDP.

| Question                                         | Result                                                        |
| ------------------------------------------------ | ------------------------------------------------------------- |
| Do two pages in one context share one worker?    | Yes — `port` count 2, messages relay between pages            |
| Does CDP see the worker?                         | Yes — `Target.getTargets` returns `type: 'shared_worker'`     |
| Can CDP kill it deterministically?               | Yes — `Target.closeTarget` → `{ success: true }`, 0 remaining |
| Does `postMessage` on the orphaned port throw?   | **No — it returns normally**                                  |
| Does the other page receive anything?            | **No**                                                        |
| Any `onerror`, `onmessageerror`, or close event? | **None, on either page**                                      |
| Does `new SharedWorker(...)` resurrect one?      | Yes — but a **fresh** one, with no state and no other clients |
| Does the page that did not reconnect rejoin?     | **No** — its old port stays bound to the dead worker          |

So the failure mode is worse than "the worker can die". The worker dies, **every send still reports
success**, nothing anywhere raises, and the first tab to reconnect gets a brand-new empty worker
while every other tab sits on a port that will never deliver again. That is not a stalled hub, it is
a **split brain**: two tabs, two workers, each believing it has one.

Two conclusions follow, and they point in opposite directions, which is why this subsection exists.

**Against:** a SharedWorker design is not complete without an application-level heartbeat — ping,
expect pong, on timeout tear down the port and reconnect _and re-handshake state_, because the new
worker knows nothing. Liveness cannot be inferred from sends succeeding; it can only be inferred
from receiving. That is a protocol, with its own timeouts and its own failure modes, and it is
strictly additional to everything else in §3.2.

**For:** the thing that made this untestable is gone. `Target.closeTarget` on a `shared_worker`
target is a one-line test primitive, so "worker dies mid-edit, both tabs recover and converge" is an
ordinary automated test rather than a manual ritual. The reason it used to take lots and lots of
manual testing is that there was no way to cause the failure on purpose. There is now. CDP is
Chromium-only, which matches where the geometry suite already runs.

By contrast the BroadcastChannel path has no analogue of any of this: no hub to die, no port to go
silent, no split brain. A subscriber either exists or its tab is gone. That is not an argument that
SharedWorker is wrong — it is an argument about what each option costs to make trustworthy, and it
is the strongest single reason the ordering below is what it is.

#### 3.2.2 Two requirements a worker design inherits

Both of these are load-bearing, and both are easy to discover late.

**The synchronous journal cannot move into the worker.** `localStorage` does not exist in any worker
context, and the journal in `persistence.ts` uses it for one specific property: a _synchronous_
durable write, which is what closes the gap between a Yjs transaction and IndexedDB's asynchronous
commit when navigation kills the page (TRD §6.1). IndexedDB is async everywhere and synchronous OPFS
is dedicated-worker-only, so there is no substitute inside the worker. The journal therefore stays in
the page, and the protocol becomes:

1. the page journals the update synchronously, as it does now;
2. the page sends it to the worker;
3. the worker persists it and **acknowledges durability**;
4. the page clears that journal entry, and not before.

So the port protocol needs sequenced durability acknowledgements — which is the `whenDurable()`
boundary the adapter already models, lifted across a port, with a pending set per page. There is a
pleasing consequence: that pending set is exactly the recovery set for §3.2.1's silent death. The
un-acked entries are the ones the dead worker may never have written, so the journal is already the
backstop for the failure mode the heartbeat detects. Two problems, one answer.

**The worker needs a stable script URL and a versioned port protocol.** SharedWorker identity is
(script URL, name, origin). Vite content-hashes emitted assets by default, so a deploy would change
the URL, and a tab loading the new build would connect to a _new_ worker while open tabs stay on the
old one — two hubs, two IndexedDB writers, two sockets. That is §3.2.1's split brain caused by an
ordinary deploy rather than a crash, which makes it the more likely trigger of the two.

There is already precedent in this repo for the fix: `vite/precacheServiceWorker.ts` emits the
service worker at a fixed `sw.js` via `emitFile`, and `src/pwa.ts` registers
`${BASE_URL}sw.js` — unhashed on purpose, because a registration is an identity rather than an asset.
A shared worker needs the same treatment, and then the version has to move inside the protocol: a
handshake on connect, with the worker either serving an older client or telling it to reload. Putting
a major version in the worker's `name` is the other option, and it trades an accidental split brain
for a deliberate partition — which, with IndexedDB as the shared floor underneath, lands right back
on two writers. `extendedLifetime` lengthens every overlap window here.

#### 3.2.3 Verdict on the worker

Not now — but on sequencing grounds, not architectural ones. Every prerequisite a SharedWorker needs
is prescribed elsewhere: the worker build and RPC layer by TRD §6.2, the real-browser test
environment by OPFS, and the dedicated SQLite worker it has to sit above (§3.2). Do it first and you
pay for all of that, plus the ownership change, plus three protocols it does not get for free — the
heartbeat of §3.2.1, and the journal acknowledgements and version handshake of §3.2.2 — with no
search index to show for it. Do it after Phase 4
and the infrastructure is already bought, the tests already run in a browser, and the remaining work
is the part that is actually about tabs. The BroadcastChannel path in the meantime is not a competing
architecture; it is ~180 lines behind the seam that stop the app being wrong on screen today, and
§8's last line is that deleting it is a two-file change.

And on liking OPFS and SQLite but not this cost: they are separable. TRD §6.2 as written does not
need a SharedWorker — a **dedicated** worker per tab plus the `navigator.locks` guard it already
specifies gives search to the tab holding the lock and a stated degradation to the others, with no
hub, no ports between tabs, and nothing to heartbeat. The SharedWorker upgrade buys "every tab gets
search" and one relay socket. §3.2.1 is the price of that upgrade, and it is fair to decide the
upgrade is not worth it and still ship the index.

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
  promoted into the answer — see §3.5, which is where the recommendation lands.
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
  awareness, // the app's own, so session carets cross tabs (§4.1)
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
- **Session carets, without a second awareness model.** Sharing the app's `Awareness` is what makes
  §4.1's per-session carets cross tabs, and it is the provider's default rather than a special
  arrangement. Both providers then observe the same `Awareness`, so a sibling tab's presence also
  reaches the relay via whichever tab has a socket — harmless duplication, because awareness state is
  keyed by client id and last write wins. Teardown is handled too: `disconnectBc()` broadcasts a null
  state for the local client, so a closed tab's caret disappears with no code of ours.
- **A stable channel name, decoupled from relay configuration.** `bcChannel` is
  `serverUrl + '/' + roomname`, both fixed at construction, so passing a constant makes the channel
  a function of the _database_ rather than of the endpoint. This matters more than it looks: room
  names, token handling and room assignment are all still undefined UX, and every one of them will
  change. A channel named after the relay would break cross-tab sync every time that UX moves, and
  break it in the transient state where two tabs hold different configurations — which is exactly
  the state a settings screen produces.

What it costs:

- **A watchdog timer with nothing to watch.** The constructor starts `_checkInterval` at
  `messageReconnectTimeout / 10` (30_000 / 10), whose body is a no-op while `wsconnected` is false.

  The obvious objection is that `wsconnected` changes are events — the provider does `emit('status')`
  at every transition — so why a timer at all? Because this timer is not observing a transition. It
  compares `wsLastMessageReceived` against 30 seconds: it watches for a socket that is open at the
  TCP level and has gone quiet, which is the half-open connection a phone leaves behind when it
  loses a tunnel. **Silence cannot be delivered as an event**, so a clock is the right instrument
  for this particular job. What is wrong is that the clock is not _gated_ on the events — start the
  watchdog on `connected`, clear it on `disconnected`, and a provider that never connects never
  arms it. That is a five-line change upstream and worth sending, because it removes the private
  field from this section for everyone.

  Locally: `clearInterval(provider._checkInterval)` after construction, the same private-field trade
  as Phase 1b — or nothing at all. Calling this a cost overstated it: browsers clamp background
  timers to ≥1s and, after a few minutes hidden, to roughly once a minute, and in the foreground a
  3-second no-op is invisible next to CodeMirror and React.

- **Dependence on undocumented behaviour.** `connectBc()` without `connect()` works in 3.0.0. It is
  not part of the documented API, and a minor version could reasonably make BroadcastChannel
  subscription conditional on the socket — or make the constructor connect. A test asserting
  cross-tab liveness with no relay configured, _and_ that no socket was opened, is what turns either
  of those from a silent regression into a build failure. It is the load-bearing test of this whole
  approach; see §7.2.8.
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

### 4.1 Sessions, first — because the alternative is deleting a feature to hide a bug

An earlier draft of this note decided the channel should not carry cursors, on the grounds that two
tabs of one person do not need to see each other's carets. That was wrong, and wrong in a specific
way worth naming: it was not a UX judgement, it was a workaround for missing identity. The `Mac,
Mac` peer list and the self-caret are the same defect — surfaces reading identity at a level that
does not describe what they are showing — and "carry less information" made the symptom go away
without touching it.

The unsurprising behaviour is the one every editor with tabs already has. Two tabs of a Google Doc
give you two carets, two scroll positions and two undo histories, and nobody finds that confusing,
because **a caret is a place someone is looking, and two tabs are two places.** A person editing
two days of their own task list is in two places on purpose.

So: three levels, each with an owner.

| Level       | Answers                   | Lives in                      | Synced        |
| ----------- | ------------------------- | ----------------------------- | ------------- |
| **actor**   | who is editing            | `meta[actor:<id>]`            | yes           |
| **device**  | which machine             | `localStorage['done.device']` | no            |
| **session** | which tab, this run of it | awareness only                | no, ephemeral |

A session id is generated per store and never written down — it is the one identity that must _not_
be in localStorage, because persisting it would make two tabs share a session and a reload keep a
stale one. `awareness.setLocalStateField('session', { id: newId() })`, beside the `device` field
already set in `openStore`.

Then each surface reads the level that fits, and every current artifact resolves without removing
anything:

- **Peer list** groups by **device**: `Mac, iPhone`, not `Mac, Mac`. Two tabs on one machine are one
  peer — optionally `Mac (2 tabs)`, which is information rather than noise.
- **`lastSyncedFrom`** is a **device** question and stays one, so a sibling tab is never reported as
  a sync — which the distinct transaction origin already handles.
- **Remote carets** are per **session**. Your other tab's caret shows up, as it should.
- **Colour** comes from the **actor**, so both of your carets are your colour and a genuinely
  different actor is visibly different. This is what makes per-session carets legible rather than
  confusing: sameness of colour says "this is also you."

Undo stays per tab, which is the same model as the multiple undo histories in the comparison above,
so nothing needs to change in the code — only the TRD sentence that scopes undo to the actor without
saying "within a page" (§9). The rest of that conversation is deferred, as it should be.

The payoff for §3.5: **awareness crossing the channel is now the desired behaviour rather than
something to work around**, so the borrowed provider's default shared `Awareness` is simply correct,
and the "an `Awareness` nobody reads" cost disappears from the list. `disconnectBc()` already
broadcasts a null awareness state on teardown, so a closed tab's caret vanishes with no code.

### 4.2 Phase 1 — the tab channel

New `src/crdt/tabs.ts`, sitting beside `sync.ts` as a second policy layer over a second transport,
with the transport itself in `src/crdt/yjs.ts` — either the borrowed provider of §3.5 or a
hand-written channel, and **start with the borrowed one**: it is ten lines against sixty, it comes
with the handshake and the `resync` primitive already written, and swapping it out later is invisible
outside the seam.

Decisions, with reasons:

- **Updates and awareness, over the app's own `Awareness`** — per §4.1, so the borrowed provider
  needs no special handling. `openWebsocket` still passes `disableBc: true`, not to suppress
  awareness but because cross-tab behaviour should live in one place, and that place should not be
  the relay transport: a channel named after the relay is a channel that breaks whenever the relay
  configuration UX changes.
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

### Phase 1b — one persistence path _per tab_ (separable, and not to be half-done)

Note the title carefully: **this is not one writer.** Every Yjs update currently produces **two** rows
in the `updates` store — `y-indexeddb`'s own fire-and-forget `_storeUpdate` writes one, and the
adapter's batched, transaction-complete write adds a second. Verified against this repo: one update
in, two rows out. With N tabs it is 2N, and removing the duplicate makes it N. There is still one
writer per tab; a browser-wide single writer is Phase 2's leader, not this.

#### The trim race, withdrawn

An earlier draft argued that `storeState`'s read-then-delete could drop a row written by another tab
between its `getAll` and its `getLastKey`, and flagged it as source analysis rather than a reproduced
bug. It is worth going further than that: **IndexedDB's rules appear to exclude the interleaving
outright.** `lib0.transact()` defaults to `readwrite` (verified in `lib0/indexeddb.js`), and
transactions with overlapping scope where either is `readwrite` are scheduled serially, across
connections — so another tab cannot insert into `updates` in the middle of that transaction
([IndexedDB transaction scheduling](https://www.w3.org/TR/IndexedDB/#transaction-scheduling)).

And the other branch is no worse. If the transaction does _not_ survive the promise chain, the later
operations raise `TransactionInactiveError` rather than acting on stale state — so the delete never
runs, and trim is inert rather than lossy. Either the read and the delete are in one serialized
transaction, or the delete does not happen. There is no third case, and no lost update in either.

So the justification for touching persistence at all is the **measured write amplification**, not a
hypothetical loss. That is a weaker reason, and it should be stated as the weaker reason it is.

#### Why the cheap version is the wrong version

`doc.off('update', provider._storeUpdate)` looks like a three-line fix. It is not, because
`_storeUpdate` is the only thing that increments `_dbsize`, and `_dbsize` crossing
`PREFERRED_TRIM_SIZE` is the only thing that ever schedules `storeState`. Detach it and
**trimming stops happening at all**: the update log grows without bound, and every open replays every
update the document has ever received. That trades an invisible 2× write cost for an unbounded
start-up cost, which is the worse of the two.

So: do not reach into the private field unless the same change supplies a tested trimming policy. The
options that remain are

1. **Leave it.** 2N writes, trim keeps working, and nothing is at risk — the loss argument is
   withdrawn. Perfectly defensible until the amplification shows up in a measurement that matters.
2. **Take ownership of the IndexedDB layer.** Fork `y-indexeddb`'s ~150 lines into the seam, keeping
   the on-disk format (`updates` with `autoIncrement`, plus `custom`) so existing databases open
   unchanged. One write per update, trim ours to schedule and to test, and leader-gateable later.
   Precedent: `relay/src/connection.ts` documents forking `setupWSConnection` for a comparable
   reason, and the format here is an autoincrementing store of opaque blobs.

Recommendation: (1) now, (2) when there is a number, and never the detach on its own. Whichever
happens, trim behaviour wants a real-browser test (§7.1) — the interesting assertions are about
IndexedDB transaction semantics, and `fake-indexeddb` is not obliged to reproduce those faithfully.

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

| File                      | Change                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/crdt/yjs.ts`         | `openTabChannel` behind the `TabSession` shape below. First cut: a `WebsocketProvider` with `connect: false`, **the app's `Awareness`**, a constant channel name, and `connectBc()` (§3.5). Later, if needed: `lib0/broadcastchannel` plus `y-protocols/sync` directly. Either way, add `disableBc: true` to the relay provider's options. |
| `src/crdt/tabs.ts` (new)  | Policy: visibility/bfcache `resync`, teardown, and nothing else. Injectable `open` for tests, like `SyncOptions.open`. No storage concerns, no relay concerns.                                                                                                                                                                             |
| `src/crdt/persistence.ts` | Phase 1b only, and only as the full extraction — taking ownership of the IndexedDB layer with a trim policy of our own. Nothing here is required by Phase 1.                                                                                                                                                                               |
| `src/crdt/index.ts`       | Construct the tab channel after `await local.whenSynced` and before `createSync`; add it to `Store` and to `destroy()`.                                                                                                                                                                                                                    |
| `src/crdt/index.ts`       | Also: `awareness.setLocalStateField('session', { id: newId() })`, beside the existing `device` field (§4.1).                                                                                                                                                                                                                               |
| `src/crdt/sync.ts`        | Group the peer list by device id and drop this device's own entries, so two tabs are one peer (§4.1) — correct regardless of the tab channel, and currently masked by it.                                                                                                                                                                  |
| `src/ui/Menu.tsx`         | Optional: "2 tabs on this device", from a `hello`/`bye` count on the channel. Only if it earns the line.                                                                                                                                                                                                                                   |
| `docs/TRD.md`             | §9 below.                                                                                                                                                                                                                                                                                                                                  |

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
| IndexedDB rows per update: 2 → 2N                                                     | worsened                  | Phase 1b, and only as a measured cost — one path per tab, not one writer                                                                                                  |
| `storeState` trim overlapping another tab's write                                     | **withdrawn**             | Excluded by IndexedDB transaction scheduling; the failing branch is inert, not lossy (§4, Phase 1b)                                                                       |
| Trim stops entirely if `_storeUpdate` is detached without replacing it                | new, self-inflicted       | Do not detach alone — `_dbsize` is the only trim trigger, so the log grows unbounded (§4, Phase 1b)                                                                       |
| Relay receives each edit once per open tab                                            | new                       | Accept — the relay's `on('update')` broadcast is a natural dedupe                                                                                                         |
| Membership repair ping-pong                                                           | new, bounded              | `repairCardMemberships` returns 0 and opens no transaction when nothing is wrong, so a repair that finds nothing emits no update and the exchange terminates in one round |
| Peer list shows your own tabs as separate devices                                     | pre-existing              | Group by device rather than by awareness entry (§4.1). Not fixed by carrying less information                                                                             |
| Two carets of your own, indistinguishable from a second person's                      | pre-existing              | Per-session carets are correct; actor-derived colour is what makes them legible (§4.1)                                                                                    |
| `lastSyncedFrom` reports a same-device tab as a sync                                  | pre-existing              | `disableBc: true` plus the distinct transaction origin; `lastSyncedFrom` stays a device question                                                                          |
| Undo is per-tab while TRD §4.8 scopes undo to the _actor_, and two tabs are one actor | pre-existing, now visible | Per-tab is right and matches every other tabbed editor — the TRD sentence should say "within a page" instead of leaving it inferred                                       |
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
IndexedDB rather than `fake-indexeddb`, which is separately worth having: Phase 1b turns entirely on
IndexedDB transaction semantics and trim behaviour, and `fake-indexeddb` is not obliged to reproduce
either faithfully.

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
5. **Write amplification, and trim.** Count rows in the `updates` store per update, with one tab and
   with two — a number in a test is what stops it drifting back, and it is now the _only_
   justification for Phase 1b. Pair it with a trim assertion: cross `PREFERRED_TRIM_SIZE` and assert
   the log actually shrinks, which is what catches a detached `_storeUpdate` disabling trim, and what
   establishes whether trim works today at all. Real browser, not `fake-indexeddb` (§7.1).
6. **Journal cross-talk.** A tab opening while another has un-flushed journal entries converges and
   leaves no orphaned keys.
7. **Property test.** Add a "two tabs, one device, one relay" topology to `test/replicas.ts`: tabs
   share a channel and a database, each has a socket. The existing invariants should hold unchanged
   — the interesting outcome is if they don't.
8. **No relay configured, and no socket opened.** The load-bearing test of §3.5: cross-tab liveness
   with sync absent, plus an assertion that the borrowed provider opened no websocket. It is what
   catches an upstream change that makes `connectBc()` conditional on the socket, or makes the
   constructor connect. `openWebsocket` is already injectable in tests, so the socket assertion has
   somewhere to hang.
9. **Sessions.** Two stores produce two awareness entries with distinct session ids and the same
   device id; the peer list reports one peer; both carets carry the actor's colour (§4.1).
10. **Playwright** (`test/geometry/sync.spec.ts` is the neighbour): two pages in **one** browser
    context, so they share origin, BroadcastChannel and IndexedDB. This is the only place the
    freeze/bfcache re-handshake can actually be exercised — a jsdom test can dispatch a `pageshow`
    event, but it cannot freeze a page.
11. **Only if a SharedWorker is ever built** — and worth writing down now because it is the test that
    was missing: kill the worker mid-edit with CDP and assert both tabs recover and converge.
    ```js
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Target.setDiscoverTargets', { discover: true });
    const { targetInfos } = await cdp.send('Target.getTargets');
    const sw = targetInfos.find((t) => t.type === 'shared_worker');
    await cdp.send('Target.closeTarget', { targetId: sw.targetId });
    ```
    Verified against Chromium in this repo's container; see §3.2.1 for what it exposed.

---

## 8. Cost

- Ten lines of seam for the borrowed provider (§3.5) or sixty for a hand-written one, ~80 of policy,
  one awareness field for sessions (§4.1), and the suites above. **Phase 1b is not in this number and
  is not required** — the loss argument that motivated it is withdrawn, and what remains is a measured
  write cost with no deadline.
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
- **§6.1**, the journal — add the constraint that makes it survive any future architecture: the
  synchronous journal belongs to the **page**, because `localStorage` does not exist in a worker.
  Anything that moves persistence into a worker journals in the page, sends, and clears on a
  durability acknowledgement (§3.2.2). Written down now, it is a paragraph; discovered later, it is a
  rewrite.
- **§6.2** — two changes. The `navigator.locks` guard stops being a one-off for `opfs-sahpool` and
  becomes the shared leader-election mechanism §4's Phase 2 uses. And it is worth recording that the
  dedicated worker there is not optional or replaceable: `createSyncAccessHandle()` exists only in
  dedicated workers, so no shared or service worker can hold that VFS, and any hub arrangement nests
  a dedicated worker underneath rather than replacing it (§3.2).
- **§7.1** — say that the tab channel is a _separate_ transport with its own null-by-default
  policy, and that deleting the sync configuration must not affect it. The current arrangement has
  it the other way round, which is the bug this note starts from.
- **§4.8** — two changes. Undo is scoped to the actor _within a page_, and two tabs are two
  histories. And the identity model gains its third level: actor, device, **session** — with the rule
  that a session id is ephemeral and never persisted, which is what distinguishes it from the two
  above it (§4.1).
- **§11** — two additions. The sync-absent suite grows a multi-tab case, because sync-absent is
  precisely the configuration in which multi-tab does not work today. And the section should name a
  third environment: jsdom for logic, Playwright for layout, and a real browser for the platform APIs
  jsdom does not have — Web Locks, OPFS, SharedWorker (§7.1). The current two-environment split is
  what makes Phase 4 look harder than it is.
- **§12** — nothing changes, but worth noting that Phase 1 adds no dependency and therefore no
  budget risk; the first thing in this note that could move the number is the Phase 2 socket work.
