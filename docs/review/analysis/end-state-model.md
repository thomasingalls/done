---
schema: 1
kind: work-item
id: F-02
status: complete
owner: /root/f_02
started: 2026-08-21
updated: 2026-08-21
blocked_on: none
---

# `F-02` — End-state system and claimed guarantees

## Scope and exclusions

This is a blind reconstruction of what commit `9edd9300adebcec3abd2234c946f1dcccdc17eef` claims the system is to become. It does not ask whether the original plan justified the design and does not label any construction correct or incorrect. “Claimed guarantee” means the guarantee the tip prose assigns to a construction, not a conclusion independently established here.

The snapshot contains two materially different end states: a normative product/protocol target with seventeen selected construction/policy rows, plus row 20 closed for those selected rows, and a predecessor app/relay implementation that the TRD explicitly says must be replaced. A vector demonstrates the bytes and negative cases produced by its generator; it is not evidence that the target protocol is integrated into the app.

## Exact sources inspected

- Normative/working prose through Git objects: `9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/PRD.md`, `:docs/TRD.md`, `:docs/decisions.md`, `:docs/progress.md`, and `:docs/performance.md`.
- All seventeen records under `9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/selections/`, rows 1–17.
- Artifact/build wiring: `9edd9300adebcec3abd2234c946f1dcccdc17eef:package.json`; all sixteen files under `:test/vectors/`; the named `scripts/generate-*-vectors.mjs` generators; `:scripts/check-aad-coverage.mjs`, `:scripts/check-retention.mjs`, and `:scripts/check-wasm-seal.mjs`.
- Implemented journal artifact: `9edd9300adebcec3abd2234c946f1dcccdc17eef:wasm/journal-seal/src/lib.rs`, `:wasm/journal-seal/Cargo.toml`, and the generated module referenced by the verifier.
- Relevant predecessor code: `9edd9300adebcec3abd2234c946f1dcccdc17eef:src/crdt/persistence.ts`, `:src/crdt/sync.ts`, `:relay/src/auth.ts`, `:relay/src/connection.ts`, and `:relay/src/persistence.ts`.
- Blind-review routing only before this draft: `docs/review/config.json`, the `end-state` and `selection` rows of `docs/review/source-manifest.tsv`, and `docs/review/briefs/F-02.md`.
- Post-draft omission check only: `docs/review/orientation.md`, `docs/review/STATUS.md`, and the completed `docs/review/analysis/original-contract.md`.

## Method

The first pass treated the tip as a self-contained snapshot. It extracted each guarantee with its actor/trust boundary and residual; modeled every persistent transition and crash boundary; mapped all selected/open TRD rows to their evidence; and separated composition vectors, measurements, required future tests, and implemented behavior. Missing crash behavior is recorded rather than inferred. No original-plan summary, review orientation, status prose, or `F-01` artifact was read before this complete draft.

## Analysis

### End-state claim inventory

