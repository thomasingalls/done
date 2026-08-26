---
schema: 1
kind: work-item
id: Z-01
status: complete
owner: root
started: 2026-08-26
updated: 2026-08-26
blocked_on: none
---

# `Z-01` — final synthesis

## Scope and exclusions

This synthesis reconciles the pinned Stage 0 lineage from
`c6116669030eedeea3d599bca0da3547114e6930` through
`9edd9300adebcec3abd2234c946f1dcccdc17eef` into the requested overall judgment. It separates conclusions that
survived independent challenge from bounded tradeoffs, propagation defects, evidence weaknesses, design conclusions
that must reopen, and product choices that the record cannot settle.

The synthesis does not treat the number of findings as the answer, infer shipped behavior from selected design
artifacts, or edit production code, requirements, selections, vectors, tests, the review boundary, or the
coordinator-owned checkpoint. Remediation and product choice require separate work.

## Exact sources inspected

- Review boundary and method: `docs/review/{README.md,orientation.md,STATUS.md,DECISIONS.md,config.json,lineage.tsv,source-manifest.tsv,work-items.tsv,briefs.md}`.
- Direct boundary checks in this session:
  `c6116669030eedeea3d599bca0da3547114e6930:docs/progress.md`,
  `9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/{progress.md,TRD.md,completed.md}`, and the empty
  base-to-tip diff for `docs/completed.md`. The base says Stage 0 must select rows 1–3 with vectors, draft the
  protocol-review scope, record the plaintext baseline, and book both reviews. The tip says all four are done and
  the slice is ready to close; its selection register says eighteen rows and row 20 are closed while rows 18, 19,
  and 21 remain open. `completed.md` is unchanged, so the claimed close was not durably recorded.
- Foundation and reverse walk: `docs/review/analysis/{original-contract.md,end-state-model.md}`, all 35 files under
  `docs/review/commit-reviews/`, and `docs/review/analysis/batches/B-01.md` through `B-04.md`.
- Cross-cutting and reconciliation: all six files under `docs/review/analysis/seams/X-01-*.md` through `X-06-*.md`,
  `docs/review/analysis/propagation-audit.md`, and `docs/review/analysis/adversarial-scenarios.md`.
- Independent challenge: `docs/review/analysis/finding-challenges.md`, including its 2026-08-26 refreshed primary
  standards evidence, exact-tip artifact reruns, two mutation checks, 37 finding challenges, and 17 load-bearing
  affirmative challenges.
- Finding and ownership record: all 37 `docs/review/findings/f-*.md` files and all prior completed session files.

Historical source conclusions below rely on the full-SHA citations in those completed artifacts. Review-workspace
paths are durable analysis artifacts, not aliases for the checked-out production tree.

## Method

1. Run the authoritative validator and verify a linear 35-commit boundary, complete prerequisites, no earlier
   `Z-01` claim, and one mechanically ready synthesis item.
2. Count artifacts independently of their prose: 35 commit cards, 103 unique boundary claim ids, 22 adversarial
   scenarios, six seam passes, and 37 finding files. Check every prerequisite front matter status rather than
   inferring completion from summaries.
3. Use the original Stage 0 exit as the closure test. Stage 0 requires selected, reviewable constructions and their
   stated evidence, the recorded baseline, and review bookings; it does not require the later Stage 1/4 runtime.
   Missing integration therefore is not automatically a Stage 0 blocker, while an undefined load-bearing state in
   a supposedly selected construction is.
4. Preserve each independently challenged affirmative theorem at its narrowest proven boundary. Do not allow a
   composition gap to erase a correct primitive, carrier binding, or persistence direction, and do not let a local
   theorem stand in for the whole state machine.
5. Classify every validated finding exactly once by closure effect: reopen a selected design, repair a current
   closure artifact, carry an explicit later implementation/evidence gate, or correct a historical evidence claim.
   Severity remains consequence-based and does not itself decide the gate.
6. Attempt the strongest synthesis-level counterclaims: that all findings are shipped bugs, that no conclusion is
   sound, that all missing integration must block Stage 0, that open rows 18/19/21 are accidental omissions, and
   that booking prose is either a completed review or proof no booking occurred. None survives.

## Analysis

### Artifact and claim accounting

