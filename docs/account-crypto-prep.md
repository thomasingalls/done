# Account cryptographic contract and vector prep

2026-09-11, runtime baseline `2ba50aa` (fresh first-activation assertion). This prep completes the
inventory and compatibility decisions needed to repair review F-05/F-06 in bounded groups. It changes
no runtime format, key, account, personal installation or deployment. **F-05/F-06 remain open.**

## 1. What the source census establishes

[census.json](./account-crypto/census.json) pins 157 production TypeScript/TSX files in `src`,
`account-protocol` and `account-service`, with 89 distinct literal/template entries at their source sites.
[registry.json](./account-crypto/registry.json) classifies all of them into 22 groups, naming their
actual keys or authority, current documentation home and follow-up phase. These are **not 89 separate
cryptographic constructions**: some labels are unsigned carriers or names; some occur in several
constructions. Six manual entrypoints name important primitives the prefix scan cannot discover.

`pnpm account:crypto-prep` checks the census and runs its focused tests and contract probes. The AST
scanner decodes string escapes (including the spool-chain's trailing NUL), retains dynamic templates,
and excludes comments, TypeScript literal types, tests and declarations. The registry expands finite
version/operation templates explicitly; the arbitrary slot lock name is a non-cryptographic exception.
Missing/duplicate/stale classifications, unresolved templates, missing homes, changed source bytes or
new source files fail. After reviewing a runtime change and updating its classification, explicitly run:

```
node scripts/account-crypto-prep/run.mjs --record
pnpm account:crypto-prep
```

Do not automatically record in CI or treat changed hashes as an approval to accept changed bytes.
Source hashes also detect edits that introduce an unlabelled primitive, but do not interpret them.
Arbitrarily assembled strings, code outside these TS roots, dependencies and WASM require manual review.
Home existence does not establish that a home contains a sufficient specification. Classification and
authority descriptions are reviewed data, not inferred proofs. The generated scanner cases and omission
controls qualify this inventory tool, not the Account cryptography or complete protocol.

The explicit non-cryptographic exclusions are `done/slot-writer/...`, `done/accepted-workspace/v1/` and
`done/accepted-text/v1/`. JSON capsule and transport tags likewise do not authenticate their contents:
the former inherit outer record AEAD and counter-witness checks; the latter require their enclosed
signed objects. Hash-only root/draft/lineage names confer no independent authority. Account passkey IDs
and workspace signing-credential IDs remain different namespaces.

## 2. Corrections to the review's scope

The existing authority checker sweeps eight named documents and recognizes four literal construction
spellings under numbered headings. Account documents are absent. Merely globbing them into `SWEPT`
would still miss HKDF, HMAC, differently spelled signatures and primitives assembled in code. This prep
adds a source-inventory gate; it deliberately leaves the old authority map and its closure claims unchanged.
The complete repair must connect this inventory to mapped construction entries and executable evidence.

The review correctly identifies insufficiently pinned Account bytes and missing current vectors. Its
"nowhere" descriptions are broader than the evidence: Account prose already describes some LP/JSON
and custody constructions. Some table classifications also need correction: the draft digest is SHA-256;
recovery confirmation is signed by the factor-opened bootstrap key; pending-account observation is a
root signature. None is a generic service HMAC. The registry follows the actual code.

TRD §13.8 **already requires** R_priv, the bootstrap signing key and the root commitment in one seal;
row 14's amendment paragraphs say so too. The omissions are the precise 96-byte layout and a consistent
current executable vector. Row 14's main construction and its generator still seal only R_priv. A passing
`vectors:check` establishes generator/file agreement, not agreement with the runtime's amended payload.
The historical review remains unchanged; these are subsequent findings about its current applicability.

## 3. Selected byte and compatibility decisions

[First-authority contract](./account-crypto/first-authority.md) and its recursively ordered field schema
pin first epoch, offer, receipt v2, activation context and their creating request/candidate dependencies.
Signatures use domain-prefixed LP fields containing the hex hash of compact, reconstructed JSON. Inner
signatures stay included; JSON property order on input is immaterial, while array order is significant.
The service's sorted-key proof JSON is a separate representation. Offer head hashes the **epoch message**,
not bare epoch JSON. These decisions preserve current private bytes.

**First genesis uses an empty accepted-head vector.** No network position has been accepted; the
checkpoint represents Local history. An explicit member-at-zero entry hashes differently and is not an
alternate encoding. Membership comes from certification; position one's predecessor remains zero link.
Phase A must amend rows 5/7 and the TRD to state this initial exception. It does not permit sparse vectors
for successor epochs, stream deletion, retired members or pruning.

[Recovery layout](./account-crypto/recovery-layout.md) pins raw X25519 scalar, root commitment and raw
Ed25519 bootstrap seed in that order, 32 bytes each; AES-GCM ciphertext plus tag is 112 bytes. Keep the
current private envelope version 1 with its exact-length parser. The old scalar-only 48-byte ciphertext
is historical evidence and remains refused, not another accepted v1 payload. Phase B publishes the amended
vectors and updates all normative homes; any need to read a retained incompatible artifact must receive
an explicit migration/version decision before implementing that reader. No real Account receipt exists.

K_auth supplies pinned serialization authority, not plaintext coverage or factor possession. Eligible
client certification and semantic rederivation, bootstrap-origin endorsement and the actual registration
assertion remain separate checks. K_accept derives its authority from the verified epoch, and operator
custody protects seeds rather than granting a caller a general signing interface.

## 4. Ordered implementation groups and acceptance gates

Each group ends with preserved evidence and an updated checkpoint. Split a group further if its field
matrix requires it; none authorizes real Account onboarding or second-device enrollment.

| Order | Bounded change | Required evidence and closure condition |
| --- | --- | --- |
| **A — next** | Register exact first-authority, bootstrap observation, candidate/certification/origin, activation and slot-binding dependencies. Amend genesis head-vector homes. | Fixed, published inputs and every intermediate body/LP/hash/signature reproduced by runtime and independent encoder. Retain current descriptor-v2 vectors. Per-field/nested-signature negatives, signed wrong-purpose/namespace values, empty-vs-zero vector, input-property reorder, version/array/extra-field refusals and effective omission controls. Root serialization cannot replace client/factor predicates. |
| B | Amend row 14/TRD/recovery docs and vectors for the 96-byte payload, digest chain and confirmation/registration challenges; assert raw-key export format (F-12). | Node-independent seal/open vectors against runtime, both derived public keys, root correspondence, exact prefix/length controls, normalization and per-field AAD/digest/confirmation negatives. Preserve old 48-byte evidence separately. Bridge recipient info and standard HPKE suite; do not redesign total-loss recovery here. |
| C | Register envelope v1/v2, submission, head/refusal/response, both read transports and service witness/chain. | Reuse current private-envelope vectors where exact; fill submission/response/read/witness gaps with wire hex and independent signatures, framing/version/size negatives and field omissions. Distinguish carrier validity, accepted history and current authority. |
| D | Register service root/acceptance custody, local promotion versions, encrypted Account capsules, spool/inbound/delivery and counter-v2 witness coupling. | Exact KDF/AAD/MAC/carrier/hash-chain vectors and tamper controls. Map inherited Local custody/store/journal bridges to their existing homes and evidence; classify migration-only exclusions explicitly. No claim of a fresh whole-Local or WASM qualification. |

**Map integration design for A onward.** Retain the existing map's guard/resolution graph, roots, pins and
open-debt discipline. Introduce explicit construction records keyed by purpose/version and source sites,
not just one row per label. A record names its signature/MAC/AEAD/KDF/digest/carrier roles, exact byte home,
map-entry IDs (or justified non-authorizing carrier/structural exclusion), vector files and negative controls.
Map verification/AEAD/predicate entries still carry the actual guard and root chain. Do not add a permissive
"service" root for content authority to make the sweep pass. Pin sections or exact format records; a
file-wide pin alone must not let an unrelated paragraph count as byte specification.

Groups not yet implemented stay visibly open with a named phase and evidence gap. The new gate must
reject a missing registered source site, dangling map/vector reference, stale field schema, unclassified
label/template, new unlabelled primitive change without census review, or a resolved construction with
no required negatives. Keep inherited sweep checks; add effective controls for omission of each new
registration obligation. Only after all four groups meet their individual gates can F-05/F-06 closure
be considered. A record saying "tested" is insufficient; check actual vector execution and field coverage.

## 5. Prep validation and retained limits

The independent probe matches six schema-derived messages to production, verifies all six signatures,
reconstructs reordered nested objects, confirms request/completion/offer-head hashes and WebAuthn nonce,
and shows a nested offer-signature change invalidates the receipt. It computes both genesis head digests.
An independent Node HKDF/AES-GCM opener reproduces the old scalar-only vector and opens the runtime seal,
checks both public keys, sealed root and digest chain, and confirms the old length refuses. Its service
fixture uses synthetic content; it does not establish Yjs semantic admission or full field coverage.

The scanner campaign includes 300 seeded shrinking-enabled cases plus controls for missing, duplicate,
stale and unresolved classifications, changed source with no done/ label and a newly introduced source.
These are bounded prep checks, not final interoperable known-answer vectors or a complete mutation audit.
See [preserved evidence](./account-conformance-runs/2026-09-11-account-crypto-prep.md).

Invocation-grant power-loss accounting, parser/admission/service negatives, diagnostics, scale and
maintenance, general lineage advancement, enrollment, rotation/revocation, recovery/finalization, platform
coverage, restore/clone assumptions and independent review remain separate gates before real Account use.
Personal Local works as before; the actual old second device will adopt the first device's workspace,
with fresh custody/store/counters/credentials, without importing its old writing.
