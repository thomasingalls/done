# F-17: private workspace preparation ownership component

This phase starts at signed `6c5502fd` and implements the component specified by the
[preparation contract](./f17-preparation-contract.md). `src/crdt/workspacePreparation.ts` is exercised
by its actual component tests but has no admission/editor caller yet. No existing runtime module,
public workspace interface, persistent format or acknowledgement point changes. Removing the first
draft and measuring an application benefit still require integration.

## Internal API and ownership

The queue supplies a synchronous read of its head; the workspace supplies the revision it has fully
verified. These are trusted internal capabilities, not data supplied by the app or transport. The
head identifies local/remote work, the job object, slice ordinal, accepted revision and writer.
`issue` permits only a verified local head, snapshots its fields and returns a frozen opaque context.
A copied object with identical fields, another owner's context, or a consumed context has no authority.
Reopening constructs a new owner; no-op promotion still advances the revision.

`prepare` consumes the context once. The synchronous command registers its new detached history and
temporary buffers with the scope as they are created, then returns the prepared bytes. The component
requires the matching writer, bounded update/source count and a strictly smaller optional remainder.
It rejects aliases of its borrowed input. It collects the whole returned buffer set before checking
cancellation or return shape. Caller-owned input is copied and the borrowed copy is erased.

A mandatory synchronous verification callback must return exactly `true` before optional custody
capture. This callback is where integration must retain the independent Account source probe and
original frame ordering; the component does not implement or replace that probe. Head identity and
revision are checked again after command, verification and capture. A failed preparation disposes the
candidate, erases owned bytes and permits a fresh context for the still-unaccepted input.

`borrow` grants one lease over the retained prepared result for a synchronous journal append or an
awaited content write. The caller must release it in `finally`. Failed storage can borrow the exact
same result again without rerunning the command. Cancellation immediately revokes all new work, while
cleanup waits for existing leases/callbacks to release their references. Repeated release and close
are idempotent. A stale borrow revokes and disposes its candidate.

`adopt` is called after durable canonical promotion, before UI or transport publication, with no
write lease outstanding. The head must still name the same local job/slice/writer at exactly the next
revision; the workspace's previously verified revision must still match the preparation basis. A
second mandatory callback performs complete canonical/candidate comparison. Adoption rechecks the
binding after that callback, transfers the history only on success, and treats failure as terminal.
The workspace then records the newly verified revision. `finish` erases preparation buffers after
the queue has copied any remaining intent; it does not destroy the transferred history.

`discard` and `close` dispose untransferred history and erase registered bytes. Cleanup attempts all
resources even if a destructor fails, then reports a terminal cleanup failure through close. Late
scope calls cannot destroy a previously transferred history. Thenables are refused; later returned
buffers and late scoped allocations are reclaimed if those callbacks settle. Close waits for issued
write leases and active synchronous calls, not for an invalid, potentially never-settling async
callback. Internal callbacks must obey the synchronous contract and register allocations immediately;
this is not a sandbox against arbitrary JavaScript or retained aliases.

## Tests and discriminating controls

The 20 component cases use real Yjs canonical documents, forked undo histories, complete state/source
comparison and detached update bytes. The generated case runs 120 histories with seed `140924`,
covering accept, retained retry, discard, no-op and remote transitions against an independent
text/revision/undo-count ledger and cold carrier replay. Directed tests cover context identity and
head fields, per-slice renewal, original-byte retry, shape bounds, writer mismatch, input aliasing,
source refusal, preparation/capture/verification throws, cancellation/reentrancy, thenables, history
transfer, a throwing destructor and a detached input buffer.

Eight source mutations must fail the intended assertions: ignoring context identity, omitting the
revision check, erasing an active write, leaking a revoked history, skipping source verification,
skipping adoption verification, omitting collection of all returned buffers, and omitting late-result
cleanup. Retain each exact patch, configuration and output, including unsuccessful first controls.

Two directed tests first reproduced cleanup gaps in this new, unconnected component: late async
results and a command closing before returning all its buffers. The repaired implementation passes
both; the original implementation and failing test source/output are retained. The first
revision-binding mutation exposed a fixture cleanup bug: an unexpectedly successful borrow was left
held when the assertion failed, causing a timeout. That fixture now releases even the unexpected
borrow. The premature-erasure control first hit the earlier drain-state assertion; the byte-retention
assertion now runs first, with cleanup in `finally`. These are documented observations, not evidence
of a deployed-app defect.

## Integration gates still ahead

Component tests do not establish queue/editor integration or durable admission correctness. Next add
the private Local registration and matching job/slice publication path while retaining the generic
preparer as a reference. Derive updates from actual command transactions; keep queue capacity and
source-byte reservations, original sources, no-op treatment, slices, ordered remote delivery and
shutdown semantics. Run identical command/undo/selection, refusal/retry/discard, remote and shutdown
histories against both paths, including native crash/pressure controls. Preserve full comparison
before publication. Account activation needs its separate source/capture integration gate.

No timing is taken in this component phase. Before measuring the integrated candidate, specify its
performance comparison and acceptance rule prospectively; the existing application budgets remain.
The last application gate is still 15.2/69.4 ms desktop/CPU-4x Android typing against <16 ms, with
Android failing. F-17, physical-device capacity and immutable release qualification remain open.

## Recorded result

All 20 component cases pass through the owned runner with process drain; all eight mutations fail
the intended assertions. The full unit suite passes 97 files / 1,062 tests, and all 99 runner
self-tests, TypeScript, scoped style, inventory and authority checks pass. The first full unit run,
concurrent with other validation, timed out in two unchanged five-second tests: Account liveness and
position decisions. The same default command passed when run alone at unchanged limits. Preserve
that observation for loaded-host qualification; this does not establish the cause or close timing
headroom concerns. Both outputs are included in the
[evidence packet](./account-conformance-runs/2026-09-14-f17-handoff/README.md).

The reviewed general set now contains 261 files / 2,042 case dispositions, including the unchanged
11 explicit not-applicable dispositions. All 260 prior general contracts and exclusions are preserved.
The crypto census adds this one source while retaining every prior source hash, label and group.
There are still 96 command and 63 campaign obligations, plus immutable aggregate qualification.
All 52 personal/vector pins and L-2 remain unchanged.


## Private Local integration follow-through

The subsequent [Local integration checkpoint](./f17-local-handoff.md) connects this owner through an
explicit private constructor selection and passes reference/generated/native functional checks. It
repairs the publication-source counterexample found during integration. Default Local and Account
retain the reference path; performance comparison and activation decisions remain ahead. Earlier
statements above about the unconnected component describe that component's recorded checkpoint.
