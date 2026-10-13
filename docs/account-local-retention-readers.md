# Baseline-plus-suffix reader inventory — 2026-10-13

Source boundary: signed **`bcca1aa1`**, the [private fences implementation](./account-local-retention-fences.md).
This is a source audit and implementation plan. No reader is activated here, no logical history is
deleted, and no performance improvement is claimed. The [exact deletion plan](./account-local-retention-deletion.md)
depends on closing the adapter gaps below. Public activation and release validation are separate.

## The distinction that governs the inventory

The pure `replayLocalBaseline` reader can reconstruct and verify a retained origin plus suffix.
The real carrier does something different today: `contentStore.openSnapshot` opens **every physical
row**, invokes the ordinary validator, and then calls `verifyCompleteLocalBaseline`. That helper
compares a full replay with a baseline replay and returns no replacement read model. Callers still
receive the full rows. A successful anchored lifecycle test therefore does not establish that its
reader works after removing predecessors.

There are four explicit full-spool fences: `verifySpoolWitness`, `verifyInstalledSuccessor`,
`verifyInstalledMembership`, and `verifyDetachedPrefix`. Keep them on full-history entry points.
Do not delete the guards and let their zero-origin arithmetic operate on a suffix.

The adapter must distinguish:

- **Physical inventory:** exact store/key/sealed-row tuples, counter and baseline chunks. Used for
  allocation, comparison, rotation, shape checks and deletion. Missing rows are never synthesized.
- **Authenticated replay origin:** baseline identity, cut/witness, authority state, source originals
  and consumed indexes, terminal proofs, checkpoint cuts, and snapshot. Obtained by decrypting and
  authenticating the independently pinned baseline under fresh complete custody.
- **Logical read result:** snapshot plus suffix content, source catalogue, spool/delivery/receive
  states and authority continuation. It may contain baseline-carried originals and an in-memory
  snapshot; these are not new physical rows or allocations. The pure reader's `seq: 0` snapshot
  must never reach placement validation or a write/delete API as a stored record.

Use an internal owner-scoped result/capability for the last two. Do not overload a generic
`OpenedRecord[]` to mean either complete physical history or a trusted summary depending on context.
Fresh custody authentication still belongs to each owner/operation. Derived caches are subordinate
to the pinned baseline, authority identity and lifetime; callers keep detached copies or bounded
synchronous selection leases. A callback's `verified: true` is not an authentication boundary.

## Reader and writer-consumer inventory

Paths below are relative to `src/crdt/` unless prefixed otherwise. Symbols are the lookup anchors
at the pinned source boundary. “Adapt” means required before a supported owner may delete history;
“preserve refusal” is deliberate, not a missing generic decoder.

