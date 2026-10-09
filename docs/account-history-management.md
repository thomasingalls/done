# Account history management

2026-10-09. Bounded product implementation, with unsigned intermediate commits authorized.
Release validation remains paused. The retained :8443 service stays on `34035330` during development.

## Contract and sequence

The current application retains every accepted envelope and reconstructs recovery from genesis,
all handoff snapshots and every publisher stream. Repeated membership changes work, but they do
not provide general history retention. Existing acceptance ledgers also authenticate refusal/retry
history: deleting their rows as though they were merely ciphertext would break those guarantees.

Implement in this order:

1. Repeatable checkpoint proposal and semantic admission, independent of enrollment. Bind the full
   publisher cut vector (including finalized publishers), current membership, generation and exact
   previous checkpoint. Recompute both Yjs insertion and deletion coverage after decrypting. A sole
   eligible device may self-admit; with another eligible device, a different device must admit.
2. Durable service exchange and client preparation/retry. Serialize advancement against the admitted
   parent, preserve exact retries after lost replies, and recheck current authority at commit. A
   pending proposal must not block editing or membership changes.
3. Reader installation and recovery from the new baseline plus its suffix. Commit content and the
   accepted-head baseline together; preserve local unaccepted originals and refuse unresolved
   dependencies. Exercise an offline returning device and lost-device recovery.
4. Retention and pruning only after those readers work. Keep at least two admitted checkpoints and
   every suffix needed by either. Separate retained decision evidence from removable ciphertext;
   neither a producer signature nor a largest sequence number is permission to delete history.

These follow [row 7](./selections/row-7-checkpoint.md). Generation-key retirement, destructive Yjs
compaction/attribution retirement, public deployment and release qualification remain separate.
No historical key is dropped in this phase. The existing snapshot/output bounds remain explicit
until the reader path has been changed and exercised; publishing a larger carrier alone does not
remove the application's activation limit.

## Current increment

The explicit Account-menu snapshot action, recovery reader, recovered-owner baseline adapter and
current-key replacement handoff adapter are implemented. New replacement snapshots bind the admitted
history and exact handoff sources they include. Recovered/replacement owners can use their certified
installed baselines without historical keys when that coverage evidence is present. Ordinary reader
installation, the remaining generation-one handoff path and pruning remain next. Automatic cadence
remains off. No new snapshot authorizes pruning or replaces a local content root. The development
action remains undeployed to the retained service.

## Checkpoint primitive checkpoint

`history-checkpoint` v1 is a separate, closed carrier; existing genesis, enrollment and recovery
encodings remain unchanged. Its signed metadata binds the membership head, lineage, generation,
producer, monotonically numbered checkpoint parent, complete publisher cuts, ciphertext digest,
and separate insertion/deletion coverage. Fresh salt/nonce derive a per-snapshot encryption key.
`history-checkpoint-admission` v1 binds the complete proposal hash and rederived coverage under the
certified admitting credential. Eligibility comes from verified membership, including early
single-device accounts. Finalized publisher cuts cannot advance or disappear.

The content helpers capture their inputs before asynchronous work, refuse pending dependencies,
reopen their own ciphertext, and require the admitter's independent accepted replay to be contained
in the snapshot. They do not authenticate how the owner obtained that replay/cut pair; the upcoming
native owner must derive it from verified durable state and accepted streams. They grant no install
or trim permission. Six focused tests pass, including genuinely signed false coverage, both
self-admission flag directions, deletions, missing accepted content and finalized publishers.
TypeScript, scoped lint/format and diff checks pass.

## Durable service exchange checkpoint

Schema 25 adds a signed catalog and immutable checkpoint/admission records. Schema 24 requires an
explicit offline upgrade; the retained development service remains schema 24 until a backed-up switch.
The catalog distinguishes latest, previous and one pending proposal. Admission advances it atomically
against the exact parent. Publication does not block ordinary writes; proposed cuts are verified
prefixes of complete authenticated ledgers, so later accepted edits remain suffixes. Missing catalog,
checkpoint or ledger evidence refuses rather than reconstructing a plausible replacement.

`/account/history/v1/checkpoint` requires a remembered session's workspace grant and the current
certified device signature. Requests are nonce-bound and short-lived; responses and catalog pointers
are signed by the pinned service. Retrying an already retained proposal/admission returns its exact
bytes without advancing the catalog again or emitting another notification. Stale pending proposals
cannot be admitted after membership changes; a current device can discard such a proposal and rebuild.
Historical admitted checkpoints are verified against their actual historical membership.

