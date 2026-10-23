# Sidebar polish, native date activation, Cut and background-sync investigation

2026-10-23. Follow-up authorization promotes UX-15–18 from the queue. Base is cumulative
patch47 tree `3fd9f5e4f6563de27edcc9130310995735d8b18a`, on signed c4a66c79.
Keep patches37–47 immutable. This packet owns the active workstream, not docs/progress.md.

## Bounded exit conditions

48. Improve sidebar rhythm/control layout across sections, preserve all lifecycle actions and
closed disclosures, use User in the visible/accessibility vocabulary. Inspect narrow/wide screenshots.
49. The complete date control invokes the native picker through a user gesture, with native fallback
and keyboard access. Demonstrate pointer activation from text and icon, including Firefox.
50. No-selection Cut copies complete lines and requests semantic deletion only after clipboard
writing succeeds. Preserve selected-text cutting, read/lock/storage refusal, queued intent, undo and reopen.
51. Investigate background sync using source traces, primary browser/platform sources and bounded
lifecycle observations. Distinguish what is observed from hypotheses; propose scope/effort and security
tradeoffs. No background-sync implementation or remembered unlocking is authorized.
52. Run combined affected checks, preserve failures/evidence and refresh exact census/planning inputs
without relaxing existing assertions, deadlines or qualification blocks. Prepare sequential patches.

No commits, push, merge or production deployment are part of this slice.

## Phase48 outcome

Four baseline counterexamples fail at User vocabulary. Combined sidebar/workflow34 pass; additional
dark320/light1280 checks4 pass, with screenshots inspected. Text inputs have room for names, compact
controls share a row, actions have consistent targets and separators divide preference/protection/
device groups. Common styles apply to Sync/Data/Install too. All actions and default-closed disclosure
owners remain. TypeScript/focused lint pass. Three existing fixtures change only accessible-label
strings (Actor name→User name), verified against the frozen baseline byte for byte otherwise.
Full historical setup/upgrade execution remains outside this phase; fixture review is not execution.

Outcome recorded in completed.md. Active work advances to full date activation.

## Phase49 outcome

The transparent native date field already covered the visual label, but editing native segments was
not equivalent to opening the picker on Firefox. Explicit showPicker under click/Enter/Space now
requests it anywhere on the control. Successful requests cancel a second default activation; missing
or refused API leaves native entry available. Four baseline checks fail; two fallback controls pass.
Candidate Chromium6 and actual headless Firefox3 pass. The native wrapper forwards to the browser
API and confirms active user activation plus a normal return. No popup appearance or physical-phone
claim is inferred. Typecheck/lint pass. Outcome recorded; active work advances to Cut.

## Phase50 outcome and failed attempts

Native Cut with no selection now copies logical lines and then uses existing admitted selection
replacement. Newline inclusion follows the actual removed range; final-line content has no invented
newline. Duplicate/adjacent line ranges are unioned. Selected-text cutting is retained. Unreadable,
frozen, pending/composing or unavailable surfaces refuse before copying; missing/throwing/silent
clipboard failures refuse before deletion. An empty document leaves the clipboard alone.

Baseline positives fail5 unit/4 browser cases. Final13 new plus28 existing focused unit cases pass;
8 Chromium (two layouts under Mac hardware bindings) and4 actual Firefox cases pass. Trusted Cut
events write expected text; storage refusal keeps accepted writing until retry; undo/redo/reopen
retain the result. Type/lint pass.

Earlier implementation mistakenly treated EditorSelection as having an empty flag; unit tests
exposed the empty-range failure. Corrected to per-range emptiness. A second counterexample exposed
touching selections not being merged, producing an extra clipboard separator. Both failures remain.
A new fixture’s status literal initially widened to string and failed typecheck. Browser observation
initially read ClipboardEvent data in a microtask after dispatch, when the native data is protected;
text had already deleted correctly. The final observer forwards native setData and reads it during
dispatch. These fixture corrections preserve the intended clipboard assertion. One apply-patch attempt
failed on formatter-adjusted context before changing files. No failure is counted as passing evidence.

Cut during pending writing reports a wait rather than deleting an accepted range that queued input
could later expand. This is a deliberate bounded tradeoff, recorded in decisions.md. No new protocol
or mutable-document capability is introduced. Outcome recorded; active work advances to UX-18 study.
