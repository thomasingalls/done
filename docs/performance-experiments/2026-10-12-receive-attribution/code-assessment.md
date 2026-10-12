# Batching choices before timing results

Read against runtime `77657e23`, unchanged in `1734b2f5`. These are source observations and
implementation hypotheses, not measured speedups.

- `accountReceive.prepareRead` requests limit 1, rejects a cursor beyond the retained prefix,
  and replaces a single `outstanding` request. `receiveNext` also permits only one flight.
  Concurrent prefetch therefore requires a bounded owned request set, exact response binding,
  and validation in prefix order; changing Promise scheduling alone is incorrect.
- `ScopedRequestBudget` allows four active requests per session under a process ceiling of 16.
  Filling all four with backlog prefetch leaves no guaranteed room for sending or control work.
  A first prototype should reserve capacity, for example at most two concurrent backlog fetches,
  and keep native verification/commit serialized. This is a design candidate, not an activation.
- Each useful received page calls the owned state reader at prepare, admission, before commit
  and readback. That reader rechecks custody authority and loads the carrier. Further loads occur
  through the commit and status/driver composition. Existing counters will measure the total.
- `appendInbound` currently accepts updates followed by exactly one heads record. A transaction
  containing several existing receipts needs an internal grouped shape, witness extension in
  receipt order, aggregate byte bounds, request-expiry checks and one authenticated readback.
  The underlying reservation also insists on `after.events === before.events + 1`; a group
  needs an explicitly checked event count, not removal of the witness-count guard.
  Existing v1 receipt encodings and old readers could remain unchanged. Compatibility still
  needs a focused cold replay test on an older build, not just matching tags.
- Multi-entry wire pages already have a protocol maximum of eight; `accountInbound` and
  `inboundRecord` require limit 1 and one entry. Persisting the larger signed page therefore
  needs a receipt design. Do not duplicate the full signed page once per entry. Coordinate any
  new representation with retained-baseline work and a reader-first activation/rollback plan.
- The composed self-read path reconciles unknown submit outcomes through outbound evidence
  and does not write a second plaintext content copy. `advanceSelfReceive` already advances
  known acceptances. Omitting redundant own-stream polls must retain uncertain-submit reads,
  periodic checking, authority transitions and fair attention to other publishers.
- Existing history installation v2 can install authenticated receive cuts after verifying a
  checkpoint and its admission. Thus “two-device accounts cannot install checkpoints” would
  be too broad. The checkpoint **creation/admission eligibility** and availability while a
  peer is behind need separate analysis; this phase does not relax them or infer a safe shortcut.
  Specifically, checkpoint admission refuses producer self-admission when membership has more
  than one device. The admitting peer reconstructs accepted history independently through the
  proposed cuts. An already admitted checkpoint can help later catch-up; producing a fresh one
  while the only peer is behind does not bypass that peer's required replay.

Grouping receipts can amortize loads/authority/commit work, but every entry still needs signature
and content checks. Coverage cost must be measured during incremental receiving: the cold-open
profile has different reuse conditions. Bounded groups also enlarge individual admission jobs,
so sender turns, input latency, lock, expiry and failure cleanup remain implementation guardrails.