Ten focused service checks pass, including precommit rollback, lost committed replies and restart for
both publication and admission, false prefixes, damaged catalog/records, competing proposals, authority
changes, transaction-time grant refusal and HTTP session enforcement. Thirteen affected schema tests
pass across retained predecessor versions, plus a service rotation case that changes admission
eligibility while keeping the removed publisher's accepted ciphertext. The first schema-24 fixture
closed its database twice; it now upgrades a separate backup. One legacy expected-version assertion
also needed updating to 25. TypeScript and scoped lint/format/diff checks pass.

The operator chose an explicit Account-menu action for the initial usable flow. Automatic cadence
remains off until maintenance cost is observed. Native preparation/progress, the menu flow, baseline
installation and pruning still follow; this service archive alone does not reduce retained history.

## Client attempt checkpoint

The serial client coordinator saves and cold-reads exact proposal/admission bytes before sending;
network requests receive fresh nonces/lifetimes on retry. It pins the authenticated catalog sequence
and refuses rollback or same-sequence fork. Inspection never prepares another snapshot. A lost reply
can be reconciled even if a different eligible admitter won. Membership changes preserve the stale
attempt for explicit cancellation; they do not silently rebuild it.

Cancellation exposed a service gap: forgetting an unpublished proposal locally allowed a delayed
request to recreate it. Schema 25 now retains a signed cancellation tombstone scoped to the requesting
credential and proposal hash. The client saves cancellation intent before sending and resumes that
operation after a lost reply. A different proposal can reuse the cancelled, unadmitted sequence.
Existing admitted records are not removed. This remains an undeployed schema-25 increment.

Seven focused client checks pass against the real service and crypto helpers, including lost replies,
failed storage, wrong-owner progress, untrusted replies, signed catalog rollback, async owner change,
stale cancellation and delayed publication. The ten service and thirteen predecessor-upgrade checks
pass again. The coordinator's test persistence is deliberately an owner seam; native custody, source
replay and the Account-menu integration remain next, followed by installation/readers and retention.

## Native progress custody checkpoint

A separate encrypted `history` field now holds checkpoint progress in the authenticated custody
record. It shares the durable seal reservation counter but has a distinct encryption domain; it
cannot install/release generation keys or change enrollment/rotation progress. Original and joined
accounts use the same slot-owned compare-and-replace adapter. Existing custody MAC/marker updates
remain atomic. Older parsers fail closed on the new field. Scoped Local clear already deletes this
record, so history progress does not add an unclassified database to clear.

The focused packaged two-browser test passes for both owner kinds: save/reopen, interrupted save
after reservation, no nonce reuse, wrong-owner/stale compare-and-replace refusal, preservation of
prior enrollment, and subsequent two-way editing. The first probe compared its pre-parser object
against normalized JSON with different key order; it now compares the saved normalized value. One
later rerun timed out during the existing device-pairing setup, before the history assertions; the
unchanged rerun passed in 21.8 seconds. The custody metadata tests also cover field removal, ciphertext
mutation and malformed reservation/framing. TypeScript, build and scoped static checks pass.

The next source adapter must authenticate every retained enrollment/recovery snapshot as well as
accepted streams. It must also fence a handoff snapshot published between preparation and admission.
No menu action, baseline installation or pruning is enabled by the custody adapter itself.

## Handoff source inventory checkpoint

Checkpoint signatures and AEAD now bind the exact ordered inventory of retained handoff snapshots.
A subsequent checkpoint must preserve every previously covered source reference. The session-scoped
exchange can return one requested source, bound to the signed request/catalog and its inventory hash.
Both initial publication and admission compare the proposal's inventory to a fresh service census;
a late handoff publication forces explicit cancellation/rebuild instead of silently omitting writing.
Exact retries of already admitted records remain readable after later source changes.

This extends the still-undeployed history carrier; existing genesis/enrollment/recovery carriers are
unchanged. A real service test publishes an original handoff between history proposal and admission,
observes refusal, then rebuilds successfully and continues through rotation. Additional primitive
checks bind inventory to ciphertext and forbid dropping a covered handoff. The bounded browser
transport checks the pinned service, signed actor/request scope, stream bounds, truncation, forgery
and cancellation; scoped access now recognizes the history route.

Seven primitive, seven retained-client, two browser-transport, ten service and one real handoff-race/
rotation checks pass. Native cold replay of these sources and Account-menu wiring are still next;
source inventory alone is not evidence of plaintext coverage, installation or safe pruning.

## Cold replay primitive checkpoint

