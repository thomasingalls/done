# Signed ARM64 release handoff

**2026-11-08 · Phase 530 · Tested source `759890ca09da0aba9d822a848caa5b26e77d125d`.**

The signed release-baseline merge preserves the hardening history and main's Node 24.22.1 CA distrust update. Both native ARM64 distroless images are built and retained. The application PR, registry publication and deployment remain separate steps.

| Artifact | Local tag | Immutable index digest |
| --- | --- | --- |
| Candidate, dense writer on | `done-public:759890ca` | `sha256:3914281adde5d49ab9d709c7ce22e4cb4ccb78f4418159b535ba25dc637f2c8b` |
| Compatible reader, dense writer off | `done-reader-rollback:759890ca` | `sha256:b81f99c14455ef689464f7ce57f27703e5230f2e7ebfd12a7953a79aa05f6dc4` |

[images.json](./images.json) records runtime manifests, config/layer verification and retained archive hashes. [source.json](./source.json) records the signed source, input-manifest identity, build arguments, effective flags and verifier identities. No source archive, image TAR, browser profile, retained service state, key or credential enters Git. All 2,049 allowlisted inputs match signed bytes and modes; all 123 packaged server files and 125 frontend files per image remain exact after testing.

## Behavior and profile

Account runtime/storage work moves into Web Workers, retaining synchronous encrypted local journal admission, an exact Window mirror, mixed-owner fencing and persist-before-promotion. Hardened changes include capacity parking, fresh-work maintenance slices, priority-only 10-second retries, adaptive missed-hint repair, quiet-peer eligibility and batching, binary self-contained inbound receipts, record-scoped owned pages and idle-start full audits. Retained-row comparisons and signature, chain, witness, expiry, authority, journal, lifecycle and final commit checks remain. There is a new client receipt format; no new server wire format, server schema, budget or limit is introduced.

Effective flags, all with the `VITE_ACCOUNT_` prefix:

| Flag | Candidate | Compatible reader |
| --- | --- | --- |
| BASELINE_READ, BASELINE_INSTALL, RETENTION | 1 | 1 |
| RETENTION_AUTO, RETENTION_RESUME | 1 | 1 |
| HISTORY_AUTO | 0 | 0 |
| RANGE_RECEIVE | 1 | 0 |
| BATCH | coordinated-2000 | coordinated-2000 |
| LEDGER | incremental | incremental |
| LEDGER_PROFILE | disabled | disabled |

Only RANGE_RECEIVE differs between the images. The compatible reader disables new dense receipt writing while keeping baseline reading and the same maintenance policy. These flags are compiled choices; changing Pod environment variables cannot change cached client assets. Ordinary source defaults remain writer-off. Service-history automation stays off.

## Exact artifact checks

- Both final images pass **38 cases each**: 16 runtime/gateway, 10 backup, six restore and six maintenance cases, with existing 15/20-second case deadlines. Runtime inventory is UID 65532, Node 24.22.1 and age 1.3.2, including pinned compiler/module/license details. The unmounted runtime has no shell, package manager or build toolchain. Old/new age compatibility passes six round trips and 12 wrong-key/tamper refusals per image.
- Each actual two-container smoke passes initialization, scoped API/origin checks, exclusive ownership, exact precache responses, persistence/identity after SIGKILL and restart, graceful shutdown and cleanup. Disposable resources are removed; both exact image archives remain local.
- The unchanged same-tree rollback case passes in 35.84 seconds under its 120-second deadline. A preloaded writer-off tab reopens a profile containing real dense rows, receives four new legacy positions, preserves exports and Undo, and passes ordinary offline disk-cold exactness. Only test output/report locations were isolated.
- The waiting-service-worker production → candidate → compatible reader → candidate rehearsal passes in 79.27 seconds under its 180-second deadline. Disposable protected original/joined devices retain the complete 1,000-character seed, queued/offline writing, wrong-code refusal, Undo/Redo, lock/reopen, two-way delivery and complete normalized archive equality. Automatic retention moves both profiles from counter v2/revision 0 to v5/revision 1. The old frontend is exact production source `410221ad`; pinned old helpers are recorded. The API uses the candidate's signed source on host Node 24.22.1 throughout. This demonstrates frontend rollback; predecessor-server rollback is not claimed. Actual container APIs have the checks above.
- Signed-source preflight passes 333 unit files: **3,231 tests pass, one existing skip**, 131.96 seconds against the approved 240-second hang guard. Types, lint, contract/vector checks and all 178 adapter tests pass after the exact approved three-value census update. All old execution obligation IDs and unresolved blocks remain: 1,102 obligations, 551 unresolved. The earlier failures remain recorded in phase 529.
- Six fresh same-source receipt producers and traceability pass: origin isolation, retention, status, limit, debts and WASM; 101 claims, 28/28 current defects with named falsifiers and nine registered debts. The first refresh omitted debts/WASM and refused; it remains visible. Refresh all six and traceability again after this documentation checkpoint changes HEAD, before pushing. Never relabel receipts from another source.

