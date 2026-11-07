# Phase248 — yield to due publication between complete publisher checks

2026-10-30. Two runtime files and one new23-case unit file; old tests unchanged. The scheduler
passes a turn-scoped due-send predicate using actual send eligibility, publication batching,
failure backoff, halt, gate and stop state. After a fully completed empty check, the receive sweep
can yield its verified prefix and resume its remaining budget after sending. It claims no progress
or completed-idle success. Changed native authority identity/publisher count, adopted authority,
history installation, non-idle result or exception discards the scheduling continuation.

The context is an opaque object used for scheduling identity inside the same native module;
no native proof is cached, serialized or transferred. Native publisher selection, four-page turn
fairness, fresh Root/Task/authority/history/ledger/witness checks, final custody/Window promotion/
prefix/conflict checks, synchronous encrypted journal admission and local flush remain intact.
Publication quiet300/max2000ms and retry/halt policy unchanged. No mid-commit interruption.

A remote hint before yielding or during the intervening send stays dirty across continuation:
finishing the remaining checks forces a fresh sweep before idle polling. This prevents missing
writing on a publisher visited before the hint. Online/authority/retry expedites are also retained.
Old callbacks cannot yield a later turn; yielding cannot regress the retained prefix or erase
failure evidence. Every continued turn checks at least one publisher before yielding again.

Validation:95 focused cases pass, including23 new cases; complete units2757pass/one existing skip,
108 metadata cases, types, scoped lint/format and all seven original contract checks pass. Four
isolated source faults fail their expected assertions: disable yield, discard hint on continuation,
ignore turn identity, restart sweep budget. Fault copies restored exactly; no mutation enters build.
Initial candidate assertion ran before Vitest's newly queued zero-delay fake timer; final regression
uses the existing deterministic scheduler fixture and proves exact300ms due-send handoff/600ms
full sweep/5600ms idle deadline. Both attempts retained. A mistaken Node invocation of formatter's
shell shim was corrected; only new test/new type layout formatted, no old formatting rewrite.

503 runtime source records/198 domain homes remain. Only the two runtime hashes/line references
change; all1024 prior manifest rows and exclusions stay byte-identical. New test required/uncredited:
1025obligations/479unresolved (previous1024/478), no aggregate qualification claim. Initial review
incorrectly expected unchanged release selection; independently checked its sole addition is the
new required blocked test. Qualification remains paused. Implementation preserved in this patch;
matched browser protocol/apparatus and timed outcomes follow separately. No signing/push/release
prep, preview8443, service automation, CUA/phone or real-profile activity.
