# Account cryptographic contract closure review — F-05 and F-06

2026-09-11. Reviewed against signed D8 commit `393ef435af72a5c0b8e2d19b410a5d932400f902`
and the documentation/runner changes recorded in the accompanying patch. **F-05 and F-06 are closed within the scope below.**

This is the current disposition of these two findings in the
[historical implementation packet](./af8941e-96a2040.md#f-05-account-phase-constructions-are-outside-the-authority-maps-sweep-and-the-trd-three-durable-root-signed-encodings-appear-in-no-document).
That packet and its original responses remain unchanged. This record supersedes the phase-local
“F-05/F-06 remain open” status notes in A/B/C/D1–D8; their byte rules and recorded evidence limits remain.
The review does not dispose of other packet findings or establish completion of Stage 4.

## 1. Decisions and precise scope

| Finding | Disposition | Importance and reasoning |
| --- | --- | --- |
| **F-05: unregistered and underspecified Account constructions** | **Closed** for the current private first-epoch Account protocol | High validation/interoperability importance, without a demonstrated encryption break. The runtime inventory now joins exact source sites and primitive roles to pinned byte homes, permitted authority chains, published vectors and executed tests. First-epoch/offer/receipt bytes and the initial empty-head rule are explicit. Retained Local claim dependencies are included. The four inherited migration/Local-operation groups have a separate, justified scope disposition. The original omission is repaired; the result does not qualify later epochs, enrollment or all reachable cryptography in every dependency. |
| **F-06: scalar-only row-14 vector versus the 96-byte runtime payload** | **Closed** for the current private v1 recovery envelope | Medium-high interoperability importance. TRD §13.8, row 14, current vectors, generator and opener now agree on raw X25519 scalar, binary root commitment and raw Ed25519 seed, 32 bytes each, with a 112-byte ciphertext/tag. Historical 48-byte ciphertext is preserved separately and explicitly refused. Correctly authenticated wrong keys, roots, segment layouts and contexts exercise the real opener. This does not implement replacement or total-loss recovery. |

Closing a documentation/vector finding does not require completing unrelated runtime state machines.
Conversely, passing a label census or writing “tested” into a registry would not close either finding.
The decisions above rest on the byte and owner evidence below, inspected at their actual boundaries.

## 2. F-05: original allegations and their current evidence

| Original gap | Current source, specification and execution |
| --- | --- |
| Account documents omitted from the authority sweep | `scripts/check-authority-map.mjs` now sweeps eleven exact Account crypto homes in addition to the original eight documents. `scripts/account-first-authority/registry.mjs` separately joins the source census to construction records, checking labels/sites, explicit roles, section pins, map entries, vector ownership, test references and required evidence. A glob over prose alone would still miss HMAC/KDF and unlabelled primitives. |
| First epoch, offer and receipt encodings | [First-authority §§1–2](../../account-crypto/first-authority.md#1-primitive-encodings-and-nested-object-order) and its recursive JSON schema pin field order, exact signature exclusions, inner-signature retention, LP/domain/hash layers and offer-head derivation. Current receipt is v2 after the separately completed activation repair. TRD §13.5 links these private encodings; the old v1 receipt is not silently presented as the current protocol. Phase A executes all 17 fixed constructions and their 399 input negatives/333 encoded omissions. |
| Empty versus member-at-position-zero genesis heads | First-authority §3, TRD §§7.6/13.5 and rows 5/7 select the empty accepted-head vector only before any Account acceptance. The independent digests differ; the genuine signed explicit-zero baseline refuses. Certification still names the member. This is not a sparse-vector rule for successor epochs. |
| Bootstrap, pending observation, creating candidate/certification/origin and slot binding | A pins separate authority, member, bootstrap and account-authenticator dependencies. Real verifier tests use fixed valid signatures, wrong-purpose/root/owner/credential-namespace proofs and a real authenticator assertion. A signed descriptor lie remains acceptable to the content-blind verifier and is rejected only with independently supplied content coverage; the tests preserve that distinction. |
| Envelopes, submissions, heads/refusals, responses, reads and service witness | [Transport §§2–7](../../account-crypto/transport.md#2-network-key-encryption-and-signature) specifies 37 fixed constructions and current v1/v2 distinctions. Tests execute wire bytes, signatures, exact signed-request hashes, ordered nested pages and witness chains. Carrier parsing, member attribution and acceptance/readback authority remain separate. A v1 reader compatibility vector does not authorize v1 minting. |
| Service root and acceptance custody | [D1](../../account-crypto/service-custody.md) pins all three KDFs, both AES-GCM seals, pin/proposal AAD and exact DER exports. Actual SQLite creation/opening, authentic wrong-seed payloads, held-pin changes, closed-owner use and failure cleanup have effective source controls. Operator custody is not a client content trust root. |
| Promotion, capsule, ledger and counter metadata | [D2](../../account-crypto/local-promotion.md), [D3](../../account-crypto/account-ledger.md) and [D4](../../account-crypto/content-counter.md) specify versioned MAC/carrier bytes, deterministic identities and witness coupling. Tests distinguish parser refusal, changed authenticated bytes, canonical carrier syntax, valid local re-encryption around false service evidence and ordered owner acceptance. MAC success alone is insufficient. |
| Recovery key checks and digests | [B](../../account-crypto/recovery-layout.md) specifies the recovery key correspondence message, root/envelope/state/draft digests and initial challenges. The review table's generic “service HMAC” description was inaccurate: the relevant objects include SHA-256 commitments, factor-opened bootstrap signatures and root-signed observations. Registry roles follow the implementation. |
| Remaining live Local dependencies | [D5](../../account-crypto/store-journal.md), [D6](../../account-crypto/local-custody.md), [D7](../../account-crypto/checkpoint.md) and [D8](../../account-crypto/local-provenance.md) tie the reused content/journal/custody/checkpoint/claim constructions to exact bytes and native owners. Imported selection and cleanup wrappers remain authenticated during Account promotion/startup; they are not removed from scope merely because migration is finished. |

The map has **80 entries, 102 permitted-root chains and 19 swept homes**. The source census has
**158 production files, 89 labels/templates and six manual entrypoints**. The construction registry
has **78 specified records, zero open groups, four inherited groups and one non-crypto exclusion**.
These are different units. A label can name a carrier or appear in several operations; none of these
counts measures “percentage of the protocol proven.”

The reviewed authority edges keep the service at serialization/availability roots. Client keys and
content still require factor-opened custody, certified member/bootstrap endorsements and structural
coverage checks. No permissive service-to-content root was added to make a checker pass.

## 3. Unlabelled primitives and inherited limits

The manual review read the six prep entrypoints and traced the nearby digest, sign/verify, derive and
encrypt/decrypt call sites. The preserved source query is a navigation aid, not an exhaustive AST or
reachability proof. The source hash gate catches drift but cannot decide whether a new operation is safe.

| Boundary not established by a `done/` label | Disposition |
| --- | --- |
| `src/account/generationWrap.ts` standard HPKE schedule | B §4 and its published recipient vector use the standard suite labels and sequence-zero one-message schedule. Runtime sealer/opener and independent reconstruction are executed; generation-crypto tests cover changed info/ciphertext and low-order recipients. No sender-authentication claim is attached to HPKE base mode. |
| `account-service/webauthn.ts` and `src/account/slotUnlock.ts` | The service supplies exact challenge, RP/origin, credential/account and UP/UV requirements to the retained verifier dependency; the slot verifier uses the original authenticator/client-data bytes and compiled Ed25519/ES256 encodings. A/B and the slot-verifier tests qualify this integration. This review is not a fresh audit of the dependency or browser authenticator implementation. |
| Sorted proof JSON and decoded retry hashes in `account-service/protocol.ts` | B §3 describes these separately from ordered protocol JSON. Tests compare a nested proof's sorted encoding/hash and decoded 32-byte retry hash against independent values; challenge changes include actual fresh nonce changes. |
| Unlabelled request/completion/ciphertext commitments in `account-protocol/admission.ts` | A §§2/6 and the descriptor corpus bind full signed objects or exact decoded ciphertext, as applicable. The activation nonce, completion digest, manifest digest and head hash retain distinct purposes. |
| Custody raw-root opening and credential correspondence | D6 pins the raw root/envelope/credential schedules and exact exported formats; authentic wrong-private-key ciphertext reaches correspondence checks. The post-D6 strict state-parser repair remains present. |
| Journal WASM and dependency primitives | D5 independently checks ciphertext/AAD/carrier bytes against the inherited journal implementation and native owner. The earlier WASM/storage evidence retains its original scope; this is not a new Rust/dependency/whole-Local security audit. |
| Legacy export/import-plan unlabelled hashes | `legacyExport.ts` hashes exact recovery/Markdown packets and `legacyImportPlan.ts` hashes the import plan. Their producers belong to migration. Account treats retained digest strings as data authenticated by the D8 claim, and does not re-run those producers during open. Their historical migration qualification is not silently upgraded by this review. |

The four explicit inherited groups are Local clear, pre-active import, legacy-source observation and
cleanup fingerprints (eight labels total). D8 requires exact label/primitive/scope sets and pinned
historical evidence. Native tests replace the four operational entrypoints with throwing barriers:
fresh/imported/cleanup Account handoff and cold classification succeed, while direct probes hit every
barrier. Clear/import rows can block access without invoking deletion or their authenticators.
The shared cleanup parser and payload encoder remain inside live D8 evidence.

These tests bound the actual tested Account paths, not all possible calls or future code. An authenticated
incomplete cleanup cursor does not prove plaintext absence; Account opening does not run cleanup or
assert completion. The Local-clear owner retains its separate completion/source-absence requirement.
None of these dispositions restarts migration tooling or claims whole-profile erasure.

## 4. F-06: exact recovery consistency

Current private v1 recovery plaintext is:

```
[0,32)  raw X25519 private scalar
[32,64) binary SHA-256 root commitment
[64,96) raw Ed25519 bootstrap seed
```

The root is not hex text; the final segment is neither expanded Ed25519 secret material nor PKCS#8.
Current AES-GCM appends one 16-byte tag, producing exactly 112 ciphertext bytes. The fixed code, salt,
nonce, keys, root, KDF info/key, AAD, plaintext, ciphertext and derived public keys are published.

`test/account-recovery-contract/formats.test.mjs` compares the amended row-14 primary seal with the
independent current corpus, opens both principal fixtures and all normalization positives in the real
opener, and drives the actual generator with deterministic test inputs. It reconstructs envelope/state/
draft digests and the confirmation signature, then checks the service verifier. Both key pairs and the
sealed root must correspond before the callback receives non-extractable handles.

The independently authentic reseals with wrong private keys, root, segment order or size do not merely
fail AEAD. They reach the appropriate parser or semantic check. Source controls remove context/root/
X25519/Ed25519 checks and rescue their matching counterexamples. Separate exact PKCS#8 checks, introduced
for F-12 during B, refuse malformed exports before sealing and clear observed temporary buffers.

`test/vectors/historical/recovery-code.scalar-only.json` retains the former 48-byte ciphertext and its
provenance. It independently opens to the old scalar but refuses as a current draft. Current vector
generation never overwrites that history. Replacement step-up vector currentness does not demonstrate
a built recovery-replacement or total-loss recovery machine.

## 5. Aggregate execution and evidence interpretation

[The preserved aggregate campaign](../../account-conformance-runs/2026-09-11-account-crypto-audit.md)
passes all **71 stages** with **870 matching source pins**. It executes all **27
registry-declared test files**, plus the prep/registry and recovery/HPKE bridges: **237 Node tests
in 36 files**, including **100 tests in 11 native files**. The separate slot and
v2 transport unit bridges and all 30 vector commands pass. Per-file logs/JUnit and the construction
crosswalk preserve exact execution and counts. No test was skipped or stage timed out.

The historical-source comparison identifies only the already-recorded recovery/export/custody repairs
and D6 state-parser change since the earlier phase runs; D6–D8 runtime source pins match current code.
Current execution is used for the declared tests, rather than relabelling those older receipts.
No production defect was found in this bounded audit.

The eleven phase corpora contain **159 fixed cases, 4,332 published input negatives and 4,106 encoded
omission controls**. These counts describe corpus entries. They are not all full-owner adversarial
histories: some isolate a primitive below parsing, some distinguish bytes, and some are parser refusals.
The accompanying crosswalk lists each construction's cases, roles, homes, authority entries and test
files. The review read the actual loops and verifier/control tests rather than inferring execution from
the registry's nonempty-array checks.

The test distinction matters. Independent encoders can expose a KDF field omission even when the same
flawed producer/consumer still round-trips. Genuine signatures or valid local encryption around false
semantic evidence test a different boundary. Source/crypto-input controls remove a real binding or guard;
they do not establish that every composite owner would accept the same attack. Generated campaigns have
their recorded seeds and scopes; no counterexample means none found in those bounded runs.

Node/OpenSSL and browser WebCrypto may share underlying primitive implementations. The new byte oracles
are independent of production serializers, not universally independent cryptographic implementations.
Native renderer death is not power failure. Logical buffer clearing is not provider/GC/OS erasure.

The current registry and checker status messages were stale after D8. This phase corrects that reporting
and adds the aggregate runner; it does not change production code, valid stored bytes or any vector.
Earlier evidence and phase-local status notes remain dated; their historical hashes are not rewritten.

## 6. Subsequent work and remaining gates

The aggregate audit was committed signed as `ec889d9`. Its F-05/F-06 scope and historical execution
remain as recorded above. The subsequent [F-15 disposition](./reservation-durability.md) separately repairs
reservation persistence under explicit platform/history assumptions; it does not relabel this audit as
power-loss evidence.

F-15 was committed signed as `c10dee3`. The subsequent
[cross-account admission isolation campaign](./account-isolation.md) closes F-21.3 at the current
private admission boundary: two recognized accounts in one service, real capability/proof swaps,
full durable-state checks, generated interleavings and actual process restart. All three ownership
omission controls are detected. No production defect was found or runtime code changed in that phase.

Next is service-issued refusal/conflict composition (F-21.7) through the actual browser delivery owner,
including lost replies and restart. Remaining parser, delivery-oracle, residue, diagnostic and performance
findings retain their separate obligations; this conformance result does not close them.

Platform qualification, whole-profile residue, general lineage/checkpoint evolution, enrollment/adoption,
revocation/rotation, finalization, recovery replacement, total-loss recovery, deployment/restore and
independent review remain open. The personal installation remains Local; there is no real Account receipt.
