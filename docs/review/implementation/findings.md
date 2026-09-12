# Encrypted-store and Account implementation findings

Intake assessment: **2026-09-12, signed `27e5b6f`**. This is the shared index for the same source's
original packet and two addenda. It reconciles current implementation and recorded evidence; no new
runtime tests, benchmarks or security probes were executed during this intake. Importance describes
engineering priority in the current private development scope, not a demonstrated exploit severity.

**Follow-up after signed `1372c39`:** the user retired v8 as a product target. The
[sync-liveness repair sequence](../../account-sync-liveness-repairs.md) is complete for private v9's
creating-member composition, with [12-stage combined evidence](../../account-conformance-runs/2026-09-12-account-liveness-complete/README.md)
and 999 passing unit tests. History capacity/pruning and release qualification remain separate.
Historical intake responses are unchanged.

- [F packet: af8941e..96a2040](./af8941e-96a2040.md) retains its historical responses unchanged.
- [N addendum: 96a2040..1ceb88d](./96a2040-1ceb88d.md) has current responses to all 31 F status rows and
  all nine new findings.
- [P addendum: 1ceb88d..393ef43](./1ceb88d-393ef43.md) has current responses to all 11 F status rows,
  all nine N status rows and all seven new findings.
- [Intake provenance and machine-readable crosswalk](./addenda-2026-09-12.json) preserve original
  hashes, all 47 leaf IDs, source references, and the current assessment revision.

There are **67 response blocks for 47 distinct leaf IDs** across the two annotated addenda. F-21 is
an umbrella for F-21.1–F-21.7, not an eighth test-gap finding. Preserve F/N/P numbering as supplied;
the nine alias entries below route into an earlier work item, rather than becoming nine extra fixes.
These IDs belong to the implementation review and must not be inserted into the older Stage 0
`work-items.tsv` or `debts.json` namespace. Existing formal gate debts remain unchanged.

## Priority and scope

1. **F-07 with N-01/N-02/P-01, plus N-03/P-02/P-03: bounded sync-liveness repair complete.**
   The [repair/evidence record](../../account-sync-liveness-repairs.md) covers complete-view and exact
   event reuse, shared coverage reconstruction, owned HTTP separation, classified automatic expiry
   retry, local-only send wakes and durable send-progress receive wakes. Service event reuse retains
   fresh authority/SQL/semantic/witness/commit checks. The measured workload improves without claiming
   an unlimited-history threshold. Proof pruning, long-history capacity and projection/resource costs
   remain outside this closure. The personal Local editor remains separate.
2. **F-21.4: bounded packaged/migration/file evidence complete; wider qualification remains.**
   The [extension](../../account-conformance-runs/2026-09-12-privacy-extended/README.md) covers packaged
   UI/worker/export, synthetic migration/restart/cleanup/clear and observable profile/SQL/WAL bytes.
   Logical cleanup passes; legacy plaintext remains in a physical LevelDB file. Supported-platform
   opener tests, opaque formats and fragmentation remain. Do not close the wider finding.
3. **F-10 with N-08/P-07, and F-09:** define actionable refusal, diagnostics and recovery behavior
   before onboarding. Preserve signed evidence versus unsigned hints; diagnostic logs must not become
   a plaintext/factor carrier. F-13/F-14/F-23/F-24 belong to the relevant ownership/capacity/UI work.
4. **F-20 with N-06/P-05:** make validation scheduling, time budgets and complete aggregate coverage
   explicit. Keep the existing crypto audit's narrower success; do not imply a recent full `pnpm check`.
   Consolidate repeated work without dropping standalone prerequisites or source-bound evidence.
5. **P-06** is a small docs follow-up. **F-08/N-04 and N-09** are disposed by the user’s explicit
   decision not to ship or support the intermediate Account v8 product paths (2026-09-12).
   **F-16/F-17/F-18/F-19/F-25** remain measured
   maintenance/resource work; content compaction is not Account proof-ledger pruning. **F-22** remains
   a dependency-upgrade obligation. No upstream report, push, remote deployment or platform work is
   authorized by this intake.

The strongest caveat to the proposed performance fix is structural: `inspectSpool` excludes ordinary
content and source capsules from its event witness; `inspectInbound` extends that witness with ledger
events. `verifyInboundCoverage` separately reconstructs content. Equality of the spool witness alone
therefore does not justify reusing all verification results after content changes/removal or compaction.
It also changes with new events, so a whole-ledger cache alone does not remove growing-history work.
Require complete invalidation, cold authentication, stale-owner refusal and corruption controls before
accepting an incremental design. Do not relax request expiry or remove projection guards by assertion.