| Claim id | Exact source | Claim class | Actors/trust boundary | Claimed guarantee | Assumptions | Residual |
| --- | --- | --- | --- | --- | --- | --- |
| E-01 | `9edd930…:docs/PRD.md` §§2.3–2.4, 7.8; `:docs/TRD.md` §7.1 | Availability contract | Device versus account, relay, network | Existing installations read/write without service; no local path awaits a network credential. Null sync is the default. | Installation, ciphertext, and local custody survive. | No hosted sync/fresh-device setup during outage; optional device lock may require a local factor. |
| E-02 | `:docs/PRD.md` §7.1; `:docs/TRD.md` §§6.1, 13.2–13.3 | Storage confidentiality | File-level profile reader versus same-origin code | Every app-managed persistent content store is ciphertext from genesis under domain-separated subkeys of `K_g`. | Selected store/journal formats are implemented. | Default custody does not resist an attacker who executes the app origin from a copied profile; plaintext exists in memory. |
| E-03 | `:docs/PRD.md` §7.2; `:docs/TRD.md` §13.3; `:docs/selections/row-13-device-lock.md` | Stronger local custody | Profile thief versus generated code/optional PRF | Device lock replaces promptless custody, atomically reseals envelopes, deletes `L_local`, then rotates forward. | User retains the generated 125-bit code; rotation settles. | Not retroactive; same-origin code remains in scope; losing the factor can destroy the last Local readable copy. |
| E-04 | `:docs/PRD.md` §§7.3, 7.5; `:docs/TRD.md` §§7.3, 13.1–13.2 | Authority separation | Authorization service versus clients/content keys | Service alone serializes authorization; clients alone hold content keys; authorization never causes key delivery. | Signing/wrapping roles stay distinct; clients enforce a separate delivery proof. | Compromised service can alter authorization and deny service but is claimed unable to decrypt or forge an existing device mutation. |
| E-05 | `:docs/PRD.md` §5.3; `:docs/TRD.md` §7.4; `:docs/selections/row-4-envelope-format.md` | Authenticated attribution | Source credential/client versus relay/receiver | Shared mutations are source-signed; routing fields and ciphertext digest are clear/bound; actor id/kind remain sealed; no forwarding re-sign. | Receiver has applicable epoch, generation, key, and acceptance evidence. | Relay sees credential identity and traffic facts and can usually map credential to member; no unlinkability. |
| E-06 | `:docs/TRD.md` §7.5; `:docs/selections/row-5-finalization.md`, `row-6-antireplay-retention.md` | Accepted-set integrity | Acceptance signer/client versus hostile relay/revoked credential | Per-credential hash chains and signed heads admit only gap-free accepted envelopes; `final: true` fixes the cutoff; one `(seq, link)` mark is sufficient. | Client recomputes links and verifies heads against its own replayed link. | Split service views remain possible until views meet; missing heads halt availability; head cadence adds remote-visible latency. |
| E-07 | `:docs/TRD.md` §13.5; `:docs/selections/row-9-chain-head-discovery.md` | Rollback bound | Returning/enrolling/recovering client versus service | Returning clients reject ancestors; enrollment/packages bring an external head; all-device-loss recovery uses a nonce-bound signed assertion. | Enrollment transcript/package is authentic. | A hostile authorization service can give a brand-new recovery client a stale self-consistent head; claimed consequence is partition because stale auth hides the current generation. |
| E-08 | `:docs/PRD.md` §§6.5, 7.4; `:docs/TRD.md` §§7.5, 13.7; `:docs/selections/row-15-transitions.md` | Revocation/exclusion | Owner/remaining devices versus removed credential | Committed revocation combines successor epoch, client-produced generation/wraps, and finalized cutoff. Devices that observe it write under the new generation. | Verified signed outcome and complete remaining-reader/recovery wraps. | Past data is not erased; removed device stays a writable detached copy; offline remaining devices keep writing readable old-generation content until observation. |
| E-09 | `:docs/TRD.md` §§7.6, 13.7; `:docs/selections/row-7-checkpoint.md`, `row-8-attribution-record.md` | Bounded recovery representation | Client producer versus content-blind store/restorer | Full encrypted snapshot plus signed manifest binds epoch/head, generation, digest, insertion/deletion coverage, accepted heads, producer; per-card claims preserve attribution. | Restorer verifies all bindings and holds the generation. | Store cannot merge; count/time cadence is unselected; recovery availability depends on retained checkpoints/suffixes. |
| E-10 | `:docs/PRD.md` §6.3; `:docs/TRD.md` §13.6; `:docs/selections/row-11-enrollment-ceremony.md` | Enrollment delivery | Existing/new devices and user versus service/relay | Service admits credential, but key release requires a committed-nonce five-symbol SAS transcript binding workspace, epoch/head, credentials, and new wrapping key. | Both devices are awake; user transfers symbols; mismatch spends credential. | 25-bit ceremony, one attempt per admitted credential; QR only accelerates; no-survivor path uses recovery. |
| E-11 | `:docs/PRD.md` §§6.1–6.2; `:docs/TRD.md` §13.6 | Genesis/promotion | Local device/principal versus first service lineage | First run creates principal/workspace/device/actor/`K0` silently. Promotion keeps workspace and `K0`, adds credentials/recovery, admits genesis checkpoint, and moves rather than copies. | Workspace never had a lineage; code is saved/re-entered. | Retired-lineage workspace must migrate; concrete account-service implementation is future. |
| E-12 | `:docs/PRD.md` §§6.6–6.8; `:docs/TRD.md` §§6.5, 13.9; `:docs/selections/row-12-account-credential.md` | Local slot/privacy | Person at device versus closed slot/network service | Stores are per `(principal, workspace)` and only slot-index-discoverable. Offline WebAuthn assertion under a service-signed binding reopens local state and grants no network authority. | Authenticator/binding survive; verifier checks parsed ceremony data. | Stale binding can open already-local bytes until current lineage arrives; Local-only slot has no account unlock. |
| E-13 | `:docs/PRD.md` §§7.6–7.7; `:docs/TRD.md` §13.8; `:docs/selections/row-14-recovery-code.md` | Non-custodial recovery | User/replacement device versus service/store | Recovery composes account access, authorization, key access, and ciphertext. Generated 125-bit code seals `R_priv`; service lacks the factor. | Independent factor, ciphertext, and wraps survive. | Service cannot help after loss of every factor; code does not restore account/ciphertext; archive is not a factor. |
| E-14 | `:docs/TRD.md` §§13.7–13.8; rows 14–15 | Recovery replacement | Content-holding device/account credential versus transition service | Nonce-bound account assertion over `replace-recovery` transition id atomically replaces recovery material; old code is not required. | Device opens every required generation and service retires nonce/signs outcome. | Party with device content plus account credential can destroy recovery availability; explicitly accepted/surfaced. |
| E-15 | `:docs/PRD.md` §6.10; `:docs/TRD.md` §§13.8, 16; row 16 | Conditional retention | Lapsed user versus hosted ciphertext | After grace, sync stops but local writes continue; ciphertext/wraps/sealed `R_priv` remain twelve months from sync stop, then ciphertext/wraps are deleted. | A paid lapse state exists; service enforces floor and ceiling. | Devices diverge; after expiry recovery needs surviving replica/archive; pricing and grace length remain open. |
| E-16 | `:docs/PRD.md` §6.9; `:docs/TRD.md` §14.4; rows 10, 15 | Account retirement | Owner/devices versus service/store | Deletion commits terminal lineage and distributes portable evidence before deleting service copies; devices continue as independent Local replicas. | Current device/export and catch-up window; package reaches participants. | Offline devices retain stale last replica/live head; no remote wipe; devices stop converging. |
| E-17 | `:docs/PRD.md` §8.5; `:docs/TRD.md` §§14.1–14.3; row 10 | Service migration | User-held package/devices versus old/new services | Migration creates fresh lineage/generation, admits recovered checkpoint as new origin, preserves old attribution archivally, and re-envelops each returning device’s own suffix. | Package carries root/head/epochs/checkpoint/suffix/generations/recovery. | Isolates, not revokes, unreachable old service; never-returning credential’s unarchived work is lost. |
| E-18 | `:docs/PRD.md` §§8.1–8.4; `:docs/TRD.md` §§9, 11.3 | Portability/continuity | User/independent program versus original app/service | Markdown is readable escape; fidelity archive is exact encrypted restore; independent stack is intended to allow reinstall/restore/migration. | Import/archive/tools/package and continuity tests are implemented. | Markdown drops identity/attribution; archive needs a factor; stronger continuity path is required future work. |
| E-19 | `:docs/PRD.md` §7.11; `:docs/TRD.md` §§7.7, 16 | Metadata boundary | Relay/operators/processors versus user/document | Awareness is outside encryption but ephemeral; service data gets named purpose, subject, retention/deletion, visibility, third parties. | Deployment follows inventory/as-built reconciliation. | Relay sees live awareness and per-credential traffic; operational retentions/vendors remain pending deployment. |
| E-20 | `:docs/TRD.md` §§11–15; `:package.json`; predecessor source files | Evidence/implementation status | Specification/CI artifacts versus shipped code | Selected rows have generated checked artifacts; journal WASM has direct KAT/composition verification and measurements; TRD defines future conformance tests. | Checks run as wired; future code implements required tests. | Tip app still uses plaintext `y-indexeddb`/journal; relay still merges Yjs with shared bearer token. Most protocol guarantees are design-time, not integrated runtime, evidence. |

