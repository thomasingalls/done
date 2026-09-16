# Backend phase two: successor admission without interrupting the existing writer

2026-09-16. Defined against signed `d015210e`. **Chunks A/B complete; C/D remain.**
Release validation remains paused. This is the next phase after
[authenticated enrollment preparation](./account-enrollment-prep.md), not the complete second-device flow.

## Outcome and boundary

Consume one live, authenticated preparation and durably admit its exact device credential into a
successor authorization epoch. The creating device must still be able to send its queued writing,
receive accepted history and cold-open its workspace. The new credential remains **service-admitted,
not certified**: no content key, slot, ciphertext read or accepted publication follows from admission.

The first supported transition is deliberately **epoch 1 to epoch 2, adding one pending device**.
Generation, acceptance key, principal, existing credential rights, certified recipient set and recovery
state stay unchanged. Reject another successor, recipient change, removal, key rotation, recovery
replacement or retirement as unsupported. This is a private development boundary, not the eventual
product's device limit. A completed second enrollment and general epoch transitions follow separately.

The first device need not be online when the service commits admission. When it reconnects, its owner
adopts the verified successor and resumes sync. A brief sync pause during adoption is acceptable;
locally durable writing remains available. Neither server success nor a new head permits dropping or
rewriting queued envelopes. Do not require draining the first device as an enrollment prerequisite.

No Account buttons are enabled, no real account or personal device is used, and no deployment is part
of this phase. The author's old second device will eventually adopt the first device's workspace
without importing its old writing.

## What inspection establishes

| Existing boundary at `d015210e` | Consequence for this phase |
| --- | --- |
| `account-service/enrollment.ts` retains preparation, exact candidate and current-authority token, but cannot consume a receipt for admission. | Recheck and consume the retained live operation; an independently valid historical receipt is insufficient. |
| `account-service/delivery.ts` reconstructs authority from the original promotion receipt. Its census verifies all rows under that authority; inbound reads also require epoch 1. | Replacing only the current tip would make historical rows fail verification as well as interrupt new submissions. Separate historical verification from current eligibility. |
| Delivery decisions and witnesses belong to one creating publisher, with an account-keyed SQL ledger. | Keep that publisher boundary. Admission does not justify adding a second ledger or resolving an arbitrary roster key. |
| `account-protocol/positionDecision.ts` checks an accepted head against the supplied authority tip. `submission.ts` constrains refusal successors too. | Introduce explicit historical/current contexts; do not globally relax equality to `<=` and assume lineage validation happened elsewhere. |
| The supported v9 path derives its head from promotion: `accountStartup.ts`, `inboundLedger.ts`, `accountReceive.ts`, `accountInbound.ts` and their delivery/spool dependencies. | A service-only change is not an end-to-end completion. Add owned successor installation, request construction and cold-reopen behavior to v9. Do not revive the retired v8 application. |
| `test/enrollmentStates.test.ts` separates admission from certification, but its `admit` step does not advance an authorization epoch or model delivery. | Keep its useful second-gate assertions; it does not establish this transition's writer continuity. Add a model with those missing states. |

## Protocol rulings needed before implementation

### Carry an unchanged certified set forward

TRD §13.6 permits account-authorized admission without an existing device online. However, the
client approval in §13.5 binds the certified set's original `parent_epoch` and `next_epoch`.
The service cannot ask that old signature to certify a new epoch pair or mint a replacement approval.

For this **admission-only** successor, carry the complete original certified object unchanged,
including its original approval context, and bind its digest in the new service-signed epoch.
Verify the original approval at its origin and equality with the parent's effective certified set.
There is no new recipient-set activation and the new candidate is absent from that set. The roster's
admission entry and the effective certified set are distinct inputs, with distinct authorities.

This is a necessary clarification of the two-gate contract, not permission to carry a set through
removal, rotation, recovery replacement or a change of certified keys. Those transitions need their
own client-authorized successors. FirstEpoch and existing first-certification signed bytes stay intact.

### Preserve already-sealed edits across this compatible transition

