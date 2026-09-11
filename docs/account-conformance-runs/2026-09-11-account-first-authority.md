# Private first-authority formats — 2026-09-11

**Result: phase A complete; remaining F-05/F-06 groups stay open.** Prep was committed as `9cf5c98`.
This change specifies existing private first-epoch bytes, adds the source/map/evidence join and fixed
vectors, and amends the first-genesis head-vector rule. Runtime source and existing private wire bytes
are unchanged. No real account, service pin, operator key or personal factor was provisioned.

[Phase contract](../account-first-authority.md), [exact bytes](../account-crypto/first-authority.md),
[published vectors](../../test/vectors/first-authority.json),
[construction registry](../account-crypto/constructions.json),
[machine summary](./2026-09-11-account-first-authority/summary.json),
[captured source pins](./2026-09-11-account-first-authority/sources.json).

Final execution: `node scripts/account-first-authority/run.mjs`, with installed Node `v26.8.2`, from
`test-results/account-first-authority/2026-09-11T14-23-17.714Z`. All **27 stages pass**, with no timeout.
The summary retains exact commands and outcomes. The package entry is `pnpm account:first-authority`;
the package-manager launcher was not exercised this turn. The runner invokes installed Node tools directly.

| Evidence | Result |
| --- | --- |
| [Fixed vectors](./2026-09-11-account-first-authority/vectors.json) | 17 positives, 399 input negatives: 168 validation refusals and 231 changed encodings; 333 encoded-field omission controls. Runtime and independent encoders agree. |
| [Generated property](./2026-09-11-account-first-authority/properties.json) | 200 recursive property reorderings, seed `5110912`, shrinking enabled; array order retained. |
| [Production omissions](./2026-09-11-account-first-authority/production-omissions.json) | Six actual message builders lose the tested binding when their digest input omits it; the real signature verifier then accepts the corresponding changed value. |
| [Verifier boundaries](./2026-09-11-account-first-authority/verifier-boundaries.json) | Fixed positive proofs and actual WebAuthn assertion; genuine wrong-purpose, root, epoch-owner and key-namespace signatures refuse. |
| [Semantic boundary](./2026-09-11-account-first-authority/semantic-boundary.json) | Signed descriptor lie passes content-blind verification but refuses with independently supplied coverage; a signed zero-position first-head baseline refuses. |
| [Parser boundaries](./2026-09-11-account-first-authority/parser-boundaries.json) | Nested extra fields, old/mixed versions and reordered arrays refuse. |
| [Registry controls](./2026-09-11-account-first-authority/registry-controls.json) | 19 omitted/misclassified obligations caught, including absent negatives with an updated aggregate vector hash. |
| [Related admission core](./2026-09-11-account-first-authority/admission-core.log) | 12 tests, including the existing 80 generated service histories. |
| [Existing slot verifier](./2026-09-11-account-first-authority/slot-verifier.log) | All 28 tests pass, including the existing Ed25519/ES256 behavior. |
| [Authority check](./2026-09-11-account-first-authority/authority.log) | 40 entries, 46 chains, nine swept documents; 17 specified constructions, 16 explicitly open groups, one non-crypto exclusion. |
| Vector chain / lint / format | All 20 vector-currentness/coverage commands and targeted code/JSON checks pass; the old 225-field AAD corpus remains exercised. |

The generator's 333 controls cover encoded JSON leaves, fixed domains/tags, LP fields and the nested
pending-state/pin/member encodings. They act below parser and semantic predicates. The six production
controls inject an omission into the digest input and exercise message builders plus signature verification;
they do **not** claim to bypass every composite acceptance check. The two raw JSON digest constructions
have input-mutation coverage; they are structural commitments, not signature authorities.

The byte fixture publishes only synthetic keys and contains opaque dummy checkpoint, HPKE-wrap and
recovery ciphertext. It is not an encryption known-answer vector or a Yjs semantic recovery test.
The actual public verifier calls and fixed authenticator assertion test distinct boundaries. The protocol
encoder is independent of production serializers; this is not a claim of independent cryptographic-library
implementation or cross-platform native qualification. No new runtime defect was found by these campaigns.

The earlier `14-17-43.368Z` run passed a narrower 297-control corpus. Review added explicit domain and
nested-component controls and corrected a duplicate newly added section number before this final run.
The `14-20-47.347Z` run passed behavioral/vector stages but stopped at one unused-import lint error;
that import was removed. Those intermediate results remain under `test-results`; this directory preserves
the final passing run, whose captured source hashes match the finished implementation.

No full unit, native-browser, packaged-build or historical aggregate campaign was repeated for this
contract/tooling-only change. All 21 personal package hashes, the historical review hash and L-2 are
unchanged. Personal preview/relay remain stopped; unrelated root files were untouched. No whole-protocol
debt is paid by zero open map-rule entries: the separate Account construction count still has 16 open groups.

Next is **group B: recovery payload/digest/challenge vectors, raw-key export assertions and normative
row-14/TRD alignment**. Envelope/transport and service/local custody/ledger groups follow. Invocation
power-loss accounting, broader review obligations and real Account rollout remain separate gates.
This phase and its preserved evidence remain uncommitted.