### State machines and persistence ordering

| State machine | Persistent state | Transition | Required ordering | Crash behavior | Consumer/evidence |
| --- | --- | --- | --- | --- | --- |
| Local startup | Custody record, local-custody seals, `KeyEnvelope`s, journal, encrypted records | closed → keys open → journal replayed → content loaded → transport eligible | Key store → unseal `K_g` → derive subkeys → replay journal → load content → transport | Replay-before-key and transport-before-load are forbidden. Failure before transport leaves local state unopened rather than connecting an empty doc. | TRD §6.1; future §11.1 load/replay tests. Existing store does not implement it. |
| Local write/batch | Immutable per-page journal entry; pending delta batch; IndexedDB records | Yjs update → sync journal → IndexedDB transaction → journal removal | Journal before return; wait for transaction `complete`; then remove matching journal entry | Kill before commit leaves entry for idempotent replay; batch failure leaves it intact/observable. | TRD §6.1; row 2 vectors/WASM KAT/hardware measurement; integration future. |
| Record trim | `update`/`state` records and generation envelopes | many records → current-generation state → delete superseded records | Commit state in one transaction; delete old content in a second; never sweep `heads` | Crash between transactions leaves harmless duplicate coverage; reverse order loses content. | TRD §6.1; row 3; future trim crash test. |
| Accepted-head persistence | Applied content batch; encrypted `(seq, link)` vector | accepted run applied → mark advanced | Content batch commits first; heads record second | Crash re-delivers admitted idempotent deltas; mark-first is forbidden because it can skip unapplied content. | TRD §§6.1, 7.5; row 6; future hostile-relay tests. |
| Outbound envelope chain | Own envelopes, next position, acceptance head | edit batch → envelope at `n` → accepted/refused/silent | Batch closes on actor/credential/epoch/gen change; re-mint only after authenticated definite refusal | Silence/timeout preserves position/bytes; exact durable pending-envelope journal is not specified. | Rows 4–6. |
| Inbound admission/finalization | Epoch/head, per-credential mark, held envelopes | receive → verify/walk → apply run or hold/refuse | Authorization before content; verify source/epoch/digest/position/link/head against local link | Missing evidence is held. Whole-run apply plus local persistence atomicity is only partly specified by content-before-heads. | Rows 4–6; future TRD §11.2 tests 3–6. |
| Checkpoint production | Encrypted snapshot, manifest, head vector, suffix, wraps | accepted state → sealed/signed checkpoint → admitted | Rotation produces new-gen checkpoint before old gen can drop; retain two plus suffixes | Digests expose incomplete/mismatched objects, but atomic publish of bytes+manifest+admission is not specified. | Rows 7–8; future checkpoint tests. |
| Checkpoint restore | Checkpoint/manifest, `sv`+`ds`, heads, suffix, generation | empty/restoring → verify/decrypt snapshot → replay suffix | Verify trust/head/gen/digest/coverage before use; apply baseline before divergent local suffix | Fallback to second-newest if newest unavailable; partial local install rollback is not specified. | TRD §§7.6, 11.3; rows 7, 10. |
| Local promotion | Existing Local store/`K0`; pending credentials/recovery; ownership fact | never-established Local → first live lineage | Keep workspace/`K0`; create/seal/wrap; genesis checkpoint/head; erase unsealed `R_priv`; commit ownership once | Next launch resolves exactly Local or promoted; no copied stale database. Transaction layout is future. | TRD §13.6; future §11.1/§11.2 test 15. |
| Device enrollment | Pending credential, nonce commitments, transcript, wrapping key/wrap | authorized credential → SAS → key delivery → usable replica | Commit both nonces before reveal; mismatch spends credential; delivery never follows auth alone | Retry after mismatch mints new credential/transcript. Crash recovery across admission/commit/SAS/wrap is not specified. | Row 11; future §11.2 test 7. |
| Slot close/reopen | Slot index, signed binding, passkey public key, retained stores/keys | active → closed → offline assertion → active local slot | Clear live sessions/outputs but retain slot; binding before assertion; optional device lock after slot proof | Close/reopen persistence atomicity is not described; destructive clear is a separate required crash-safe machine. | Row 12; future slot tests. |
| Destructive remove/reset | Slot index, sessions, identity, credentials/keys, stores | active → service revocation attempt → local clear | If reachable, revocation then clear; if not, clear and report unconfirmed; clear all scoped object classes | Must resume or roll back across stores/index/keys; concrete journal/transaction protocol is not selected. | PRD §§6.6–6.7; future §11.1 tests. |
| Rotation/revocation | Persisted intent, target key/wraps, old gen, signed outcome, checkpoint obligation | pending → committed mine/superseded other → apply/rebuild → settled | Persist before network; silence resubmits identical bytes; apply only matching verified outcome; other id rebuilds; switch gen only at commit | Lost response is resolved by idempotent resubmit. Old gen stays until settlement, new checkpoint admitted, and local trim current. | Row 15; future §11.2 tests 5, 6, 11. |
| Device-lock enrollment | Custody states, staged envelopes, factor seals, `rotation_owed` | promptless → enrolling → locked → rotated | Stage while `L_local` remains; one transaction swaps envelopes/deletes handle/sets locked; rotate afterwards | Pre-swap crash remains promptless; post-swap/pre-rotation leaves owed rotation for later completion. | Row 13; future storage tests. |
| Total-loss recovery | Account path, head assertion, ciphertext, wraps, sealed `R_priv` | no device → authorization → head → unseal → restore | Keep four recovery objects distinct; service never receives factor/unsealed key | Partial local restore/install behavior is not specified; missing object is a named degraded/terminal outcome. | Rows 9, 10, 14; future tests 8–10 and continuity 4/9. |
| Recovery replacement | Pending replace intent, new pair/envelope/wraps, nonce, outcome | old live → pending → exactly old or new live | Open required generations; nonce-bound assertion over transition id; apply signed matching outcome | Same idempotent intent/outcome recovery as rotation; competing winner causes discard/rebuild. | Rows 14–15; future test 11. |
| Lapse/resume/expiry | Live lineage, entitlement, hosted ciphertext/wraps, sealed `R_priv`, clock | grace → hosted read-only/local writable → resume or expiry | Clock starts at sync stop; expiry deletes hosted ciphertext/wraps but keeps `R_pub`/sealed `R_priv` | Partial deletion/backups behavior is deferred to as-built generated deletion tests. | Row 16 retention check; future §11.4. |
| Account deletion | Retire intent/outcome, terminal record, package, hosted stores | live → retired with bytes present → evidence distributed → bytes deleted | Terminal commit first; synchronize evidence; only then delete | Interruption leaves retired lineage plus hosted bytes, never deleted bytes under a live lineage. Offline replica remains stale. | Rows 10, 15; future transition/deletion tests. |
| Migration | Package old root/head/epochs/checkpoint/suffix/gens/recovery; fresh lineage/gen | old service → cutover → new origin → re-enroll/suffix | Verify/open package; create fresh lineage/gen; admit checkpoint; each device applies baseline then only its own suffix | Devices keep writing. Package/new-lineage crash resumption is not specified; never-returning writer’s unarchived suffix is lost. | Row 10; future continuity tests 5–9. |

