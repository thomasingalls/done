# F-17: workspace preparation handoff contract

Preparation phase at signed `213ada08`, after rejecting both metadata fast paths. This phase defines
an integration contract and strengthens the current implementation's reference tests. It does not
remove either draft, implement the new capability, or claim a product speedup. Existing complete
comparison, pending-state, metadata/undo and journal-durability tests remain mandatory.

## What the current implementation establishes

`admissionDocument.prepareIntent` clones the canonical document, assigns the queue's writer, calls a
synchronous command adapter and captures its updates. The workspace adapter separately forks its
private accepted history, executes the command, and applies the merged updates to the first draft.
For Account sources, preparation creates another canonical probe, replays the original source frames
in order and compares complete state with the prepared draft before custody capture. The generic
preparer is used elsewhere and must remain supported.

The queue retains prepared update/source/carrier bytes through storage failure. Retrying that same
head does not re-run the command. A successful slice promotes before its remaining intent is prepared.
Every promotion increments revision, including a source-free no-op whose state vector is unchanged.
Remote input that advances the local writer's clock replaces the writer before subsequent preparation.
Workspace publication transfers the pending history, verifies complete canonical/projection equality,
and only then emits UI and outgoing notifications. Discard explicitly disposes pending history; close
prevents late publication and disposes histories after drain. A write already in flight may reach disk
after close without being acknowledged; do not promise that cold recovery excludes all unacknowledged
work.

## Proposed private interface and ownership

Keep `PrepareIntent(draft, input, limit)` unchanged for generic callers. Add an internal workspace-only
registration at owner construction, absent from `AdmittedWorkspace` and transport-facing APIs. It
must not hand the canonical Y.Doc to the workspace, commands, observers or lifecycle callbacks.

The admission owner issues a one-shot preparation context only for its live FIFO local head. It binds
an unforgeable per-owner identity, the accepted revision, writer ID, job identity and slice ordinal.
The context is an identity-bearing private object, not a tuple that a caller can recreate. No-op
promotions invalidate an older revision even when encoded state vectors agree. Reopening creates a
new owner identity; equal revision numbers or writer values do not restore old authority.

The workspace records the revision it has fully verified against canonical state at startup and each
accepted event. The proposed context is usable only against that verified revision, while the queue
owns the head. Run the command synchronously on a detached history fork with the context's writer.
The return transfers an owned prepared history, detached selections/result, merged update, optional
remaining intent and ordered original sources to a private handoff record. Reject thenables, foreign,
stale, previously returned or mismatched contexts before carrier capture or storage. Do not satisfy a
basis check by comparing state vectors alone. The existing synchronous verified-revision relationship
must be maintained through reentrant observers and owned remote deliveries; if it cannot be proved,
refuse or retain the generic draft path.

| Transition | Owner of history and buffers | Required behavior |
| --- | --- | --- |
| Before command | Workspace owns accepted history; queue owns canonical/input | Context names the currently verified basis and current writer |
| Preparing | Workspace owns detached candidate and captured buffers | No accepted-state, UI or transport mutation; cleanup on every throw |
| Returned and checked | Queue owns a single prepared handoff; workspace retains accepted history | Context becomes consumed once; retain candidate privately |
| Storage fails | Same queue head retains the same handoff | Retry storage with exact bytes; do not consume a context again or rerun command |
| Accepted slice | Queue applies durable update; workspace adopts matching candidate | Full comparison before UI/transport; dispose previous accepted history |
| Remaining slice | Prior handoff has transferred/disposed; queue owns remainder | Mint a new context at the new revision; preserve the human group |
| Discard or preparation refusal | Candidate resources return to cleanup owner | Dispose abandoned history and erase buffers; leave accepted state untouched |
| Close/cancel | Ownership remains explicit until any in-flight carrier work settles | Prevent late promotion; terminal cleanup and repeated close are idempotent |

The handoff must identify its job/slice explicitly. A module-global “latest pending history” alone is
not sufficient authority to adopt an event after introducing another preparation route. Validation
errors before storage abandon the candidate; storage errors retain it for retry. A projection failure
after a completed durable append is terminal and must block exposure; it cannot roll storage back.

## Verification preserved while eliminating work

The intended saving is the first canonical-derived draft and replay into it on the workspace path.
The history fork, independent canonical document and complete post-promotion comparison remain.
Before source custody capture, validate Account frames against the candidate with the current separate
canonical probe, original ordering and full pending/DS/content comparison. Do not remove that probe
or replace it with the candidate's own assertion. Keep all update, remainder, source-count, byte-budget,
writer and synchronous-return checks. The source-free no-op path must prove no document delta while
still adopting ordered history/selection state and advancing revision.

A first integration should be private and explicit, with the legacy two-draft path retained as a
reference. Run both against identical command, retry/discard, remote, slice and shutdown histories.
Compare accepted outcomes, visible text/selection, undo/redo, original source sequence and independent
cold replay, not random IDs or nondeterministic ciphertext. Wire into Local only after those gates;
Account activation remains a separate integration gate with source/capture suites. No new public API,
persistence format, acknowledgement point or latency budget is authorized by this preparation document.

## Tests and controls for this phase

Add baseline production tests for 80 generated ordered histories with local journal acceptance,
forced-write failure/retry, discarded work and remote input. Use an independent text/revision ledger
and cold disk+journal replay. Record actual bases and writer IDs seen by each preparation and require
one preparation per retained retry. Add a directed no-op/remote-writer-collision trace, a private-history
discard/close resource check, and 160 generated source-coverage checks with pending structs/delete sets.
Deliberate stale drafts, premature promotion, leaked pending history and omitted source verification
must fail their respective assertions. Keep every control output and source patch.

These tests exercise the current production pipeline. They do not prove the unimplemented capability
rejects forged, stale, reused, foreign-owner or wrong-slice contexts. Those negative tests are required
against the actual new handoff component before it is connected, along with preparation-throw,
source-capture-throw, failed verification and close/reentrancy cleanup. Do not substitute a passing toy
state machine for that integration evidence. Run current full unit and owned affected-suite checks,
refresh only reviewed inventory/denominators, preserve 52 personal/vector pins and L-2, then sign the
checkpoint. No performance rerun is warranted while production is unchanged.

## Observed disposition

All 57 cases in the three affected files pass through the owned runner with process drain. The full
unit suite passes 96 files / 1,042 tests; all 99 runner self-tests, TypeScript, scoped style, inventory
and authority checks pass. The four controls each fail at the named assertion, and their source
patches and outputs survive in the [evidence packet](./account-conformance-runs/2026-09-14-f17-preparation-contract/README.md).

The initial fixture failures concerned queue bookkeeping after acceptance, nested transaction update
emission and a wrong helper import. They were corrected without production edits; their failed logs
are retained. The final close test requires a live prepared history before closing, preventing a
vacuous disposal pass. These results establish baseline regression coverage and control sensitivity,
not correctness of the proposed capability or a latency improvement. The last application gate still
fails CPU-4x Android typing at 69.4 ms against <16 ms; no application/native timing was rerun here.

Next implement the actual private context/handoff component and its foreign-owner, stale, reuse,
wrong-slice, throw, disposal and reentrancy tests while retaining the current editor path. Then compare
Local integration with that reference before application timing under unchanged budgets. Account
source/capture integration needs its own gate. Do not treat completion of this preparation phase as
permission to bypass any of those checks.