| Consumer and source anchors | Current use of history | Required disposition |
| --- | --- | --- |
| Carrier: `contentStore.openSnapshot`, `load`, `withBaselineCensus`; `localBaselineStorage.readEncryptedBaseline` | Full physical open, ordinary validator first, then mandatory full/baseline comparison | **Adapt first.** Authenticate representation and anchor before selecting full or reduced replay. Expose physical and logical results separately. On complete-history profiles retain the full comparison oracle; never silently rebuild a bad anchor from intact rows. |
| Metadata and classification: `localBaselineMetadata`; `localBaselineAnchor`; `startupClassification.contentCensus`; `localGenesisStorage.localCensus` | Private v3/v4 normalize allocation to semantic v2 while pinning `history: complete`; Account claim census opts in | **Adapt.** Recognize the new reduced representation only on an authenticated Account route; keep its pointer/era in every MAC/write. Classification can recognize a supported shape but cannot authenticate or authorize it. Unsupported versions must refuse before journal access or admission. |
| Pure replay: `localBaselineReplay.replayLocalBaseline`; `localBaselineAuthority.verifyBaselineAuthority` | Seeds own/peer origins, exact terminal proofs and source consumption; checks suffix witness, authority cuts, coverage and checkpoint evidence | **Reuse and expose through the owner.** This is the verification core, not an independently authorized loader. Keep scope, anchor, pending-dependency, historical key and lifetime checks. |
| Original cold open: `accountStartup.verifyAccountUnderPermit`; `custody.withRecoveryUnderPermit` | Rebuilds zero-origin census twice for verification/recovery; full successor and optional detached checks; compares admitted genesis/catch-up coverage | **Adapt.** Pass the authenticated logical replay to recovery and the correct retained authority proof to validation. Preserve genesis/catch-up coverage and source identity checks. The initialization/recovery owner and later editor owner each authenticate their own lifetime. |
| Joined/replacement/recovered cold open: `joinedAccount.verifyJoinedAccount` | Active phase independently verifies spool, membership, receive and installed snapshot, then projects the journal | **Adapt active phase.** Preserve local-store versus account identity bridge, initial epoch/generation, installation snapshot and detached checks. Do not run the initial-install expected-row test on an active reduced profile. |
| Live original/joined v9: `accountReceive.openAccountReceiveOwner`, extension `validate`, `inspectCensus`, `state`; separate receive-store facade | Full validation/audit and fallback `inspectInbound` start at zero, although installed anchors are additionally checked by the carrier | **Adapt all modes**, including reference mode and non-composed receiving. No fallback may parse the suffix as a complete ledger. Use one baseline-aware reference result; install incremental state only from that result. |
| Source recovery/flush: `accountCapture.recovery`, `persist`, `sourceRecords`; `sourceCapture.capturedRecovery`, `capturedSourcePresence`; `custody.attachJournal` | Catalogue deduplicates journal capsules by ID **and exact bytes** from supplied records | **Adapt catalogue input.** Include all baseline-carried unconsumed/partial originals plus suffix originals. Verify journal scope/era before deduplication. Fully retired IDs need not remain because the empty-journal/era transition excludes their old journal copies. Never infer identity from snapshot coverage. |
| Synchronous admission and export: `admissionDocument.replayRecovery`; `admissionQueue`; `admittedWorkspace`; `export.exportEntries` | Initial recovery consumes content records; active editing/undo/export consume the live document | **Adapt initial projection only.** Supply the authenticated snapshot plus suffix content and same-era pending journal. Retention must not swap the running Y.Doc, emit a content revision, reset UndoManager or GC its structs. Post-cut undo/redo journals a normal new original before application. Export remains a projection of verified live state. |
| Envelope selection/allocation: `accountEnvelopePreparation.selectEnvelopeSources`, `createEnvelopePreparation`; `spoolRecord.nextSpoolPosition` | Pure helpers support `origin.consumed` and position offset; owner callbacks still supply a full census | **Adapt callbacks.** Preserve exact capsule IDs/bytes, actor attribution, consumed bitmap, attempt burns and next absolute position. Baseline-carried original placement is provenance, not permission to overwrite/reallocate its old physical key. |
| Send decisions/current-key retries: `accountDelivery.createDeliveryOperations`; `deliveryRecord.expectedPosition`, `verifyDelivery`; `accountSyncState.advanceSelfReceive` | Pure delivery accepts an explicit prior state/origin; live tentative append checks can reconstruct a full census | **Adapt tentative and committed reads.** Seed accepted state and terminal proof, validate the new reserved-row transition against the retained origin, and keep refusal/retry ancestry in the suffix. Pass the origin offset to self projection; its cooperative wrapper currently defaults to zero. No synthesis of a missing old submission/receipt. |
| Incremental indexes and reference audits: `incrementalAccountLedger.indexVerifiedLedger`, `extendAccountLedger`; `accountReceive.checkFull`; `verifiedRecords` | Some indexes honor origin, but initialization derives epoch from rows with default 1; fallback/audit rebuilds full history | **Adapt before reuse.** Seed epoch/witness/absolute positions from authenticated origin even when the suffix has no events. Baseline change invalidates all prior indexes, coverage positives, memo keys and leases. Audit the baseline plus all surviving suffix rows; “full audit” cannot require deleted rows. Compare against complete history in the non-deleting phase. |
| Physical warm reuse: `warmContent`; `contentStore.auditWarm` | Private anchored stores currently disable warm shapes; `warmContent` parses ordinary counters | **Keep disabled for initial reduced reader.** A later adapter must check authenticated pointer/era plus physical suffix/chunk shapes and bounded audits, separately from virtual source/snapshot inventory. A count or maximum key is not a replay origin. |
| Single/group receive and final apply: `accountReceive.prepare*`, `record*`, prepared promotion; `inboundLedger.contextAt`, `verifyInboundLedger` | Owner uses full view; pure reader supports terminal origin/retired evidence; retirement token already spans request through commit/application | **Adapt state inputs, retain fences.** New requests start from verified frontiers; old flights are invalidated/refetched. Never drop a durable but undisplayed suffix. Final application retains fresh authority permission, lifetime checks, journal-before-apply ordering and origin-scoped undo. |
| Checkpoint installation: `historyInstall.verifyHistoryInstall`; `inboundLedger.applyHistoryReceiveCuts`; `retentionCheckpoint` | Pure retained cuts and private live old-cut check exist; latest checkpoint record is retained inside baseline | **Use origin plus suffix cuts.** Exact duplicate remains a verified no-op; unknown ancestry yields `history-required`, no persistence or cursor reset. Compare each publisher independently; preserve body-refetch suppression. A reader-visible unavailable-history result is required before exposing reduced profiles to users. |
| Successor/membership adoption: `accountReceive.adoptSuccessor`, `installMembership`; `accountSuccessor.verifyInstalledSuccessor`; `accountMembership.verifyInstalledMembership` | Revalidates proposed authority against all old events/wires before writing the installed marker | **Adapt prospective-context validation**, not just startup. Use the baseline authority-state/cuts hash and suffix continuation through exact new cuts; preserve fresh marker/custody comparison before commit and post-write reopen. Old installed cuts must remain identical. |
| Removed-device startup/export/editing: `rotationObservation.verifyDetachedPrefix`; original/joined startup and live owners | Explicit full-spool guard; verifies signed terminal cutoff by replaying its ciphertext prefix | **Add retained-prefix adapter.** A cutoff at the retained terminal link must match exactly; a later cutoff must be reached through verified suffix envelopes. A contradictory earlier cutoff must refuse. Preserve last local authority and disable network writing; removal cannot make prior local writing inaccessible merely because its prefix was retired. No new retention on detached owners. |
| Rotation: `accountRotation.activateAccountRotation`; `rotationCapture.persistRotationJournal`; `contentRotation.rotateContent` | Separate carrier and journal, full membership proof/census; re-encrypts all physical rows; preserves anchored metadata/old openers | **Adapt logical validators and journal catalogue.** Rotate only actual surviving rows, retain baseline ciphertext/openers and era, preserve exact physical comparisons/allocation. Validate prospective membership from origin plus suffix, including content-switched/custody-not-yet-activated restart. Never re-encrypt a synthetic snapshot as an old physical row. |
| Initial single-device handoff: `accountCatchup.prepareUploadedCatchup` | Separate v9 owner, zero-origin witness/census and prospective successor check | **Adapt.** Snapshot includes durable local writing and exact accepted-prefix evidence from origin plus suffix. Early epoch-one retention must not prevent the later first-device approval. Preserve checkpoint and installed successor custody transaction. |
| Subsequent enrollment/removal/history preparation: `membershipSource.withNativeHistorySource` and its `local` callback; `prepareNativeReplacement` | Independent custody owner; local read still reconstructs full spool/membership and journal | **Adapt local branch.** Verified local snapshot/catalogue uses reduced replay. Existing service-history branch stays independent. This covers original and joined/recovered devices as producers, not only recipients. |
| Service-backed history/recovery: `historyOwner.runNativeHistoryMaintenance` → `historySource.readHistorySource`; `recoverySource.readRecoverySource`; `membershipReading`, `recoveryReading`, `handoffHistory` | Authenticates service checkpoints, membership and accepted streams independently of the local row prefix | **Do not substitute the local baseline.** It can contain unaccepted writing and cannot self-admit an accepted-only service checkpoint. Keep service pruning, recovery access and local retirement separate. Local destination reopening is covered by the joined reader above. |
| Replacement/repeated retention: `localBaselineReplay.prepareLocalBaseline`; `contentStore.installBaseline`; `localBaselineShadow.verifyCompleteLocalBaseline` | Builder always runs full-from-genesis replay; eligibility compares accepted position with `positions.length` | **Add rebase builder.** Carry authenticated old snapshot/originals/proofs forward, verify suffix and summarize again at a settled current cut. Absolute end is origin position plus suffix positions, not array length. Prove two successive cuts and subsequent operations without consulting hidden predecessors. |
| Compaction: `contentStore.compact`; `contentCompaction.compactContent` | Anchored owners intentionally retain rows; generic compactor expects ordinary metadata | **Keep generic compaction fenced initially.** Retention replacement can fold content into the new baseline. Enabling ordinary content compaction on reduced stores is a separate exact-coverage adapter, never a metadata downgrade. |
| Durable attempts: `retentionAttempts`; `accountProgressCustody`; `src/account/membershipConnection.completedRetainedConnection` | Authenticated history/approval/rotation progress postpones an ineligible cut; completed proofs and openers remain | **Preserve.** Recheck under the same lifetime before mutation. Completing an attempt is not authority to delete custody evidence. Recovery/joining installation is ineligible until the active owner exists. |
| One-time/older Account owners: `accountJournal`; `accountUploadActivation`; `accountSpool`; v6–v8 capture/delivery; joined `phase: installing` | Old dialect conversion or initial expected-row replay; not compatible with reduced history | **Preserve refusal.** No retrofit of unsupported v8 as a product path. Ensure a v9 reduced profile cannot fall through into these owners, including after interrupted index/custody transitions. |
| Generic Local creation, import, salvage and clear: `ownedStartup`; `localGenesisStorage`; `promotionPreparation`, `promotionGenesis`; `legacyImport`, `legacySelection`, `legacyCleanup`; `localRecovery`, `localClearStorage` | Local claims/ordinary counters or fresh source/import records; no reduced Account authority | **Preserve scope/version refusal.** Account-aware claim census is the narrow exception above. Do not interpret baseline metadata as salvage writing or clear an Account through generic Local clear. No Account salvage/clear product journey is added by retention. |

