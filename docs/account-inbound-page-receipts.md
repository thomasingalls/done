# Inbound page receipts — version 1 contract

**Status: Operator approved Stage 3.2 on 2026-11-03, with writing on in this release.
Not yet implemented or validated.** This is the approved storage contract, not a
statement that the current app supports it. RANGE_RECEIVE remains off in ordinary builds. The
[hardening scope](release-hardening-2026-11-02.md) and
[Stage 2 checkpoint](development-evidence/2026-11-02-release-hardening/366-stage2-closed/README.md)
remain governing context. No server endpoint, signed network frame, trust rule,
limit, gate or deadline changes are proposed.

## Operator decision

On 2026-11-03 the operator approved this contract and all of Stage 3.2, selecting
writing on in this release. Harden one self-contained binary receipt per committed
contiguous extent of one original signed page, with the authenticated monotonic
local compatibility floor. Readers remain independent of the writer flag.

Build a writer-off image of the same hardened tree as the rollback target. Prove
that it opens a profile holding dense rows, including from a stale tab; retain
native ownership fences and exact writing/Undo. Record both source/image
identities. Stage 6 must state plainly that rolling back to any build before this
release locks out devices that wrote dense rows. This approval authorizes
hardening and the selected release profile, not publication or deployment.

The reader-first/deferred alternatives below remain documented alternatives, not
the selected release order. No gate, check, budget, limit or deadline changed.

## Binary schema and bounds

One encrypted `heads` payload contains the following bytes, in exactly this order.
The carrier encryption, associated data, physical sequence allocation, reservation
rules and completeness witness remain unchanged. This is a plaintext payload
schema inside that existing encryption, not a new cryptographic construction.

All integers are unsigned, big-endian. The u64 value must fit an existing positive
JavaScript safe integer (1 through 2^53−1). There are no optional fields, padding,
trailing bytes, references or alternative encodings. Fixed identifiers are raw
bytes, with the same identities as the existing receipt fields.

| Field | Offset | Bytes | Constraint |
| --- | ---: | ---: | --- |
| magic | 0 | 29 | ASCII `done/account-inbound/page/v1` followed by one NUL byte |
| baseline | 29 | 32 | exact independently selected baseline ID |
| lineage | 61 | 32 | original request lineage |
| head | 93 | 32 | original request authority head |
| reader | 125 | 16 | original request reader |
| publisher | 141 | 16 | original request publisher |
| firstPosition | 157 | 8 | first admitted logical position |
| previous | 165 | 32 | acceptance link immediately before firstPosition |
| lastLink | 197 | 32 | acceptance link at the last admitted position |
| firstEntry | 229 | 1 | zero-based offset into the original page |
| entryCount | 230 | 1 | admitted contiguous extent, 1–8 entries |
| requestLength | 231 | 4 | 1–4,096 bytes |
| pageLength | 235 | 4 | positive and bounded below |
| original request | 239 | requestLength | exact original signed request bytes |
| original page | 239 + requestLength | pageLength | exact original signed page bytes |

Total size is `239 + requestLength + pageLength`, at most the existing
INBOUND_RECORD_LIMIT / MAX_BATCH_BYTES (4,194,304 bytes). Page bytes must also meet
the existing READ_PAGE_LIMIT (10 MiB); the smaller remaining receipt capacity
therefore wins. Validate lengths and checked arithmetic before slicing or
expanding. Keep the existing per-envelope, proof, update, native batch and record
count limits. An entry that cannot fit still refuses or takes the existing
narrower-read fallback; no limit is raised.

Decode and check the original canonical request/page framing and extent. Require:

- `firstPosition = request.after + firstEntry + 1`, with safe arithmetic;
- `0 <= firstEntry < page.entries.length <= request.limit <= 8`;
- `firstEntry + entryCount <= page.entries.length`;
- matching lineage, head, reader and publisher, and a received result for every
  admitted entry. Dense conflict, duplicate and empty receipts are invalid;
- the first previous link and final link equal the independently verified chain.

The stored extent never authorizes the page's other entries. The original page
remains whole because its signature covers its exact bytes. If interruption or a
native limit splits admission, each committed extent is self-contained; later
extents can repeat the same request/page. Count that duplication. There is no
page registry, persistent alias, hash lookup or garbage collection dependency.
Do not rewrite original signed frames into a purported narrower signed page.

## One classifier and logical views

`src/crdt/inboundRecord.ts` is the tag/schema home. Its bounded classifier must
recognize binary receipts before any JSON parse, and continue to recognize the
closed legacy v1/v2 receipts. Unknown inbound versions and malformed known
versions must refuse; neither may fall through as delivery or another row kind.
Decoding classifies syntax, never establishes authority or verification trust.

