# S0-9 independent authority and protocol challenge

## Review identity, boundary, and disposition

This is an independent, non-author challenge of the repaired Stage 0 constructions at detached
`HEAD = 5923f510fd9ac3c1cd809e9bec352a7f73751492`. I used only this worktree and ancestors proven with
`git merge-base --is-ancestor <introduced_by> HEAD`. I did not consult another ref, worktree, remote, later
repository state, or another challenge report.

**Disposition: FAIL. `S0-9` does not authorize `S0-10`.** The broad suite is green (36 files / 371 tests; all
16 vector generators current; 190 AAD fields reported isolated), but isolation challenges found six protocol or
artifact defects, one closure-artifact defect, and one gate-authority contradiction. Four are high-severity
authority/data-loss failures. They are
not stale-output failures and cannot be closed by adding a superficial negative: each returns to the earliest
schema or lifecycle decision named below.

| RC                                        | Disposition at repaired tip             | Causal boundary and preserved theorem                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RC-1` recipient authority                | **FAIL**                                | `c611666`, `a073574` are ancestors. Exact `(credential, W_pub)` and `R_pub` substitution binding survives, but the total-loss bootstrap verifier is not part of the certified recovery state and the published enrollment vector omits the new recovery-state input.                                                                                                                                      |
| `RC-2` generation/replacement/device lock | **FAIL**                                | `f5def83`, `4259822`, `b997cdb`, `dbfd01f` are ancestors. `GenerationApply`, exact replacement bytes, old reference accounting, no-PRF lock, and `rotation_owed` tests survive. Bootstrap authority cannot be rotated/retired with recovery replacement, so old-capability retirement does not.                                                                                                           |
| `RC-3` local write admission              | **PASS (Stage 0)**                      | `3bea0e6`, `4259822`, `dbfd01f`, `9b49b74`, `9860a0b`, `66a7c6a` are ancestors. Boundary/quota/WAL/apply-kill/concurrency/trim/nonce/generation-key cases survived the full and targeted suites. Hardware population and immutable append evidence remain correctly later-gated.                                                                                                                          |
| `RC-4` spool/refusal authority            | **FAIL**                                | `992bc91` and `745e332` are ancestors. Exact-byte spool, lost-reply retry, permanent refusal, parent licensing, concurrency, cleanup, and suite ownership survive. A genuinely signed refusal from another epoch is accepted because neither exact verifier nor model compares refusal epoch to envelope epoch.                                                                                           |
| `RC-5` checkpoint/creation authority      | **PASS (Stage 0)**                      | `b997cdb` is an ancestor. Semantic omission/addition, accepted-order proof, producer authority, install crash, restore/trim, opener retention, and attribution-creation cases remain green. Execution remains correctly at `L-3`.                                                                                                                                                                         |
| `RC-6` package/archive/handoff            | **FAIL**                                | `745e332` is an ancestor. Account-root substitution and live/retired signing theorems survive. The Local archive positive is not composed with its package manifest, and terminal catch-up carries no checkable transcript or absence enumeration.                                                                                                                                                        |
| `RC-7` lapse/retirement                   | **FAIL**                                | `4259822` is an ancestor. One-clock, arbitration, replay, resume, and per-class idempotency theorems survive. The selected ceiling deliberately deletes a retirement without the handoff that `RC-6` says is the destructive authority.                                                                                                                                                                   |
| `RC-8` closure authority                  | **FAIL**                                | `3bea0e6`, `992bc91`, `b9ff071`, `5bd9552`, `bd87655`, `9b49b74`, and the tip-status finding's `a073574` are ancestors. Trace generation, owner/enum checks, static-origin scope, suite separation, and WASM checks survive. `corrected-end-state.md`, an exact `S0-9` input, still describes superseded and unresolved decisions.                                                                        |
| `RC-9` release governance                 | **PASS only as an explicit later gate** | The action tree correctly keeps production integrations, hardware/performance, source-delta, stale-blob CI, runtime egress, and external-review readback in `L-1`–`L-4`; no release conclusion follows from this Stage 0 pass. The known unrelated `pnpm check` lint/format failure was not treated as a repair failure. The X25519 evidence assignment conflict below must be reconciled before `S0-10`. |

## Stage 0 blockers

### A-01 — the recovery bootstrap verification key is not in the certified recovery state

- **Severity:** high.
- **Exact artifacts:** `docs/review/remediation/S0-2/A-schemas.md:24-28,63-69`;
  `docs/TRD.md:2438-2445,2777-2782`; `scripts/generate-enrollment-vectors.mjs:244-273`;
  `scripts/generate-head-discovery-vectors.mjs:106-120,180-186,491-534,695-710`;
  `docs/selections/row-14-recovery-code.md:45-48`.
- **Violated invariant / finding / RC:** `P-1`'s four-object total-loss theorem; `RC-1` actor authority;
  `RC-2` recovery replacement and old-capability retirement; the delayed-recipient boundary of
  `f-c611666-rotation-reader-eligibility-missing` and `f-a073574-enrollment-recovery-key-unbound`; the forward
  retirement guarantee of `f-4259822-recovery-replacement-no-forward-rotation`.
- **Reproduction/reasoning trace:** the normative `recovery_state_digest` has exactly `counter`, `R_pub`,
  `recovery_envelope_digest`, and `root_commitment`. The normative envelope seals `R_priv` and the root commitment.
  Neither exact carrier contains a bootstrap public key, private signer, or signer digest. Nevertheless the bootstrap
  prose says a prior `RecoverySet` commits its verification key and the generator verifies with a hard-coded
  `KEYS.bootstrap_signer.public_key`. Repository search finds no exact `RecoverySet` schema. `acceptBootstrap()`
  neither derives that verifier from the factor-opened state nor compares `prior_recovery_state_digest` with a
  supplied authenticated current state.
- **Reachable consequence:** a verifier supplied by the service cannot be distinguished from the promised
  factor-anchored verifier. After recovery replacement, an old/exposed bootstrap signing capability also has no
  selected field whose replacement retires it. It can sign a fresh-nonce successor naming public current-state
  values; the current exact acceptance model still verifies under its fixed old key. The purported four objects
  therefore depend on an unbound fifth authority parameter.
- **Stage 0 blocker:** yes.
- **Earliest action to reopen:** `S0-2` Stage A, then B/D. Reopen `P-1` only if the carrier must change away from
  its already-selected client-certified set.
- **Simpler repair / preserved theorem:** add the bootstrap verification key and exact sealed signer commitment to
  `RecoveryState`; derive the verifier only from the factor-opened current state; rotate it in every recovery
  replacement; reject the old key after replacement and a service-substituted verifier. This preserves the
  certified-set shape, one-object factor custody, exact `(credential, W_pub)` binding, and all current device-lock and
  `GenerationApply` results.

### A-02 — the published enrollment vector omits the recovery-state field it claims to authenticate

- **Severity:** medium (evidence/implementability; it guards a high authority property).
- **Exact artifacts:** `scripts/generate-enrollment-vectors.mjs:116-132,519-523,547-559` and
  `test/vectors/enrollment-ceremony.json:9,41-58,125-130`.
- **Violated invariant / finding / RC:** exact-byte evidence for `RC-1` and
  `f-a073574-enrollment-recovery-key-unbound`; `RC-8` independently consumable evidence.
- **Reproduction/reasoning trace:** the executable `transcript()` inserts `recovery_state_digest`, but the generated
  `construction.transcript` formula omits it and the honest vector's `inputs` do not publish its value. The derived
  opaque transcript happens to contain a digest known only to generator internals. `node
