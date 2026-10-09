# Selected-combination publication and React path review

Read-only review of `/private/tmp/done-f17-exploration-r3/selected` and the exact emitted app `/private/tmp/done-f17-exploration-r3/builds/selected/assets/main-AaNcklWZ.js`. No tests, builds, browser operations, code edits or commits were performed by this reviewer.

## What remains on every accepted key

1. `src/crdt/admittedWorkspace.ts:491` verifies accepted transitions before `emit()`. `read()` at line 546 creates a detached full projection: all card texts, membership, days, actors, settings and history counts. This stays the authority and must not be weakened for a UI optimization.
2. `src/ui/workspaceUi.tsx:85-92` calls `workspace.read()` on every publication and stores the returned snapshot. The provider puts that snapshot, status, errors/storage and stable commands in one Context (`:178-180`). Context-only Card and Goals consumers request stable actions (`Card.tsx:87`, `Goals.tsx:69`) but are subscribed to the changing value. Status notifications can also change the provider; the number of React commits per accepted key needs measurement, since React may batch them.
3. `src/ui/DayPlane.tsx:146` mounts three days. `src/ui/DayPanel.tsx:162` mounts three collections each. Every Collection invocation builds `new Map(snapshot.cards.map(...))` across the full workspace, even for an empty section, before its early return (`src/ui/Collection.tsx:67-73`, `:169`). For a 301-card corpus, nine invocations would build 2,709 temporary tuple pairs and nine Maps before selecting the displayed subsets. This arithmetic describes the code's work per complete collection-render round; it is not a measured allocation count or claim about render frequency.
4. Collection then recreates its displayed cards array, hooks/action objects and enabled reorder objects (`:84-105`, `:108-160`, `:184-213`). Card renders recreate handlers and `titleOf(text)` (`src/ui/Card.tsx:313`). Static Markdown is NOT reparsed on every unrelated key: its effect depends on `[editing, text]` (`:107-111`). Editor mounting likewise uses stable mountEditor/id/editing dependencies (`:113-151`). Avoid claiming editor remount or repeated Markdown parse here.
5. `src/ui/App.tsx:60-63` rebuilds the full placed-id set and unfiled filter from the detached projection. This is another candidate for a single derived per-snapshot view, but should be considered after actual profile attribution.
6. `src/ui/Goals.tsx:88-90` creates selected-line React state after actual selection/doc updates. The R2 editor shortcut already removes unrelated no-op CM transactions. Goals still receives provider-context changes; separating its stable action dependency is possible without changing the editor adapter.

## React Compiler qualification, checked against the measured build

`vite.config.ts:65` includes the React Compiler preset. This invalidates a blanket inference that every source expression necessarily runs in the built application. I inspected the existing build without compiling it:

- Emitted Collection is `HG`, around character offset 990,780; it still has an unconditional `new Map(i.cards.map(e=>[e.id,e]))` and builds cards/actions/hooks/JSX directly.
- Emitted provider is `oG`, around offset 971,760; it still constructs the changing combined Context value directly.
- Emitted Card is `MG`, around offset 981,179; it has no compiler cache call at entry and still creates its hooks/handlers in the function.
- Other components such as ArchivedCard and DayPanel DO contain compiler cache calls, so the compiler is active, but these particular components are not automatically cached.

Exact symbol names/offsets are local to this measured build. Source paths above are the durable identifiers.

## Narrow candidate to try if profiles attribute material cost here

Create one private UI lookup per snapshot in WorkspaceUiProvider, e.g. a `useMemo` over `snapshot.cards` that builds a Map without tuple intermediates and exposes a lookup closure rather than a mutable Map. Let the nine Collections reuse it. The lookup only points to already detached UI snapshot records; no Y.Doc, raw ownership handle or newly shared canonical object crosses the boundary. Keep `workspace.read()` freshness and verification entirely unchanged. The provider still consumes every publication and full status transitions. This avoids repeated indices without needing invalidation rules for the canonical store, history or Unicode strings.

This is an allocation-reduction candidate, not a demonstrated dominant bottleneck. A single Map pass still happens each accepted publication. Do not assert a material paint win until paired browser timing shows one.

If React reconciliation dominates, a separate later candidate can split stable command/action context from snapshot/status and give collections semantic stable props. `React.memo(Card)` by itself is ineffective: Card reads changing Context and parents supply new action/hook objects. A comparator that ignores callbacks is unsafe because closures encode day membership, previous-card merge position, Next capacity and active/frozen state. Prefer a deliberate stable command port and exact semantic prop handling to a broad ignored-props comparator. Do not pool/reuse a published mutable WorkspaceSnapshot.

## Focused guards for a shared UI index candidate

- A new accepted card text, location, id addition/removal, undo/redo or remote move is visible from the next snapshot's lookup; no value from the prior snapshot survives accidentally.
- Collection ids preserve exact order, skip missing ids exactly as before, and render archived and active arrays with the original precedence.
- Same-card edit keeps the mounted editor, local cursor and actual emoji text; unchanged-card static text stays unchanged.
- Move/Next-cap disabled state, split focus handoff, merge-back target and keyboard reorder must retain fresh closures and semantics.
- Pending/refused input remains absent from accepted text; Retry/Discard/status still update even when a content lookup is unchanged.
- Workspace close/lock unregisters editors and removes content; ownership-detachment tests remain unchanged.

Existing focused controls: `test/workspaceAdmission.test.ts:270` (detached owner), the immediately following generated structural/remote/Unicode cases, `test/admittedEditorProjection.test.ts`, `test/pendingProjection.test.ts`, `test/cardCommands.test.ts`, `test/goals.test.ts`. Existing native controls in `test/local-app/editor.spec.ts` cover refusal/retry, discard/lock and Goals-copy/remove/undo. Use only the focused cases appropriate to an actual candidate during exploration; full release qualification follows promotion.

## Secondary observation, not a recommendation to change now

`src/ui/DayPanel.tsx:54-67, :80-99` schedules scroll-room measurement through a subtree MutationObserver for editor text changes and reads scrollHeight/clientHeight in requestAnimationFrame. This can participate in layout cost, but the observations also enforce touch-scroll behavior. Merely removing them is not safe: observing the viewport's own size does not detect content overflow changes. Profile attribution and a separate geometry-preserving design would be required.