“Unresolved” here distinguishes an accounting omission from a substantively open design. A complete analysis can
and does contain unresolved product or engineering work.

| Area | Artifact count expected | Count present | Unresolved | Synthesis disposition |
| --- | ---: | ---: | --- | --- |
| Pinned boundary/index artifacts | 3 | 3 | 0 | `config.json`, 35-row `lineage.tsv`, and pinned `source-manifest.tsv` validate. |
| Foundation models | 2 | 2 | 0 | Original contract and end state were derived independently before comparison. |
| Reverse-walk commit cards | 35 | 35 | 0 | All four batches are complete: 13 + 6 + 8 + 8. |
| Reverse-walk batch syntheses | 4 | 4 | 0 | All substantive and traceability-only commits are summarized. |
| Cross-cutting seam audits | 6 | 6 | 0 | Key custody, persistence, accepted state, lifecycle, continuity, and evidence are all covered. |
| Boundary claim ledger | 103 rows in 1 artifact | 103 | 0 missing ids | `OC-001`–`OC-083` and `E-01`–`E-20`: 32 preserved, 30 qualified, 23 contradicted, 9 unimplemented, 2 lost, 7 not applicable. |
| Adversarial replay | 22 rows in 1 artifact | 22 | 0 unaccounted; substantive reopens are carried below | `P-01`–`P-11` and `C-01`–`C-11` cover the required crash, compromise, recovery, and lifecycle cases. |
| Independent challenge | 1 | 1 | 0 omitted challenges | All 37 findings and 17 load-bearing affirmative conclusions were independently challenged. |
| Finding records | 37 | 37 | 0 unclassified; 37 unremediated | 37 validated, 0 candidate, 0 rejected, 0 superseded: 6 high, 20 medium, 11 low. |
| Session history including `Z-01` | 17 | 17 | 0 | One durable chronological handoff per review task plus machinery history. |
| Final synthesis | 1 | 1 | 0 | This artifact supplies the only overall gate judgment authorized by the work graph. |

The accounting has no missing commit, claim id, seam, scenario, or finding. That completeness does not convert the
37 concerns into 37 independent runtime vulnerabilities: the tip application remains the predecessor plaintext/local
implementation, and many concerns are specification closure or future implementation hazards.

### Overall judgment

The lineage reached several well-considered and appropriate component conclusions, corrected real mistakes as
evidence improved, and preserved unusually useful distinctions among authority, decryption, acceptance, recovery,
portability, and lifecycle state. It did **not** reach a justified system-level conclusion that Stage 0 was ready to
close. The strongest results are local theorems; the strongest defects occur where one correct component hands
authority or durable state to another.

The final “eighteen rows selected / row 20 closed / slice ready to close” claim overstates the result for two
independent reasons:

1. Six high-severity and thirteen additional design findings leave load-bearing authority, recovery, portability,
   retry, checkpoint, transition, and verifier-policy states undefined or contradicted inside supposedly selected
   rows. These are not requests for the future application implementation; a conforming implementation cannot be
   derived unambiguously from the selected construction.
2. Nine current propagation or artifact defects make the review input state something other than what its closure
   prose says it is. Several are narrow to repair, but a green self-check cannot close a property its inventory or
   oracle omits.

Five other findings can be carried to explicit Stage 1/4 or release evidence gates without reopening the selected
primitive or abstract rule, and four are historical evidence corrections whose operative tip risk was reduced by
later work. Treating all 37 as equal would erase this calibration.

The correct disposition is therefore **reopen targeted Stage 0 selections and closure artifacts; do not restart the
architecture and do not treat the predecessor app as a vulnerable implementation of the target protocol**. After
the design/artifact repairs, the later implementation and external-review gates remain real and must not be silently
converted into Stage 0 proof.

### Where the affirmative guarantees stop

