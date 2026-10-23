# Editor and sidebar UX — bounded patch series

Base: signed `c4a66c79ddfc924c4c1f9b978428f544b16b4a61`, 2026-10-23.
Sequential review patches live in `/private/tmp/done-ux-20261023-patches/patches/`.
They are already present in the cumulative checkout; do not apply them there again.
No commit, push, preview update, merge, deployment or qualification resumption is authorized by this series.

## Contract and phases

37: Restore word deletion and bracket indentation through semantic admission; disable Cmd/Ctrl-Enter
checkbox toggling and its default blank-line fallback. Add an admitted plain-newline action.
38: Card completion/focus and Shift-Enter behavior, separately from Goals list continuation.
39: Compact native date navigation. 40: Collapsible sidebar organization and precise lifecycle actions.

Every writing mutation still uses the existing admitted workspace/text command path, with storage
refusal, pending input, authenticated ownership and undo unchanged. No stored format, key, session,
rate, sync verification or durability policy changes. Mobile deletion pauses remain an open measured
follow-up, not a fix claim. Existing tests may change only for the agreed new interaction or explicit
navigation to a now-collapsed section; no assertion is removed to obtain a pass.

Each phase records reproduction, affected checks, limitations and exact sequential patch identity before
advancing. The other workstream's active `docs/progress.md` document remains untouched.

## Phase37 — keyboard admission

All four targeted new interaction checks fail on the signed baseline: word deletion, bracket indent,
Shift-Enter and Cmd-Enter. On the candidate, the eight unaffected/restored keyboard cases pass in both
layout projects (16 passes); the corrected task no-op/click/undo case passes in both projects (2 passes).
The two layout projects use a Mac platform/UA for these hardware shortcut tests; they are not physical
Android coverage. Three new storage-refusal/acceptance/undo/redo cases pass along with the affected unit
suites (44 cases). TypeScript and focused correctness lint pass.

Preserved unsuccessful checks: sandbox loopback binding was refused before browser launch. The initial
new task fixture tried to click syntax on its active line; a second version compared decorated DOM text
to raw Markdown; the third mistook an empty editor placeholder for saved writing. Final checks inspect
raw Markdown for exact state and exercise the actual off-cursor checkbox click. All failed logs remain.
The repaired writing path does not permit arbitrary CodeMirror transactions. The task semantic command
remains for checkbox clicks, while Cmd/Ctrl-Enter is explicitly consumed to suppress default fallback.

## Phase38 — card completion and focus

Enter and Escape finish editing, restoring focus to the same static card; a second Enter reopens at
its preceding caret. Shift-Enter inserts a plain admitted newline; three Shift-Enters retain splitting.
All four directed card checks fail on the signed baseline. Final affected browser suites:22 pass,
2 existing named Android keyboard-grip skips, with no new skips. These cover all three card collections,
reopening/undo, split-tail/automatic focus and ordinary Android-UA Enter completion, plus existing
15-construct geometry, guard, cap, quick-entry and reorder assertions. Affected unit suites37 pass;
TypeScript/focused lint pass. Initial TypeScript caught an optional caret assigned to a nullable ref;
the corrected type is explicit. Initial new Mac hardware tests used Android UA, whose CodeMirror path
synthesizes unmodified Enter and therefore closes on Shift-Enter. The corrected hardware group uses a
Mac UA/platform in both layout projects, as the established keyboard suite does, while a separate test
keeps genuine Android-UA unmodified Enter coverage. This is not a physical phone/keyboard claim.

## Phase39 — compact native date navigation

The visible date/calendar ghost control is backed by the actual full-size native date input; pointer
and keyboard activation do not depend on showPicker support. Exactly Yesterday/Today/Tomorrow sit below,
anchored to the workspace's rollover-aware today. Choosing a valid native date navigates/closes the overlay.
Two new width-specific counterexamples fail on the signed baseline; all26 workflow/project cases pass
on the candidate, including both widths, arbitrary-day selection, adjacent dates and the existing frozen
compaction case. Its old first-button week shortcut is replaced by the explicit native date selection;
all frozen-card/content assertions stay. TypeScript/focused lint pass. Native OS picker visuals and
physical phone interaction are not asserted by the headless browser journey.

