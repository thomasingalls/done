# Phase 487 — compositionStatus reply hits the 1,048,576 accounted-byte guard

The directly bound private Worker observation identifies the original throw site.
The successful handler result is a reply with method `compositionStatus` and
`ok: true`. The bytes guard fires at **1,048,620 accounted bytes /
36,539 visited nodes**. These are running validator counts at the first
failed condition, not the full serialized reply size, network bytes or RAM.
The same captured Window error code is `message-bound`.

The previous successful snapshot had 2,130 spool positions,
2,169 capture summaries, and accepted position
2,130. The refused reply's authenticated delivery view
reports acceptedThrough 2,130. The fixture only needs
one accepted-position scalar, but calls an RPC returning the full growing delivery,
spool and capture graph. This is a refusal while serializing that successful status
result, rather than an exception raised inside the status operation.

The channel catches the reply-post refusal and sends its small negative reply.
The Window rejects that request with WorkerChannelError(message-bound); this
path does not itself close the channel. Window workspace state is active at catch,
and its target length is 2,167. Do not infer full archive/cold
exactness or prove future owner health: those checks were not reached. Worker
close during the failed test is retained separately; no earlier closure established.

No canonical app or test changes. One private workerChannel source copy adds
content-free observations only after each original bound condition becomes true;
predicates, throws and all other bytes inverse exactly. Logging failure cannot
replace the refusal. All125 ordinary shipping files remain exact; the test entry
binds to the current private sources, and its actual running Worker matches the
served observed identity before any additional writing. Six controls pass, including
both original ceiling refusals, valid payload equivalence and accessor preservation.
No profiler, guard/limit/deadline change, or acceptance/performance credit.

The first487 attempt used a private native entry still bound to phase 473 sources. It
reproduced message-bound but did not expose this observer. Preserve all its files
and host logs without guard-site credit. Correct only the private source-root
binding, add exact emitted/runtime Worker identity checks and run a fresh copy.
Both original five-second host/windowed-power records and all failed attempts
remain. Frozen phase 485 and 486 files are verified byte-identical.

The next bounded repair should make the fixture poll the existing bounded published
sync status, keeping every exact accepted-position assertion and deadline. That
repair is not implemented here. Do not raise a message cap or weaken verification.
The 3,072-position fixture/report and Stage 6remain incomplete; previous 36 blocking passes and
nine completed report-only journeys stay recorded. No commit, push or deployment.
