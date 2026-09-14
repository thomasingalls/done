# Encrypted-store and Account implementation findings

Original intake: **2026-09-12, signed `27e5b6f`**, committed in `1372c39`.
Latest intake: **2026-09-13, `6ba7c22`**, thirteen commits beyond the R review tip `d03e473`.
This shared index covers the same source's original packet and four addenda. The R intake adds a
synthetic service/read/receiver size reproduction, focused generated-property execution, direct
whole-tree style checks, read-only registry and Git/reference inventory. It reruns no native browser
campaign, reviewer slope probe or full aggregate. The Q intake at `9ff48b5` was committed in `409fbd0`
and remains a historical snapshot. The signed counterpart of the R assessment tree is `3e53b4a`;
[the crosswalk](../../account-conformance-runs/2026-09-13-signed-review-history.json) preserves its original ID.
Importance describes engineering priority in the current
private development scope, not a demonstrated exploit severity.

**Follow-up after signed `1372c39`:** the user retired v8 as a product target. The
[bounded sync-liveness repair sequence](../../account-sync-liveness-repairs.md) improved private v9's
creating-member composition, with [12-stage combined evidence](../../account-conformance-runs/2026-09-12-account-liveness-complete/README.md)
and 999 passing unit tests. The [Q follow-ups](./liveness-followups.md) now repair the large-request
cache context, reduce redundant carrier work, add bounded original-source batching and expose receive
expiry. The final campaign passes all 1,022 units and 18 liveness stages. **F-07 remains partial:**
full-history costs and supported workload/device capacity still need qualification. Historical
phase evidence and intake responses remain unchanged.

- [F packet: af8941e..96a2040](./af8941e-96a2040.md) retains its historical responses unchanged.
- [N addendum: 96a2040..1ceb88d](./96a2040-1ceb88d.md) has current responses to all 31 F status rows and
  all nine new findings.
- [P addendum: 1ceb88d..393ef43](./1ceb88d-393ef43.md) has current responses to all 11 F status rows,
  all nine N status rows and all seven new findings.
- [Original intake provenance and crosswalk](./addenda-2026-09-12.json) preserve original hashes,
  all 47 original leaf IDs, source references and that intake's assessment revision.
- [Q addendum: 393ef43..9ff48b5](./393ef43-9ff48b5.md): 30 prior status responses and eight new
  Q responses, each assessed against the reviewed tip.
- [Q intake provenance and routing](./addendum-393ef43-9ff48b5.json): original/annotated hashes,
  source pins, reproducible cache probe and unsigned commit/tree inventory. The previous manifest is
  retained as a historical snapshot, not rewritten into the latest disposition.

- [R addendum: 9ff48b5..d03e473](./9ff48b5-d03e473.md): 23 prior status responses and four R findings.
- [R intake provenance](./addendum-9ff48b5-d03e473.json) and [signing preparation](./signing-prep-2026-09-13.md).