| Area | Conclusion that survives | Exact boundary where it stops | Final disposition |
| --- | --- | --- | --- |
| Primitive/key architecture | Fresh generation roots, workspace-bound length-prefixed derivations, distinct signing/wrapping/account/recovery roles, generated 125-bit codes, and correct-width selected carrier encodings are coherent. No primitive break was found. | Recipient eligibility, copied operational credentials, package-root authority, carrier-registry totality, wrapper input validation, and browser/release integration. | Sound foundation; qualified at custody and integration joints. |
| Local persistence | Journal → asynchronous record → compare-and-remove, covering state → trim deletion, content → accepted mark, and staged device-lock swap preserve coverage across the enumerated page kills. | Successful single-writer/browser-page boundaries only; oversize/storage failure, cross-tab sequence allocation, generation application, cutover, and stronger OS durability remain open. | Sound local theorems; incomplete machine. |
| Network acceptance | Source envelopes bind their declared fields; one `(seq,link)` per credential is sufficient within one service view; signed heads/final cutoffs make relay forgery fail with an honest service. | Exact outbound bytes are not durably spooled, ordinary refusal has no authenticated carrier, and a malicious service can fork views until they meet. Availability is not guaranteed. | Sound per-view integrity theorem; retry composition reopens. |
| Transitions | Persist-intent-before-send and signed mine/other/silence are the correct fail-closed wire verdict; a competing signed winner requires rebuild. | The verdict does not install the successor key, classify old work, bind all replacement bytes, rotate after exposed recovery material, represent lapse, or prove deletion prerequisites. | Sound wire theorem; local/lifecycle application reopens. |
| Enrollment and recovery | Typed commit/reveal SAS authenticates the immediate new `W_pub` and current head; total-loss recovery honestly requires account access, authorization, content factor, and ciphertext. | No transferable client-authenticated reader eligibility or authentic `R_pub` is selected; package and replacement paths do not preserve all claimed authority/forward guarantees. | Immediate ceremony and four-object model sound; delayed authority reopens. |
| Checkpoint/history/continuity | Checkpoint fields are cryptographically bound, two tuples are necessary, body commitments distinguish exact from edited, migration starts a new lineage and replays only each credential's own suffix. | Field binding does not prove snapshot/head semantics; fallback openers can be deleted; mutable claims can self-replace; archive root/Local opener and retirement delivery are incomplete. | Architectural decomposition sound; current constructions reopen. |
| Platform/evidence | Official primitive KAT provenance, exact project-vector reproduction, the one Pixel result, the small synchronous WASM artifact, isolated declared-field negatives, and the ASVS profile shape are useful evidence. | Project generators share semantics, Baseline is not a hardware floor, the benchmark is not production-shaped, source/blob freshness and runtime egress are incompletely gated, and no integrated target stack exists. | Evidence is affirmative only at its recorded sample/artifact scope. |

### Design conclusions that must reopen before Stage 0 can close

These 19 findings invalidate or leave undefined a necessary property of a selected construction. The groupings are
remediation boundaries, not proposed implementations.

