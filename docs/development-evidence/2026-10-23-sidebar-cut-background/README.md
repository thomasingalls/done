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

## Phase51 background investigation

[Design report](../../background-sync-feasibility.md) includes primary sources, capability matrix,
current-owner trace, security implications and proposed bounded implementation/acceptance. Rough
effort is an estimate, not a delivery commitment. Runtime source identities are preserved.

The experimental two-device probe runs the actual built app/local session+membership service. Its
first assertion assumed a successful CDP freeze meant receiving was suspended, but the new card
appeared. A corrected probe checks an independent timer: it kept ticking. The receiver also reports
visible/focused despite bringing another test page forward. The probe is kept under reproduction,
not promoted as a product regression or aggregate obligation. Its completed observation is not
evidence of physical unfocus, suspension, energy use or resume latency. An early raw receipt used
misleading freeze wording; interpretation.json explicitly corrects it and final source/receipt
state the limitation. All failed attempts remain. No real accounts/profiles were used.

Source does not intentionally pause sync on hide: it flushes outbound work, retains subscriptions
and wakes on return. Platform suspension and locked-workspace authority are distinct problems.
No worker/network/security behavior changed. Outcome recorded; active work advances to combined
validation and a preview update for the three UI changes.

## Phase52 combined result and handoff

All160 Vitest files pass:1927 passed/1 existing named skip. Full built-frontend geometry168 pass/
24 existing platform skips (192 total). Real Firefox date/Cut7 pass. Existing packaged-account
welcome, device-list, sessions and text-admission12 pass, exercising protection, multi-tab retirement,
revocation/login lifecycle, sync, undo, refusal and cold reopening.27 adapter/inventory cases plus
type/build,232.7/350kB gzip budget, origin isolation and affected lint/format pass.

The stale planning snapshot correctly refused first. Independent comparison allows only four new
required test files and seven changed/new test-input hashes; all existing declarations, dispositions
and other fields remain exact. New files remain blocked from aggregate credit. Qualification stays
paused:891 obligations/347 unresolved. No old test/case/assertion is removed. The phase41 navigation
attestation is now checked against its immutable phase41 tree; later phase48 label-only changes
have a separate exact review. Old evidence is not rewritten to match current source.

Source/build identities cover356 runtime/config/source inputs and the complete built file set.
Only the8443 frontend gateway changed. Normal TLS verifies60 assets and two deep links; service
config hash/API PID52585 are unchanged. Fresh1280/420 contexts verify User fields and existing
card/composition/duplicate behavior with no page errors. No real account/browser profile was used.
Preview worker2a6601d4bf9f; visible Version c4a66c79-dirty remains the same for uncommitted work.

Outcome is in completed.md. Patches48–52 are prepared for sequential signed commits when requested.
The real Git index remains unchanged. No push/merge/production rollout. UX-15–17 are implemented;
UX-18’s investigation is complete, with physical lifecycle tracing still proposed and no background
sync implementation. The older intermittent Gboard/continuous-deletion observations remain open.

## Reproduction notes

Configs identify this run’s absolute repository/scratch/browser paths. Replace them on another host.
The source config uses the frozen patch47 source for counterexamples; the final config previews dist.
The inventory-review script takes the previous planning snapshot path. The lifecycle probe is a
diagnostic under reproduction; do not add it to aggregate regression credit or infer device-level
background behavior from its normal live-sync completion.
