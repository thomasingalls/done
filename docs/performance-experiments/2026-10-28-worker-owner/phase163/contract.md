# Worker owner and acknowledgment boundary

2026-10-28. Phase163 follows the [recorded Goals stalls](../../2026-10-28-goals-stalls/phase162/README.md).
This is a contract and disposable feasibility kernel, not the shipping editor or a performance repair.
The [TRD journal/admission contract](../../../TRD.md#61-primary-the-encrypted-content-store) still governs. Its text and
the current implementation take precedence over any shorthand here.

## Ownership and observable acceptance

Keep the private account's storage, keys, verified records, authority/history proofs, recovery and
serialized coordination together. Moving small helpers out of that owner would leave repeated
whole-ledger copying and proof lifetime problems at the boundary. The page retains the editor, DOM,
selection, native input, passkey ceremony and a narrow journal/activity endpoint. Worker-owned work
still needs priority and interruption: moving an unbounded maintenance job does not make its queue
responsive.

The first product integration must preserve the current same-handler admitted local edit and sealed
Window journal, including staged-state checks, predecessor dependencies, refusal and commit-first
fallback. It must not make local keystrokes wait for an ordinary asynchronous worker round trip.
The Window side may hold the already permitted domain-separated journal subkey inside a private
lifetime owner; never expose the root/generation key, signing credential, recovery factor or a general
key getter. Remote writing reaches the editable view only after native durable admission. The
Window accepted view and worker basis need explicit ordered local-prefix/durable-revision identities;
an older remote projection must neither overwrite accepted local writing nor acknowledge it twice.
These editor integration mechanics are still unimplemented.

The kernel deliberately exercises commands asynchronously in the worker. Its reply follows the
existing real journal/admission path. That proves execution is possible, **not** that asynchronous
RPC satisfies the editor's synchronous acknowledgment contract. A plain independent textarea is a
functional control, not Goals, IME or a16ms input-gate measurement.
The diagnostic snapshot/export reply includes the entire small fictional archive; it is an oracle
for this bounded fixture, not the proposed product message shape. Production must send bounded
admitted deltas/projections rather than cloning the full ledger or archive per edit.

## Messages, credentials and lifetime

- One random owner incarnation, strictly increasing request identities, closed message schemas and
  bounded copied payloads correlate commands/replies. They are local lifetime/correlation controls,
  not network authentication or protection from already compromised same-origin code.
- Only a fresh ordinary unlock and actual verified passkey assertion open the account. The page
  performs WebAuthn; the existing worker owner verifies the returned assertion. Lock/replacement
  invalidates the incarnation before waiting for cleanup. Late ready/results cannot reopen it.
- Closing stops new effects, wakes outstanding journal calls, drains jobs, clears the observed raw
  journal-key buffers and releases native permits. A cleanup failure must remain a failure. A forced
  worker kill has no graceful-erasure credit; it leaves outstanding acknowledgment uncertain.
- A lost reply after the actual sealed journal write can recover that edit exactly once. Never
  automatically resubmit an uncertain command. Cancellation before the write must preserve the old
  writing. IndexedDB completion, not an IPC reply, still determines content durability.
- Pagehide requires a fresh incarnation on return. A freeze alone is not permission to steal a live
  owner's permit. Factor, generation, root authority, revocation or incompatible ownership changes
  initially fence and close both sides; do not invent a hot key swap or remember-me behavior.

## Native exclusion: the experiment's explicit adaptation

Private account/joined sessions currently acquire an **exclusive** `done/slot-writer/<slot>` permit.
The generic shared Local owner intentionally refuses Account markers. Neither rule is weakened in
the repository. A Window storage callback also needs a real lifetime fence: the worker's permit
alone cannot fence a callback queued just before unexpected worker death.

The lab alone implements this proposed cohort protocol:

1. A supervisor takes a new exclusive reservation for the slot.
2. It acquires and releases an exclusive barrier on the **existing** slot lock name, draining older
   owners and surviving workers. Reservation alone is insufficient after supervisor loss.
3. It holds a native shared endpoint lease on the existing name. The worker joins that name with a
   native shared **ifAvailable** request. A missing/busy lease refuses; it never queues or steals.
4. Both endpoint and worker leases remain until their associated effects settle. New supervisors
   serialize on the reservation and repeat the barrier. Older exclusive owners wait for both leases.

The nonqueued join is necessary: an older exclusive request can arrive between the Window lease
and worker join. A queued worker shared request then waits behind that exclusive owner, which itself
waits for the retained Window lease. The native before control observes precisely this blocked order;
the after control requires refusal and lets the older owner progress after cleanup.

Only the disposable build changes the two account/joined acquisition-mode literals to shared and
adds a lock-manager port for that nonqueued join. It also binds accountCapture's DOM activity to
explicit EventTargets, checks shared liveness at the existing effect gate, and observes raw-key
cleanup numerically. Current account compatibility, factors, cryptography, native transactions,
verification and original disposal bodies still execute. These declared transformations are
independently reconstructed from the unchanged source, not hidden in a verifier stub.

This is **not** approval to change production locking. Integration needs a real cohort owner/API,
review of every competing activation/removal/migration path, and compatibility refusal for mixed
clients. Shared leases alone would be unsafe. The orphan and mixed-exclusive controls are retained
specifically to prevent that simplification.

## Journal bridge and browser compatibility

The kernel makes every journal lookup/write against fresh actual Window localStorage. It does not
send a captured journal snapshot and treat it as current. Only the worker waits on the bounded
shared-memory mailbox; the page never uses Atomics.wait. The existing encrypted journal code runs.

Shared memory requires isolation headers supplied only to the disposable `/worker-lab/` subtree.
This is a laboratory adapter, not a selected product requirement, browser-support claim or change
to production headers. A production implementation should keep the synchronous local journal and
its admitted local mutation path in the page and use ordinary bounded messages for the account
runtime. The real browser/IME, extension/passkey and cached-client compatibility work remains.
Worker availability while the page is suspended or closed is not established by this experiment.

## Separately progressing catch-up queues

Keep downloaded/staged, verified-and-durably-admitted, and presented frontiers distinct. Starting
the next fetch must not wait for current verification/display. Every stage needs byte/item credits,
finite publisher targets and cancellation; a slow verifier or page applies backpressure without
silently growing memory or advancing the verified cursor. Prioritize local writing and rotate
publisher/account work fairly. Coalesce display work without losing attribution or local Undo.

Downloaded bytes grant no accepted state or proof reuse. Preserve the30s request expiry/renewal,
authority/generation identity, ordering, witness and fresh final authorization/commit checks.
Persistent staging, if selected, needs authenticated encryption, exact ownership and resumable
removal. This phase does not implement a staging format, concurrent fetch pipeline, service
automation or new remote protocol. The16ms input,2.5s peer/all-marker and30s delivery gates remain
unchanged and unearned by this kernel.

## Next bounded implementation boundary

Extract explicit account-runtime environment/lifetime ports with unchanged page execution first,
including a production-shaped cohort refusal contract; independently check the unchanged owners.
Then integrate worker ownership and the bounded admitted Window mirror/journal, proving same-handler
local acceptance and lost-message recovery before measuring the actual Goals paragraph again.
Do not enable a partial editor adapter or a shared-memory-only path merely because this kernel
opens an account. Download/verification/display decoupling remains a separate subsequent slice.