A generation-preserving admission does not revoke the creating device's permission to publish.
Permit its exact epoch-1 envelope at the next unresolved position after epoch 2 commits, provided
the verified parent-to-child transition preserves its identity, keys, capabilities, generation and
acceptance key. New acceptance is issued under the current epoch. The original envelope still says
epoch 1; the service never re-signs it, changes its AAD or creates another digest at its position.

This is an explicit, narrow compatibility rule, not blanket acceptance of ancestor-epoch writing.
It does not cover revocation or generation changes. Existing permanent refusals, issued refusal
parents, accepted conflicts and per-position uniqueness still apply. Historical generation-mismatch
refusals remain permanent. Re-minting, where licensed by a verified definite refusal, still needs an
owned current-authority route and fresh nonce allocation; admission or an unsigned error is no licence.

The service cannot infer when an offline client sealed an envelope. Eligibility follows the verified
compatible epoch/credential, not a claimed creation timestamp. Include work sealed by a still-stale
client after the service transition, and an exact epoch-1 refusal successor already retained by that
client. Validate its issued-parent relationship in the proper historical context, then apply current
eligibility; the existing `submission.ts` current-tip restriction cannot simply be left in that path.

After adoption, newly minted envelopes use epoch 2. Already persisted epoch-1 envelopes keep their
bytes. Captured local edits without a minted envelope may be sealed under the adopted epoch. Batch
boundaries follow the authority change. Do not reset envelope positions or cryptographic counters.

### Keep historical evidence distinct from current eligibility

Retain original acceptance/refusal bytes and verify them against their authenticated issuance context.
A successor neither invalidates accepted history nor makes every old proof current authority. Check
the actual parent chain and the successor's accepted-head vector, including links at its boundary.
Reject omitted streams, forks, changed prefixes and an acceptance head claiming issuance in an old
epoch beyond that epoch's recorded boundary. An old envelope newly accepted under epoch 2 is a
different case: its acceptance head names epoch 2. Missing history needed to check a boundary is a
catch-up requirement, not successful verification.

Current reads and new decisions use current eligibility. Historical exact retries remain resolvable
without rewriting the stored decision. Specify the distinction in the delivery verifier/API rather
than overloading its single `DecisionAuthority`. Acceptance-key rotation is unsupported here; the
unchanged key does not excuse omitting the ancestry or boundary checks.

## Successor artifact and current-authority owner

The first implementation chunk freezes exact bytes, closed parsers and finite bounds. Use a distinct
successor kind and fixed-purpose signing, not an enlarged `FirstEpoch` union that quietly accepts old
messages as new ones. Preserve all current first-authority fixtures byte for byte.

The authenticated successor must bind:

- The independently pinned service, account, workspace, principal, lineage, parent head and epoch,
  successor epoch and transition kind.
- The exact prepared candidate and preparation receipt/attempt identity, with its original expected
  parent. Candidate credential IDs cannot alias the creating member or another reserved identity.
- The complete resulting admitted roster, with the original rights preserved and the added candidate
  explicitly pending content certification. Authorization does not confer recipient eligibility.
- The unchanged generation, acceptance public key, effective certified object and recovery digest.
- The accepted-head vector captured at commit: the creating publisher's verified position/link and
  the admitted candidate's explicit position-zero/zero-link entry. Include the creating zero entry if
  no delivery exists. First-genesis `heads: []` is not a successor encoding.

Hash the canonical signed successor message to name its head; fix ordering, duplicate rejection,
integer/ID/key encodings, signature coverage and namespace rules with independently encoded fixtures.
No key supplied alongside the artifact becomes a trust root. A service-authored pending key cannot
become an approver of its own certified membership.

Retain the original promotion receipt as immutable genesis evidence. Add an append-only successor
record plus one durable current pointer in the same SQLite owner. All callers resolve current
authority through that owner; no fallback to genesis after a malformed/missing successor. An absent
pointer may denote untouched genesis only in the explicitly specified schema state. Schema upgrade
must be explicit and preserve existing ciphertext, witnesses, account records and key custody.

The service's signed history establishes integrity and ancestry, not protection against rollback of
an entire otherwise self-consistent service database. A returning client's retained head provides the
existing rollback anchor. Do not claim a SQLite commit or a signed pointer supplies an external anchor.

