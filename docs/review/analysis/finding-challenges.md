---
schema: 1
kind: work-item
id: V-01
status: complete
owner: root-v01-20260826
started: 2026-08-26
updated: 2026-08-26
blocked_on: none
---

# `V-01` — independent challenge

## Scope and exclusions

Independently challenge all 37 candidate findings and the load-bearing affirmative conclusions from the completed
foundation, reverse-walk, cross-cutting, propagation, and scenario passes. The challenge asks whether each atomic
claim survives its strongest benign reading, whether its consequence is reachable at the pinned tip, whether its
severity is calibrated to the affected property, and whether it duplicates a better-scoped concern. Production
code, requirements, selections, vectors, and tests are read-only. Overall judgment remains owned by `Z-01`.

## Exact sources inspected

- Boundary and method: `c6116669030eedeea3d599bca0da3547114e6930:docs/{PRD,TRD,sequencing,progress}.md`,
  `9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/{PRD,TRD,decisions,performance,progress,sequencing}.md`, and
  `docs/review/{README,orientation,STATUS,DECISIONS,work-items.tsv,briefs.md}`.
- Completed review record: F-01, F-02, B-01 through B-04 and all 35 commit cards, X-01 through X-06, P-01, S-01,
  every prior session that owned those artifacts, and all 37 finding files. Prior dispositions were treated as
  hypotheses rather than votes.
- Exact-tip selections: rows 1 through 17, with focused re-derivation of rows 2–8 and 10–16. Exact-tip generators,
  checked vectors, and checkers for the suite, journal, records, enrollment, checkpoints, attribution, anti-replay,
  packages, account credentials, recovery, transitions, origin isolation, retention, and the WASM seal were read
  from Git objects rather than the checkout.
- Exact introduction snapshots for historical evidence findings: `caee157`, `9860a0b`, `3bea0e6`, `dbfd01f`,
  `bd87655`, `66a7c6a`, `138a5f8`, `6b021c4`, `a073574`, `992bc91`, `b997cdb`, `745e332`, `9b49b74`,
  `b9ff071`, `4259822`, `5bd9552`, and `ff0b48f`.
- Primary/external evidence, refreshed 2026-08-26: RFC 9180 §§4–5 and 9
  (`https://www.rfc-editor.org/rfc/rfc9180.html`); NIST SP 800-38D and its 2024 revision notice
  (`https://csrc.nist.gov/pubs/sp/800/38/d/final`); WebAuthn Level 3 §§7.1–7.2 and 13.4.9
  (`https://www.w3.org/TR/webauthn-3/`); Web Cryptography Level 2 §§5–6 and 13
  (`https://www.w3.org/TR/WebCryptoAPI/`); the WebDX Baseline definition
  (`https://web-platform-dx.github.io/web-features/web-features/`); the NCC Group RustCrypto audit report
  (`https://www.nccgroup.com/research/public-report-rustcrypto-aesgcm-and-chacha20pluspoly1305-implementation-review/`);
  and the RustCrypto `chacha20poly1305` changelog
  (`https://github.com/RustCrypto/AEADs/blob/master/chacha20poly1305/CHANGELOG.md`).

## Method

For each finding I restated the strongest counterargument before re-reading the cited original, introducing, and tip
objects. A finding is `validated` only when its atomic claim still holds after that counterargument; validation does
not erase the bounds recorded in its consequence. Historical evidence claims are evaluated at the time they were
made as well as at the tip. Missing implementation is not treated as proof that an implementation must fail, but a
closed selection is required to define every load-bearing state that cannot be reconstructed unambiguously.

Repository evidence was checked statically against full Git object ids. A disposable exact-tip archive then reran
the suite, checkpoint, attribution, enrollment, package, transition, account-credential, recovery, and WASM checks.
The journal generator needed an unavailable `@noble/ciphers` installation in that archive; its checked artifact was
instead compared directly, while the earlier X-02 exact-tip run remains the execution evidence. Two independent
mutations were repeated: an empty nonce after a valid seal was accepted and reproduced the prior ciphertext, and a
Rust-only `MAX_AAD` change left the normal eight-check WASM verifier green while the explicit freshness command
reported the generated TypeScript stale. No dynamic protocol integration test was possible because the pinned tip
contains no encrypted adapter, acceptance/authorization service, spool, restore path, or transition worker.