The supplied performance measurements are credible leads, but the fixed failure thresholds, universal
per-character statement and claim that idle polling necessarily creates an endless queue are not
established here. The scheduler is single-flight and schedules the next idle poll after completion.
The [bounded follow-up](./account-sync-liveness.md) now reproduces repeated work and the final-commit
expiry halt, without establishing those universal claims.

## Account v8 product disposition (2026-09-12)

The user confirms that the intermediate Account v8 paths have never held customer or personal dogfood
data and will not ship. F-08/N-04 and N-09 therefore need no further product hardening or backwards
compatibility work. This refers to the Account implementation stage, not the TRD document version.
Some v8 preparation code remains an internal dependency of the current v9 setup and its tests; removing
that scaffolding is separate cleanup. Shared code used by v9 still has to meet v9's requirements.
This disposition does not claim the old driver was fixed or that its code has already been deleted.
See the [decision journal](../../decisions.md#retire-the-intermediate-account-v8-product-paths).

## Current F dispositions

Each current response is in the N packet, adjacent to its historical status table. Closure credits
later committed evidence only in its documented scope. Historical annotations are not silently edited.

| ID | Current status | Importance | Related addenda / evidence |
| --- | --- | --- | --- |
| <a id="f-01"></a>**F-01** Private-envelope AAD audit | closed; [assessment](./96a2040-1ceb88d.md#assessment-f-01) | high validation integrity | —; [package.json:30](../../../package.json) |
| <a id="f-02"></a>**F-02** Storage harness import closure | closed; [assessment](./96a2040-1ceb88d.md#assessment-f-02) | high regression coverage | —; [docs/validation-baseline.md](../../../docs/validation-baseline.md) |
| <a id="f-03"></a>**F-03** Descriptor LP capacity | closed; [assessment](./96a2040-1ceb88d.md#assessment-f-03) | high capacity/correctness | —; [account-protocol/admission.ts](../../../account-protocol/admission.ts) |
| <a id="f-04"></a>**F-04** Fresh activation assertion | closed; [assessment](./96a2040-1ceb88d.md#assessment-f-04) | medium authorization contract | —; [account-service/core.ts:856](../../../account-service/core.ts) |
| <a id="f-05"></a>**F-05** Construction ownership and byte contracts | closed within recorded scope; [assessment](./96a2040-1ceb88d.md#assessment-f-05) | high protocol assurance | [N-07](#n-07); [docs/review/implementation/account-crypto-closure.md](../../../docs/review/implementation/account-crypto-closure.md) |
| <a id="f-06"></a>**F-06** Recovery payload vectors | closed within recorded scope; [assessment](./96a2040-1ceb88d.md#assessment-f-06) | medium-high interoperability | —; [docs/review/implementation/account-crypto-closure.md](../../../docs/review/implementation/account-crypto-closure.md) |
| <a id="f-07"></a>**F-07** Repeated full-history verification | repaired within bounded v9 scope; [evidence](../../account-sync-liveness-repairs.md); [assessment](./96a2040-1ceb88d.md#assessment-f-07) | high Account liveness | [N-01](#n-01), [N-02](#n-02), [P-01](#p-01); [src/crdt/accountReceive.ts:104](../../../src/crdt/accountReceive.ts) |
| <a id="f-08"></a>**F-08** Source-free reopen capsules | product disposition: v8 retired; internal setup retained; [assessment](./96a2040-1ceb88d.md#assessment-f-08) | low waste/latency | [N-04](#n-04); [src/crdt/accountReceive.ts:489](../../../src/crdt/accountReceive.ts) |
| <a id="f-09"></a>**F-09** Fail-closed diagnostics and salvage | open; [assessment](./96a2040-1ceb88d.md#assessment-f-09) | medium recoverability | —; [docs/storage-contract.md](../../../docs/storage-contract.md) |
| <a id="f-10"></a>**F-10** Service and client error classification | open; [assessment](./96a2040-1ceb88d.md#assessment-f-10) | medium operations; low direct security impact | [N-08](#n-08), [P-07](#p-07); [account-service/delivery.ts:608](../../../account-service/delivery.ts) |
| <a id="f-11"></a>**F-11** Passkey registration binding | closed; original suggested comparison rejected; [assessment](./96a2040-1ceb88d.md#assessment-f-11) | medium authorization correctness | —; [account-service/delivery.ts:147](../../../account-service/delivery.ts) |
| <a id="f-12"></a>**F-12** Unchecked PKCS#8 slicing | closed; [assessment](./96a2040-1ceb88d.md#assessment-f-12) | low portability/correctness | —; [src/account/recovery.ts:32](../../../src/account/recovery.ts) |
| <a id="f-13"></a>**F-13** Blocked compatibility open | open UX; ownership rule retained; [assessment](./96a2040-1ceb88d.md#assessment-f-13) | low availability/UX | —; [src/crdt/storageCompatibility.ts:17](../../../src/crdt/storageCompatibility.ts) |
| <a id="f-14"></a>**F-14** Scoped custody row cap | open capacity classification; [assessment](./96a2040-1ceb88d.md#assessment-f-14) | low for current single-workspace scope | —; [src/crdt/startupStorage.ts](../../../src/crdt/startupStorage.ts) |
| <a id="f-15"></a>**F-15** Reservation persistence | fixed under explicit strict-persistence assumptions; [assessment](./96a2040-1ceb88d.md#assessment-f-15) | medium cryptographic accounting correctness | —; [docs/review/implementation/reservation-durability.md](../../../docs/review/implementation/reservation-durability.md) |
| <a id="f-16"></a>**F-16** Content compaction scheduling | open; [assessment](./96a2040-1ceb88d.md#assessment-f-16) | medium storage/usability | —; [src/crdt/accountReceive.ts:551](../../../src/crdt/accountReceive.ts) |
| <a id="f-17"></a>**F-17** Editor projection and fork cost | open; measure before repair; [assessment](./96a2040-1ceb88d.md#assessment-f-17) | medium, potentially high with large documents | —; [src/crdt/admittedWorkspace.ts](../../../src/crdt/admittedWorkspace.ts) |
| <a id="f-18"></a>**F-18** Origin-wide journal scans | open; measure before repair; [assessment](./96a2040-1ceb88d.md#assessment-f-18) | low | —; [src/crdt/journalStore.ts](../../../src/crdt/journalStore.ts) |
| <a id="f-19"></a>**F-19** Promotion marker and request resource cost | open; [assessment](./96a2040-1ceb88d.md#assessment-f-19) | medium capacity/operations | —; [src/crdt/promotionRecord.ts](../../../src/crdt/promotionRecord.ts) |
| <a id="f-20"></a>**F-20** Validation deadlines and aggregate cost | partial; wider load/aggregate work open; [assessment](./96a2040-1ceb88d.md#assessment-f-20) | low-medium validation reliability | [N-06](#n-06), [P-05](#p-05); [docs/validation-baseline.md](../../../docs/validation-baseline.md) |
| <a id="f-21.1"></a>**F-21.1** Remaining parser conformance | addressed within recorded scope; [assessment](./96a2040-1ceb88d.md#assessment-f-21.1) | medium assurance | —; [docs/review/implementation/account-parser-conformance.md](../../../docs/review/implementation/account-parser-conformance.md) |
| <a id="f-21.2"></a>**F-21.2** Admission coverage and exact bounds | addressed within recorded scope; [assessment](./96a2040-1ceb88d.md#assessment-f-21.2) | medium-high assurance | —; [docs/review/implementation/account-admission-evidence.md](../../../docs/review/implementation/account-admission-evidence.md) |
| <a id="f-21.3"></a>**F-21.3** Recognized cross-account capabilities | closed within recorded scope; [assessment](./96a2040-1ceb88d.md#assessment-f-21.3) | medium authorization assurance | —; [docs/review/implementation/account-isolation.md](../../../docs/review/implementation/account-isolation.md) |
| <a id="f-21.4"></a>**F-21.4** Neutral plaintext-residue evidence | partial; R1 and packaged/migration/observable-file extension complete, platform/opener scope open; [assessment](./96a2040-1ceb88d.md#assessment-f-21.4) | high privacy assurance | —; [docs/review/implementation/account-residue-evidence.md](../../../docs/review/implementation/account-residue-evidence.md) |
| <a id="f-21.5"></a>**F-21.5** Unit lock doubles | accepted; no defect established; [assessment](./96a2040-1ceb88d.md#assessment-f-21.5) | informational | —; [docs/review/implementation/af8941e-96a2040.md](../../../docs/review/implementation/af8941e-96a2040.md) |
| <a id="f-21.6"></a>**F-21.6** Delivery oracle independence | addressed within recorded scope; [assessment](./96a2040-1ceb88d.md#assessment-f-21.6) | medium assurance | —; [docs/review/implementation/account-delivery-oracle.md](../../../docs/review/implementation/account-delivery-oracle.md) |
| <a id="f-21.7"></a>**F-21.7** Service-issued refusal/conflict composition | closed within recorded scope; [assessment](./96a2040-1ceb88d.md#assessment-f-21.7) | medium authorization/restart assurance | —; [docs/review/implementation/account-decision-composition.md](../../../docs/review/implementation/account-decision-composition.md) |
| <a id="f-22"></a>**F-22** Yjs upgrade seam evidence | open upgrade obligation; [assessment](./96a2040-1ceb88d.md#assessment-f-22) | low now; required at dependency upgrade | —; [docs/yjs-delivery.md](../../../docs/yjs-delivery.md) |
| <a id="f-23"></a>**F-23** Recovery lock-order documentation | open documentation; [assessment](./96a2040-1ceb88d.md#assessment-f-23) | low preventive correctness | —; [src/account/recoveryOwner.ts:209](../../../src/account/recoveryOwner.ts) |
| <a id="f-24"></a>**F-24** Passkey prompt under exclusive ownership | documented design; UX work deferred; [assessment](./96a2040-1ceb88d.md#assessment-f-24) | low UX | —; [docs/account-activation.md](../../../docs/account-activation.md) |
| <a id="f-25"></a>**F-25** Hex-capsule journal overhead | open; measure before repair; [assessment](./96a2040-1ceb88d.md#assessment-f-25) | low-medium paste latency | —; [src/crdt/sourceCapture.ts](../../../src/crdt/sourceCapture.ts) |

## Addendum routing

An alias shares the original root cause and action queue; it still retains its own assessment.
Related items have distinct behavior or completion criteria and stay separately visible.

| ID | Current disposition | Work item | Importance / current response |
| --- | --- | --- | --- |
| <a id="n-01"></a>**N-01** Receive expiry coupled to full-history verification | repaired: transaction expiry refusal and automatic fresh retry; merged into F-07 | [F-07](#f-07) | high Account liveness; [assessment](./96a2040-1ceb88d.md#assessment-n-01) |
| <a id="n-02"></a>**N-02** Growing client/service verification multipliers | repaired client/service verification reuse; capacity remains separate; merged into F-07 | [F-07](#f-07) | high in the current composition; [assessment](./96a2040-1ceb88d.md#assessment-n-02) |
| <a id="n-03"></a>**N-03** Fetch holds the serialized carrier task | repaired for supported v9 read and submission waits; close/drain/current checks retained | distinct; related [F-07](#f-07) | medium local responsiveness; [assessment](./96a2040-1ceb88d.md#assessment-n-03) |
| <a id="n-04"></a>**N-04** v8 driven reopen capsule | product disposition: v8 retired; merged into F-08 | [F-08](#f-08) | low; [assessment](./96a2040-1ceb88d.md#assessment-n-04) |
| <a id="n-05"></a>**N-05** Unspecified receipt baseline hash | closed by byte-contract specification | distinct | low compatibility; [assessment](./96a2040-1ceb88d.md#assessment-n-05) |
| <a id="n-06"></a>**N-06** Loaded-host generated-property timeouts | open; merged into F-20 | [F-20](#f-20) | low validation reliability; [assessment](./96a2040-1ceb88d.md#assessment-n-06) |
| <a id="n-07"></a>**N-07** Unnamed transport constructions | closed; covered by F-05 | [F-05](#f-05) | medium-high protocol assurance; [assessment](./96a2040-1ceb88d.md#assessment-n-07) |
| <a id="n-08"></a>**N-08** Read-route and HTTP reason collapse | open; merged into F-10 | [F-10](#f-10) | medium operations; low direct security impact; [assessment](./96a2040-1ceb88d.md#assessment-n-08) |
| <a id="n-09"></a>**N-09** v8 offline event hides halt reason | product disposition: v8 driver retired | distinct | low diagnostics; [assessment](./96a2040-1ceb88d.md#assessment-n-09) |
| <a id="p-01"></a>**P-01** Composed sync full-history cost and liveness cliff | bounded liveness repair verified; no universal capacity claim; merged into F-07 | [F-07](#f-07) | high; highest implementation priority from this intake; [assessment](./1ceb88d-393ef43.md#assessment-p-01) |
| <a id="p-02"></a>**P-02** Send progress does not expedite receive | repaired; durable progress expedites idle receive, preserving backoff/halts | distinct; related [F-07](#f-07) | low latency; [assessment](./1ceb88d-393ef43.md#assessment-p-02) |
| <a id="p-03"></a>**P-03** Remote promotion unnecessarily wakes send | repaired; native wakes match local admissions | distinct; related [F-07](#f-07) | low cost; compounds F-07; [assessment](./1ceb88d-393ef43.md#assessment-p-03) |
| <a id="p-04"></a>**P-04** Unsigned-to-signed history discoverability | documentation navigation addressed in this intake | distinct | low record navigation; [assessment](./1ceb88d-393ef43.md#assessment-p-04) |
| <a id="p-05"></a>**P-05** Aggregate validation freshness and repeated vectors | partial; merged into F-20 | [F-20](#f-20) | medium validation cost/coverage; [assessment](./1ceb88d-393ef43.md#assessment-p-05) |
| <a id="p-06"></a>**P-06** Duplicate unswept phase cryptographic prose | open documentation residual; F-05 stays closed | distinct; residual of closed [F-05](#f-05) | low drift risk; [assessment](./1ceb88d-393ef43.md#assessment-p-06) |
| <a id="p-07"></a>**P-07** Activation refusal parsed as a success object | open; merged into F-10 | [F-10](#f-10) | low diagnostics; medium user recoverability at onboarding; [assessment](./1ceb88d-393ef43.md#assessment-p-07) |

## Existing closure records

- [F-05/F-06: crypto contracts and aggregate](./account-crypto-closure.md), `ec889d9`.
- [F-15: strict reservation persistence](./reservation-durability.md), `c10dee3`; platform/restore assumptions remain.
- [F-21.3: recognized cross-account isolation](./account-isolation.md), `2bbb4c6`.
- [F-21.7: genuine service decision composition](./account-decision-composition.md), `f0b6acd`.
- [F-21.1: six remaining parsers](./account-parser-conformance.md), `77b0bb6`.
- [F-21.6: delivery state/evidence oracle](./account-delivery-oracle.md), `3b0a1ba`.
- [F-21.2: client admission coverage and size](./account-admission-evidence.md), `f118127`.
- [F-21.4: partial residue evidence](./account-residue-evidence.md), prep `6a9c9c4`, R1 `27e5b6f`.

F-01/F-02 and the original F-20 anchors are covered by [validation-baseline repair](../../validation-baseline.md)
at `e835243`. F-03 and F-04 are separately recorded at `4f71bac` and `2ba50aa`. N-05 is pinned by D3
`10fef3d`; N-07 is covered by C `a20e439` and D3. No runtime vulnerability is inferred solely from a
missing test or documentation omission.

## P-04: historical commit crosswalk

The [existing signed-history record](../../account-conformance-runs/2026-09-11-signed-contract-history.json)
preserves the full IDs, trees, signatures and backup ref. This intake rechecked all seven tree pairs
and that each replacement is an ancestor of the assessed revision. The old objects remain reachable
through local `codex/pre-sign-contract-history-2026-09-11`. Historical evidence describes what actually
ran on those trees; it must keep its original IDs and source hashes. This nearby crosswalk addresses
discoverability without rewriting those receipts or publishing the backup branch.

| Phase | Original unsigned commit | Signed replacement |
| --- | --- | --- |
| C | `d098bd4` | `a20e439` |
| D1 | `d24ca66` | `32d4074` |
| D2 | `1897848` | `437bc86` |
| D3 | `24bc3a4` | `10fef3d` |
| D4 | `837cd14` | `1500379` |
| D5 | `add6fd7` | `ed1a930` |
| D6 | `3585a1b` | `862a9d7` |

## Intake limits

Source inspection and historical artifact readback support these dispositions. The reviewer-reported
benchmarks were not independently rerun, and no finding was dynamically reproduced in this intake.
No SECURITY.md applies; `docs/storage-contract.md`, the Account phase/byte contracts and the private
entrypoints supply scope. Code reachability does not establish an unauthenticated attack: the Account
surface is private and operator-gated, and no real Account is active. The neutral residue archive and
existing source pins are unchanged; review documentation changes do not retroactively expand their scope.

The two root packets were moved here after annotation. The unrelated root file `done ` is untouched.
No production code, tests, wire bytes, personal installation, server, factor, origin, routing or formal
Stage 0 gate debt was changed. The review intake remains unstaged/uncommitted.
