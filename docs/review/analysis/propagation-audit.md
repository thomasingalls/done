---
schema: 1
kind: work-item
id: P-01
status: complete
owner: root
started: 2026-08-26
updated: 2026-08-26
blocked_on: none
---

# `P-01` — propagation audit

## Scope and exclusions

Trace every original and end-state claim through its introducing commit, selection reasoning, then-current fold,
final requirement, executable evidence, and downstream consumers. Locate each first divergence with a short
forward replay. Production code, requirements, selection records, generated vectors, and tests are read-only;
combined adversarial replay remains `S-01`, independent finding disposition remains `V-01`, and synthesis remains
`Z-01`.

## Exact sources inspected

- Exact boundary documents at `c6116669030eedeea3d599bca0da3547114e6930` and
  `9edd9300adebcec3abd2234c946f1dcccdc17eef`: `docs/PRD.md`, `docs/TRD.md`, `docs/sequencing.md`,
  `docs/progress.md`, `docs/decisions.md`, and `docs/performance.md`, read through Git objects without moving the
  checkout. The base-to-tip PRD/TRD diff and every intermediate commit touching those documents were also inspected.
- All seventeen exact-tip `docs/selections/row-*.md` records, their introduction/amendment histories, and all sixteen
  generated `test/vectors/*.json` construction artifacts plus the row-16 retention checker and row-17 generated
  assurance profile.
- `package.json`; the suite, AAD, retention, origin-isolation, WASM build/verification, and vector generators; exact
  tip application/relay implementation evidence as inventoried by F-02 and X-01 through X-06.
- Completed foundation artifacts F-01/F-02, all four batch reports and 35 commit cards, all six seam analyses and
  their handoffs, all 37 candidate findings, `STATUS.md`, `DECISIONS.md`, `orientation.md`, and the immutable review
  manifests/work graph.
- Primary standards and platform evidence already versioned and retrieved in X-06: WebDX Baseline, MDN browser
  compatibility data, W3C WebCrypto/WebAuthn/WebAssembly, OWASP ASVS 5.0.0, RFC 5869/8032/9180, FIPS 180-4,
  NIST GCM material, the XChaCha draft, and RustCrypto audit/version sources. P-01 did not silently refresh those
  dated observations.

## Method

- Used F-01's 83 `OC-*` rows and F-02's 20 `E-*` rows as the exhaustive claim population. A mechanical coverage
  check after drafting requires every id exactly once.
- For an original claim already present at the boundary, `Introducing commit` says `base c611666`; where this
  lineage first selected a mechanism it names that later commit too. For an end-state claim, the field names the
  earliest construction commit. `First divergence` is the first forward commit where a surviving loss,
  contradiction, or assurance overclaim became observable; `base` means the inconsistency already existed at the
  pinned boundary, and `none` means no divergence was found.
- Kept four layers separate: original constraint, selection rationale, final normative fold, and executable
  evidence. A generated vector supports the selected bytes and declared negatives; it is not treated as application,
  browser, service, crash, lifecycle, or independent-review evidence.
- Applied one primary disposition per claim: `preserved` (same operative meaning), `qualified` (meaning survives
  with an explicit boundary), `lost` (a load-bearing caveat disappeared), `contradicted` (a reachable state or
  current source conflicts with it), `unimplemented` (the final target claims a mechanism but the pinned runtime
  still lacks it), or `not applicable` (the row deliberately remains open or its gate is outside this lineage).
- Replayed the lineage forward in substantive order after the row audit, and then reconciled every affirmative and
  reopened conclusion from X-01 through X-06. Existing finding files are referenced rather than duplicated; no
  finding is promoted before V-01.

## Analysis

### Claim propagation ledger

Abbreviations used only to keep the table reviewable: `B` is the exact base `c611666…`; `T` is exact tip
`9edd930…`; `rN` is `T:docs/selections/row-N-*.md`; `gen-N` is its generator/vector; `future tests` are the
specific TRD §11/continuity tests that remain obligations rather than observed passes.

#### Original claims `OC-001`–`OC-020`

| Claim id | Original source | Introducing commit | Selection record | Final requirement | Executable evidence | Consumers | Disposition | First divergence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OC-001 | `B:PRD` §§2.1–2.2 | base `c611666` | — | `T:PRD` keeps one human per workspace and no v1 human sharing | No new evidence in range; product/authorization tests remain downstream | Membership, authorization, UI | preserved | none |
| OC-002 | `B:PRD` §2.3 | base; lapse policy `cdd2069` | r16; r15 claims downgrade binding | `T:PRD` still derives Local/Account only from lineage; lapse remains a separate axis | Retention anchor check; no lapse transition/runtime | Lifecycle, pricing, local availability | preserved | none; lapse carrier is OC-078 |
| OC-003 | `B:PRD` §2.4 | base | r10, r15, r16 exercise separate properties | `T:PRD` still separates availability, durability, recovery, portability, independence, safety, confidentiality | Package/transition/retention artifacts are composition evidence only | All copy, lifecycle, continuity | preserved | none |
| OC-004 | `B:PRD` §2.5 | base | — | `T:PRD` preserves model capacity without v1 sharing/admin UI | No new evidence in range | Workspace picker and authorization UI | preserved | none |
| OC-005 | `B:PRD` §§3, 4.1 | base | — | Workflow and non-dropping replicated overflow unchanged at T | Existing workflow/property tests; not changed here | CRDT/UI/import | preserved | none |
| OC-006 | `B:PRD` §§4.2–4.4; `B:TRD` §4.5 | base | — | Movement/freeze remains UX-only; import/replication/compaction remain exempt | Existing workflow tests; not changed here | Workflow, import, compaction | preserved | none |
| OC-007 | `B:PRD` §4.8 | base | — | Byte Markdown and editor geometry unchanged | Existing editor tests; no new evidence | Editor/export | preserved | none |
| OC-008 | `B:PRD` §4.9 | base | — | Projection remains non-authoritative and no stable master-task identity appears | No new evidence | Navigation/product scope | preserved | none |
| OC-009 | `B:PRD` §§5.1–5.2; `B:TRD` §4.8 | base; enrollment `a073574` | r11, r12 | New device still mints a distinct credential/actor; person/device separation retained | Enrollment/account vectors do not run the identity store | Identity, enrollment, presence | preserved | none |
| OC-010 | `B:PRD` §5.3; `B:TRD` §7.4 | base; envelope `992bc91` | r4, r5 | T binds workspace/epoch/credential and seals actor in a source-signed envelope | `gen-envelope`, finalization vector; no integrated receiver | Relay, receiver, attribution | qualified | none; encoding is preserved but runtime remains future |
| OC-011 | `B:PRD` §§5.3–5.4; `B:TRD` §§4.8, 7.4 | base; exact envelope `992bc91`, depth `745e332` | r4, r6 | Source signatures and second-newest-checkpoint retention are normative | Envelope/antireplay vectors do not persist exact outbound bytes | Retry, migration, attribution | unimplemented | `992bc91`: exact random-nonce bytes gained no durable spool; `745e332`: refusal rule gained no signed refusal carrier |
| OC-012 | `B:PRD` §5.4 | base | — | Per-tab human-only undo remains unchanged | Existing undo tests; no lineage change | Editor/CRDT | preserved | none |
| OC-013 | `B:PRD` §§5.5–5.6 | base | — | Presence/caret/dedup boundaries unchanged | Existing presence tests; no lineage change | Presence UI | preserved | none |
| OC-014 | `B:PRD` §5.7 | base; standing claims `b997cdb` | r8 | T still bounds provenance, and adds per-card creation claims | Attribution vector distinguishes exact versus edited, but not first claim versus later replacement | Provenance, checkpoints, packages | qualified | `b997cdb`: mutable CRDT residence cannot prove first creation to a fresh restorer |
| OC-015 | `B:PRD` §5.8; `B:TRD` §10.6 | base | — | Agent edit/read and whole-workspace disclosure boundary unchanged | No agent implementation evidence added | Future agents/security copy | preserved | none |
| OC-016 | `B:PRD` §§6.1–6.3; `B:TRD` §13.6 | base; SAS `a073574`, head amendment `992bc91` | r9, r11, r12, r14 | Promotion/start-fresh separation remains; enrollment uses service admission plus person-mediated key delivery | Enrollment vectors cover transcript bytes, not persisted eligibility or authentic recovery material | Account creation, promotion, enrollment | qualified | `a073574`: ceremony authenticates `W_pub` but not durable eligibility or `R_pub` |
| OC-017 | `B:PRD` §§6.4–6.5; `B:TRD` §7.5 | base; finalization `a073574`, transitions `4259822` | r5, r6, r15 | T preserves requested/committed/acknowledged revocation and observation-relative forward exclusion | Finalization/transition vectors; no local successor-install or service lifecycle execution | Device list, revocation, rotation | qualified | base already lacked client-authenticated reader eligibility; `4259822` leaves local applying order undefined |
| OC-018 | `B:PRD` §§6.5–6.6 | base | r15 narrows propagation only | T explicitly keeps past copies, detached local writing, sign-out versus removal, no remote wipe | No destructive-clear runtime added | Lifecycle/copy | preserved | none |
| OC-019 | `B:PRD` §§6.7–6.8; `B:TRD` §6.5 | base; passkey binding `b9ff071` | r12 | Per-slot stores and offline public-key slot proof are retained; proof grants no network authority | Account vector covers SPKI substitution; close/reopen transaction and embedding policy remain future | Slot picker, account unlock, local store | qualified | `b9ff071`: verifier omits cross-origin/top-origin policy |
| OC-020 | `B:PRD` §6.9 | base; package `745e332`, retire transition `4259822` | r10, r15 | T still says terminal first, evidence distributed, safe survivor/export, then hosted deletion | Package/retire vectors do not prove delivery, freshness, catch-up, or deletion gate | Account deletion, packages, hosted inventory | contradicted | `745e332`: selected package has no durable survivor acknowledgement; `4259822` can settle retire without one |