The challenger identity `root-v01-20260826` differs from every `created_by` value. Results use four calibrated
labels: `survives` (the atomic concern is validated), `qualified` (validated but only within the stated boundary),
`historical` (valid at introduction but repaired or superseded as operative tip evidence), and `disconfirmed`.

## Analysis

### Findings

| Finding or conclusion | Origin owner | Strongest challenge | Independent evidence | Result | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `f-138a5f8-libsodium-readiness-timing` | `/root` | Async readiness was unsafe in shape anyway and the later provider replaced it. | `138a5f8:test/latency/cipher-bench.device.ts` queries readiness only after fetch, agreement, and UI work; it does not capture the promise's resolution instant. | `historical`; the 37 ms is an upper bound, not an instantiation timestamp. | `validated`, low; clarify and do not reuse as precise timing. |
| `f-3bea0e6-store-sequence-allocation-undefined` | `/root` | A short IndexedDB reservation or per-tab range solves the problem without changing record bytes. | Tip row 3 requires `seq` before encryption, permits two tabs, and spans content/heads, but selects no reservation, gap, generation-budget, or trim-race state. | `survives`; repairability does not define crash behavior. | `validated`, medium; reopen the allocator and budget state. |
| `f-3bea0e6-suite-separation-ignores-both-path` | `/root` | The real security rule may be key-domain separation, under which shared SHA-256 is acceptable. | Exact-tip suite data labels SHA-256 `path: both`; `checkSeparation()` admits only equality with `async`/`sync`, and exact `--check` still passes. | `qualified`; no primitive break is shown, but the promised stronger oracle is false. | `validated`, medium; fix the oracle or narrow the rule. |
| `f-4259822-generation-switch-local-durability-undefined` | `/root` | The initiator's self-wrap can recover `K_(g+1)` and a correct implementation can stage the rest. | Tip row 15 names only `pending -> applying -> settled`; it does not order the successor `KeyEnvelope`, active marker, old journal/batch/spool, pending cleanup, checkpoint, trim, or opener deletion. | `survives`; a recoverable key does not preserve all old/new work across kills. | `validated`, medium; reopen the local apply transaction. |
| `f-4259822-lapse-transition-kind-missing` | `root` | Lapse can be a separate durable billing state rather than a row-15 intent. | Tip row 15 and `transition.json` define only `rotate`, `replace-recovery`, and `retire`, while the record explicitly claims bound `kind` closes deliberate downgrade. | `survives`; the alternative architecture is viable but unselected. | `validated`, medium; define the separate machine or add lapse and correct the closure claim. |
| `f-4259822-recovery-replacement-no-forward-rotation` | `/root` | Deleting the service-held old set is sufficient when the code was lost but never copied. | PRD/row 14 explicitly serve a lost **or exposed** code; replacement rewraps the same generations and creates no successor, so retained `K_g` opens later same-generation writes. | `survives`, bounded to exposure and until the next rotation. | `validated`, high; compose replacement with forward rotation or narrow the promise. |
| `f-4259822-recovery-replacement-payload-bytes-unbound` | `/root` | “The kind's own parts” could mean the entire canonical replacement set. | Exact generator/vector digest only `new-recovery-public-key` and generation names; `payload_parts` is absent for replacement and exact envelope/wrap bytes are not committed. | `survives`; the benign reading is not implementable from the selected bytes. | `validated`, medium; bind the complete canonical set. |
| `f-4259822-retirement-safe-survivor-gate-undefined` | `/root` | A service can add `retired-awaiting-export-ack` and keep bytes until acknowledgement. | PRD/TRD require a current survivor/export and catch-up, but row 10 defers deletion and row 15's retire payload binds only reason/head; no durable acknowledgement or worker predicate exists. | `survives`; terminal-first is safe, terminal-to-delete is undefined. | `validated`, high; reopen the destructive deletion gate. |
| `f-5bd9552-origin-scan-static-forms` | `/root` | A1 may mean only static subresources, and no present third-party load exists. | Exact scanner's failing regexes omit `fetch`, XHR, WebSocket, DOM-created loads, constructed URLs, and fetched evaluation while printing a universal success message. Tip app search found no current violating party. | `qualified`; false assurance, not a current compromise. | `validated`, medium; narrow the claim and add parser/CSP/runtime coverage. |
| `f-66a7c6a-journal-benchmark-overwrites-one-slot` | `/root` | Cipher/base64/storage-call timing is real and the 4 kB pure-JS breach remains decisive. | Exact harness warms and overwrites one key for every sample, unlike immutable accumulating entries; it omits insertion/growth/burst cleanup costs that matter most after WASM. | `qualified`; qualitative course correction survives, production p95 closure does not. | `validated`, medium; retain microbenchmark, add production-shaped appends. |
| `f-6b021c4-wasm-size-proxy-unreproducible` | `/root` | The later 6,465-byte selected blob independently proves current fit. | `6b021c4` changes prose only and names no proxy package/version/source/build command or artifact. | `historical`; current size risk is repaired, decision-time provenance is not. | `validated`, low; preserve as historical/unreproducible. |
| `f-745e332-envelope-refusal-carrier-missing` | `/root` | Final heads or treating every response as silence preserve integrity. | A non-final head at `n-1` cannot prove `E_n` was never accepted; row 15 outcomes cannot name ordinary envelope bytes; no signed refusal schema/vector exists. | `survives`; silence is safe but leaves genuine refusal indefinitely unavailable. | `validated`, medium; select the refusal carrier. |
| `f-745e332-live-retired-package-resigning-undefined` | `root` | Importing a complete service-signed retired package is a coherent replacement path. | Tip live/retired manifests change state, head, epoch, parts digest, assembler, and signer; only a terminal record cannot authenticate the transformed manifest. | `survives` for the narrower in-place-upgrade claim. | `validated`, medium; define a signed transform or narrow to full-package replacement. |
| `f-745e332-local-archive-portable-wrap-undefined` | `root` | The row-14 code/keypair pattern could be reused for Local archives. | Tip never-established vector signs opaque part digests only; HPKE wrap/open exists only for the account recovery keypair, with no Local saved-factor-to-generation path. | `survives`; intent prose does not select an opener. | `validated`, high; reopen Local archive restore. |
| `f-745e332-package-root-rewrap-substitution` | `/root` | Manifest and epoch signatures bind the root, and changing HPKE `info` breaks an existing wrap. | RFC 9180 base mode authenticates no sender; a writer can keep genuine `R_pub`, choose a new root/content, and create a fresh wrap whose `info` names that root. All subordinate signatures can then resolve under it. | `survives`; the published negative tests immutable-ciphertext context, not rewrapping authority. | `validated`, high; add a non-rewrappable user-held root commitment. |
| `f-9860a0b-journal-rotated-vector-reuses-key` | `/root` | The vector honestly proves that the clear generation field is authenticated. | Exact checked JSON gives generation 1 and 2 the same `k_g` and `k_journal`; no case tests generation-key lookup. | `qualified`; existing AAD claim survives, separate rotation lookup coverage does not. | `validated`, medium; fix fixtures and add wrong-generation-key negative. |
| `f-9860a0b-legacy-plaintext-repair-undefined` | `/root` | The installation is unsupported development state and a fresh origin/manual cutover can avoid it. | Rows 2–3 separately require preserving/refusing `1:` journal data and deleting the old DB, but no verified import/active-store/deletion/restart order joins them. | `qualified`; impact is limited, state is still undefined for the known old origin. | `validated`, low; select the clean-cutover repair state. |
| `f-992bc91-network-carrier-registry-stale` | `/root` | Row 4 itself fixes current envelope v1 unambiguously. | Tip `algorithm-suite.json` still publishes `network-envelope` as null/unselected and has no acceptance row; its checker accepts the stale owner string. | `qualified`; current bytes are clear, registry totality/agility is not. | `validated`, medium; repair registry coverage. |
| `f-992bc91-outbound-envelope-spool-undefined` | `/root` | Local content or a cooperative hosted store can reconstruct/return the work. | Random nonce, batching, signature, digest, and link make exact `E_n` unreconstructible from a Yjs delta; remote retrieval fails before receipt and at provider-loss boundaries. No outbound record/store/order exists. | `survives`; distinct from the refusal carrier. | `validated`, medium; select spool, reservation, retry, and cleanup. |
| `f-9b49b74-journal-seal-64k-gap` | `/root` | Common updates are far smaller and Stage 1 can split, enlarge, or pre-refuse. | Exact-tip seal accepts 65,536 and throws at 65,537; the all-update WAL contract has no ceiling or pre-mutation/alternate state. The disposable archive reproduced the refusal. | `survives`; unintegrated but concrete construction gap. | `validated`, medium; reopen oversize handling before integration. |
| `f-9b49b74-rustcrypto-audit-version-gap` | `/root` | The audit is genuine and external KATs support the compiled primitive. | NCC dates the audit to December 2019; RustCrypto changelog dates selected `0.10.1` to 2022 after multiple dependency/API revisions. | `qualified`; audit history is real, exact-version audit coverage is not. | `validated`, low; clarify source/version/compiler scopes. |
| `f-9b49b74-wasm-glue-key-nonce-lengths` | `/root` | Current benchmark callers always pass correct widths. | Exact wrapper checks only AAD/plaintext; a disposable exact-tip instance accepted an empty nonce after a valid one and reproduced the prior ciphertext because stale static-buffer bytes remained. | `survives`; integration hazard, not a current external-input path. | `validated`, medium; enforce 32/24-byte widths before memory writes. |
| `f-9b49b74-wasm-source-artifact-drift-unchecked` | `/root` | The explicit `wasm:stale` command catches drift. | In an exact-tip archive, a Rust-only `MAX_AAD` mutation left `check-wasm-seal.mjs` green while `build-wasm-seal.mjs --check` reported stale; `package.json` omits freshness from normal `check`. | `survives`; behavioral verification and freshness are separate. | `validated`, low; require both and pin/attest the toolchain. |
| `f-a073574-enrollment-recovery-key-unbound` | `/root` | An existing device could send authentic recovery material inside the enrollment payload. | Exact transcript/vector binds workspace, epoch/head, credentials, `W_pub`, and nonces only; no `R_pub`, envelope digest, or authenticated payload schema exists, while future rotators trust `R_pub`. | `survives`; the corrective payload is not selected. | `validated`, high; authenticate recovery-recipient state during enrollment. |
| `f-b997cdb-attribution-self-replacement` | `/root` | Returning clients can remember the first claim, and all mutations of Alice's signed tuple fail. | The mutable CRDT map has no creation position; a later credential can replace the whole tuple with its own valid tuple/signature, and a fresh checkpoint restorer has no earlier value. | `survives`; acceptance proves who made the replacement, not who created the card. | `validated`, medium; bind immutable first creation. |
| `f-b997cdb-checkpoint-coverage-unchecked` | `/root` | An honest producer/restorer could derive `{sv,ds}` from real Yjs bytes in implementation. | Exact generator uses a UTF-8 sentence and independent `SV`, `DS`, and heads constants; it only proves signed field binding and imports no Yjs coverage oracle. | `survives`; carrier integrity does not establish semantic coverage. | `validated`, medium; specify and test snapshot/head derivation. |
| `f-b997cdb-checkpoint-key-retention-inverted` | `/root` | The intended key-retention sentence is obvious and a remote recovery wrap might survive local deletion. | Tip rule speaks of dropping checkpoints, while row 15 permits old-generation deletion after settlement, one new checkpoint, and local trim, with no retained-fallback-opener predicate or two-generation vector. | `survives`; possible benign storage policies are not selected. | `validated`, medium; retain an authenticated opener for every retained checkpoint. |
| `f-b9ff071-webauthn-cross-origin-policy` | `/root` | Default Permissions Policy or deployment anti-framing can make cross-origin ceremonies unreachable. | Neither invariant is selected; both exact verifiers omit `crossOrigin`/`topOrigin`, while WebAuthn Level 3 verification steps 13–14 require RP policy checks when present. | `qualified`; user action and cross-origin reachability are prerequisites. | `validated`, low; add policy checks or bind an anti-framing invariant. |
| `f-bd87655-baseline-not-performance-floor` | `/root` | Current-browser support correlates with newer hardware and the Pixel 9a is useful evidence. | WebDX defines Baseline as feature availability across core browser releases, not CPU/storage/thermal performance; one Pixel cannot bound the supported population. | `survives`; correlation does not carry the p95 guarantee. | `validated`, medium; define and measure a hardware population separately. |
| `f-bd87655-x25519-support-floor-omitted` | `/root` | Contemporary compatibility evidence suggests X25519 works on current core engines. | Tip policy calls Ed25519/PRF the complete capability-specific inventory while row 1 selects X25519 HPKE and row 14 itself calls it the same floor question. | `qualified`; no present incompatibility is shown, but policy/test coverage is contradictory. | `validated`, low; add dated exact-operation evidence and absence behavior. |
| `f-c611666-rotation-reader-eligibility-missing` | `/root` | “Remaining reader” can mean only ceremony-completed readers. | No durable client-authenticated success object binds credential to `W_pub`; a different rotator sees only the service-signed roster, and exact rotation vectors accept an opaque wrap map. | `survives`; delayed service-caused key delivery remains reachable. | `validated`, high; select transferable reader eligibility. |
| `f-caee157-plaintext-baseline-points-to-parent` | `/root` | The note is transparent and `caee157` is very likely the measured tree. | Every row names parent `c611666`, which lacks the harness/marks; no raw artifact or later provenance correction proves the dirty tree equaled `caee157`. | `historical`; useful observation, not commit-reproducible measurement. | `validated`, low; append a correction or classify it as working-tree evidence. |
| `f-dbfd01f-device-lock-rotation-caveat-lost` | `/root` | A one-device pre-Stage-4 workspace can rotate immediately. | Tip row 13 still defines reachable `rotation_owed`; later transition work does not prove enrollment cannot finish locked before rotation, while PRD/TRD copy is unconditional. | `survives`, limited to the owed interval and multi-device/failure cases. | `validated`, medium; restore conditional copy/state. |
| `f-dbfd01f-record-nonce-ceiling-omitted` | `/root` | “Budget bounded by seq” plus the linked selection can guide a diligent implementer. | Current normative TRD omits the numeric threshold, equality boundary, and rotate/refuse action; the selection alone says rotate before the next sequence crosses `2^32`. | `qualified`; remote threshold and no integrated writer keep impact low. | `validated`, low; put the enforcement branch in normative algorithm/tests. |
| `f-dbfd01f-row20-closes-unvectorized-hpke` | `/root` | HPKE belonged to later protocol review and the tip now has executable RFC agreement. | At `dbfd01f`, row 1 explicitly says HPKE has no implementation/vector while TRD row 20 says each folded selection has one. | `historical`; later evidence repairs tip availability, not the decision-time claim. | `validated`, low; correct the historical closure boundary. |
| `f-f5def83-device-lock-reader-key-bypass` | `/root` | PRF-protected credentials or expired relay/account access stop the copied profile. | On the selected no-PRF tier, the copied non-extractable wrapping key remains usable; rotation includes a self-reader wrap and lock enrollment neither replaces nor gates that credential. WebCrypto makes non-extractability an export property, not a bar on key use. | `qualified`; exact tier/access prerequisites hold, and within them the bypass survives successful rotation. | `validated`, medium; gate/replace every future-generation path or narrow copy. |
| `f-tip-prd-stale-selection-status` | `/root/f_02` | The PRD text might be historical or row 14's UX portion might remain open. | Tip PRD says standalone/current and present-tense “remains open” for rows 5/11 and step-up, while tip TRD/register/vectors select them; only row-14 confirmation UX remains genuinely open. | `survives`; status contradiction, not runtime defect. | `validated`, low; reconcile current normative documents. |

