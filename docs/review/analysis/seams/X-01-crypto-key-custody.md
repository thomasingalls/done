---
schema: 1
kind: work-item
id: X-01
status: complete
owner: /root
started: 2026-08-21
updated: 2026-08-21
blocked_on: none
---

# `X-01` — cryptography and key custody

## Scope and exclusions

Independently re-derive the pinned end state's primitive-role separation, domain-separation labels,
suite/carrier versioning, local/content/recovery keys, signing/wrapping/account credential roles, promptless and
factor-gated custody, stale-profile behavior, enrollment rotation, extractability, and agility costs. Distinguish
guessing, key compromise, key substitution, browser-origin execution, file-copy exposure, and service compromise.

Crash/journal ordering beyond its effect on key custody belongs to X-02; accepted-state protocol, lifecycle,
continuity, and platform/evidence population questions belong to X-03 through X-06. Production requirements,
selections, generators, vectors, tests, and application code remain read-only.

## Exact sources inspected

- Original objects: `c6116669030eedeea3d599bca0da3547114e6930:docs/PRD.md` §§6.3–6.5,
  7.1–7.7, 11; `c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §§6.1, 7.1–7.4, 11.2,
  13.1–13.10, 15; and the original
  sequencing/progress register represented by `OC-023`–`OC-029`, `OC-034`–`OC-035`, `OC-039`, `OC-063`,
  `OC-073`–`OC-077`, `OC-079`, and `OC-082`.
- Pinned end state: `9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/PRD.md` §§6.1–6.7, 7.1–7.7,
  11; `9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/TRD.md` §§6.1, 7.1–7.6, 11.1–11.3,
  13.1–13.10, 14.2–14.4, 15; and these selection records at the same full SHA:
  `docs/selections/row-1-algorithm-suite.md`, `row-2-journal-aead.md`, `row-3-record-format.md`,
  `row-4-envelope-format.md`, `row-7-checkpoint.md`, `row-10-portable-package.md`,
  `row-11-enrollment-ceremony.md`, `row-12-account-credential.md`, `row-13-device-lock.md`,
  `row-14-recovery-code.md`, and `row-15-transitions.md`.
- Exact generators/vectors at `9edd930`: algorithm suite, records, envelope, package, enrollment, account
  credential, device lock, recovery, and transitions under `scripts/generate-*.mjs` and `test/vectors/*.json`.
- Lineage evidence: exact diffs and completed cards for `3bea0e6`, `8d7d783`, `f5def83`, `a073574`, `992bc91`,
  `745e332`, `b9ff071`, `4259822`, `83fe22c`, `449db30`, `ff0b48f`, and `9edd930`; completed F-01/F-02 and
  B-01–B-04 analyses; all candidate findings touching this seam.
- Primary external specifications, retrieved 2026-08-21: Web Cryptography Level 2
  (`https://www.w3.org/TR/webcrypto/`) and RFC 9180 (`https://www.rfc-editor.org/rfc/rfc9180.html`).
- Executed from an exact `9edd930` archive at `/tmp/lineage-x01.sEWgob`: suite, device-lock, recovery,
  enrollment, transition, and package generators with `--check`; all passed under Node 26.7.0.

## Method

Reconstruct actors, key derivation/ownership, durable artifacts, state transitions, and compromise consequences from
the exact base and tip objects. Then challenge each invariant with key theft, wrong-key substitution, offline
guessing, stale-profile restore, partial enrollment, suite/version mutation, and provider migration. Compare against
selection reasoning and executable artifacts only after the state model is explicit.

| Relevant claims/rows/commits | Reconstructed invariant | Actors and durable state | Scenario or counterexample | Evidence | Conclusion |
| --- | --- | --- | --- | --- | --- |
| `OC-023`–`OC-026`; rows 1–3, 13; `3bea0e6`, `f5def83`, `dbfd01f` | Persistent content is ciphertext under generation-derived, role-separated keys; optional lock atomically replaces the promptless local opener and rotates forward | Profile reader/origin code; `L_local`, `L_lock`, `K_g`, factor seals, local envelopes, operational reader key | Kill at every lock step; retain a pre-lock snapshot; then test both owed and successfully committed rotation | Exact row-3/13 selections and vectors; WebCrypto storage/extractability model | Local transaction supported; forward promise reopened by the existing owed-rotation finding and the new reader-key bypass |
| `OC-027`–`OC-029`, `OC-073`, `OC-077`; rows 11, 15; `a073574`, `4259822` | Service authorization must never itself select a content recipient; later rotations must reach every independently approved remaining reader | Authorization service, owner clients, new/remaining credentials; epochs, ceremony transcript, wrap map, signed transition | Admit service reader `M`, refuse its ceremony, then rotate for an unrelated reason | Row-11 transcript authenticates one initial `W_pub`; row-15 payload has wraps but no transferable success proof | Reopen: delayed delivery to `M` is reachable under the literal every-reader rule |
| `OC-034`–`OC-035`, `OC-076`; rows 10, 14; `8d7d783`, `745e332`, `ff0b48f` | Generated code seals `R_priv`; public `R_pub` permits ordinary future wraps without escrow; replacement binds a fresh account assertion to one transition | User factor, recovery keypair, service-held ciphertext/wraps/sealed key, replacement client | Guess code; substitute `R_pub`; substitute package root while rewrapping to genuine `R_pub`; replay replacement assertion | Exact recovery/package/transition generators; RFC 9180 base-mode semantics | Entropy/replacement shape supported; package trust-root anchor remains reopened; ordinary `R_pub` distribution unresolved |
| `OC-063`; rows 1, 2, 4; `3bea0e6`, `83fe22c`, `449db30`, `992bc91` | Fresh subkeys separate carriers; authenticated carrier versions select whole suites and unknown suites fail closed | Readers/writers; suite registry, carrier version, domain labels, primitive providers | Label a role `both`; select row 4 while leaving network carrier null; attempt suite migration | Exact suite generator/vector and row-4 envelope vector | Core hierarchy supported; stronger primitive oracle and total carrier registry both reopened |
| `OC-074`; row 12; `b9ff071` | Closed-slot proof verifies a service-bound public key and opens local bytes only; it grants no content or network authority by itself | Person/authenticator, profile editor, service binding, local slot | Replace SPKI with an attacker key and produce a valid assertion under that key | Exact row-12 binding/assertion negatives; WebAuthn verification model | Key-substitution defense supported at composition level; browser embedding policy remains delegated to X-06 |
| `OC-039`, `OC-079`, `OC-082`; rows 1, 11–15; `bd87655`, `9b49b74`, `745e332` | Vector/KAT closure and support criteria must match the provider/artifact users will run | Reviewers, browser floor, WASM/HPKE providers; generators, vectors, compiled seal | Reproduce exact artifacts, then ask whether browser/service/application paths execute them | Six exact tip generators pass; no pinned-tip service or application integration; provider/support findings remain | Deterministic design evidence affirmative; implementation/platform assurance not established and routed to X-06 |

## Analysis

### Re-derived authority and key matrix

The end state needs ten distinct powers. Treating a row as a name rather than a capability is insufficient; the
compromise consequence is the discriminating property.

| Artifact | Durable custody / acquisition | Intended power | Consequence if independently compromised |
| --- | --- | --- | --- |
| Account authenticator / slot verifier | Authenticator private key; local service-signed public binding | Authenticate to the account service or reopen already-local bytes | Account/slot use, not content decryption by itself; it cannot manufacture a reader key or recovery secret |
| Relay admission token | Bounded bearer credential | Obtain transport, ciphertext, wraps, and visible metadata | Availability/metadata access until refusal/expiry, but no plaintext without a separate content-capable key |
| Device signing credential | Structured-cloned non-extractable key, or PRF-sealed bytes imported non-extractable | Sign mutations for its authorized actor | Forge that credential's permitted writes until revocation; cannot unwrap a generation merely because it signs |
| Device wrapping credential | Same two persistence tiers as signing, but a different keypair | Unwrap reader copies of `K_g` | Read any generation wrapped to that credential; cannot sign or change authorization |
| `L_local` | Promptless structured-cloned non-extractable AES-GCM key | Open only this slot's local `KeyEnvelope`s | Read locally retained generations and their content; no account, signing, recovery, or travel power is intended |
| `L_lock` | Random bytes sealed independently to a mandatory generated code and optional per-role PRF outputs | Replace `L_local` as local generation-envelope opener | Same local generations after a factor succeeds; not an account/recovery factor |
| `K_g` and subkeys | `K_g` persists only inside local, reader, and recovery envelopes | Derive store, journal, network, checkpoint, and later index keys for one generation | Read/write every symmetric content carrier in that generation; no authorization or future-generation derivation |
| `R_pub` | Public workspace recovery material | Let ordinary clients create recovery wraps | No decryption alone; substitution can redirect future recovery wraps, so its authentic distribution is load-bearing |
| `R_priv` | Normally absent; persisted only in generated-code/optional-PRF seals | Unwrap recovery copies of retained generations | Recover all generations whose wraps/ciphertext survive, but no account or authorization power; no forward secrecy is claimed |
| Service authorization key/state | Service control plane | Admit/revoke, assign capabilities, serialize/sign epochs and outcomes | May rewrite recognized authorization and deny service, but is claimed unable to forge device signatures or cause key delivery |

This matrix confirms why the asymmetric recovery keypair is necessary: a symmetric recovery root present on every
reader would let a revoked reader derive the future, while one absent from normal readers could not receive routine
rotations. `R_pub` lets a client make a future recovery wrap without holding the unwrapping secret. It also confirms
that signing and wrapping cannot be represented as one generic “device key”: their independent compromise effects
are opposite.

### Primitive, key-domain, and carrier separation

Suite 1 is internally coherent at the primitive level: AES-256-GCM is the asynchronous AEAD; the synchronous crash
journal uses XChaCha20-Poly1305 through the inlined RustCrypto WASM seal; HKDF-SHA-256 derives subkeys; Ed25519 signs
mutations; WebAuthn offers Ed25519 then ES256 for the account credential; HPKE base mode uses X25519/HKDF-SHA-256/
AES-256-GCM; SHA-256 hashes. Credential and slot stretching are “none” for different reasons: generated 125-bit
codes have no entropy deficit, while the slot verifier stores no secret to guess.

The symmetric domain model also survives re-derivation. A fresh `K_g` is input, not a primitive key used directly.
Distinct length-prefixed labels and workspace ids derive at least `done/store/v1`, `done/journal/v1`,
`done/envelope/v1`, and `done/checkpoint/v1`; local generation envelopes use separate `L_*` keys and
`done/keyenv/v1`. Device-lock, recovery, enrollment, generation-wrap, account-binding, and transition labels are
separate protocols rather than aliases. Generation separation follows from fresh `K_g`; workspace separation follows
from the workspace id in each derivation/context. The journal receives only its 32-byte subkey, not `K_g` or a device
credential.

Two executable suite claims do not match that sound core:

1. Existing candidate `f-3bea0e6-suite-separation-ignores-both-path` survives. The generator promises the stronger
   no-shared-primitive rule, but an entry with `path: 'both'` enters neither exact-match bucket. SHA-256 already has
   that label. The narrower and cryptographically necessary no-shared-*key* property can still be true; the declared
   stronger oracle is not.
2. New candidate `f-992bc91-network-carrier-registry-stale` shows the agility registry is not total. Row 4 selected a
   version-1 network envelope under suite 1, while the suite generator/vector still mark it null/unselected and give
   it no acceptance row. `checkCarriers()` treats the stale owner string as sufficient and passes.

For the three mapped carriers, whole-suite versioning is a good fail-closed choice: the authenticated carrier version
selects one compiled suite, no per-record algorithm is negotiable, and unknown versions are retained/refused. The
claimed migration costs are plausible: content converts through the existing trim transaction; the bounded journal
can refuse its old window; local key envelopes reseal while `K_g` is briefly open. The missing network mapping means
the fourth migration path is still only prose.

### Custody tiers and state transitions

Default custody is accurately narrow. A file reader sees ciphertext and a non-extractable handle rather than raw key
bytes, but code executing the same origin can use that handle. WebCrypto's storage and security sections support
exactly that distinction: non-extractability prevents export, not authorized operations by code holding the handle,
and the standard does not promise disk encryption or physical zeroization.

Device-lock enrollment has a sound local transaction:

1. Generate `L_lock`, seal it to the mandatory code and optional per-role PRF factors, and persist `enrolling` while
   `L_local` and live envelopes remain untouched.
2. Stage every retained generation envelope under `L_lock`.
3. In one key-store transaction, swap the staged envelopes, delete `L_local`, and mark `locked`.
4. Rotate the content generation; persist `rotation_owed` until it commits.

The ordering makes loss of all envelope openers unreachable: pre-swap failure remains promptless, and post-swap
failure remains locked but openable. The rotation is necessary because resealing alone leaves a pre-lock snapshot's
old `K_g` able to read future ciphertext. Existing candidate
`f-dbfd01f-device-lock-rotation-caveat-lost` survives because normative “from now on” copy omits the explicitly
reachable locked-but-rotation-owed state.

A stronger cross-role counterexample also survives successful rotation. On the no-PRF operational-key tier, the old
profile contains the same promptless device wrapping key to which ordinary rotation sends a self-reader wrap. With
still-usable relay/account access, that copy can unwrap the new generation without `L_lock`. New candidate
`f-f5def83-device-lock-reader-key-bypass` records this independent path. Local custody cannot deliver its advertised
temporal boundary while a second promptless custody path for the same generation remains unchanged.

### Guessing, compromise, and substitution scenarios

| Scenario | Result of re-derivation |
| --- | --- |
| Offline guessing of recovery/device-lock seal | 25 independently generated Crockford symbols give 125 bits; HKDF rather than stretching is sound only while full-width generation, confirmation, and no user choice/truncation remain normative. Normalization changes spellings, not the secret space. |
| File-copy inspection on the default tier | Raw persistent content remains ciphertext, but an executable copy can exercise promptless handles. The end state states this boundary honestly. |
| Same-origin hostile code / bad release | Can use live keys and read plaintext; client-side encryption does not protect while it runs. `R_priv` being normally absent limits ordinary exposure, but any factor entered during compromise is lost. |
| Compromised signing key only | Can produce authorized writes, not decrypt. This survives because recipient selection uses a distinct wrapping key. |
| Compromised wrapping key only | Can read every generation wrapped to that credential, including future ones until revocation; cannot sign. The device-lock composition fails to account for a copied instance of this legitimate power. |
| Compromised `K_g` | Exposes all derived content roles for that generation, not service authority, recovery identity, or later fresh generations. History erasure/forward secrecy is explicitly not promised. |
| Compromised `R_priv` | Exposes every retained recovery-wrapped generation and future wraps made before replacement; it does not authenticate an account or a mutation. This is the intended large recovery blast radius. |
| Malicious authorization service | Immediate enrollment delivery is stopped by row 11, but later rotation has no transferable, client-authenticated reader-eligibility state. `f-c611666-rotation-reader-eligibility-missing` gives the delayed-delivery trace that violates E-04. |
| Public-key substitution in a closed local slot | The service-signed binding covers account/principal/RP/epoch/credential/SPKI, and the exact negative substitutes a valid attacker key. A profile editor alone cannot make it pass. |
| New-device wrapping-key substitution | Row 11's committed-nonce typed SAS covers workspace, epoch/head, both credentials, and `W_pub`; the HPKE `info` covers the transcript hash. A service-chosen replacement key changes the typed value. |
| Portable-package trust-root substitution | Existing high candidate `f-745e332-package-root-rewrap-substitution` survives: base-mode HPKE authenticates no sender, so a package writer can make a fresh wrap to genuine `R_pub` while choosing the attacker root placed in `info`. Mutating `info` on an old ciphertext is not the paired attack. |

The delayed-delivery scenario is a logical two-gate contradiction, not a primitive failure. Let a malicious service
admit `M` with read capability; honest clients refuse its row-11 ceremony. On a later legitimate revocation, the
owner must either follow §13.7 and wrap for every service-declared remaining reader (delivering to `M`) or silently
maintain an independent eligibility set that no selected artifact defines. A local success bit cannot solve the
multi-device case because a different owner may later rotate. The missing state must be durable, transferable, and
unforgeable by the authorization service.

### Recovery, extractability, and agility boundaries

Recovery keeps its four objects separate: account access, authorization, content-key access, and ciphertext. Losing
any independently necessary object produces a named degraded or permanent-loss state rather than a hidden service
backdoor. The mandatory code seals `R_priv`; optional PRF seals add convenience/diversity but do not change the root
path. Recovery may enroll a replacement device, but it may not open a factor-locked old slot. Replacement correctly
requires existing content access and a fresh account assertion over the signed transition id; the old code is
deliberately unnecessary.

The selected use of HPKE base mode is appropriate only where sender/key-selection authenticity comes from the
application protocol. Row 11 supplies it through the human transcript. Rotation is intended to supply it through the
owner-signed transition and an authentic reader registry, but the latter is missing. The package root attempted to
supply it through attacker-chosen `info`, which does not authenticate the sender. Routine reader-wrap `info` and the
authentic distribution of `R_pub` to an ordinary newly enrolled device are not fully specified and remain unresolved
below rather than being credited to HPKE itself.

## Affirmative conclusions

- The logical separation among account proof, transport, signing, wrapping, local custody, content generations,
  recovery, and service authorization is necessary and mostly well drawn. Signing/wrapping and `R_pub`/`R_priv`
  asymmetry survive independent compromise analysis.
- Fresh per-generation roots plus length-prefixed, workspace-bound derivation labels give a coherent symmetric key
  hierarchy. The synchronous seal receives only a journal subkey, satisfying the load-bearing no-shared-key rule.
- The mandatory 125-bit generated-code invariant justifies no stretching for device lock and recovery; the public-key
  slot verifier has no guessable secret at all. These are three distinguishable arguments, not one slogan.
- The device-lock *local* reseal/delete transaction is fail-closed and preserves an opener across every pre-commit
  interruption. Forward rotation is necessary; re-encrypting history would add cost without revoking a copy that
  already read it.
- The account-slot public-key binding and row-11 immediate wrapping-key ceremony each resist the specific key-
  substitution attack they claim, at the composition/vector level.
- Whole-suite carrier versioning is preferable to algorithm negotiation and is correctly authenticated for content,
  journal, and local key-envelope carriers. The finding is missing totality for network envelopes, not a rejection
  of the design.
- Recovery's four-object model, explicit permanent-loss outcomes, lack of service escrow, and lack of forward
  secrecy are internally honest. Non-extractability is scoped as an API/export boundary, not disk protection or
  hostile-origin protection.
- All six exact tip generators rerun in this seam reproduced their committed outputs. That establishes deterministic
  specification artifacts and selected primitive KAT/composition behavior, not browser/service integration.

## Candidate or validated findings

- New, high/high: [`f-c611666-rotation-reader-eligibility-missing`](../../findings/f-c611666-rotation-reader-eligibility-missing.md).
  A service-only reader is refused initially but can receive the next key because rotation has no durable
  client-authenticated eligibility object.
- New, medium/high: [`f-f5def83-device-lock-reader-key-bypass`](../../findings/f-f5def83-device-lock-reader-key-bypass.md).
  On the no-PRF operational tier, a copied profile can use the device's unchanged reader key to bypass a successfully
  rotated local lock envelope.
- New, medium/high: [`f-992bc91-network-carrier-registry-stale`](../../findings/f-992bc91-network-carrier-registry-stale.md).
  The selected version-1 network carrier remains null/unselected in the suite registry, and the supposedly total
  oracle accepts it.
- Existing candidates that survive this seam's challenge:
  [`f-745e332-package-root-rewrap-substitution`](../../findings/f-745e332-package-root-rewrap-substitution.md),
  [`f-dbfd01f-device-lock-rotation-caveat-lost`](../../findings/f-dbfd01f-device-lock-rotation-caveat-lost.md), and
  [`f-3bea0e6-suite-separation-ignores-both-path`](../../findings/f-3bea0e6-suite-separation-ignores-both-path.md).
- Evidence/platform candidates for X-06 rather than duplicated here remain relevant to assurance:
  `f-bd87655-x25519-support-floor-omitted`, `f-9b49b74-rustcrypto-audit-version-gap`, and
  `f-9b49b74-wasm-glue-key-nonce-lengths`. Historical `f-dbfd01f-row20-closes-unvectorized-hpke` remains a valid
  timing/closure finding even though row 10 later adds executable RFC 9180 evidence.

## Disconfirmed hypotheses and null results

- **No generic key-role collapse.** Reusing one library/provider does not make signing and wrapping one credential;
  the documents and vectors keep distinct keypairs and compromise effects.
- **No direct `K_g` reuse on the journal path.** The journal receives a distinct HKDF output and the WASM API does
  not need the generation root. The separate B-04 finding concerns a rotated-vector oracle, not the selected
  derivation rule.
- **No entropy reason to add Argon2id.** At 125 generated bits, stretching does not repair a meaningful deficit and
  would replace a stable invariant with a decaying hardware parameter. This null reverses immediately if codes become
  user-chosen, shortened, or partly generated.
- **No PRF-availability security fork for the factor seals.** The code is mandatory and complete; optional PRF seals
  are additional paths. The distinct operational-key tier still matters to the reader-key bypass finding.
- **No immediate enrollment key-substitution defect.** Commit/reveal stops the second speaker grinding the SAS;
  typing authenticates the new wrapping key/head; transcript-bound HPKE prevents swapping a wrap from another
  ceremony. Human-screen compromise remains explicitly out of scope.
- **No account-binding substitution by local profile edit.** A valid assertion under an attacker SPKI is rejected
  unless the service-signed binding also changes. Cross-origin ceremony policy remains a separate X-06 candidate.
- **No per-record algorithm downgrade on the three registered carriers.** Their authenticated versions select the
  whole suite and unknown values fail. The network carrier's missing registry entry is the bounded exception.
- **No claim of history erasure or forward secrecy.** Revoked readers and compromised recovery keys retain old
  generations; the specifications say so. Treating that as a vulnerability would erase a deliberate boundary.
- **No browser-forensic zeroization guarantee.** “Erase” is a logical lifecycle instruction. WebCrypto does not
  promise physical key deletion after references disappear, and the end-state same-origin/file boundaries prevent
  crediting it with one.
- **No finding from HPKE base mode alone.** Base mode is not sender-authenticated, but it can be composed safely when
  an independent application-layer binding selects the recipient/context. The concrete failures are the missing
  rotation eligibility binding and the rewrappable package anchor, not the primitive choice by itself.

## Unresolved questions

- What exact durable object carries a successful enrollment's `(lineage, credential, wrapping public key)` binding
  to a different future rotating device, and who signs it independently of the authorization service?
- How does an ordinary newly enrolled device authenticate `R_pub` and the sealed `R_priv` it receives without
  presenting the recovery code? Row 11 authenticates its own `W_pub` and the epoch head, not an explicit recovery-key
  payload. Test malicious-service substitution before concluding this is implied by a “workspace package.”
- What is the routine non-enrollment reader-wrap `info`/AAD and recipient-key identifier? Enrollment and recovery
  wraps are explicit; row 15 treats reader wraps as opaque values.
- Can the current device's self-reader wrap be omitted or made factor-gated without breaking store-and-forward
  recovery, and if so where is that invariant enforced? This is the strongest possible disconfirmation of the
  device-lock reader-key finding.
- Which HPKE implementation/provider ships, and on what X25519 browser/support floor? The selected identifiers and
  exact RFC vector do not answer as-built provider/platform assurance; X-06 owns that decision.
- All conclusions above are design/vector conclusions. No application key store, account service, relay, enrollment
  ceremony, or transition implementation exists at the pinned tip to establish browser/runtime conformance.

## Completion criteria

- [x] Required claims/rows/commits are mapped to reconstructed invariants, actors, durable state, scenarios,
  evidence, and classified conclusions.
- [x] Primitive/key-domain separation and suite/carrier agility are re-derived rather than inherited.
- [x] Key compromise, substitution, guessing, browser-origin execution, and file-copy exposure are separated.
- [x] Promptless/device-lock custody and enrollment rotation include stale-copy and partial-transition cases.
- [x] Findings and disconfirmed hypotheses are durable, with the strongest falsification attempt recorded.

## Handoff

Complete. Run `node scripts/review-status.mjs`; the first dependency-ready unclaimed item is `X-02`, crash and
persistence. Carry the three new findings and the three surviving existing candidates into P-01, S-01, and V-01
without treating design-vector reproduction as implementation evidence.
