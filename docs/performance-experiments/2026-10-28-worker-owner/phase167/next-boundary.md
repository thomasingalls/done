# Production worker boundary, before168

No SharedArrayBuffer, Atomics wait, global localStorage shim or source-transform hooks.
Actual native cohort join is one-shot; original compatibility/account authentication follows under it.
Worker lifetime selected only by a fixed dedicated-worker initializer, never an app-supplied lock manager.

Fresh async journal capture opens raw bounded Window pages; crypto remains Worker. Worker has no
append capability. Original Window journal still resolves real storage and seals synchronously.
Synchronous journal emptiness checks in native mutation/retention require an explicit current Window
admission fence; merely caching a raw snapshot must never authorize a later mutation. Input-priority
read-only preparation can be interrupted and must freshly reacquire the fence before mutation.

Account receive keeps crypto/authority/prepared-finish closures in Worker. Window keeps the actual
admission queue and canonical editor/Undo. Bidirectional operation IDs are scoped one-shot continuations,
not proof leases; callbacks never serialize. Window starts final Worker checks at its original FIFO
head, applies only the exact durably verified updates, and holds that head until the reply is consumed.
Worker authority/generation/route changes must cross the same Window admission fence; old Window
capsule writers cannot survive a route change. Close invalidates Window immediately and sends abort
before drain, keeps native fences through Worker drain/termination and Window key disposal.

Maintain original prepared-receive verification/persistence/fresh-authority checks. An async display
handoff is not synchronous immediate-apply authorization; do not serialize/pretend to retain the old
immediate capability. Both queued and context-loss paths need regressions. Do not clone full ledgers.