### TRD selection register and evidence paths

| TRD row | Selected/open/split | Construction or unresolved question | Downstream consumers | Evidence path |
| --- | --- | --- | --- | --- |
| 1 | Selected | Suite 1; carrier version selects whole suite; async AES-GCM, sync XChaCha, HKDF, Ed25519, HPKE, SHA-256; WebAuthn may select ES256 | All carriers/rows 2–15 | Row 1 record, generator/vector, KAT/separation/coverage checks. |
| 2 | Selected | XChaCha journal, random 24-byte nonce, compiled RustCrypto WASM | Crash journal/startup/performance | Row 2 vector; generated artifact; external KAT/composition check; Pixel 9a measurement. |
| 3 | Selected | AES-GCM records/key envelopes; clear fields in AAD; non-resetting `seq` | Store/trim/custody/heads | Row 3 generator/vector and AAD-elision audit; integration future. |
| 4 | Selected | Signed encrypted envelope; actor sealed; ciphertext digest clear; credential position | Relay/attribution/acceptance/migration | Row 4 generator/vector; no integrated layer. |
| 5 | Selected | Accepted hash chain and signed amortized heads/final cutoff | Inbound apply/revocation/head vectors | Row 5 generator/vector; future hostile-relay tests. |
| 6 | Selected | Four-condition anti-replay; mark; definite-refusal re-mint; second-newest retention | Heads store/suffix/migration | Row 6 generator/vector; future crash/admission tests. |
| 7 | Selected | Full checkpoint; signed manifest; `sv`+`ds`; retain two | First sync/recovery/rotation/migration | Row 7 generator/vector; future coverage/fallback. |
| 8 | Selected | Standing signed per-card attribution in content root | Checkpoint/migration/provenance/trim | Row 8 generator/vector; integration future. |
| 9 | Selected | Three head-arrival paths; nonce assertion only for total-loss recovery | Enrollment/archive/recovery bootstrap | Row 9 generator/vector; row 11/package amendments. |
| 10 | Selected | One package for never/live/retired; root bound in HPKE `info` | Archive/cutover/deletion/migration | Row 10 generator/vector with RFC 9180 reproduction; future continuity tests. |
| 11 | Selected | Committed-nonce five-symbol SAS; QR accelerator | Enrollment/head bootstrap/key delivery | Row 11 generator/vector; future two-device test. |
| 12 | Selected | Discoverable WebAuthn credential; service-signed offline slot binding | Sign-in/slot/recovery step-up | Row 12 generator/vector/shared helper; account service absent. |
| 13 | Selected | Generated-code-root device lock; optional PRF; atomic custody swap; rotate | Local custody/cold start | Row 13 generator/vector; store integration future. |
| 14 | Selected; review-scope split but closed | 125-bit recovery code/no stretching plus nonce-bound transition step-up | Creation/recovery/replacement/device lock | Row 14 generator/vector/negatives; confirmation copy remains product question. |
| 15 | Selected | Signed idempotent intent/outcome for rotate/replace/retire | Revocation/recovery/deletion | Row 15 generator/vector; future interrupted/concurrent tests. |
| 16 | Selected | Twelve-month retention floor+ceiling | Lapse/resume/recovery/inventory | `check-retention.mjs`; no deployed deletion execution. |
| 17 | Selected | ASVS 5.0.0 L2 floor + pull-ups/addenda/deviation | Origin boundary/review gate | Generated pinned profile and origin-isolation build check; verification future. |
| 18 | Open | Whether persistent encrypted search is needed | Search only | Measure in-memory rebuild first. |
| 19 | Open | Root-type day collections | CRDT schema/compaction/repair | Re-count costs; no selection artifact. |
| 20 | Split | Evidence closed for selected rows; open for future selections | Review gates/future rows | Sixteen generated artifacts plus row 16 check and row 17 profile. |
| 21 | Open | Cutover system attribution versus early fidelity archive | Stage 2 cutover/history | Product choice required; Markdown authorship fields rejected. |