## Phase40 — collapsed sidebar organization

Account combines preferences, device identity/code, protection, Devices, switching, sign-out and local
removal. Sync owns sending/receiving details and sync setup; Data groups export and history maintenance;
Install remains its own disclosure. All four default closed. Date navigation and update availability
remain directly accessible. Native details keep child forms/status owners mounted across collapse.
Switching and sign-out remain separate: only sign-out ends the remembered login; labels explain this.
No NetworkLogin, transport, history, removal, lock, session or persistence implementation changed.
Two width-specific counterexamples fail on baseline. Four candidate project/width checks pass for native
keyboard disclosure, placement, saved preferences and default-closed reload. TypeScript/focused lint pass;
phone-width/desktop screenshots were inspected. Remaining old walkthroughs need explicit navigation
into collapsed sections; those fixture-only repairs and combined checks are phase41, not a claim of
full-suite acceptance here. General qualification stays paused.

## Phase41 — existing walkthrough navigation and combined validation

Existing browser helpers/actions explicitly expand Account, Sync, Data or Install before using their
controls. The shared helper leaves non-writing entry screens and historical predecessor shells alone.
Single-statement loop/conditional bodies are wrapped, preserving control flow. Syntax-tree comparison
against exact phase40 source retains all pre-existing logic/assertions/waits after only those navigation
additions are removed. The welcome `menu` helper is the explicit navigation replacement; marked new
Device-list assertions independently check Account actions, separate sending/receiving and Data export.
Three deliberate deleted-assertion/changed-value/changed-wait controls are detected. The two exact census
fixtures update only 2499→2511 reviewed cases and the workflow browser count22→30; no deadline, skip,
policy, failure disposition, security assertion or release block changes.

Combined results on the cumulative runtime:

- All158 unit files pass:1883 cases pass,1 existing named skip.
- Complete production-built frontend geometry/interaction:132 pass,24 existing platform skips,0 failures.
- Selected packaged account journeys:14/14 pass (device grouping and codes/names, both-way writing,
  offline/API/application restart, session renewal/reconnect, undo, first-run/protection/removal and
  interrupted protection). These use disposable accounts and simulated authenticators, not real providers.
- TypeScript, affected correctness lint/format, Yjs patch check, production build,232.7/350kB initial
  gzip budget and57-file origin-isolation scan pass.
-17 affected release-adapter regressions and10 planning-inventory regressions pass. Planning snapshot
  regeneration changes53 input hashes and five intentional declaration counts; every other field and
  existing denominator/disposition remains exact. Qualification remains paused; no aggregate credit.
- Test servers on54173/53221/53222 are absent after completion.

Retained inconvenient results: the initial complete dev browser run has126 passes/24 existing skips/
6 stale navigation failures; a targeted correction has4 passes/2 failures from Vite's HMR WebSocket in
an unchanged no-relay assertion. The full production-frontend run removes HMR from the test machinery
and passes that original assertion in both projects. Initial adapter denominators and the old planning
snapshot correctly refuse drift. An overstrict inputs-only review forgot the five new declaration
counts; its shell continued generating the documentation snapshot after that review failed. Acceptance
instead uses the subsequent independent complete before/after comparison against signed HEAD, which
checks the exact permitted declarations/hashes and all remaining fields. The original signed snapshot,
initial failure log and complete changed-field list remain. No runtime policy changed to satisfy them.
Early `pnpm --version` discovery could not resolve the pinned package-manager release through restricted
network access; checks use the installed local executables directly under the existing Node24.18.0 runtime.
No install, lockfile, package-manager configuration or dependency changes occurred.

The original deferred formatting patches remain outside this work. Navigation edits preserve existing
AST and assertions; this series does not include a repository-wide formatting pass. Older/historical,
private migration and optional-baseline fixture navigation is adapted and source-reviewed, but those
whole campaigns were not rerun here. Physical-phone deletion smoothness, native picker appearance and
real-provider walkthroughs are outside these checks. No commit, push,8443 preview update, merge or deploy.
