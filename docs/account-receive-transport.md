# Owned v2 receive HTTP transport

**2026-10-15 compatibility repair:** session hosts without membership/history continuation retain
ordinary authenticated delivery without requesting the unsupported history-checkpoint endpoint.
Before signing a history request, the owner checks the live host hint and its authenticated state.
Installed/inherited history, later membership epochs or a later generation require history regardless
of a false public hint. Once required during that owner lifetime, a later hint cannot disable it.
An unavailable required history endpoint still withholds ordinary receiving; 404 is not an empty
catalog or permission to advance. Local writing retains its existing durable admission path.

**2026-10-12 update:** The composed receiver now groups up to four existing limit-one receipts
under one checked commit and authenticated readback, through previously observed backlog. Exact
v1 receipt bytes, per-entry verification, native bounds and the four-page publisher turn remain.
The bounded owned request set and commit path are described in the
[grouping checkpoint](./performance-experiments/2026-10-12-receive-groups/README.md).
The [prefetch follow-up](./performance-experiments/2026-10-12-receive-prefetch/README.md)
collects those exact replies with at most two simultaneous reads. It reserves full supported-page
space before each launch, keeping retained pages plus in-flight reservations within 4 MiB.
A page is capped at 1,057,280 bytes: two hex characters per byte of the existing 512 KiB envelope
and 4 KiB proof, plus 512 bytes of canonical framing allowance. This changes the HTTP allocation
ceiling, not the supported envelope/receipt format. Collection stops launching after 250 ms;
ordered verification/commit still follows. Missing/terminal replies cancel and drain speculative
tails, and their diagnostics cannot overwrite the attempted prefix. Self reads remain singleton.
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

## Optional enrollment-history transport grouping (2026-10-16)

`POST /account/delivery/read-v2-batch` carries one through four **unchanged** signed v2
one-position requests under the existing workspace grant. It grants no new read action. Each
inner read runs sequentially through the same `readInbound` owner, including its request signature,
current scope, authority and transaction-time authorization. Revocation or a refused subread returns
its existing refusal without exposing a partial group. Existing request-budget units are reserved
conservatively for four reads, including their inflight slots; process/session ceilings, replenishment
rates and the HTTP ten-second deadline stay unchanged. This route is available only with the scoped
session handler; the private development-bearer route is unchanged.

The closed binary request is ASCII `done/private-read-batch/v1` followed by a NUL byte, a big-endian
uint32 count, then count repetitions of a big-endian uint32 byte length and the exact signed request
bytes. Count is 1–4, each request is 1–4,096 bytes, and no trailing bytes are allowed. The response uses
ASCII `done/private-read-pages/v1` followed by NUL and the same count/length framing around the exact
signed v2 pages. Page bodies together are at most the existing 10 MiB page limit, plus the fixed
framing overhead. A size- or work-limited response may contain a nonempty prefix of the requested pages;
remaining positions require fresh requests. After 250 ms of completed read work, the service returns
that prefix without starting another subread. This is a cooperative work bound, not preemption of
a running cryptographic read; the original ten-second HTTP deadline still applies. The tags and
framing are not signed authority.

The enrollment snapshot source binds each returned page to its own captured request by array index
and invokes the original `verifyInboundPage` in order. One-position bounds, nonce/request binding,
request expiry, page/acceptance/publisher signatures, certified reader and publisher, generation and
historical route, prefix links and monotone observations, exact accepted cuts, actor/schema checks,
4096-event/64 MiB replay limits, lifetime guards and buffer erasure remain. A missing, reordered,
substituted or invalid inner page supplies no checkpoint and releases no content key. No persistent
verification cache, schema change or additional remembered factor is introduced.

Only a 404 from the optional route selects the original single-read transport. Its first exact
request is sent on the original route and still fully verified; later reads mint fresh requests.
The unsupported hint lasts only for that unlocked coordinator. Authorization, integrity, size,
timeout and other failures never authorize this fallback. Old clients continue using the original
route on new servers. Initial use is confined to additional-device replacement-snapshot replay;
ordinary receiving and other history-source callers retain their existing transport.