#### Original claims `OC-021`–`OC-042`

| Claim id | Original source | Introducing commit | Selection record | Final requirement | Executable evidence | Consumers | Disposition | First divergence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OC-021 | `B:PRD` §6.10 | base; transition `4259822`, duration `cdd2069` | r15, r16 | T selects twelve months from sync stop, keeps lineage/live local writes, and deletes hosted ciphertext/wraps at expiry | Five-anchor retention check; no lapse carrier, expiry transaction, backup deletion, or reseed execution | Billing, resume, recovery, inventory | qualified | `4259822`: claims downgrade binding but defines no lapse kind |
| OC-022 | `B:PRD` §6.11; `B:TRD` §13.5 | base; head discovery `992bc91` | r9, r10 | T still reads signed live/terminal lineage, never roster/label, and refuses silent re-genesis | Head/package vectors; product response and local repair remain future | Identity-loss handling, migration | preserved | none |
| OC-023 | `B:PRD` §7.1; `B:TRD` §6.1 | base; store selections `9860a0b`, `3bea0e6` | r1–r3 | T specifies ciphertext-from-genesis for every app-managed store | Exact tip app still uses plaintext `y-indexeddb` and `1:` journal | Stage 1 store, no-plaintext tests | unimplemented | base implementation debt remains; selections do not integrate it |
| OC-024 | `B:TRD` §6.1 | base; record `3bea0e6`, heads `745e332` | r3, r6 | T preserves key→journal→records→transport and state-before-delete; adds authenticated heads | Record/antireplay vectors; no cross-tab allocator/trim coverage transaction | Startup, trim, accepted marks | qualified | `3bea0e6`: global authenticated `seq` has no durable allocator or generation-start accounting |
| OC-025 | `B:PRD` §7.1; `B:TRD` §§6.1, 10.10 | base; journal `9860a0b`, WASM `9b49b74` | r2 | Random XChaCha nonce and synchronous inlined seal are final; every update still owes WAL-before-return | WASM KAT/composition/limits and Pixel measurement; exact seal rejects over 64 KiB | Stage 1 write path, crash recovery | contradicted | `9b49b74`: explicit 65,537-byte refusal has no pre-mutation/chunk/alternate durable state |
| OC-026 | `B:PRD` §7.2; `B:TRD` §13.3 | base; lock `f5def83`, normative fold `dbfd01f` | r13 | Factor-gated custody, atomic reseal, and forward rotation are final | Device-lock vector covers local transaction, not multi-device rotation or reader-key bypass | Device lock, copy, key custody | lost | `dbfd01f`: `rotation_owed` caveat disappears from normative copy; `f5def83` also leaves promptless reader-key bypass |
| OC-027 | `B:PRD` §7.3; `B:TRD` §§7.3, 13.2 | base | r5, r11, r15 | T still claims authorization never causes key delivery and service lacks content keys | Ceremony/transition vectors authenticate immediate `W_pub`, not durable reader/recovery eligibility | Enrollment, rotation, malicious-service tests | contradicted | base: service roster and every-reader rotation have no client-authenticated eligibility object; `a073574` adds unbound delayed `R_pub` |
| OC-028 | `B:PRD` §§7.3, 9 | base | — | No service escrow; future separate-entity escrow boundary unchanged | No escrow implementation in range | Recovery/audit/legal boundary | preserved | none |
| OC-029 | `B:PRD` §7.4; `B:TRD` §13.7 | base; transitions `4259822` | r11, r15 | T still requires client-generated successor wrapped only to remaining readers/recovery | Transition vector has opaque wrap map; no authentic eligibility state; replacement omits forward rotation | Revocation, recovery replacement | contradicted | base reader-eligibility gap; `4259822` preserves active generation during exposed-code replacement |
| OC-030 | `B:PRD` §7.4; `B:TRD` §§4.5, 10.4, 13.7 | base; attribution `b997cdb` | r7, r8, r15 | T replaces unbounded old-generation attribution retention with current-root claims and checkpoint conditions | Attribution/checkpoint vectors; replacement and fallback-key candidates survive | Provenance, compaction, key deletion | qualified | `b997cdb`: retention reduction depends on a mutable claim and an inverted fallback-key rule |
| OC-031 | `B:PRD` §7.5; `B:TRD` §7.4 | base; envelope `992bc91` | r4 | Actor stays sealed; credential/traffic metadata and lack of unlinkability remain explicit | Envelope vector binds clear/sealed split | Relay/privacy copy | preserved | none |
| OC-032 | `B:TRD` §7.5 | base; accepted chain `a073574` | r5, r6 | T requires source verification plus client-recomputed accepted head; split views remain a stated residual | Finalization/antireplay vectors; no integrated service | Admission, revocation, hostile relay | qualified | none: per-view theorem preserved; global service fork prevention never claimed |
| OC-033 | `B:TRD` §7.6 | base; checkpoint `b997cdb` | r7, r8 | T selects full encrypted snapshot, signed manifest, `{sv,ds}`, accepted heads, two fallbacks | Checkpoint vector binds fields but does not derive semantic coverage; no admission/install transaction | Restore, trim, migration | contradicted | `b997cdb`: project oracle accepts independently chosen snapshot, coverage, and heads and inverts key-retention subject |
| OC-034 | `B:PRD` §§7.6–7.7; `B:TRD` §13.8 | base; recovery `8d7d783`, package `745e332` | r9, r10, r14, r15 | Four-object recovery and mandatory generated code remain final | Recovery/head vectors support factor separation; package root/replacement gaps bound assurance | Recovery, archive, total loss | qualified | `745e332`: package root can be rewrapped/substituted; `4259822`: replacement keeps exposed generation |
| OC-035 | `B:PRD` §7.8 | base | r15 retains history explicitly | T still disclaims forward secrecy/history erasure | No new evidence needed for a non-goal | Security copy, rotation | preserved | none |
| OC-036 | `B:PRD` §7.9; `B:TRD` §13.4 | base; passkey `b9ff071`, lock `f5def83` | r11–r14 | Signing, wrapping, account, recovery, and custody roles remain distinct; local app access is not network unlock | Composition vectors; no integrated key store; cross-origin policy and reader-key bypass qualify custody | Key store, device list, unlock | qualified | `f5def83`: copied promptless wrapping credential bypasses local lock after rotation |
| OC-037 | `B:PRD` §7.10; `B:TRD` §10.5 | base | — | Non-durable-storage warning and remedies unchanged | Existing/future UI tests; no lineage change | Launch copy, persistence | preserved | none |
| OC-038 | `B:PRD` §7.11; `B:TRD` §§7.7, 16 | base; inventory amended `cdd2069` | r16, r17 | Awareness/metadata purpose, retention, deletion, visibility, vendor inventory stay explicit | Retention checker verifies anchors, not deployed inventory/deletion | Relay, logging, privacy review | preserved | none |
| OC-039 | `B:PRD` §7.12; `B:TRD` §§11.2, 13.11 | base; row-20 closure begins `dbfd01f` | r1–r17, r20 split | T still requires the full protocol/storage scenario suite; generators are not those tests | Composition artifacts exist; integrated persistence/service/browser/lifecycle tests do not | Ship gates, external review | unimplemented | none: T labels §11 tests future, despite selected-row closure |
| OC-040 | `B:PRD` §7.12; `B:TRD` §§13.11; `B:sequencing` §§3.7, 5.1 | base | selections feed review input only | Author-only development versus non-author/public ship gates unchanged | No evidence gate is claimed crossed | Release governance | preserved | none |
| OC-041 | `B:PRD` §7.12; `B:TRD` §13.11; `B:sequencing` §5.2 | base; booking `e41b0d0` | r1–r17 define scope | T claims 3a/3b booked and scopes closed; still requires answers before cutover/sync | Repository has booking prose, no reviewer identity, response, or result | Review 3a/3b, Stage 1/4 | qualified | `e41b0d0`: calendar claim is not independently evidenced, but does not claim review completion |
| OC-042 | `B:PRD` §7.12; `B:TRD` §13.11 | base | r17 supplies level-2 profile only | Disclosure/live-reporting and level-4 implementation-audit triggers unchanged | No trigger crossed in lineage | Marketing/escrow/release | preserved | none |