### Evidence tiers

| Tier | Present at tip | Supports | Does not establish |
| --- | --- | --- | --- |
| External KAT/direct artifact check | XChaCha KAT against generated WASM; suite KATs; HPKE generator reproduction | Primitive/artifact agreement at tested inputs | Protocol integration or broad review |
| Project composition artifacts | Sixteen JSON artifacts, staleness checks, negative cases, AAD field-elision audit | Exact project encodings and declared failures as modeled by generators | Independent implementation/model diversity |
| Measurements | Plaintext startup; journal candidates/WASM on Pixel 9a; bundle/engine instantiation | Recorded method/hardware at cited commits | Unbuilt key-store/envelope/checkpoint performance or all low-end devices |
| Required future tests | TRD §§11.1–11.4 and continuity gate | Defines implementation evidence owed | Evidence those target behaviors already run at the tip |

### Post-draft coverage check

The permitted comparison with review orientation/status and `F-01` found no missing required lifecycle machine. It produced three framing corrections without changing the blind reconstruction:

- The orientation's “18 selected rows” counts rows 1–17 plus row 20 closed for the selected constructions. Row 20 remains split for any future/open construction, so the register table above preserves both facts.
- `progress.md`'s claim that review scopes are closed and reviews are booked for the week of 2026-08-24 is planning evidence, not an external reviewer result. No reviewer result exists in the snapshot.
- The original contract independently confirms that valid signatures are not acceptance evidence, a state vector is not full checkpoint coverage, Markdown is not fidelity preservation, and within-provider replicas are not service-independence evidence. Those distinctions were already present in E-06, E-09, E-17/E-18, and the evidence-tier table; no new end-state claim was imported from the base.

