# Phase 535 — prepend ordinary card arrivals

Started 2026-11-09 from signed documentation head `e04879704667683908da745684177a20a65dbef3` (runtime source equals the released tree). The operator wants Next → Later on top, and consistent newest-arrival-first defaults without new stored data.

Creation, ordinary moves, filing and transfer blocks now use insertion index zero in the existing ordered arrays. Existing cards are not migrated or sorted; text edits do not move cards. Explicit reorder indices, split adjacency and the established internal order of bulk transfers remain. The rare membership-repair fallback is unchanged and documented separately because lost manual positions cannot be reconstructed. No schema, timestamp, admission, capacity, freeze, actor or security guard changes.

The new five-case regression file fails before the repair in exactly three cases (Next, Scheduled and Next → Later); the Done and explicit-order controls pass. Focused checks after repair pass 70 cases; after correcting five additional old append-based assumptions, 88 focused cases pass. The first full unit run is retained: 331 files pass, three files have five ordering-assumption failures, 3,231 cases pass and one existing skip remains, in 151.73 seconds under the unchanged 240-second guard. The five failed cases were corrected without removing assertions or tests. Final full-suite execution follows phase 536 so the completed change is tested together.

Typecheck passes. Seventeen inventory/adapter checks pass. The new file is explicitly registered using the existing Vitest adapter and its independently observed five runtime cases; file/case denominator fixtures add exactly one file and five cases. All 1,102 prior manifest obligations remain, now 1,103 total, with all 551 unresolved blocks retained. No aggregate qualification credit.

Formatting passes for new/changed blocks. The formatter also flags two untouched pre-existing callback layouts in `test/store.test.ts`; they are left alone. Their original bytes exist at the base commit and match the current lines. No old deferred formatting patch is applied.

The operator clarified that “Done for now” replaces Duplicate on **Next** cards. That admitted atomic copy-to-Done/move-to-Scheduled action and focus behavior are phase 536, not part of this patch. No commit, push, preview restart or deployment occurred.