## Concrete pitfalls to cover in the adapters

These are source-derived gaps, not observed defects in the currently non-deleting application:

1. `openSnapshot` invokes the full validator before verifying the anchor. Passing fewer physical rows
   to it today fails, regardless of the pure reader's success.
2. `indexVerifiedLedger` initializes `epoch = 1`. A reduced empty-event suffix needs the authenticated
   origin epoch; a retained source capsule does not itself advance that event epoch.
3. `advanceSelfReceiveCooperatively` does not accept the retained `after` parameter used by the pure
   replay. An audit must not ask it to reconstruct retired self positions from zero.
4. `prepareLocalBaseline` runs `full(...)`, counts consumption only in `spool.positions`, selects
   history from `census.installations.at(-1)`, and equates accepted position with array length.
   A rebase needs inherited consumption, inherited latest history/cuts, absolute position and inherited
   witness/authority even with an empty suffix. Its logical cut sequence must also carry the prior
   cut forward; an empty physical suffix does not reset that sequence to zero. The carrier's present
   `last physical sequence === cut.sequence` check needs a corresponding representation-aware rule.
   A second cut cannot use this builder unchanged.
5. Lifecycle owners instantiate their own carriers. Fixing `accountReceive` alone misses startup,
   initial catch-up, membership local-source reads and rotation (including its journal reader).

