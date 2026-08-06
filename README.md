# done

A local-first PWA for one person's task-management workflow.
See [docs/PRD.md](docs/PRD.md) and [docs/TRD.md](docs/TRD.md).

**This is Phase 3: sync.** A self-hosted relay ([relay/](relay/)) carrying
opaque binary updates between your own devices, behind an interface whose
default implementation does nothing. Phase 2's workflow is unchanged: days, the
master list, collections, cards, the three-item cap, the movement flows, the
freeze, spatial navigation, three responsive layouts, actor attribution and
scoped undo. No search yet — that is Phase 4.

**Sync is optional and the app is complete without it.** With no endpoint
configured no provider is constructed, the transport is never even fetched, and
everything behaves exactly as it did in Phase 2. That is a requirement
(TRD §7.1), not a courtesy, and `test/sync.test.ts` is where it is held to.

A day has three sections, and they are read in the order **Next, Done,
Scheduled**: what you are doing, what you did, and the tail of intentions that
have not come up yet. Done reads newest-first — anything completed goes on top.

> **Phase 3 exit criteria** (PRD §13): phone and laptop consistent across a
> week including offline edits on both, and a week of daily use without falling
> back to the previous system. Both are things only a week can establish. What
> the suite can pin down is every mechanism they rest on — convergence through
> a relay rather than pairwise, a device catching up after being away, the cap
> and compaction repairing concurrently on two devices, and one device's undo
> stack staying clear of the other's changes.

## Running it

```
corepack enable
pnpm install
pnpm dev            # http://localhost:5173, also on the LAN
pnpm build          # typecheck, bundle, and enforce the §12 budget
pnpm lint           # oxlint with React, TypeScript, a11y, import, promise, and Vitest checks
pnpm format         # oxfmt formatting check
pnpm test           # unit tests
pnpm test:geometry  # layout, line-height and pixel-identity tests, needs a browser
```

`pnpm test:geometry` builds and previews the app, then drives Chromium. The
Playwright matrix has a real desktop browser profile (`Desktop Chrome`) and a
mobile emulation profile (`Pixel 7`); it is not only a small viewport. Where a
Chromium is already on disk and `pnpm exec playwright install` is not wanted,
set `CHROMIUM_PATH` to it.

The relay is a separate package with its own install, and the app never depends
on it:

```
cd relay
pnpm install --no-optional
pnpm test           # starts the real process and drives the real client
RELAY_TOKEN=$(openssl rand -base64 32) pnpm dev
```

Then **menu → Sync** in the app: endpoint, room, token. See
[relay/README.md](relay/README.md) for deployment, TLS, and why the token must
stay out of your access log.

## Development tooling

This project uses pnpm (`packageManager` pins the expected pnpm release).
`pnpm-workspace.yaml` sets `minimumReleaseAge: 10080`, so installs wait seven
days after a package version is published before accepting it. The lockfile was
generated under that policy; a couple of transitive peer overrides are pinned
there so `pnpm peers check` stays clean.

Linting and formatting use the oxc.rs toolchain: Oxlint is configured with
type-aware rules plus React, React performance, JSX accessibility, import,
promise, and Vitest plugins, and Oxfmt owns repository formatting. Warnings are
currently allowed because enabling the broad rule set surfaced follow-up cleanup
work in the scaffolded code; errors fail `pnpm lint`.

React Compiler is enabled in Vite through `@vitejs/plugin-react`'s
`reactCompilerPreset()` and `@rolldown/plugin-babel`. React 19 is already in use,
so no runtime shim is needed. It has one consequence worth knowing about before
writing a component here — see "reading the document" below.

## What is here

