# Remaining Account liveness and expiry work — Q-03 / Q-02 / Q-05

Starts after unsigned validation-control repair `dceec5c`. Work proceeds in three separately
validated and committed phases. Historical review annotations and prior evidence remain unchanged.
All workloads are synthetic; the personal Local package, profile and service stay untouched.

## Q-03: compact authenticated service context

The service authenticates the promotion request, its digest, membership and acceptance authority on
every request before ledger verification. Cache context will retain that authenticated request digest
in `auth.scope`, complete decision authority, generation and predecessor, plus exact submission and
response bytes. Repeating the full request JSON adds no binding and makes checkpoint size evict every
row. Remove that duplication only. SQL semantics, witness verification and fresh commit comparisons
remain mandatory. Cache eviction remains a safe cold-verification fallback.

Exit: first retain the pre-repair failure, then verify warm/cold equality and reuse for 35 rows with
4 KiB bodies and both 64 KiB and 1 MiB checkpoints. Changed digest, request bytes, membership, SQL
fields and response bytes must still refuse. Existing generated service-delivery/inbound histories,
omission controls, cache bounds/close controls, types and scoped lint/format must pass. Refresh the
reviewed construction inventory for the one runtime change. These sizes are explicit test fixtures,
not a measured user distribution or unlimited cache/capacity claim.

## Q-02: carrier work and bounded source batching

Retain a natural-scheduling growing-history/burst probe before changing runtime behavior. Reduce
redundant full loads only within explicitly owned revisions; invalidation after mutations, lock,
abort and network re-entry must retain fresh publication and commit checks. Batching must preserve
attribution, exact retry bytes, source coverage and crash recovery, with an explicit byte/count bound.
Do not discard the publication checks suggested by the packet. Compare work counts as well as timing,
and cold-replay the same writing. Specify the measured workload boundary and remaining history costs.

## Q-05: receive expiry observation

Keep automatic fresh-request retry and capped backoff. Carry the distinct expiry result into a bounded
visible lane reason and diagnostic. Test repeated expiry and then successful recovery without manual
retry, alongside gate/stop/backoff controls. Expiry count alone must not create a terminal halt.

## Evidence policy

Freeze tested source hashes and finite commands before each campaign. Retain failures and compact
results, normalizing only workspace paths in publishable copies and recording original hashes.
Do not duplicate large source/profile/carrier dumps in Git. Individual phases do not constitute the
complete immutable release aggregate; F-20/N-06/P-05 and the remaining product/platform gates stay open.
