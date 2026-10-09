# Owned HTTP and expiry repair evidence

Parent: unsigned `879ce38`. The nine-stage source-pinned campaign passes. A held genuine read allowed
local flush in 19.2 ms; a held genuine submission allowed it in 16.9 ms, both before releasing HTTP.
These are directed observations, not latency guarantees. A request expired at the native write guard
advances no receive cursor, enters bounded retry, signs a fresh request, and recovers automatically
without manual retry/online wake after expiry. Cold replay preserves the writing.

The ownership stage passes 21 native and mutation tests: real send/readback, exact retry after lost
answers, submission/receive commit aborts, cancellation/drain before a competing permit, stream drain,
superseded requests, invalid/stale HTTP pages, ordered publication, and conflicting evidence. Full unit
validation separately passed 996 tests/91 files in 36.40 seconds. Types and scoped production lint pass.
The native growth stage took 60,156 ms. The full-view differential/tamper/coverage controls still pass.
No personal installation, protocol bytes, keys, routing, or service lifecycle was changed.
