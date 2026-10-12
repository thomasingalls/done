# Private authority handoff implementation and writer inventory

The signed design is `742e1c14`; runtime anchor `5c7ba18a`. This phase adds no record/wire format.

`finalApplyGate` owns non-reusable identity tokens and outstanding-task tracking. Every serialized
storage request invalidates before enqueueing. Its wrapper tracks `SessionTask.wait` promises, and
the storage tail retains its request until both the operation and tracked native work settle. A
successful full check can invoke one synchronous admission attempt; any escaped/reused authorization
callback fails. Actual verifier failures propagate. No task/transaction/key/inventory is lent to the
queue. The private check reads the complete inventory through the unchanged authenticator.

`accountCapture` supplies the gate only to its internal composition. Local source capture and
synchronous journal append still use the existing live owner. Suspension, route installation,
visibility/freeze/resume/pageshow, abort and authority memo invalidation revoke permission. Final
consumption checks live owner, suspension and the captured base/payload/custody record. Every new
owner gets a new gate; callbacks cannot revive a previous acquisition.

`admissionQueue` checks eligibility before paying for the early read and again at its synchronous
continuation. It reserves the pump before publishing, preserves the original frame order and grouped
projection publication, and then pumps reentrant commands in FIFO order. A scheduling miss gets one
normal queue-head check; no repeated speculative loop. A partial apply/close requires cold replay.
`VITE_ACCOUNT_IMMEDIATE_RECEIVE=0` selects the old final-check scheduling, keeping other changes.
The matched reference instead loads the four changed pre-existing runtime files from signed
`5c7ba18a`, so it also excludes the new gate/tracking overhead, not merely its fast application.

## Writer-call-site inventory

| Path | Authority/storage effects and fence |
|---|---|
| Capture initialization, first/joined | Runs before the owner is exposed; no prepared proposal exists. Both acquire the exclusive Web Lock and reload authority. |
| Capture carrier loads, append, flush, compaction, warm audit, list captures | All use `accountCapture.run`; request-time invalidation applies to reads and writes, success and failure. |
| Receive page/group commit, history install, own-stream reconciliation | All enter `runCaptureTask`; complete existing verification/commit/readback remains. Only ordinary prepared content uses immediate final display. |
| Successor and membership installation | `runCaptureTask` invalidates at request, before verification or writes. `installRoute` and explicit authority invalidation revoke again; captured authority must still match. Generation handoff suspends capture and closes. |
| History maintenance and reservation refresh | Entire owned operation enters `runCaptureTask`, including its cleanup/refresh `finally`. Changes to expected custody/payload invalidate explicitly. |
| Device removal/recovery transitions | Owned storage entry invalidates before work; synchronous capture suspension precedes the handoff and custody changes. No fast-path adoption. |
| Envelope preparation and delivery responses | Composed `run` is `runCaptureTask`; `accountDelivery.withState/withSelection` and `accountEnvelopePreparation` perform durable effects there. Network replies reenter it. |
| Network-only work | Signing, transport waits, speculative page collection and untrusted discovery/history responses use `runNetworkTask`; custody/context adoption reenters the owned storage methods above. Scheduling fields such as discovery flight/due and history due are not authority. |
| Login/session storage | Separate network access lifecycle; no local custody replacement through this permission. Transport validity checks remain separate. |
| Local edit/undo/redo | Synchronous journal acknowledgment precedes canonical mutation, as before. It does not invalidate custody authority; busy/blocked/forced input still prevents immediate remote application. |

Native database helpers retain their existing cancellation semantics. The gate waits for tracked
native promises; it cannot observe a caller bypassing the owner or a raw operation deliberately
started outside `SessionTask.wait`. Existing abandoned read-only opens close late handles and cannot
authorize application. Arbitrary post-read direct IndexedDB writes remain outside the exclusive-writer
contract, as recorded in the design; the native controls distinguish pre-read corruption from owned
post-read mutation.

## Focused checks

- Five focused Vitest files: 292 passed, one existing skipped test. This includes the new gate and
  synchronous queue controls plus existing authority, admission, workspace/undo and owned-receive tests.
- Seven native Chromium prepared-receive cases pass: held commit and held early-check boundary, local journal
  editing/undo/redo, live projection, crash/cold replay, changed custody before final read, and owned
  read/clear tasks requested after that read (one fallback; clear refuses).
- TypeScript, changed-source lint, ordinary build, bundle budget and origin isolation pass.
- No generalized conformance or release campaign. Physical account comparison remains pending.