No uninterrupted full `pnpm check` run, new timing campaign, vulnerability scan or physical-phone result is claimed by this packet.

## Source and bundle proof

Application, protocol, service, verifier, Vite and lockfile sources are byte-identical to source 510. The host build had 2,047 inputs; Docker adds its Dockerfile and ignore file. Four shared inputs differ: two Node-version assertion scripts and the two approved census fixtures.

All 58 executable bundles agree after exact named normalizations: referenced chunk hashes, version/date, conservative verifier provenance and disabled profiling metadata. Docker leaves LEDGER_PROFILE unset where the earlier host build explicitly set 0. Only literal 1 enables it; the proof accounts for 217 omitted zero-valued metadata properties and no other executable difference. Controls show that enabled profiling or an added statement cannot disappear through normalization. All 58 source maps preserve exact source contents; dependency paths relocate between host/container. Both service workers regenerate byte-for-byte under Vite's real bundled-config loader. The first native-TypeScript regeneration differed only in its Function.toString-derived VERSION salt; that attempt remains preserved.

[evidence.json](./evidence.json) binds the proof scripts, result files, declarations, reference sources and all failed/corrected preliminary apparatus attempts by hash. A documentation-only follow-up must not relabel or rebuild the tested images. Recheck every allowlisted byte and mode after signing and after the application merge.

## Performance acceptance and debts

[Phase 528](../../2026-11-02-release-hardening/528-source510-stage6-amended-goals/README.md) remains the performance outcome home: 36 supported passes across 12 cells, comprising 21 source carries and 15 distinct passing source-510 runs. Its two stricter Goals r1 carries and four amended Undo/Redo runs remain explicit. The failed 522-r2 immediate-read race stays in history. The frozen Goals guard uses the approved 2,500 ms completion polls; key-to-rAF remains diagnostic rather than the 16 ms mutation gate. This artifact packet earns no new image/Android timing or aggregate qualification credit.

All RC debts remain: audits block receive while running; coordinated paired-150 sending exceeds 2.5 seconds; no physical-phone/real-account timing or proven RAM saving; the first missed hint may wait for an initial idle poll; capacity parks and repeat attempts after new hints may be expensive; the 4 MiB hex-encoded baseline limit holds roughly 2 MiB of snapshot; preparation and real-scale index costs are unmeasured; batch fairness has no wall-time bound; some Worker facade replies grow with history. Post-reduction clearView reauthentication/typing costs, the exact ERR_ABORTED cancellation cause and Undo main-thread cost also remain unmeasured or unresolved. Earlier report-only misses retain their original source and credit limits.

## Read-only operational preflight

Production remains ready on predecessor index `ad463efe…`, source `410221ad`, Node 24.22.1, UID 65532. The Deployment UID, established 10 GiB Bound PVC and public service identity match prior records. Existing backup status is HTTP 200/healthy, with zero unprotected-change age, no quota block, pending hourly verification and 45 historical failures retained as observed. No backup/download was triggered and no account writing or credential values were read or recorded.

Current local ol-infra main `74f7e921` passes offline render/boundary checks. Refresh remote main before its actual PR. The image pin now lives at `infra/apps/done/components/runtime/kustomization.yaml`. Preserve identity, PVC, secrets, backups, routing and HSTS; leave service-history automation off.

## Publication and rollback

1. Sign this documentation checkpoint. Verify all 2,049 inputs against the tested source and refresh current-tip receipts/traceability. Push the signed branch and open the application PR. The operator's standing decision makes slow hosted Actions non-blocking; local contract and bookkeeping checks remain required.
2. **The operator merges the application PR using Create a merge commit**, preserving the signed history. Compare all merged build inputs with the tested source; publish the exact retained images rather than a rebuilt substitute.
3. After application merge and exact destination/digest approval, publish both private tags: `ghcr.io/thomasingalls/done:759890ca-reader` and `ghcr.io/thomasingalls/done:759890ca`. Verify private visibility, remote index/runtime digests and authenticated pulls. Retain the compatible reader remotely before deploying the writer.
4. Prepare the current-main infrastructure digest-pin/evidence PR. **The operator keeps that merge button too.** After its merge, reconcile through the Justfile and verify running digests, readiness, public assets, identity and backup health. Device adoption is a separate check: accept the normal cached-client update without clearing storage.

**Rolling back to any build before this release locks out devices that wrote dense rows or carry the new format floor.** The predecessor is incompatible. Pin the retained same-source writer-off reader and wait for cached clients to adopt it. Existing rows and the format floor remain; never clear storage, drop a baseline or rewrite receipts to accommodate an older client. Image rollback preserves service data/identity and is not a database restore.

Other feature rollbacks require coherent, separately built and tested compatible assets. Keep baseline reading enabled. To stop local automation, disable AUTO/RESUME coherently through the build checks. Ledger/sender reference modes need their own compatible artifacts and validation. HISTORY_AUTO stays 0. No other rollback variant is claimed tested here.

**Nothing is published or deployed by this preparation.**
