# Owned membership discovery: cooperative proof work and one-operation transfer

2026-10-12. Preceding bulk-read experiment signed `b656553a`. This phase is local and unpublished;
release validation remains paused. No stored or wire format changes. Bulk reads remain opt-in.

## Scheduling without changing verification

Membership discovery accepts an optional protocol checkpoint. The client supplies the existing 8 ms
cooperative budget; it checks the owning task, handoff/close state and captured authority context and
payload identity before a yield and again afterward. Nested admission, ceremony, certification,
continuation and recovery verifiers pass that same checkpoint through their asynchronous operations.
No global callback or shared task context is installed. Service callers omit the checkpoint.

`proofWork` retains every operation's result and all existing checks. Without a checkpoint it returns
the original promise. With one, it asks the owner for a scheduling boundary after the operation
settles, before allowing the next operation to use the result. Failure or cancellation rejects the
whole chain. No partial history is exposed. Parsers still capture wire objects before asynchronous
verification, and the top-level chain/response captures its base. A single parser, crypto operation,
or synchronous state construction can exceed eight milliseconds: this is not preemption.

The helper is used only for proof verification. It is not used inside an IndexedDB transaction,
commit callback or synchronous final editor promotion. The prepared receive path's journal-before-
apply, live Yjs undo and complete projection check are unchanged.

## Private, operation-scoped proof transfer

At authenticated owner startup, retain an independently cloned genesis membership base. Its identity
is immutable over this owner's membership transitions. It is not a new authority token: every
preparation still calls `assertCurrent`, reading the complete current slot inventory and using exact
positive comparison/full authenticated fallback. The ordinary cursor remains the default.

A discovery captures that anchor plus the owner's current inbound context and expected-payload
identity. The response verifier still checks the service signature, exact request hash, request
signature, actor eligibility, scope, lifetime and every ancestry proof. Its branded history and
captured proofs may pass directly to the **private** installation helper for this one operation.
Normal and terminal-removal discovery use the same boundary. The public `adoptMembership` wrapper
accepts raw proofs and always performs independent verification; it cannot accept a handoff argument.
There is no cross-request memo or public verified-result cache.

Under the exclusive storage owner, installation first performs the complete fresh inventory check,
checks the network task and request expiry, and requires the captured inbound context and payload
identities still to match. It resolves this device's publisher and verifies the held authority against
the returned history, including fork/rollback checks. It checks expiry again before the unchanged-head
return or any transition. A competing context or payload refuses the transfer; a later new discovery
can retry. The temporary result dies with its operation.

When membership actually changes, existing independently authenticated custody reads, ledger-cut
verification, generation/removal handling, CAS writes and final readback remain. Generation changes
still stop admission and close the old owner. A history-maintenance change to expected custody also
invalidates an in-flight transfer even if the genesis anchor is unchanged. Close discards the anchor.

## Evidence boundary

`VITE_ACCOUNT_MEMBERSHIP_WORK=0` retains the independently verifying reference discovery/adoption
path and omits client proof checkpoints. This also restores the extra authenticated anchor reads.
The [measurement packet](performance-experiments/2026-10-12-membership-work/README.md) records the
prospective adoption criterion and final disposition: enabled after meeting the mechanism/long-task
criteria, with mixed frame-p95 results and the typing budgets still unmet. Do not infer a latency
pass from correctness.
