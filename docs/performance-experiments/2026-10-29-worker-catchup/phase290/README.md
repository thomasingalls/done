# Phase290 — eight-entry raw download, four-position native turns

2026-10-30. Development-only composed peer planner can request8known positions. The native
outstanding request keeps a separate1–4position allowance and its independently read cursor.
Every admission verifies that owned request/stamp, current prefix and allowance before any write;
bounded preparation consumes at most that allowance, and a final pre-write guard checks again.
Native witness/authority/expiry/atomic commit/readback/final Window acknowledgement remain.
No HTTP count or unverified page hint credits selection. Self/manual reads remain single-entry.

One raw-tail slot owns copies of the original signed request and encrypted page; no verified
plaintext, completed proof, native handle or authority permission survives a turn. A later turn
transfers those raw bytes once, with an exact expected native cursor and same opaque authority
identity. Native preparation authenticates originals again from fresh state. Revision retirement,
owner close, expiry, clock anomaly or mismatched cursor/authority erase the tail. Another
publisher's single-page probe can coexist: held original plus a full single-page reservation fit
inside the existing4MiB collection cap. Before legacy multi-request prefetch/aggregation the
slot is erased, preserving its original full reservation. One bounded slot may evict another hot
publisher's tail; that loses only an optimization. No cross-owner transfer or persisted trust.

A valid size refusal settles preparation with an empty promotion and distinct range-size result,
then chooses fresh single-entry requests for that publisher only. It does not throw through the
Worker queue and close the owner before retry. Invalid selected evidence still fails closed.
Ordinary byte/record/source/pending limits, local flushing, backoff, service budgets and all gates
remain. Clean actual composed large-entry fallback is a remaining native obligation; do not infer
it solely from the preparer/cache units or unchanged legacy group cases.

Nine raw-tail regressions pass: exact single transfer/caller ownership, single-probe coexistence,
authority/cursor fencing, revision/owner retirement with observed erasure, expiry/backward clock,
legacy reservation eviction, malformed/oversized/exhausted refusal and publisher-specific drop.
Three isolated faults are detected for authority identity, reservation eviction and raw erasure.
131focused units pass; full Vitest2849pass/oneexisting skip,281files.11existing native encrypted
receive-group cases pass with all legacy corruption/interruption/byte/record/cold assertions and
deadlines retained.119metadata,7repository contracts, types and scoped lint/format pass. Initial
type inference did not join the new size result across the generic queue; explicit union result
typing fixes that without changing queue behavior. Raw failed attempt retained.

Independent bookkeeping:505runtime sources,199unchanged label homes;1existing source identity
changed plus the raw-tail helper. All78specified/16open obligations retained. All1032old manifest
rows retained, with only the open range construction's new required test dependency. One required
uncredited test added:1033rows/486unresolved. No aggregate credit or release activation.

No8timing or fairness acceptance claimed yet. An unrun source-identical8build exists for QA, not
acceptance. Inspect turn alignment before the first timed8cell: a leftover partial turn can split
an8page into3+4+1 native preparations rather than4+4. Then rebuild exact final inputs and retain
actual deep outcome. Page64 deep, fixture recipe, withheld/normal gates, composed size fallback
and native stale-tab/rollback remain. Normal Page/Worker comparison and release work held.
No production/preview, signing/push/deploy, computer use, real profiles or service automation.