## Admission transaction and retry semantics

Use the preparation retry capability plus exact attempt/receipt identity to request consumption;
never accept a receipt alone or the private operator bearer as account authorization. No second
WebAuthn prompt is required while the authenticated preparation remains live. No silent renewal or
rebasing is allowed.

Copy and bound inputs before crypto. Verify the retained preparation, genesis/current authority,
candidate proof bindings and complete current delivery census outside a write transaction. Then, in
one `BEGIN IMMEDIATE` transaction:

1. Recheck the preparation is prepared, unconsumed, uncancelled and unexpired, and the account/passkey
   and exact expected parent remain eligible.
2. Recheck the authority and delivery snapshot used to construct the head vector. An ordinary edit
   may require rereading/rebuilding the vector; it does not stale the user's preparation.
3. Append the signed successor, consume the preparation, save the immutable admission result and
   advance the current pointer together. Record the delivery boundary/witness transition atomically
   too; it must not leave old rows unverifiable. Publish success only after commit.

Two candidates prepared against one parent compete for one committed successor. The loser becomes
stale and cannot be silently rebound; a fresh preparation needs a fresh credential under the existing
reservation policy. That rule concerns the **first gate**, not the later SAS-approved sibling repair.

An exact retry after commit returns the same admission artifact, including after preparation expiry,
service restart or a lost reply. A changed target/candidate/receipt conflicts. A pre-commit cancel wins
against admission; after commit, cancellation must report that admission already occurred and cannot
erase or revoke it. Preparation's old `resume` response must not misleadingly label a consumed success
as merely stale because its own operation advanced the head. Preserve historical preparation receipts
and give consumption an explicit retained/API disposition.

No partial mutation on capacity refusal, verification failure or commit abort. Bound snapshots,
requests, responses, retained rows and retry work. Keep the existing preparation caps; the supported
transition admits at most one successor. Any delivery-history work inherits the current bounded
delivery policy rather than loading an unbounded new chain.

## Existing-device adoption is part of the exit boundary

Add an authenticated, bounded way for the creating device to request the successor from its retained
head. Bind the response to the exact workspace/lineage and request; verify the root signature and
parent locally. Discovery is a locator/freshness transport, not authority obtained from an error body.
The request proves possession of the retained creating credential; accepting its verified parent-head
context for discovery must not authorize ciphertext reads by an uncertified candidate. Pin the exact
discovery request/response purposes, nonce and size bounds in chunk A. A relay can withhold it; this
phase does not promise progress through a partition.

Under the existing lifecycle permit, adopt the successor only after checking continuity and any
required accepted-prefix evidence. Persist the newest verified head and its evidence before using it
for publication. Preserve the original promotion/slot binding as historical custody evidence; do not
forge a replacement first-epoch binding. Cold startup must resolve the same effective current authority
and retain every pending journal/capture/spool item. A killed install must recover to the old complete
state or the new complete state, never a head with incompatible delivery records.

Rebuild asynchronous receive/send contexts after adoption. Before committing late work, recheck the
owned head and lifecycle. A late epoch-1 reply can be verified as historical evidence where appropriate;
it cannot roll back the installed head. Do not close the editor or erase an edit because network
authority is catching up. If storage cannot commit the adoption, retain the old durable state and
report sync blocked rather than reporting enrollment/sync completion.

## Reviewable implementation chunks

| Chunk | Result | Exit evidence |
| --- | --- | --- |
| A — complete | Pure admission-only successor types, exact byte contract, carry-forward and ancestry verifier. No endpoint advances a live head. | Independent fixtures; per-field and per-signature substitutions; unchanged first-epoch fixtures; zero/omitted/duplicate stream cases; hostile service adding itself to recipients refused. New crypto constructions remain open until qualified. |
| B — complete | Durable current-authority service owner and creating-publisher delivery across the transition, exercised by disposable fixtures. | Atomic head-vector capture; historical read/retry; exact old-envelope acceptance and new-epoch continuation; concurrent delivery/admission; cancellation, restart and lost replies. No new publisher or content-key delivery. |
| C | Supported v9 owner adopts/reopens the successor and resumes both delivery lanes. | Native tests with local edits, an exact retained outbound, a lost accepted reply, in-flight receive and a cold restart on each side of installation. Source content, counters and prefixes agree after convergence. |
| D | Enable private preparation consumption/discovery only with both owners integrated; retain focused evidence and checkpoint. | Through the real private adapter, prepare/admit/reconnect the creating client, continue writing and refuse the candidate's read/write/key requests. No ordinary application activation. |

