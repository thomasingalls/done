# Phase115 — Latch expired publication deadlines only

On a local wake, if an existing publication deadline has passed, close that window before noting
new input. It stays due until the existing new-envelope callback consumes/clears it. Local journal
flush uses its original independent window/helper. No source admission, persistence, wire retry,
authority/history/signature/witness/auth/final-commit, limit, concurrency, backoff or notification
change. Quiet reuse remains disabled in the product default pending full comparison.

83 focused cases pass:15 batching (8 original+7 new),21 scheduler,41 selector,6 projection. All8 old
batching cases/helpers are byte-exact. New tests cover exact/past expiry under receive, async prelude,
fresh consumed window, nonexpired collection, receive retry floor, cancellation/drain and local flush
independence. Existing tests retain sealed-wire retry, send-backoff and hidden flush checks. Omitting
only the new close statement restores5 expiry-sensitive failures while all original8 remain passing.

Verbatim production scheduler/window replays of the same fixed histories now publish first at300ms
control,500ms receive overlap,550ms prelude overlap (old300/2000/2100). One active lane, all8 inputs,
clean cancellation. Controlled quanta are not actual internal costs or a prediction of peer p95.

61 encrypted/native cases exercised across modes:55 default/6 conditional skips,3 authority-reuse,
2 ledger-audit,1 hidden batching pass.81 metadata checks and types/lint pass. Before-repair failures,
new helper errors (spread copied getter values, narrower type, required dirty-send drain) and missing
model-protocol invocation are retained/qualified. Final tests retain live observations and the
existing extra reconciliation pass. No altered old assertion or failed attempt gets passing credit.

This is implementation evidence only. Rebuild both complete exports, enable750ms solely in the
isolated experimental C owner, freeze/run the four normal/withheld two-receiver cases next. If they
pass, run original eight throughput/fairness/data gates before adoption/readiness.2.5s complete peer,
16ms local and all security/durability bounds stay. Qualification912/367 remains paused.115 follows
immutable114; unsigned, real index empty. No signing/push/preview/API update or release preparation.

The first normal-check loop correctly rejects two stale receipts after documentation changed during
its execution. That failed trace is retained. Final ordinary-check results are recorded only after
tracked inputs are stable; no receipt or source-identity check is waived.
