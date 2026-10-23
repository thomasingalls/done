# Inbound byte formats and first-epoch verification

This implements the byte/verifier boundary following [inbound preparation](./account-inbound.md).
It does not activate v9, write receive progress, expose a service route, or apply content to an editor.
The existing v1 readback, v8 sender and Local formats remain unchanged.

## Closed carriers

`account-protocol/inboundTransport.ts` implements the selected v2 request/page arrays, with separate
reader and publisher IDs and signatures over the exact unsigned arrays. It uses the existing 4096-byte
request, 10 MiB page and eight-entry codec bounds. Decoders reject unknown domains/versions, extra or
missing fields, invalid UTF-8/BOM, noncanonical JSON/hex, unsafe or negative integers, negative zero,
malformed lengths, invalid origins and unsupported entry shapes. V1 decoders reject these v2 domains.
These codecs perform no signing, membership lookup or transport.

`src/crdt/inboundRecord.ts` implements the proposed encrypted-heads plaintext array, preserving exact
signed request/page bytes. Nested page/envelope/proof subjects must agree with its outer routing,
position and resulting link. Syntax validation is not authentication: a syntactically valid replacement
baseline or predecessor is still refused by the verifier. The record stays within 4 MiB, with one page
entry and at most 512 KiB envelope wire. A decoded record owns detached byte arrays.

## Independently held verification context

`verifyInboundPage(context, outstandingRequest, response, lifetime)` requires a context supplied by a
future authenticated owner. It contains the admitted genesis baseline ID, service/origin pin, held
lineage/head/acceptance key, active reader and creating-publisher keys, publisher principal/system actor
bindings, generation opener, and independently derived received prefix and retained advertised mark.
It accepts only promotion genesis, epoch 1, generation 1 and the named creating publisher. A context
parameter does not prove its own certification or semantic baseline. The current runtime does not yet
construct this context; synthetic tests deliberately supply it independently of responses.

The outstanding request must be the owner's actual captured request. The function checks its scope and
reader signature, exact response request hash, acceptance-key page signature, live expiry at start and
completion, count/extent, and retained advertised floor. The first verifier allows only `limit=1`.
For each entry it checks exact route/sequence, reconstructs acceptance from the held predecessor, then
opens the member-signed v2 envelope and checks the decrypted actor and original Yjs framing. Pending
Yjs dependencies are allowed; this primitive does not claim that the update has materialized.

A new entry must follow the held prefix. An old position requires the independently retained original
envelope/proof and its predecessor, not an arbitrary old link selected by this response. The verifier
rechecks that original acceptance, envelope, actor and bounds, and binds the original link to the held
tip when it is the tip entry. Older history still requires the owner's authenticated prefix reconstruction.
Exact duplicates yield no new record or updates. A different proved accepted digest yields a conflict
record and no plaintext updates; both evidences must be retained by the future owner. A changed wire with
the same accepted ciphertext digest is refused, not treated as proof of another accepted digest.

Results are frozen detached descriptions: `empty`, `duplicate`, `received` or `conflict`. Received returns
the canonical record, original update copies, actor, position/link and advertised mark. It never returns a
new credential, seal grant or writable cursor. Unsupported scopes, invalid evidence and malformed input
reject; the future owner maps those errors to bounded receive status. Empty/duplicate results contribute
no new durable high-water knowledge. Re-fetch from the current durable position before claiming progress.

The verifier enforces at most 255 updates and 512 KiB decoded update bytes, plus the actual 256-record/
4 MiB local batch bounds. Each future raw update record and the one evidence record must fit together.
This rejects a legal 256-update network envelope that would require 257 local records. No truncation,
partial position advance or remint is authorized by an oversized result.

## Stored replay and lifetime

`verifyStoredInbound(contextBeforeEvent, record, lifetime)` re-verifies the original request/page,
envelope, acceptance and actor, then recomputes the entire record from held context and original bytes.
Every outer byte must match. It skips the old request's wall-clock expiry, because committed evidence
must remain usable offline. It does not bypass any signature or scope check. A received event must be
replayed against its pre-event prefix; an already-included event is not silently treated as a new record.
The function verifies one event, not the completeness of an event census, native record AEAD, genesis
semantics or coverage of content records. Those checks belong to the next persistence owner.

All request/page/key/retained-record inputs and context fields are captured before async crypto. The
operation binds the original lifetime assertion and clock callback once, so replacing callback properties
cannot bypass revocation or expiry. The assertion must be synchronous. Nested crypto invocations check
the owner; results are withheld after close, including an empty or duplicate result and the last decrypt
completion. Owned generation-key copies are erased on settlement. Rejected/conflicting/duplicate decoded
updates are erased; successful update copies transfer to the caller for erasure after use.

One directed test exposed and fixed a first implementation defect: the function originally looked up
`lifetime.assertCurrent` repeatedly, allowing callback replacement during crypto to bypass closure. Its
failing execution is retained alongside the passing regression. Guard-removal controls separately show
that the final post-decrypt check is necessary.

## Evidence and next boundary