One physical receipt exposes ordered logical views. Each view identifies the
physical sequence, entry index, actual publisher position and exact original
bytes. Do not encode a synthetic v2 receipt per view. Use physical sequence plus
entry index in memo keys; a physical sequence alone is not unique. Epoch comes
from the original request, never a positional JSON field that happens to contain
the reader ID. Read/commit cursors advance only through verified admitted views.

| Direct reader/home | Required change |
| --- | --- |
| inboundRecord.ts | closed classifier, binary codec, selected logical view and legacy compatibility |
| accountInbound.ts | live/stored verification, received-only dense output, exact tuples and per-entry checks |
| inboundLedger.ts | full census, epoch ordering, every admitted view, coverage and correctly indexed retained envelope/proof |
| incrementalAccountLedger.ts | full and append census, epoch/self classification, bounded logical indexes and identical continuation result |
| accountMembership.ts | shared classification before epoch extraction; no v[5] fallthrough |
| accountSuccessor.ts | shared classification and actual request epoch through successor replay |
| handoffHistory.ts | logical order, covered prefix, suffix and cuts inside a page |
| membershipReading.ts | logical event bound, versioned retained streams and replay |
| replacementSource.ts | stored logical suffix append with the original accepted cut |
| localRetentionPlan.ts | classify the physical row once and account for every logical view before exhaustive disposition |

Also review the indirect consumers: promotion/joined custody, retained reading
parsers/builders, localBaselineReplay/Record/Shadow, preparation journals, receive
coverage, handoff serialization, Worker composition and export/cold recovery.
They must not assume one receipt equals one position or parse heads as JSON
before classification. This table is a required census, not permission to ignore
an additional reader discovered while implementing.

## Live, stored and owned-page verification

Stored mode is private and derived only from captured saved-byte arguments in
`verifyStoredInbound`; live entry points cannot select it from a network field,
RPC boolean, parser result, cursor or hint. Saved bytes remain untrusted.
Historical request expiry is not an event lifetime, but all original signature,
canonical-byte, scope, chain, witness, authorization, coverage and current
owner/commit checks still run. Review every old expectedRecord gate: live expiry
still refuses, stored empty and duplicate outcomes refuse, and dense output
requires `kind === 'received'`. Exact legacy-byte comparison remains separate.

Exercise all four stored callers: inboundLedger, handoffHistory,
membershipReading and replacementSource, with expired original requests for
legacy and binary receipts. Identical expired live requests must refuse.

Parse each physical page once per turn. Common immutable syntax and the existing
within-call wire authentication may be shared; each admitted entry still opens
and receives its own cryptographic, semantic, chain and lifetime checks. Any
existing crypto memo reuse retains its exact evidence/context requirements and
entry-specific key. No imported-key cache, concurrent-signature optimization,
suffix-only V path or cross-owner/persisted trust is added.

Retained buffers may be borrowed only after the existing exact physical-row
comparison. A lease, counter or later full audit does not replace that comparison.
A page turn belongs to the record that created it; a following legacy row must
decode its own page. Preserve independent projections and cancellation/erasure
ownership, including buffers shared by retained views. No owned parse object or
permission crosses a Window/Worker message.

### Authenticated preparation-journal projection

A page proof in the existing preparation journal uses the closed local role
`inbound-page:<physicalSequence>:<firstOriginalIndex>:<admittedCount>`. All ordered
addresses must name that same physical sequence and contiguous original indices,
within the existing eight-position bound. Its closed value contains one exact raw
receipt and, for each admitted index, a received result without another `record`
field plus the exact selected envelope/proof bytes. Never serialize an owned parse
object, synthetic v2 row, page reference or authority capability into that proof.
Legacy selected results may use `inbound:<physicalSequence>:<originalIndex>` with
the unchanged legacy result shape; old unindexed roles remain readable.

The existing binary value grammar, MAC domain/context, exact-input digest, opaque
import capability, slice, interruption, erasure and capacity rules are unchanged.
A valid MAC alone does not bypass the closed role/result validator. The first
exact input must equal the compact value's raw receipt on both fresh and resumed
checks. This is existing authenticated exact-evidence reuse, with no new authority
or commit permission. Semantic consumers must establish their own authenticated
encoding floor before any memo hit and still run the semantic and coverage checks.
Capacity counts encoded bytes at the same ceiling; a reopened journal that still
exceeds that ceiling refuses again. Its buffer observer counts retained encoded
result storage once, not the aliased pending map, transient inputs or process RAM.
The adapter is hardened in394;395 adds optional use in the saved verifier.
Actual ledger/reading consumers remain to integrate.

