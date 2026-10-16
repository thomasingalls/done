# Phase 20 — Review and refresh two specified-home pins

Parent overlay: `85b907b132ed47b4dd3fc3eadcbf1b9aba5675df`. No runtime or checker changes.

The authority gate detects two stale TRD §13.3 hashes. Independent extraction matches the old pin to signed onboarding commit `63da4600` and the current section to signed base content after `fcb659c3`. Their complete difference is the two-paragraph setup-recovery isolation amendment: hints are non-authorizing, bound to account/retry/context and exclusion/removal fences; protected factor opening and cryptographic formats remain unchanged. Both map entries already explicitly cover protected custody, not automatic Local.

After rereading both entries and the whole section, refresh only their two hashes and append a dated review note. Every status, derivation, invocation bound, guard, blocker and qualification obligation remains. The checker passes. A sequential disposable sensitivity experiment first proves the new-pin baseline passes, changes only the section heading, observes both exact current pins refuse, restores original TRD bytes, and proves the checker passes again. The first exploratory control lacked an explicit precondition proof; it is retained but not credited.

The original gate refusal, full section diff, signed source identities and controlled result remain. Inventory/plan pass with the same 855/314 block. These are specified-home pins, not implementation/platform qualification. No commits, signing, publication or preview changes.