The cold history source now verifies its actual membership timeline, admitted baseline (or genesis),
every newly covered handoff ciphertext and every accepted stream prefix through the requested cuts.
It returns plaintext only after complete Yjs integration and actor validation. Removed publishers and
deletions remain part of the replay. A subsequent admitted history checkpoint permits replaying only
its suffix and newly covered handoffs; it does not permit ignoring unaccepted local originals.
Owners will add those originals only after this independent accepted-source pass succeeds.

The reader retains explicit event/byte bounds and erases temporary key/plain buffers on failure.
Four focused source checks pass, including handoff-only writing, finalized publisher updates,
baseline reuse, an epoch-one single-device suffix, unavailable/false/incomplete sources, missing
openers, substitution and cancellation. The fixture now injects the same bundled Yjs implementation
instead of loading two copies. Sixty-seven affected inbound checks and the existing replacement-source
checks pass. TypeScript and scoped static checks pass.

This is a cold content primitive, not the native Account-menu owner. With no admitted history
baseline, it currently requires the genesis opener; recovered/replacement devices that lack it need
their verified installed-baseline adapter. Likewise, a history checkpoint from a generation this
device never held needs the later membership/checkpoint handoff integration. These cases refuse and
retain all source material. Native owner composition must settle those routes before exposing the
maintenance action. Installation, recovery reader cutover and actual pruning remain unimplemented;
none of the new checkpoints yet authorizes deleting accepted ciphertext or generation keys.

## Native owner and explicit menu checkpoint

The Account menu now exposes explicit history inspection, creation, peer verification, exact resume
and cancellation in the development build. The owner holds the actual slot permit, obtains installed
keys and the verified membership timeline, independently retrieves the prior snapshot's admission,
replays accepted writing and retained handoffs, and adds authenticated journal-inclusive local writing.
The admitting device performs its own accepted-source replay. No editor document or UI-supplied key,
publisher cut, membership credential or installation claim enters that preparation.

Progress writes refresh the active editor's custody fence only for the authenticated history field
and its shared nonce reservations. Any unrelated authority/custody change closes the owner. The
original replacement/wrapping paths keep their certified-baseline prerequisites; early sole-device
accounts gain a verified history route without changing their stored spool authority.

Disposable packaged-app checks cover repeated sole-device snapshots, an actually committed publication
with its reply lost, lock/reopen/exact resume, independent two-device admission in both directions,
and later editing/delivery. The second two-device verification exceeded Playwright's default five-second
assertion window twice; a diagnostic rerun allowed fifteen seconds (individual HTTP requests already
have ten-second deadlines) and completed. The final observation was 7,167 ms and recorded HTTP 429 backoff/retry; no timeout
or service rate limit was loosened in the application. This is functional evidence, not a latency-gate pass or a
claim about an automatic maintenance cadence. The final check retains request-path/status/timing-only
evidence. Existing membership custody and replacement-source regressions are checked alongside it.

The screen explicitly says space reclamation is not enabled. Devices without the required historical
openers still refuse source preparation; current-generation replacement/recovery baselines need the
next adapter. Recovery must consume admitted history snapshots, including originals not separately
uploaded as updates, before deployment. Atomic reader installation and witnessed-evidence retention/
pruning follow that reader work. The personal installation remains build `34035330` / schema 24.

## Recovery reader checkpoint

Lost-device recovery now requests the latest admitted history checkpoint through its existing fresh
passkey/recovery-code bootstrap. The bounded response contains the exact proposal and admission;
service and client verify historical membership, identity and admission. The client cold-opens that
snapshot, skips its authenticated accepted prefixes and covered handoffs, then merges the suffix and
new handoffs. Pending proposals are not recovery baselines. Snapshot-only originals and deletions
therefore survive loss of all devices without needing separate update uploads.

The recovery preparation fence now includes the retained history catalog and admitted records. A
changed snapshot requires fresh preparation. Recovery intents additionally sign the exact history
checkpoint used, and commit checks it against the frozen archive. This closes an old-client gap:
a correctly signed recovery that omits existing admitted history must refuse rather than silently
revert to a genesis-only replay. Existing intents without a history field remain readable, and a
new commit without it remains possible when no admitted history exists. The resulting recovery
successor carries that reference for subsequent baseline work.

Twenty-seven focused history/recovery/read/commit/source checks pass. A final ten-case run repeats
the four new history cases alongside six recovery-transition checks. The packaged never-paired
recovery walkthrough now blocks ordinary update uploads, records a snapshot-only edit, verifies the
accepted-row count did not increase, recovers that writing, and admits a subsequent device that also
receives it. It passed after repairing a refactor regression: the original-device minimum epoch guard
must not reject a recovered sole device at epoch two. Build, TypeScript and scoped lint/diff checks pass.

