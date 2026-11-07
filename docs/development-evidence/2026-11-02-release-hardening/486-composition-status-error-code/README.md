# Phase 486 — compositionStatus rejects with message-bound

The fresh reproduction captures the exact error before Playwright discards custom
properties: **WorkerChannelError.code = message-bound**. It fails after the same76
confirmed additional positions, last2,130. Call273 rejects; call272 had accepted
2,130,2,130spool positions,2,169capture summaries and2,170capture sources.
At the catch point the Window workspace remains active, send is working and
receive is idle. The Worker close event appears7mslater during failed-test cleanup;
this does not establish an earlier owner closure. No writing-loss claim follows.

Existing485stack column4028 maps to rejection of a validated negative RPC reply
whose supplied code becomes WorkerChannelError.code. A literal source search
finds the compositionStatusclient and handler definitions, no app/UIcall site;
this is a limited static census, not proof against computed/external calls.
The handler requests full delivery, spool and capture summaries, while the fixture
reads one accepted-position scalar. The exact node/byte guard and whether it fires
at reply serialization or inside the operation still need direct observation.

Only the private test facade is wrapped: same this/arguments/result and original
error identity rethrown. Capture content-free scalar counts and error properties;
passively log Worker lifecycle and page errors. The original485recipe inverses
byte-exactly after removing these observations. Same fresh input fixture,125plain
ordinary plus42native assets, API, input, assertions and deadlines; no app changes.

Six controls pass, including canonical node/byte ceiling negative replies followed
by a successful ping on the same channel. This proves such a refusal need not
close a channel; it is not proof of this owner's subsequent lifecycle. An initial
control syntax failure and strip-only TypeScript parameter-property failure are
retained; corrected controls pass. No old tests changed or guard weakened.

Preserve all logs and profiles privately, with five-second external host/windowed
power records. This diagnostic gains no acceptance credit. Next pinpoint the two
unchanged message-bound throw sites with private scalar observation only, then
report. No repair, further Stage5journey, commit, push or deployment.
