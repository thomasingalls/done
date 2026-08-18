# done — The codebase

A map of what is where, the three places the code deliberately departs from the TRD, and the one hook whose
rules you have to know before writing a component. **How to run it** is
[development.md](./development.md); **why it is shaped this way** is [decisions.md](./decisions.md).

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
| Persistence    | `src/crdt/persistence.ts`    | `y-indexeddb`, a synchronous delta journal with batched commits, plus `navigator.storage.persist()` on the first write.                                                 |
| Sync           | `src/crdt/sync.ts`           | The §7.1 interface, a null implementation as the default, and the controller that only exists once an endpoint is configured.                                           |
| Local settings | `src/lib/localStore.ts`      | The unsynced half of TRD §4.8: actor id, device, sync endpoint and token. Guarded — private mode throws on read too.                                                    |
| The relay      | `relay/`                     | Its own package, its own lockfile, its own tests. A dumb pipe with one bearer token and one file per room (TRD §7.2). Four dependencies, none native.                   |
| Live preview   | `src/editor/livePreview.ts`  | Decorations over the Lezer tree. Nothing here mutates the document.                                                                                                     |
| Static render  | `src/editor/staticRender.ts` | The same decorations, walked without a view. Half of the §4.4 pixel-identity constraint.                                                                                |
| Commands       | `src/editor/commands.ts`     | Idempotent wrapping, task toggling.                                                                                                                                     |
| Card gestures  | `src/editor/cardCommands.ts` | Split, merge, leave. The threshold is a named constant.                                                                                                                 |
| Bindings       | `src/editor/keymap.ts`       | One table, with descriptions (TRD §8.5).                                                                                                                                |
| Gestures       | `src/gestures/recognizer.ts` | Swipe navigates, long-press-then-drag selects. A pure state machine; `useGestures.ts` is the DOM half.                                                                  |
| Card reorder   | `src/ui/useCardReorder.ts`   | Collection-owned geometry; touch holds and desktop grips preview locally, then commit one atomic move on release.                                                       |
| Shell          | `src/ui/`, `src/styles/`     | Grid with named areas, cascade layers, custom properties.                                                                                                               |
| Store assembly | `src/crdt/index.ts`          | Assembles document tree, actor, undo, awareness, persistence, sync, and the membership repair that runs on every write.                                                 |
| Store lifetime | `src/ui/useStore.ts`         | Opens the local store once. The editor does not mount until IndexedDB has been read back — mounting first paints an empty document and then fills it.                   |
| Goals          | `src/ui/Goals.tsx`           | The master list (PRD §7.1, §7.3). Never freezes. The flow out is two steps by design: **copy to** leaves master alone, **remove** is separate.                          |
| Goals outline  | `src/ui/GoalsOutline.tsx`    | A view-only heading projection over `src/editor/breadcrumbs.ts`; navigation stays owned by Goals.                                                                       |
| Recovery       | `src/ui/RecoveryPanel.tsx`   | Cards retained when their collection membership can no longer be shown. A card surface, not a diagnostic table; last-known location is context, never a live source.    |
| Stale Next     | `src/ui/StaleBanner.tsx`     | The passive stale-Next indicator (PRD §6). Both bulk actions run as the **system** actor, so they never enter the human's undo stack.                                   |
| Installed app  | `src/pwa.ts`                 | Precache-only service worker (TRD §1). Caches nothing at runtime — the data is in IndexedDB and there is no API to cache.                                               |

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

## What the suite covers

Recorded here because it is easy to assume a test exists for something the suite has never touched — and
because one gap below is load-bearing.

**Convergence and sync.** Convergence including concurrent card moves; convergence through a relay rather
than pairwise, with offline edits on both sides; a device catching up after being away; two devices that
each filled Next while apart keeping every card; Done still reading newest-first on both; compaction
running concurrently on two devices; and one device's undo stack staying clear of the other's changes.
The sync controller's states, and the guarantee that nothing is constructed before an endpoint is.

**The relay.** Its authorization decisions, and — in the relay's own suite — the real process refusing a
real bad token.

**HTTPS.** A production build in a secure browser context, service-worker registration, an offline shell
reload, a real WSS upgrade through Vite, and the relay's authorization close code across that proxy.

**The editor and the document.** Editor/`Y.Text` round-trip, serializer round-trip, compaction safety,
freeze independence, cap enforcement, undo scoping across the system operations, the movement table,
section order and Done's newest-first rule, the static render, live-preview geometry, pixel identity,
layout, and the seams.

**The property fleet, and its one gap.** `test/replicas.ts` builds a fleet of N stores around a relay hub
that holds a replica of its own, with generated schedules of edits and partitions. It opens whole stores —
but with **`persist: false`**, so **no property test exercises the persistence layer**. The suite wires up
the membership repair, undo and awareness and never touches the store.

**This matters more than it looks.** [sequencing.md](./sequencing.md) §3.2 puts the largest correctness
risk of the next stage in the encrypted store and the encrypted journal, where a defect loses data
silently — and the whole property suite will keep passing whatever the encrypted store does. The harness
already takes the flag, so a `persist: true` variant is cheap, and it is the single highest-value test to
add before Stage 1.