All 37 atomic concerns survive. No status remains `candidate`; no concern was rejected or superseded. The absence of
rejections is not inherited consensus: the strongest benign readings above narrow several consequences but do not
disprove their headlines. The duplicate audit specifically kept these pairs separate:

- outbound spool versus authenticated refusal: durable exact bytes answer uncertainty; service-signed never-accepted
  evidence licenses re-minting after a genuine rejection;
- device-lock `rotation_owed` copy versus reader-key bypass: one exists before rotation settles, the other after a
  successful rotation on the no-PRF operational-key tier;
- package live-to-retired re-signing versus safe-survivor gate: one is artifact authentication, the other is
  delivery acknowledgement before destructive deletion;
- recovery-recipient authentication versus reader eligibility: one binds workspace recovery authority, the other
  binds each ordinary credential's right to receive future generations;
- checkpoint semantic coverage versus fallback key retention: one says what bytes the snapshot represents, the
  other says whether a retained authentic snapshot remains openable.

### Load-bearing affirmative conclusions

| Finding or conclusion | Origin owner | Strongest challenge | Independent evidence | Result | Final disposition |
| --- | --- | --- | --- | --- | --- |
| Separation of account proof, authorization, signing, wrapping, content generations, custody, and recovery | X-01/P-01 | Labels can hide later key delivery through an ineligible reader or substituted recovery key. | Base/tip key tables and exact role-separated carriers use distinct credentials/keys and asymmetric `R_pub`/`R_priv`; the validated findings occur at recipient handoffs, not because the role model collapses. | Survives as architecture, qualified at eligibility/custody joints. | `validated/qualified`. |
| Fresh generation roots and length-prefixed workspace-bound derivations | X-01/P-01 | Shared SHA-256 and stale suite registry could imply hidden cross-role reuse. | Exact suite/record/journal/envelope/checkpoint labels and KDF inputs remain injective and workspace-bound; no direct `K_g` use as an AEAD key was found. | Survives; checker totality defects do not refute the hierarchy. | `validated`. |
| Generated 125-bit codes need no stretching | X-01/X-04/P-01 | Human transcription, grouping, and normalization can reduce entropy. | Exact generators use 25 independent uniform Crockford symbols and assert eight byte preimages per symbol; selections explicitly require app generation at full width and forbid user choice/truncation. | Survives only under the full-generation invariant. | `validated/qualified`. |
| Device-lock stage then atomic swap/delete preserves one local opener | X-01/X-02/S-01 | A kill between seal creation, envelope staging, `L_local` deletion, and state update could strand the slot. | Row 13 keeps the old opener through staging and places swap/delete/state in one local transaction; every pre-commit kill leaves old state and every post-commit kill leaves `L_lock` state. | Survives for local opener safety, not forward copy protection. | `validated/qualified`. |
| Account-slot binding and immediate enrollment authenticate their direct key targets | X-01/X-04/P-01 | Service-controlled recovery/reader eligibility could make both ceremonies cosmetic. | Row 12 signature binds the local verifier public key; row 11 commit/reveal transcript binds workspace, epoch/head, both credentials, and new `W_pub`. Neither claim is extended to future eligibility or `R_pub`. | Survives at composition layer and named target only. | `validated/qualified`. |
| Declared carrier fields/AAD are encoded and mutation-bound correctly | X-01/X-03/X-06/P-01 | Producer and oracle share inventories, so omitted semantics can remain green. | Exact checkers cover 151 runnable declarations plus four static journal declarations with isolated negatives; vectors reran. Checkpoint semantics, application bytes, and registry completeness remain outside that result. | Survives as declared-field binding, not semantic completeness. | `validated/qualified`. |
| Journal -> record -> compare-and-remove is the safe successful-write page-kill order | X-02/P-01/S-01 | `localStorage` durability, seal/quota failure, oversize writes, or two tabs could still lose work. | For a successful synchronous `setItem`, kills before IDB completion leave journal coverage; after completion they leave durable content; failed cleanup leaves an idempotent duplicate. | Survives exactly for successful page-level writes; failure/allocator states remain reopened. | `validated/qualified`. |
| Covering state before trim deletion is the safe order | X-02/P-01/S-01 | Two transactions may expose an inconsistent midpoint or a concurrent writer may cross the watermark. | Before state commit old updates remain; after it the covering state is authoritative; IDB deletion commits/aborts atomically. Concurrent watermark allocation is a separate validated gap. | Survives for one coherent trimmer. | `validated/qualified`. |
| Content before accepted-head mark and one `(seq,link)` per credential suffice within one view | X-02/X-03/P-01/S-01 | Service equivocation, missing accepted logs, or crashes could hide accepted content. | Recomputed links detect gaps/second links; content-first makes a kill redeliver idempotently; a mark is sufficient to refuse any second value at/below it. Two service-signed forks remain possible until views meet. | Survives within one view and honest local persistence. | `validated/qualified`. |
| Final heads and authenticated evidence bound a hostile relay to availability/metadata | X-03/S-01 | A malicious service can sign forks and a relay can exploit the missing ordinary refusal carrier. | With honest acceptance/authorization keys, the relay cannot forge source signatures, accepted heads, final cutoffs, or outcomes; withholding remains available. | Survives only under the explicitly honest-service premise and filled refusal/spool joints. | `validated/qualified`. |
| Row-15 mine/other/silence is a sound abstract wire verdict | X-03/X-04/P-01/S-01 | Indefinite silence is liveness failure and applying a winning outcome can still corrupt local state. | Exact intent is persisted before send; signatures bind kind/target/id; identical retry, matching apply, and signed competing-winner rebuild are the only safe network decisions. Local application is separate. | Survives as wire theorem; not as complete transition implementation. | `validated/qualified`. |
| Checkpoint fields are cryptographically bound and two tuples are necessary | X-03 | Semantic coverage and opener deletion can make authentic checkpoints unusable. | Exact AES-GCM/signature/field mutations work, and losing the newest tuple motivates a second. The validated findings correctly reopen what the tuple means and whether it remains openable. | Survives as encoding and architectural fallback need. | `validated/qualified`. |
| Body commitment distinguishes exact creation body from later edited body | X-05/P-01 | A later credential can replace the entire attribution claim. | Exact commitment/signature makes the original claim verify as exact or edited without claiming current-body authorship. It does not prove that the retained claim is the first one. | Survives for a given authentic claim only. | `validated/qualified`. |
| Lapse, expiry, retirement, migration, and detached Local replicas are distinct; terminal before deletion is safe | X-04/X-05/P-01/S-01 | Missing lapse and acknowledgement carriers may mean the distinction is only prose. | Base/tip normative state axes consistently keep live-dormant separate from terminal, create new lineage/generation for migration, and preserve detached replicas; deleting first admits irrecoverable live state. | State taxonomy and direction survive; execution gates remain open. | `validated/qualified`. |
| Migration starts a new lineage and replays only each returning credential's own suffix | X-05/P-01 | Broken package/checkpoint inputs and no integrated migration could invalidate the result. | The rule does not reuse old acceptance authority and refuses to reassign another credential's residue; missing material is recorded as loss. This provenance theorem is independent of package availability. | Survives as a rule, unimplemented and dependent on validated package/checkpoint repairs. | `validated/qualified`. |
| Evidence course corrections are real but narrow | X-06/P-01 | Shared generators can all agree on one mistaken model; one Pixel and one toolchain do not generalize. | Exact generators and WASM KAT reran; isolated negatives replaced paired-cause tests; the Pixel observation rejects the desktop surrogate; official KAT sources are independent. The mutation tests reconfirm source/blob and semantic limits. | Survives as artifact/single-device evidence, never as population or integration proof. | `validated/qualified`. |
| Rows 18, 19, and 21 remain genuinely open | P-01 | Later prose or generated artifacts might have silently chosen them. | Tip TRD register and progress leave persistent search, root-type days, and first-cutover attribution open; no selection record closes them. | Survives. | `validated`. |

