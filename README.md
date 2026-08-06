# done

A local-first PWA for one person's task-management workflow.
See [docs/PRD.md](docs/PRD.md) and [docs/TRD.md](docs/TRD.md).

**This is Phase 2: the workflow.** Days, documents and collections, cards, the
three-item cap, the movement flows, the freeze, spatial navigation, three
responsive layouts, actor attribution and scoped undo. No sync and no search —
those are Phase 3 and Phase 4.

> **Exit criteria** (PRD §13): daily use for two weeks with no fallback to the
> previous system. Nothing in this repository decides that. `pnpm dev --host`
> serves on the local network so a phone can reach it; installing it from
> Chrome's menu gets the standalone shell and the real gesture surface.

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

| Area           | Where                        | Notes                                                                                                                          |
| -------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Yjs seam       | `src/crdt/yjs.ts`            | The only file importing `yjs`, `y-indexeddb`, `y-protocols`, `y-codemirror.next` (TRD §10.1). Enforced by `test/seam.test.ts`. |
| Document tree  | `src/crdt/doc.ts`            | `meta`, `master`, `days`, canonical `cards`, and separate card locations.                                                      |
| Days and cards | `src/crdt/days.ts`           | `Y.Text` for documents, ordered card-id arrays for collections, one canonical `Y.Text` per card (TRD §4.1–§4.3).               |
| Movement       | `src/crdt/moves.ts`          | The PRD §4 table, one transaction per operation, each naming its actor.                                                        |
| The freeze     | `src/crdt/freeze.ts`         | Day + 3, permanent. A policy, and nothing about storage.                                                                       |
| Compaction     | `src/crdt/compaction.ts`     | Day + 7, storage only. Verified round-trip; defers rather than deletes on mismatch.                                            |
| Serializer     | `src/crdt/serialize.ts`      | One canonical markdown form, shared by compaction and export.                                                                  |
| Export         | `src/crdt/export.ts`         | A zip of markdown, built in the page.                                                                                          |
| Actors         | `src/crdt/actors.ts`         | The human, the system actor, transaction origins, scoped undo (TRD §4.8).                                                      |
| Persistence    | `src/crdt/persistence.ts`    | `y-indexeddb`, plus `navigator.storage.persist()` on the first write.                                                          |
| Live preview   | `src/editor/livePreview.ts`  | Decorations over the Lezer tree. Nothing here mutates the document.                                                            |
| Static render  | `src/editor/staticRender.ts` | The same decorations, walked without a view. Half of the §4.4 pixel-identity constraint.                                       |
| Commands       | `src/editor/commands.ts`     | Idempotent wrapping, task toggling.                                                                                            |
| Card gestures  | `src/editor/cardCommands.ts` | Split, merge, leave. The threshold is a named constant.                                                                        |
| Bindings       | `src/editor/keymap.ts`       | One table, with descriptions (TRD §8.5).                                                                                       |
| Gestures       | `src/gestures/recognizer.ts` | Swipe navigates, long-press-then-drag selects. A pure state machine; `useGestures.ts` is the DOM half.                         |
| Shell          | `src/ui/`, `src/styles/`     | Grid with named areas, cascade layers, custom properties.                                                                      |

## Decisions taken in this phase

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

**Export ships now, import does not.** Not named in the phase list, but the
serializer exists for compaction, the exit criterion is two weeks of real data,
and until sync exists the export is the only backup (TRD §10.5). Import needs
the same parser, which is tested, plus file handling and a merge policy; it can
wait for a phase that has a reason for it.

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

Sync and the relay, the SQLite search index, the command palette, a full
calendar picker, import, presence and agents. Each has a phase in PRD §13.

What runs today: convergence including concurrent card moves, editor/`Y.Text`
round-trip, serializer round-trip, compaction safety, freeze independence, cap
enforcement, undo scoping across all three system operations, the movement
table, the static render, live-preview geometry, pixel identity, layout, and the
seam.