## Admission, cuts and accounting

Commit original chain order, including when preparation/verifying completes in
another order. One native commit atomically carries each receipt extent and all
its admitted updates before canonical promotion. An unused tail is not accepted
writing. Local edits continue to depend only on committed received state.

A cut can fall inside the page or committed extent. Never round it to a page
boundary. Use the actual selected position and predecessor, not request.after,
when reconstructing entry context. Handoff replay retains the existing covered
prefix/snapshot check and verifies the retained suffix. Only an independently
authenticated checkpoint/baseline can establish a cut; raw header/cursor values
cannot skip work. Unadmitted page entries remain outside the receipt. Local
reduction independently covers every admitted entry and retains the exact final
envelope/proof in its unchanged v5 frontier before retiring whole physical rows.

Keep these units distinct:

- Durable counters, native reservations and the completeness witness count actual
  physical rows/bytes. Do not invent multiple physical rows for logical views.
- Receive allowance, received progress, rate/fairness charging and retained-reading
  event limits count logical positions. Keep the existing 4,096 logical event and
  64 stream limits; fewer physical rows do not expand them.
- Index row/work bounds count expanded logical work before expansion. The existing
  32 MiB byte ceiling stays; charge actual retained byte ownership, every duplicate
  page extent and each separately owned copy. Views do not erase their memory
  cost. Fall back to the reference path at the existing bounds. No RAM-saving
  claim follows from a smaller accounting number.
- Keep 256-physical-row/five-minute due rules and Stage 4's 1,024-physical-row hard
  attempt cap. Also retain the earlier 1,024-logical-position full-audit ceiling.
  Either hard ceiling forces an attempt; neither waives interruptions or comparison.
  This conservative dual ceiling reconciles the prior logical rule with the
  operator's later physical cap; dense encoding cannot dilute audit frequency.

Target G8, actual read width 4, and B with at most four signed requests of at most
eight positions per wire batch. Keep the old two-concurrent individual-read
fallback. Combined cache/tail/wire reservations remain eight entries, 32 logical
positions and MAX_PENDING_BYTES, with erasure on cancellation/drop/close. Quiet
eligibility stays 750 ms, own checks five seconds, sender coordinated-2000 and
budgets 16/s and 64/s. No second scheduler work lane or per-publisher fetch-ahead.

## Compatibility floor, old tabs and handoff

Approved local floor: a closed optional `inboundReceiptVersion: 1` field in the
authenticated promotion/joined interlock, and in a retained-reading object that
contains binary events. Absence restricts that marker/retained-reading scope to legacy receipts. The
initial retained reading can stay legacy while later native rows use a marked
owner. Every reading that itself contains binary events needs the field. An
unknown value refuses.
This versions receipt encoding independently of the existing admission/recovery
checkpoint versions; do not reinterpret their v1/v2/v3 meanings.

The new field must be included in the authenticated payload. Promotion's explicit
MAC tuple must append exactly `["inboundReceiptVersion", 1]` only when present,
so legacy MAC bytes stay exact. The closed existing tuple cannot end with that
extension as an old optional field; test this disjointness independently. Joined custody already MACs its complete payload;
its closed parser and retained-reading parsers must retain and authenticate the
field. Every rewrite/rotation/handoff/install writer must preserve the floor,
with a central monotonic check against accidental downgrade. Existing authorized
whole-workspace removal may erase it only as part of its fenced teardown, without
making any remaining data available to an old reader. A parser that
drops the field is invalid. A binary row without the authenticated floor refuses.

Before the first binary effect, under the real authenticated native owner:

1. Establish the existing old-owner exclusion. Page owners hold the actual
   exclusive slot lease. Worker owners must have the real Account cohort's startup
   exclusive slot barrier and retained supervisor/anchor/slot/member fences, not
   an arbitrary shared task or serialized ticket. Do not change lock names or steal
   locks. The native owner still authenticates factors, binding, custody, authority
   and passkey; no supervision ticket substitutes for those checks.
2. Retain/acknowledge the MAC-bound floor transaction before any new receipt is
   reserved or committed. Lost replies resume from authenticated state. Keep
   synchronous journal admission and all outstanding old writing recoverable.
3. Never remove the floor on close, writer-flag disable, membership/successor change,
   history maintenance or a retry. Ordinary native authentication and every
   existing fresh authority/lifetime check remain required. Do not add cross-owner
   assertion reuse; report any additional ceremony requirement before landing.