#### Original claims `OC-043`–`OC-062`

| Claim id | Original source | Introducing commit | Selection record | Final requirement | Executable evidence | Consumers | Disposition | First divergence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OC-043 | `B:PRD` §§8.1–8.2; `B:TRD` §§9.1–9.2 | base; terminology `d3ef2dc` | row 21 remains open | T preserves byte Markdown escape and explicit identity/attribution loss; `unfiled.md` is the only naming change | Existing import/export tests; terminology migration clean | Export/import, cutover | preserved | none |
| OC-044 | `B:PRD` §8.3; `B:TRD` §9.3 | base; package `745e332` | r7, r10, r14 | T calls archive exact ciphertext plus factor and explicitly requires a Local portable wrap | Package vector never constructs Local opener and permits root rewrap substitution | Archive, total-loss restore, migration | contradicted | `745e332`: never-established state has opaque digests but no saved-factor→generation path |
| OC-045 | `B:PRD` §§8.4–8.6 | base | r10 packages one input | Independently runnable client/services/store/recovery tool and provider-account-loss tests remain required | Tip has design artifacts, not continuity tests 4–9 or independent deployment | Continuity/service independence | unimplemented | base future obligation remains |
| OC-046 | `B:PRD` §8.5; `B:TRD` §§14.1–14.3 | base; package/checkpoint `b997cdb`, `745e332` | r6–r10, r15 | New lineage/generation, checkpoint origin, and own-suffix-only migration remain final | Vectors pin carriers; package root, checkpoint semantics, local switch and missing-return loss remain | Migration, recovery, attribution | qualified | `b997cdb`/`745e332`: selected continuity inherits coverage/root gaps |
| OC-047 | `B:PRD` §9 | base | — | Explicit product/security non-goals unchanged | No new evidence | Scope governance | preserved | none |
| OC-048 | `B:PRD` §10 Phase 2; `B:sequencing` §3.2 | base | rows 1–3/13/14 are Stage 1 inputs | Real-device workflow, no-plaintext snapshot, isolation/import/budget exits remain future | Selected artifacts do not run Stage 1 store | Stage 1 exit | not applicable | none; gate not reached |
| OC-049 | `B:PRD` §10 Phase 3; `B:sequencing` §3.5 | base | rows 4–17 are Stage 4 inputs | Device list, rotation/finalization/conformance and week-long two-device dogfood remain future | No service/dogfood execution | Stage 4 exit | not applicable | none; gate not reached |
| OC-050 | `B:sequencing` §3.1; `B:progress` active slice | base; baseline `caee157`, booking `e41b0d0`, first closure `dbfd01f` | r1–r3 plus vectors | T has constructions/vectors, plaintext baseline, and booking claims and says Stage 0 ready | Baseline provenance points to parent; booking has no reviewer identity/readback; HPKE arrived later | Stage 0 exit | qualified | `dbfd01f`: readiness fold overstates row-20 HPKE evidence; later artifacts repair bytes, not timing |
| OC-051 | `B:sequencing` §7 | base; first fold `dbfd01f` | r1–r3 | Concrete selections/vectors and pre-encryption baseline exist at T | HPKE was missing when row 20 first closed; project vectors remain shared-model evidence | Stage 0 warning/review intake | qualified | `dbfd01f`: row 1 called fully vectored while record said HPKE was not |
| OC-052 | `B:sequencing` §7 | base | storage rows are inputs only | Store refactor/encryption separation, persisted fleet, and 3a timing remain Stage 1 warnings | No Stage 1 implementation in range | Stage 1 planning | not applicable | none |
| OC-053 | `B:sequencing` §7 | base | row 21 remains open | T still permits exactly Markdown or early fidelity archive and records the warning ambiguity | No cutover executed | Cutover planning | preserved | none |
| OC-054 | `B:sequencing` §7 | base; target protocol selected `a073574` onward | r4–r7, r15 | T still says predecessor plaintext/Yjs relay must be replaced and refusal is not revocation | Exact tip relay remains predecessor; target tests future | Stage 4 warning | preserved | none |
| OC-055 | `B:sequencing` §7 | base | r10 supplies package design | Provider-account-loss remains decisive continuity test | No independent execution | Stage 5 continuity | unimplemented | base future obligation remains |
| OC-056 | `B:sequencing` §8 | base | — | Uneven-stage/non-ship-boundary assumption unchanged | No contrary scheduling evidence | Planning | preserved | none |
| OC-057 | `B:sequencing` §8 | base; booking `e41b0d0` | selection package is proposed review input | T still assumes specification-first review and contains no reviewer answer | Booking prose only | Review critical path | qualified | none; assumption remains unresolved, not silently settled |
| OC-058 | `B:sequencing` §8 | base | — | Retrieval/review-speed scheduling assumption unchanged | No relevant execution | Planning | not applicable | none |
| OC-059 | `B:sequencing` §§5.4, 8 | base | row 21 open; r10 does not close it | T still names exact identity loss and requires system attribution or early archive before cutover | No cutover evidence | Stage 2 product choice | preserved | none |
| OC-060 | `B:TRD` §10.8; `B:sequencing` §5.3 | base | row 19 open | Root-day risk/trigger and card-survival repair remain unchanged | No new empirical trigger/evidence | CRDT schema/Done order | preserved | none |
| OC-061 | `B:TRD` §§10.1, 10.4–10.5 | base; attribution changes one retention consequence `b997cdb` | r8 | Yjs debt, compaction safety pause, growth, and eviction warnings remain | No compaction implementation; attribution vector only narrows key retention | Maintenance/storage | preserved | none |
| OC-062 | `B:TRD` §12; `B:performance` | base; baseline `caee157`, browser floor `bd87655`, journal measures `66a7c6a`→`9b49b74` | r2 and performance ledger | Budgets remain; T claims tested Pixel values and Baseline-related population rationale | Fixed-slot single-device measurements; plaintext rows name parent without harness | Performance/CI/review | qualified | `caee157`: baseline provenance mismatch; `bd87655`: compatibility is misused as hardware floor |