There are **132 response blocks across the four annotated addenda and 59 distinct leaf IDs** in this
review set (the F packet's older historical responses are counted separately). F-21 is an umbrella for
F-21.1–F-21.7, not an eighth test-gap finding. Preserve F/N/P/Q/R numbering as supplied. The existing nine
aliases and the Q/R routing below share action queues without dropping separate completion criteria.
These IDs belong to the implementation review and must not be inserted into the older Stage 0
`work-items.tsv` or `debts.json` namespace. Existing formal gate debts remain unchanged.

## Priority and scope

**R intake and signing update.** The [verified signing sweep](./signing-prep-2026-09-13.md) is complete
for all thirty outstanding commits, with identical trees and reconciled current baseline references.
R-01's [bounded admission/diagnostic repair](./service-receiver-bounds.md) passes; its malicious-member
recovery disposition remains explicit under F-09. General validation integration has begun with the
five R-03/N-06 Vitest suites: 62 exact cases and explicit deadlines, with counterexample and process
controls. Remaining test/wrapper integration and R-04 are still ahead.
R-03 is another N-06/F-20 property-deadline instance. R-04 adds explicit whole-tree style-gate scope
and cleanup to F-20, with Q-08 evidence preservation. R-02 corrects current records and extends
Q-06/Q-07/P-04 signing navigation. Intent to repair is not a completed runtime change.

1. **Q-01/Q-04: bounded validation prerequisites restored.** The
   [repair record](./validation-controls.md) and [13-stage evidence](../../account-conformance-runs/2026-09-12-validation-controls/README.md)
   cover reviewed census/site pins, four manual verification/recovery entrypoints, effective omission
   controls, full affected suites and their inclusion in liveness/residue/private-release runners.
   Fresh gate execution restores traceability for the recorded tree. Each coverage guard alone still
   refuses; removing both startup/full and owner/reuse checks exposes the forbidden result. The
   review's reuse-only retarget suggestion was incomplete. Full contract/crypto/release aggregates
   remain separate F-20 work, and subsequent source edits require fresh applicable checks.
2. **F-07 remains partial: bounded Q-02/Q-03 repairs pass; retained-history/capacity costs remain.**
   [Q-03](./liveness-followups.md#q-03-result) retains warm reuse with large checkpoints.
   [Q-02](./liveness-followups.md#q-02-batching-result) reduces full loads from 36 to 31, then batches
   exact same-actor originals. The reproduced thirty-edit burst falls from 112.7 seconds / thirty
   positions to 9.7 seconds / three positions, with original coverage and cold writing intact.
   Individual edits near eighty positions still take 2.7–2.9 seconds; the admission loop is 6.1 seconds.
   Full history scans/comparisons, larger workloads and input-to-paint/capacity need qualification.
   Current publication, network re-entry, witness and commit checks remain; no unlimited liveness claim.
3. **Q-05: repaired within the private receive lifecycle.** A distinct `request-expired` status and
   closed 32-event diagnostics preserve capped automatic fresh retry. Two generated scheduler
   campaigns and three native consecutive expiries followed by automatic recovery/cold replay pass.
   See [result](./liveness-followups.md#q-05-result). No count-only terminal halt was added.
   F-10/N-08/P-07's completed refusal handling stands.
4. **F-20/N-06/P-05 inventory, bounded runner and all eleven catalogue adapters are complete; general integration remains.**
   [Current execution scope](../../release-validation-execution.md) covers all 163 catalogue cases and
   54 mutations. Catalogue phases preserve distinct source/selection/postcondition identities and
   include real browser mutation controls. Custody adds owned complete synthetic-profile copies;
   write-session repairs a BFCache load-event wait while retaining closed-capability checks. The general adapters
   now cover 191 files / 1,642 cases: all 96 Vitest files and 95 Node files. The Account authority native fixture
   adds four cases, passing in 63.453 seconds with worker/browser groups drained (Node 28.635 within
   120). Forty histories retain seed 9182026 and the 40-second bound. Native setup borrows owned CDP and
   registers cleanup early; all test bodies, identities, helpers, product, wrapper and limits are unchanged.
   Evidence covers read-only inventory/context stability, configured authority proofs, specific refusals,
   cancellation and caller mutation. Generated histories do not independently reconstruct writing or induce
   process death; input mutation does not force queued contention. All 190 prior contracts / 1,638 identities
   and exclusions remain unchanged. All 92 runner checks pass; unchanged owner controls retain prior evidence.
   Ledger orphan classification, receive headroom, capture oracle follow-ups and historical deadline evidence
   remain visible. There are 226 unresolved obligations: 67 test-file (51 Node, sixteen Playwright), 96 command
   and 63 campaign. Next is Account recovery native fixtures (one persistent-profile/virtual-WebAuthn case),
   then remaining integration, R-04, P-06 and the immutable run. Wrapper and service-only sibling credit remain
   separate; no prepared promotion, admission, index, editor/transport or personal Account result follows.
   Promotion `f59d5f2` is signed and verified; new work is uncommitted. [Evidence](../../account-conformance-runs/2026-09-14-authority-native-fixture/README.md).
   R-03 and the four N-06 property deadlines are repaired within the owned selection; full aggregate
   load validation and R-04's correctly scoped whole-tree style gates remain. Earlier
   timing observations remain host-specific; complete package/traceability/vector chains are not
   credited by these staged catalogue runs.

5. **Remaining qualification and record work stays explicit.** F-21.4's bounded packaged/migration/
   file evidence passes while physical legacy plaintext remains; wider opener/platform scope is open.
   F-09 Local salvage is partial and needs intact custody; Account/key-loss scope remains. F-16's
   scheduler is complete within scope; F-17/F-19 reductions still need workload/device/admission
   qualification. F-18/F-25 are separate measured work; F-22 is a dependency-upgrade obligation.
   Q-06/R-02 now record the verified signing crosswalk; Q-07 corrects current documentation,
   and Q-08 needs prospective evidence retention/path normalization before public sharing. F-08/N-04/
   N-09 remain disposed by v8 non-shipment. The subsequent authorized signing sweep preserves original
   evidence and moves current executable baselines to identical signed trees. No runtime repair,
   evidence deletion, external artifact store, deployment or personal-instance change occurred.

The strongest caveat to the proposed performance fix is structural: `inspectSpool` excludes ordinary
content and source capsules from its event witness; `inspectInbound` extends that witness with ledger
events. `verifyInboundCoverage` separately reconstructs content. Equality of the spool witness alone
therefore does not justify reusing all verification results after content changes/removal or compaction.
It also changes with new events, so a whole-ledger cache alone does not remove growing-history work.
Require complete invalidation, cold authentication, stale-owner refusal and corruption controls before
accepting an incremental design. Do not relax request expiry or remove projection guards by assertion.

The older packet's universal failure thresholds and endless-idle-queue claim remain unestablished:
the scheduler is single-flight and schedules idle polling after completion. The
[initial follow-up](./account-sync-liveness.md) reproduced repeated work and the now-repaired expiry
halt. Q-02 supplies a further finite-workload regression lead, not proof of those older universal
claims. Its 1,000-position timing is extrapolated; the measured/reported burst already warrants repair.
The retained ordinary-bundle workload now reproduces the 36-load/burst mechanism and records the
bounded repair's before/after results. Successful event reuse and faster burst drain do not establish
acceptable end-to-end typing capacity at arbitrary history size.

## Account v8 product disposition (2026-09-12)

The user confirms that the intermediate Account v8 paths have never held customer or personal dogfood
data and will not ship. F-08/N-04 and N-09 therefore need no further product hardening or backwards
compatibility work. This refers to the Account implementation stage, not the TRD document version.
Some v8 preparation code remains an internal dependency of the current v9 setup and its tests; removing
that scaffolding is separate cleanup. Shared code used by v9 still has to meet v9's requirements.
This disposition does not claim the old driver was fixed or that its code has already been deleted.
See the [decision journal](../../decisions.md#retire-the-intermediate-account-v8-product-paths).

## Current F dispositions

Historical responses are in the N/P packets; the latest changed-status responses are in Q. Closure credits
later committed evidence only in its documented scope. Historical annotations are not silently edited.

| ID | Current status | Importance | Related addenda / evidence |
| --- | --- | --- | --- |
| <a id="f-01"></a>**F-01** Private-envelope AAD audit | closed; [assessment](./96a2040-1ceb88d.md#assessment-f-01) | high validation integrity | —; [package.json:30](../../../package.json) |
| <a id="f-02"></a>**F-02** Storage harness import closure | closed; [assessment](./96a2040-1ceb88d.md#assessment-f-02) | high regression coverage | —; [docs/validation-baseline.md](../../../docs/validation-baseline.md) |
| <a id="f-03"></a>**F-03** Descriptor LP capacity | closed; [assessment](./96a2040-1ceb88d.md#assessment-f-03) | high capacity/correctness | —; [account-protocol/admission.ts](../../../account-protocol/admission.ts) |
| <a id="f-04"></a>**F-04** Fresh activation assertion | closed; [assessment](./96a2040-1ceb88d.md#assessment-f-04) | medium authorization contract | —; [account-service/core.ts:856](../../../account-service/core.ts) |
| <a id="f-05"></a>**F-05** Construction ownership and byte contracts | historical closure retained; current census restored under [Q-01](#q-01); [assessment](./393ef43-9ff48b5.md#assessment-f-05) | high protocol assurance | [N-07](#n-07); [docs/review/implementation/account-crypto-closure.md](../../../docs/review/implementation/account-crypto-closure.md) |
| <a id="f-06"></a>**F-06** Recovery payload vectors | closed within recorded scope; [assessment](./96a2040-1ceb88d.md#assessment-f-06) | medium-high interoperability | —; [docs/review/implementation/account-crypto-closure.md](../../../docs/review/implementation/account-crypto-closure.md) |
| <a id="f-07"></a>**F-07** Repeated full-history verification | partial; bounded reductions retained, retained-history/capacity costs remain after Q-02/Q-03 repairs; [Q-02](#q-02), [Q-03](#q-03); [assessment](./393ef43-9ff48b5.md#assessment-f-07) | high Account liveness | [N-01](#n-01), [N-02](#n-02), [P-01](#p-01); [src/crdt/accountReceive.ts:104](../../../src/crdt/accountReceive.ts) |
| <a id="f-08"></a>**F-08** Source-free reopen capsules | product disposition: v8 retired; internal setup retained; [assessment](./96a2040-1ceb88d.md#assessment-f-08) | low waste/latency | [N-04](#n-04); [src/crdt/accountReceive.ts:489](../../../src/crdt/accountReceive.ts) |
| <a id="f-09"></a>**F-09** Fail-closed diagnostics and salvage | partial; current-format Local salvage complete, Account/key-loss scope remains; [assessment](./96a2040-1ceb88d.md#assessment-f-09) | medium recoverability | —; [docs/storage-contract.md](../../../docs/storage-contract.md) |
| <a id="f-10"></a>**F-10** Service and client error classification | closed in bounded private composition; [evidence](../../account-conformance-runs/2026-09-12-failure-diagnostics/README.md); [assessment](./96a2040-1ceb88d.md#assessment-f-10) | medium operations; low direct security impact | [N-08](#n-08), [P-07](#p-07); [account-service/delivery.ts:608](../../../account-service/delivery.ts) |
| <a id="f-11"></a>**F-11** Passkey registration binding | closed; original suggested comparison rejected; [assessment](./96a2040-1ceb88d.md#assessment-f-11) | medium authorization correctness | —; [account-service/delivery.ts:147](../../../account-service/delivery.ts) |
| <a id="f-12"></a>**F-12** Unchecked PKCS#8 slicing | closed; [assessment](./96a2040-1ceb88d.md#assessment-f-12) | low portability/correctness | —; [src/account/recovery.ts:32](../../../src/account/recovery.ts) |
| <a id="f-13"></a>**F-13** Blocked compatibility open | open UX; ownership rule retained; [assessment](./96a2040-1ceb88d.md#assessment-f-13) | low availability/UX | —; [src/crdt/storageCompatibility.ts:17](../../../src/crdt/storageCompatibility.ts) |
| <a id="f-14"></a>**F-14** Scoped custody row cap | open capacity classification; [assessment](./96a2040-1ceb88d.md#assessment-f-14) | low for current single-workspace scope | —; [src/crdt/startupStorage.ts](../../../src/crdt/startupStorage.ts) |
| <a id="f-15"></a>**F-15** Reservation persistence | fixed under explicit strict-persistence assumptions; [assessment](./96a2040-1ceb88d.md#assessment-f-15) | medium cryptographic accounting correctness | —; [docs/review/implementation/reservation-durability.md](../../../docs/review/implementation/reservation-durability.md) |
| <a id="f-16"></a>**F-16** Content compaction scheduling | bounded scheduler complete; pending/proof/large-state limits retained; [assessment](./96a2040-1ceb88d.md#assessment-f-16) | medium storage/usability | —; [src/crdt/accountReceive.ts:551](../../../src/crdt/accountReceive.ts) |
| <a id="f-17"></a>**F-17** Editor projection and fork cost | partial; equivalent full-byte fast path and bounded archive memo complete, large-history/device capacity remains; [assessment](./96a2040-1ceb88d.md#assessment-f-17) | medium, potentially high with large documents | —; [src/crdt/admittedWorkspace.ts](../../../src/crdt/admittedWorkspace.ts) |
| <a id="f-18"></a>**F-18** Origin-wide journal scans | open; measure before repair; [assessment](./96a2040-1ceb88d.md#assessment-f-18) | low | —; [src/crdt/journalStore.ts](../../../src/crdt/journalStore.ts) |
| <a id="f-19"></a>**F-19** Promotion marker and request resource cost | partial; retained encoding/direct byte comparison complete, full admission/open capacity remains; [assessment](./96a2040-1ceb88d.md#assessment-f-19) | medium capacity/operations | —; [src/crdt/promotionRecord.ts](../../../src/crdt/promotionRecord.ts) |
| <a id="f-20"></a>**F-20** Validation deadlines and aggregate cost | inventory, bounded runner and all eleven catalogue adapters complete; 191 Vitest/Node files integrated, including four Account authority native cases with read-only preflight, configured authority proofs and forty observed-context/inventory histories; capture oracle limits, initial owner orphan classification and prior receive deadline headroom remain open; 226 test/command/campaign obligations and immutable aggregate remain; [graph](../../release-validation-graph.md); [Q-01](#q-01)/[Q-04](#q-04) prerequisites restored; [assessment](./393ef43-9ff48b5.md#assessment-f-20) | high before release validation | [N-06](#n-06), [P-05](#p-05); [docs/validation-baseline.md](../../../docs/validation-baseline.md) |
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
| <a id="n-02"></a>**N-02** Growing client/service verification multipliers | partial; verification reuse implemented, bounded Q-02/Q-03 repairs pass; full-history/capacity residuals remain; merged into F-07 | [F-07](#f-07) | high in the current composition; [assessment](./96a2040-1ceb88d.md#assessment-n-02) |
| <a id="n-03"></a>**N-03** Fetch holds the serialized carrier task | repaired for supported v9 read and submission waits; close/drain/current checks retained | distinct; related [F-07](#f-07) | medium local responsiveness; [assessment](./96a2040-1ceb88d.md#assessment-n-03) |
| <a id="n-04"></a>**N-04** v8 driven reopen capsule | product disposition: v8 retired; merged into F-08 | [F-08](#f-08) | low; [assessment](./96a2040-1ceb88d.md#assessment-n-04) |
| <a id="n-05"></a>**N-05** Unspecified receipt baseline hash | closed by byte-contract specification | distinct | low compatibility; [assessment](./96a2040-1ceb88d.md#assessment-n-05) |
| <a id="n-06"></a>**N-06** Loaded-host generated-property timeouts | five-suite deadline/ownership repair passes; aggregate load validation remains; merged into F-20 | [F-20](#f-20) | low validation reliability; [assessment](./96a2040-1ceb88d.md#assessment-n-06) |
| <a id="n-07"></a>**N-07** Unnamed transport constructions | closed; covered by F-05 | [F-05](#f-05) | medium-high protocol assurance; [assessment](./96a2040-1ceb88d.md#assessment-n-07) |
| <a id="n-08"></a>**N-08** Read-route and HTTP reason collapse | closed with F-10; bounded unsigned hints | [F-10](#f-10) | medium operations; low direct security impact; [assessment](./96a2040-1ceb88d.md#assessment-n-08) |
| <a id="n-09"></a>**N-09** v8 offline event hides halt reason | product disposition: v8 driver retired | distinct | low diagnostics; [assessment](./96a2040-1ceb88d.md#assessment-n-09) |
| <a id="p-01"></a>**P-01** Composed sync full-history cost and liveness cliff | partial; Q-02/Q-03 load/copy/burst and request-size repairs pass; full-history/workload qualification remains; merged into F-07 | [F-07](#f-07) | high; highest implementation priority from this intake; [assessment](./1ceb88d-393ef43.md#assessment-p-01) |
| <a id="p-02"></a>**P-02** Send progress does not expedite receive | repaired; durable progress expedites idle receive, preserving backoff/halts | distinct; related [F-07](#f-07) | low latency; [assessment](./1ceb88d-393ef43.md#assessment-p-02) |
| <a id="p-03"></a>**P-03** Remote promotion unnecessarily wakes send | repaired; native wakes match local admissions | distinct; related [F-07](#f-07) | low cost; compounds F-07; [assessment](./1ceb88d-393ef43.md#assessment-p-03) |
| <a id="p-04"></a>**P-04** Unsigned-to-signed history discoverability | documentation navigation addressed in this intake | distinct | low record navigation; [assessment](./1ceb88d-393ef43.md#assessment-p-04) |
| <a id="p-05"></a>**P-05** Aggregate validation freshness and repeated vectors | partial; merged into F-20 | [F-20](#f-20) | medium validation cost/coverage; [assessment](./1ceb88d-393ef43.md#assessment-p-05) |
| <a id="p-06"></a>**P-06** Duplicate unswept phase cryptographic prose | open documentation residual; F-05 stays closed | distinct; residual of closed [F-05](#f-05) | low drift risk; [assessment](./1ceb88d-393ef43.md#assessment-p-06) |
| <a id="p-07"></a>**P-07** Activation refusal parsed as a success object | closed with F-10; three-stage retry evidence | [F-10](#f-10) | low diagnostics; medium user recoverability at onboarding; [assessment](./1ceb88d-393ef43.md#assessment-p-07) |

## Q addendum routing and independent exit criteria

Q-02 and Q-03 extend F-07; they are not two newly numbered F findings. Q-01 and Q-04 join the F-20
validation queue with distinct inventory and mutation-control obligations. Q-05–Q-08 remain separate
because sharing a neighborhood is not sharing a fix. Every supplied Q ID remains addressable.

| ID | Assessment / intent | Work item and completion criterion | Importance |
| --- | --- | --- | --- |
| <a id="q-01"></a>**Q-01** Construction census and receipt drift | bounded repair complete; [evidence](./validation-controls.md); [response](./393ef43-9ff48b5.md#assessment-q-01) | F-20, related F-05: reviewed current classification/site pins, passing live gate, refreshed source-bound receipts and prerequisite coverage | high validation integrity |
| <a id="q-02"></a>**Q-02** Repeated loads and per-source sync growth | bounded carrier/burst repair passes; full-history/capacity limits remain; [result](./liveness-followups.md#q-02-batching-result); [response](./393ef43-9ff48b5.md#assessment-q-02) | F-07/N-02/P-01: reproducible growing-history/burst case, measured load/copy reduction, supported capacity and batching contracts with crash/invalidation controls | high Account usability |
| <a id="q-03"></a>**Q-03** Full request repeated in service-cache contexts | repaired; 64 KiB/1 MiB checkpoint warm/cold and authority-change controls pass; [result](./liveness-followups.md#q-03-result); [response](./393ef43-9ff48b5.md#assessment-q-03) | F-07: authenticated compact context, representative checkpoint/row sizes, warm/cold equivalence and authority-change refusal; related F-19 | medium performance, early repair |
| <a id="q-04"></a>**Q-04** Three stale mutation controls | bounded repair complete; both coverage paths exercised; [evidence](./validation-controls.md); [response](./393ef43-9ff48b5.md#assessment-q-04) | F-20/F-21: executed-path controls actually expose forbidden outcomes, useful anchor failures, affected suites and downstream aggregate pass | high regression assurance |
| <a id="q-05"></a>**Q-05** Receive expiry loses its reason | repaired: explicit retry reason, bounded diagnostics, generated backoff and native consecutive-expiry recovery pass; [result](./liveness-followups.md#q-05-result); [response](./393ef43-9ff48b5.md#assessment-q-05) | distinct, related N-01/F-10: visible bounded reason and diagnostic, repeated expiry then recovery; no count-only terminal halt | low-medium operations |
| <a id="q-06"></a>**Q-06** Current unsigned-chain discoverability | addressed for the thirty-commit chain; verified crosswalk and retained originals; [response](./393ef43-9ff48b5.md#assessment-q-06) | distinct, related P-04: retained original IDs/trees, verified signatures, crosswalk and current executable baseline migration; receipts unchanged | low provenance |
| <a id="q-07"></a>**Q-07** Committed work described as uncommitted | corrected in current navigation/measurement docs; [response](./393ef43-9ff48b5.md#assessment-q-07) | distinct from P-06; prior historical packets and completed entries preserved | low accuracy |
| <a id="q-08"></a>**Q-08** Archive growth and absolute personal paths | confirmed; prospective policy work open; [response](./393ef43-9ff48b5.md#assessment-q-08) | distinct, related F-20: bounded/deduplicated retention and normalized publishable copies, durable hash-verified raw evidence before relocation, Git-history disclosure decision before public sharing | low cost; medium publication privacy |

## R addendum routing

| ID | Current disposition | Shared queue and separate completion criteria | Importance |
| --- | --- | --- | --- |
| <a id="r-01"></a>**R-01** Service/receiver envelope limits and lost inbound cause | bounded repair complete; [result and residual trust/recovery limits](./service-receiver-bounds.md); [response](./9ff48b5-d03e473.md#assessment-r-01) | distinct availability repair; diagnostics related to [F-10](#f-10). Shared wire policy, sender/count/decoded bounds, effective edge controls, no accepted-prefix advance on refusal, bounded visible terminal cause, and an explicit already-accepted bad-position recovery/trust policy. Service cannot validate ciphertext semantics. | high before durable Account cutover; medium present exposure |
| <a id="r-02"></a>**R-02** Stale commit state and signing inventory | addressed for this chain: current records corrected, all thirty replacements verified and workflow reconciled; [response](./9ff48b5-d03e473.md#assessment-r-02) | Q-06/Q-07 and P-04; all thirty signatures/tree pairs, retained old objects, current reference migration, source-equivalent executable baselines and a committed crosswalk. Historical intake snapshots remain unchanged. | low records; aggregate provenance prerequisite |
| <a id="r-03"></a>**R-03** Batch generated-property default deadline | bounded repair complete: explicit 60-second property / 180-second owned file stage; unchanged 120 histories; [result](../../release-validation-execution.md#vitest-property-adapter--phase-2m); original [response](./9ff48b5-d03e473.md#assessment-r-03) | N-06/F-20; finite measured property deadline and owned outer stage, unchanged 120 histories/seed, duration and failure/counterexample retention. A passing idle run does not close it. | low test robustness; aggregate prerequisite |
| <a id="r-04"></a>**R-04** Whole-tree style commands fail | reproduced: 83 lint errors and 1,170 format files; [response](./9ff48b5-d03e473.md#assessment-r-04) | F-20 integration, related Q-08; explicit immutable-archive scope, repair live files, retain active documentation gates, execute/report full commands independently of scoped checks. Never reformat hash-pinned evidence to make a style check pass. | low housekeeping; medium validation credibility |

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

<a id="q-06-intentionally-unsigned-current-chain"></a>

## Q-06: historical snapshot and current signing boundary

The user explicitly authorized intermediate unsigned commits after signed `1372c39`. **The following
eleven-row table is the Q intake snapshot at `9ff48b5`, not the current chain.** At R intake `6ba7c22`
there were thirty unsigned descendants. After explicit keyboard confirmation, all thirty were signed
and verified; their signed tip is `3e53b4a` with the same tree. The [crosswalk and completed sweep](./signing-prep-2026-09-13.md)
preserve old IDs, every identical tree and current reference dependencies. There is no remaining
signing debt for that selected chain.
The two phase records already state that policy; the [decision entry](../../decisions.md#record-the-authorized-unsigned-phase-boundary)
and [Q provenance](./addendum-393ef43-9ff48b5.json) make its boundary and full commit/tree IDs local to
the repository. The external signing reminder was observed ACTIVE during intake; it is a convenience,
not a gate. That historical intake performed no signing; the user subsequently requested its unsigned commit.
The later signing result is recorded above, while the original intake JSON remains intact.

| Phase | Unsigned commit |
| --- | --- |
| Liveness measurement | `0e07fe4` |
| Complete verified view | `280221e` |
| Incremental verification | `879ce38` |
| Owned HTTP wait and expiry retry | `902d352` |
| Scheduler wakes and service reuse | `f42b4a7` |
| Privacy evidence | `67304f3` |
| Failure diagnostics | `8ebccfd` |
| Partial Local recovery | `01b3036` |
| Content maintenance | `70e6d5b` |
| Projection reductions | `063cd72` |
| Retained marker | `9ff48b5` |

At Q intake, all eleven listed commit objects lacked a signature header. The review intake itself
was subsequently committed unsigned as `409fbd0`, making twelve descendants at that historical
checkpoint. The original Q manifest remains an unchanged snapshot of its eleven-commit boundary.
The completed signing sweep retains original evidence IDs/hashes and adds old/new commit and
identical-tree mapping, as for P-04. Source-equivalent executable baseline substitutions and generated
plans were checked separately. Historical receipts were not rewritten; a new revision-bound aggregate
must execute for its selected inputs. This closes the recorded chain, not signing obligations for
future work.

## Original intake limits

Source inspection and historical artifact readback support these dispositions. The reviewer-reported
benchmarks were not independently rerun, and no finding was dynamically reproduced in this intake.
No SECURITY.md applies; `docs/storage-contract.md`, the Account phase/byte contracts and the private
entrypoints supply scope. Code reachability does not establish an unauthenticated attack: the Account
surface is private and operator-gated, and no real Account is active. The neutral residue archive and
existing source pins are unchanged; review documentation changes do not retroactively expand their scope.

The two root packets were moved here after annotation. The unrelated root file `done ` is untouched.
No production code, tests, wire bytes, personal installation, server, factor, origin, routing or formal
Stage 0 gate debt was changed. That intake was committed in `1372c39`; the later Q intake is separately documented above.

- [F-09: authenticated partial Local recovery evidence](../../account-conformance-runs/2026-09-12-local-recovery/README.md).

- [F-16: automatic maintenance evidence](../../account-conformance-runs/2026-09-12-content-maintenance/README.md).

- [F-17: measured equivalent projection evidence](../../account-conformance-runs/2026-09-12-editor-projection/README.md).

- [F-19: retained marker encoding and profile evidence](../../account-conformance-runs/2026-09-12-retained-marker/README.md).
- [Q-01/Q-04: restored validation controls](./validation-controls.md).
- [Next work: remaining liveness before release qualification](../../private-release-validation-prep.md).
