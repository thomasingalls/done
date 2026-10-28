# Next bounded repair — adopt existing verified-view selection at redundant projection boundaries

Outcome: reduce synchronous whole-record matching/copying during ordinary full-history editing,
using the existing carrier/verified-record owner contract. No new cross-owner cache, new scalar
revision/hash authority, relaxed bytes/nonce/signature checks, rate/pacing or retention policy.

Source leads (not a claim every call is removable):
- `accountReceive.ts` inspectCensus uses readIfMatches after an owner load; publication/recovery
  contexts also use verified.read. `accountDelivery.ts` beforeCommit freshly loads records, then
  verifyProposed obtains another full verified projection. These deserve a call/count discriminator.
- The existing selectState/carrier.select→verified.select path already consumes a synchronous
  ContentSelection, checks current view identity before/after and detaches only its projection.
- `verificationOwnership.ts` scans complete previous/retained graphs at adoption/cleanup. Keep
  this as a separately bounded follow-up; erasure correctness and alias handling are security work.

First establish a narrow repeatable counterexample/count on a fresh verified owner: an unchanged
authenticated carrier view should not be rescanned multiple times merely to project metadata.
Trace which caller needs complete rows, which fields need copying, and which already has a valid
lease. Use the exact existing synchronous selection interface where applicable. Async proposed
verification must keep detached captured input and fresh guards; do not extend a lease across await
or lend the retained graph to a mutable caller. A smaller selected projection may be possible;
prove its completeness before replacing full read. Do not assume all exact checks are redundant.

Required falsifiers/regressions: stale/cross-owner/expired/async selection refuses; byte replacement
or changed metadata cannot inherit proof; caller mutation cannot change cached buffers/projection;
clear/close/authority/counter changes invalidate; legacy/reference fallback keeps exact bytes;
actual reservation sequence, nonce allocation, witness and native final readback remain fresh.
Shared/subarray buffers must retain current erase-only-unowned behavior. Existing independent
audit/reference paths must not start consuming foreground cached evidence. Keep every old test.

Then rerun the full-history preparation+editing workload and original two-receiver cases with
prospectively frozen source/artifacts, same16ms local/2.5s peer/each-marker and complete data/native/
continuation gates. Profiled/helper micro results cannot override either original failed condition.
Source/projection repair first; independently bound ownership-traversal or warm validation afterward
if measurements still select them. No promise of a latency gain before those whole-client checks.
