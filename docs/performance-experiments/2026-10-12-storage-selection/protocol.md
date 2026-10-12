# Storage selection: prospective protocol, 2026-10-12

Base: signed `f4f01228`, private verification ownership enabled. Question: can journal flush and
sync projections obtain only detached answers after the same complete validation, eliminating
their outward full-history copies? Preserve the ordinary full-record load and its isolation.
No format change, retention implementation, publication or release qualification.

Design: a private carrier selection grants a synchronous, expiring identity lease only after
normal counter/shape/rolling-audit and semantic validation. Only the private v9 Account validator
may validate retained rows without an input copy; it already copies its own new rows. Selection
callers see no carrier rows or buffers. The separate verifier matches the lease identity and
clones its selected result. Expiry, invalidation, callback failure and stale verification must
refuse. Ordinary load callers keep detached byte arrays. No arbitrary callback over carrier rows.

Target journal source-presence and existing sync-state/status projections first. Operations that
actually consume raw records, independent audits, cold reads and compaction keep detached reads.
Explicit `VITE_ACCOUNT_SELECTIVE_LOADS=0` retains the current path. Measure before activation.

Prediction: on the retained offline 120-card/600+ received-position fixture, 120 keys cause nine
flushes and about 33.16 MB of record copies today. Selective source-presence should eliminate
nearly all of those bytes, leaving newly verified rows rather than whole history (expected below
0.1 MB). Expect at least 20% less aggregate long-task time, but this is a hypothesis, not an
attribution of every frame tail. The prior packet already maps the 33 MB to the carrier load.

Benchmark: three fresh restored sessions per arm in AB/BA/AB order, desktop Chromium CPU-4x,
offline, 120 keys at requested 150 ms spacing, same fixture, one undo stack. Profile neither arm
during the timed comparison and run no concurrent tests/builds. Keep all attempts; stop on a
failed correctness assertion. Compare session-level copied bytes and long-task totals/maxima,
handler/frame median/p95/max, load/flush/audit counts. Quantiles use floor(n*p). Keys are dependent
observations, not independent samples. These three pairs estimate a local mechanism/effect size,
not statistical significance or handset performance; dispatch timing omits pre-dispatch delay.

Activation: all safety checks pass, at least 90% fewer record-copy bytes, and no >10% regression
in median-of-session handler medians or frame p95. If total long-task improvement misses 20%,
inspect that discrepancy before deciding; do not silently retune the benchmark or start a broad
optimization search. Report individual frame regressions even when aggregate criteria pass.

Safety: mutation/erasure of selected results and full loads cannot change retained state; selections
expire synchronously, cannot cross owners, and cannot survive abort, resume invalidation or late
validation. Test thrown/async selectors. Keep generated equality/erasure checks; run focused native
compaction/cold replay, audit refusal, serialization and the packaged two-device delivery/undo/
offline journey. Retain the explicit full-copy fallback. Record hashes, numeric logs and exact
commands; exclude fixture credentials/service/browser state from the packet.