The known released readers have closed interlock parsers and cannot accept this
new field. Active old Page/Worker owners must drain/release before the new owner
can start; queued/cold old readers refuse the marked storage before opening it
for use. Do not claim a particular old UI message from static code: Stage 3.2 must
run frozen old readers and record the actual refusal surface, no-writing evidence
and pending-writing/cold exactness. New readers must identify unknown future
receipt versions as update-required rather than trying migration or repair.

Retained streams with binary events carry the same encoding version and count
logical entries. Old retained-reading parsers must reject that closed extension.
No new HTTP field, server format, signed request/page version, Worker message
shape, serialized verification capability or page-reference lookup alias is proposed.
The same-worker transport handoff remains transport only and must re-establish
its ordinary native/authentication checks. If this needs a server/network-wire or
trust change in implementation, stop and report.

## Rollback and release ordering

There is no tested writer-off artifact yet. Stage 3.2 must build and test one
from the same hardened tree as the writer-on image, with RANGE_RECEIVE=0 and readers enabled. It must
open both legacy and binary data, including from a stale tab, preserve the floor
and writing, permit ordinary legacy operation and pass cold/Undo checks. Record its source/image identity
before any writer artifact is eligible. RANGE_RECEIVE is a writer flag, not a
reader-compatibility flag. Docker and Vite must pass it explicitly; ordinary and
reader-only builds default to zero.

Once the floor transaction commits, rollback requires that compatible reader
artifact even if no binary row followed it. Disabling the writer stops new binary
rows; it neither converts existing rows nor removes the floor. Rolling back to any build before this release locks out devices that wrote dense
rows. The old released binary cannot reopen marked storage. Do not clear storage, strip metadata,
re-encrypt rows or restore an older browser profile as an automatic rollback.
Accepted writing and authenticated history must remain. No server rollback is
needed for this client-local payload format.

A reader-first release is available: deploy the new readers with the writer off,
confirm client adoption, then separately enable the tested writer in a later
release. It costs a second release and delays the multi-entry/dense gains. A
combined reader/writer release instead relies on the tested old-tab fence and
requires the compatible reader-only rollback artifact from the outset. The
operator selected this combined release on 2026-11-03. Ordinary builds remain
writer-off; the tested release profile enables writing. A rollback artifact stops
new dense writes only in clients that adopt it: cached writer-on tabs do not lose
their compiled writer flag merely because the served artifact changes.

## Existing v2 and lab formats

The latest operator-confirmed production source is b6f0160a. Its inbound codec
writes only v1; its history contains no introduction of `done/account-inbound/v2`
or the lab dense tag in runtime source. The v2 introduction, 31cea8f8, is later
on this unreleased branch. Its Docker build also lacks RANGE_RECEIVE forwarding.
These are source/release-record observations, not a fresh cluster inspection.
No known released build wrote v2 or lab dense rows; no conversion obligation is
added for them. Keep existing closed v2 reading for development histories, and
include it in mixed-row tests. Lab dense rows remain unsupported private evidence;
never silently convert or erase an unknown row.

## Required evidence before a writer can land

Harden each piece independently; do not copy private lab modules or switches.
Required permanent controls include:

- Exact binary fixtures and all length, integer, extent, tuple and unknown-version
  refusals; legacy byte/MAC equality; strict hex refusal with the original error.
- Genuine live/stored crypto through all four callers after request expiry, with
  live-expired, stored-empty/duplicate and received-kind controls.
- Arbitrary mixed v1/v2/binary histories, two publishers, firstEntry > 0, full versus
  incremental agreement through every reader and selected envelope seq=position.
  Reintroducing the phase 329 stale turn must fail its permanent named assertion.
- Partial native commits, interior page/group/checkpoint cuts, 31-second aged cold
  replay, exact archives, provenance and actor-scoped Undo.
- Both old Page and Worker owners, queued and active old tabs, floor transaction
  interruption/lost reply, pending journal writing, all metadata rewrite paths,
  reader-only rollback and unknown future versions. No downgrade control may pass.
- Combined cache/tail/wire reservation, byte/logical limits, mismatched/reordered
  batches, absent-endpoint fallback, cancellation/drop/wipe, send yielding and
  continuous multi-publisher fairness with/without backlog and withheld hints.
- Exact retained-prefix comparison sensitivity, record-scoped owned parsing and
  erasure, logical audit/index bounds, past-index fallback and no-F cold exactness.

All Stage 5 gates and declared replicates remain. A paper contract, functional
checkpoint or prior lab result supplies no performance, format, RAM or release
acceptance credit. The [operator handoff](development-evidence/2026-11-02-release-hardening/367-format-contract/README.md)
will preserve the source review and decision state.


### Native B evidence map during hardening