| Required property | Validated findings | Closure requirement |
| --- | --- | --- |
| Future key recipients must be authenticated by clients, including the delayed recovery recipient | `f-c611666-rotation-reader-eligibility-missing` (high); `f-a073574-enrollment-recovery-key-unbound` (high) | Select a durable, transferable enrollment-success/eligibility object that binds the credential, `W_pub`, authentic `R_pub`, lineage/head, and installing authority. |
| Recovery replacement must bind the exact replacement set and exclude exposed old material from future writes | `f-4259822-recovery-replacement-no-forward-rotation` (high); `f-4259822-recovery-replacement-payload-bytes-unbound` (medium) | Bind canonical envelope/wrap bytes and compose exposed-factor replacement with a successor generation, or narrow the promise to lost-but-uncopied material. |
| Portable material must authenticate its historical root and remain openable outside an Account | `f-745e332-package-root-rewrap-substitution` (high); `f-745e332-local-archive-portable-wrap-undefined` (high) | Select a user-held non-rewrappable root commitment and a Local-specific saved-factor-to-generation opener with a clean-device restore path. |
| Retirement must prove a current survivor/export has complete terminal evidence before destructive deletion | `f-4259822-retirement-safe-survivor-gate-undefined` (high); `f-745e332-live-retired-package-resigning-undefined` (medium) | Select a durable catch-up/package acknowledgement and either a signed transform or a complete service-signed retired-package replacement. |
| Store writes need a crash-safe global sequence budget and a state for every accepted update size | `f-3bea0e6-store-sequence-allocation-undefined` (medium); `f-9b49b74-journal-seal-64k-gap` (medium) | Select cross-tab reservation/generation accounting and pre-mutation refusal, chunking, or alternate synchronous durability for oversize and synchronous failures. |
| Random-nonce outbound envelopes need exact-byte persistence and authenticated never-accepted evidence | `f-992bc91-outbound-envelope-spool-undefined` (medium); `f-745e332-envelope-refusal-carrier-missing` (medium) | Select the encrypted spool, position reservation, idempotent retry, signed refusal, and checkpoint-relative cleanup machine. |
| A committed generation change must install locally and discharge every old carrier before opener deletion | `f-4259822-generation-switch-local-durability-undefined` (medium) | Order the successor `KeyEnvelope`, active marker, pending state, journal/batch/outbound work, checkpoint/trim, and old-opener deletion across kills. |
| Checkpoints and attribution must have semantic/immutable authority, not only authentic field bytes | `f-b997cdb-checkpoint-coverage-unchecked` (medium); `f-b997cdb-checkpoint-key-retention-inverted` (medium); `f-b997cdb-attribution-self-replacement` (medium) | Define an independent snapshot/coverage/head oracle, retain an opener for every fallback, and make first creation distinguishable from later valid self-replacement. |
| Device lock must control every future-generation path, not only the local envelope | `f-f5def83-device-lock-reader-key-bypass` (medium) | Gate or replace the promptless self-reader path on the no-PRF tier, or explicitly narrow the copy and threat promise. |
| Deliberate lapse must have one selected durable carrier and race rule | `f-4259822-lapse-transition-kind-missing` (medium) | Choose a fourth signed transition or a separate service/billing state machine, then correct the claim that row 15 already binds it. |
| WebAuthn verification must make its embedding policy explicit | `f-b9ff071-webauthn-cross-origin-policy` (low) | Reject cross-origin ceremonies or bind and test an explicit top-origin/Permissions Policy invariant. |

The six high findings are consequence-calibrated: they admit unauthorized future key delivery, continuing access
after exposed recovery replacement, archive-root substitution, unusable Local recovery, or irreversible deletion.
They are design-stage outcomes at the pinned tip, not evidence of an exploit against the predecessor runtime.

### Current closure artifacts and propagation that must be repaired

These nine findings do not all require architectural redesign, but the current closed-scope record or checker says
more than it enforces. They must be corrected or narrowed before review input can honestly be called closed.

| Finding | Required repair |
| --- | --- |
| `f-3bea0e6-suite-separation-ignores-both-path` (medium) | Define the intended primitive-versus-domain separation rule and make `path: both` participate in the corresponding oracle. |
| `f-992bc91-network-carrier-registry-stale` (medium) | Register the selected network-envelope carrier and its acceptance/version behavior in the supposedly total suite registry. |
| `f-9860a0b-journal-rotated-vector-reuses-key` (medium) | Use distinct generation roots and add a wrong-generation-key lookup negative. |
| `f-9b49b74-wasm-glue-key-nonce-lengths` (medium) | Reject non-32-byte keys and non-24-byte nonces before shared-memory writes; retain the demonstrated stale-buffer case as a regression. |
| `f-dbfd01f-device-lock-rotation-caveat-lost` (medium) | Restore `rotation_owed` and conditional forward-protection copy to normative requirements/UI obligations. |
| `f-5bd9552-origin-scan-static-forms` (medium) | Narrow the claim to literal static forms or replace it with parser/CSP/runtime egress coverage matching the universal message. |
| `f-dbfd01f-record-nonce-ceiling-omitted` (low) | Put the exact `2^32` rotate-before-write branch and equality boundary in normative algorithm/tests. |
| `f-bd87655-x25519-support-floor-omitted` (low) | Add dated exact-operation X25519/HPKE coverage and absence behavior to the capability inventory. |
| `f-tip-prd-stale-selection-status` (low) | Reconcile the standalone PRD's present-tense open rows with the tip TRD/register, leaving only genuinely open UX/product choices. |

### Evidence and implementation gates that may remain later obligations

These five validated findings limit assurance but do not, on their own, reject the chosen primitive or abstract
construction. They may be carried beyond Stage 0 only if the closure record names the later gate and does not reuse
the weak evidence as proof of a stronger claim.

