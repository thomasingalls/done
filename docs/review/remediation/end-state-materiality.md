# End-state materiality at the reviewed tip `9edd930`

**Provenance.** This ledger was authored from the completed lineage evidence at review commit `032d51d` (“final
as-written review commit”, held on `claude/remediation-findings-review-997ab5`), which is **not an ancestor of
this branch** — the review workspace was carried over, not merged. The ledger itself entered this lineage at
`e19375a`. The title therefore names the object the classifications are anchored to and that this branch can
verify: the pinned reviewed target `9edd9300adebcec3abd2234c946f1dcccdc17eef`, an ancestor. This title briefly
named `032d51d`, which `S0-9` recorded as `FU-16`: content present, label not valid exact-lineage provenance.

## Decision rule

This ledger augments, and does not reopen, the completed review of the pinned target at
`9edd9300adebcec3abd2234c946f1dcccdc17eef`. A finding enters the remediation package only when its defect survives
that tip or when its bounded evidence conclusion still controls a current gate. A repaired historical defect does
not enter merely because it existed in the lineage.

The classifications below preserve the calibrated closure effects in
[`final-synthesis.md`](../analysis/final-synthesis.md): 19 current design defects, 9 current closure/evidence defects,
5 later implementation or release gates, and 4 historical-only corrections. No direct evidence supports moving a
validated finding into a different closure-effect class. The fifth permitted class, unresolved product choice, has
no finding assigned to it: the open choices are remediation branches or pre-existing rows 18, 19, and 21, not a
reason to erase a surviving design defect.

“Survives” means the selected construction or current closure record still contains the defect at the pinned tip.
“Decision support” means the finding remains material to what must be repaired, gated, or truthfully claimed even
when it is not a current design defect.

## Current design defects — 19