Phase437 adds continuous native multi-publisher fairness in both pre-accepted
backlog and initially caught-up states, each with normal and server-withheld
hints. It observes actual productive same-publisher wire batches and durable
eight-position turns; its unfair-selector control must fail the same turn
assertion. Final writing, actor-local Undo and ordinary offline process-cold are
exact. [Source, every attempt and limitations](development-evidence/2026-11-02-release-hardening/437-continuous-native-b-fairness/README.md).

The earlier418/419 reservation/selection controls and421/422 cuts remain component
evidence; they do not substitute for that continuous journey. Actual32MiB
past-index fallback remains a separate bounded native obligation after437, before
Stage5. The later Stage5 fairness and3,072 report-only cells remain owed and receive
no credit from this functional proof. Pause for commits before starting Stage5.


Phase438 preserves the attempted actual-index fixture and its failed setup:
both the complete-ticket large-paste recipe and the one-slice UTF8 recipe exhaust
the existing900s preparation budget before the native returning-reader case.
The latter witnesses1,536complete replacements/86accepted positions and
4,249,788wire bytes. This is no past-index proof. [Every attempt, source identities
and the unrun boundary](development-evidence/2026-11-02-release-hardening/438-native-index-fixture-hold/README.md).
The next bounded fixture repair must observe cached sync/maintenance status and
allow genuine producer quiet under the same profile and limits. Actual32MiB
fallback and continued exact receive/cold still precedeStage5and the commit pause.


Phase439 preserves the cached-status/quiet preparation repair and every failed
attempt. The first producer reduction completes; the second safely parks at the
unchanged preparation capacity. That expected park is permitted in setup, but the
final recipe still expires at900s (1,344witnessed replacements,64accepted
positions,3,714,996wire bytes). The actual returning-reader cap/continuation/Undo/
cold case is byte-identical to438 and remains **unrun**. This closes no past-index
obligation. [Attempt records and limitations](development-evidence/2026-11-02-release-hardening/439-native-index-preparation-blocker/README.md).
Pause for commits now. Stage5remains blocked until a bounded native case observes
the actual32MiB refusal and subsequent exact continuation/cold; neither437nor
these failed preparations substitute for it.


### Operator amendment — bounded past-index proof,2026-11-05

The contract requires actual fallback through the same eligibility code; it does
not require reaching the production32MiBceiling through the UI. Use421's separate
test-only Worker-build pattern to lower only INDEX_MAX_BYTES. Production remains
32MiB. Bind the ordinary compiled asset separately and reverse the one constant
and all observation hooks byte-for-byte. Keep the actual refusal, subsequent full
verification, positions, Undo and ordinary offline cold assertions.438/439remain
failed real-scale setup observations and Stage6debt, with no cost diagnosis now.
This supersedes the earlier more specific demand to build32MiBthrough native UI.

[Phase440](development-evidence/2026-11-02-release-hardening/440-index-ceiling-binding/README.md)
binds67runtime files: after the index constant and independently checked generated
asset/cache metadata, every other runtime byte is equal. All7ordinary compiled
copies use32MiB;6Worker copies in the test use1MiB, while Page code stays32MiB.
The genuine32MiBpreparation passes at384witnessed replacements and18new accepted
positions (1,061,486total publisher wire bytes, including its seed position).
The returning-reader case remains unrun, byte-identical to439while the operator
clarifies its two hardcoded threshold literals. Native capacity observation also
waits for the display-on precondition. No fallback, cold, performance or Stage5
credit yet. Commits remain deferred by the operator.


Phase441closes the bounded native past-index obligation under the November5
amendment. Only the two approved refusal thresholds change in the returning-reader
case; reversing those tokens recovers every other byte of439'scase. The test
record is loaded from the exact served directory and binds every non-record file
by count/SHA256digest. Controls refuse a copied directory'srecord, stale asset
bytes and an unexpected file. All four rebuilt asset sets equal440byte-for-byte.

The1MiBWorker actually drops its index at native sequence63, with1,200,806owned
bytes and63logical rows. The first crossing receipt is a legacy position2;
five later dense receipts carry positions3–19(counts4,3,4,4,2), with fully verified
reference results at native sequences216,387,429. All18new accepted positions,
complete writing, local Undo, read-only native inspection and ordinary32MiBoffline
process-cold are exact. The native case passes in8.7s; this is functional evidence,
not production-scale timing/RAM credit. [Raw observations and source bindings](development-evidence/2026-11-02-release-hardening/441-native-index-fallback/README.md).
Fairness remains separately covered by437. Capacity-ceiling/size debt observation
is next. Commits remain deferred; Stage5has not started.
