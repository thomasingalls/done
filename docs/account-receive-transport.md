# Owned v2 receive HTTP transport

**2026-10-12 update:** The composed receiver now groups up to four existing limit-one receipts
under one checked commit and authenticated readback, through previously observed backlog. Exact
v1 receipt bytes, per-entry verification, native bounds and the four-page publisher turn remain.
The bounded owned request set and sequential HTTP collection are described in the
[grouping checkpoint](./performance-experiments/2026-10-12-receive-groups/README.md).
The older phase narrative below describes the original singleton implementation.

Current exact byte formats and their authority limits are pinned in the
[group C transport contract](./account-crypto/transport.md). This document retains its phase context.

`openOwnedReceivingAccountWorkspace` now exposes private `receiveNext(operatorToken)`. One call reads
one page through `/account/delivery/read-v2` and waits for the existing ordered receive owner to verify,
commit, reauthenticate and publish it. The caller supplies no cursor, signing key, publisher, authority or
promotion callback. There is no automatic retry, reconnect loop, outbound sender, Account UI or deployment.
The admitted first epoch, creating publisher, generation 1 and v9 storage formats remain unchanged.

The held owner derives a limit-one signed request from authenticated durable receive progress. It uses
the admitted/pinned service origin and the private operator gate with redirects, ambient credentials and
caching disabled. The request's random nonce, thirty-second expiry and reader signature bind its full v2
scope. The existing service resolves membership and returns witnessed original envelopes/proofs.

The request and network response remain owned buffers. Fetch runs in the carrier task queue and ends
before the response enters the editor's input FIFO; awaiting receive from inside that task would deadlock
its eventual native commit. The response retains its exact request copy through the FIFO. A manual
`prepareRead` that supersedes that request causes refusal. Only one `receiveNext` flight may exist across
fetch, verification and ordered publication; overlapping calls return `busy` without signing or fetching.
The existing explicit signed-page surface remains available for private conformance.

The HTTP adapter caps streamed bytes at the editor's 4 MiB pending-input ceiling, independently of
Content-Length. The FIFO can still refuse when other input occupies its budget. This cap is narrower
than the service/page codec's 10 MiB ceiling; pages within the receiver's existing 512 KiB
envelope cap fit. Larger service-accepted envelopes still exceed this private receiver's supported
baseline and cannot be repaired by splitting a signed envelope. Wrong status/type,
redirects, incomplete declared lengths, overrun and network failure yield `unknown` without advancing
receive progress. A syntactically or cryptographically invalid page rejects through admission. Native
storage failures retain the existing blocked suffix semantics. None of these results is remote-content
acknowledgement; only the verified durable receive result supplies that evidence.

The shared HTTP adapter gives fetch and streaming a ten-second deadline and cancels bodies on refusal
or lifetime abort. It waits for stream cancellation to settle, including when a test stream delays its
cancel callback, before releasing its reader. A fetch that ignores abort must settle before the owner
can drain; it cannot return a late success. Close immediately invalidates admission and aborts the request,
then drains native work, transport buffers and stream cleanup before releasing the permit. Ciphertext
copies are detached and erased after use; this is not a forensic memory-zeroization guarantee.

Local journal admission remains available while HTTP waits. Native flush and other carrier tasks wait
behind that bounded fetch. When the page reaches the editor FIFO, earlier input runs first and later
local intents stay behind receive commit/publication. Fetch callbacks never apply updates or publish.
Remote originals do not become local source capsules. Closing after commit but before publication still
recovers through authenticated cold replay; retry signs from that actual durable position. A lost reply
has no receive effect and a later call creates a fresh nonce for the unchanged durable cursor.

`account:receive-transport` covers native HTTP, stream lifetime, ordered local input, superseded requests,
crash/cold retry, generated histories and effective source omissions. This phase does not establish
second-device enrollment, restore safety, general membership, lineage advancement, backlog scale or real
Account readiness. The review gates recorded in `progress.md` remain open. Next is bounded reconnect
scheduling, followed by explicit composition with outbound v9 delivery.