| Validated finding | Survives or supports a current decision | End-state materiality |
| --- | --- | --- |
| `f-c611666-rotation-reader-eligibility-missing` | **Survives.** The service roster is still not joined to a transferable, client-authenticated successful-delivery fact. | Blocks a sound future-reader set and the claim that service authorization alone cannot cause delayed key delivery. |
| `f-a073574-enrollment-recovery-key-unbound` | **Survives.** Row 11 still authenticates `W_pub` and the head, not the `R_pub` and recovery envelope a new rotator will trust. | Blocks ordinary enrollment from establishing authentic recovery-recipient state. |
| `f-4259822-recovery-replacement-no-forward-rotation` | **Survives.** Exposed old recovery material still opens the active generation after replacement. | Blocks the stated exposed-code replacement guarantee unless replacement rotates or the product promise is narrowed. |
| `f-4259822-recovery-replacement-payload-bytes-unbound` | **Survives.** The exact sealed recovery envelope and per-generation wrap bytes are outside the signed replacement digest. | Blocks atomic replacement from meaning that one exact complete set won. |
| `f-745e332-package-root-rewrap-substitution` | **Survives.** HPKE base-mode `info` binds context but not the package writer or historical root. | Blocks package authenticity after total loss or provider disappearance. |
| `f-745e332-local-archive-portable-wrap-undefined` | **Survives.** The never-established Local package has no selected saved-factor-to-generation opener. | Blocks clean-device Local archive restore. |
| `f-4259822-retirement-safe-survivor-gate-undefined` | **Survives.** No durable current-survivor/export and terminal-package acknowledgement gates hosted deletion. | Blocks safe irreversible account deletion. |
| `f-745e332-live-retired-package-resigning-undefined` | **Survives.** A terminal record alone cannot authenticate the changed retired manifest. | Blocks the claimed live-package-to-retired in-place upgrade; full retired-package replacement remains viable. |
| `f-3bea0e6-store-sequence-allocation-undefined` | **Survives.** No crash-safe cross-tab/global allocator, generation budget, or trim watermark is selected. | Blocks an unambiguous encrypted-store writer and safe concurrent trim. |
| `f-9b49b74-journal-seal-64k-gap` | **Survives.** The exact seal refuses 65,537 bytes and no pre-mutation refusal, chunking, or alternate WAL state exists. | Blocks the unconditional journal-before-return construction for every accepted update. |
| `f-992bc91-outbound-envelope-spool-undefined` | **Survives.** Random-nonce exact envelope bytes and position are not durably stored before send. | Blocks safe lost-request/lost-reply retry and independent device suffix retention. |
| `f-745e332-envelope-refusal-carrier-missing` | **Survives.** No authenticated ordinary-envelope never-accepted statement exists. | Blocks safe same-position re-mint after a genuine refusal without allowing relay-induced self-equivocation. |
| `f-4259822-generation-switch-local-durability-undefined` | **Survives.** The signed winner is not composed with successor opener install, active marker, old work, checkpoint, trim, and cleanup. | Blocks crash-safe application of every rotate/recovery-replacement/migration generation switch. |
| `f-b997cdb-checkpoint-coverage-unchecked` | **Survives.** Signed fields are not semantically derived from one real snapshot and accepted-head baseline. | Blocks safe suffix truncation, restore, fallback, and migration. |
| `f-b997cdb-checkpoint-key-retention-inverted` | **Survives.** Old-generation deletion still lacks an opener-for-every-retained-fallback predicate. | Blocks the promised second-newest checkpoint fallback. |
| `f-b997cdb-attribution-self-replacement` | **Survives.** A fresh restorer cannot distinguish first creation from a later valid self-replacement in the mutable CRDT map. | Blocks durable creation attribution through checkpoint, trim, package, and migration. |
| `f-f5def83-device-lock-reader-key-bypass` | **Survives.** On the no-PRF tier, the copied promptless wrapping credential can receive/open the post-lock self-reader wrap. | Blocks tier-independent “future content now requires the lock factor” copy. |
| `f-4259822-lapse-transition-kind-missing` | **Survives.** The selected transition grammar still has no lapse state or separately selected durable billing machine. | Blocks the claim that deliberate lapse/retention-clock behavior is mechanically bound. |
| `f-b9ff071-webauthn-cross-origin-policy` | **Survives.** The two verifiers still do not decide or enforce `crossOrigin`/`topOrigin` policy. | Blocks a complete WebAuthn verifier construction; the consequence remains bounded to reachable framed ceremonies and user action. |

## Current closure/evidence defects — 9

| Validated finding | Survives or supports a current decision | End-state materiality |
| --- | --- | --- |
| `f-3bea0e6-suite-separation-ignores-both-path` | **Survives.** `path: both` still enters neither oracle bucket. | The closure package must choose the stronger primitive rule or narrow it to key-domain separation, then test that exact rule. |
| `f-992bc91-network-carrier-registry-stale` | **Survives.** The supposedly total registry still calls selected network envelope v1 unselected. | The current agility/coverage evidence is not total even though row 4's bytes are locally unambiguous. |
| `f-9860a0b-journal-rotated-vector-reuses-key` | **Survives.** The generation-2 fixture still derives from the generation-1 root. | Closure lacks an executable wrong-generation-key lookup falsifier; the existing generation-AAD conclusion remains valid. |
| `f-9b49b74-wasm-glue-key-nonce-lengths` | **Survives.** Exact glue accepts wrong widths and can reuse stale static-buffer bytes. | The selected wrapper is not closed for its fixed-width inputs even though correct-width KAT behavior survives. |
| `f-dbfd01f-device-lock-rotation-caveat-lost` | **Survives.** Normative copy still omits reachable `rotation_owed`. | The design record must state whether enrollment completion waits for rotation or exposes a weaker pending state. |
| `f-5bd9552-origin-scan-static-forms` | **Survives.** The scanner still recognizes only listed literal forms while reporting universal origin isolation. | Row 17 evidence must be narrowed or supplemented with an allowed network graph and runtime/deployment enforcement. |
| `f-dbfd01f-record-nonce-ceiling-omitted` | **Survives.** The normative writer algorithm still omits the exact `2^32` equality boundary and action. | The record construction cannot be implemented from the winning document alone. |
| `f-bd87655-x25519-support-floor-omitted` | **Survives.** The capability inventory still omits a load-bearing HPKE primitive and its absence behavior. | The browser/release matrix is incomplete; no current incompatibility is asserted. |
| `f-tip-prd-stale-selection-status` | **Survives.** Current PRD subsections still call rows 5, 11, and part of 14 open while the TRD/register closes them. | Review and implementation scope cannot be called coherent until current normative status agrees. |

