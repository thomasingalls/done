# Owned page parsing: baseline and prototype contract

Lab only. New P is parsed-page sharing; old dense-receipt P remains on. No format, trust, production-default or release approval.

## Baseline counts before treatment

These are a call-graph census of an uncached selected page, not a claim that every route/memo hit has the same count. `decodeInboundPage` includes the canonical JSON stringify comparison and entry hex decoding. Literal `encodeInboundPage` has zero calls in these client paths; signing-message encoding and legacy receipt hex encoding are separate whole-page work.

|Core path for n entries on one page|Full-page decodes per page|Canonical JSON stringify comparisons|Signing-message encodes|Legacy receipt page-hex encodes|
|---|---:|---:|---:|---:|
|Native preparation, selected-record decoding and dense packing|4n+2|4n+2|1|n|
|Cold census plus uncached stored ledger verification and retained-entry decoding|7n+1|7n+1|n|2n|

Native four-entry count is 18 decodes, one signing-message encode, four receipt hex encodes; the new test observes that count. Native eight-entry call-graph count is 34 decodes. Per logical position those are 4+2/n and 7+1/n decodes respectively, plus their stringify comparisons. Stored baseline has five decodes inside each uncached verification, one in retained-entry extraction, and n+1 from the logical-view census. Separate scope/route inspection can add passes. Existing exact memo hits can omit verification; do not multiply this table into a measured CPU saving.

P's counted native scope at widths four and eight does one page decode, one signing-message encode and zero legacy receipt page-hex encodes, shared through packing. Stored P test does one decode/signing-message encode per physical extent scope, with every old signature verification and per-entry decrypt still called. Census, replay, route inspection, and later owner scopes remain separate; the runtime drain counter is not one decode per page globally. No parsed syntax or verification trust is persisted.

## Boundaries retained by the prototype

The owned raw request/page, exact byte snapshots, canonical JSON, closed shape, lowercase/even/nonempty hex, extent and request/page binding permit sharing parsed syntax and signing-message bytes within an owned scope. Removing the duplicate inboundBytes regex retains the length/even check and the existing unhex lowercase/character check. Global unhex is unchanged: its general odd-length behavior is not silently adopted here.

Each selected entry still has its own acceptance signature, publisher signature/decryption, author/actor/generation checks, position/previous-link/chain check, witness completeness and committed-state coverage. Current authority/lifetime and live-request expiry are rechecked at the old boundaries around awaits and commit. Stored replay must retain its distinct contract: historical request expiry does not invalidate an independently authenticated saved receipt, while all original signatures and exact stored bytes still verify. The first deep cold failure shows that the P prototype failed this distinction; it is rejected as a candidate.

No new signature-result cache was introduced. Existing per-entry exact-evidence memo copies and full-prefix comparison remain; index charge is not total heap use. Transient P records use the existing dense framing, with exact virtual legacy encoded length to retain old preparation/batch bounds. Logical position counts, G8 allowance, audits, rate/session/fairness bounds are unchanged. Retained raw views share one owned request/page block per extent, with selected-entry data bounded in index charge. Parsing scopes wipe decoded envelope/proof arrays, message bytes, exact snapshots and owned wire bytes when their owner closes; retained views keep only their own wire block. General erasure hardening is unproved by these six controls.

## Cold regression identified by reading; not repaired or rerun

Private source/src/crdt/accountInbound.ts: verifyStoredInbound's P branch calls verify with `stored=undefined`, but supplies storedEvent and storedPhysical. verify creates expectedRecord only from stored. Its current() expiry branch still tests `!expectedRecord`, therefore P stored replay takes live-request expiry handling. It can also take other old branches gated by expectedRecord; all such uses require review before resuming. The dense tuple equality is not a substitute for the old stored-mode distinction.

The focused stored test used a request that had not expired. It compared crypto/decryption counts, outputs and wrong-baseline refusal but did not age the request. The interior-cut/cold probe also completed quickly and passed. Neither establishes expired historical replay. Required next control is paired P0/P1 stored replay after request expiry, with live expired request refusal retained, plus exact tuple/duplicate-mode/erasure controls. No fix or extra test was built after the actual no-F cold stop.
