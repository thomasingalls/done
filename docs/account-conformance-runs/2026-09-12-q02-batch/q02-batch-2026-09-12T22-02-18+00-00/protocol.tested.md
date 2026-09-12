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

## Q-03 result

[Retained evidence](../../account-conformance-runs/2026-09-12-q03/README.md): the original large-checkpoint
case failed with 118 warm and 118 cold verifications. The repaired 64 KiB and 1 MiB cases both use
13 warm versus 118 cold verifications over 35 4 KiB-body rows, with identical signed readback. Changed
digest/request, membership, response and SQL fields refuse. Four cache tests, 31 current service-delivery
tests (80 generated histories), and 19 service-inbound tests pass; types, lint, formatting and current
authority inventory pass. The first overbroad command included a retired v8 native fixture that could
not bind localhost in the sandbox; it is retained, not credited. The final format-only census correction
and live gate result are recorded separately from the passing functional stages. Only the cache context
expression/comments changed in production; existing domains and construction sites are unchanged.
Q-03 is complete within these bounds. Fresh authority verification, finite cache capacity, full ledger
replay and commit comparisons still cost work. Q-02 is next.

## Q-02 carrier subphase contract

The retained ordinary-bundle baseline reaches 83 total positions after 80 individually settled edits.
A thirty-edit burst then creates thirty positions and takes 112.7 seconds to drain (6.7 seconds local
admission). The subsequent instrumented single edit makes 36 full carrier loads, consuming 3.67 of
4.93 seconds in those loads. This independently reproduces the review's mechanism and magnitude;
it is one synthetic run on this machine, not a portable percentile or extrapolated capacity promise.

The first subphase changes collection and copying only. `getAll` plus `getAllKeys` runs inside the
same readonly transaction and retains every key/value pair; full placement, metadata, ciphertext and
coverage validation still follows. Internal read-only projections copy only their selected verified
result. The composed delivery operation checks inbound conflict through its already loaded complete
view instead of loading that view once more in its wrapper. Initial envelope preparation shares its
just-loaded records with the publication check; every append still loads a fresh publication census.
No snapshot crosses a write or network boundary, and no metadata-only check substitutes for full rows.

Exit: rerun the same natural workload, detached-projection and generated verification tests, complete
content carrier controls, warm-view tampering/compaction/cold-open tests and composed ownership/abort/
held-network controls. Preserve observed counts/timings even if disappointing. Batching remains the
next Q-02 subphase; this change does not alone close F-07 or the linear-history/capacity problem.

## Q-02 carrier result

[Baseline and carrier-only evidence](../../account-conformance-runs/2026-09-12-q02-carrier/README.md)
passes all eight stages: 1,016 unit tests, complete content controls, 23 native ownership/tamper/HTTP
tests, the natural workload, types, inventory and scoped lint/format. Tested inputs stayed unchanged.
The final instrumented edit falls from 36 to 31 loads, 3.67 to 2.75 seconds inside loads and 4.93 to
3.97 seconds overall. The ordinary thirty-edit burst falls from 112.7 to 90.1 seconds but still creates
thirty positions. Final five individually settled edits fall from 3.61–4.09 to 2.76–2.91 seconds.
Cold writing matches in both runs. These are paired runs, not a statistical performance guarantee.
The reduction is useful but insufficient; Q-02 remains open for bounded source batching.

## Q-02 batching contract

After carrier subphase `77a2753`, [ledger §8](../../account-crypto/account-ledger.md#8-private-v9-bounded-original-source-allocation-extension)
defines the private v9 `position-batch` entry. It commits 2–32 same-actor originals totaling at most
64 KiB; singleton encoding stays unchanged. All original bytes, capsule/index/hash identities, order,
actor and kind are retained. Retry cannot add later sources. Existing grant budgets, publication and
commit checks remain. Older readers refuse the new type; no deployed Account data needs migration.

Exit: independent canonical bytes and old-reader refusal, effective actor/order/size/body-substitution
omission controls, 120 generated actor/source/burn histories, native renderer death before/after
allocation/attempt/envelope commits, lost reply followed by later edits, full current composed sync
histories, ledger/parser regressions and the original natural workload. Preserve full source coverage
in test assertions even though network position count is no longer source count. Rerun current
construction classification and record the explicit extension without changing previous vector bytes.
