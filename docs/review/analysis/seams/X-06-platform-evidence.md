---
schema: 1
kind: work-item
id: X-06
status: complete
owner: root
started: 2026-08-26
updated: 2026-08-26
blocked_on: none
---

# `X-06` — platform and evidence

## Scope and exclusions

Audit WebCrypto, WebAuthn, browser, WASM, and SIMD availability at the selection's decision time and promised
support floor; ASVS coverage and addenda; official KAT provenance; generator/verifier independence; negative-test
isolation; benchmark method, bundle accounting, and device generalization. Production code, requirements,
selection records, generated vectors, and tests are read-only. Propagation belongs to `P-01`, combined lifecycle
scenario replay to `S-01`, and independent candidate disposition to `V-01`.

## Exact sources inspected

- Pinned lineage `c6116669030eedeea3d599bca0da3547114e6930..9edd9300adebcec3abd2234c946f1dcccdc17eef`
  by exact object name, without moving the checkout: tip `docs/TRD.md` sections 10.9-10.11, 12, 13.9-13.10,
  and 15; `docs/DEVELOPMENT.md`; `docs/PERFORMANCE.md`; row 1, 2, 12, and 17 selection records;
  `package.json`; the suite, AAD, origin-isolation, benchmark, browser-baseline, and WASM build/check scripts;
  `wasm/seal/Cargo.lock`; `wasm/seal/src/lib.rs`; and `src/crypto/seal.generated.ts`.
- Decision-point reviews for `caee157`, `3bea0e6`, `b9ff071`, `5bd9552`, `83fe22c`, `9b49b74`, `f58e0de`,
  `6b021c4`, `138a5f8`, `3670591`, `66a7c6a`, `98f2a83`, and `bd87655`, plus their cited
  contemporary artifacts and the relevant candidate findings already in `docs/review/findings/`.