The moving browser-support observation in X-06 was not promoted into a load-bearing final conclusion. Its exact
dated evidence says no present Ed25519/X25519 incompatibility was found; Baseline remains an interoperability
measure, and device performance plus future exact-operation conformance remain separate obligations.

## Affirmative conclusions

- The review's strongest positive results survive, but almost all are local theorems: field binding, a single
  transaction direction, one service view, one wire verdict, or one explicitly conditioned threat boundary.
- No primitive break was found. AES-GCM/XChaCha carrier encodings, HKDF labels, Ed25519 signatures, generated-code
  entropy, and the exact WASM blob's checked behavior remain affirmative evidence within their stated scopes.
- The three persistence directions remain correct after independent challenge: journal before asynchronous record
  before cleanup; covering state before deletion; accepted content before local mark.
- The accepted-chain and transition wire theorems remain sound when kept separate from service equivocation,
  outbound durability/refusal, local successor installation, and lifecycle deletion.
- The project preserved important distinctions—authorization versus decryption, lapse versus retirement, migration
  versus revocation, readable Markdown escape versus encrypted fidelity archive, and history retention versus
  forward exclusion—even where the concrete joint between states is incomplete.
- Positive course correction is real: later commits fixed paired-cause negatives, replaced the bad desktop timing
  surrogate with one real-device observation, delivered a small synchronous WASM artifact, and bound the recovery
  step-up to a nonce and transition id. None of those corrections is overextended here.