| Area           | Where                        | Notes                                                                                                                                                                   |
| -------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yjs seam       | `src/crdt/yjs.ts`            | The only file importing `yjs`, `y-indexeddb`, `y-protocols`, `y-codemirror.next`, `y-websocket` (TRD §10.1). Enforced by `test/seam.test.ts`, dynamic imports included. |
| Document tree  | `src/crdt/doc.ts`            | `meta`, `master`, `days`, canonical `cards`, and separate card locations.                                                                                               |
| Days and cards | `src/crdt/days.ts`           | `Y.Text` for documents, ordered card-id arrays for collections, one canonical `Y.Text` per card (TRD §4.1–§4.3).                                                        |
| Movement       | `src/crdt/moves.ts`          | The PRD §4 table, one transaction per operation, each naming its actor.                                                                                                 |
| The freeze     | `src/crdt/freeze.ts`         | Day + 3, permanent. A policy, and nothing about storage.                                                                                                                |
| Compaction     | `src/crdt/compaction.ts`     | Day + 7, storage only. Verified round-trip; defers rather than deletes on mismatch.                                                                                     |
| Serializer     | `src/crdt/serialize.ts`      | One canonical markdown form, shared by compaction and export.                                                                                                           |
| Export         | `src/crdt/export.ts`         | A zip of markdown, built in the page.                                                                                                                                   |
| Actors         | `src/crdt/actors.ts`         | The human, the system actor, transaction origins, scoped undo (TRD §4.8).                                                                                               |
| Persistence    | `src/crdt/persistence.ts`    | `y-indexeddb`, plus `navigator.storage.persist()` on the first write.                                                                                                   |
| Sync           | `src/crdt/sync.ts`           | The §7.1 interface, a null implementation as the default, and the controller that only exists once an endpoint is configured.                                           |
| Local settings | `src/lib/localStore.ts`      | The unsynced half of TRD §4.8: actor id, device, sync endpoint and token. Guarded — private mode throws on read too.                                                    |
| The relay      | `relay/`                     | Its own package, its own lockfile, its own tests. A dumb pipe with one bearer token and one file per room (TRD §7.2).                                                   |
| Live preview   | `src/editor/livePreview.ts`  | Decorations over the Lezer tree. Nothing here mutates the document.                                                                                                     |
| Static render  | `src/editor/staticRender.ts` | The same decorations, walked without a view. Half of the §4.4 pixel-identity constraint.                                                                                |
| Commands       | `src/editor/commands.ts`     | Idempotent wrapping, task toggling.                                                                                                                                     |
| Card gestures  | `src/editor/cardCommands.ts` | Split, merge, leave. The threshold is a named constant.                                                                                                                 |
| Bindings       | `src/editor/keymap.ts`       | One table, with descriptions (TRD §8.5).                                                                                                                                |
| Gestures       | `src/gestures/recognizer.ts` | Swipe navigates, long-press-then-drag selects. A pure state machine; `useGestures.ts` is the DOM half.                                                                  |
| Card reorder   | `src/ui/useCardReorder.ts`   | Collection-owned geometry; touch holds and desktop grips preview locally, then commit one atomic move on release.                                                       |
| Shell          | `src/ui/`, `src/styles/`     | Grid with named areas, cascade layers, custom properties.                                                                                                               |

## Decisions taken in this phase

**The transport is imported lazily, not statically.** TRD §7.1 says no provider
is constructed until an endpoint is configured. Loaded with a static import that
would be true of the object graph and false of the bundle — every device that
never syncs would still download the provider. `openWebsocket` is the only
`import('y-websocket')` in the codebase and it is inside a function, so
`y-websocket` builds as its own chunk and an unconfigured app never fetches it.
The seam test was widened to match dynamic imports, which it previously did not:
a lazy import is exactly the kind that gets written somewhere else without
anyone noticing, because it is not at the top of the file where a reader looks.

**The sync configuration is local and unsynced.** It sits with the actor id and
the device in `localStorage`, not in `meta.settings`. Two reasons, and the
second is the one that settles it: a bearer token is a secret that belongs to
the browser it was typed into, and an endpoint reachable from one device is not
necessarily reachable from another — a laptop on the LAN and a phone on mobile
data do not agree about `box.local`. The cost is that each device is set up by
hand once, which is also the only way a token gets onto a device at all.

**The relay is its own package, with its own lockfile and its own tests.** Not
a workspace member of the app's. It ships separately, has a different dependency
set, and — the property being protected — **the app builds, tests and runs with
`relay/` deleted**, which is the same thing TRD §7.1 asks of the sync code
inside the app. The one file the app does reach into is `relay/src/auth.ts`,
which is dependency-free on purpose: authorization rules enforced only in a
package nobody runs are rules that drift.

**A refused connection is a completed handshake and then a close code.** The
obvious implementation rejects the upgrade with a 401. A browser cannot see
that: `WebSocket` reports a generic error and the provider retries forever, so a
mistyped token is indistinguishable from a tunnel, and a device silently never
syncs. Codes in the 4000–4999 range do reach the client, so the relay accepts
the upgrade, sends nothing, and closes with 4401 — which the menu turns into
"The relay refused the token."

**Sync appears in the menu and nowhere else.** PRD principle 3 makes offline the
normal state rather than a degraded one: no reconnecting banner, no spinner, no
read-only mode, nothing that interrupts writing to report on a network. Someone
who wants to know goes and looks. The one concession is that "offline" is drawn
as an ordinary muted state rather than as a warning, because it is not one.

**"Last synced from ⟨device⟩" comes from awareness, not from the document.** A
device name in the synced document would contradict TRD §4.8, which keeps device
identity local. Awareness is ephemeral and unsynced, so the local device
publishes its name there and the other end reads it off the peer that is
connected. When no peer is connected the change came out of the relay's own
stored copy and there is no device to name — so it says how long ago, and
nothing about where.

