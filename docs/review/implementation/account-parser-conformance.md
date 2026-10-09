# Remaining parser conformance — F-21.1

2026-09-12. Baseline: signed `f0b6acd2e624d89034c88706d4053a830ab50cc6`.
Current scope and validation: [parser contract](../../account-parser-conformance.md).

## Assessment

**F-21.1 is addressed for the six named current parsers, subject to the bounded evidence below.**
Importance: **medium assurance, low demonstrated runtime impact**. The historical blanket absence
claim was stale after A/C/D2/D3. Those phases already exercised every published leaf, canonical framing,
all truncated prefixes and several generated histories. The remaining gap was useful malformed-input
generation and direct parser boundaries. The new tests found real structural acceptance defects,
but neither they nor the historical finding establish forged authentication or content disclosure.

| Reproduction | Repair and interpretation |
| --- | --- |
| `parsePromotion` accepts `stage: ['prepared']` (also the two v4 handoff stages) | Require a primitive string before matching the stage. This corrects the declared record type and keeps ordinary strings unchanged. Other stage-specific checks already reject several coerced stages; the finding is not every version accepting every array. |
| `decodeSpoolEntry` accepts a position reference with `hash: [hexHash]` | Require a primitive string in the shared spool encoder/decoder validation. Canonical re-encoding alone was insufficient because it retained the same array. Later source-hash verification would refuse it; this is not a demonstrated publication bypass. |
| Nested handoff destination accepts singleton-array `promotionId`, `requestDigest`, `epochHead` | Require primitive strings in `parseSlot` before its regexes. The current direct nested matrix reproduces each field. This also tightens ordinary startup classification; existing Local fields and valid index bytes are unchanged. |
| Sparse `credentials`, genesis `actors`, and genesis `wraps` skip `.map` callbacks | Visit every array position using `Array.from` after the existing cardinality checks. Missing elements reach the existing object/credential validators and refuse. JSON transport turns holes into nulls and already refused; IndexedDB preserves holes and is explicitly tested. |

Five string checks and three array traversals change four production files. There is no new wire
version, encryption, key, authority edge or lifecycle state. Census source hashes and six existing
construction-site line locations are refreshed; labels, primitive roles, byte homes and vectors remain.

## Evidence and limits

The [campaign record](../../account-conformance-runs/2026-09-12-account-parser-conformance.md)
records execution and counts. New tests include a complete nested incompatible-type matrix across all
thirteen promotion variants and direct admission, sparse-array/own-field/cyclic-data checks, declared
genesis/source size edges, generated valid objects/wires and generated nested/length mutations.
All negatives call the named decoder/parser; an encoder-only failure cannot satisfy them.

Two failing properties are replayed against the immutable signed baseline's four source files inside
an in-memory Vite bundle. Seeds `112101` and `112104`, path `0:0`, each shrink to `[1]` (one singleton
array wrapping the otherwise valid stage/hash). Current code rejects those minimized cases. The baseline
test also reproduces the six other affected fields/traversals. These are expected test controls, not
unresolved failures in the current code.

Twelve effective source controls cover every repair plus admission version, source route, delivery
position and submission framing. The latter deliberately removes both end-of-input and re-encoding
guards: removing only one redundant guard would not rescue trailing bytes. Native database readback
confirms that sparse credential/actor/wrap arrays survive persistence and all malformed shapes refuse;
the valid record still parses. It closes/reopens a database connection, not the renderer.

The positive oracle uses independently reconstructed existing fixtures and explicit contract
propositions. Some checks deliberately reuse real Yjs to create valid frames; they do not independently
implement Yjs. Exact canonical round trips test byte preservation, not cryptographic authority.
Generated signature bytes may parse while failing signature verification. The complete existing
authentication and owner checks remain necessary.

This is not arbitrary live-JavaScript-object safety, exhaustive fuzzing or an asymptotic resource proof.
Native deadlines and explicit size edges bound these executions, not every conceivable dependency
behavior. No new power-loss, platform, whole-profile residue, enrollment, successor or deployment
guarantee is claimed. The parser-only genesis size test does not close F-21.2's client admission and
generation-owner size obligations. No remaining F-21 item is closed merely by this disposition.

The next bounded phase is F-21.6: strengthen the named delivery unit oracle and its retained-evidence
assertions, crediting D3 and F-21.7. Arrival order may legitimately select a different retained proof
set or first final/refusal value; full-state comparison must specify those differences rather than
asserting blanket permutation equality. Finalization and successor histories reachable only through
low-level fixtures must not be presented as built owner APIs.