## Candidate or validated findings

All 37 findings are validated by `root-v01-20260826`: 6 high, 20 medium, and 11 low. None is critical, rejected, or
superseded. Severity remains consequence-calibrated: high findings admit confidentiality, archive-integrity, or
irreversible-loss outcomes; medium findings affect protocol availability/integrity, forward custody, persistence,
or a materially false assurance gate; low findings are bounded policy, provenance, historical, or future-enforcement
defects.

The validated population does **not** mean 37 independent shipped vulnerabilities. The pinned runtime is still the
predecessor plaintext/local implementation. Many findings are design-closure, evidence, or Stage 1/4 implementation
hazards; the final synthesis must keep those categories separate from reachable behavior in the checked-in app.

## Disconfirmed hypotheses and null results

- No candidate was disproved, but several broader readings were: there is no evidence that the selected primitives
  are cryptographically broken; the suite and registry findings concern oracle totality and propagation.
- No current third-party runtime resource was found in the key-holding app source. The origin-isolation finding is a
  false-completeness gate, not evidence of a present injected party.
- The fixed-slot benchmark mismatch does not erase the measured Pixel 9a 4 kB breach or the rejection of the cheap
  pure-JS swap; it prevents support-population/production-append closure.
- Later package HPKE code repairs current executable-vector availability; it does not retroactively make the
  `dbfd01f` row-20 statement true.