#### Original register claims `OC-063`–`OC-083`

| Claim id | Original source | Introducing commit | Selection record | Final requirement | Executable evidence | Consumers | Disposition | First divergence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OC-063 | `B:TRD` §15 row 1 | base; selection `3bea0e6` | r1 | Suite 1 and whole-suite carrier agility are final | Suite KAT/registry check | Every crypto carrier | contradicted | `3bea0e6`: `path: both` evades both buckets; `992bc91`: selected network carrier remains null in registry |
| OC-064 | `B:TRD` §15 row 2 | base; selection `9860a0b`, provider `9b49b74` | r2 | Random 24-byte XChaCha WASM journal is final | External KAT, project cases, boundaries, Pixel measurement | Stage 1 journal | contradicted | `9860a0b`: rotated fixture reuses `K_g`; `9b49b74`: fixed input/64-KiB/source-drift gaps |
| OC-065 | `B:TRD` §15 row 3 | base; selection `3bea0e6`, fold `dbfd01f` | r3 | AES-GCM record/key envelope and monotonic global sequence are final | Record vector/AAD audit | Store, trim, heads, nonce budget | lost | `dbfd01f`: numeric rotate-before-write ceiling disappears; `3bea0e6` also lacks allocator/generation watermark |
| OC-066 | `B:TRD` §15 row 4 | base; selection `992bc91` | r4 | Version-1 signed/sealed envelope and source-only batching are final | Envelope generator with isolated field negatives | Relay, accepted chain, attribution | qualified | `992bc91`: encoding is sound, but carrier registry and durable outbound state are not propagated |
| OC-067 | `B:TRD` §15 row 5 | base; selection `a073574` | r5 | Per-credential accepted chain and signed heads/final cutoff are final | Finalization vector | Admission, revocation, checkpoint | qualified | none: per-view integrity survives; split views remain explicit |
| OC-068 | `B:TRD` §15 row 6 | base; selection `745e332` after r4 | r6 | One mark, definite-refusal-only re-mint, and second-newest retention are final | Antireplay vector | Outbound retry, replay, migration | contradicted | `992bc91`: exact bytes need a spool; `745e332`: no authenticated ordinary-refusal carrier exists |
| OC-069 | `B:TRD` §15 row 7 | base; selection `b997cdb` | r7 | Full checkpoints, `{sv,ds}`, two retained, rotation checkpoint are final | Checkpoint vector | Restore, trim, migration, key deletion | contradicted | `b997cdb`: semantic coverage is not tested and fallback rule protects checkpoint rather than opener |
| OC-070 | `B:TRD` §15 row 8 | base; selection `b997cdb` | r8 | Standing signed per-card claim in content root is final | Attribution vector | Provenance, checkpoint, migration | contradicted | `b997cdb`: later admitted writer can replace whole claim with a valid self-claim |
| OC-071 | `B:TRD` §15 row 9 | base; selection `992bc91` | r9 | Enrollment/package external heads plus nonce-bound total-loss assertion are final | Head-discovery vector | Fresh enrollment, archive, recovery | qualified | none: hostile-authority first-contact partition is explicitly retained |
| OC-072 | `B:TRD` §15 row 10 | base; selection `745e332` | r10 | One never/live/retired portable package is final | Package vector/RFC HPKE reproduction | Archive, migration, retirement | contradicted | `745e332`: root rewrap, no Local opener, and impossible record-only live→retired upgrade |
| OC-073 | `B:TRD` §15 row 11 | base; selection `a073574`, head amendment `992bc91` | r11 | Committed-nonce typed SAS authenticates new `W_pub` and current head | Enrollment vector | Device enrollment/key delivery | qualified | `a073574`: immediate ceremony is sound, but eligibility and recovery recipient are not durably authenticated |
| OC-074 | `B:TRD` §15 row 12 | base; selection `b9ff071` | r12 | Discoverable WebAuthn credential and signed local slot binding are final | Account vector/SPKI negative | Account sign-in, offline slot, recovery step-up | qualified | `b9ff071`: RP verifier omits cross-origin/top-origin decision |
| OC-075 | `B:TRD` §15 row 13 | base; selection `f5def83`, fold `dbfd01f` | r13 | Generated-code-root lock, optional PRF, atomic swap, forward rotation are final | Device-lock vector | Local custody/device list | contradicted | `f5def83`: unchanged reader key bypass; `dbfd01f`: pending-rotation caveat lost |
| OC-076 | `B:TRD` §15 row 14 | base; entropy `8d7d783`, step-up `ff0b48f` | r14 | 125-bit/no-stretch and nonce/transition-bound step-up are selected at T | Recovery vector with isolated negatives | Account creation, recovery, replacement, lock | contradicted | `ff0b48f`: TRD closes step-up while current PRD still directs readers that it is open |
| OC-077 | `B:TRD` §15 row 15 | base; selection `4259822` | r15 | Signed rotate/replace/retire mine-other-silence protocol is final | Transition vector | Revocation, recovery replacement, deletion | contradicted | `4259822`: local switch order, exact replacement bytes, forward rotation, lapse kind, and survivor gate remain absent |
| OC-078 | `B:TRD` §15 row 16 | base; transition claim `4259822`, duration `cdd2069` | r16 plus claimed r15 downgrade | Twelve months from sync stop is selected for both hosted paths | Retention checker only | Lapse, expiry, recovery, inventory | contradicted | `4259822`: no lapse kind despite closure claim; `cdd2069` adds policy without expiry execution |
| OC-079 | `B:TRD` §15 row 17 | base; selection `5bd9552` | r17 | ASVS 5.0.0 L2 floor, pull-ups, addenda, deviation are final | Generated profile and literal-form origin scan | Origin boundary, review level 2 | qualified | `5bd9552`: structural profile is sound, but A1 scanner cannot prove broad runtime-egress claim |
| OC-080 | `B:TRD` §15 row 18 | base | remains open | T still requires in-memory search measurement before persistent index choice | No selection/evidence | Search | not applicable | none |
| OC-081 | `B:TRD` §15 row 19 | base | remains open | T still defers root-type days until trigger/cost recount | No selection/evidence | CRDT schema/compaction | not applicable | none |
| OC-082 | `B:TRD` §15 row 20 | base; first closure `dbfd01f`, later all selected rows | r20 split | T has generated artifacts for selected rows and keeps future selections open | Sixteen artifacts plus retention/profile checks; largely shared-model, no integrated/independent protocol runner | Review 3a/3b | qualified | `dbfd01f`: premature HPKE closure; later r10 evidence repairs final availability, not historical overclaim |
| OC-083 | `B:TRD` §15 row 21; `B:sequencing` §5.4 | base | remains open | T still requires system attribution or corrected early archive before first cutover | No cutover/decision | Stage 2 cutover | not applicable | none |