- [WebDX Web Features, Baseline definition](https://web-platform-dx.github.io/web-features/web-features/),
  living specification retrieved 2026-08-26; [MDN browser-compat-data `SubtleCrypto`](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/SubtleCrypto.json),
  repository data retrieved 2026-08-26; and [Web Cryptography Level 2](https://www.w3.org/TR/webcrypto-2/),
  retrieved 2026-08-26.
- [Web Authentication Level 3](https://www.w3.org/TR/webauthn-3/), Candidate Recommendation Snapshot dated
  2026-05-26 and retrieved 2026-08-26, including PRF registration output, platform-authenticator discovery,
  assertion verification, and Permissions Policy sections.
- [WebAssembly JavaScript Interface](https://webassembly.github.io/spec/js-api/), editor's draft dated 2026-08-12
  and retrieved 2026-08-26; [WebAssembly SIMD proposal](https://github.com/WebAssembly/simd), retrieved
  2026-08-26; and Chromium's [8 MiB synchronous main-thread compilation cap](https://chromium.googlesource.com/chromium/src/+/d1a1a8fdd9b28feaf5d3accc0578092444a1083e%5E%21/),
  retrieved 2026-08-26.
- [OWASP ASVS 5.0.0 release](https://github.com/OWASP/ASVS/releases/tag/v5.0.0_release), dated 2025-05-30;
  its [official CSV](https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv);
  and the [release list](https://github.com/OWASP/ASVS/releases), all retrieved 2026-08-26.
- Official or primary vector sources: [RFC 5869](https://www.rfc-editor.org/rfc/rfc5869.html),
  [RFC 8032](https://www.rfc-editor.org/rfc/rfc8032.html), [RFC 9180](https://www.rfc-editor.org/rfc/rfc9180.html),
  [FIPS 180-4](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf), the NIST-hosted
  [McGrew/Viega GCM proposed specification](https://csrc.nist.rip/groups/ST/toolkit/BCM/documents/proposedmodes/gcm/gcm-revised-spec.pdf),
  and [draft-irtf-cfrg-xchacha-03](https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha-03), all
  retrieved 2026-08-26.
- The [RustCrypto `chacha20poly1305` changelog](https://github.com/RustCrypto/AEADs/blob/master/chacha20poly1305/CHANGELOG.md)
  and [NCC Group RustCrypto review](https://www.nccgroup.com/research/public-report-rustcrypto-aesgcm-and-chacha20pluspoly1305-implementation-review/),
  retrieved 2026-08-26. The reviewed module dates to 2019; the pinned crate is `0.10.1` from 2022.

## Method

- Reconstructed each assertion at its decision commit and again at exact tip. I separated compatibility facts,
  product policy, runnable evidence, and population-generalization claims rather than allowing one to stand in
  for another.
- Classified each oracle by provenance and independence: external standard KAT, a different implementation,
  project-owned generator/verifier, structural linter, device observation, or prose assertion.
- Built a disposable archive of exact tip. Under Node `v26.7.0`, the suite, record, device-lock, recovery,
  enrollment, transition, package, account-credential, and browser-baseline checks passed. The exact WASM blob
  passed all eight checks. The AAD checker ran 15 non-journal generators and confirmed that all 151 declared AAD
  fields had a published isolating negative; the journal generator could not run because the archive had no
  installed `@noble/ciphers`, so its four declared fields were checked statically against the generated negatives.
- Tried the strongest cheap disconfirmations: reinterpret Baseline as a performance floor; locate the omitted
  X25519 capability in the policy; make PRF or platform-authenticator absence a lockout; find an independent
  composition oracle; find an application-shaped benchmark population; and change reviewed Rust source without
  rebuilding its checked-in blob. The final experiment is a surviving counterexample: after changing `MAX_AAD`
  only, `check-wasm-seal` still passed eight checks while `build-wasm-seal --check` reported a stale artifact.

## Analysis

| Relevant claims/rows/commits | Reconstructed invariant | Actors and durable state | Scenario or counterexample | Evidence | Conclusion |
| --- | --- | --- | --- | --- | --- |
| TRD 10.11; `bd87655` browser floor | A browser feature floor establishes interoperable APIs, not a lower bound on device performance. | WebDX compatibility policy; browser version data; no device-class state. | A supported old/low-end device can implement every Baseline feature yet be slower than the measured Pixel. | WebDX defines Baseline over core-browser interoperability and recency, not CPU, memory, or device performance. | **Reopen performance inference.** Baseline policy is usable for feature availability, but cannot justify the claimed device-population lower bound (`f-bd87655-baseline-not-performance-floor`). |
| TRD 10.11; row 1; `bd87655` | Every load-bearing browser primitive must be in the compatibility inventory and executable support-floor test. | Browser WebCrypto; generated suite test; moving browser floor. | X25519 is required for selected HPKE but the inventory names only Ed25519, PRF, and platform authenticators. | Current BCD reports X25519 in Chrome 133, Firefox 130, and Safari 17; current compatibility is therefore not disproved, but the floor policy and test omit it (`f-bd87655-x25519-support-floor-omitted`). | **Qualified/reopen.** Ed25519 dates are affirmed; add X25519 and build-time conformance rather than relying on today's data. |
| TRD 13.9-13.10; rows 12/14; `b9ff071` | Optional WebAuthn convenience must be discovered at runtime/per credential and must not replace the recovery root. | Credential PRF `enabled` result; platform-authenticator availability; mandatory recovery code; signed client data. | PRF is unsupported for a credential, or no platform authenticator is available. | WebAuthn L3 defines both runtime signals. Project flows keep the recovery code mandatory and WebAuthn optional. | **Affirmed with policy qualification.** Capability absence is not lockout. Assertion verification still omits cross-origin/top-origin policy (`f-b9ff071-webauthn-cross-origin-policy`). |
| TRD 10.9; `9b49b74`; `83fe22c` | The selected synchronous WASM module must be small enough, available on supported engines, and exactly the reviewed implementation. | Embedded 6,465-byte module; JS wrapper; Rust source; generated bytes; browser engine. | A browser rejects sync compilation, lacks SIMD, or the blob no longer corresponds to source. | JS API specifies synchronous `WebAssembly.Module` and permits implementation limits; Chromium's historical main-thread limit is 8 MiB. The exact 6.3 KiB module was instantiated in the three engines at decision time and is built with `+simd128`. A source-only mutation leaves `wasm:verify` green but fails `wasm:stale`. | **Qualified/reopen.** Size and observed engine availability are credible; moving-floor conformance and mandatory source/blob freshness are not closed (`f-9b49b74-wasm-source-artifact-drift-unchecked`). |
| TRD 12; row 17; `5bd9552` | The selected ASVS profile must be version-pinned, honest about deviations, and mapped to executable product evidence. | ASVS 5.0.0 L2 requirements, 8 L3 additions, 5 project addenda, V14.3.3 deviation, generated profile. | The structural generator passes while a selected control is absent from production. | 5.0.0 was the current stable release at retrieval. Generator checks exact IDs/levels/profile structure, not implementation; most verification is explicitly future. A1's origin scan is regex-based and misses dynamically constructed loads (`f-5bd9552-origin-scan-static-forms`). | **Qualified/reopen.** Version and profile selection are affirmed; implementation coverage and broad A1 wording are not. |
| Row 1; `3bea0e6`, `9b49b74`; suite/WASM generators | Official KATs must pin external primitive behavior; project composition needs an oracle independent of the generator's model. | RFC/FIPS/draft vectors; Node WebCrypto; RustCrypto blob; project serializers and verifiers. | Generator and verifier share the same wrong field ordering but still reproduce a primitive KAT. | AES-GCM, HKDF, Ed25519, SHA-256, and XChaCha vectors trace to primary sources. Project composition cases are self-authored; HPKE's RFC 9180 vector arrived only later (`f-dbfd01f-row20-closes-unvectorized-hpke`). | **Affirm official primitive provenance; qualify composition independence.** Named KATs prevent primitive drift, not shared-model errors. |
| TRD 10.10; `f58e0de`, `98f2a83`; AAD checker | Every declared authenticated metadata field must have a negative that changes only that field and causes failure. | Generator-declared AAD field list; positive/negative vector pairs; project checker. | An undeclared semantic field is omitted from AAD, or two bytes change together. | The checker confirmed 151 fields across 15 runnable generators, each isolated by a published negative; journal's four declared fields match static negatives. The declaration is supplied by the generator being checked. | **Affirm isolation; qualify completeness.** The evidence detects non-isolating declared negatives, not omitted semantics or application-side byte reconstruction. |
| `66a7c6a`, `3670591`; `docs/PERFORMANCE.md` | A benchmark must exercise the selected state transition and support only the population to which its measurements generalize. | One Pixel device/session; JS and WASM microbenchmarks; fixed benchmark slot; no committed raw samples. | Fixed-slot overwrites are warmed in-place rather than immutable appends, or another supported device is slower. | The paired Pixel observation strongly rejects the desktop-throttling surrogate and shows WASM p95 of 35/65/240 microseconds versus JS 145/295/1915 for 18/419/4096-byte AAD. It neither samples a device population nor the full durable append path (`f-66a7c6a-journal-benchmark-overwrites-one-slot`). | **Qualified/reopen.** Valid single-device microbenchmark and falsifier; invalid population/performance-floor generalization. |
| `138a5f8`, `6b021c4`, `83fe22c`; bundle reviews | Bundle and readiness evidence must measure the selected artifact and async cost it claims to compare. | Bundler outputs; gzip sizes; libsodium readiness promise; final 4.5 KiB provider delta. | Timing only the post-ready query understates libsodium initialization, or a historical size proxy cannot be reproduced. | Exact findings document both weaknesses. Later measurement of the actual WASM provider substantially supersedes the proxy and still favors the selected design. | **Qualified.** Final provider-size conclusion survives; historical provenance and readiness labels remain inaccurate (`f-138a5f8-libsodium-readiness-timing`, `f-6b021c4-wasm-size-proxy-unreproducible`). |
| `caee157` plaintext baseline | Baseline provenance must identify the exact code and harness measured. | Parent commit, handwritten marks, later harness. | Numbers point to a parent without committed benchmark implementation. | The selection is transparent about its local method, but exact replay is unavailable (`f-caee157-plaintext-baseline-points-to-parent`). | **Reopen provenance only.** The baseline is directional evidence, not a reproducible threshold. |

### Platform-availability boundary

The current external data does not falsify the selected primitive set. BCD reports Ed25519 at Chrome 137,
Firefox 129, and Safari/iOS 17, matching the project's table, and X25519 earlier at Chrome 133, Firefox 130,
and Safari/iOS 17. WebCrypto Level 2 specifies both. The weakness is temporal enforcement: the policy does not
inventory X25519 and Stage 4 still owes an exact, browser-executed conformance test. A moving Baseline statement
cannot freeze the support state that existed at a decision SHA.

PRF and platform-authenticator availability are correctly modeled as runtime facts. PRF support is additionally
per credential through the registration result's `enabled` member. Neither should be elevated to a static browser
gate. The mandatory recovery code preserves root authority when either convenience is absent. Separately, the
project verifier must decide whether framed cross-origin ceremonies are forbidden or permitted; default
Permissions Policy `self` reduces ordinary exposure but explicit iframe delegation makes RP-side
`crossOrigin`/`topOrigin` validation material.

The synchronous WASM claim is narrow but credible for this module: 6,465 bytes is far below Chromium's historical
8 MiB synchronous main-thread cap, the JavaScript API still defines synchronous construction, and the exact blob
was observed in Chromium, Firefox, and WebKit at its decision point. SIMD is a standardized extension used by the
build, not evidence of universal future availability. The correct evidence is a tiny exact-module instantiation and
KAT in every promised engine, run at the support floor; that gate remains future work.

### Evidence-oracle boundary

| Evidence | Independent of project model? | What it establishes | What it does not establish |
| --- | --- | --- | --- |
| GCM Test Case 16, RFC 5869 case 1, RFC 8032 test 1, FIPS SHA-256 `abc` | Yes, for the named sample | Primitive/provider behavior and byte conventions reproduce primary vectors. | Composition, all boundary cases, or browser support. |
| XChaCha draft A.3.1 against the embedded RustCrypto blob | Yes, for the named sample | The checked-in blob reproduces an external XChaCha20-Poly1305 vector. | That the blob was built from current reviewed Rust source. |
| Node WebCrypto versus project encoders | Implementation diversity, shared project composition | A different crypto provider can reproduce selected project bytes and reject listed mutations. | Browser-engine conformance or correctness of a shared serialization assumption. |
| Project positive/negative composition vectors | No fully independent semantic oracle | Deterministic regression, boundary, and declared-field mutation coverage. | Absence of an omitted field/semantic or application integration correctness. |
| ASVS profile and origin-isolation scripts | Structural/project-owned | Versioned control inventory and recognized literal external-resource forms. | Runtime network behavior or full satisfaction of each selected ASVS requirement. |
| Pixel paired measurements | Independent device observation for that session | Real-device relative latency and rejection of the desktop-throttling surrogate. | Device-population bounds, cold-start behavior, or durable product-transition cost. |

The XChaCha vector's source is an expired Internet-Draft, but expiry does not make its published bytes
self-generated; it remains a useful external KAT for the chosen construction. The RustCrypto security-review claim
needs narrower wording: NCC reviewed an earlier module in 2019, while the pinned `chacha20poly1305 0.10.1` shipped
in 2022. That historical audit is related evidence, not a version-specific audit of the selected crate. The exact
blob KAT and project tests are therefore load-bearing, and source/artifact/toolchain binding should be explicit.

### ASVS and performance boundary

ASVS 5.0.0 remains the latest stable tagged release found on 2026-08-26. The selected L2 floor, eight named L3
controls, five project addenda, and explicit V14.3.3 exception form a reviewable profile; it is not a claim of full
L3. The profile generator proves that the intended IDs and levels are present. It does not prove implementation.
Only A1 is claimed as currently checked, and that checker searches a fixed set of literal URL spellings. It cannot
support its broad “no remote subresources” message against dynamically assembled `fetch`, XHR, DOM URLs, workers,
or other runtime network paths. P-01 should propagate the narrower structural claim, and Stage 4 needs a runtime
egress/network-graph check plus requirement-by-requirement evidence.

The performance record should preserve two distinct conclusions. First, the Pixel experiment is valuable: paired
measurement on a real target device overturned the desktop CPU-throttle surrogate and observed a clear p95 breach
for the JS fallback at the tested AAD sizes. Second, it cannot define a lower bound for all Baseline-compatible
devices, and the fixed-slot harness is not the selected immutable journal append. Raw samples, OS/build/browser
session identifiers, cold/warm separation, a product-shaped durable transition, and a declared device sampling
policy are still required before a population-level claim.

## Affirmative conclusions

- The published Ed25519 browser-version table matches current BCD, and current BCD also shows the selected X25519
  operation across the core browser families. No present primitive incompatibility was demonstrated.
- PRF and platform-authenticator availability are runtime/per-credential facts, and their absence does not remove
  the mandatory recovery root.
- The exact small WASM blob's synchronous instantiation and decision-time three-engine observation are credible;
  the main gap is continuing conformance and source-to-artifact assurance, not evidence that it currently fails.
- ASVS 5.0.0 is a legitimate pinned stable baseline. The profile honestly names its L2 floor, L3 additions,
  project addenda, and V14.3.3 deviation.
- The primitive KATs have identifiable external RFC/FIPS/NIST/draft provenance; they are not project-invented
  expected values. The exact WASM blob passed its external KAT and all seven additional project checks.
- Declared AAD mutations are genuinely isolated in the evidence inspected: 151 runnable declarations and the four
  static journal declarations each have a corresponding one-field negative.
- The Pixel measurement is a valid single-device paired observation and correctly disconfirms the earlier
  desktop-throttle surrogate. The actual selected WASM provider also retains a small final bundle delta.

## Candidate or validated findings

- Added `f-9b49b74-wasm-source-artifact-drift-unchecked` (low/high): normal verification can accept a stale blob
  after reviewed Rust source changes; the dedicated freshness command catches it but is not in `check`, and the
  toolchain is not pinned.
- Reaffirmed `f-bd87655-baseline-not-performance-floor` and
  `f-bd87655-x25519-support-floor-omitted`: Baseline is a compatibility policy, and X25519 remains absent from the
  load-bearing inventory even though current compatibility data is favorable.
- Reaffirmed `f-b9ff071-webauthn-cross-origin-policy` and `f-5bd9552-origin-scan-static-forms`: browser defaults
  narrow ordinary reachability but do not close verifier policy or runtime egress coverage.
- Reaffirmed `f-9b49b74-rustcrypto-audit-version-gap` and `f-dbfd01f-row20-closes-unvectorized-hpke`: the cited
  audit does not version-match the selected crate, and HPKE vector closure happened after the original overclaim.
- Reaffirmed `f-66a7c6a-journal-benchmark-overwrites-one-slot`,
  `f-138a5f8-libsodium-readiness-timing`, `f-6b021c4-wasm-size-proxy-unreproducible`, and
  `f-caee157-plaintext-baseline-points-to-parent`. Later actual-provider evidence reduces the bundle decision risk
  but does not repair the historical measurement/provenance claims.

## Disconfirmed hypotheses and null results

- The Ed25519 compatibility table is not stale or contradicted by current BCD. The omitted X25519 row is a policy
  and test gap, not proof that current supported browsers lack the primitive.
- PRF or platform-authenticator absence does not create cryptographic lockout because the recovery code remains
  mandatory. This does not disconfirm the separate WebAuthn embedding-policy finding.
- Synchronous WASM construction is not a nonexistent or inherently async API, and this 6.3 KiB module is not near
  Chromium's documented historical sync-compilation cap.
- Official primitive expected values are not generated by the code under test. Independence becomes weak at the
  project composition layer, not at the cited KAT sample.
- No non-isolating mutation among the 151 dynamically runnable AAD fields was found. Journal's four published
  pairs are also structurally one-field negatives; dynamic journal execution remains unobserved in the dependency-free
  archive.
- The Pixel data is not worthless: it is strong evidence for that device/session and falsifies the throttle proxy.
  It simply cannot support a whole-device-population lower bound.
- The libsodium rejection does not depend solely on the mislabeled readiness query; async initialization shape and
  bundle cost still differ materially. Likewise, later measurement of the real WASM artifact reduces the decision
  impact of the unreproducible earlier proxy.
- No current third-party remote load was found in the literal source forms checked. The finding is that the scanner
  cannot prove its broader runtime claim, not that a remote dependency was demonstrated.
- The ASVS selection is neither an obsolete version nor a disguised full-L3 claim. Its remaining weakness is the
  difference between a structurally correct profile and as-built verification.

## Unresolved questions

- Which exact browser/OS versions constitute the moving support floor at each release, and will CI execute
  Ed25519, X25519/HPKE, the exact SIMD WASM blob, PRF registration, and authenticator discovery on that matrix?
- What is the deployment policy for cross-origin WebAuthn ceremonies, framing, and Permissions Policy, and where
  will it be enforced and negatively tested?
- Which independent implementation or RFC 9180 corpus will challenge the complete HPKE and project-composition
  encodings rather than only their component primitives?
- How will the Rust source, crate graph, compiler/toolchain, generated bytes, and release artifact be reproducibly
  or attestably bound, and which CI gate will reject drift?
- What product-shaped durable append benchmark, raw sample record, cold/warm protocol, and device sampling policy
  support the promised latency floor beyond the single Pixel observation?
- How will every selected ASVS/addendum requirement map to runtime or review evidence, including a real browser
  network/egress graph rather than only literal-source scanning?

## Completion criteria

- [x] Reconstruct and challenge every platform and evidence seam named in the brief.
- [x] Cite exact repository snapshots and versioned primary external sources with retrieval dates where needed.
- [x] Record surviving concerns as findings and null results explicitly.
- [x] Complete this artifact and its session, then pass the review validator.

## Handoff

`X-06` is complete. `P-01` should propagate the compatibility-versus-performance distinction, the omitted X25519
floor, runtime WebAuthn capability and embedding policy, ASVS structural-versus-as-built boundary, source/blob
assurance gap, and single-device benchmark boundary through their downstream requirements and evidence claims.
`S-01` should combine the surviving browser, provider, AAD, and durability assumptions into end-to-end scenarios.
`V-01` owns independent disposition of every candidate, including the new WASM drift counterexample. Run
`node scripts/review-status.mjs` before claiming the next item and use its first-ready result.