The campaign compares exact bytes with the earlier independent Node/OpenSSL fixtures. Generated signed
updates are checked against their authored Yjs bytes and independently framed events, including stored
reverification and independently re-signed forbidden actors. Random wire changes must fail authentication.
Actual compiled-source mutations remove page signature, request binding, prefix proof, actor, stored
record binding, batch-count, input-copy and final-close checks; each has a positive prohibited outcome.
The control bundles contain independent Yjs module instances and emit its duplicate-import warning;
only raw byte arrays cross these bundle boundaries, not Yjs documents or constructor-checked values.

These are codec/crypto/lifetime tests, not a native receipt or enrollment campaign. No browser or service
is started and no prior async Playwright wait is credited. Next is v9 activation and atomic content/event/
witness storage under the factor-owned permit, with complete stored-wire replay, content coverage,
old-reader refusal and native abort/crash/lost-ack tests. Editor promotion, v2 service reader/publisher
resolution and real two-gate enrollment follow their own checkpoints. No whole-protocol debt is paid.

## 2026-10-12 — Yielding reference maintenance

The [foreground-stall repair](./performance-experiments/2026-10-12-foreground-stall/README.md)
keeps full independent reference coverage and its existing row/state trigger. During interruptible
compaction, the same receipt census, historical receive checks and self-original coverage use the
maintenance task's budget boundaries. No native transaction is suspended to admit another job.

The fully authenticated incremental result is installed before this diagnostic comparison. If
foreground work interrupts the reference audit, that result remains usable only under its exact
record/owner binding. The audit remains due and is retried at the next maintenance opportunity;
it is not marked complete or transferred onto the next keystroke. Reference work starts over on
the then-current snapshot, using independent coverage. Continuous activity can postpone completion
until a sufficiently quiet maintenance window; closing/reopening still requires full verification.

Only `MaintenanceInterrupted` after successful validation preserves this verified view. Other
errors, mismatches and owner/authority invalidation clear it and retain the existing refusal path.
The carrier may retain its prior detached plaintext cache after interruption, but every reuse still
checks the authenticated counter and exact sealed row bytes. Partial reference results cannot
publish, grant authority, delete rows or advance durable cursors.

## 2026-10-12 — Received-history cold coverage

The [received-open repair](./performance-experiments/2026-10-12-received-open/README.md) keeps one
private coverage document per cold receipt pass instead of rebuilding it per receipt. It is disposed
on success, refusal or cancellation. It does not transfer a verified view across startup owners.

A pinned-Yjs positive proof may avoid fork/apply/comparison for a canonical V1 update when the current
document has no pending state. It checks full struct clock ranges, resolvable origin/right-origin/
parent dependencies, safe string-splitting boundaries and already-deleted intervals. A clock-vector
subset alone is not sufficient: even already-known structs run Yjs dependency resolution. Duplicate
delete-set client sections, unusual encodings, pending data and uncertain cases use the reference
algorithm. No negative conclusion is cached. Existing exact-byte positive cache bounds remain.

`VITE_ACCOUNT_DIRECT_COVERAGE=0` disables the positive proof. The standalone reference checker and
isolated periodic audit remain fork/apply/full-state oracles independently of this switch. Cold replay
still checks native record authentication, completeness, original signed receipts, authority and
lifetime. Request/page/receipt decoders omit redundant re-serialization only after validating their
unchanged canonical input, field, extent and size rules; no stored bytes or format fences change.

## 2026-10-16 — Transient multi-entry accepted-history pages

`verifyHistoryPage` authenticates the existing v2 request/page framing for up to eight entries when
reconstructing an independently authenticated history source. It returns transient updates, count,
position, link and observed tip only; it produces no durable receipt. The ordinary `verifyInboundPage`,
`verifyStoredInbound` and encrypted inbound-record codec retain their single-entry contract and exact
stored format. Shared scope, wire authentication and accepted-entry checks serve both readers.

The caller supplies the exact outstanding signed request, held custody/history and exact cut. Each
entry independently verifies publisher/position/generation routing, accepted-link/previous proof,
envelope signature, authenticated decryption, actor, update count/size and Yjs bytes. Request binding,
reader/page signatures, monotone observations, history boundaries, captured opener keys, expiry and
synchronous lifetime checks remain. A wrong first/middle/last entry or a wrong final cut refuses the
entire page. No updates or progress transfer until the whole page verifies. Failed pages erase all
already opened updates and copied keys; successful update ownership transfers to the source reader.

`readHistorySource` requests at most eight entries through the independently signed cut and remaining
event allowance, one adaptive page at a time. A valid short page advances only to its verified actual
position; the next request starts there, never at a guessed stride. The optional batch carrier contains
one request and retains its older-server fallback. Replay event/byte bounds, unresolved-dependency and
actor checks, local/journal reconstruction, snapshot/key delivery, saved retry and installation/
certification ownership remain. Progress counts verified entries rather than wire pages. No storage,
service route, cryptographic domain, primitive, factor or numeric rate-limit change follows.
