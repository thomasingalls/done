# Remaining closed-parser conformance — F-21.1

2026-09-12. This phase inventories and supplements the six parsers named in the historical
implementation review. It concerns the current private first-epoch protocol. Parsing establishes
structure and canonical bytes; authentication, retained history, authorization and eligibility remain
the responsibility of the existing owners and verifiers.

## Inventory before implementation

| Parser / entry | Current contract and bounds | Existing coverage credited | Additional coverage selected |
| --- | --- | --- | --- |
| `parsePromotion`, `src/crdt/promotionRecord.ts`; authenticated `readPromotion`, compatibility and compare/write | 13 stage/version pairs, v1–9; exact keys; nested pending/genesis/admission/handoff parsers; 5 ≤ seal reservation < 2^32; typed credential/MAC lengths. Object carrier, not canonical input JSON. Handoff destination preserves property order. | D2 `account-promotion-contract/formats.test.mjs`: all stages, every leaf, omissions, stage matrix, credentials, identity bounds, ordering; native authentication and generated histories. | Nested scalar-type mutations across stages, null/missing/prototype/cyclic data, explicit number/byte boundaries and generated valid detached round trips. |
| `parseAdmissionRequest`, `account-protocol/admission.ts`; service `requestAdmission`, retained request and client admission | v1 request; one certified member; signer/wrapping-key correspondence; fixed signature/hex lengths; genesis snapshot ≤16 MiB and ciphertext ≤16 MiB+16; two wraps, 1–2 ordered actors. Service bounds serialized admission to 72 MiB before parsing. Parser alone has no aggregate-object byte check. | Group A first-authority leaf bindings, recursive reorder properties, signed wrong scope/purpose and nested receipt negatives; service admission/inbound recipient tests. | Direct request parser execution for nested omissions/extras/types, genesis byte boundaries and structured generated mutations. |
| `decodeSourceCapsule`, `src/crdt/sourceCapture.ts`; capture catalog/recovery and spool | Canonical UTF-8 JSON array, v1, exact route, ≤64 sources; ≤2 MiB wire, ≤1 MiB sum of raw updates; valid Yjs frames (pending dependencies may remain). | D3 ledger fixed vectors, every leaf/omission, canonical syntax and every truncated prefix; capture/spool native tests. Several size/count tests previously called only the encoder. | Invoke decoder directly on count/raw/wire boundaries and generated nested mutations around valid Yjs capsules; valid full/partial updates and both actors. |
| `decodeSpoolEntry`, `src/crdt/spoolRecord.ts`; spool/delivery/inbound census | Canonical JSON v1, ≤4 MiB; position/attempt/envelope variants; positive safe position, 1 ≤ attempt < 2^32, source index 0–63, fixed source identifiers/hash; v2 nested envelope and route. | D3 all variants/leaves/framing, independent histories, witness and source verification controls. | Numeric/type boundaries and generated source references/attempts, including coercible nested values. |
| `decodeDeliveryEntry`, `src/crdt/deliveryRecord.ts`; delivery/inbound census | Canonical JSON v1, ≤4 MiB; exact capture route, lineage/head; positive safe position; submission or response; nested submission/response decoder and bounds. | D3 fixed carriers/leaves/framing, C nested transport; browser owners and F-21.7 actual service responses. | Direct numeric/nested wire bounds, generated mutations of both variants, explicit parser-versus-signature distinction. |
| `decodeSubmission`, `account-protocol/submission.ts`; transport, delivery and service verification | Binary LP domain/version/lineage, u32 envelope and parent lengths, v2 envelope, optional refused parent, 64-byte signature; total ≤ envelope limit + response limit +512; exact consumption/re-encoding. | C first/successor vectors, all truncated prefixes, trailing/over-limit bytes and signed binding mutations; service/client owners. | Generated internal length-prefix mutations, malformed nested parent/domain and canonical valid signature variation. |

See [D2](./account-promotion.md), [D3](./account-spool.md),
[delivery](./account-delivery.md), [transport](./account-transport.md), and the
[aggregate executed evidence](./account-conformance-runs/2026-09-11-account-crypto-audit.md).
The historical statement that these parsers had no structured fuzzing is broader than the current gap.

## Test boundary and independent expectations

New tests start with the independently reconstructed existing fixtures, then mutate raw objects or
wire bytes before calling the named parser. Encoder rejection cannot satisfy a negative. The mutation
tables state expected rejection from primitive types, exact keys, declared limits and wire framing;
positive cases compare against independently encoded bytes or the complete expected parsed object.
Generated checks retain seed/path/shrink details on failure. Source omission controls must rescue the
same malformed input; throwing before the intended check is not a successful control.

Object tests cover data obtainable through JSON/IndexedDB, including ordinary nested arrays and
cyclic data (IndexedDB can retain cycles). Inherited-only required fields are not own fields and must
refuse; null-prototype records with all own fields are valid. Symbols, non-enumerable extras, proxies
and executable accessors do not survive the external JSON or IndexedDB boundary as such and are not
an arbitrary-JavaScript-object safety contract. This campaign is not a CPU/memory complexity proof;
process deadlines bound test execution and declared resource edges are exercised explicitly.

Two initial probes accepted malformed primitive representations: promotion stage `['prepared']`
and spool source hash `[hexHash]`. The subsequent complete nested type matrix also accepted singleton
arrays for the handoff destination's Account `promotionId`, `requestDigest` and `epochHead`. Sparse
credential, genesis actor and genesis wrap arrays could skip their `map` validation callbacks.

The repair adds explicit string predicates for those five fields and visits every array position with
`Array.from(...).map`, including holes. The existing cardinality checks run first (at most two entries).
It changes four production files, retains all supported bytes and adds no version or authority edge.
The existing HMAC/source-hash verifiers are separate; these probes do not demonstrate authenticated
tampering or a capability bypass. Pending-state coercion is rejected by promotion's explicit `eligible`
comparison and is not silently counted as another reproduced defect.

`baseline.test.mjs` runs the same generated failing properties against the four original source files
from signed `f0b6acd2e624d89034c88706d4053a830ab50cc6`, substituted only inside an in-memory test bundle.
Both shrink to one-element arrays; the current parser refuses them. It also confirms the original
sparse/index defects against that frozen baseline. Separate omission controls reverse each repaired
predicate/map, plus the admission version, source route, delivery position and submission consumption
checks. The submission control removes both redundant end/re-encoding checks and is labelled as such.

The native test writes malformed shapes to an isolated IndexedDB database, closes that database
connection, opens it again and confirms that holes survive while the parsers refuse readback. This is
a database-connection readback test, not renderer-death or power-loss evidence. Existing owner campaigns
remain responsible for authentication and interruption coverage.

Source-size tests use actual Yjs updates on each side of the 2 MiB wire boundary. The separate 1 MiB raw
update sum is a defense in depth: canonical hex and framing overhead make the wire bound stricter for
that one-source case. This is not evidence that a nested byte limit is independently reached when an
outer bound already refuses. Generated signature variation is intentionally accepted by the structural
submission parser; a separately checked invalid signature is not granted cryptographic authority.

Run `pnpm account:parser-conformance` for the bounded campaign. Its evidence includes existing A/C/D2/D3
contracts, native promotion/genesis/spool owners, service admission, selected unit tests, all vector
checks and source/authority inventory. It uses disposable test origins and writes no app bundle to disk.
