# done

A local-first PWA for one person's task-management workflow.
See [docs/PRD.md](docs/PRD.md) and [docs/TRD.md](docs/TRD.md).

**This is Phase 1: the editor.** Live-preview markdown, one document, local
persistence. No sync, no days, no cards.

> **Exit criteria** (PRD §13): the author prefers it to a plain textarea, and
> the swipe-versus-select gesture model works on a real Android device. Neither
> is decided by anything in this repository. `pnpm dev -- --host` serves on
> the local network so a phone can reach it; installing it from Chrome's menu
> gets the standalone shell and the real gesture surface.

## Running it

```
corepack enable
pnpm install
pnpm dev            # http://localhost:5173, also on the LAN
pnpm build          # typecheck, bundle, and enforce the §12 budget
pnpm lint           # oxlint with React, TypeScript, a11y, import, promise, and Vitest checks
pnpm format         # oxfmt formatting check
pnpm test           # unit tests
pnpm test:geometry  # layout and line-height tests, needs a browser
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
so no runtime shim is needed.

## What is here

| Area          | Where                        | Notes                                                                                                                          |
| ------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Yjs seam      | `src/crdt/yjs.ts`            | The only file importing `yjs`, `y-indexeddb`, `y-protocols`, `y-codemirror.next` (TRD §10.1). Enforced by `test/seam.test.ts`. |
| Document tree | `src/crdt/doc.ts`            | `meta` and `master`. `days` arrives in Phase 2; root types are lazy, so that needs no migration.                               |
| Actors        | `src/crdt/actors.ts`         | The human, the system actor, transaction origins, scoped undo (TRD §4.8).                                                      |
| Persistence   | `src/crdt/persistence.ts`    | `y-indexeddb`, plus `navigator.storage.persist()` on the first write.                                                          |
| Live preview  | `src/editor/livePreview.ts`  | Decorations over the Lezer tree. Nothing here mutates the document.                                                            |
| Commands      | `src/editor/commands.ts`     | Idempotent wrapping, task toggling.                                                                                            |
| Bindings      | `src/editor/keymap.ts`       | One table, with descriptions (TRD §8.5).                                                                                       |
| Gestures      | `src/gestures/recognizer.ts` | Swipe navigates, long-press-then-drag selects. A pure state machine; `useGestures.ts` is the DOM half.                         |
| Shell         | `src/ui/`, `src/styles/`     | Grid with named areas, cascade layers, custom properties.                                                                      |

## Decisions taken in this phase

**React + Vite.** TRD §10.7 left this to Phase 1 and said not to revisit it.

**The one document is the master list.** Phase 1 asks for "one document"; the
master list is the one with no date attached, so choosing it keeps day
rollover, the freeze, and the day map out of a phase that is about the editor.

**The Today panel header shows the document, not a date.** The date is what the
header exists to show (PRD §7.4), and it arrives with day navigation.

**Narrow and medium are one breakpoint here.** §8.1 distinguishes them by
whether Goals stays beside Today. There is no Goals yet, so they differ in
nothing and are not pretended apart.

**A menu panel exists, and only that.** The Phase 1 exit criterion requires the
gesture model to be demonstrable, and a gesture needs somewhere to go. Menu is
the one surface Phase 1 has content for. Days above and below and Goals to the
right are Phase 2.

## Two places the code departs from the TRD

Both are recorded where they happen; repeated here because they are the kind of
thing that should be argued with rather than discovered.

**Cascade layers cannot order CodeMirror's stylesheet** (TRD §8.3, see
`src/styles/index.css` and `src/editor/theme.ts`). `style-mod` injects
CodeMirror's base theme as an unlayered `<style>` at runtime, and unlayered
declarations outrank every layered one regardless of order — so putting the
app's overrides in `@layer app` would make them _lose_, which is the opposite of
what §8.3 wants. The layers are still there and still order everything the app
authors. CodeMirror's own surface is overridden through `EditorView.theme`,
whose generated rules reliably outrank the base theme, and every value in it is
a `var(--token)` from the same stylesheet the rest of the app reads. The
requirement §8.3 was protecting — no specificity contest, tokens single-sourced
— holds; the mechanism named for it does not apply to this vendor.

**Formatting decorations are unconditional** (TRD §5.2, see
`src/editor/livePreview.ts`). Step 4 of §5.2 reads as though the formatting mark
belonged to the hidden branch alongside the replacement. Emitting it that way
would restyle a heading line as the cursor entered it and move the text under
the cursor — the exact failure the hard constraint in the same section exists to
prevent. So the content keeps its formatting in both states and only the syntax
characters come and go.

## Not in this phase

Days, cards, collections, the three-item cap, movement flows, freeze and
compaction, sync, the SQLite search index, export and import, the command
palette. Each has a phase in PRD §13.

The tests §11 asks for that need those features — compaction safety, freeze
independence, cap enforcement, index rebuild determinism, export round-trip —
arrive with them. What runs today is convergence, editor/`Y.Text` round-trip,
undo scoping, live-preview geometry, and the seam.