## Affirmative conclusions

1. **The end-state boundary is explicit.** Local availability, content confidentiality, authorization, source attribution, service acceptance, key delivery, recovery, retention, and migration are assigned to different actors and artifacts. In particular, account authentication is not key delivery, the relay is not the acceptance signer, and an archive is not a recovery factor.
2. **The selected carrier model is concrete enough to reconstruct.** Rows 1–17 fix the suite, journal, record, envelope, accepted-chain, checkpoint, enrollment, account-credential, custody, recovery, transition, retention, and assurance constructions. Rows 18, 19, and 21 remain product/architecture questions; row 20 is deliberately split between closed selected-row evidence and future selections.
3. **The most important persistence orderings are named.** Journal-before-return, content-before-head-mark, state-before-trim, intent-before-network, outcome-before-generation switch, checkpoint-before-old-generation disposal, atomic custody swap, and terminal-lineage-before-byte-deletion each have a stated failure outcome.
4. **Crash semantics are uneven rather than absent everywhere.** The journal, trim, accepted-head, promotion, custody, idempotent transition, and deletion paths define useful crash invariants. Checkpoint publication/install, multi-step enrollment, destructive local clear, total-loss restore, lapse expiry, and service cutover do not yet specify a complete durable resumption transaction.
5. **Residuals are generally stated as residuals.** The snapshot does not promise immediate revocation propagation, remote erasure, new-client rollback immunity against a malicious authorization service, unlinkability, same-origin-code resistance in the default custody tier, or recovery without all four recovery objects.
6. **Evidence independence varies by layer.** The compiled journal has a direct external KAT/composition check and device measurements. The protocol rows primarily have project-owned generators, vectors, staleness checks, and negative examples; these pin encodings but do not substitute for the future integrated and hostile-relay tests listed in TRD §11.
7. **The repository does not present the predecessor as the target implementation.** The tip app still persists plaintext through `y-indexeddb` and a plaintext local-storage journal, while the relay parses/merges Yjs under a shared bearer token. The TRD names those surfaces as rewrite/replacement targets, so the selected-row guarantees are specification-time obligations at this snapshot.

