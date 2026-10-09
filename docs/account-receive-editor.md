# Ordered remote Account editor integration

The private `openOwnedReceivingAccountWorkspace` factory composes the admitted editor with the
[native v9 receive store](./account-receive.md). It holds one actual factor/passkey-owned slot permit.
Local source capture, receive commits, flush and compaction use that same carrier task queue. No new
persisted format, service route, sender, membership, default app or personal Account is activated.

The supported baseline remains the admitted first-epoch genesis, creating publisher and generation 1.
The separate storage-only factory remains available for conformance. Neither public factory accepts a
caller-provided verifier, generation key, publisher context, cursor setter or promotion capability.

## Ordering and publication

`receivePage` copies its input into the editor's bounded input FIFO. The queue reserves the wire's bytes
before dispatch (4 MiB total pending input, 256 items); this is deliberately narrower than the low-level
10 MiB page-codec ceiling. Verification's transient decoded buffers also remain bounded by the existing
one-envelope/native-batch limits. The same page is copied by the storage owner before its crypto awaits.
Transport must split large backlogs into permitted pages; a queue-full result creates no native effects.

An internal admission hook holds the queue head while the owning receiver checks its actual outstanding
signed request, held authority, original member/service signatures, actor binding and durable prefix. The
receiver commits original content frames plus receive event plus witness together, then reauthenticates
storage. Only that path calls the internal synchronous promotion callback, still inside its lifetime task.
It supplies the original frames in their original order. No application receipt is reused as authority.

Each frame passes through canonical Yjs application, writer-clock collision handling and the existing
projection check before publication. Local intents arriving meanwhile stay unprepared behind the remote
job. Reentrant input from a publication observer also waits. The queue does not complete the page promise
until its ordered publication finishes. Remote updates never pass through source capture, human undo
capture or the workspace's local outgoing callback. The raw `workspace.receive` entry refuses input.

A durably received position does not mean the text is visible: pending structs/deletions can wait for a
later committed dependency. Ordinary local actions use the recoverable canonical state and its pending
information. Source-free startup/commands advance their history/selection transition without allocating
a source capsule; preparation must prove that an empty source list covers the whole unchanged draft.
This is not state-vector-based filtering. Real deletion updates are captured. Older v6/v7/v8 factories
retain their historical empty-source behavior, and already-persisted empty sources remain valid.

## Refusal, pressure and closure

Invalid pages reject their input ticket without blocking unrelated local editing. Authenticated accepted
conflicts retain their evidence, stop that receive stream and publish no conflicting content; local
editing remains available, including after cold open. Storage failures block the ordered suffix for retry
or explicit discard. No later local or remote job bypasses that suffix. Discard erases unaccepted input,
not already committed receive evidence.

After a successful receive commit, failure during readback or publication requests lifetime closure;
editing cannot continue by discarding a now-durable dependency. Closing disables admission immediately,
rejects queued tickets, drains current native work and clears the held keys before releasing the permit.
The owned plaintext buffers are erased in the receiver's finally path even when closure wins after
crypto or during an observer callback. No forensic memory-zeroization guarantee is made.

If the renderer dies after commit and before publication, cold replay authenticates the whole receive
event census and reconstructs the original updates directly as content. It does not create source capsules
or fresh envelopes. Compaction waits for editor admission and runs the existing exact content-coverage
checks, preserving pending originals and all metadata evidence. No background maintenance scheduler is
introduced here.

## Evidence and limits

`account:receive-editor` runs the controlled admission/property tests and the disposable native campaign.
The native fixture uses actual admitted synthetic Account custody and creating credentials; authored
remote frames and Node/OpenSSL page/acceptance framing test the editor boundary independently of its
storage helper. This is not enrollment or safe credential-clone evidence. Directed cases cover original
publication, raw-receive refusal, source-free reopen, undo, native before/after commit crash, pressure,
competing permits during close, callback closure, pending dependencies, conflict and compaction. Generated
histories compare authored text, durable position and local source counts. Effective source mutations
expose early promotion after an aborted native commit and recapture of remote input as a local source.

The broader review packet remains an uncommitted assessment. In particular the existing AAD-vector gate
and four older source-snapshot harnesses still need their own repair; passing this phase does not imply a
passing aggregate `pnpm check`. Protocol/vector alignment, service activation assertion, checkpoint size
bounds, power-loss invocation accounting and backlog performance remain explicit follow-up work.

Next: restore the aggregate validation baseline, then the v2 service reader/publisher resolver and owned
receive transport/reconnect before real enrollment and second-device adoption. No private v1 route gains
v2 semantics implicitly. The existing v8 sender is not silently enabled on a v9 marker.
