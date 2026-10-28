# Following phase102: scope a size fallback to the affected publisher

The existing byte-only transport remembers either a404 or a successful aggregate byte overflow as
one owner-wide unavailable flag. This is an intentional conservative downgrade documented in the
2026-10-21 batching contract. It is safe, but it couples a payload-specific limit from publisherA to
small independent publisherB. Do not relabel this as authority loss or a wire bug.

After the100 candidate's frozen eight journeys and result checkpoint102, append a discriminating
A-overflow/B-small regression and run it before repair. Expected: A falls back after drain under the
original deadline, A remains individual, B still batches. A route404 must still disable batching for
all publishers. Preserve every old transport/native assertion, byte/page/queue cap, original captured
requests, close/overlap/cancellation ownership, verification and durable-before-visible promotion.

Use only an explicit publisher identity decoded from the receiver's already-owned first request.
This is owner-local transport scheduling, never reusable authority. Successful-size fallback may be
remembered per publisher with bounded128-ID bookkeeping; evict the oldest size hint to allow safe
re-probing, never disable a different publisher to bound memory. Route absence remains owner-wide.
Without an explicit scope retain conservative byte-only behavior for existing clients/callers.
No changed framing, rates, retry cadence, service, signature/prefix/witness/commit checks or persistence.

Add regressions for scope ordering, same-publisher memory, endpoint-wide404, bound eviction, default
compatibility, malformed/refused responses, drain/abort/shared deadline and defensive caller mutation.
Run the affected original17 native batch cases and focused unit/HTTP/prefetch cases, plus types,
normal checks and independent source/contract review. Keep this separate from100's measured source;
no whole-client speed claim for this new large-payload repair without a dedicated comparison.