scripts/generate-enrollment-vectors.mjs --check` returns zero because it compares the generator to the equally
  incomplete generated JSON.
- **Reachable consequence:** an independent implementation cannot reproduce the alleged exact bytes from published
  inputs, and the `substituted-recovery-state` negative names no concrete original or substituted value. The vector
  is not an exact interoperability/falsifier artifact for its new load-bearing field.
- **Stage 0 blocker:** yes.
- **Earliest action to reopen:** `S0-2` Stage D and `S0-8` regeneration, not `P-1`.
- **Simpler repair / preserved theorem:** publish the field in the formula and vector inputs and assert independent
  reconstruction of the transcript. The SAS, nonce commitment, role ordering, and wrapping-key negatives remain
  unchanged.

### A-03 — refusal epoch is signed but is not part of the client's subject comparison

- **Severity:** medium.
- **Exact artifacts:** `docs/review/remediation/S0-4/A-schemas.md:78-84,116-119`;
  `scripts/generate-antireplay-vectors.mjs:185-203,684-691,713,915-923`;
  `test/outboundSpool.test.ts:43-50,60-70`; validation step 4 of
  `docs/review/findings/f-745e332-envelope-refusal-carrier-missing.md`.
- **Violated invariant / finding / RC:** `RC-4` exact relevant-epoch authority, old-capability retirement, and the
  finding's named cross-epoch substitution scenario.
- **Reproduction/reasoning trace:** `decide()` compares workspace, credential, position, and digest, but `mine` has
  no epoch and the verifier is injected independently. The model's `Refusal` omits epoch entirely. The only epoch
  negative changes the epoch while retaining the old signature, so it proves field binding, not rejection of a
  genuine signed wrong-epoch refusal. The genuine wrong-subject list contains only position, digest, and credential.
- **Reachable consequence:** a valid refusal signed under a stale/forked certified `K_accept`, with the current
  envelope's other subject fields, licenses re-minting even though that old authority should have retired. A delayed
  old-key compromise can discard/respin current outbound bytes.
- **Stage 0 blocker:** yes.
- **Earliest action to reopen:** `S0-4` Stage A/D and TRD §7.5.
- **Simpler repair / preserved theorem:** carry envelope epoch in the local subject, require exact equality, and
  resolve `K_accept` from that exact authenticated epoch/lineage. Add a genuinely signed wrong-epoch negative. This
  does not change spool bytes, refusal chaining, permanence, or the accepted-position theorem.

### A-04 — the Local archive's factor anchor and manifest authority are disconnected

- **Severity:** high.
- **Exact artifacts:** `docs/review/remediation/S0-6/A-schemas.md:42-66,126-133`;
  `scripts/generate-package-vectors.mjs:880-925,1112-1123,1235-1242,1289-1303`;
  `test/vectors/package.json:208-250`.
- **Violated invariant / finding / RC:** `P-6`, `RC-6`, `f-745e332-local-archive-portable-wrap-undefined`, and
  the fresh-rewrap boundary of `f-745e332-package-root-rewrap-substitution`.
- **Reproduction/reasoning trace:** Stage A requires the never-established manifest `auth_root` to be
  `archive_pub`, which the code-sealed commitment anchors. The generator's isolated restore block does that in
  `archiveBase`. Its published package positive instead sets `archiveFields.authRoot` to the laptop's Ed25519 public
  key and verifies/signs with that key. The code-sealed archive commitment and generation wrap are never composed
  with `archiveFields`, so `node scripts/generate-package-vectors.mjs --check` passes two incompatible positives.
- **Reachable consequence:** following the specified importer order rejects the published Local positive because
  the manifest root differs from the sealed root. Merely changing the manifest field to the X25519 `archive_pub`
  is still insufficient: no factor-anchored signing authority then authenticates the manifest. An attacker can sign
  fabricated parts with its own device key and HPKE-wrap an attacker generation to the genuine public
  `archive_pub`, reproducing the paired fresh-rewrap substitution under Local custody.
- **Stage 0 blocker:** yes.
- **Earliest action to reopen:** `S0-6` Stage A/D (and `P-6` only if the one-factor/per-workspace product choice must
  change).
- **Simpler repair / preserved theorem:** put a Local manifest verification key under the same factor authority
  (for example seal its private half beside `archive_priv` and commit both public keys), require the manifest signer
  to equal that committed key, and run one clean-device import over the actual published package. Account live/
  retired package formats and their current root/signature negatives remain intact.

### A-05 — `TerminalHandoff` catch-up is a hash of public endpoints, not a catch-up proof

- **Severity:** high.
- **Exact artifacts:** `docs/review/remediation/S0-6/A-schemas.md:91-114`;
  `docs/TRD.md:3235-3252`; `scripts/generate-package-vectors.mjs:403-430,1022-1044,1065-1086`;
  `test/vectors/package.json:402-415`.
- **Violated invariant / finding / RC:** `RC-6` receipt authority and exact-known-absence requirement;
  `f-4259822-retirement-safe-survivor-gate-undefined`.
- **Reproduction/reasoning trace:** for a behind receiver, `authorizeDeletion()` accepts
  `SHA-256(LP(priorHead) || LP(terminalHead))` and any non-negative integer. There are no transcript bytes, chain
  links, transcript signer/key/epoch, absence identifiers, or count-to-list comparison. The passing `caughtUp`
  object claims two absences while carrying zero absence entries. The “unverifiable” negative merely supplies a
  random digest; “unenumerated” supplies `-1`.
- **Reachable consequence:** any stale receiver can calculate the digest from two public heads, set
  `knownAbsences = 0`, sign its own `H`, and authorize deletion without receiving terminal content or enumerating
  missing objects. Cross-actor acknowledgement is reduced to self-assertion by the actor whose completeness was at
  issue.
- **Stage 0 blocker:** yes.
- **Earliest action to reopen:** `S0-6` Stage A/D and TRD §14.4.
- **Simpler repair / preserved theorem:** define an exact authenticated transcript carrier (source authority/epoch,
  ordered accepted links or equivalent proof, explicit absence identifiers), commit its full bytes and count in
  `H`, and verify both before accepting the receiver's acknowledgement. Current-package digest binding, current-head
  fast path, per-class idempotency, and non-receiver signature negative remain useful.

### A-06 — the retention ceiling overrides the terminal handoff and deletes without a survivor

- **Severity:** high.
- **Exact artifacts:** `docs/review/remediation/S0-7/A-schemas.md:114-123,211`;
  `docs/TRD.md:3235-3256,3376-3388`; `test/hostedRetention.test.ts:248-288,441-450`.
- **Violated invariant / finding / RC:** `RC-7` composed with `RC-6`; the complete-evidence-before-deletion invariant;
  validation step “refuse deletion when no such proof exists” in
  `f-4259822-retirement-safe-survivor-gate-undefined`.
- **Reproduction/reasoning trace:** before the deadline, `deleteClass()` requires a retirement handoff. At or after
  the deadline, `past` bypasses that check; `enforceCeiling()` deletes every class. A named positive test explicitly
  accepts “a retirement whose handoff never came” and records `deletedWithoutReceipt` rather than preserving bytes.
- **Reachable consequence:** lost acknowledgement, stale-only survivors, or no survivor delete the only complete
  hosted copy at the deadline. An audit flag records irreversible loss but does not make a receiver current. This is
  the original high finding as a selected positive.
- **Stage 0 blocker:** yes.
- **Earliest action to reopen:** `S0-7` Stage A/B/D and the row-16/§14.4 composition. This needs an explicit product
  choice if bounded retention is intended to outrank recoverability.
- **Simpler repair / preserved theorem:** keep handoff non-waivable for retirement, or introduce a distinct,
  explicitly authorized loss/deletion exception whose authority and UX do not pretend to be a survivor receipt.
  One-clock computation, retirement-wins arbitration, entitlement expiry, replay, and per-class ledger idempotency
  can remain.

### A-07 — `corrected-end-state.md` still describes pre-decision branches and a rejected refusal cap

- **Severity:** medium (closure/governance).
- **Exact artifact:** `docs/review/remediation/corrected-end-state.md:76-78,151-155,169-174,194-197,220-225,242-247`.
- **Violated invariant / finding / RC:** `RC-8` total/bidirectional closure authority and `S0-9`'s requirement to
  challenge the exact corrected end state.
- **Reproduction/reasoning trace:** the document calls `RC-1`, `RC-3`, `RC-5`, and `RC-7` choices unresolved even
  though all `P-*` decisions are recorded as decided in the action tree. It prescribes an attempt-1 sole successor
  that “cannot fork or create a third,” while `S0-4` explicitly removed both the attempt cap and sole-successor
  slot after mutation testing. `pnpm trace:check` remains green because it maps finding claims and does not reconcile
  this consumer's semantics.
- **Reachable consequence:** an implementer following an exact closure artifact can implement a protocol that the
  normative repaired action records rejected, and a reviewer can mistake already-selected branches for open work.
- **Stage 0 blocker:** yes, as a corrected-closure artifact; not a production vulnerability by itself.
- **Earliest action to reopen:** `S0-8` artifact reconciliation, plus `S0-1` if bidirectional coverage is extended to
  this consumer.
- **Simpler repair / preserved theorem:** regenerate/update the document from the selected decisions and add a
  readback that detects selected/open and refusal-cap contradictions. No cryptographic construction changes.

### A-08 — authoritative records disagree on when X25519 support evidence is due

- **Severity:** low (gate governance).
- **Exact artifacts:** `docs/review/remediation/action-tree.md:19`,
  `docs/review/remediation/traceability.md:72`, and `docs/review/remediation/HANDOFF.md:52-55`.
- **Violated invariant / finding / RC:** `RC-8` single closure authority, `RC-9` gate ownership, and
  `f-bd87655-x25519-support-floor-omitted`.
- **Reproduction/reasoning trace:** the action tree says the deliberately empty dated evidence table is “Required
  before `S0-10`.” Traceability and the handoff instead declare the same missing evidence owed at `L-4`. All are
  operative repaired-tip records, and `pnpm trace:check` accepts the latter assignment without detecting the former.
- **Reachable consequence:** one closure path can advance to `S0-10` while another says its prerequisite remains
  unsatisfied; neither a challenger nor a release owner has a unique gate to enforce.
- **Stage 0 blocker:** yes under the action tree's explicit wording, until the records agree. This is not evidence
  that X25519 works on the supported population.
- **Earliest action to reopen:** `S0-8` authority/readback reconciliation, then either collect the table before
  `S0-10` or explicitly amend the action-tree gate to `L-4`.
- **Simpler repair / preserved theorem:** choose one gate and make all three records agree. The exact operation list,
  fail-before-credential behavior, and all current suite/WASM checks are preserved.

## Named adversarial scenario accounting

The following is the complete action-tree scenario inventory, not merely the cases related to the new defects.

| RC       | Named scenarios and result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RC-1/2` | delayed malicious reader **pass**; `R_pub` substitution **pass**; complete replacement byte elision **pass**; four-object total loss then future rotation **fail A-01**; stale/forked bootstrap head **fail authority isolation A-01** (the present negative only breaks an existing signature); exposed code after replacement **partial/fail A-01**, while successor-generation binding passes; every `GenerationApply` kill **pass**; old journal/batch/spool and checkpoint fallback after two rotations **pass**; stale no-PRF profile and `rotation_owed` copy **pass**. |
| `RC-3`   | boundary, quota, staged-WAL/apply kill, concurrency, trim, nonce budget, generation-key lookup, and independent gate mutations **pass at design/model level**. Immutable device-population p95 remains `L-1/L-4`.                                                                                                                                                                                                                                                                                                                                                              |
| `RC-4`   | request lost before receipt, accepted reply lost, forged refusal, duplicate identical bytes, delayed refused original, missing parent, two successors, second accepted digest, two tabs, old provider unavailable, checkpoint-relative cleanup, and suite-registry mutation **pass**; genuine refusal across position/digest/credential **pass**; genuine refusal across epoch **fail A-03** (and genuine workspace substitution is not isolated).                                                                                                                             |
| `RC-5`   | omitted insertion/deletion, head beyond snapshot, extra snapshot op, whole valid claim replacement, trim/fresh restore, producer-only admission, missing replay witness/proof, incomparable producers/first writes, partial install, newest loss, opener deletion, compaction/card deletion **pass at Stage 0**.                                                                                                                                                                                                                                                               |
| `RC-6`   | paired account fresh-rewrap **pass**; clean Local restore without account/device/provider and Local fresh-rewrap **fail A-04**; wrong factor/root component checks **pass**; terminal-record-only non-upgrade **pass**; lost package reply/ack **pass only before RC-7 composition**; receiver behind, incomplete catch-up/known absence, and stale-only survivor **fail A-05**; partial per-class deletion transition **pass**; provider disappearance/migration **fail where they consume the Local or handoff defects**.                                                    |
| `RC-7`   | one clock, lapse/retire arbitration in both orders, resume before destructive progress, per-class idempotency, replay/backdating, divergent-survivor reseed shape, and local-clear/unconfirmed-revocation outcome **pass**; resume after destructive progress behaves as declared; no-survivor, terminal-handoff gate, and lost acknowledgement at the ceiling **fail A-06**. Executed storage kills/reseed/local clear remain correctly `L-3`.                                                                                                                                |
| `RC-8`   | exhaustive owner/enum and selected-row mapping, PRD/TRD/register checks, static-origin scoped claim including `wss`, WebAuthn selected policy, suite separation, WASM widths/source check, artifact staleness/hash, and trace liveness **pass**; exact X25519 dated support evidence remains owed; corrected-end-state consumer agreement **fail A-07**; the intentionally surviving dynamically assembled URL remains correctly outside a static scanner's claim.                                                                                                             |
| `RC-9`   | slower-device hardware sampling, immutable append population, stale-blob normal-CI failure, exact RustCrypto audit delta, runtime remote-channel evidence, and reviewer response/readback remain explicitly blocking at `L-4`, not falsely passed here.                                                                                                                                                                                                                                                                                                                        |

