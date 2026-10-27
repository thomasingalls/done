# Phase83 — read-only preparation yields to queued storage

Parent: sequential82. The existing maintenance scheduler can start a read-only preparation outside
admission but hold the account's serialized storage tail. Input already invalidates it; queued read/
receive/storage work did not. Give only `prepareLocalRemoval`'s read-only job a queue-priority guard.
Every ordinary owned storage enqueue invalidates that preparation generation before waiting on the
tail. The existing task and periodic plan checks observe it at their next boundary. Native work
already in flight still settles and cleans up under the same owner and exclusion.

Do not retain queue priority after preparation settles. The retained proof keeps its original input,
lifecycle, route, journal and authority guards. Final atomic exchange/readback remains a normal
exclusive task with fresh authority/inventory checks, nonce reservation and uncertain-mutation close.
No counter format, live document, undo, crypto or network authority changes.

Three new real-IndexedDB/browser cases cover one/four queued reads and a read during final exchange.
The two preparation cases fail against the predecessor (it removes history instead of yielding);
the final-phase case passes on both and ensures queued reads never cancel a mutation/readback.
The initial full native run reports19 passes/two failures out of21. Both failures are pre-existing
fixture schedules newly racing initial sync at the maintenance assertion; they now start the reopened
owner offline, retaining exact refusal/inventory/reopen assertions and subsequent convergence.
Five affected cases pass in the focused rerun. A fresh cumulative full-file run follows in phase84.
A first source-edit syntax error is preserved with corrected TypeScript output; no failing result is
relabelled as passing. The existing baselines use disposable credentials, stores and profiles.

No assertion, deadline or security refusal is removed. These campaigns remain within their existing
qualification disposition; no aggregate release credit. No signing, push, merge, deployment or preview
replacement. The next bounded phase gates automatic starting on sync readiness, without confusing
routine polls with new input or turning maintenance into starvation.