## Candidate or validated findings

- **Candidate `f-tip-prd-stale-selection-status`: current PRD selection-state prose conflicts with the current TRD register.** PRD §6.3 says the enrollment ceremony remains open and that TRD §15 carries it as open (`9edd930…:docs/PRD.md` lines 1133–1137), while TRD §13.6 and §15 row 11 select committed-nonce SAS with QR only as an accelerator (`:docs/TRD.md` lines 2202–2212, 2866). PRD §6.5 likewise says finalization is open (`:docs/PRD.md` lines 1248–1253), while TRD §15 row 5 selects the accepted chain (`:docs/TRD.md` line 2865). PRD §7.6 says both step-up and confirmation UX remain open (`:docs/PRD.md` lines 2024–2029), while row 14 closes step-up and leaves only confirmation wording/UX outside the selected construction (`:docs/TRD.md` lines 2433–2449, 2864). The attempted benign reading—that these paragraphs are historical rationale—does not fit their present-tense “TRD” directives or the PRD's standalone normative role. The construction itself is not assessed here; the concern is contradictory status routing for implementers and reviewers.

## Disconfirmed hypotheses and null results

- **“Selected” means integrated:** disconfirmed by the predecessor code and the TRD's future test inventory. Generated artifacts close design rows, not implementation rows.
- **All selected rows have the same evidence quality:** disconfirmed. Row 2 reaches compiled WASM, external KAT comparison, and device measurements; most other rows stop at generated composition vectors; row 16 is a prose retention check and row 17 a generated assurance profile/build check.
- **A passkey/account recovery alone restores content:** disconfirmed by the four-object model. It restores account access/authorization, not content-key access or ciphertext availability.
- **Revocation is immediate or remotely erases a device:** disconfirmed. Observation is asynchronous, detached devices remain locally writable, and prior plaintext/ciphertext exposure is not revoked.
- **Checkpointing alone preserves authorship:** disconfirmed. Standing signed attribution records are a separate retained content structure.
- **The accepted-head vector is an envelope log:** disconfirmed. It stores the last `(seq, link)` mark per credential; envelopes/checkpoint suffixes are separate.
- **The fidelity archive is a recovery factor:** disconfirmed. It supplies ciphertext/package material and still requires a content-key factor.
- **Migration revokes the old service:** disconfirmed. It creates a new lineage/generation and isolates the old service; unreachable old copies remain an acknowledged residual.
- **Every destructive flow has a concrete crash transaction:** disconfirmed by the explicit gaps in local clear, expiry, checkpoint install, and migration cutover.