- Row 4 defines current envelope v1 precisely despite the stale suite registry. The registry finding does not make
  current envelope ciphertext ambiguous.
- The WASM blob still passes its external KAT and project checks. Wrong-width acceptance and optional freshness are
  wrapper/release hazards, not evidence that correct-width XChaCha outputs are wrong.
- The WebAuthn finding has no silent key-forgery path: it requires a permitted cross-origin ceremony and user
  verification. The omitted RP policy check still survives under that reachability condition.
- Successful single-writer page-kill schedules did not reveal a reversal of the three affirmative persistence
  orders. The surviving storage findings occur before successful journal durability, at multi-tab allocation, or at
  migration/transition joints.
- No duplicate could be merged without losing a distinct discriminating state; the five closest pairs are recorded
  in the analysis table.

## Unresolved questions

- Which durable, client-authenticated object jointly carries enrollment success, reader eligibility, authentic
  recovery recipient state, and enough provenance for every future rotator?
- What exact outbound spool/refusal protocol and what local generation-apply transaction compose network retry with
  crash-safe key/store state?
- What independent semantic oracle binds checkpoint bytes, `{sv,ds}`, accepted heads, retained suffixes, and every
  fallback opener?
- What user-held, non-rewrappable package root and Local-specific portable opener make both account and
  never-established archives authentic and restorable?
- What durable lapse/expiry/retirement machines, acknowledgements, and deletion predicates survive every partial
  operation without confusing live, dormant, terminal, and deleted states?
- Which findings must block Stage 0 closure versus later Stage 1/4 implementation remains a synthesis judgment for
  `Z-01`; V-01 validates claims but does not choose the project gate.

## Completion criteria

- [x] Every candidate or validated finding has an independent challenge and recorded disposition.
- [x] Every disposed finding records `challenged_by: root-v01-20260826`.
- [x] Load-bearing affirmative conclusions have been challenged separately from findings.
- [x] Duplicate and rejected findings are preserved with explicit reasoning; no rejection or merge survived.
- [x] The final artifact and session pass `node scripts/review-status.mjs`.

## Handoff

V-01 is complete and all 37 finding records name `root-v01-20260826` as challenger. Run
`node scripts/review-status.mjs`, then claim `Z-01` at `docs/review/analysis/final-synthesis.md`. Z-01 should
synthesize the validated findings without calling them shipped bugs, preserve the qualified affirmative theorems
above, and decide which design/evidence gaps prevent the lineage's “Stage 0 ready to close” claim. There is no
blocker.