## Bounded implementation order and exits

1. **Owned reduced replay, no deletion.** Introduce the physical/logical seam and consume it in
   original/joined cold open, live reference reads, source recovery, send/receive and audits. Compute
   from a privately filtered suffix while retaining all physical predecessors for comparison. Until
   adapted, incremental/warm paths must fall back to baseline-aware reference, never zero-origin
   parsing. Compare document/deletion state, capsule identities/bytes and consumed indexes, next
   position, invocation totals, witness, delivery/receive state, latest history and next operations.
2. **Lifecycle and repeated cuts, no deletion.** Adapt prospective authority, detached prefix,
   handoff, rotation and membership source; implement rebase. Keep the other full-spool entry points
   fenced. Exercise initial handoff, later admission/removal, two rotations and a second baseline with
   a partial capsule and journal-only work, including rotation with no physical logical rows left.
   Keep live undo identity and journal ordering assertions.
3. **Exact-plan dry run, no deletion.** Implement the pure planner described in the companion note.
   Compare replay and subsequent operations on a detached projected inventory with the intact
   reference. Do not call `delete()` for logical rows or write the proposed reduced carrier yet.
4. **Separately authorized private atomic removal.** Only after the preceding exits, add the new
   closed representation and transaction, then focused native crash/retry checks. Public reader-first
   rollout, compatible rollback, capacity and unavailable-history UX remain explicit later gates.

The next implementation phase is **step 1**, not deletion. This inventory closes the source audit;
it does not close any of those implementation exits. No general release inventory/campaign is resumed.
`docs/progress.md` is reserved for the other workstream and remains untouched; this phase's checkpoint
is in [completed.md](./completed.md).

## Audit method and limits

Traced `createContentOwner`, `prepareAccountCustody`, `withRecoveryUnderPermit`, `carrier.load`,
`loadRecords`, `inspectSpool`/`inspectDelivery`/`inspectInbound`, `verifySpoolWitness`, `requireFullSpool`,
`parseCounter`/`parseBaselineCounter` and direct content-store census/mutation callers under `src/`.
Read the pure baseline replay/authority/storage implementations and their live/lifecycle call sites;
separated independent service replay from local-carrier consumers. Existing native evidence remains
in the [fences packet](./development-evidence/2026-10-13-local-retention-fences/README.md).
This phase adds no runtime code or new execution evidence. Source and documentation checks establish
an inventory at this commit, not proof that a future reduced reader passes its required controls.