| Finding | Calibrated disposition |
| --- | --- |
| `f-66a7c6a-journal-benchmark-overwrites-one-slot` (medium) | Keep the microbenchmark and Pixel decision evidence; require product-shaped immutable append bursts, occupancy/cleanup, raw samples, and device sampling before the latency guarantee is generalized. |
| `f-bd87655-baseline-not-performance-floor` (medium) | Use Baseline for browser feature availability only; define hardware/performance support separately. |
| `f-9860a0b-legacy-plaintext-repair-undefined` (low) | Gate Stage 1 cutover on a verified export/import/active-store/deletion/restart machine; do not infer it from carrier refusal. |
| `f-9b49b74-rustcrypto-audit-version-gap` (low) | Preserve the external audit as history while stating its 2019/version/compiler limits for selected `0.10.1`. |
| `f-9b49b74-wasm-source-artifact-drift-unchecked` (low) | Make source/blob freshness and a pinned or attested toolchain a required CI/release gate in addition to behavioral verification. |

### Historical evidence corrections

The following four findings remain valid records of what was knowable or claimed at introduction, but later work
substantially reduced their operative design risk. They should be corrected in the historical ledger rather than
used to reopen the final provider or carrier by themselves.

- `f-138a5f8-libsodium-readiness-timing` (low): 37 ms is a late query upper bound, not instantiation time; the
  provider was later replaced.
- `f-6b021c4-wasm-size-proxy-unreproducible` (low): the proxy is unreproducible, while the later actual selected blob
  establishes current size feasibility.
- `f-caee157-plaintext-baseline-points-to-parent` (low): the measurements are useful working-tree observations but
  not reproducible from the named parent object.
- `f-dbfd01f-row20-closes-unvectorized-hpke` (low): the first fold's closure statement was false at that SHA; later
  row-10 RFC 9180 evidence repairs tip artifact availability, not the historical timing claim.

The four finding groups account for all 37 exactly once: 19 design reopens + 9 closure-artifact repairs + 5 later
gates + 4 historical corrections. Their severity totals independently reconcile to 6 high + 20 medium + 11 low.

### Sound conclusions

- The original contract's separation of Local/Account state, authorization, decryption, source authorship, service
  acceptance, recovery factor, ciphertext availability, portability, and provider independence remains the right
  architectural vocabulary. Later defects mostly occur at concrete handoffs rather than in this decomposition.
- Fresh generation roots, role-specific workspace-bound derivations, distinct signing and wrapping credentials,
  asymmetric recovery, whole-suite carrier selection, and no direct use of `K_g` as an AEAD key are coherent.
- Generated 125-bit recovery and device-lock codes need no stretching only while app generation, full length,
  uniformity, no user choice, and no truncation remain invariant. The WebAuthn slot stores public verifier material,
  so password-work-factor reasoning does not apply.
- The three challenged persistence directions are correct for their named boundary: journal before record before
  cleanup, covering state before deletion, and accepted content before local mark. Device-lock staging plus atomic
  swap/delete likewise preserves at least one local opener.
- Declared carrier fields are encoded and mutation-bound as claimed. The isolated negative and elision correction is
  a real evidence improvement; it proves the declared byte inventory, not semantic completeness or app conformance.
- A per-credential link chain, signed heads, final cutoff, and one mark suffice within one view. Split views remain
  possible until evidence meets, and withholding remains an availability attack.
- The transition mine/other/silence network verdict is sound and safer than timeout-based rebuild. Indefinite pending
  is the honest fail-closed result when authenticated evidence is absent.
- Immediate typed-SAS enrollment authenticates the new wrapping key and current head. Four-object recovery, explicit
  permanent-loss outcomes, and the lack of service escrow are candid and coherent boundaries.
- Body commitments distinguish exact creation-body bytes from a later edited body for a given authentic claim.
  Migration's new-lineage/new-generation rule and own-source-only suffix replay preserve provenance without claiming
  to revoke an unreachable old service.
- Lapse, expiry, retirement, migration, and detached Local replicas are genuinely distinct. Terminal-before-delete
  is the only safe direction even though the acknowledgement joining those states is not yet selected.
- The evidence course corrections were substantive: isolated negatives replaced paired-cause tests; a real handset
  falsified the desktop surrogate; a small synchronous WASM artifact replaced the failed JS path; and a fresh nonce
  plus transition id repaired recovery step-up replay.