**The relay keeps a file, and it is still not a backup.** Every device holds a
full replica, so a relay that forgets everything loses nothing — the next device
to connect hands it the document back. What the file buys is that a restart
inside the window between "the phone wrote it" and "the laptop opened" is
invisible rather than a wait for the phone to come back. It is the difference
between "eventually" and "when you open the laptop", and it is deleteable at any
time.

**`@y/websocket-server` is pinned at 0.1.1, the last Yjs v13 release.** Its
`setupWSConnection` is the sync and awareness message loop; reimplementing it
would be inventing a local-first technique, which PRD §12 lists as a non-goal.
0.1.2 moved to Yjs v14 — the same migration `y-codemirror.next` is waiting on
(TRD §10.1) — and the two should move together, on both sides of the socket at
once. That is one more entry on an existing debt, not a new one.

**The device name is editable.** It was a read-only guess from the user agent in
Phase 2, when nothing could see it. It is now the label that shows up on your
other device, and "Android" is a worse answer than "the phone in the kitchen".

**The initial bundle is 300.3 kB gzipped**, of the 350 kB §12 budget — up 5.7 kB
from Phase 2, none of which is the provider itself: `y-websocket` is a 2.3 kB
lazy chunk, and what landed in the initial bundle is the `lib0` and `y-protocols`
modules it shares with code that was already there.

## Decisions carried from Phase 2

**Cards are markdown list items when serialized.** TRD §9 says "collections
serialize as lists of cards separated by blank lines." Read as blank-line
delimited blocks that is ambiguous the moment a card contains a blank line —
which it can, since the split gesture is three returns and two of them leave one
behind — and §11 requires `compact → parse` to reproduce arbitrary collections
exactly. Writing each card as a list item makes card boundaries the only lines
at column 0, whatever the card holds. The alternative was to forbid blank lines
in cards by dropping the split threshold to two, which would make the storage
format depend on a number the PRD explicitly calls a tunable.

**A day is materialised when you look at it, not only when you write.** A
`Y.Text` has to exist before an editor can bind to it, so opening a day creates
it. Days you never navigate to still occupy nothing, which is the property TRD
§4.2 was protecting. Binding on the first keystroke instead would lose that
keystroke or need a second editor to catch it.

**Day materialisation is a system-actor write.** It has to be: deleting a
`Y.Map` deletes everything under it, so if the day map belonged to the human's
first write, undoing that write would take the whole day with it — including
anything added since, by anyone.

**Done reads newest-first; Next and Scheduled do not.** A record you only ever
append to is read from the top, and the thing you just finished is the thing you
want to see. Next and Scheduled are ordered by intent rather than by time, so an
arrival goes to the end and the order stays yours. The compose field stays at
the foot of Done, where PRD §4 puts it — worth a second look on a real device,
since typing at the bottom now produces a card at the top.

**Reading order is not storage order.** `DISPLAY_SECTIONS` is what the day panel
renders; `SECTIONS` is what the serializer writes and what every iteration over
a day's contents takes. Keeping them apart is what stops rearranging the layout
from changing the file format.

**A card move is its own undo step.** `Y.UndoManager` merges transactions that
land within half a second, which is right for typing and wrong for a move:
pressing Done a moment after typing a card would otherwise make one undo revert
both. Every structural operation brackets itself with `stopCapturing`.

**Card content has one canonical home.** Collections order stable card IDs;
the corresponding content and current collection location live in separate
root maps. This keeps the no-date-on-card rule while making a concurrent move
resolve to one visible location without copying or losing a simultaneous edit
to the card's `Y.Text`. Existing Phase 2 documents migrate from embedded cards
to this schema when opened.

**The cap is enforced twice.** Every write path refuses to exceed three, which
covers paste, multi-line insert and drag at the point of the mistake. Two
devices each adding a third card while apart is not a mistake anyone made and
still converges to four, so a system-actor repair moves the overflow to
Scheduled on the same day. It never deletes: the overflow is something the user
wrote.

**Dates are Temporal, with a ponyfill for now.** A day key is a calendar date
with no instant behind it, and `Date` has no type for that — every operation on
one has to be talked out of applying a timezone. `Temporal.PlainDate` and
`Temporal.PlainDateTime` say exactly what is meant. Neither Chromium 141 nor
Node 22 ships Temporal yet, so `temporal-polyfill` stands in behind
`src/lib/temporal.ts`, used as a value and never installed on `globalThis`. It
costs about 21 kB gzipped (the initial bundle is 300.3 kB of the 350 kB §12
budget); when the platform ships the API, deleting one import is the whole
migration, and `test/seam.test.ts` keeps that true.