## Explicit later implementation or release gates — 5

| Validated finding | Survives or supports a current decision | End-state materiality |
| --- | --- | --- |
| `f-66a7c6a-journal-benchmark-overwrites-one-slot` | **Supports a later gate.** The fixed-slot Pixel microbenchmark remains useful but not product-shaped append evidence. | Require immutable append bursts, occupancy/cleanup, raw samples, and declared device sampling before generalizing the p95 budget. It does not reopen XChaCha/WASM selection by itself. |
| `f-bd87655-baseline-not-performance-floor` | **Supports a later gate.** Baseline still describes browser feature interoperability, not a hardware population. | Release support and journal performance need a separately measured device policy. |
| `f-9860a0b-legacy-plaintext-repair-undefined` | **Supports a Stage 1/2 gate.** The known old-origin cutover transaction is still unspecified. | Before that origin is opened by the encrypted build, prove export/import/active-store selection/deletion/restart with no plaintext left. This need not reopen the selected encrypted carrier. |
| `f-9b49b74-rustcrypto-audit-version-gap` | **Supports a release/external-review gate.** The 2019 audit still does not cover the exact 2022 `0.10.1` graph. | Route the source delta, compiler, glue, and final blob explicitly; preserve the audit as related history rather than exact-version proof. |
| `f-9b49b74-wasm-source-artifact-drift-unchecked` | **Supports a CI/release gate.** Normal behavioral verification still does not bind reviewed Rust source to generated bytes. | Require source/blob freshness and pinned or attested toolchain evidence in addition to KAT behavior. |

## Historical-only corrections with no surviving end-state consequence — 4

| Validated finding | Survives or supports a current decision | End-state materiality |
| --- | --- | --- |
| `f-138a5f8-libsodium-readiness-timing` | **Does not survive.** The 37 ms label remains historically inaccurate, but libsodium is not the selected provider. | Append-only provenance correction only; no remediation dependency. |
| `f-6b021c4-wasm-size-proxy-unreproducible` | **Does not survive.** The unnamed proxy is unreproducible, but the later exact selected 6,465-byte blob establishes current size feasibility. | Append-only provenance correction only; do not reuse the proxy. |
| `f-caee157-plaintext-baseline-points-to-parent` | **Does not survive as a design defect.** The row names a parent without the harness; it remains useful working-tree evidence. | Append-only provenance classification only; future performance gates use newly attributable measurements. |
| `f-dbfd01f-row20-closes-unvectorized-hpke` | **Does not survive.** The closure statement was false at `dbfd01f`, but later row-10 RFC 9180 evidence supplies current executable HPKE bytes. | Correct the historical closure date only; no current HPKE-vector repair enters the plan. |

## Unresolved product choice — 0 validated findings

No validated finding is moved here. Several repairs require bounded choices—especially lapse carrier, WebAuthn
embedding policy, allocator shape, oversize behavior, package-root construction, and Local archive factor—but the
underlying finding remains a current design or closure defect until one branch is selected. Rows 18, 19, and 21 also
remain explicit product choices outside the 37-finding population.

## Accounting and plan boundary

The 37 ids appear once: `19 + 9 + 5 + 4 + 0 = 37`. The causal and action packages include the 33 surviving/current
or later-gate findings. The four historical-only records enter only the historical-ledger action and cannot delay a
corrected Stage 0 end state.