### Sound but bounded tradeoffs and residuals

- No forward secrecy or history erasure is promised. Removed readers may retain generations and plaintext already
  obtained; rotation protects future observed content rather than rewriting history.
- Non-extractability limits API export. It does not protect against hostile same-origin code that can invoke the key,
  copied usable credentials, disk forensics, or physical zeroization limits.
- A hostile relay with honest signing services is bounded mainly to availability and metadata. A malicious acceptance
  or authorization service is a different actor and can maintain signed split views until clients compare evidence.
- Recovery honestly fails when any of account access, service authorization, a content factor, or ciphertext is
  absent. Optional PRF/platform-authenticator support is convenience/additional sealing, not the mandatory recovery
  root.
- Local replicas remain writable through lapse, retirement, provider loss, and revocation. That preserves user data
  at the cost of no remote wipe and possible divergent detached descendants.
- Markdown is the readable escape and deliberately loses workspace identity/provenance fields; the encrypted
  fidelity archive has a different job and still needs an independent content-key factor.
- Twelve months is a product policy, not an empirically optimal duration. Its five textual anchors are consistent;
  exact per-plan ceilings, backup deletion, and divergent reseed remain execution questions.
- ASVS L2 plus named pull-ups/addenda is an honest structural floor, not proof of as-built security. Official KATs
  are independent primitive evidence; project composition vectors and generated checkers remain shared-model.

### Product and external choices evidence cannot settle

- Row 18: whether a persistent encrypted search index is needed after measuring in-memory rebuild.
- Row 19: whether root-type day collections are worth their current cost after re-counting the lapsed risk.
- Row 21: whether first cutover accepts system attribution or requires a corrected early fidelity archive. It remains
  a deliberate Stage 2 product gate, not a Stage 0 omission.
- Whether lapse is a fourth signed transition or a separate durable billing/service machine; evidence establishes
  required invariants but does not select the architecture.
- Which allocator, checkpoint-admission protocol, package-root mechanism, Local factor, and acknowledgement carrier
  best satisfy the reopened properties. The review identifies falsifiers and required state, not the product/complexity
  tradeoff among viable designs.
- The exact product response to authenticated live/retired lineage with missing local identity, and the UX for
  indefinite pending, partial repair, or unsupported platform capability.
- Longer-than-twelve-month plan policy and its deletion ceiling, provided the stated twelve-month floor and honest
  lifecycle copy are preserved.
- Who reviewers 3a/3b were, whether they accepted specification-first input, and what they concluded. The repository
  supports a booking claim only; absence of identity/readback is neither review completion nor proof no booking
  happened.

## Affirmative conclusions

The final affirmative result is substantial but narrower than the tip's closure prose. The project selected a
coherent primitive/key foundation, correct local crash directions, useful authenticated carriers, a sound per-view
acceptance theorem, a sound transition wire verdict, a well-separated recovery model, and honest threat/lifecycle
boundaries. It also demonstrated the ability to correct its own evidence when paired negatives, desktop emulation,
and deterministic step-up proved inadequate.

Those results justify preserving and repairing the architecture. They do not justify calling the system-level
selection finished while authority-transfer, exact-byte retry, checkpoint semantics, recovery replacement,
portable-root authenticity, and destructive deletion gates remain unselected.

## Candidate or validated findings

All 37 finding files are `validated`, have `confidence: high`, and name the independent challenger
`root-v01-20260826`. There are no remaining candidates, rejected findings, superseded findings, critical findings,
or duplicate merges. The four closure-effect groups above account for every id and preserve each finding's bounded
consequence.

No new `Z-01` finding was created. Synthesis-level concerns either map to an existing atomic finding or remain an
explicit product/external choice. Creating a second umbrella finding would double-count rather than improve the
record.

## Disconfirmed hypotheses and null results

- **Thirty-seven findings mean thirty-seven shipped vulnerabilities:** disconfirmed. The target encrypted adapter,
  acceptance/authorization services, spool, restore path, and transition worker do not exist at the pinned tip.
- **No selected conclusion is trustworthy:** disconfirmed. Independent challenge preserved 17 load-bearing
  affirmatives, including primitive/key separation, declared-field binding, three persistence directions, one-view
  acceptance, and the transition wire verdict.
