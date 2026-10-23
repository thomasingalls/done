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
