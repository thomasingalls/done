# Owned v2 receive HTTP transport

**2026-10-21 ordinary catch-up:** the normal receiver now uses the optional batch route for its
existing owned set of two through four limit-one requests, preserving exact original durable
receipts and every per-entry verifier. The [current collector contract](./account-receive.md)
defines its aggregate byte reservation, drained fallback, deadline and unchanged turn limits.
The enrollment-only scope below records the route's initial introduction. Enrollment's fallback
policy remains unchanged; the ordinary collector additionally permits bounded individual work
after a successful binary aggregate exceeds its 4 MiB HTTP ceiling. Neither transport observation
grants authority or progress. [Evidence](./performance-experiments/2026-10-21-ordinary-receive-batching/README.md).

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

### Sequential read-batch authority reuse — 2026-10-16

The batch owner may reuse a fully verified historical workspace-authority result across its
sequential inner reads. Each read still obtains a fresh native snapshot. Exact equality covers
the service pin and every snapshot header field, including witnesses, all membership/removal/
recovery artifacts, publisher identity and unknown future header fields. Only decision rows are
excluded: they are not inputs to `WorkspaceAuthoritySnapshot` verification and retain their
independent ledger/served-row checks. A changed header or verifier performs full verification.

The runtime-branded owner is created for one `readInboundBatch` and closed in its `finally`.
It holds at most one context/result, retains no context exceeding 2 MiB of serialized bytes, rejects
overlapping use, and fences close or input changes during verification and native checks. A failed
verification/check leaves no entry. Oversized contexts take the complete reference path. The bound
is on the retained context bytes, not the total derived authority graph or process heap.
Process-local V8 serialization preserves non-JSON values; unsupported inputs take the full
reference path. These bytes are never persisted or exchanged between processes. No result
is persisted, shared across HTTP batches or retained by the core after the batch. Mutable result
fields are detached; already immutable, runtime-branded membership/history values retain identity.

Every reuse repeats all native `issuer.check` operations observed during full verification, using
that read's issuer. Per-request reader resolution, request signatures/scope/expiry, ledger census,
served proof checks, fresh transaction-time unchanged comparison, session/grant authorization,
fixed-purpose signing and far-side custody/expiry checks remain. Historical authority verification
has no current-clock input; live request, custody and grant checks cannot be memoized. The four-read,
250 ms completed-work, byte, inflight and HTTP deadline bounds are unchanged. This reuses evidence
for byte-identical inputs; it grants no reader status, key access or ability to issue a page.

### Precise sequential-batch admission accounting — 2026-10-16

This supersedes the earlier conservative reservation of four rate and concurrency units for every
batch. One admitted HTTP request now holds one session/process concurrency slot and costs at least
one work unit before reading its bounded body. After exact framing, reserve all remaining **actual
requested** inner-read units atomically, before starting any inner read. Insufficient additional work
refuses before native execution and spends only the initial admission unit. Malformed bodies still
spend admission; rejected credentials cannot select another session's budget.

Each sequential native read that starts remains charged, including a failed/refused read or a read
whose page is discarded at the response-size cut. Only reserved reads never started are refunded at
settlement. Unused-refund and release are idempotent, burst-capped, and cannot enlarge a closed ticket.
Numeric session/process burst and refill limits, invalid-bearer allowance, total live-request ceilings,
maximum four sequential reads, body/page bounds and deadlines remain unchanged. At most one native
inner read runs per live batch; there is no concurrent four-read fan-out. The existing live-request
ceilings and per-request byte bounds still apply across single and batched routes.

Admission/accounting supplies no membership, grant, signature or commit authority. Every original
per-read check remains. Full four-read batches still debit four rate units; faster execution does not
silently waive their sustained budget. Later measured work selects any rate-policy or page-density
change separately, with concurrent writing and aggregate resource checks.

### Bounded history-load retries for a raced snapshot — 2026-10-16

Additional-device reconstruction may repeat a read after the existing adapter consumes an exact,
size-bounded `409` JSON `unknown/state-changed` hint. That unsigned hint schedules work only; it is
never a page, a progress observation, an accepted cut or membership authority. Every returned page
still passes the full transient history verifier. The service's four-attempt fresh-snapshot guard,
transaction-time authorization, signing/custody checks, corruption handling and numeric rates remain.

