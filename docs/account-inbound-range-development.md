# Indexed inbound range receipts — development contract

2026-10-30. **Development-only**, explicitly approved by the operator. Phase285 enables only bounded composed-peer development range writes. Existing performance gates, production budgets, authority/history
checks, synchronous journal admission and mixed-owner fencing remain. Release preparation is held.

## Closed bytes and authority

The v1 plaintext record remains byte-exact and single-entry. Its original verifier API still
refuses wider requests. The v2 plaintext is canonical JSON with fourteen fields:

`["done/account-inbound/v2",2,baseline,lineage,head,reader,publisher,"received",position,previous,link,requestHex,pageHex,entryIndex]`

Identifiers, byte bounds and canonical integer/hex rules retain the existing codec. `requestHex`
and `pageHex` are the complete original signed v2 wire bytes, not rewritten single-entry messages.
The original request has limit 2–8, the selected index is an integer in the returned page, and
`position = request.after + entryIndex + 1`. The selected envelope and accepted proof must match
workspace/publisher/position/digest/epoch/link. A v2 conflict record is not supported. Short valid
pages retain their wider original request; an authenticated empty page produces no record.

Decoding grants no trust. Stored replay authenticates the original request and complete service
page, then the selected envelope/decision against an independently owned pre-event prefix. It may
ignore the original request's wall-clock expiry only for stored evidence, as v1 already does. The
selected index cannot reset that prefix or borrow an old retained position. Native completeness
witness, content coverage and authority/commit/readback checks remain separate obligations.

A range call captures its bytes and authority fields before its first await, verifies the captured
request/page signatures once within that call, and verifies every selected position, parent link,
actor, envelope and lifetime. Prefix checks still run for every entry. No partial result escapes
an invalid range. Returned receipt/update bytes stay within the existing atomic byte/record bounds;
failure erases earlier prepared results. No completed proof is persisted, serialized or transferred.

## Readers and cost boundary

`isInboundRecordTag` in `inboundRecord.ts` is the tag home. Membership and successor issuance
boundaries, full inbound census and its epoch pass, all three incremental tag paths, and local
retention disposition use it. Stored replay selects the indexed entry. Per-position receipts retain
handoff/cut behavior, including a real admitted cut inside one downloaded page. Own reconciliation
continues through the existing single-entry API.

Each indexed receipt currently retains the whole original page. This development representation
can duplicate evidence up to the range width. Its storage, cold-open, verification and maintenance
costs are an explicit adoption risk; passing a download-only check cannot qualify it. Range sizes
4 and 8 need actual deep/fairness measurements as well as codec tests. Network width must not
silently multiply the four-position publisher allowance or bypass pending/native byte bounds.
Large supported originals require a safe per-publisher single-entry fallback in the later planner.

## Stale tabs and rollback

Established in the reader phase: v1 bytes/API remain exact, v2 uses a distinct closed tag/version,
and current readers verify its selected evidence. Phase285 enables composed-peer writes within the unchanged four-position allowance; other reads remain single-entry.

**Not yet established:** an actual stale v1 tab sharing an origin with a v2 writer, or an older
application reopening a carrier containing v2. Before release work, exercise both against immutable
historical source, compare raw storage before/after refusal, and verify native mixed-owner fencing.
Do not treat static unknown-tag rejection as proof of complete stale-tab behavior: old membership
and census paths contain the silent fallthroughs reproduced in phase283.

The service wire is unchanged; that does not make an application rollback compatible with local
v2 receipts. Until tested, assume an older application may refuse a carrier after the first v2
write. Preserve data, require an updated reader, and never clear or rewrite a carrier to make the
older client open. A reader-preserving rollback artifact or separately proven reverse migration
would be needed before promising rollback across that boundary. No such artifact or migration is
claimed here. The new construction remains an open qualification obligation; existing specified
contracts and release blocks remain.

## Bounded development writer (phase285)

Known peer backlog can use one wider signed request. Actual fitting verified positions, not HTTP
count, consume the existing four-position publisher turn. Fresh single-entry fallback is scoped
to a publisher whose wider response/evidence exceeds bounds; optional batching remains separate.
All original native authority, commit/readback, witness and Window acknowledgement checks remain.
Functional/native legacy checks pass; wider deep, contention and stale/rollback behavior remain
unqualified. This is development activation only, with no aggregate release credit.

## Fresh bounded preparation (phase289)

prepareInboundRange may verify only the fitting prefix within a1–4position allowance, beginning
at the independently supplied native prefix's offset in the original signed page. Every call
reauthenticates originals and each selected entry; an unselected tail has no verification credit.
The strict full-range API is unchanged. A size hint returning no result can select narrower work
only; it grants no progress. Native commit and any raw-tail ownership/writer integration remain
separate obligations. No proof is retained between calls.

## Raw tail and native allowance (phase290)

Development peer requests can download8known entries. The owned native request separately
captures a1–4position allowance and exact native cursor; both are checked before writes. A single
bounded raw-original slot may bridge turns, with no verified plaintext or completed proof. Every
continuation reauthenticates against fresh native state. Context/cursor/revision/expiry/owner
fences erase or refuse stale originals. Its reservation coexists only with one new single-page
fetch; legacy multi-request collection evicts first. This is not cross-owner proof reuse.
A no-result size refusal settles preparation cleanly and narrows fresh work; invalid selected
evidence still fails. Actual composed fallback/fairness/deep8 and stale-tab/rollback are pending.