#### End-state claims `E-01`–`E-20`

| Claim id | Original source | Introducing commit | Selection record | Final requirement | Executable evidence | Consumers | Disposition | First divergence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-01 | OC-002–OC-003; `B:PRD` §§2.3–2.4 | base `c611666` | — | `T:PRD`/`T:TRD` keep service-free local read/write and null sync | Existing local app behavior; no network dependency added | Startup, lifecycle, outage copy | preserved | none |
| E-02 | OC-023–OC-025 | `9860a0b`, `3bea0e6`, fold `dbfd01f` | r1–r3 | T specifies ciphertext-from-genesis under generation-derived role keys | Store/journal construction artifacts; exact tip app still persists plaintext | Stage 1 persistence | unimplemented | base implementation remains predecessor; selections never enter app path |
| E-03 | OC-026, OC-075 | `f5def83`, fold `dbfd01f` | r13 | T promises factor-gated custody, atomic reseal/delete, then forward rotation | Device-lock vector covers local swap only | Lock UI, key store, rotation | contradicted | `f5def83`: promptless reader-key bypass; `dbfd01f`: `rotation_owed` nuance lost |
| E-04 | OC-027–OC-029 | base architecture; mechanisms `a073574`, `4259822` | r5, r11, r15 | T claims authorization alone never delivers keys and service cannot decrypt | Ceremony/transition vectors lack durable client-authenticated reader and recovery-recipient eligibility | Enrollment, rotation, malicious authority | contradicted | base reader-eligibility gap; `a073574` leaves `R_pub` outside authenticated transcript |
| E-05 | OC-010–OC-011, OC-031, OC-066 | `992bc91` | r4 | T selects source-signed, actor-sealed envelope with bound clear routing fields | Envelope vector only; target relay/receiver absent | Relay, attribution, admission | unimplemented | `992bc91`: selection is not integrated; registry remains stale |
| E-06 | OC-017, OC-032, OC-067–OC-068 | `a073574`, narrowed `745e332` | r5, r6 | Per-credential accepted links, signed heads/final cutoff, one local mark | Finalization/antireplay vectors | Admission, revocation, checkpoints | qualified | none for per-view theorem; ordinary refusal/spool gaps appear by `745e332` |
| E-07 | OC-022, OC-071 | `992bc91` | r9; amendments to r11/r10 | External head on enrollment/package and nonce assertion on total loss | Head-discovery vector | Fresh client/recovery | qualified | none: hostile service's stale first view remains explicitly bounded to partition |
| E-08 | OC-017–OC-018, OC-029, OC-077 | base exclusion rule; transition `4259822` | r5, r15 | Revocation requires successor, client key/wraps, and finalized cutoff; promise is observation-relative | Transition/finalization vectors; no local applying order or authentic reader set | Revocation/device list | contradicted | base reader-eligibility gap; `4259822` omits successor-install and old-work durability |
| E-09 | OC-030, OC-033, OC-069–OC-070 | `b997cdb` | r7, r8 | Full checkpoint plus standing claims is the bounded recovery/history representation | Checkpoint/attribution vectors | First sync, restore, migration, rotation | contradicted | `b997cdb`: coverage, immutable-first attribution, fallback-key interlock, and publication/install remain open |
| E-10 | OC-016, OC-073 | `a073574`, head amendment `992bc91` | r11 | Committed five-symbol typed SAS binds workspace/head/credentials/new `W_pub`; mismatch spends credential | Enrollment vector | Device enrollment/key delivery | qualified | `a073574`: immediate ceremony survives, but transferable eligibility and `R_pub` binding do not |
| E-11 | OC-009, OC-016 | base target; genesis details folded with protocol selections | r9, r11, r14 | Silent Local genesis and move-not-copy promotion with `K0` remain final | No promotion transaction/integrated account service | Account creation/promotion | unimplemented | none: explicitly future throughout lineage |
| E-12 | OC-019, OC-074 | `b9ff071` | r12 | Per-slot ciphertext and service-signed public-key WebAuthn binding reopen local bytes only | Account vector; no close/reopen transaction; verifier policy gap | Slot picker/account unlock | qualified | `b9ff071`: cross-origin/top-origin policy omitted |
| E-13 | OC-034, OC-076 | `8d7d783`, step-up `ff0b48f` | r9, r10, r14 | Four-object recovery with mandatory 125-bit code and no escrow | Recovery/head/package vectors | Total loss, replacement, archive | qualified | `745e332`: package root/local opener limit ciphertext authenticity; four-object separation itself survives |
| E-14 | OC-034, OC-077 | `4259822`, step-up completion `ff0b48f` | r14, r15 | Nonce-bound account assertion authorizes exactly one recovery replacement | Recovery/transition vectors | Recovery replacement | contradicted | `4259822`: exact envelope/wrap bytes are unbound and exposed old material retains the active generation |
| E-15 | OC-021, OC-078 | `cdd2069` with claimed r15 downgrade binding | r16 | Twelve-month hosted read-only period from sync stop; local writes continue; hosted ciphertext/wraps then delete | Retention consistency checker, no expiry/reseed execution | Billing, resume, total-loss recovery | qualified | `4259822`: no lapse carrier; `cdd2069`: policy is consistent but as-built deletion remains future |
| E-16 | OC-020, OC-072, OC-077 | package `745e332`, retire `4259822` | r10, r15 | Terminal state/evidence must precede hosted deletion; devices remain detached Local replicas | Package/retire vectors | Account deletion, terminal package | contradicted | `745e332`: no current-survivor/export acknowledgement and no record-only authenticated package upgrade |
| E-17 | OC-045–OC-046, OC-072 | `745e332` (with `b997cdb` dependencies) | r6–r10, r15 | Migration creates new lineage/generation from user-held authenticated package, with own-source suffixes | Package/checkpoint/attribution vectors; no clean provider-loss execution | Migration/continuity | contradicted | `745e332`: package root rewrap and Local opener; inherits `b997cdb` coverage/claim gaps |
| E-18 | OC-043–OC-046, OC-059, OC-083 | base escape/archive split; common package `745e332` | r10; row 21 open | Markdown escape and exact encrypted archive remain distinct; independent stack is future | Markdown tests exist; exact restore/migration/continuity tests do not | Portability, restore, cutover | unimplemented | none for honest Markdown loss; archive implementation remains future and selected package is qualified |
| E-19 | OC-038 | base `c611666` | r16/r17 only touch inventory controls | Awareness remains plaintext/ephemeral; every service datum still owes named lifecycle and visibility | Inventory/retention structural checks; deployment future | Relay/operations/privacy | preserved | none |
| E-20 | OC-039–OC-042, OC-050–OC-051, OC-082 | first selection `9860a0b`; row-20 fold `dbfd01f`; later artifacts | r1–r17, r20 split | T accurately presents two states: selected design artifacts and predecessor runtime that must be replaced | Sixteen artifacts, WASM KAT/measurement, structural checks; integrated tests future | Reviewers, Stage 1/4 implementers | preserved | `dbfd01f` is a historical evidence overclaim for HPKE, but T's design-versus-runtime boundary is explicit |