- **No primitive or carrier encoding works:** disconfirmed. Correct-width AES-GCM/XChaCha, HKDF labels, Ed25519,
  generated-code entropy, and exact selected carrier byte checks survived. The findings concern composition,
  authority, oracle totality, wrapper validation, or integration.
- **Every missing integrated test must block Stage 0:** disconfirmed. Stage 0 is a selection/measurement/booking
  stage. Integration appropriately remains Stage 1/4 when the construction and later gate are explicit; an undefined
  state in the construction itself is different and does block closure.
- **The whole architecture must be restarted:** disconfirmed. Most defects cluster at a finite set of authority and
  durability joints; preserving the validated component theorems gives targeted repair boundaries.
- **All eighteen selected rows are wrong:** disconfirmed. Some rows and substantial parts of others survive. The
  defect is overgeneralized closure, not universal invalidity.
- **Rows 18, 19, and 21 were forgotten or silently selected:** disconfirmed. The tip register keeps them explicitly
  open with the correct downstream gates.
- **Booking prose is a reviewer result:** disconfirmed. Conversely, repository silence does not prove the booking
  false; only independent identity/readback could resolve it.
- **A one-device measurement or project vector is worthless:** disconfirmed. Each is strong evidence for its exact
  sample/model and falsified prior alternatives. It simply cannot establish population, integration, or semantic
  completeness.
- **Rejecting the current closure means the predecessor app already violates the target protocol:** disconfirmed.
  The tip documents explicitly present the plaintext app/relay as rewrite targets rather than implementations of
  the selected guarantees.
- **Finding severity alone decides the Stage 0 gate:** disconfirmed. Closure effect depends on whether a concern
  invalidates a selected property, misstates the current review artifact, belongs to a named later gate, or is
  historical only.

## Unresolved questions

- What single client-authenticated enrollment/eligibility record, or what small set of records, safely binds every
  future ordinary and recovery recipient without making the authorization service its own trust proof?
- What exact cross-tab sequence reservation, outbound spool/refusal protocol, checkpoint admission/install state,
  and local generation-apply transaction compose the correct local/network theorems across every kill?
- What independent oracle derives real Yjs snapshot coverage and accepted heads, and what immutable object preserves
  first creation through trim/compaction?
- What user-held root and Local-specific opener make never/live/retired packages authentic, independently restorable,
  and safely deliverable before deletion?
- What durable lapse/expiry/retirement states and acknowledgements cover primary stores, replicas, backups, races,
  divergent survivors, and resumable partial deletion?
- Which reopened findings will be resolved in Stage 0 and which later-gate findings will receive explicit Stage 1,
  Stage 4, external-review, or release owners? The current record has no remediation plan, and this review is not
  authorized to create one.
- What did reviewers 3a/3b conclude, and does the product choose row 21 before irreversible cutover?

## Completion criteria

- [x] The pinned lineage and every prerequisite artifact validate.
- [x] All 35 commit cards and four batch summaries are accounted for.
- [x] All `OC-001`–`OC-083` and `E-01`–`E-20` claim ids are accounted for with their propagation dispositions.
- [x] All six seam audits and all 22 adversarial scenarios are carried into the synthesis.
- [x] All 37 findings and all independently challenged load-bearing affirmative conclusions are reconciled.
- [x] Sound conclusions, bounded tradeoffs, propagation defects, evidence gaps, design reopens, and product choices
  are separated.
- [x] The overall Stage 0 closure judgment is explicit and does not infer target runtime behavior from design
  artifacts.
- [x] No production artifact, requirement, selection, vector, test, finding disposition, or review boundary changed.

## Handoff

`Z-01` is complete. The review graph has no next ready work item: the durable overall judgment is to reopen targeted
Stage 0 selections and closure artifacts before recording the slice as closed, while preserving the validated local
theorems and assigning the five later-gate evidence/implementation concerns explicitly.

Exact next command: `node scripts/review-status.mjs`. It should report 16 complete work items, no pending/in-progress/
blocked/resumable item, 37 validated findings, and no validation error. Any remediation, update to `STATUS.md` or
`completed.md`, external reviewer follow-up, or product choice needs a separate authorized task.
