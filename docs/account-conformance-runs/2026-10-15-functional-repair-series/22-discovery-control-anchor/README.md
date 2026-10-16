# Phase 22 — Final discovery snapshot control

Parent overlay: `1caf0982382da251cb9c2860d84e4dfe2cb2a3d2`. No production changes.

The active-source follow-up exposes another old anchor: discovery now uses the shared `unchanged` verifier instead of spelling out a raw snapshot comparison. The old anchor is absent in both the phase-20 and phase-21 source, before any mutation. Replace only that anchor with its unique actual guard. Keep the real separate-process pause and external account-state change, exact signed locator verification, original baseline refusal and fifteen-second deadline. Add unchanged retained authority/ledger and explicit still-pending-account assertions.

All fourteen signed discovery/control cases pass on pinned Node 24, including thirty generated histories. The mutant actually returns a correctly signed locator for the now-ineligible account; a load failure or different refusal cannot satisfy the test. The original failure is preserved. Inventory/plan remain 855/314 blocked; no qualification, signing, commits, publication or preview changes.
