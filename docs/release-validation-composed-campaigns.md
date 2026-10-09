# Composed Account campaign integration

**Paused by the operator, 2026-09-16.** Release validation began prematurely; the product is not
close to releasable. The plan below is retained for later reassessment, not active marching orders.
Do not start its next phase or infer that validation must precede the next product work.
[Pause decision](./decisions.md#2026-09-16--pause-the-release-validation-campaign).

Preparation at signed `3af765d3` (2026-09-16). This is a contract and dependency plan, not an
execution receipt. **108 obligations remain: 70 command and 38 campaign rows.** The complete
population remains 629 obligations, 292 required test files and 2,203 general case dispositions
across 272 files (11 explicitly not applicable).

## First pilot: account isolation

Preserve the wrapper's order, Node file concurrency of one, spec/JUnit reporting and original
300-second child deadlines. Its 44 commands comprise the following nine Node groups, inventory,
authority, typecheck, 30 vector commands, lint and format. The exact argv, file hashes, case IDs,
historical inputs and namespaces are in the [static inventory](./account-conformance-runs/2026-09-16-composed-campaign-prep/inventory.json).

| Node child / report namespace | Required files | Cases | Contract boundary |
| --- | ---: | ---: | --- |
| registry | 2 | 13 | First-authority registry and crypto-preparation probes |
| isolation | 5 | 23 | Neighboring capabilities, recovery, generated histories, omissions, process death |
| admission | 4 | 34 | Core, controls, restart and native |
| activation | 4 | 25 | Core, controls, restart and native; no standalone reproduction command |
| account-core | 4 | 28 | Core, properties, controls and restart; no core native child |
| recovery | 5 | 24 | Core, crypto, properties, controls and restart; no recovery native child |
| handoff | 3 | 21 | Core, ES256 and native |
| service-delivery | 4 | 32 | Core, generated, controls and restart |
| bounds | 1 | 5 | Protocol only; no bounds reproduction or native child |
| Total | 32 | 205 | Exact child census, independently of other campaigns |

The current service-delivery array also names `test/account-service-delivery/native.test.mjs`.
Remove that one entry when integrating the pilot: the existing manifest explicitly retires this
v8 HTTP bridge, and `9234a706` already removed it from its owning wrapper. Preserve its historical
source and the exclusion. Do not revive v8 support or remove the four live service files; v9 sync
interoperability remains required in its own campaign. The 205 figure excludes only that retired file.

The wrapper already uses `$REPORT/<child>` for auxiliary reports; retain it. Add ordered,
nonce-bound root tracing and a distinct `case-reports/<child>.json` for each Node group. Root
summary/JUnit counts corroborate the terminal case reports; they do not replace them. Inventory,
authority, typecheck, vectors and style commands are exit checks, not fabricated test cases.
Execute every original prerequisite in this pilot. Future reuse requires matching complete input,
environment, invocation and postcondition identity; overlapping source filenames alone confer no credit.

Use fresh execution checks for these invoked historical inputs: `280f616:src/crdt/promotionRecord.ts`,
`beed8cf:src/crdt/promotionRecord.ts`, `2cb42a2:account-service/core.ts`, and both admission protocol
and service authority at `6398e33`. Do not require activation's 26-file historical reproduction or
bounds' historical browser owner here: those commands are absent. Current dependencies remain bound
through the runner's ordinary inputs. Bind and recheck the wrapper's original broad source inventory;
do not narrow it to the newly changed files. Use the owned disposable Chromium fixture for the three
selected browser files, inherit the supervising process group, and reconcile only after all producers
drain. Standalone behavior must remain usable. No personal browser or server participates.

## Prerequisite: separately bounded report namespaces

The existing single-set limit is 4 MiB. Four preserved outputs alone total **5,932,919 bytes**:
activation's generated histories, service delivery's generated histories, and bounds' long histories
and generated codecs. Their hashes, receipt identities and sizes are [recorded](./account-conformance-runs/2026-09-16-composed-campaign-prep/report-size-sample.json).
These are historical samples, not a measurement of the combined campaign or a future size guarantee.
Other reports, logs, source inventories and case reports add bytes. A flat single-set adapter is
therefore an unsuitable design even before the first pilot run.

The next bounded phase implements an opt-in **namespaced file-output contract**. Keep the existing
single-set policy and its 4 MiB ceiling unchanged. Declare a finite set of child directories, each
with its own required files, byte/entry/depth limits; separately bound root metadata and case reports.
Add a finite parent byte/entry cap as well: child limits alone must not permit an unbounded number
of groups. Plan against a maximum 16 MiB parent allowance for this first pilot, with exact per-child
allocations reviewed before activation. This is a new composition contract, not a claim that the
old 4 MiB gate passed. A later overrun must retain its failed evidence and trigger diagnosis.

Preserve traversal protections against links, special files, path escape and producer races. Retain
complete inventories and artifacts under the original child paths after checkout removal. Receipt
identity/reuse must include the entire namespace contract. Missing, crossed, duplicated or unexpected
namespaces, byte/entry exhaustion, stale nonces and altered retained content must refuse. Bounded
partial inventory on a failure remains a failure. Generated path/budget cases and deliberate omission
controls should prove the shared custody checks discriminate before a real composed campaign uses them.
Do not compress away a semantic report or drop observations merely to fit a cap.

## Pilot's semantic qualification

Reuse the existing pure family reconcilers where their observed report population matches these
children; separate semantic reconciliation from owning-wrapper summary/source checks where needed.
Do not synthesize a standalone-wrapper receipt: this pilot has different argv, grouping and coverage.
Account-core omits native; recovery omits native; bounds omits native and reproduction; activation
omits reproduction. In particular, recovery must not require its absent `recovery-profiles.json`.
Check the actual report writers before fixing each namespace's required-file list.

Isolation's current reports have genuine observations in the matrix but success-only labels in
several controls/restart rows; its generated report stores commands and final states, while the
existing test oracle checks full durable rows during execution. Add observed baseline/mutant results,
before/after neighboring inventory bindings, death/cold retry observations and generated transition
evidence. Keep the original crypto and full-row assertions authoritative. State the scope of any
additional reconciler precisely; a report label does not independently prove isolation or durability.

Qualification must include exact child order/argv/deadlines and all 205 cases, all prerequisite exits,
current and historical source agreement, report retention after checkout removal, process drain,
exact reuse, corruption controls and two discriminating omitted-check variants. Preserve failures.
Choose and record a finite whole-campaign deadline prospectively, within the runner's existing one-hour
maximum; do not sum 44 five-minute bounds into an unreviewed allowance or increase time after a failure
without diagnosis. Scoped lint/format here does not discharge R-04 whole-tree style work.

## Following composed campaigns

Reservation-durability is separate: **50 commands**, 15 directly selected Node files /133 cases,
three nested Local component runners (custody/content/content-trim), the full Vitest suite and shared
checks. Style commands also name a test file, but do not execute its cases. The static inventory
does not count the nested components or full unit suite as zero-case passes. Their exact invocation,
catalogue/mutation reports, process ownership and descendant receipt custody need their own contracts.
Do not label those nested test-producing commands as mere successful exits in a release adapter.

After the namespace prerequisite and isolation pilot, adapt remaining composed families serially:
contract/oracle groups, reservation/nested components, then audit/liveness/residue/private-release
composition according to each dependency map. Existing leaf coverage remains useful for diagnosis,
without discharging the separate wrapper obligations. Remaining standalone commands, host-Python
binding, owner/headroom observations, R-04/P-06 and immutable aggregate qualification still apply.
The failed F-17 application gate and explicit RC debt remain unchanged. Private Account rehearsal
and the human recovery/adoption milestones follow acceptable immutable validation.
