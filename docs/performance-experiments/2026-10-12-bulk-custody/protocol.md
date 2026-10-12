# Bounded bulk custody read comparison

Prospective protocol, before running the repair's tests or measurements. Base signed `902806c9`.
Release validation remains paused. No format, authority-memo, admission, undo or connection-lifetime
change. Scope: replace the slot inventory cursor with a bounded complete bulk read, leaving other
startup cursor users as they are. The cursor remains the reference behind `VITE_ACCOUNT_BULK_CUSTODY=0`.

## Question and prediction

Does eliminating one callback/round trip per scoped custody row materially shorten the fresh final
apply authority read? Predict at least a 20% median read-time reduction in both active-peer and backlog
conditions (from about 34 ms to <=27 ms at CPU-4x). Exact equality (~4 ms) and synchronous apply (~9 ms)
should remain similar. Protocol verification's 100+ ms bursts remain: do not predict a 50 ms typing p95
pass from this IO repair. Fresh open/close and layout checking still occur on every read.

## Design and measurement

Two repetitions of active and 600-position-backlog conditions per arm (eight restored sessions).
Reference then candidate in repetition one; reverse arm order in repetition two. Use the prior
120-card/~60 KB +12 KB Goals fixtures, 120 keys at requested 150 ms gaps, receiver CPU-4x, 75 ms added
request delay. Retain the preceding phase's test-only final-stage attribution for both arms. No CPU
sampling during comparisons. Session is the unit of analysis; keys and reads are dependent within it.
Serial execution, no concurrent builds/tests. Two repetitions identify a directional result on these
fixtures, not population tail latency or phone behavior. Instrumentation overhead is shared but not
quantified. CDP may undersample pre-handler blocking. Preserve failures and incompletes.

Primary: median fresh authority read during final apply, per session. Secondary: complete final-job
elapsed, exact comparison/apply spans, key-to-frame median/p95, waits, long tasks, completed receive
groups and send progress. Different work counts preclude treating aggregate CPU/time as throughput.
Guardrails: exact local text, undo/redo, peer preservation, convergence, cold offline replay, no
unexpected account HTTP refusals. Source/bundle/probe/fixture hashes and numeric-only logs retained.

## Correctness boundaries

Compare generated string prefixes and IDB-valid suffixes against the cursor oracle. Include exact
prefix keys, empty strings, NUL, high/surrogate code units, nested arrays, non-array keys, neighboring
slots, and 0/32/33 scoped rows. Return fresh detached values. Native checks cover one transaction's
snapshot under a competing write, abort/drain, version-change closure and no accidental creation.
Existing prepared receive native checks exercise local undo during committed-undisplayed remote work,
crash recovery and a changed inventory before final promotion. Authority authentication keeps all
existing tests for changed/missing/extra rows, stale completion and lifecycle invalidation.

## Decision rule

Retain the bulk default only if all correctness checks pass, median final authority read improves
>=20% in both modes in both repetitions, and neither mode shows a >20% typing-p95 regression in both
repetitions. Mixed timing evidence warrants a named focused repeat, not a generalized campaign. Failure
of scope/snapshot/lifetime checks blocks activation regardless of speed. A passing IO result does not
close the remaining proof-verification or 16/50 ms responsiveness targets.

## Named follow-up after initial repetition one

The first active/backlog pair shows read medians worsening (31→35.7 and 31.6→40.5 ms), not the
predicted improvement. Finish the predeclared comparison without changing its source. Then run a
synthetic Chromium probe to determine whether repeated `IDBRequest.result` access deserializes again.
The new bulk callback reads `values.result` once for length and again for each row; the cursor reads
each value once. This is a falsifiable candidate explanation, not an observed cause yet. Four rows,
128 KiB synthetic binary/string payloads, CPU-4x, five getter observations per kind; report object
identity and direct getter elapsed time. No fixture secrets, new authority policy or connection cache.
A positive finding permits a named candidate that captures each native result once, followed by a
fresh matched comparison under the original guardrails. Keep the failed candidate's results separate.

## Disposition after the complete comparison

All eight sessions passed correctness. Read medians were 31.0→35.7 / 31.0→30.3 ms (active),
31.6→40.5 / 29.7→31.1 ms (backlog). None met 20% improvement. The follow-up found stable result
object identity on every read: subsequent getters took 0–0.1 ms, apart from one later 0.8 ms sample.
That rejects repeated deserialization as the explanation on this Chromium. No follow-up candidate
or additional comparison was run. No consistent read-time gain is established; cursor stays default.

After measurement, the build selector was changed from bulk-unless-0 to bulk-only-if-1. The reader
itself was not changed. Retain the exact measured patch and source hashes separately from the final
opt-in patch. Native/unit bulk checks explicitly select the experiment; the ordinary build selects
the existing cursor. This records the failed prediction instead of relaxing the adoption criterion.
