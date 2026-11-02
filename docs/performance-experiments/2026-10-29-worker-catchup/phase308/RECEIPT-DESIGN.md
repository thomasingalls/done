# One complete signed-page receipt: design only

Yes, in principle. One self-contained physical receipt per signed page can avoid the repeated page copies without a reference table or a new garbage collector. It changes the physical-to-logical replay contract; it is not just a codec substitution. No format code, writer, migration or build has been produced. V2 remains development-only and the range writer remains default off outside the lab.

Question: one self-contained receipt per original signed page, raw request/page bytes, no external
references or separate page table/GC. Conceptually possible; the current v2 selects one entry yet
embeds the same whole original request/page in each per-position receipt. The storage duplication
is representation, not a requirement to have a complete signed page available on cold reopen.

Use a bounded new closed format, not a reinterpretation of v2. A binary framing can hold fixed
metadata/lengths plus EXACT original request/page byte strings. The signed wire page remains its
current encoding (including hex inside the signed wire); do not silently change its signature
input. Store all material needed to verify/replay locally. No process-local page-ID registry, no
external references, no missing page after cache eviction, no new GC. This differs from unsafe F.
Admission metadata must bind baseline/start link and the admitted entry extent; it cannot grant
verification. Keep conflict/one-position observations explicitly supported (possibly legacy codec).

Nominal duplication saving is about4x page repetition and2x outer hex for four-entry pages: the
page component could be about1/8. 13.5KB/8~=1.7KB is arithmetic about that component, NOT a measured
new total. Content update rows, metadata, encrypted-row overhead and inner signed-wire hex remain.
Production v1 receipts each contain a one-entry page: do not promise them4x dedup savings. No
claim of8x savings for sender-owned delivery ledgers or server envelope storage. Existing rows
would need an explicitly checked conversion/maintenance policy; never rewrite for free in a read.

Prefer whole-page atomic admission where it fits. The current receive group can keep a fitting
prefix and re-fetch a tail; that would duplicate a page again if carried over unchanged. Bound
page requests by remaining logical position/write/byte allowance, or narrow/retry before commit.
Do not admit an unverified tail to avoid a retry. Keep existing per-entry crypto and all live
expiry, authorization/history, ledger/witness and commit checks. A page certificate is no
substitute for opening every admitted envelope and matching every accepted decision and link.

Reader inventory / work:
- inboundRecord.ts: new bounded codec and a logical page-entry view. Raw bytes require dispatch
  BEFORE generic JSON.parse, not just adding another string to isInboundRecordTag. Canonical
  framing/lengths/arity/extent/scope and original bytes must be checked. Legacy v1 remains readable;
  v2 is development-only, but retain/reference its test evidence and state compatibility explicitly.
- accountInbound.ts: current verifyStoredInbound returns one selected InboundResult; a page owner
  must enumerate logical results without re-encoding N full v2 receipts. Current authenticate-
  original-page / verify-selected-entry split can inform this, but every entry/prefix/body proof
  and lifetime guard remains. Never confuse a verified signed page header with verified contents.
- inboundLedger.ts: inspectInbound classifies physical ledger rows, counts each physical event
  ONCE in spool witness/order, then replays logical positions in entry order. retained map remains
  keyed by publisher position. Memo keys need (physical sequence,entry index), or an exact whole-
  page context with all equivalent entry checks; seq alone must not make all entries share a result.
  Content coverage must include every returned update. Do not double-count a physical row because
  it has several transient logical entries.
- incrementalAccountLedger.ts: append census, epoch extraction, publisher/self tests, frontier
  advancement, retained entries, index bounds and reference agreement all need page-aware views.
  Its32MiB bound and max-row/amplification limits must still bound expanded logical work, not merely
  the smaller physical row count.
- accountMembership.ts and accountSuccessor.ts: epoch extraction must use the original request
  epoch for every supported inbound representation, never fall through to a positional JSON field.
- handoffHistory.ts: it currently decodes record.position and enforces increasing single-position
  order. Expand a page through logical positions, preserve original evidence and exact cut/link
  checks; consider propagation of reader capability through encrypted handoff/checkpoint payloads.
- membershipReading.ts: v3 membership stream replay directly calls verifyStoredInbound, stores its
  one-position record/updates and advances the stream prefix. Consume every logical page entry,
  but retain one physical receipt; preserve the exact final stream prefix and pending-update
  checks. Older v2 membership readings also delegate to handoff replay.
