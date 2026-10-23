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