## Gate blockers, later gates, and historical-only items

- **Gate-assignment contradiction before `S0-10`:** A-08. I did not use external evidence; under the action tree's
  explicit wording, `S0-10` remains blocked even apart from A-01–A-07.
- **Honest later gates:** runtime proof that an exposed old recovery code opens nothing after replacement is marked
  partial to `L-2`; executed package/recovery/deletion/reseed/local-clear kills are `L-3`; hardware/platform,
  performance population, source-delta/stale-blob CI, runtime egress, and external-review readback are `L-4`.
- **Historical-only, non-blocking:** the four `H-1` ledger corrections (`f-138a5f8`, `f-6b021c4`, `f-caee157`,
  `f-dbfd01f-row20`) were not treated as operative tip defects. Their introduction hashes were nevertheless proven
  ancestors; no historical object outside `HEAD` ancestry was inspected.

## Causal-ancestor and simpler-repair conclusion

All 18 unique `introduced_by` hashes present in the finding population returned exit 0 from
`git merge-base --is-ancestor <hash> HEAD`. The failures above sit at the same causal authority boundaries as their
owning findings: recipient certification/recovery, exact refusal authority, package trust-root/receipt, destructive
lifecycle composition, and closure propagation. None requires abandoning `RC-1B`, `RC-2A`, `RC-3C`, the accepted
checkpoint design, or the one-package format. The smallest coherent repairs are additive exact fields and composed
verifiers, except A-06, where safety versus a hard retention ceiling needs an explicit product decision. Returning
only to the vector that missed each attack would repeat the shared-model closure weakness `S0-9` exists to detect.