Do not describe B alone as completing the phase or expose admission in the ordinary product before C.
Each chunk gets focused checks and a reviewable commit; no wrapper campaign or frozen release-manifest
refresh. Crypto qualification is a separate tracked obligation, not inherited from old closure.

## Tests that can disprove the design

Add an independent state ledger with separate current head, effective recipients, preparation state,
consumption, accepted stream, exact pending envelopes and each client's retained head. Generate
interleavings of prepare/finish/cancel/admit, old/new submission, refusal/retry, read, disconnect,
adopt and restart. Observe production state/bytes; do not reconstruct the oracle from the same parser.

Directed cases must cover an edit committed between snapshot and admission; two service processes
racing for the parent; cancellation/expiry after verification; a lost admission reply; process death
before/after the atomic commit; an old envelope accepted before admission whose reply is lost; one
accepted only afterward; a permanent refusal crossing the boundary; historical ledger damage; missing
successor/pointer; a fork/ancestor response; and new-device read/write refused despite a valid admission.
Browser cases must include crash/reopen and asynchronous replies arriving after head adoption.

Require effective omitted-check controls for final parent/delivery-snapshot comparison, certified-set
carry-forward and client rollback rejection. A control must independently demonstrate the forbidden
signed result, lost work or installed rollback. Timeout, parser rejection and unrelated failure are
not evidence that the control worked. Preserve generated failures and shrinking seeds.

## Later gates remain explicit

Service admission is not the five-character ceremony, wrapping-key installation or certification.
The later content-approval phase must resolve a separate seam: row 11 requires restarting a ceremony
when its epoch changes, while §13.6 allows an installed sibling's pending certificate to be rebuilt
against the winner. The existing model omits transcript bytes, so it does not settle which exact
authenticated continuity checks let that rebase preserve the prior human approval. Define that rule
before implementing sibling repair; do not silently reuse a SAS for a substituted head or recipient.

Then come durable key delivery and countersigning, certified activation, new-device local custody and
encrypted bootstrap, multiple-publisher service/client delivery, and the author's adoption walkthrough.
Revocation/rotation, lost-device recovery, production account sessions/provisioning and operations remain
product work. Release-validation resumption needs a later explicit decision. Platform-specific UX stays
post–first-RC.

## Chunk A outcome

`account-protocol/successor.ts` defines the distinct epoch/artifact and nonce-bound creating-device
discovery request/response. It verifies unchanged recipient authority and signed lineage continuity,
captures caller inputs before crypto and returns detached frozen results. The pending device has no
capabilities. Actual live consumption, ledger correspondence and installation remain owner obligations.
[Exact bytes](./account-crypto/admission-successor.md);
[32 passing focused tests and evidence](./account-conformance-runs/2026-09-16-admission-successor/README.md).
Next: chunk B, durable service current authority and creating-publisher delivery continuity.

## Chunk B outcome

The internal service owner consumes exact live preparation, commits one successor/current pointer and
delivery witness together, and returns the immutable artifact on retry. It retains the prior ledger
witness at the transition boundary, including refused events, and verifies historical decisions under
their issuance epochs. Exact old envelopes and refusal successors can continue; only the creating
publisher/reader is eligible. Schema 7 is explicit; post-consumption preparation views say `admitted`.

Pass 198 focused Node and two diagnostics cases, including 29 new service cases with 60 shrinking
histories, four SIGKILL boundaries, three cross-process races and two effective omission controls.
[Service byte/storage contract](./account-crypto/admission-successor.md#5-durable-service-consumption-and-delivery-chunk-b);
[evidence](./account-conformance-runs/2026-09-16-successor-service/README.md).
The HTTP route remains disabled. Next: chunk C, supported v9 client adoption and cold reopen.