### Forward replay of the divergences

The reverse walk found the final weak seams; this replay identifies when each became load-bearing. Traceability-only
commits are intentionally omitted because their cards show one-token provenance changes only.

| Commit | Forward propagation result | Downstream inheritance |
| --- | --- | --- |
| `caee157` | Records a useful plaintext before-state but points every row at parent `c611666`, which has neither harness nor marks. | OC-050/062 and later performance comparisons inherit directional, not exactly reproducible, provenance. |
| `e41b0d0` | Claims review 3a booked and dates selection input, without reviewer identity/acceptance/result. | OC-041/050 may credit calendar planning only. |
| `9860a0b` | Selects the sound random-nonce journal shape; rotated fixture changes `gen` but not `K_g`. | OC-025/064 gain a construction but not a multi-generation replay oracle. |
| `3bea0e6` | Selects suite/records; `path: both` escapes the declared separation checker and global `seq` lacks allocator/generation accounting. | OC-024/063/065; all store and heads consumers inherit the sequence joint. |
| `8d7d783` | Selects generated 125-bit/no-stretch recovery correctly; network step-up remains explicitly draft. | OC-034/076 entropy conclusion survives later protocol work. |
| `f5def83` | Selects locally crash-safe device-lock swap and owed rotation, but leaves the device's ordinary promptless reader key able to receive the successor. | OC-026/036/075 and E-03; later normative fold also loses the owed-state copy. |
| `dbfd01f` | Folds five storage selections while dropping `rotation_owed` and the numeric nonce ceiling, and closes row 20 before HPKE evidence exists. | First clear propagation losses: OC-026/050/051/065/075/082. |
| `98f2a83` → `f58e0de` | Repairs paired-cause AAD negatives, then mechanizes elision for every declared field. | Positive correction: declared AAD inventory is durable, while omitted semantics/application bytes remain outside the oracle. |
| `bd87655` | Establishes a usable compatibility policy and correct Ed25519/PRF framing, but treats browser interoperability as a hardware floor and omits X25519. | OC-062/063/079 and X-06 platform conclusions. |
| `66a7c6a` → `3670591` → `138a5f8` → `6b021c4` | Correctly moves from primitive timing to a real Pixel observation and rules out a cheap JS swap/libsodium package; fixed-slot workload, one-device generalization, readiness timestamp, and missing proxy provenance persist. | OC-062/064 and review evidence quality. |
| `a073574` | Selects accepted chains and immediate typed-SAS delivery. It leaves PRD status stale, defines no transferable reader-delivery success, and omits recovery-recipient authentication. | OC-016/017/027/067/073/076 and E-04/E-06/E-10. |
| `992bc91` | Selects the exact envelope and head paths, but the suite registry remains null and the exact-byte retry theorem gets no durable spool. | OC-011/066/068/071 and E-05/E-07. |
| `b997cdb` | Selects attribution/checkpoints, reducing retention only if mutable claims, semantic coverage, and fallback openers hold; each fails the strongest counterexample. | OC-014/030/033/069/070 and E-09; every package/migration consumer inherits them. |
| `745e332` | Selects one mark/package and definite-refusal-only re-mint, but supplies neither signed refusal nor spool; HPKE `info` is mistaken for root authenticity; Local and live→retired package states lack workable authority paths. | OC-020/044/068/072 and E-06/E-16–E-18. |
| `9b49b74` | Correctly delivers fast exact XChaCha WASM bytes, but adds an explicit 64-KiB boundary, fixed-input buffer reuse, version-mismatched audit wording, and optional freshness gate. | OC-025/064 and E-02 evidence boundary. |
| `b9ff071` | Correctly removes a guessable slot secret and binds its public key, but omits the relying-party cross-origin/top-origin policy. | OC-019/036/074 and E-12. |
| `4259822` | Establishes the sound mine/other/silence wire verdict, while local key installation, replacement byte coverage/forward rotation, lapse kind, and retirement survivor gate remain absent. | OC-017/020/021/029/077/078 and E-08/E-14–E-16. |
| `5bd9552` | Selects an honest ASVS profile shape; the only current A1 checker recognizes fixed literal forms but states a universal runtime result. | OC-079 and review level-2 assurance. |
| `cdd2069` | Selects a coherent twelve-month floor/ceiling and repairs inventory anchors; it does not implement the lapse carrier, expiry transaction, backups, or reseed. | OC-021/078 and E-15. |
| `ff0b48f` | Repairs deterministic recovery step-up with a fresh retired nonce and transition id. | Positive correction for OC-076/E-14, but PRD still says the step-up is open. |