Still open: maintenance using only a replacement/recovered device's current-generation baseline;
atomic adoption of admitted history into normal local receive/startup; later membership handoffs;
retention/pruning of ciphertext while preserving witnessed decision evidence and two checkpoint
suffixes. Recovery and activation output limits remain unchanged; this reader increment does not
claim to remove the existing 4 MiB recovery/activation output limit. No generation keys or history
have been deleted. The retained service is still unchanged and release qualification remains paused.

## Current-key recovered-owner checkpoint

Recovery intents now sign the exact handoff source inventory reconstructed during recovery. The service
compares it with the actual retained inventory under the existing preparation/commit fence; omitting or
substituting a source refuses before membership changes. Legacy intents remain verifiable, but a baseline
without explicit coverage cannot authorize the new replay shortcut. Reference parsing is separate from
payload parsing to avoid a membership/checkpoint module-initialization cycle found by the focused checks.

Native history preparation can cold-open an installed recovery baseline using only its available key,
prove that it covers the exact previous admitted history checkpoint, retain every signed source and
accepted cut, and replay only the later suffix. It also covers the recovery snapshot itself, which is a
retained source. This is a cold preparation adapter, not local baseline replacement or deletion permission.

Twenty-six focused history-source/recovery/transition checks pass. The added case covers with/without
prior history, snapshot-only originals, new-generation accepted edits/deletions, refusal of missing or
substituted coverage, and a further recovery. The packaged never-paired recovery walkthrough now creates
snapshot 2 from the recovered device before admitting another device; it passes in 24.1 s. The first new
source fixture used a synthetic clock for the real inbound service, which intentionally uses wall time;
correcting that fixture made the existing request freshness check pass. Typecheck, scoped lint/format,
affected inbound checks and build pass. Evidence is retained in the development log.

Next: carry admitted history into subsequent membership handoffs and support current-key replacement
baselines, then ordinary reader installation and safe retained-history pruning. The live `34035330`
installation, schema 24, all existing ciphertext and generation keys remain unchanged. No release
qualification or generalized fault campaign was resumed.

## History-aware replacement handoff checkpoint

The native replacement producer now reconstructs the admitted history baseline, exact accepted suffix
and retained handoffs before adding its own authenticated local originals. A new optional, signed and
AEAD-bound field records the prior history hash and exact source inventory in the replacement carrier.
The service compares that coverage with the admitted archive and actual source rows before first
publication, fences both at commit, and refuses an older client that omits an admitted history baseline.
An immutable, already-published snapshot still resolves byte-for-byte after lost replies and later
history advancement. A known history-change refusal before publication durably clears only the unsent
snapshot so retry can rebuild it; uncertain replies retain the exact proposal, and a delivery already
saved can never be rebound to different content. The approval/code ceremony is preserved.

An installed replacement can use that baseline for later history preparation using its current key
only. The adapter checks the actual membership certification's snapshot hash and recipient admission,
previous history hash/cuts and full covered source inventory; it does not accept a detached signature
as evidence of installation. Legacy carriers remain readable but cannot assert this new shortcut
without explicit coverage. Legacy slots lacking it may require refresh from a suitable survivor; no
such migration is silently performed by maintenance.

Fourteen focused parser/crypto/source cases, two publication-service cases and eight retained-handoff
coordinator cases pass. The publication case covers omission, stale preparation, source omission and
lost committed replies/restart. The native recovery custody case passes with the new history exchange.
Both packaged recovery/lifecycle cases pass. The final expanded case creates history from an actual
replacement slot with no generation-one key, obtains independent peer admission, then rotates/removes
that device and recovers writing held only in its history snapshot (1.3 min). The peer was checked not
to have received that blocked-upload edit in its ordinary editor. Static checks and final build pass.
The new service fixture initially used wall-time expiry against its synthetic service clock; that
fixture was corrected without changing protocol request freshness rules.

This closes current-key replacement preparation, not normal reader baseline installation. Ordinary
startup/receive and generation-one later-enrollment reading still need installation of admitted history
plus suffix. A history baseline whose accepted cuts exceed an already fixed enrollment admission cut
still refuses: it cannot be relabelled as covering an earlier cut. Safe pruning, bounded reader/output
size work and live upgrade remain open. No ciphertext/key is deleted and the retained service is unchanged.
