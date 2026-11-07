# Phase 508 — discard an uninstalled continuation

If baseline continuation returns a new detached logical view but its subsequent fresh-context check fails, contentStore now clears both its private continuation and carrier view before rethrowing. A retry authenticates from storage. The unchanged-identity case retains its valid warm view. No projection is published before fresh checks.

The sole executable addition is `if (logical) clearView();` in the existing catch. An inverse byte proof removes this addition and its comment to recover the exact previous source. Existing authority, counter, row, crypto, lifecycle, commit and erasure checks remain byte-identical. No format, flag, budget, limit, gate or deadline changes.

All 149 focused cases in eight files pass, including the five new controls and all existing warm/reuse/exact-reuse/lifecycle/anchor/baseline/verified-record tests, in 9.04 seconds. A private transform replaces the repair with only `forceFullRead = true`; four controls pass and the repeated-interruption control fails, proving that a transient flag is insufficient. The original three pre-repair failures remain in phase 507.

The first runner invocation could not observe display state inside the sandbox and stopped at its preflight before a child started. The unchanged runner outside the sandbox completed with display/load/windowed power evidence. No browser repair or Stage 5 credit is claimed yet. Next reconcile the five new test cases, run the coherent checks, and build an unobserved client for the saved-state browser regression.