### Cross-seam reconciliation

| Seam conclusion | Propagated claims and consumers | P-01 disposition |
| --- | --- | --- |
| Fresh per-generation roots, length-prefixed labels, distinct signing/wrapping/account/recovery/custody powers | OC-023–OC-029, OC-034–OC-036, OC-063–OC-076; every row 1–15 carrier | Affirm the hierarchy and generated-code/no-stretch conclusions; reopen only the concrete eligibility, lock-bypass, registry, and package-root joints. |
| Journal-before-record-before-clear, state-before-delete, and content-before-head are the safe directions | OC-024–OC-025, OC-032, OC-064–OC-069; Stage 1 store and accepted receiver | Preserve these specification theorems; do not let the missing allocator, oversize state, cutover repair, or integration erase the correct order. |
| One accepted `(seq,link)` is sufficient within one service view; signed mine/other/silence is a sound abstract transition verdict | OC-017, OC-032, OC-067–OC-068, OC-077; admission/revocation | Preserve the theorem with explicit split-view/availability bounds; ordinary refusal/spool and local applying remain contradicted. |
| Full checkpoints and standing claims are the right architectural decomposition but their semantic/immutability/key interlocks are not demonstrated | OC-014, OC-030, OC-033, OC-069–OC-070; restore/migration/package | Contradicted at current construction/evidence level, not a rejection of full snapshots or per-author claims as concepts. |
| Enrollment authenticates the immediate new wrapping key; recovery keeps four independent objects | OC-016, OC-034, OC-073, OC-076; E-10/E-13 | Preserve immediate SAS and four-object separation; qualify delayed reader/recovery-recipient state and package/replacement paths. |
| Lapse, expiry, retirement, migration, and surviving Local replicas are separate states | OC-002–OC-003, OC-020–OC-022, OC-043–OC-046, OC-078; E-15–E-18 | Preserve normative state separation; contradict current closure claims only where no lapse carrier, safe-survivor gate, or authenticated package transition exists. |
| Baseline is compatibility, not performance; official primitive KATs are independent, project compositions are shared-model; ASVS evidence is mostly structural | OC-039–OC-042, OC-050–OC-051, OC-062–OC-064, OC-079/082; E-20 | Carry the narrower evidence claims exactly. The Pixel and KATs remain useful; they do not establish population, integration, or requirement-wide assurance. |

## Affirmative conclusions

- The ledger accounts for all 103 boundary claim ids exactly once: 32 `preserved`, 30 `qualified`, 23
  `contradicted`, 9 `unimplemented`, 2 `lost`, and 7 `not applicable`. These are propagation dispositions, not
  finding severities or final validity judgments.
- The lineage preserves the original separation among Local/Account state, authorization, decryption, source
  authorship, service acceptance, recovery factor, ciphertext availability, portability, and service independence.
  Most later failures arise at concrete handoffs between those powers, not from collapsing them in prose.
- The symmetric key hierarchy and no-direct-`K_g`-reuse rule survive. Fresh generation roots, length-prefixed
  workspace-bound labels, distinct signing/wrapping keys, asymmetric recovery, and whole-suite rather than
  per-record algorithm selection are coherent foundations. The suite findings are bounded checker/registry defects.
- The 125-bit generated-code invariant supports no stretching for both recovery and device lock; WebAuthn slot
  verification needs no work factor because the profile holds public material rather than a guessable secret.
- Three persistence directions propagate correctly from original constraint through final TRD: journal before
  asynchronous record before journal removal; covering state before trim deletion; accepted content before local
  head mark. Each survives its complete single-writer/page-kill counterexample.
- The accepted-chain theorem survives within one view. Client-recomputed per-credential links, signed amortized
  heads, a final cutoff, and one persisted mark are sufficient without an accepted log. The explicit split-service-
  view and missing-evidence availability bounds remain intact.
- The transition wire verdict is also sound abstractly: persist exact intent before send, resubmit identical bytes
  on silence, apply only a matching signed outcome, and rebuild after a signed competing winner. P-01 does not
  conflate that result with the absent local successor-key/old-work ordering.
- Immediate enrollment key delivery is meaningfully authenticated by committed nonces, a typed SAS, the current
  head, both credentials, and the new wrapping key. The delayed eligibility and recovery-recipient findings do not
  negate that narrower conclusion.
- Markdown escape versus encrypted fidelity archive, lapse versus retirement, terminal-before-deletion, new-lineage
  migration, own-source-only suffix replay, and preservation of detached Local replicas all retain their original
  distinctions.
- The evidence record contains real positive course corrections: isolated one-field negatives replace paired-cause
  negatives; build-time elision makes the declared AAD inventory durable; real-device measurement rejects desktop
  throttling; a purpose-built WASM artifact replaces the failed JS path; and nonce/transition binding repairs the
  draft recovery step-up.
- Official primitive KAT provenance is independently sourced and useful. The exact WASM blob and project carriers
  reproduce their selected bytes under the recorded prior checks. The appropriate qualification begins at
  project-owned composition semantics, source/blob freshness, browser/runtime conformance, and integration.
- Rows 18, 19, and 21 remain genuinely open and correctly scoped; the lineage does not silently decide persistent
  search, root-type day collections, or first-cutover attribution.

## Candidate or validated findings

No new finding file was needed. Every concern surviving the forward replay already has one atomic finding, and all
remain `candidate` for V-01. P-01 propagated them as follows:

- Authority, custody, and recovery: `f-c611666-rotation-reader-eligibility-missing`,
  `f-f5def83-device-lock-reader-key-bypass`, `f-a073574-enrollment-recovery-key-unbound`,
  `f-4259822-recovery-replacement-no-forward-rotation`,
  `f-4259822-recovery-replacement-payload-bytes-unbound`, and
  `f-745e332-package-root-rewrap-substitution`.
- Persistence, retry, and transition state: `f-3bea0e6-store-sequence-allocation-undefined`,
  `f-9b49b74-journal-seal-64k-gap`, `f-9860a0b-legacy-plaintext-repair-undefined`,
  `f-992bc91-outbound-envelope-spool-undefined`, `f-745e332-envelope-refusal-carrier-missing`,
  `f-4259822-generation-switch-local-durability-undefined`,
  `f-b997cdb-checkpoint-key-retention-inverted`, `f-4259822-lapse-transition-kind-missing`, and
  `f-4259822-retirement-safe-survivor-gate-undefined`.
- Checkpoint, attribution, and package continuity: `f-b997cdb-attribution-self-replacement`,
  `f-b997cdb-checkpoint-coverage-unchecked`, `f-745e332-local-archive-portable-wrap-undefined`, and
  `f-745e332-live-retired-package-resigning-undefined`.