**Export ships now, import does not.** Not named in the phase list, but the
serializer exists for compaction, the exit criterion is two weeks of real data,
and until sync exists the export is the only backup (TRD §10.5). Import needs
the same parser, which is tested, plus file handling and a merge policy; it can
wait for a phase that has a reason for it. _Sync does not change this: the relay
is a pipe, not a backup, so the export is still the whole backup story._

## Three places the code departs from the TRD

All three are recorded where they happen; repeated here because they are the
kind of thing that should be argued with rather than discovered.

**Cascade layers cannot order CodeMirror's stylesheet** (TRD §8.3, see
`src/styles/index.css` and `src/editor/theme.ts`). `style-mod` injects
CodeMirror's base theme as an unlayered `<style>` at runtime, and unlayered
declarations outrank every layered one regardless of order — so putting the
app's overrides in `@layer app` would make them _lose_, which is the opposite of
what §8.3 wants. CodeMirror's own surface is overridden through
`EditorView.theme`, and every value in it is a `var(--token)` from the same
stylesheet the rest of the app reads. The consequence for Phase 2 is that the
card's line geometry is stated twice — once in `cardTheme` for the mounted
editor and once in `cards.css` for the static render — from the same tokens.
`test/geometry/cards.spec.ts` measures the two against each other across every
supported construct, which is the check §11 asks for.

**Formatting decorations are unconditional** (TRD §5.2, see
`src/editor/livePreview.ts`). Step 4 of §5.2 reads as though the formatting mark
belonged to the hidden branch alongside the replacement. Emitting it that way
would restyle a heading line as the cursor entered it and move the text under
the cursor — the exact failure the hard constraint in the same section exists to
prevent. So the content keeps its formatting in both states and only the syntax
characters come and go.

**Vertical navigation does not start inside a scrolled region** (TRD §8.4). §8.4
asks for `touch-action: none` on navigable surfaces, with vertical drags
scrolling a scrollable region and navigating "at a scroll extent with continued
motion in that direction." Honouring that literally means the app owns vertical
scrolling — `touch-action` is decided at the hit target by walking up the tree,
so a descendant cannot re-enable panning that an ancestor disabled, and hand-
rolled scrolling on Android Chrome would cost more in feel than the gesture
gains (PRD principle 1). So the day body keeps native scrolling with momentum,
and vertical navigation runs from the day header and the peeks, which narrow
`touch-action` to `none` themselves. Horizontal navigation is unaffected and
works anywhere. The scroll-extent rule is still implemented (`verticalRoom` in
`useGestures.ts`) for the surfaces that do navigate vertically.

## Reading the document from React

Three things about `src/ui/useYjs.ts` are worth reading before writing a
component that touches the CRDT, because each of them was a bug first.

1. **Snapshots are derived, not counted.** A day is created lazily, the surfaces
   watching it mount before it exists, and `useSyncExternalStore` subscribes in
   an effect that runs after the child effect which creates the day. An event
   counter never sees that first event. A value read out of the document is
   compared again right after subscribing, so the gap is harmless.
2. **"No day" and "an empty day" must produce different snapshots.** They are
   different states, and the transition between them is the one that matters.
3. **Components do not read the document during render.** React Compiler
   memoizes on the assumption that the same inputs give the same result, which a
   CRDT read violates — `day.get('done')` is `undefined` before the day exists
   and an array afterwards, with no argument having changed. Keying a `useMemo`
   on the snapshot is not enough, because the compiler infers its own
   dependencies. Reads go through `useYValue`, whose result comes out of a hook
   the compiler cannot see into.

## Not in this phase

The SQLite search index, the command palette, a full calendar picker, import,
presence UI and agents. Each has a phase in PRD §13.

Presence is worth a word, since sync is the phase that makes it possible.
Awareness carries the local actor and device and `yCollab` already consumes it,
so two of your own devices editing at once is the two-cursor case and it works.
What is deliberately absent is anything built _on top_ of that: no presence
panel, no "also editing" chrome, no avatars. PRD §11.3 asks for none, and one
person's two devices are rarely both in front of them.

What runs today: convergence including concurrent card moves; convergence
through a relay rather than pairwise, with offline edits on both sides, a device
catching up after being away, the cap and compaction repairing concurrently on
two devices, and one device's undo stack staying clear of the other's changes;
the sync controller's states and the guarantee that nothing is constructed
before an endpoint is; the relay's authorization decisions, and — in the relay's
own suite — the real process refusing a real bad token; editor/`Y.Text`
round-trip, serializer round-trip, compaction safety, freeze independence, cap
enforcement, undo scoping across all three system operations, the movement
table, section order and Done's newest-first rule, the static render,
live-preview geometry, pixel identity, layout, and the seams.
