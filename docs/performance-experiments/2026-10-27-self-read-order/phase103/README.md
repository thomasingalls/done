# Phase103 — Keep an aggregate-size fallback with its publisher

The conservative owner-wide downgrade combined two different observations: an absent optional
endpoint, and one successful binary aggregate exceeding its byte reservation. The latter describes
the current publisher's payload. Two new ordering counterexamples fail before repair: after A
falls back, an otherwise small B loses batching, whether B was visited before A or after it.
Only those two cases run in the falsifier; the other28 are explicitly unselected, not credited.

Decode the publisher from the receiver's already-owned first request and pass that immutable32-hex
identity to its owner-local transport. Successful-size fallback now remembers only that publisher.
A404 still disables batching across the owner. Byte-only callers without a publisher retain the old
conservative behavior. Scheduling memory holds at most128 validated IDs; evicting an old size hint
permits a safe bounded re-probe, never disables an unrelated publisher. This is a memory policy, not
an account device limit. Reopen creates a fresh transport. No verification result or authority is
cached here. The previous batching decision is superseded only for size-fallback scope.

All old transport test imports, bodies and assertions remain byte-exact.13 appended cases cover
both publisher orders, same-publisher memory, owner/endpoint separation,128-ID eviction, caller
mutation, cancellation/drain, the original logical deadline, conservative unscoped callers, malformed
IDs, invalid/refused/oversized replies and the actual HTTP adapter's overflow-versus404 classifier.
53 focused unit cases,17 unchanged encrypted native-browser batch cases,81 metadata cases, types,
lint and format pass. Native cases retain original exact signed receipts, no progress from invalid
frames/signatures, full single-page support, temporary retry semantics, lock/close, speculative-tail
rules and cold continuation. No old test or security assertion is removed or relaxed.

No byte/page/queue bound, original captured request, four-page turn, deadline, erasure, admission,
authority/history/signature/prefix/witness/final commit check, format, server, rate or backoff changes.
The construction registry is exactly unchanged to102; refreshed census/manifest retain912 obligations
and367 unresolved blocks. New unit cases remain in their existing unqualified test-file obligation.
This is a targeted transport repair; its large-payload behavior is not in100's measured client tree.
Do not attribute a further whole-client timing gain to it. Normal source checks and a fresh complete
unsigned local build follow in104, keeping the measured100 artifacts untouched.

Unsigned sequential103 after102. No signing, push, release preparation, preview restart or deployment.