## Unresolved questions

- What persistent transaction publishes checkpoint bytes, manifest, and admission evidence atomically, and how is a partially installed checkpoint rolled back?
- How does enrollment resume or abort across credential admission, nonce commitments/reveals, SAS confirmation, and key-wrap persistence?
- What journal/transaction spans slot index, sessions, credentials/keys, and all scoped stores during destructive clear/reset?
- How are partial hosted deletions, replicas, backups, and retry evidence represented at lapse expiry?
- What durable state machine resumes package verification, fresh-lineage creation, checkpoint admission, and device suffix replay during service cutover?
- What accepted-head signing cadence satisfies the still-measurable remote-visible latency budget, and what checkpoint cadence bounds suffix/recovery cost?
- What rate/size limits govern service delivery of stored envelopes and packages before the integrated service exists?
- Which side of row 21 is selected at cutover: system attribution at origin or a separately marked early-fidelity archive?
- Which §11 tests become executable first once the encrypted persistence, envelope, and account/authorization layers replace the predecessor?

## Completion criteria

- [x] Claims map covers actors, guarantees, assumptions, and residuals.
- [x] State-machine map covers startup/writes, trim, admission/finalization, checkpoint/restore, enrollment, account unlock, recovery, transitions, lapse/deletion, and migration.
- [x] TRD rows 1–21 are classified as selected, open, or split with downstream consumers and evidence paths.
- [x] Crash behavior is stated when specified and marked unresolved when absent.
- [x] Evidence types are separated from future implementation obligations.
- [x] No construction is labeled correct or incorrect.

## Handoff

Analysis and permitted post-draft coverage check are complete. The candidate documentation contradiction is persisted separately as `docs/review/findings/f-tip-prd-stale-selection-status.md`. The session handoff records the remaining validation command and next dependency-ready item.
