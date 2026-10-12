# Prepared remote handoff — design only

2026-10-12. No implementation or format change is authorized by this document. The current
remote FIFO fence stays in place for the owned-reservation and unchanged-authority repairs.
See the [prospective escalation rule](performance-experiments/2026-10-12-owned-reservations/protocol.md).

**Measured next-step decision:** the [unchanged-authority repair](performance-experiments/2026-10-12-authority-reuse/README.md)
completes that two-slice sequence. Both repetitions exceed the threshold: active-peer frame p95
207–211 ms, backlog 137–162 ms at CPU-4x; 9/11 of 120 backlog keys exceed 100 ms. Remote admission
accounts for 92–98% of remaining active-peer queue wait and over 99% of backlog queue wait.
Proceed to this bounded handoff phase; do not substitute another general shrinking pass.
Residual long tasks reach 169 ms unprofiled. Diagnostics identify ledger byte equality as the
largest sampled category, plus full authentication outside the new reuse check. Separating the
logical fence must therefore be accompanied by explicit CPU-yield boundaries; it does not itself
make synchronous validation preemptible. This document still specifies design, not implemented handoff.

The ordering argument is valid in principle: a local edit against the currently displayed document
cannot depend on a remote page that has not yet been applied there. TRD §6.1 permits a committed,
not-yet-displayed suffix. That permits investigating verification and durable remote preparation
outside the editor's admission fence, followed by a short ordered apply. It does not establish that
the current receipt, storage owner and editor projection APIs can already be separated safely.

The proposed boundary would be:

1. Authenticate/verify the incoming page against an owned storage view, preserving original update
   frames and pending Yjs dependencies. Permit ordinary local journalling against the old visible
   document while preparation awaits crypto or storage. Yield splittable CPU work on a budget.
2. Durably commit the remote update/receipt before exposing it. Storage work stays serialized;
   local journal entries accepted during preparation must remain replayable with this suffix.
3. Enqueue a final apply against the **current** canonical document and undo state. Never replace
   it with a stale prepared document. Recheck authority/lifetime and local refusal state. Preserve
   remote dependency-before-local-acknowledgement ordering from that point onward.

Before implementation, settle these obligations with focused crash/order reproductions:

- A durable but unpromoted receipt must be resumed exactly once after interruption; a later receipt
  or a head advance cannot make its content disappear. Cold replay must include the undisplayed suffix.
- Source capture, flush, compaction and coverage can see a newer storage view than the displayed
  document. Specify which state each consumes; do not let a stale editor snapshot supersede it.
- Local undo/redo, text edits and structural commands can change the document while preparation is
  pending. Apply original remote frames to the live document, preserving pending structs/deletes and
  local undo origins. A prepared full snapshot cannot silently erase intervening local work.
- Refused local input must not be bypassed. A durable remote suffix may exist, but final promotion
  cannot skip the existing pending local head. Closing must settle native work and erase proposals.
- Membership, epoch/key installation, revocation, custody changes and authority transitions remain
  fenced. Cancellation cannot turn a stale capability into a valid apply or acceptance receipt.
- Sending must get a turn during long catch-up. Splitting verification from admission must not
  create an unbounded prepared queue, starvation, or whole-history copies per pending proposal.

The timed journal-flush repair demonstrates that some durable work can overlap already journalled
local edits. It is useful precedent, not proof for received state: remote preparation also changes
the authenticated receipt/coverage view and must preserve the cross-store handoff explicitly.