- replacementSource.ts: appendStored directly calls verifyStoredInbound; append currently demands
  position===prior+1 and increments REPLACEMENT_SOURCE_EVENTS once. A page must prove every
  intermediate position, count logical positions against that bound, not cross the authenticated
  cut, and resume only at a verified extent. Disposal and returned owned record bytes must retain
  their existing interruption/zeroization contract without duplicating the whole page per entry.
- localRetentionPlan.ts: page-aware classification and exact receive-frontier coverage. A cut may
  be inside a page. Keeping the self-contained row until its last needed entry is covered requires
  no separate GC, but replay across that cut is NOT automatically solved by keeping bytes.
- accountReceive.ts / joinedAccount.ts / contentStore.ts: prepare logical results while writing
  one physical heads row per page plus every required update row. Witness hashes/physical event
  count must match actual rows; received positions, eight-position allowance and rate/fairness
  accounting remain LOGICAL. Keep byte/write limits, nonce allocation, capture copies, atomic
  append, failure cleanup and zeroization. No F-style aliases surviving only in memory.
- Coverage, baseline replay, resumable preparation, generic row dispatch, export/status and Worker
  mirror must agree on physical-row vs logical-position units. Downstream consumers of the census
  need review even when they never mention the receipt tag directly.

Particular cut boundary to prove before a format repair: a page can straddle an authenticated
retired/history cut. Existing contextAt takes a read after value; current callers use request.after,
while a selected page entry has effective prior position request.after+index. A new page adapter
must check retained/retired fences and prefix links for the effective logical entry while still
verifying the ORIGINAL request/page bytes. Do not skip covered entries on a raw cursor's authority,
require retired keys unnecessarily, or assume the old selected-entry path already proves this
new behavior. Write discriminating cases for cuts inside pages, retired generations, checkpoint
installation and cold reopen. Conservative retention/selection policy needs an explicit contract.

Audit units: accountReceive sinceAudit counts all appended physical rows and triggers the full
reference oracle only when >=1024 plus a new state row (or existing every flag). Densifying heads
changes that count. One possible equivalent trigger weight is update/state rows as before plus
one virtual receipt unit PER logical page entry, keeping the state predicate and full oracle.
This is a design option, not an implemented change. Reconcile against existing audit guarantees;
do not quietly dilute reference-audit frequency. Keep bounded sealed-row warm audit unchanged
unless separately justified. Counter spool.events remains physical, not an excuse to count only
one received position or authorize unchecked entries.

Compatibility/rollback: new binary tag cannot safely be sent into old JSON-dispatch readers.
Before any real writer activation, establish an authenticated existing reader/version fence that
old live tabs check before writing; unsupported data should request an update, preserving data,
not look corrupt or ask for destructive migration. Test mixed owners/stale tabs and rollback.
Delivery wire signatures need not change, but encrypted history/handoff reader capabilities may
need versioning even if the service treats their ciphertext as opaque. Do not assume no server or
history-format consequences merely because the native local row is the immediate storage change.
Keep writer default OFF and v2 development-only; no release work is authorized here.

Landing requirements, separate from this design: parser/each-reader tests (including the old
silent fall-through sites), signature/extent/link/body/key/coverage corruption controls, byte and
logical-count limits, every interruption/commit refusal, cold/mixed-owner/rollback behavior,
page-straddling cuts and lost keys, resumed maintenance, independent reference agreement and
original performance/fairness gates. V's unproven immutability provenance must not become a
prerequisite for accepting the dense format. A useful later experiment is whether dense complete
receipts plus G pass with FULL prefix comparison retained; it has not been built or measured.

Handoff precision: membership/handoff stream.events currently hex-wraps stored record bytes.
Keeping that outer transport encoding is compatible with a raw native receipt but does not make
every layer binary. Any change to those enclosing formats is a separate versioned contract.
The arithmetic above concerns duplicated signed-page bytes, not a measured total or server bill.

Recommended next contract decision: preserve full original page bytes and explicit admitted
extent, with a shared bounded classifier for JSON legacy rows and the new representation. Settle
page-straddling cuts, logical budgets and the already-shipped-reader fence before choosing the
exact binary schema. Only then harden a separate default-off format change. The lab does not
establish that this design meets any latency or security gate.

Qualification references: `scripts/release-validation/account-receive-wrapper.mjs` and
`account-inbound-codecs-wrapper.mjs` also mention codec/tag anchors. They are adapters, not
additional runtime parsers. A future format change needs their source-evidence and fault-control
review while retaining legacy cases and assertions. They were not changed in this phase.
