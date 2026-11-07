# Source ownership map and next bounded choice

This is a proposal informed by the phase162 observations, not an implemented thread migration or a proved explanation of the operator's full production regression.

| Work | Current evidence | Candidate ownership / required bridge |
| --- | --- | --- |
| Goals input, caret/selection, live-preview DOM, viewport and rendering | Ordinary CodeMirror/React work; sampled editor/Yjs work is present but smaller than account verification work in the desktop diagnostic | Page retains interactive editor; bound remote projection/render work per turn. |
| Native account reads, private verified ledger, exact comparisons, detached projections and erased predecessor graphs | Main-thread stacks through contentStore/accountCapture/accountReceive.validate, verifiedRecords.sameRecords/read/select/verify and verificationOwnership.eraseUnretained | Keep the complete private account owner together in a worker. Do not serialize an entire ledger on the page for each helper call or export live lease/proof objects across the boundary. |
| Publication fresh-load/proposed-transition verification | accountDelivery.persist/beforeCommit invokes fresh carrier.load then accountReceive.verifyProposed, whose verified.read(rows) compares and clones the whole verified view | Candidate first boundary for an isolated worker feasibility slice, including queue serialization, crypto context and cleanup. Fresh load, authority/witness and final commit checks remain; no cached-success substitution. A smaller projection alone is a separate optimization to justify. |
| Retention preparation, baseline construction, installation/readback | Same account storage/lifetime owner, cooperative checkpoints plus indivisible work | Follow account owner off the page; keep input-priority/cancel points and explicit progress. A worker queue can still delay writing if maintenance monopolizes it. |
| Accepted local journal | TRD synchronous encrypted localStorage acknowledgment precedes canonical promotion | Keep a small page journal bridge initially, or design a separate explicit accepted/pending acknowledgment protocol before moving this responsibility. No silent weakening of crash/interruption guarantees. |
| Passkey prompts, page visibility/input activity, lock/removal/UI lifecycle | Browser/page-bound entry points and current DOM listeners | Explicit bridge carrying owner incarnation/revision and cancellation; stale worker replies cannot resurrect a locked, replaced or removed workspace. No remember-me change. |

## Independently progressing catch-up stages

The operator's agreed objective is that a fetched group must not finish verification and display before the next network group can begin. Keep three separately bounded progress markers: downloaded/staged, verified and durably admitted, and presented. The current receiveNext single flight spans fetch, verification, admission and promotion; prepareRead binds requests to the current authenticated cursor and keeps one outstanding group. Thus queue separation requires an explicit download target/request-context owner, not only moving fetchPage above an await.

A subsequent contract should specify a finite target for each publisher, byte/item limits and backpressure, encrypted temporary staging and removal cleanup, cancellation/resume,30s request expiry and renewed authority, ordering/conflict/revocation/rotation behavior, fairness with input/other publishers, and coalesced presentation preserving local Undo and original attribution. Downloaded bytes cannot grant acceptance or advance the verified cursor. Retain existing16ms/2.5s/all-marker/30s/native guards for a later implementation; this diagnostic changes none and earns no peer/acceptance credit.

## Next bounded choice

First localize the worst sustained-input/idle stalls more precisely within the account-owner chain, using the recorded source-map profile and a discriminating control rather than a fresh broad baseline. The first proposed worker feasibility slice should prove that this owner can initialize, verify a stored fixture, accept a bounded command, cancel/erase on lock and cold reopen with identical writing, while the page remains responsive. Determine the journal acknowledgment bridge and compatibility before implementing a full worker-owned runtime or bulk staging format. No product guarantee change is selected.