One `advanceMembershipConnection` load owns four extra transport attempts shared across all its
history requests, with one logical read active at a time. A logical request captures independent bytes
before awaiting and sends a new detached copy of those exact bytes on each attempt, retaining nonce,
signature, expiry and cut. A 200 ms abortable delay precedes each repeat. The existing ten-second
private-delivery deadline also bounds the entire logical request including repeats/delays; it does
not restart with the retry. Existing authorization/capacity transport behavior remains subordinate
to that signal. Every dispatched HTTP request still passes normal service admission and authorization.

Only the read-v2 diagnostic from that invocation's closed response parser can request a repeat, and
only when no byte reply was returned. Submissions, v1 reads, other refusals, malformed or oversized
hints, network loss, bad signatures, invalid/expired requests, authority changes and throttling do not
select this retry. Cancelling or timing out prevents later dispatch and withholds/erases a late reply;
the existing transport cancellation-drain behavior remains. Exhaustion returns the existing saved-load
failure instead of looping indefinitely. A later saved-operation retry receives a new bounded owner.

Optional-route 404 fallback remains separate from state-change handling. It decodes the exact captured
batch request, sends that first signed inner request, and shares the same retry budget and logical
request signal. Only 404 disables batching for the coordinator. Retrying changes no factor, key,
schema, durable progress, accepted position, source inventory or checkpoint. See the bounded repair
and its independent concurrency result in the enrollment-throughput evidence map.


### Publisher-local snapshot race invalidation — 2026-10-21

A failed fresh fingerprint comparison rejects that capture and discards the preliminary tip and
queued audit for its account/publisher key. An unrelated publisher's capture may remain eligible,
but must still pass its own fresh transaction-time snapshot, row-count and served-row comparison.
This changes no reader, publisher, membership, signature, expiry, grant, custody or signing authority.

The process-local identity map holds at most 128 publisher keys with LRU eviction, separately from
the existing 128-tip/16 MiB prefix limits. Each identity is a unique object: invalidation, eviction
or deletion/recreation cannot revive an earlier capture, delayed remember or active audit result.
Unverified preliminary captures occupy the same bounded identity map and confer no membership or
progress. An obsolete audit completion is discarded; an unrelated queued audit remains eligible.

Unknown external SQLite changes detected through data_version, explicit verifier clears, closure
and applicable audit failures still invalidate all owners, tips and queued work through the global
revision fence. Integrity quarantine is retained across clears; stale audit results cannot restore
a prefix or establish an audit count. No persisted or wire-format change, numeric rate increase,
retry increase, deadline relaxation or reduction in verification is authorized by this optimization.
Same-publisher contention and aggregate capacity remain separate measured acceptance conditions.


### Known native append markers — 2026-10-21

After the delivery owner actually commits a newly proposed, fully verified decision, it may replace
a private commit marker for that publisher. A capture retains the marker it observed. A later
marker makes that capture and its delayed memo installation obsolete; it never authorizes the
capture or supplies accepted progress. The strict read/write snapshot guard still rejects it and
uses the same four-attempt retry limit. No-proposed outcomes, historical retries and rollback do
not announce a native append. The notification is synchronous after COMMIT and before external hooks;
a notification inside a transaction or for an unowned/obsolete capture is inert.

The authenticated prefix preceding that known append may remain. Its count, commitment, accepted
cut, link and witness are not advanced by the marker. A new capture must authenticate the appended
rows and current witness through the original census, current authority and served-row verification,
then pass its own fresh transaction-time comparison and live custody/grant/signature/expiry checks.
Unknown fingerprint changes, external data_version, clear/close, eviction/recreation and quarantine
retain their original fences. The documented off-path corruption detection window remains; this
mechanism must not claim to re-examine unserved old rows on every request.

Capture commit markers are separate from publisher audit ownership. Known appends do not obsolete
an independently completed audit or suppress its corruption quarantine. The existing128-key owner
and128-tip/16 MiB bounds remain; markers are unique process-local objects held only by current owners
and weakly held captures. No persistent/wire format, extra retry, rate/concurrency/work/body/deadline
change, new queue or shared authority result is introduced. Cold concurrent verification and queued
write bursts remain separate measured acceptance conditions.