- Normative/registry propagation: `f-3bea0e6-suite-separation-ignores-both-path`,
  `f-992bc91-network-carrier-registry-stale`, `f-dbfd01f-device-lock-rotation-caveat-lost`,
  `f-dbfd01f-record-nonce-ceiling-omitted`, `f-dbfd01f-row20-closes-unvectorized-hpke`, and
  `f-tip-prd-stale-selection-status`.
- Browser, implementation, and evidence assurance: `f-9860a0b-journal-rotated-vector-reuses-key`,
  `f-9b49b74-wasm-glue-key-nonce-lengths`, `f-9b49b74-rustcrypto-audit-version-gap`,
  `f-9b49b74-wasm-source-artifact-drift-unchecked`, `f-b9ff071-webauthn-cross-origin-policy`,
  `f-5bd9552-origin-scan-static-forms`, `f-bd87655-baseline-not-performance-floor`,
  `f-bd87655-x25519-support-floor-omitted`, `f-66a7c6a-journal-benchmark-overwrites-one-slot`,
  `f-138a5f8-libsodium-readiness-timing`, `f-6b021c4-wasm-size-proxy-unreproducible`, and
  `f-caee157-plaintext-baseline-points-to-parent`.

The list is exhaustive: 6 + 9 + 4 + 6 + 12 = 37. P-01 neither merges duplicates nor changes severity/status;
that independence is reserved to V-01 after S-01.

## Disconfirmed hypotheses and null results

- **The first fold lost all selection nuance:** disconfirmed. It preserves suite versioning, random journal nonce,
  AAD binding, non-resetting sequence, generated-code/no-stretch, PRF optionality, custody-role separation, forward-
  only rotation, and the row-14 review split. The durable losses are the owed-rotation caveat, numeric record ceiling,
  and then-unavailable HPKE evidence claim.
- **Later evidence corrections merely changed prose:** disconfirmed. Isolated AAD mutations and build-time elision
  materially strengthen the oracle; the exact WASM artifact and paired Pixel measurement materially change the
  selected provider evidence; fresh transition-bound recovery nonces repair an actual replay weakness.
- **The selected record/envelope/checkpoint signatures fail to bind their declared fields:** disconfirmed for the
  declared byte inventories. The surviving findings concern omitted semantics/state, mutable authority, or
  application conformance rather than a demonstrated accepted one-field mutation.
- **A separate accepted log is required:** disconfirmed. Successor arithmetic plus the retained link and a head
  checked against the locally recomputed link reject replay/equivocation within one view.
- **The signed transition wire protocol should rebuild after a timeout:** disconfirmed. Timeout cannot distinguish a
  committed lost response from refusal; rebuilding can discard a live key or equivocate. Indefinite pending is the
  honest fail-closed outcome.
- **Device-lock enrollment must delete the old opener before staging:** disconfirmed. That ordering creates the brick
  state; staged envelopes plus an atomic swap/delete preserve an opener across every local kill.
- **Recovery/device-lock codes need Argon2id despite full generation:** disconfirmed under the exact 125-bit,
  app-generated, non-truncated invariant. The conclusion reverses if product copy later permits user choice,
  shortening, or partial generation.
- **PRF/platform-authenticator absence makes recovery impossible:** disconfirmed. The generated recovery code is the
  mandatory root; PRF is an additional seal, and platform-authenticator absence prevents that device's account
  credential rather than silently substituting a weaker password.
- **The Pixel and official KAT evidence are worthless because they are narrow:** disconfirmed. Each is strong evidence
  for its stated sample and directly falsifies a prior surrogate or primitive drift. It simply cannot support a
  device population, full state transition, or independent composition model.
- **Review booking is review completion:** disconfirmed by the planning record itself. Conversely, no repository
  evidence disproves that booking occurred; P-01 therefore records a qualification rather than inventing a missing-
  review finding.
- **Row 10 silently closed first-cutover attribution:** disconfirmed. Row 21 remains open at T and still gates Stage
  2. Choosing fidelity archive would inherit the package/checkpoint candidates; it is not automatically the safe
  branch.
- **The tip presents the predecessor app/relay as implementing selected protocol guarantees:** disconfirmed. F-02
  and T explicitly call the encrypted adapter, account/authorization service, and content-blind relay future work.

## Unresolved questions

- Which durable, client-authenticated enrollment-success object binds credential, `W_pub`, authentic `R_pub`,
  recovery envelope, lineage/head, and installing device for every future rotating client?
- What exact outbound spool and authenticated ordinary-refusal object preserve envelope bytes/positions across
  crashes and lost replies, and when may second-newest-checkpoint cleanup remove them?
- What cross-tab sequence reservation plus generation-start accounting counts every AES-GCM invocation and provides
  a safe trim watermark across content and heads stores?
- What pre-mutation refusal, chunking, or alternate synchronous durability state covers updates above 64 KiB and
  storage/quota/seal failures without accepting an unjournalled mutation?
- Which independent checkpoint oracle relates a real Yjs snapshot, insertion/deletion coverage, accepted-head
  baseline, suffix, and producer; how are incomparable producers admitted and installs rolled back atomically?
- What local `applying` order installs the successor `KeyEnvelope`, switches the active generation, preserves old
  journal/batch/outbound objects, admits a checkpoint, trims, and finally deletes old openers?
- How will recovery replacement bind every exact envelope/wrap byte and rotate forward after factor exposure?
- What authentic user-held root and Local-specific opener make packages safe against rewrap substitution and usable
  without an account, and is retirement a complete re-signed package rather than a record-only upgrade?
- What durable lapse state machine starts the clock once, wins races with retirement, deletes primary/replica/backup
  objects, and reseeds one or several divergent surviving devices?
- What signed acknowledgement proves a current survivor/export has caught up and received complete terminal evidence
  before every hosted deletion class runs?
- Which release-time matrix executes Ed25519, X25519/HPKE, the exact SIMD WASM blob, WebAuthn capability discovery,
  and embedding policy; what runtime egress graph and requirement-by-requirement evidence replace structural ASVS
  claims?
- Who were reviewers 3a/3b, did they accept specification-first input, and where are their dated responses? Which
  side of row 21 is selected before irreversible cutover? These are external/product inputs, not questions P-01 can
  answer from lineage evidence.

## Completion criteria

- [x] Every `OC-001`–`OC-083` and `E-01`–`E-20` id appears exactly once in the required row shape.
- [x] Original wording/source, first selection/introduction, final PRD/TRD state, executable evidence, consumers,
  disposition, and first divergence are recorded.
- [x] The forward replay distinguishes original latent gaps, first propagation loss, later repair, and final state.
- [x] All six seam passes' affirmative, qualified, reopened, and unresolved conclusions are carried forward.
- [x] All 37 candidate findings are accounted for without promotion, duplication, or production changes.
- [x] Null results and open product/external questions are explicit.
- [x] Final workspace validator and session handoff recorded.

## Handoff

P-01 is complete and validates. Run `node scripts/review-status.mjs`, then claim `S-01` at
`docs/review/analysis/adversarial-scenarios.md` with a fresh session. `V-01` remains gated on both P-01 and S-01.
Carry every finding as `candidate` and preserve the distinction between an affirmed abstract ordering and absent
integrated state-machine evidence.
